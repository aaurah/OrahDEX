/**
 * EVM → BSV Swap Intent Routes
 *
 * Tracks cross-chain swaps where the user locks EVM tokens in the OrahDEX
 * escrow contract and a solver delivers BSV to their BSV receive address.
 *
 *   POST  /evm-to-bsv-intent            — Register a new swap intent
 *   PUT   /evm-to-bsv-intent/:id/lock   — Record the EVM lock tx hash (owner only)
 *   POST  /evm-to-bsv-intent/:id/fill   — Solver: record BSV delivery + mark COMPLETE
 *   GET   /evm-to-bsv-intent/:id        — Poll swap status
 *   GET   /evm-to-bsv-intent            — List user's swaps (?userAddress=)
 *
 * Security model:
 *   PUT /lock — requires the caller to provide the EVM address that was used to
 *   register the intent; the server verifies it matches before allowing the update.
 *   POST /fill — solver-only endpoint; in production this should be protected by
 *   a shared API key or HMAC signature (SOLVER_API_KEY env var checked here).
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { evmToBsvSwapsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

function sanitize(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

type EvmBsvStatus =
  | "PENDING_LOCK" | "LOCKED" | "AWAITING_BSV"
  | "BSV_SENT" | "COMPLETE" | "FAILED" | "REFUNDED";

const TERMINAL = new Set<EvmBsvStatus>(["COMPLETE", "FAILED", "REFUNDED"]);

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_RE     = /^0x[0-9a-fA-F]{64}$/;
const BSV_TXID_RE    = /^[0-9a-fA-F]{64}$/i;

// ── POST /evm-to-bsv-intent ───────────────────────────────────────────────────

router.post("/evm-to-bsv-intent", async (req, res) => {
  try {
    const {
      userEvmAddress,
      bsvReceiveAddr,
      tokenIn,
      tokenAddress,
      amountInRaw,
      amountInHuman,
      chainId,
      estimatedBsvOut,
    } = req.body as {
      userEvmAddress:  string;
      bsvReceiveAddr:  string;
      tokenIn:         string;
      tokenAddress:    string;
      amountInRaw:     string;
      amountInHuman:   string;
      chainId:         number;
      estimatedBsvOut?: string;
    };

    if (!userEvmAddress || !EVM_ADDRESS_RE.test(userEvmAddress)) {
      res.status(400).json({ error: "Invalid userEvmAddress (must be 0x EVM address)" });
      return;
    }
    if (!bsvReceiveAddr || bsvReceiveAddr.length < 20) {
      res.status(400).json({ error: "Invalid bsvReceiveAddr" });
      return;
    }
    if (!tokenIn || !tokenAddress) {
      res.status(400).json({ error: "tokenIn and tokenAddress required" });
      return;
    }
    if (!amountInRaw || !/^\d+$/.test(amountInRaw) || amountInRaw === "0") {
      res.status(400).json({ error: "amountInRaw must be a positive integer string (wei)" });
      return;
    }
    if (!chainId || typeof chainId !== "number") {
      res.status(400).json({ error: "chainId required" });
      return;
    }

    const id      = randomUUID();
    const now     = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    await db.insert(evmToBsvSwapsTable).values({
      id,
      userEvmAddress: userEvmAddress.toLowerCase(),
      bsvReceiveAddr,
      tokenIn,
      tokenAddress,
      amountInRaw,
      amountInHuman: amountInHuman ?? amountInRaw,
      chainId,
      estimatedBsvOut: estimatedBsvOut ?? null,
      status: "PENDING_LOCK",
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });

    logger.info({ swapId: id, userEvmAddress, tokenIn, chainId }, "EVM→BSV swap intent created");

    res.status(201).json({
      swapId:   id,
      status:   "PENDING_LOCK",
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Failed to create EVM→BSV swap intent");
    res.status(500).json({ error: sanitize(err) });
  }
});

// ── PUT /evm-to-bsv-intent/:id/lock — record on-chain lock (owner only) ───────

router.put("/evm-to-bsv-intent/:id/lock", async (req, res) => {
  const { id } = req.params;
  const { evmLockTxHash, userEvmAddress } = req.body as {
    evmLockTxHash:  string;
    userEvmAddress: string;
  };

  // Both fields mandatory for security
  if (!userEvmAddress || !EVM_ADDRESS_RE.test(userEvmAddress)) {
    res.status(400).json({ error: "userEvmAddress required (must be 0x EVM address)" });
    return;
  }
  if (!evmLockTxHash || !TX_HASH_RE.test(evmLockTxHash)) {
    res.status(400).json({ error: "evmLockTxHash must be a valid 0x-prefixed 32-byte tx hash" });
    return;
  }

  try {
    const [row] = await db
      .select()
      .from(evmToBsvSwapsTable)
      .where(eq(evmToBsvSwapsTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Swap not found" });
      return;
    }

    // Strict ownership check — always enforced, not optional
    if (row.userEvmAddress !== userEvmAddress.toLowerCase()) {
      res.status(403).json({ error: "Unauthorized: userEvmAddress does not match the swap owner" });
      return;
    }

    if (TERMINAL.has(row.status as EvmBsvStatus)) {
      res.status(409).json({ error: `Swap is already in terminal state: ${row.status}` });
      return;
    }

    // Idempotency: if already LOCKED with the same tx hash, return success
    if (row.status === "LOCKED" && row.evmLockTxHash === evmLockTxHash) {
      res.json({ swapId: id, status: "LOCKED", evmLockTxHash });
      return;
    }

    // Transition: PENDING_LOCK → LOCKED → AWAITING_BSV (solver will be notified)
    await db
      .update(evmToBsvSwapsTable)
      .set({
        evmLockTxHash,
        status:    "LOCKED",
        updatedAt: new Date(),
      })
      .where(eq(evmToBsvSwapsTable.id, id));

    logger.info({ swapId: id, evmLockTxHash, userEvmAddress }, "EVM→BSV swap lock recorded");

    res.json({ swapId: id, status: "LOCKED", evmLockTxHash });
  } catch (err) {
    logger.error({ err, id }, "Failed to update EVM→BSV swap lock");
    res.status(500).json({ error: sanitize(err) });
  }
});

// ── POST /evm-to-bsv-intent/:id/fill — solver records BSV delivery ────────────
//
// Protected by SOLVER_API_KEY env var. In production, solvers must supply this
// key in the X-Solver-Key header. Without it the endpoint returns 403.

router.post("/evm-to-bsv-intent/:id/fill", async (req, res) => {
  const { id } = req.params;

  // API key guard — fail-closed: if SOLVER_API_KEY is not configured the
  // endpoint is disabled entirely (returns 503) to prevent open state mutation.
  const solverKey = process.env.SOLVER_API_KEY;
  if (!solverKey) {
    res.status(503).json({
      error: "Solver integration not configured. Set SOLVER_API_KEY to enable this endpoint.",
    });
    return;
  }
  const suppliedKey = req.headers["x-solver-key"];
  if (!suppliedKey || suppliedKey !== solverKey) {
    res.status(403).json({ error: "Unauthorized: valid X-Solver-Key header required" });
    return;
  }

  const { solverBsvTxid, status: nextStatus } = req.body as {
    solverBsvTxid: string;
    status?:       "BSV_SENT" | "AWAITING_BSV" | "COMPLETE";
  };

  if (!solverBsvTxid || !BSV_TXID_RE.test(solverBsvTxid)) {
    res.status(400).json({ error: "solverBsvTxid must be a 64-char hex BSV txid" });
    return;
  }

  const resolvedStatus: EvmBsvStatus =
    nextStatus === "AWAITING_BSV" || nextStatus === "BSV_SENT" || nextStatus === "COMPLETE"
      ? nextStatus
      : "COMPLETE";

  try {
    const [row] = await db
      .select()
      .from(evmToBsvSwapsTable)
      .where(eq(evmToBsvSwapsTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Swap not found" });
      return;
    }

    if (TERMINAL.has(row.status as EvmBsvStatus)) {
      res.status(409).json({ error: `Swap is already in terminal state: ${row.status}` });
      return;
    }

    await db
      .update(evmToBsvSwapsTable)
      .set({
        solverBsvTxid,
        status:    resolvedStatus,
        updatedAt: new Date(),
      })
      .where(eq(evmToBsvSwapsTable.id, id));

    logger.info({ swapId: id, solverBsvTxid, resolvedStatus }, "EVM→BSV swap fill recorded");

    res.json({ swapId: id, status: resolvedStatus, solverBsvTxid });
  } catch (err) {
    logger.error({ err, id }, "Failed to record EVM→BSV swap fill");
    res.status(500).json({ error: sanitize(err) });
  }
});

// ── GET /evm-to-bsv-intent/:id ────────────────────────────────────────────────

router.get("/evm-to-bsv-intent/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [row] = await db
      .select()
      .from(evmToBsvSwapsTable)
      .where(eq(evmToBsvSwapsTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Swap not found" });
      return;
    }

    res.json({
      swapId:          row.id,
      status:          row.status,
      userEvmAddress:  row.userEvmAddress,
      bsvReceiveAddr:  row.bsvReceiveAddr,
      tokenIn:         row.tokenIn,
      tokenAddress:    row.tokenAddress,
      amountInRaw:     row.amountInRaw,
      amountInHuman:   row.amountInHuman,
      chainId:         row.chainId,
      estimatedBsvOut: row.estimatedBsvOut,
      evmLockTxHash:   row.evmLockTxHash,
      solverBsvTxid:   row.solverBsvTxid,
      expiresAt:       row.expiresAt.toISOString(),
      createdAt:       row.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err, id }, "Failed to fetch EVM→BSV swap");
    res.status(500).json({ error: sanitize(err) });
  }
});

// ── GET /evm-to-bsv-intent — list by user ────────────────────────────────────

router.get("/evm-to-bsv-intent", async (req, res) => {
  const userEvmAddress = (req.query.userAddress as string | undefined)?.toLowerCase();
  if (!userEvmAddress || !EVM_ADDRESS_RE.test(userEvmAddress)) {
    res.status(400).json({ error: "userAddress query param required (0x address)" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(evmToBsvSwapsTable)
      .where(eq(evmToBsvSwapsTable.userEvmAddress, userEvmAddress))
      .orderBy(desc(evmToBsvSwapsTable.createdAt))
      .limit(50);

    res.json(rows.map(row => ({
      swapId:          row.id,
      status:          row.status,
      tokenIn:         row.tokenIn,
      amountInHuman:   row.amountInHuman,
      chainId:         row.chainId,
      bsvReceiveAddr:  row.bsvReceiveAddr,
      estimatedBsvOut: row.estimatedBsvOut,
      evmLockTxHash:   row.evmLockTxHash,
      solverBsvTxid:   row.solverBsvTxid,
      expiresAt:       row.expiresAt.toISOString(),
      createdAt:       row.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err, userEvmAddress }, "Failed to list EVM→BSV swaps");
    res.status(500).json({ error: sanitize(err) });
  }
});

export default router;
