/**
 * /api/settlement/evm — EVM HTLC settlement endpoints
 *
 * POST /api/settlement/evm/session        — create a new EVM HTLC session (internal/orders)
 * GET  /api/settlement/evm/session/:id    — poll session status
 * GET  /api/settlement/evm/trade/:tradeId — look up session by trade ID
 * POST /api/settlement/evm/confirm-lock   — frontend reports a lock tx
 * GET  /api/settlement/evm/chains         — list supported chains + contract addresses
 */

import { Router } from "express";
import {
  initiateEvmHtlcSession,
  getEvmHtlcSession,
  getEvmHtlcSessionByTrade,
  confirmLockTx,
  EVM_CHAINS,
  type EvmHtlcSessionParams,
} from "../lib/evmHtlc.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── GET /api/settlement/evm/chains ────────────────────────────────────────────

router.get("/chains", (_req, res) => {
  const chains = Object.values(EVM_CHAINS).map(c => ({
    chainId:         c.chainId,
    name:            c.name,
    contractAddress: c.contractAddress,
    deployed:        !!c.contractAddress,
    nativeSymbol:    c.nativeSymbol,
    blockExplorer:   c.blockExplorer,
    usdtAddress:     c.usdtAddress,
    usdcAddress:     c.usdcAddress,
  }));
  res.json({ chains });
});

// ── POST /api/settlement/evm/session ──────────────────────────────────────────

router.post("/session", async (req, res) => {
  try {
    const body = req.body as Partial<EvmHtlcSessionParams>;

    const required = [
      "tradeId", "pair", "chainId",
      "sellerAddress", "buyerAddress",
      "sellerAsset", "sellerAmount",
      "buyerAsset",  "buyerAmount",
    ] as const;

    for (const field of required) {
      if (!body[field]) {
        res.status(400).json({ error: `Missing required field: ${field}` });
        return;
      }
    }

    const session = await initiateEvmHtlcSession({
      tradeId:       body.tradeId!,
      pair:          body.pair!,
      chainId:       Number(body.chainId),
      sellerAddress: body.sellerAddress!,
      buyerAddress:  body.buyerAddress!,
      sellerAsset:   body.sellerAsset!,
      sellerAmount:  body.sellerAmount!,
      sellerToken:   body.sellerToken ?? null,
      buyerAsset:    body.buyerAsset!,
      buyerAmount:   body.buyerAmount!,
      buyerToken:    body.buyerToken ?? null,
    });

    res.status(201).json({ session });
  } catch (err: any) {
    logger.error({ err: err?.message }, "evmSettlement: failed to create session");
    res.status(500).json({ error: err?.message ?? "Failed to create EVM HTLC session" });
  }
});

// ── GET /api/settlement/evm/session/:id ──────────────────────────────────────

router.get("/session/:id", async (req, res) => {
  try {
    const session = await getEvmHtlcSession(req.params.id ?? "");
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ session });
  } catch (err: any) {
    logger.error({ err: err?.message }, "evmSettlement: session lookup failed");
    res.status(500).json({ error: err?.message ?? "Failed to fetch session" });
  }
});

// ── GET /api/settlement/evm/trade/:tradeId ────────────────────────────────────

router.get("/trade/:tradeId", async (req, res) => {
  try {
    const session = await getEvmHtlcSessionByTrade(req.params.tradeId ?? "");
    if (!session) {
      res.status(404).json({ error: "No EVM HTLC session found for this trade" });
      return;
    }
    res.json({ session });
  } catch (err: any) {
    logger.error({ err: err?.message }, "evmSettlement: trade session lookup failed");
    res.status(500).json({ error: err?.message ?? "Failed to fetch session" });
  }
});

// ── POST /api/settlement/evm/confirm-lock ─────────────────────────────────────

router.post("/confirm-lock", async (req, res) => {
  try {
    const { sessionId, side, txHash } = req.body as {
      sessionId?: string;
      side?:      "seller" | "buyer";
      txHash?:    string;
    };

    if (!sessionId || !side || !txHash) {
      res.status(400).json({ error: "sessionId, side, and txHash are required" });
      return;
    }

    if (side !== "seller" && side !== "buyer") {
      res.status(400).json({ error: "side must be 'seller' or 'buyer'" });
      return;
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      res.status(400).json({ error: "txHash must be a valid 0x-prefixed 32-byte hex transaction hash" });
      return;
    }

    const result = await confirmLockTx(sessionId, side, txHash);
    if (!result.ok) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({ success: true, status: result.status });
  } catch (err: any) {
    logger.error({ err: err?.message }, "evmSettlement: lock confirmation failed");
    res.status(500).json({ error: err?.message ?? "Failed to confirm lock" });
  }
});

export default router;
