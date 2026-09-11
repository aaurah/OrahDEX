/**
 * hyperliquid.ts — Hyperliquid API client (read-only, no auth needed)
 *
 * Fetches live perpetual market data from Hyperliquid L1:
 *   - Mark prices, oracle (index) prices
 *   - Funding rates (real, 8-hourly)
 *   - Open interest, 24h volume
 *
 * All results are module-level cached for 60 seconds to avoid hammering the API.
 * Hyperliquid API: POST https://api.hyperliquid.xyz/info
 */

import { logger } from "./logger.js";
import { getHlWsMids, getHlWsMid, isHlWsConnected } from "./hyperliquidWs.js";

const HL_URL   = "https://api.hyperliquid.xyz/info";
const CACHE_TTL = 60_000;  // 60 seconds

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HlMarket {
  coin:          string;    // e.g. "BTC"
  symbol:        string;    // e.g. "BTC/USDT-PERP"
  markPrice:     number;
  oraclePrice:   number;    // HL's "oracle" = index price
  fundingRate:   number;    // 8h rate as decimal (e.g. 0.0001)
  openInterest:  number;    // in USD
  volume24h:     number;    // in USD
  premium:       number;    // (mark - oracle) / oracle
  maxLeverage:   number;
}

export interface HlMids {
  [coin: string]: number;   // mid price per coin
}

// ── Cache state ───────────────────────────────────────────────────────────────

let marketsCache: { data: HlMarket[]; ts: number } | null = null;
let midsCache:    { data: HlMids;    ts: number } | null = null;

// Prevent multiple simultaneous fetches (stampede guard)
let marketsFetch: Promise<HlMarket[]> | null = null;
let midsFetch:    Promise<HlMids>    | null = null;

// ── Core fetch helper ─────────────────────────────────────────────────────────

async function hlPost(body: object): Promise<unknown> {
  const resp = await fetch(HL_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`Hyperliquid API ${resp.status}`);
  return resp.json();
}

// ── Markets (metaAndAssetCtxs) ────────────────────────────────────────────────

/**
 * Returns all Hyperliquid perpetual markets with live mark price, funding,
 * open interest, and volume. Results cached 60 s.
 */
export async function fetchHlMarkets(): Promise<HlMarket[]> {
  if (marketsCache && Date.now() - marketsCache.ts < CACHE_TTL) {
    return marketsCache.data;
  }

  if (marketsFetch) return marketsFetch;

  marketsFetch = (async (): Promise<HlMarket[]> => {
    try {
      const raw = await hlPost({ type: "metaAndAssetCtxs" }) as [unknown, unknown[]];
      const [meta, ctxs] = raw;

      const coins: string[] = ((meta as any).universe ?? []).map((u: any) => String(u.name ?? ""));
      const maxLevs: number[] = ((meta as any).universe ?? []).map((u: any) => Number(u.maxLeverage ?? 100));

      const markets: HlMarket[] = [];
      for (let i = 0; i < coins.length; i++) {
        const coin = coins[i];
        const ctx  = (ctxs[i] ?? {}) as Record<string, unknown>;
        if (!coin) continue;

        const mark   = parseFloat(String(ctx.markPx   ?? ctx.markPrice   ?? "0")) || 0;
        const oracle = parseFloat(String(ctx.oraclePx  ?? ctx.oraclePrice ?? "0")) || 0;
        const fundRaw = parseFloat(String(ctx.funding   ?? "0")) || 0;
        // HL returns funding as 8h rate, already in decimal form
        const funding = Math.abs(fundRaw) > 1 ? fundRaw / 10000 : fundRaw;

        // openInterest is in base-asset units — convert to USD
        const oiRaw  = parseFloat(String(ctx.openInterest ?? "0")) || 0;
        const oi24h  = oiRaw * (mark > 0 ? mark : oracle);
        const vol24h = parseFloat(String(ctx.dayNtlVlm    ?? ctx.volume24h ?? "0")) || 0;
        const premium = oracle > 0 ? (mark - oracle) / oracle : 0;

        markets.push({
          coin,
          symbol:       `${coin}/USDT-PERP`,
          markPrice:    mark,
          oraclePrice:  oracle,
          fundingRate:  funding,
          openInterest: oi24h,
          volume24h:    vol24h,
          premium,
          maxLeverage:  maxLevs[i] ?? 100,
        });
      }

      marketsCache = { data: markets, ts: Date.now() };
      logger.info({ count: markets.length }, "hyperliquid: markets refreshed");
      return markets;
    } catch (err: any) {
      logger.warn({ err: err?.message }, "hyperliquid: fetchHlMarkets failed");
      return marketsCache?.data ?? [];
    } finally {
      marketsFetch = null;
    }
  })();

  return marketsFetch;
}

/**
 * Returns a map of coin → mark price for quick lookup.
 * Prefers real-time WS prices when the feed is live; REST fallback otherwise.
 */
export async function getHlMarkPrices(): Promise<Record<string, number>> {
  try {
    // Fast path: WS feed is live — return all coin prices with no HTTP call
    if (isHlWsConnected()) {
      const wsMids = getHlWsMids();
      if (wsMids.size > 100) {
        const out: Record<string, number> = {};
        for (const [coin, px] of wsMids) out[coin] = px;
        return out;
      }
    }
    // Slow path: REST
    const markets = await fetchHlMarkets();
    const out: Record<string, number> = {};
    for (const m of markets) if (m.markPrice > 0) out[m.coin] = m.markPrice;
    return out;
  } catch {
    return {};
  }
}

// ── All mids ──────────────────────────────────────────────────────────────────

/**
 * Returns current mid prices for all HL assets.
 * Returns real-time WS prices instantly when the feed is live;
 * falls back to cached REST data otherwise.
 */
export async function fetchHlAllMids(): Promise<HlMids> {
  // Fast path: WS feed has live data — zero latency, no HTTP
  if (isHlWsConnected()) {
    const wsMids = getHlWsMids();
    if (wsMids.size > 100) {
      const out: HlMids = {};
      for (const [coin, px] of wsMids) out[coin] = px;
      return out;
    }
  }

  // Slow path: REST with 60 s cache
  if (midsCache && Date.now() - midsCache.ts < CACHE_TTL) return midsCache.data;
  if (midsFetch) return midsFetch;

  midsFetch = (async (): Promise<HlMids> => {
    try {
      const raw = await hlPost({ type: "allMids" }) as Record<string, string>;
      const out: HlMids = {};
      for (const [coin, px] of Object.entries(raw)) {
        const p = parseFloat(px);
        if (isFinite(p) && p > 0) out[coin] = p;
      }
      midsCache = { data: out, ts: Date.now() };
      return out;
    } catch (err: any) {
      logger.warn({ err: err?.message }, "hyperliquid: fetchHlAllMids failed");
      return midsCache?.data ?? {};
    } finally {
      midsFetch = null;
    }
  })();

  return midsFetch;
}

/**
 * Returns the top N markets sorted by open interest descending.
 * Useful for injecting context into the AI prompt.
 */
export async function getTopHlMarkets(n = 10): Promise<HlMarket[]> {
  try {
    const all = await fetchHlMarkets();
    return [...all]
      .sort((a, b) => b.openInterest - a.openInterest)
      .slice(0, n);
  } catch {
    return [];
  }
}

/** Invalidate both caches (useful for testing / forced refresh). */
export function invalidateHlCache(): void {
  marketsCache = null;
  midsCache    = null;
}
