/**
 * BSV Intent Settlement Routes — OrahDEX
 *
 * REST API for the production BSV cross-chain intent settlement system.
 *
 * ── Lifecycle ──────────────────────────────────────────────────────────────
 *
 *   POST   /api/bsv-intent           — Create intent → returns P2SH address
 *   GET    /api/bsv-intent           — List user's intents (query: ?userAddress=)
 *   GET    /api/bsv-intent/:id       — Get intent status + details
 *   POST   /api/bsv-intent/:id/fill  — Solver reports destination-chain payment
 *   POST   /api/bsv-intent/:id/refund — Request manual refund (watcher handles auto)
 *   DELETE /api/bsv-intent/:id       — Cancel PENDING_FUNDING intent
 *
 * ── Security ───────────────────────────────────────────────────────────────
 *
 *   • Secrets are NEVER returned to the caller. Only intentHash, htlcAddress,
 *     redeemScript (for the user to verify the script before funding), and
 *     the public intent payload are exposed.
 *   • The solver fill endpoint requires the solver to provide a payment txid
 *     on the destination chain. The watcher cross-checks this before claiming.
 *   • Nonces are server-generated to guarantee freshness.
 */

import { Router } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { bsvIntentSessionsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  buildIntentSettlement,
  buildIntentOpReturn,
  computeIntentHash,
  INTENT_MIN_SAT,
  INTENT_DEFAULT_LOCKTIME_BLOCKS,
  type IntentPayload,
} from "../lib/bsvIntentSettlement.js";
import { getBsvChainStatus } from "../lib/bsvChainMonitor.js";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function sanitize(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

function safeIntent(row: typeof bsvIntentSessionsTable.$inferSelect) {
  return {
    id:                 row.id,
    intentHash:         row.intentHash,
    nonce:              row.nonce,
    userAddress:        row.userAddress,
    solverAddress:      row.solverAddress,
    tokenIn:            row.tokenIn,
    tokenOut:           row.tokenOut,
    amountInSat:        row.amountInSat,
    minAmountOut:       row.minAmountOut,
    destinationChain:   row.destinationChain,
    destinationAddress: row.destinationAddress,
    deadlineTs:         row.deadlineTs,
    deadlineBlocks:     row.deadlineBlocks,
    secretHash:         row.secretHash,
    redeemScript:       row.redeemScript,
    htlcAddress:        row.htlcAddress,
    fundingTxid:        row.fundingTxid,
    fundingVout:        row.fundingVout,
    fundingConfirmed:   row.fundingConfirmed,
    confirmations:      row.confirmations,
    solverPaymentTxid:  row.solverPaymentTxid,
    fillNote:           row.fillNote,
    claimTxid:          row.claimTxid,
    refundTxid:         row.refundTxid,
    auditTxid:          row.auditTxid,
    status:             row.status,
    createdAt:          row.createdAt,
    updatedAt:          row.updatedAt,
    expiresAt:          row.expiresAt,
  };
}

// ── POST /api/bsv-intent — create ─────────────────────────────────────────
router.post("/bsv-intent", async (req, res) => {
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

    if (!userAddress || !tokenOut || !amountInSat || !minAmountOut || !destinationChain || !destinationAddress) {
      return res.status(400).json({ error: "Missing required fields: userAddress, tokenOut, amountInSat, minAmountOut, destinationChain, destinationAddress" });
    }
    if (typeof amountInSat !== "number" || amountInSat < INTENT_MIN_SAT) {
      return res.status(400).json({ error: `amountInSat must be a number ≥ ${INTENT_MIN_SAT} satoshis` });
    }
    if (isNaN(parseFloat(minAmountOut)) || parseFloat(minAmountOut) <= 0) {
      return res.status(400).json({ error: "minAmountOut must be a positive number string" });
    }

    let bsvChainHeight = 0;
    try {
      const chainStatus = await getBsvChainStatus();
      bsvChainHeight = chainStatus.blockHeight;
    } catch {
      logger.warn("bsvIntent: could not fetch chain height — using fallback deadline");
    }

    const now              = Math.floor(Date.now() / 1000);
    const resolvedDeadline = typeof deadlineTs === "number" && deadlineTs > now + 300
      ? deadlineTs
      : now + 48 * 60 * 60;  // default 48h

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
    const opReturn   = buildIntentOpReturn(settlement, intent);

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

    logger.info({
      intentId,
      htlcAddress: settlement.htlcAddress,
      amountInSat,
      tokenOut,
      destinationChain,
    }, "bsvIntent: created");

    return res.status(201).json({
      intentId,
      intentHash:         settlement.intentHash,
      nonce,
      htlcAddress:        settlement.htlcAddress,
      redeemScript:       settlement.redeemScript,
      deadlineBlocks,
      deadlineTs:         resolvedDeadline,
      amountInSat,
      minAmountOut,
      tokenIn:            "BSV",
      tokenOut,
      destinationChain,
      destinationAddress,
      opReturnPreview:    opReturn,
      status:             "PENDING_FUNDING",
      instructions:       `Send exactly ${amountInSat} satoshis to ${settlement.htlcAddress} on BSV mainnet`,
    });
  } catch (err) {
    logger.error({ err }, "bsvIntent: create failed");
    return res.status(500).json({ error: sanitize(err) });
  }
});

