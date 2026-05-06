/**
 * quicknodeWebhook.ts — POST /api/webhooks/quicknode
 *
 * Receives real-time EVM log events pushed by QuickNode Streams and routes
 * them to the appropriate OrahDEX subsystem:
 *
 *   HTLC Locked   → triggerEvmHtlcCheckByLockId()  (replaces 30 s polling)
 *   HTLC Revealed → mark session COMPLETED immediately
 *   HTLC Refunded → mark session refunded immediately
 *   Escrow Released → log on-chain settlement confirmation
 *
 * Security: HMAC-SHA256 signature verified via `x-qn-signature` header when
 * QUICKNODE_WEBHOOK_SECRET is set. Without the secret the route still processes
 * events but logs a warning — acceptable during initial setup / dev.
 *
 * IMPORTANT: This route MUST be registered BEFORE express.json() in app.ts
 * because signature verification requires the raw request body Buffer.
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { evmHtlcSessionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  QN_SIG_HEADER,
  TOPIC_HTLC_LOCKED,
  TOPIC_HTLC_REVEALED,
  TOPIC_HTLC_REFUNDED,
  TOPIC_ESCROW_RELEASED,
  verifyQuickNodeSignature,
  extractLogs,
  type QNStreamLog,
} from "../lib/quicknodeStreams.js";
import { triggerEvmHtlcCheckByLockId } from "../lib/evmHtlc.js";

const router = Router();

// ── Signature verification ────────────────────────────────────────────────────

function checkSignature(rawBody: Buffer, req: Request): boolean {
  const secret = process.env.QUICKNODE_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn(
      "quicknodeWebhook: QUICKNODE_WEBHOOK_SECRET not set — skipping HMAC verification (set it for production)"
    );
    return true; // allow through so setup / dev can proceed without the secret
  }

  const sig = req.headers[QN_SIG_HEADER];
  if (!sig || typeof sig !== "string") {
    logger.warn({ headers: Object.keys(req.headers) }, "quicknodeWebhook: missing x-qn-signature header");
    return false;
  }

  if (!verifyQuickNodeSignature(rawBody, sig, secret)) {
    logger.warn({ sig }, "quicknodeWebhook: HMAC signature mismatch — rejecting payload");
    return false;
  }

  return true;
}

// ── Event handlers ────────────────────────────────────────────────────────────

/**
 * Handle a Locked event: topics[1] = lockId (bytes32, indexed).
 * Finds the matching HTLC session and triggers immediate reveal if both sides locked.
 */
async function handleLocked(log: QNStreamLog): Promise<void> {
  const lockId = log.topics[1];
  if (!lockId) {
    logger.warn({ log }, "quicknodeWebhook: Locked event missing topics[1] (lockId)");
    return;
  }

  logger.info(
    { lockId, txHash: log.transactionHash, block: log.blockNumber },
    "quicknodeWebhook: HTLC Locked event received"
  );

  try {
    await triggerEvmHtlcCheckByLockId(lockId, log.transactionHash);
  } catch (err) {
    logger.warn({ err, lockId }, "quicknodeWebhook: triggerEvmHtlcCheckByLockId failed");
  }
}

/**
 * Handle a Revealed event: topics[1] = lockId (bytes32, indexed).
 * Marks the side as revealed; marks session COMPLETED when both sides done.
 */
async function handleRevealed(log: QNStreamLog): Promise<void> {
  const lockId = log.topics[1];
  if (!lockId) return;

  logger.info(
    { lockId, txHash: log.transactionHash },
    "quicknodeWebhook: HTLC Revealed event received"
  );

  try {
    // Find which session this lock belongs to
    const sessions = await db
      .select()
      .from(evmHtlcSessionsTable)
      .where(
        // Check both seller and buyer lock IDs using raw SQL OR
        // (drizzle doesn't have a cross-column OR helper for this pattern)
        eq(evmHtlcSessionsTable.sellerLockId, lockId)
      );

    let session = sessions[0];
    let side: "seller" | "buyer" = "seller";

    if (!session) {
      const buyerSessions = await db
        .select()
        .from(evmHtlcSessionsTable)
        .where(eq(evmHtlcSessionsTable.buyerLockId, lockId));
      session = buyerSessions[0];
      side = "buyer";
    }

    if (!session) {
      logger.debug({ lockId }, "quicknodeWebhook: no session found for Revealed lockId");
      return;
    }

    // Update the reveal tx and status
    const updates =
      side === "seller"
        ? { revealSellerTxid: log.transactionHash }
        : { revealBuyerTxid:  log.transactionHash };

    const newSellerRevealed = side === "seller" ? true : !!session.revealSellerTxid;
    const newBuyerRevealed  = side === "buyer"  ? true : !!session.revealBuyerTxid;

    const newStatus =
      newSellerRevealed && newBuyerRevealed ? "COMPLETED" : "REVEALING";

    await db
      .update(evmHtlcSessionsTable)
      .set({ ...updates, status: newStatus, updatedAt: new Date() })
      .where(eq(evmHtlcSessionsTable.id, session.id));

    logger.info(
      { sessionId: session.id, side, newStatus, txHash: log.transactionHash },
      "quicknodeWebhook: HTLC Revealed — session updated"
    );
  } catch (err) {
    logger.warn({ err, lockId }, "quicknodeWebhook: handleRevealed failed");
  }
}

