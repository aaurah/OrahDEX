/**
 * BSV Overlay Scanner — OrahDEX
 *
 * Hybrid indexer combining true incremental block scanning with a targeted
 * DB scan against known platform settlement txids.
 *
 * Strategy:
 *
 *   A) Block scan (authoritative on-chain coverage):
 *      - Persists "overlay_last_scanned_height" in platform_settings.
 *      - Each tick fetches the current chain height from WoC.
 *      - For every new block since last scan, fetches the block's tx list and
 *        checks each txid for an ORAH|v3 OP_RETURN, indexing matches.
 *      - Limits tx checks per block to avoid excessive WoC traffic.
 *
 *   B) DB-targeted scan (fast path for platform settlements):
 *      - Scans claimTxid, auditTxid, and fundingTxid from bsv_intent_sessions.
 *      - Catches platform-generated ORAH settlement txs as soon as they are
 *        written to the DB (even before block confirmation).
 *
 * Both paths are idempotent (ON CONFLICT DO NOTHING).
 */

import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import { bsvIntentSessionsTable, platformSettingsTable } from "@workspace/db/schema";
import { overlayRecordsTable } from "@workspace/db/schema";
import { isNotNull, or, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { BSV_NET } from "./bsvNetworkConfig.js";

const WOC_BASE         = BSV_NET.wocBase;
const SCAN_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const DB_BATCH_SIZE    = 30;               // max DB txids per tick
const BLOCK_TX_LIMIT   = 300;             // max tx to inspect per block
const MAX_BLOCKS_PER_TICK = 5;            // max new blocks to scan per tick
const FETCH_TIMEOUT_MS = 12_000;
const HEIGHT_SETTING_KEY = "overlay_last_scanned_height";

// ── WoC types ─────────────────────────────────────────────────────────────────

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

interface WocBlock {
  hash?: string;
  height?: number;
  tx?: string[];
}

interface WocChainInfo {
  blocks?: number;
  bestblockhash?: string;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function safeFetch<T = Record<string, unknown>>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "OrahDEX-Overlay/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

/** Decode an OP_RETURN script hex to UTF-8 text, or null if not OP_RETURN. */
function decodeOpReturnHex(scriptHex: string): string | null {
  if (!scriptHex || scriptHex.length < 4) return null;
  const buf = Buffer.from(scriptHex, "hex");
  if (buf[0] !== 0x6a) return null;  // not OP_RETURN

  let offset = 1;
  if (offset >= buf.length) return null;

  const byte1 = buf[offset]!;
  if (byte1 === 0x4c) {
    offset += 2;    // OP_PUSHDATA1
  } else if (byte1 === 0x4d) {
    offset += 3;    // OP_PUSHDATA2
  } else if (byte1 <= 0x4b) {
    offset += 1;    // direct push
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
 * Format: ORAH|v3|<intentId16>|<pair>|<amountIn>|<minOut>|<destChain>|<destAddr>|
 *         <deadline>|N:<nonce16>|H:<secretHash16>|I:<intentHash16>|A:<htlcAddr>
 */
function parseOrahPayload(payload: string): {
  orderId:     string | null;
  secretHash:  string | null;
  amountsJson: string | null;
  evmAddress:  string | null;
} | null {
  const parts = payload.split("|");
  if (parts.length < 3) return null;
  if (parts[0] !== "ORAH" || parts[1] !== "v3") return null;

  const orderId    = parts[2] ?? null;
  const pairStr    = parts[3] ?? "";
  const amountIn   = parts[4] ?? "0";
  const minOut     = parts[5] ?? "0";
  const destChain  = parts[6] ?? "";
  const destAddr   = parts[7] ?? "";

  const hPart = parts.find(p => p.startsWith("H:"));
  const secretHash = hPart ? hPart.slice(2) : null;

  const evmAddress = destAddr.startsWith("0x") ? destAddr : null;

  const amountsJson = JSON.stringify({
    pair:    pairStr,
    amountIn,
    minOut,
    destChain,
    destAddr,
  });

  return { orderId, secretHash, amountsJson, evmAddress };
}

/** Fetch a tx from WoC and index any ORAH OP_RETURN output. Returns true if indexed. */
async function scanTxid(txid: string): Promise<boolean> {
  const txData = await safeFetch<WocTx>(`${WOC_BASE}/tx/${txid}`);
  if (!txData) return false;

  const vouts: WocVout[] = Array.isArray(txData.vout) ? txData.vout : [];
  const blockHeight: number | null = typeof txData.blockheight === "number" && txData.blockheight > 0
    ? txData.blockheight
    : null;

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
        blockHeight,
        orderId:     parsed.orderId,
        secretHash:  parsed.secretHash,
        amountsJson: parsed.amountsJson,
        evmAddress:  parsed.evmAddress,
        rawPayload:  text,
      }).onConflictDoNothing();
      logger.info({ txid, orderId: parsed.orderId, blockHeight }, "Overlay: indexed OP_RETURN record");
      return true;
    } catch (err) {
      logger.warn({ err, txid }, "Overlay: DB upsert failed (non-fatal)");
    }
    return false;
  }
  return false;
}

// ── Height persistence ────────────────────────────────────────────────────────

async function getLastScannedHeight(): Promise<number | null> {
  try {
    const [row] = await db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(sql`${platformSettingsTable.key} = ${HEIGHT_SETTING_KEY}`)
      .limit(1);
    if (!row?.value) return null;
    const h = parseInt(row.value, 10);
    return isNaN(h) ? null : h;
  } catch {
    return null;
  }
}

