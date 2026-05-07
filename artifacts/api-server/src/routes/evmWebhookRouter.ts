/**
 * evmWebhookRouter.ts — POST /api/webhooks/evm
 *
 * Receives real-time EVM log events pushed by any compatible webhook provider
 * and routes them to the appropriate OrahDEX subsystem:
 *
 *   HTLC Locked   → triggerEvmHtlcCheckByLockId()  (replaces polling delay)
 *   HTLC Revealed → mark session COMPLETED immediately
 *   HTLC Refunded → mark session refunded immediately
 *   Escrow Released → log on-chain settlement confirmation
 *
 * Compatible with any provider that POSTs EVM log payloads:
 *   - Alchemy Notify / Webhooks
 *   - Infura Transactions API
 *   - Tenderly Alerts
 *   - Self-hosted node relay scripts
 *   - Any QuickNode-compatible endpoint (legacy support)
 *
 * Security: HMAC-SHA256 signature verified via x-webhook-signature header
 * (or x-qn-signature for backwards compatibility) when EVM_WEBHOOK_SECRET
 * is set. Without the secret the route still processes events but logs a
 * warning — acceptable during initial setup / dev.
 *
 * IMPORTANT: This route MUST be registered BEFORE express.json() in app.ts
 * because signature verification requires the raw request body Buffer.
 *
 * Env vars:
 *   EVM_WEBHOOK_SECRET — shared HMAC secret (also accepts QUICKNODE_WEBHOOK_SECRET)
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { evmHtlcSessionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  TOPIC_HTLC_LOCKED,
  TOPIC_HTLC_REVEALED,
  TOPIC_HTLC_REFUNDED,
  TOPIC_ESCROW_RELEASED,
  verifyWebhookSignature,
  getWebhookSecret,
  resolveSignatureHeader,
  extractLogs,
  type EvmWebhookLog,
} from "../lib/evmWebhook.js";
import { triggerEvmHtlcCheckByLockId } from "../lib/evmHtlc.js";

const router = Router();

// Known contract addresses (lowercase) to filter incoming logs
const KNOWN_CONTRACTS = new Set([
  "0xee234ceb85697b64800e696699b7841e00413b4f", // ETH mainnet HTLC + Escrow
  "0x4deb6023abd9e1c640ada35201be8ff591d21cf2", // Sepolia Escrow
]);

// ── Signature verification ────────────────────────────────────────────────────

function checkSignature(rawBody: Buffer, req: Request): boolean {
  const secret = getWebhookSecret();
  if (!secret) {
    logger.warn(
      "evmWebhook: EVM_WEBHOOK_SECRET not set — skipping HMAC verification (set it for production)"
    );
    return true;
  }

  const sig = resolveSignatureHeader(req.headers as Record<string, string | string[] | undefined>);
  if (!sig) {
    logger.warn({ headers: Object.keys(req.headers) }, "evmWebhook: missing signature header");
    return false;
  }

  if (!verifyWebhookSignature(rawBody, sig, secret)) {
    logger.warn({ sig }, "evmWebhook: HMAC signature mismatch — rejecting payload");
    return false;
  }

  return true;
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleLocked(log: EvmWebhookLog): Promise<void> {
  const lockId = log.topics[1];
  if (!lockId) {
    logger.warn({ log }, "evmWebhook: Locked event missing topics[1] (lockId)");
    return;
  }

  logger.info(
    { lockId, txHash: log.transactionHash, block: log.blockNumber },
    "evmWebhook: HTLC Locked event received"
  );

  try {
    await triggerEvmHtlcCheckByLockId(lockId, log.transactionHash);
  } catch (err) {
    logger.warn({ err, lockId }, "evmWebhook: triggerEvmHtlcCheckByLockId failed");
  }
}

async function handleRevealed(log: EvmWebhookLog): Promise<void> {
  const lockId = log.topics[1];
  if (!lockId) return;

  logger.info(
    { lockId, txHash: log.transactionHash },
    "evmWebhook: HTLC Revealed event received"
  );

  try {
    const sessions = await db
      .select()
      .from(evmHtlcSessionsTable)
      .where(eq(evmHtlcSessionsTable.sellerLockId, lockId));

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
      logger.debug({ lockId }, "evmWebhook: no session found for Revealed lockId");
      return;
    }

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
      "evmWebhook: HTLC Revealed — session updated"
    );
  } catch (err) {
    logger.warn({ err, lockId }, "evmWebhook: handleRevealed failed");
  }
}

async function handleRefunded(log: EvmWebhookLog): Promise<void> {
  const lockId = log.topics[1];
  if (!lockId) return;

  logger.info(
    { lockId, txHash: log.transactionHash },
    "evmWebhook: HTLC Refunded event received"
  );

  try {
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
      logger.debug({ lockId }, "evmWebhook: no session found for Refunded lockId");
      return;
    }

    await db
      .update(evmHtlcSessionsTable)
      .set({ status: side, updatedAt: new Date() })
      .where(eq(evmHtlcSessionsTable.id, session.id));

    logger.info(
      { sessionId: session.id, side, txHash: log.transactionHash },
      "evmWebhook: HTLC Refunded — session marked refunded"
    );
  } catch (err) {
    logger.warn({ err, lockId }, "evmWebhook: handleRefunded failed");
  }
}

async function handleOrderReleased(log: EvmWebhookLog): Promise<void> {
  const orderId   = log.topics[1] ?? "(unknown)";
  const recipient = log.topics[2] ?? "(unknown)";
  logger.info(
    { orderId, recipient, txHash: log.transactionHash, contract: log.address },
    "evmWebhook: Escrow OrderReleased — on-chain settlement confirmed"
  );
}

// ── Shared request handler ────────────────────────────────────────────────────

async function handleWebhookRequest(req: Request, res: Response): Promise<void> {
  const rawBody = req.body as Buffer;

  if (!checkSignature(rawBody, req)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    logger.warn("evmWebhook: failed to parse JSON body");
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const logs = extractLogs(parsed);

  if (logs.length === 0) {
    res.json({ received: true, processed: 0 });
    return;
  }

  logger.debug({ count: logs.length }, "evmWebhook: processing log batch");

  let processed = 0;

  // Add any extra contract addresses configured at runtime
  const extraContracts = (process.env["EVM_WATCHED_CONTRACTS"] ?? "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  await Promise.allSettled(
    logs.map(async (log) => {
      const topic0 = log.topics?.[0]?.toLowerCase();
      if (!topic0) return;

      const addr = (log.address ?? "").toLowerCase();
      const isKnown = KNOWN_CONTRACTS.has(addr) || extraContracts.includes(addr);
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
        logger.debug({ topic0, addr }, "evmWebhook: unrecognised topic — ignoring");
      }
    })
  );

  res.json({ received: true, processed });
}

// ── Body buffer middleware ────────────────────────────────────────────────────

function ensureBuffer(req: Request, _res: Response, next: () => void): void {
  if (Buffer.isBuffer(req.body)) {
    next();
    return;
  }
  req.body = Buffer.from(
    typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? ""),
    "utf8"
  );
  next();
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Primary provider-agnostic path: POST /api/webhooks/evm
router.post("/evm", ensureBuffer, handleWebhookRequest);

// Legacy path: POST /api/webhooks/quicknode
// Kept for backwards compatibility with existing webhook registrations.
// New integrations should use /api/webhooks/evm instead.
router.post("/quicknode", ensureBuffer, handleWebhookRequest);

export default router;
