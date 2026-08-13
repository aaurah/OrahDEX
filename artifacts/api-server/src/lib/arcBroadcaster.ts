/**
 * arcBroadcaster.ts — OrahDEX
 *
 * Wraps TAAL's ARC (Authorisation and Resource Control) broadcaster.
 * All BSV transaction broadcasts attempt ARC first; on failure (non-2xx, timeout,
 * network error) the call falls back to WhatsOnChain /tx/raw automatically.
 *
 * ARC API reference: https://arc.taal.com/api
 *   POST /v1/tx          — submit raw transaction
 *   GET  /v1/tx/{txid}   — poll status
 *
 * Env vars:
 *   ARC_API_URL   — base URL (default: https://arc.taal.com)
 *   ARC_API_KEY   — Bearer token; if absent, auth header is omitted (testnet / open endpoint)
 *
 * ARC response status codes (txStatus field):
 *   QUEUED              — received, queued for processing
 *   SEEN_ON_NETWORK     — propagated to the BSV network
 *   MINED               — included in a block
 *   DOUBLE_SPEND_ATTEMPTED — conflicting tx detected
 *   REJECTED            — node rejected the transaction
 */

import { logger } from "./logger.js";
import { BSV_NET } from "./bsvNetworkConfig.js";

const ARC_BASE_URL = (process.env.ARC_API_URL ?? "https://arc.taal.com").replace(/\/$/, "");
const ARC_API_KEY  = process.env.ARC_API_KEY ?? "";

export interface ArcBroadcastResult {
  txid:      string;
  arcTxid:   string | null;
  arcStatus: string | null;
  usedArc:   boolean;
  error?:    string;
}

/** ARC raw-tx submission response */
interface ArcTxResponse {
  txid?:      string;
  txStatus?:  string;
  title?:     string;
  detail?:    string;
  status?:    number;
  [k: string]: unknown;
}

/** ARC polling response */
export interface ArcStatusResponse {
  txid:      string;
  txStatus:  string;
  blockHash?: string;
  blockHeight?: number;
  timestamp?: string;
}

function arcHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept":       "application/json",
    "User-Agent":   "OrahDEX/1.0",
  };
  if (ARC_API_KEY) h["Authorization"] = `Bearer ${ARC_API_KEY}`;
  return h;
}

/**
 * Broadcast a raw BSV transaction via ARC with automatic WoC fallback.
 *
 * Returns:
 *   usedArc = true  — ARC accepted the tx; arcTxid and arcStatus are populated
 *   usedArc = false — ARC failed; WoC was used instead; arcTxid/arcStatus are null
 */
export async function arcBroadcast(rawTxHex: string): Promise<ArcBroadcastResult> {
  let arcErr = "";
  try {
    const res = await fetch(`${ARC_BASE_URL}/v1/tx`, {
      method:  "POST",
      headers: arcHeaders(),
      body:    JSON.stringify({ rawTx: rawTxHex }),
      signal:  AbortSignal.timeout(20_000),
    });

    const body = await res.json().catch(() => null) as ArcTxResponse | null;

    if (res.ok && body?.txid) {
      const arcTxid   = body.txid;
      const arcStatus = body.txStatus ?? "SEEN_ON_NETWORK";
      logger.info({ arcTxid, arcStatus }, "ARC broadcast SUCCESS");
      return { txid: arcTxid, arcTxid, arcStatus, usedArc: true };
    }

    arcErr = `ARC HTTP ${res.status}: ${body?.detail ?? body?.title ?? "unknown"}`;
    logger.warn({ status: res.status, body }, "ARC broadcast rejected — falling back to WoC");
  } catch (err) {
    arcErr = err instanceof Error ? err.message : String(err);
    logger.warn({ err: arcErr }, "ARC broadcast network error — falling back to WoC");
  }

  return wocFallback(rawTxHex, arcErr);
}

async function wocFallback(rawTxHex: string, arcErr: string): Promise<ArcBroadcastResult> {
  const res = await fetch(BSV_NET.wocBroadcast, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "OrahDEX/1.0" },
    body:    JSON.stringify({ txhex: rawTxHex }),
    signal:  AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ARC failed (${arcErr}) and WoC fallback also failed (HTTP ${res.status}): ${text}`);
  }

  const txid = text.replace(/"/g, "").trim();
  logger.info({ txid, arcErr }, "WoC fallback broadcast SUCCESS");
  return { txid, arcTxid: null, arcStatus: null, usedArc: false };
}

/**
 * Poll ARC for the current status of a previously submitted transaction.
 * Returns null if ARC_API_URL is not configured or the request fails.
 */
export async function pollArcStatus(txid: string): Promise<ArcStatusResponse | null> {
  try {
    const res = await fetch(`${ARC_BASE_URL}/v1/tx/${txid}`, {
      headers: arcHeaders(),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = await res.json() as ArcStatusResponse;
    if (!body?.txid) return null;
    return body;
  } catch {
    return null;
  }
}