// ── GET /api/bsv-intent — list ─────────────────────────────────────────────
router.get("/bsv-intent", async (req, res) => {
  try {
    const { userAddress, status, limit = "20" } = req.query as {
      userAddress?: string;
      status?:      string;
      limit?:       string;
    };

    if (!userAddress) {
      return res.status(400).json({ error: "Query param ?userAddress= is required" });
    }

    const take = Math.min(parseInt(limit, 10) || 20, 100);
    const rows = await db
      .select()
      .from(bsvIntentSessionsTable)
      .where(
        status
          ? and(
              eq(bsvIntentSessionsTable.userAddress, userAddress),
              eq(bsvIntentSessionsTable.status, status),
            )
          : eq(bsvIntentSessionsTable.userAddress, userAddress),
      )
      .orderBy(desc(bsvIntentSessionsTable.createdAt))
      .limit(take);

    return res.json(rows.map(safeIntent));
  } catch (err) {
    logger.error({ err }, "bsvIntent: list failed");
    return res.status(500).json({ error: sanitize(err) });
  }
});

// ── GET /api/bsv-intent/:id — get ─────────────────────────────────────────
router.get("/bsv-intent/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db
      .select()
      .from(bsvIntentSessionsTable)
      .where(eq(bsvIntentSessionsTable.id, id));

    if (rows.length === 0) return res.status(404).json({ error: "Intent not found" });
    return res.json(safeIntent(rows[0]!));
  } catch (err) {
    logger.error({ err }, "bsvIntent: get failed");
    return res.status(500).json({ error: sanitize(err) });
  }
});

// ── POST /api/bsv-intent/:id/fill — solver reports payment ────────────────
router.post("/bsv-intent/:id/fill", async (req, res) => {
  try {
    const { id } = req.params;
    const { solverPaymentTxid, solverAddress, fillNote } = req.body as {
      solverPaymentTxid: string;
      solverAddress:     string;
      fillNote?:         string;
    };

    if (!solverPaymentTxid || !solverAddress) {
      return res.status(400).json({ error: "solverPaymentTxid and solverAddress are required" });
    }

    const rows = await db
      .select()
      .from(bsvIntentSessionsTable)
      .where(eq(bsvIntentSessionsTable.id, id));

    if (rows.length === 0) return res.status(404).json({ error: "Intent not found" });
    const intent = rows[0]!;

    if (!["CONFIRMED", "FUNDED"].includes(intent.status)) {
      return res.status(409).json({
        error: `Cannot fill intent in status ${intent.status}. Must be FUNDED or CONFIRMED.`,
      });
    }

    if (intent.solverAddress && intent.solverAddress !== solverAddress) {
      return res.status(403).json({ error: "This intent is locked to a specific solver" });
    }

    if (Math.floor(Date.now() / 1000) > intent.deadlineTs) {
      return res.status(410).json({ error: "Intent has expired" });
    }

    await db
      .update(bsvIntentSessionsTable)
      .set({
        status:            "FILLED",
        solverAddress,
        solverPaymentTxid,
        fillNote:          fillNote ?? null,
        updatedAt:         new Date(),
      })
      .where(
        and(
          eq(bsvIntentSessionsTable.id, id),
          eq(bsvIntentSessionsTable.status, intent.status),
        ),
      );

    logger.info({ intentId: id, solverAddress, solverPaymentTxid }, "bsvIntent: filled by solver");
    return res.json({ status: "FILLED", message: "Intent filled. Relayer will claim BSV shortly." });
  } catch (err) {
    logger.error({ err }, "bsvIntent: fill failed");
    return res.status(500).json({ error: sanitize(err) });
  }
});

