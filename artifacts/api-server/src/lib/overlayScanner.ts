/**
 * BSV Overlay Scanner — OrahDEX
 *
 * Lightweight indexer that scans funded BSV intent sessions and verifies
 * their on-chain OP_RETURN records via WhatsOnChain.
 *
 * Strategy (targeted, not block-wide):
 *   1. Every SCAN_INTERVAL_MS, query bsv_intent_sessions for rows that have
 *      a fundingTxid but no matching overlay_records entry yet.
 *   2. For each txid, fetch the WoC JSON transaction.
 *   3. Scan vout for an OP_RETURN output whose decoded payload starts with "ORAH|".
 *   4. Parse the v3 pipe-delimited payload and upsert into overlay_records.
 *
 * This approach is efficient: it only inspects txids we already know about
 * rather than fetching every transaction in every block.
 */

import crypto from "node:crypto";
import { db } from "@workspace/db";
import { bsvIntentSessionsTable } from "@workspace/db/schema";
import { overlayRecordsTable } from "@workspace/db/schema";
import { isNull, isNotNull, notInArray, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { BSV_NET } from "./bsvNetworkConfig.js";

const WOC_BASE         = BSV_NET.wocBase;
const SCAN_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const BATCH_SIZE       = 20;               // max intents to scan per tick
const FETCH_TIMEOUT_MS = 12_000;

interface WocVout {
  value: number;
  n: number;
  scriptPubKey: {
    hex?: string;
    type?: string;
    asm?: string;
  };
}

interface WocTx {
  txid?: string;
  blockheight?: number;
  blockhash?: string;
  vout?: WocVout[];
}

/** Decode an OP_RETURN script hex to UTF-8 text, or null if not OP_RETURN. */
function decodeOpReturnHex(scriptHex: string): string | null {
  if (!scriptHex || scriptHex.length < 4) return null;
  const buf = Buffer.from(scriptHex, "hex");
  if (buf[0] !== 0x6a) return null;  // not OP_RETURN

  // Skip OP_RETURN (1 byte) + pushdata prefix
  let offset = 1;
  if (offset >= buf.length) return null;

  const byte1 = buf[offset]!;
  if (byte1 === 0x4c) {
    // OP_PUSHDATA1 — next byte is the length
    offset += 2;
  } else if (byte1 === 0x4d) {
    // OP_PUSHDATA2 — next 2 bytes are the length (LE)
    offset += 3;
  } else if (byte1 <= 0x4b) {
    // Direct push: byte is the length
    offset += 1;
  } else {
    return null;
  }

  if (offset >= buf.length) return null;
  try {
    return buf.subarray(offset).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Parse the v3 ORAH OP_RETURN payload.
 *
 * Format: ORAH|v3|<intentId16>|<tokenIn→tokenOut>|<amountInSat>|<minAmountOut>|
 *         <destChain>|<destAddr>|<deadline>|N:<nonce16>|H:<secretHash16>|
 *         I:<intentHash16>|A:<htlcAddr>
 */
function parseOrahPayload(payload: string): {
  orderId:     string | null;
  secretHash:  string | null;
  amountsJson: string | null;
  evmAddress:  string | null;
} | null {
  const parts = payload.split("|");
  if (parts.length < 13) return null;
  if (parts[0] !== "ORAH" || parts[1] !== "v3") return null;

  const orderId    = parts[2] ?? null;
  const pairStr    = parts[3] ?? "";
  const amountIn   = parts[4] ?? "0";
  const minOut     = parts[5] ?? "0";
  const destChain  = parts[6] ?? "";
  const destAddr   = parts[7] ?? "";

  // Extract H:<secretHash16>
  const hPart = parts.find(p => p.startsWith("H:"));
  const secretHash = hPart ? hPart.slice(2) : null;

  // destAddr may be an EVM address (0x...) or BSV address
  const evmAddress = destAddr.startsWith("0x") ? destAddr : null;

  // Build a compact JSON amounts blob
  const amountsJson = JSON.stringify({
    pair:    pairStr,
    amountIn,
    minOut,
    destChain,
    destAddr,
  });

  return { orderId, secretHash, amountsJson, evmAddress };
}

async function safeFetch(url: string): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "OrahDEX-Overlay/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function scanTxid(txid: string): Promise<void> {
  const txData = await safeFetch(`${WOC_BASE}/tx/${txid}`) as WocTx | null;
  if (!txData) return;

  const vouts: WocVout[] = Array.isArray(txData.vout) ? txData.vout : [];
  const blockHeight: number | undefined = typeof txData.blockheight === "number" ? txData.blockheight : undefined;

  for (const vout of vouts) {
    const hex = vout.scriptPubKey?.hex;
    if (!hex) continue;

    const text = decodeOpReturnHex(hex);
    if (!text || !text.startsWith("ORAH|")) continue;

    const parsed = parseOrahPayload(text);
    if (!parsed) continue;

    const id = crypto.randomUUID();
    try {
      await db.insert(overlayRecordsTable).values({
        id,
        txid,
        blockHeight: blockHeight ?? null,
        orderId:     parsed.orderId,
        secretHash:  parsed.secretHash,
        amountsJson: parsed.amountsJson,
        evmAddress:  parsed.evmAddress,
        rawPayload:  text,
      }).onConflictDoNothing();
      logger.info({ txid, orderId: parsed.orderId, blockHeight }, "Overlay: indexed OP_RETURN record");
    } catch (err) {
      logger.warn({ err, txid }, "Overlay: DB upsert failed (non-fatal)");
    }
    return; // one OP_RETURN per tx is enough
  }
}

async function scanTick(): Promise<void> {
  try {
    // Find all funded intents whose fundingTxid is not yet in overlay_records
    const existingTxids = await db
      .select({ txid: overlayRecordsTable.txid })
      .from(overlayRecordsTable);
    const known = existingTxids.map(r => r.txid);

    const query = db
      .select({ fundingTxid: bsvIntentSessionsTable.fundingTxid })
      .from(bsvIntentSessionsTable)
      .where(isNotNull(bsvIntentSessionsTable.fundingTxid))
      .limit(BATCH_SIZE + known.length);  // over-fetch to account for filtering

    const rows = await query;
    const toScan = rows
      .map(r => r.fundingTxid!)
      .filter(txid => txid && !known.includes(txid))
      .slice(0, BATCH_SIZE);

    if (toScan.length === 0) return;

    logger.info({ count: toScan.length }, "Overlay scanner: scanning txids");
    for (const txid of toScan) {
      await scanTxid(txid);
    }
  } catch (err) {
    logger.warn({ err }, "Overlay scanner tick error (non-fatal)");
  }
}

export function startOverlayScanner(): void {
  logger.info(`Overlay scanner starting — polling every ${SCAN_INTERVAL_MS / 1000}s`);
  // Initial scan after 30s to let DB warm up
  setTimeout(() => {
    scanTick().catch(e => logger.warn({ err: e }, "Overlay scanner: initial scan failed"));
  }, 30_000);

  setInterval(() => {
    scanTick().catch(e => logger.warn({ err: e }, "Overlay scanner tick error"));
  }, SCAN_INTERVAL_MS);
}

/** Public: get the overlay record for a given orderId (truncated, e.g. first 16 chars of UUID). */
export async function getOverlayByOrderId(orderId: string) {
  const rows = await db
    .select()
    .from(overlayRecordsTable)
    .where(sql`${overlayRecordsTable.orderId} = ${orderId}`)
    .limit(1);
  return rows[0] ?? null;
}

/** Public: get overlay stats for admin panel. */
export async function getOverlayStats() {
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(overlayRecordsTable);
  const total = countRow?.count ?? 0;

  const recent = await db
    .select()
    .from(overlayRecordsTable)
    .orderBy(sql`${overlayRecordsTable.indexedAt} desc`)
    .limit(10);

  const [maxBlock] = await db
    .select({ maxBlock: sql<number>`max(${overlayRecordsTable.blockHeight})` })
    .from(overlayRecordsTable);

  return {
    total,
    latestBlockScanned: maxBlock?.maxBlock ?? null,
    recent: recent.map(r => ({
      txid:        r.txid,
      blockHeight: r.blockHeight,
      orderId:     r.orderId,
      amountsJson: r.amountsJson,
      indexedAt:   r.indexedAt,
    })),
  };
}