async function setLastScannedHeight(height: number): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO platform_settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [HEIGHT_SETTING_KEY, String(height)]
    );
  } catch (err) {
    logger.warn({ err }, "Overlay: failed to persist last scanned height");
  }
}

async function getCurrentChainHeight(): Promise<number | null> {
  const info = await safeFetch<WocChainInfo>(`${WOC_BASE}/chain/info`);
  if (!info?.blocks || typeof info.blocks !== "number") return null;
  return info.blocks;
}

// ── Block scanning path ───────────────────────────────────────────────────────

async function scanBlock(height: number): Promise<void> {
  const block = await safeFetch<WocBlock>(`${WOC_BASE}/block/height/${height}`);
  if (!block || !Array.isArray(block.tx) || block.tx.length === 0) return;

  const txids = block.tx.slice(0, BLOCK_TX_LIMIT);
  let found = 0;

  for (const txid of txids) {
    if (!txid || typeof txid !== "string") continue;
    // Skip coinbase (usually first tx) — it won't have ORAH OP_RETURN
    if (txid === block.tx[0]) continue;

    const indexed = await scanTxid(txid);
    if (indexed) found++;
  }

  if (found > 0) {
    logger.info({ height, found }, "Overlay block scan: found ORAH records");
  }
}

async function blockScanTick(currentHeight: number): Promise<void> {
  const lastScanned = await getLastScannedHeight();

  // On first run, start scanning from current height - 10 blocks back
  const startHeight = lastScanned !== null
    ? lastScanned + 1
    : Math.max(1, currentHeight - 10);

  const endHeight = Math.min(currentHeight, startHeight + MAX_BLOCKS_PER_TICK - 1);

  if (startHeight > endHeight) return; // nothing new

  logger.info({ startHeight, endHeight, currentHeight }, "Overlay: scanning blocks");

  for (let h = startHeight; h <= endHeight; h++) {
    await scanBlock(h);
  }

  await setLastScannedHeight(endHeight);
}

// ── DB-targeted scan path ────────────────────────────────────────────────────

async function dbTargetedScan(): Promise<void> {
  // Collect all txids already indexed
  const existingRows = await db
    .select({ txid: overlayRecordsTable.txid })
    .from(overlayRecordsTable);
  const knownTxids = new Set(existingRows.map(r => r.txid));

  // Query claimTxid, auditTxid, and fundingTxid from intent sessions
  const sessions = await db
    .select({
      claimTxid:  bsvIntentSessionsTable.claimTxid,
      auditTxid:  bsvIntentSessionsTable.auditTxid,
      fundingTxid: bsvIntentSessionsTable.fundingTxid,
    })
    .from(bsvIntentSessionsTable)
    .where(
      or(
        isNotNull(bsvIntentSessionsTable.claimTxid),
        isNotNull(bsvIntentSessionsTable.auditTxid),
        isNotNull(bsvIntentSessionsTable.fundingTxid),
      )
    )
    .limit(DB_BATCH_SIZE * 3);

  // Collect unique unindexed txids; prioritise claim > audit > funding
  const toScan: string[] = [];
  const seen = new Set<string>();

  for (const s of sessions) {
    for (const txid of [s.claimTxid, s.auditTxid, s.fundingTxid]) {
      if (txid && !knownTxids.has(txid) && !seen.has(txid)) {
        seen.add(txid);
        toScan.push(txid);
        if (toScan.length >= DB_BATCH_SIZE) break;
      }
    }
    if (toScan.length >= DB_BATCH_SIZE) break;
  }

  if (toScan.length === 0) return;

  logger.info({ count: toScan.length }, "Overlay DB scan: checking txids");
  for (const txid of toScan) {
    await scanTxid(txid);
  }
}

// ── Main scanner loop ─────────────────────────────────────────────────────────

async function scanTick(): Promise<void> {
  try {
    // A) DB-targeted scan (fast, catches platform settlements immediately)
    await dbTargetedScan();

    // B) Incremental block scan (authoritative on-chain coverage)
    const currentHeight = await getCurrentChainHeight();
    if (currentHeight && currentHeight > 0) {
      await blockScanTick(currentHeight);
    }
  } catch (err) {
    logger.warn({ err }, "Overlay scanner tick error (non-fatal)");
  }
}

export function startOverlayScanner(): void {
  logger.info(`Overlay scanner starting — block scan + DB scan every ${SCAN_INTERVAL_MS / 1000}s`);
  // Initial scan after 45s to let DB warm up and chain monitor hydrate
  setTimeout(() => {
    scanTick().catch(e => logger.warn({ err: e }, "Overlay scanner: initial scan failed"));
  }, 45_000);

  setInterval(() => {
    scanTick().catch(e => logger.warn({ err: e }, "Overlay scanner tick error"));
  }, SCAN_INTERVAL_MS);
}

// ── Admin / public helpers ────────────────────────────────────────────────────

export async function getOverlayByOrderId(orderId: string) {
  const rows = await db
    .select()
    .from(overlayRecordsTable)
    .where(sql`${overlayRecordsTable.orderId} = ${orderId}`)
    .limit(1);
  return rows[0] ?? null;
}

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

  const lastScannedHeight = await getLastScannedHeight();

  return {
    total,
    latestBlockScanned: lastScannedHeight ?? maxBlock?.maxBlock ?? null,
    recent: recent.map(r => ({
      txid:        r.txid,
      blockHeight: r.blockHeight,
      orderId:     r.orderId,
      amountsJson: r.amountsJson,
      indexedAt:   r.indexedAt,
    })),
  };
}
