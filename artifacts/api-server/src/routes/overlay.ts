/**
 * Overlay API — OrahDEX
 *
 * Public (no auth) endpoints for the BSV overlay indexer.
 * Anyone can independently verify OrahDEX on-chain records.
 *
 * GET /api/overlay/intents            — paginated list of indexed records
 * GET /api/overlay/intents/:orderId   — lookup by orderId prefix
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { overlayRecordsTable } from "@workspace/db/schema";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";

const router = Router();

function explorerTxUrl(txid: string): string {
  return `${BSV_NET.explorer}/tx/${txid}`;
}

function formatRecord(r: typeof overlayRecordsTable.$inferSelect) {
  return {
    txid:          r.txid,
    explorerUrl:   explorerTxUrl(r.txid),
    blockHeight:   r.blockHeight,
    orderId:       r.orderId,
    secretHash:    r.secretHash,
    amountsJson:   r.amountsJson ? JSON.parse(r.amountsJson) : null,
    evmAddress:    r.evmAddress,
    rawPayload:    r.rawPayload,
    indexedAt:     r.indexedAt,
  };
}

/**
 * GET /api/overlay/intents
 * Query params:
 *   limit  — 1–100 (default 20)
 *   offset — page offset (default 0)
 */
router.get("/intents", async (req, res) => {
  try {
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit  ?? "20"))));
    const offset = Math.max(0,               parseInt(String(req.query.offset ?? "0")));

    const rows = await db
      .select()
      .from(overlayRecordsTable)
      .orderBy(desc(overlayRecordsTable.indexedAt))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(overlayRecordsTable);

    res.json({
      total:   countRow?.count ?? 0,
      limit,
      offset,
      records: rows.map(formatRecord),
    });
  } catch (err) {
    logger.warn({ err }, "GET /overlay/intents error");
    res.status(500).json({ error: "Failed to fetch overlay records" });
  }
});

/**
 * GET /api/overlay/intents/:orderId
 * Look up a single overlay record by its orderId (the first 16 chars of the UUID).
 */
router.get("/intents/:orderId", async (req, res) => {
  const orderId = (req.params.orderId ?? "").trim().slice(0, 32);
  if (!orderId) {
    res.status(400).json({ error: "orderId is required" });
    return;
  }

  try {
    const rows = await db
      .select()
      .from(overlayRecordsTable)
      .where(eq(overlayRecordsTable.orderId, orderId))
      .limit(1);

    if (!rows.length) {
      res.status(404).json({ found: false, orderId });
      return;
    }

    res.json({ found: true, record: formatRecord(rows[0]!) });
  } catch (err) {
    logger.warn({ err, orderId }, "GET /overlay/intents/:orderId error");
    res.status(500).json({ error: "Failed to fetch overlay record" });
  }
});

export default router;
