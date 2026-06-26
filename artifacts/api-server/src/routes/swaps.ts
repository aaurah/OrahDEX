/**
 * Unified Swap API — OrahDEX cross-chain swaps
 *
 *   POST  /swaps/bsv-evm     — Create a BSV→EVM atomic swap intent
 *   GET   /swaps/:swapId     — Get swap status (BSV→EVM or EVM→BSV)
 *
 * These routes provide a unified contract on top of the direction-specific
 * /bsv-intent and /evm-to-bsv-intent families.
 */

import { Router } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import {
  bsvIntentSessionsTable,
  evmToBsvSwapsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  buildIntentSettlement,
  buildIntentOpReturn,
  INTENT_MIN_SAT,
  INTENT_DEFAULT_LOCKTIME_BLOCKS,
  type IntentPayload,
} from "../lib/bsvIntentSettlement.js";
import { getBsvChainStatus } from "../lib/bsvChainMonitor.js";

const router = Router();

function sanitize(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

/** Escrow contract addresses per EVM chainId — keep in sync with escrowConfig.ts */
const ESCROW_ADDRESSES: Record<number, string> = {
  1:        "0xeE234cEb85697b64800E696699b7841e00413B4f",  // Ethereum
  10:       "0xeE234cEb85697b64800E696699b7841e00413B4f",  // Optimism
  56:       "0xeE234cEb85697b64800E696699b7841e00413B4f",  // BSC
  130:      "0xeE234cEb85697b64800E696699b7841e00413B4f",  // Unichain
  137:      "0xeE234cEb85697b64800E696699b7841e00413B4f",  // Polygon
  324:      "0xeE234cEb85697b64800E696699b7841e00413B4f",  // zkSync Era
  1329:     "0xeE234cEb85697b64800E696699b7841e00413B4f",  // Sei
  8453:     "0xeE234cEb85697b64800E696699b7841e00413B4f",  // Base
  42161:    "0xeE234cEb85697b64800E696699b7841e00413B4f",  // Arbitrum
  43114:    "0xeE234cEb85697b64800E696699b7841e00413B4f",  // Avalanche
  59144:    "0xeE234cEb85697b64800E696699b7841e00413B4f",  // Linea
  534352:   "0xeE234cEb85697b64800E696699b7841e00413B4f",  // Scroll
  11155111: "0x4deb6023abD9E1C640aDa35201be8ff591d21cF2",  // Sepolia (testnet)
};

// ── POST /swaps/bsv-evm — create BSV → EVM intent ────────────────────────────

router.post("/swaps/bsv-evm", async (req, res) => {
  try {
    const {
      userAddress,
      solverAddress = null,
      tokenOut,
      amountInSat,
      minAmountOut,
      destinationChain,
      destinationAddress,
      deadlineTs,
    } = req.body as {
      userAddress:        string;
      solverAddress?:     string | null;
      tokenOut:           string;
      amountInSat:        number;
      minAmountOut:       string;
      destinationChain:   string;
      destinationAddress: string;
      deadlineTs?:        number;
    };

    if (
      !userAddress || !tokenOut || !amountInSat ||
      !minAmountOut || !destinationChain || !destinationAddress
    ) {
      res.status(400).json({
        error: "Missing required fields: userAddress, tokenOut, amountInSat, minAmountOut, destinationChain, destinationAddress",
      });
      return;
    }
    if (typeof amountInSat !== "number" || amountInSat < INTENT_MIN_SAT) {
      res.status(400).json({
        error: `amountInSat must be a number ≥ ${INTENT_MIN_SAT} satoshis`,
      });
      return;
    }
    if (isNaN(parseFloat(minAmountOut)) || parseFloat(minAmountOut) <= 0) {
      res.status(400).json({ error: "minAmountOut must be a positive number string" });
      return;
    }

    let bsvChainHeight = 0;
    try {
      const chainStatus = await getBsvChainStatus();
      bsvChainHeight = chainStatus.blockHeight;
    } catch {
      logger.warn("swaps/bsv-evm: could not fetch chain height — using fallback deadline");
    }

    const now              = Math.floor(Date.now() / 1000);
    const resolvedDeadline = typeof deadlineTs === "number" && deadlineTs > now + 300
      ? deadlineTs
      : now + 48 * 60 * 60;

    const deadlineBlocks = bsvChainHeight > 0
      ? bsvChainHeight + INTENT_DEFAULT_LOCKTIME_BLOCKS
      : INTENT_DEFAULT_LOCKTIME_BLOCKS;

    const intentId = randomUUID();
    const nonce    = randomBytes(32).toString("hex");

    const intent: IntentPayload = {
      intentId,
      nonce,
      userAddress,
      solverAddress: solverAddress ?? null,
      tokenIn:       "BSV",
      tokenOut,
      amountInSat,
      minAmountOut,
      destinationChain,
      destinationAddress,
      deadlineTs:     resolvedDeadline,
      deadlineBlocks,
    };

    const settlement = buildIntentSettlement({ intent, deadlineBlocks });
    buildIntentOpReturn(settlement, intent); // build but discard; validates no-throw

    await db.insert(bsvIntentSessionsTable).values({
      id:                 intentId,
      intentHash:         settlement.intentHash,
      nonce,
      userAddress,
      solverAddress:      solverAddress ?? null,
      tokenIn:            "BSV",
      tokenOut,
      amountInSat,
      minAmountOut,
      destinationChain,
      destinationAddress,
      deadlineTs:         resolvedDeadline,
      deadlineBlocks,
      secret:             settlement.secret,
      secretHash:         settlement.secretHash,
      redeemScript:       settlement.redeemScript,
      htlcAddress:        settlement.htlcAddress,
      status:             "PENDING_FUNDING",
      expiresAt:          new Date(resolvedDeadline * 1000),
    });

    logger.info({ intentId, htlcAddress: settlement.htlcAddress }, "swaps/bsv-evm intent created");

    res.status(201).json({
      swapId:             intentId,
      intentId,
      htlcAddress:        settlement.htlcAddress,
      amountInSat,
      tokenOut,
      minAmountOut,
      destinationChain,
      destinationAddress,
      deadlineTs:         resolvedDeadline,
      deadlineBlocks,
      redeemScript:       settlement.redeemScript,
      status:             "PENDING_FUNDING",
      direction:          "bsv-to-evm",
    });
  } catch (err) {
    logger.error({ err }, "Failed to create swaps/bsv-evm intent");
    res.status(500).json({ error: sanitize(err) });
  }
});

// ── GET /swaps/:swapId — unified status (BSV→EVM or EVM→BSV) ─────────────────

router.get("/swaps/:swapId", async (req, res) => {
  const { swapId } = req.params;

  try {
    // Try BSV→EVM first
    const [bsvRow] = await db
      .select()
      .from(bsvIntentSessionsTable)
      .where(eq(bsvIntentSessionsTable.id, swapId));

    if (bsvRow) {
      res.json({
        // Core identity — `id` satisfies BsvIntentData.id; `swapId` is the unified alias
        id:                 bsvRow.id,
        swapId:             bsvRow.id,
        direction:          "bsv-to-evm",
        status:             bsvRow.status,
        tokenIn:            "BSV",
        tokenOut:           bsvRow.tokenOut,
        amountInSat:        bsvRow.amountInSat,
        minAmountOut:       bsvRow.minAmountOut,
        htlcAddress:        bsvRow.htlcAddress,
        // HTLC cryptographic material
        secretHash:         bsvRow.secretHash,
        redeemScript:       bsvRow.redeemScript,
        destinationChain:   bsvRow.destinationChain,
        destinationAddress: bsvRow.destinationAddress,
        deadlineTs:         bsvRow.deadlineTs,
        deadlineBlocks:     bsvRow.deadlineBlocks,
        confirmations:      bsvRow.confirmations,
        fundingTxid:        bsvRow.fundingTxid,
        fundingConfirmed:   bsvRow.fundingConfirmed,
        claimTxid:          bsvRow.claimTxid,
        refundTxid:         bsvRow.refundTxid,
        solverPaymentTxid:  bsvRow.solverPaymentTxid,
        createdAt:          bsvRow.createdAt,
        expiresAt:          bsvRow.expiresAt,
      });
      return;
    }

    // Try EVM→BSV
    const [evmRow] = await db
      .select()
      .from(evmToBsvSwapsTable)
      .where(eq(evmToBsvSwapsTable.id, swapId));

    if (evmRow) {
      res.json({
        swapId:                  evmRow.id,
        direction:               "evm-to-bsv",
        status:                  evmRow.status,
        userEvmAddress:          evmRow.userEvmAddress,
        tokenIn:                 evmRow.tokenIn,
        tokenAddress:            evmRow.tokenAddress,
        tokenOut:                "BSV",
        amountInRaw:             evmRow.amountInRaw,
        amountInHuman:           evmRow.amountInHuman,
        chainId:                 evmRow.chainId,
        // Escrow contract address for this chain (for reclaim / self-refund)
        escrowContractAddress:   evmRow.chainId ? (ESCROW_ADDRESSES[evmRow.chainId] ?? null) : null,
        bsvReceiveAddr:          evmRow.bsvReceiveAddr,
        estimatedBsvOut:         evmRow.estimatedBsvOut,
        evmLockTxHash:           evmRow.evmLockTxHash,
        solverBsvTxid:           evmRow.solverBsvTxid,
        expiresAt:               evmRow.expiresAt,
        createdAt:               evmRow.createdAt,
      });
      return;
    }

    res.status(404).json({ error: "Swap not found" });
  } catch (err) {
    logger.error({ err, swapId }, "Failed to fetch swap status");
    res.status(500).json({ error: sanitize(err) });
  }
});

export default router;
