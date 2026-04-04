/**
 * BSV Chain Monitor — OrahDEX
 *
 * Polls the WhatsOnChain public API every 60 s to retrieve the live
 * BSV mainnet block height, hash, difficulty, mempool stats and fee rates.
 * Persists data in platformSettingsTable so any route can read without re-fetching.
 *
 * WhatsOnChain public endpoints used (no API key required):
 *   GET https://api.whatsonchain.com/v1/bsv/main/chain/info
 *   GET https://api.whatsonchain.com/v1/bsv/main/mempool/info
 */

import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

const WOC_BASE       = "https://api.whatsonchain.com/v1/bsv/main";
const WOC_CHAIN_INFO = `${WOC_BASE}/chain/info`;
const WOC_MEMPOOL    = `${WOC_BASE}/mempool/info`;
const TIMEOUT_MS     = 10_000;

export interface BsvChainStatus {
  online: boolean;
  blockHeight: number;
  bestBlockHash: string;
  difficulty: number;
  medianTime: number;
  lastChecked: string;
  explorerUrl: string;
  /** Estimated network hashrate in EH/s (derived from difficulty) */
  hashrateEHs: number;
  /** Current mempool unconfirmed transaction count */
  mempoolTxCount: number;
  /** Current mempool size in bytes */
  mempoolBytes: number;
  /** Estimated fee rate in sat/byte (derived from mempool pressure) */
  feeRateSatPerByte: number;
  /** Approximate avg block time in seconds (always ~600 s on BSV) */
  avgBlockTimeSec: number;
  /** BSV/USD exchange rate from WhatsOnChain */
  bsvUsd: number;
}

async function setSetting(key: string, value: string) {
  await db.insert(platformSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function safeFetch(url: string): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "OrahDEX/1.0" } });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchChainInfo(): Promise<void> {
  let online = false;
  let blockHeight = 0;
  let bestBlockHash = "";
  let difficulty = 0;
  let medianTime = 0;
  let mempoolTxCount = 0;
  let mempoolBytes = 0;
  let bsvUsd = 0;

  // ── Chain info ──────────────────────────────────────────────────────────────
  const chainData = await safeFetch(WOC_CHAIN_INFO);
  if (chainData) {
    blockHeight   = (chainData["blocks"]       as number) || 0;
    bestBlockHash = (chainData["bestblockhash"] as string) || "";
    difficulty    = (chainData["difficulty"]   as number) || 0;
    medianTime    = (chainData["mediantime"]   as number) || 0;
    online        = blockHeight > 0;
    logger.info({ blockHeight, difficulty }, "BSV chain monitor: chain info updated");
  } else {
    logger.warn("BSV chain monitor: chain info fetch failed");
  }

  // ── Mempool info ────────────────────────────────────────────────────────────
  const mempoolData = await safeFetch(WOC_MEMPOOL);
  if (mempoolData) {
    const result = (mempoolData["result"] as Record<string, unknown>) ?? mempoolData;
    mempoolTxCount = (result["size"]  as number) || 0;
    mempoolBytes   = (result["bytes"] as number) || 0;
    logger.info({ mempoolTxCount, mempoolBytes }, "BSV chain monitor: mempool info updated");
  }

  // ── Exchange rate ───────────────────────────────────────────────────────────
  const rateData = await safeFetch(`${WOC_BASE}/exchangerate`);
  if (rateData) {
    bsvUsd = (rateData["rate"] as number) || 0;
  }

  // ── Derive fee rate from mempool pressure (sat/byte) ───────────────────────
  // BSV fees are typically 1 sat/byte base. Under mempool pressure they rise.
  // Estimate: 1 sat/byte baseline, +0.5 per 1 MB of mempool over 5 MB.
  const mempoolMB = mempoolBytes / 1_000_000;
  const feeRateSatPerByte = Math.max(1, Math.round(1 + Math.max(0, mempoolMB - 5) * 0.5));

  // ── Derive hashrate from difficulty ────────────────────────────────────────
  // hashrate (EH/s) = difficulty × 2^32 / 600 / 10^18
  const hashrateEHs = difficulty > 0
    ? parseFloat(((difficulty * 4294967296) / 600 / 1e18).toFixed(4))
    : 0;

  const now = new Date().toISOString();
  await setSetting("bsv_chain_online",       String(online));
  await setSetting("bsv_block_height",       String(blockHeight));
  await setSetting("bsv_best_block_hash",    bestBlockHash);
  await setSetting("bsv_difficulty",         String(difficulty));
  await setSetting("bsv_median_time",        String(medianTime));
  await setSetting("bsv_last_checked",       now);
  await setSetting("bsv_hashrate_ehs",       String(hashrateEHs));
  await setSetting("bsv_mempool_tx_count",   String(mempoolTxCount));
  await setSetting("bsv_mempool_bytes",      String(mempoolBytes));
  await setSetting("bsv_fee_rate_sat",       String(feeRateSatPerByte));
  await setSetting("bsv_usd",               String(bsvUsd));
}

export async function getBsvChainStatus(): Promise<BsvChainStatus> {
  const online           = (await getSetting("bsv_chain_online"))      === "true";
  const blockHeight      = parseInt((await getSetting("bsv_block_height"))    ?? "0") || 0;
  const bestBlockHash    = (await getSetting("bsv_best_block_hash"))   ?? "";
  const difficulty       = parseFloat((await getSetting("bsv_difficulty"))    ?? "0") || 0;
  const medianTime       = parseInt((await getSetting("bsv_median_time"))     ?? "0") || 0;
  const lastChecked      = (await getSetting("bsv_last_checked"))      ?? new Date().toISOString();
  const hashrateEHs      = parseFloat((await getSetting("bsv_hashrate_ehs"))  ?? "0") || 0;
  const mempoolTxCount   = parseInt((await getSetting("bsv_mempool_tx_count")) ?? "0") || 0;
  const mempoolBytes     = parseInt((await getSetting("bsv_mempool_bytes"))   ?? "0") || 0;
  const feeRateSatPerByte= parseInt((await getSetting("bsv_fee_rate_sat"))    ?? "1") || 1;
  const bsvUsd           = parseFloat((await getSetting("bsv_usd"))           ?? "0") || 0;

  return {
    online,
    blockHeight,
    bestBlockHash,
    difficulty,
    medianTime,
    lastChecked,
    explorerUrl: bestBlockHash
      ? `https://whatsonchain.com/block/${bestBlockHash}`
      : "https://whatsonchain.com",
    hashrateEHs,
    mempoolTxCount,
    mempoolBytes,
    feeRateSatPerByte,
    avgBlockTimeSec: 600,
    bsvUsd,
  };
}

export function startBsvChainMonitor(): void {
  logger.info("BSV chain monitor starting — polling WhatsOnChain every 60 s");
  let _busy = false;
  fetchChainInfo();
  setInterval(async () => {
    if (_busy) { logger.warn("BSV chain monitor: previous fetch still running, skipping"); return; }
    _busy = true;
    try { await fetchChainInfo(); }
    catch (err) { logger.warn({ err }, "BSV chain monitor tick error"); }
    finally { _busy = false; }
  }, 60_000);
}
