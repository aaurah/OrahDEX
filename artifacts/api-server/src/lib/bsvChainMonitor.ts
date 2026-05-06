/**
 * BSV Chain Monitor — OrahDEX
 *
 * Polls the WhatsOnChain public API every 60 s to retrieve the live
 * BSV block height, hash, difficulty, mempool stats and fee rates.
 * Network (main/test) is determined by BSV_NET from bsvNetworkConfig.ts.
 * Persists data in platformSettingsTable so any route can read without re-fetching.
 *
 * WhatsOnChain public endpoints used (no API key required):
 *   GET ${BSV_NET.wocBase}/chain/info
 *   GET ${BSV_NET.wocBase}/mempool/info
 */

import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { BSV_NET } from "./bsvNetworkConfig.js";

const WOC_BASE       = BSV_NET.wocBase;
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
      ? `${BSV_NET.explorer}/block/${bestBlockHash}`
      : BSV_NET.explorer,
    hashrateEHs,
    mempoolTxCount,
    mempoolBytes,
    feeRateSatPerByte,
    avgBlockTimeSec: 600,
    bsvUsd,
  };
}

// ── HTLC On-Chain Status Watcher ─────────────────────────────────────────────

export type HtlcStatus = "LOCKED" | "CLAIMED" | "REFUNDED" | "EXPIRED" | "UNKNOWN";

export interface HtlcStatusResult {
  /** Current on-chain status of the HTLC output */
  status:       HtlcStatus;
  /** Spending txid — set when the output has been spent (CLAIMED or REFUNDED) */
  spendTxid?:   string;
  /** Current block height at time of check */
  blockHeight:  number;
  /** ISO timestamp of this check */
  checkedAt:    string;
}

/**
 * Query the on-chain status of an HTLC P2SH output via WhatsOnChain.
 *
 * Status logic:
 *   LOCKED   — address has unspent UTXOs and locktime has not yet passed
 *   EXPIRED  — address has unspent UTXOs but blockHeight ≥ locktimeBlocks
 *   CLAIMED  — address UTXOs were spent before locktimeBlocks (relayer used secret)
 *   REFUNDED — address UTXOs were spent at or after locktimeBlocks (user reclaimed)
 *   UNKNOWN  — address has no transaction history (unfunded) or API unreachable
 *
 * @param htlcAddress    BSV P2SH address of the HTLC output
 * @param locktimeBlocks Absolute block height of the HTLC refund locktime
 */
export async function queryHtlcStatus(
  htlcAddress: string,
  locktimeBlocks: number,
): Promise<HtlcStatusResult> {
  const checkedAt    = new Date().toISOString();
  const blockHeight  = parseInt((await getSetting("bsv_block_height")) ?? "0") || 0;

  // Validate that htlcAddress is a legitimate BSV P2SH/P2PKH address to prevent SSRF
  if (!/^[1-9A-HJ-NP-Za-km-z]{26,35}$/.test(htlcAddress)) {
    return { status: "UNKNOWN", blockHeight, checkedAt };
  }

  try {
    // Check unspent UTXOs at the P2SH address
    const utxoData = await safeFetch(`${WOC_BASE}/address/${htlcAddress}/unspent`);
    const hasUtxos = Array.isArray(utxoData) && utxoData.length > 0;

    if (hasUtxos) {
      // UTXO still exists — LOCKED or EXPIRED depending on block height
      const status: HtlcStatus = blockHeight > 0 && blockHeight >= locktimeBlocks
        ? "EXPIRED"
        : "LOCKED";
      return { status, blockHeight, checkedAt };
    }

    // No UTXOs — check transaction history to detect claim vs refund
    const histData = await safeFetch(`${WOC_BASE}/address/${htlcAddress}/history`);
    if (!Array.isArray(histData) || histData.length === 0) {
      return { status: "UNKNOWN", blockHeight, checkedAt };
    }

    // Use the most recent transaction as the spend transaction
    const lastTx      = histData[histData.length - 1] as Record<string, unknown>;
    const spendTxid   = (lastTx["tx_hash"] as string) ?? undefined;
    const spendHeight = (lastTx["height"]  as number) ?? 0;

    // If the spending tx was confirmed before the locktime it's a claim (secret reveal).
    // If at or after locktime it's a refund (CLTV expiry path).
    const status: HtlcStatus =
      spendHeight > 0 && spendHeight < locktimeBlocks ? "CLAIMED" : "REFUNDED";

    return { status, spendTxid, blockHeight, checkedAt };
  } catch {
    return { status: "UNKNOWN", blockHeight, checkedAt };
  }
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