// ── POST /api/bsv-intent/:id/refund — manual refund request ───────────────
router.post("/bsv-intent/:id/refund", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db
      .select()
      .from(bsvIntentSessionsTable)
      .where(eq(bsvIntentSessionsTable.id, id));

    if (rows.length === 0) return res.status(404).json({ error: "Intent not found" });
    const intent = rows[0]!;

    const TERMINAL = new Set(["CLAIMED", "REFUNDED", "CANCELLED"]);
    if (TERMINAL.has(intent.status)) {
      return res.status(409).json({ error: `Intent already in terminal status: ${intent.status}` });
    }

    const now = Math.floor(Date.now() / 1000);
    if (now < intent.deadlineTs) {
      const remaining = intent.deadlineTs - now;
      return res.status(425).json({
        error: `Intent has not yet expired. Refund available in ${Math.ceil(remaining / 3600)} hour(s).`,
        deadlineTs:     intent.deadlineTs,
        remainingSecs:  remaining,
      });
    }

    if (!["EXPIRED", "FUNDED", "CONFIRMED", "PENDING_FUNDING"].includes(intent.status)) {
      return res.status(409).json({ error: `Cannot refund intent in status: ${intent.status}` });
    }

    await db
      .update(bsvIntentSessionsTable)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(
        and(
          eq(bsvIntentSessionsTable.id, id),
          eq(bsvIntentSessionsTable.status, intent.status),
        ),
      );

    logger.info({ intentId: id, userAddress: intent.userAddress }, "bsvIntent: manual refund requested");

    return res.json({
      status:        "EXPIRED",
      message:       "Intent marked as expired. The watcher will broadcast the CLTV refund transaction.",
      deadlineBlocks: intent.deadlineBlocks,
      redeemScript:   intent.redeemScript,
      htlcAddress:    intent.htlcAddress,
    });
  } catch (err) {
    logger.error({ err }, "bsvIntent: refund request failed");
    return res.status(500).json({ error: sanitize(err) });
  }
});

// ── DELETE /api/bsv-intent/:id — cancel before funding ────────────────────
router.delete("/bsv-intent/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userAddress } = req.body as { userAddress: string };

    if (!userAddress) return res.status(400).json({ error: "userAddress required in request body" });

    const rows = await db
      .select()
      .from(bsvIntentSessionsTable)
      .where(eq(bsvIntentSessionsTable.id, id));

    if (rows.length === 0) return res.status(404).json({ error: "Intent not found" });
    const intent = rows[0]!;

    if (intent.userAddress !== userAddress) {
      return res.status(403).json({ error: "Not authorized to cancel this intent" });
    }
    if (intent.status !== "PENDING_FUNDING") {
      return res.status(409).json({ error: `Can only cancel PENDING_FUNDING intents; current status: ${intent.status}` });
    }

    await db
      .update(bsvIntentSessionsTable)
      .set({
        status:     "CANCELLED",
        terminalAt: new Date(),
        updatedAt:  new Date(),
      })
      .where(
        and(
          eq(bsvIntentSessionsTable.id, id),
          eq(bsvIntentSessionsTable.status, "PENDING_FUNDING"),
        ),
      );

    logger.info({ intentId: id, userAddress }, "bsvIntent: cancelled");
    return res.json({ status: "CANCELLED" });
  } catch (err) {
    logger.error({ err }, "bsvIntent: cancel failed");
    return res.status(500).json({ error: sanitize(err) });
  }
});

export default router;