/**
 * Handle a Refunded event: topics[1] = lockId (bytes32, indexed).
 * Marks the appropriate session side as refunded.
 */
async function handleRefunded(log: QNStreamLog): Promise<void> {
  const lockId = log.topics[1];
  if (!lockId) return;

  logger.info(
    { lockId, txHash: log.transactionHash },
    "quicknodeWebhook: HTLC Refunded event received"
  );

  try {
    // Try seller lock first
    const sellerRows = await db
      .select()
      .from(evmHtlcSessionsTable)
      .where(eq(evmHtlcSessionsTable.sellerLockId, lockId));

    let session = sellerRows[0];
    let side: "SELLER_REFUNDED" | "BUYER_REFUNDED" = "SELLER_REFUNDED";

    if (!session) {
      const buyerRows = await db
        .select()
        .from(evmHtlcSessionsTable)
        .where(eq(evmHtlcSessionsTable.buyerLockId, lockId));
      session = buyerRows[0];
      side = "BUYER_REFUNDED";
    }

    if (!session) {
      logger.debug({ lockId }, "quicknodeWebhook: no session found for Refunded lockId");
      return;
    }

    await db
      .update(evmHtlcSessionsTable)
      .set({ status: side, updatedAt: new Date() })
      .where(eq(evmHtlcSessionsTable.id, session.id));

    logger.info(
      { sessionId: session.id, side, txHash: log.transactionHash },
      "quicknodeWebhook: HTLC Refunded — session marked refunded"
    );
  } catch (err) {
    logger.warn({ err, lockId }, "quicknodeWebhook: handleRefunded failed");
  }
}

/**
 * Handle an OrderReleased event from the OrahDEXEscrow contract.
 * topics[1] = orderId (bytes32, indexed), topics[2] = recipient (address, indexed).
 */
async function handleOrderReleased(log: QNStreamLog): Promise<void> {
  const orderId   = log.topics[1] ?? "(unknown)";
  const recipient = log.topics[2] ?? "(unknown)";
  logger.info(
    { orderId, recipient, txHash: log.transactionHash, contract: log.address },
    "quicknodeWebhook: Escrow OrderReleased — on-chain settlement confirmed"
  );
  // The escrow release is self-confirming; no DB update needed here since
  // the relayer that called release() already recorded the tx hash.
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post(
  "/quicknode",
  // Raw body middleware — applied per-route so other routes are unaffected.
  // express.raw() must run BEFORE express.json() which strips the raw buffer.
  // This route is registered in app.ts before the global body parsers.
  // Mount point: app.use("/api/webhooks", ...) → effective path = /api/webhooks/quicknode
  (req, res, next) => {
    // If body is already a Buffer (registered early with express.raw), proceed.
    // If not (e.g. during testing with pre-parsed JSON), wrap it.
    if (Buffer.isBuffer(req.body)) {
      return next();
    }
    // Fall back: convert to buffer from stringified body
    req.body = Buffer.from(
      typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? ""),
      "utf8"
    );
    next();
  },
  async (req: Request, res: Response) => {
    const rawBody = req.body as Buffer;

    // ── 1. Verify HMAC signature ─────────────────────────────────────────────
    if (!checkSignature(rawBody, req)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    // ── 2. Parse payload ─────────────────────────────────────────────────────
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch {
      logger.warn("quicknodeWebhook: failed to parse JSON body");
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    const logs = extractLogs(parsed);

    if (logs.length === 0) {
      // Heartbeat / empty batch — acknowledge silently
      res.json({ received: true, processed: 0 });
      return;
    }

    logger.debug({ count: logs.length }, "quicknodeWebhook: processing log batch");

    // ── 3. Route each log by event topic ─────────────────────────────────────
    let processed = 0;

    await Promise.allSettled(
      logs.map(async (log) => {
        const topic0 = log.topics?.[0]?.toLowerCase();
        if (!topic0) return;

        // Only handle logs from our known contracts
        const addr = (log.address ?? "").toLowerCase();
        const knownContracts = (process.env.EVM_HTLC_CONTRACT_ETH ?? "").toLowerCase();
        const isKnown =
          addr === "0xee234ceb85697b64800e696699b7841e00413b4f" ||
          addr === "0x4deb6023abd9e1c640ada35201be8ff591d21cf2" ||
          (knownContracts && addr === knownContracts);

        if (!isKnown) return;

        processed++;

        if (topic0 === TOPIC_HTLC_LOCKED.toLowerCase()) {
          await handleLocked(log);
        } else if (topic0 === TOPIC_HTLC_REVEALED.toLowerCase()) {
          await handleRevealed(log);
        } else if (topic0 === TOPIC_HTLC_REFUNDED.toLowerCase()) {
          await handleRefunded(log);
        } else if (topic0 === TOPIC_ESCROW_RELEASED.toLowerCase()) {
          await handleOrderReleased(log);
        } else {
          logger.debug({ topic0, addr }, "quicknodeWebhook: unrecognised topic — ignoring");
        }
      })
    );

    // QuickNode expects a 2xx within its timeout — always acknowledge
    res.json({ received: true, processed });
  }
);

export default router;
