/**
 * candleFetcher.ts — Sovereign candle engine
 *
 * Priority order:
 *   1. Own trades table  →  aggregate into OHLCV candles (most authoritative)
 *   2. Binance public klines API (no key required) — for pairs Binance supports
 *   3. Synthetic fallback — generated from lastPrice when no trades exist yet
 *
 * CoinGecko and CoinMarketCap are NOT used.
 */

import { db } from "@workspace/db";
import { tradesTable } from "@workspace/db/schema";
import { gte, and, eq } from "drizzle-orm";
import { logger } from "./logger.js";

const BINANCE_USDT_PAIRS = new Set([
  "BTC","ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX","MATIC",
  "LINK","UNI","ATOM","LTC","BCH","TRX","ETC","NEAR","ICP","VET",
  "FIL","SAND","MANA","APT","ARB","OP","SUI","INJ","PEPE","SHIB",
  "MKR","AAVE","CRV","ENS","LDO","SUSHI","COMP","GRT","SNX","YFI",
  "RUNE","FTM","ALGO","XLM","HBAR","THETA","ZEC","DASH","CRO",
  "BONK","WIF","JUP","PYTH","JTO","ORCA","RAY","W",
  "FET","RNDR","TAO","WLD","GLM","STORJ","LPT",
  "AXS","ENJ","GALA","RON","CAKE","GMX","DYDX","PENDLE",
  "TON","KAS","SEI","TIA","KAVA","NEO","ZIL","WAVES","ICX",
  "OSMO","LUNA","LUNC","BAND","ONDO","OKB","KCS","BGB","ORDI",
  "KSM","TRUMP","STX","FLOKI","TURBO","EIGEN","ZRO","MNT",
  "STRK","IMX","METIS","AERO","BEAM","PRIME","PIXEL",
]);

const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "12h": 43200,
  "1d": 86400, "3d": 259200, "1w": 604800,
};

const BINANCE_INTERVAL_MAP: Record<string, string> = {
  "1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m",
  "1h":"1h","2h":"2h","4h":"4h","6h":"6h","12h":"12h",
  "1d":"1d","3d":"3d","1w":"1w",
};

interface Candle {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

/* ── In-memory candle cache — 5 min TTL ─────────────────────────────────────── */
interface CacheEntry { data: Candle[]; ts: number }
const candleCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 1 min — keeps last candle close fresh

function getCached(key: string): Candle[] | null {
  const e = candleCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) { candleCache.delete(key); return null; }
  return e.data;
}
function setCached(key: string, data: Candle[]) {
  if (candleCache.size >= 200) {
    const oldest = [...candleCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) candleCache.delete(oldest[0]);
  }
  candleCache.set(key, { data, ts: Date.now() });
}

/* ── 1. Own trades → OHLCV candles ──────────────────────────────────────────── */
async function buildCandlesFromOwnTrades(
  symbol: string,
  intervalSec: number,
  limit: number,
): Promise<Candle[]> {
  const lookback = intervalSec * limit;
  const since    = new Date(Date.now() - lookback * 1000);

  const rows = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.symbol, symbol),
        gte(tradesTable.timestamp, since),
      ),
    );

  if (!rows.length) return [];

  const buckets = new Map<number, { o: number; h: number; l: number; c: number; v: number }>();

  for (const row of rows) {
    const ts     = Math.floor(row.timestamp.getTime() / 1000);
    const bucket = Math.floor(ts / intervalSec) * intervalSec;
    const price  = parseFloat(row.price);
    const qty    = parseFloat(row.quantity);

    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, { o: price, h: price, l: price, c: price, v: qty });
    } else {
      existing.h = Math.max(existing.h, price);
      existing.l = Math.min(existing.l, price);
      existing.c = price;
      existing.v += qty;
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-limit)
    .map(([t, b]) => ({
      time: t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
    }));
}

/* ── 2. Binance public klines ─────────────────────────────────────────────────── */
async function fetchBinanceCandles(
  binanceSym: string,
  interval: string,
  limit: number,
): Promise<Candle[]> {
  const bInterval = BINANCE_INTERVAL_MAP[interval] || "1h";
  const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${bInterval}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Binance klines HTTP ${res.status}`);
  const data = await res.json() as number[][];
  return data.map(k => ({
    time:   Math.floor(k[0] / 1000),
    open:   parseFloat(k[1] as unknown as string),
    high:   parseFloat(k[2] as unknown as string),
    low:    parseFloat(k[3] as unknown as string),
    close:  parseFloat(k[4] as unknown as string),
    volume: parseFloat(k[5] as unknown as string),
  }));
}

/* ── 3. Synthetic fallback ─────────────────────────────────────────────────────── */
function generateFallbackCandles(lastPrice: number, interval: string, limit: number): Candle[] {
  const sec = INTERVAL_SECONDS[interval] || 3600;
  const now = Math.floor(Date.now() / 1000);
  let price = lastPrice * 0.95;
  const candles: Candle[] = [];
  for (let i = 0; i < limit; i++) {
    const open   = price;
    const change = (Math.random() - 0.48) * lastPrice * 0.005;
    const close  = Math.max(open + change, 0.00000001);
    const wicks  = Math.abs(change) * 0.3;
    candles.push({
      time:   now - sec * (limit - i),
      open,
      high:   Math.max(open, close) + wicks,
      low:    Math.min(open, close) - wicks,
      close,
      volume: Math.random() * 10000 + 500,
    });
    price = close;
  }
  if (candles.length) candles[candles.length - 1].close = lastPrice;
  return candles;
}

/* ── Pin the last candle's close to the live price ──────────────────────────── */
function pinLastCandle(candles: Candle[], lastPrice: number): Candle[] {
  if (!candles.length || !(lastPrice > 0)) return candles;
  const last = candles[candles.length - 1];
  candles[candles.length - 1] = {
    ...last,
    close: lastPrice,
    high:  Math.max(last.high, lastPrice),
    low:   Math.min(last.low,  lastPrice),
  };
  return candles;
}

/* ── Main export ───────────────────────────────────────────────────────────────── */
export async function fetchRealCandles(
  symbol: string,
  lastPrice: number,
  interval: string,
  limit: number,
): Promise<Candle[]> {
  const cacheKey = `${symbol}:${interval}:${limit}`;
  const cached   = getCached(cacheKey);
  // Return cached but always re-pin the last candle to the live price
  if (cached) return pinLastCandle([...cached.slice(0, -1), { ...cached[cached.length - 1] }], lastPrice);

  // ── 1. Own trades (sovereign source of truth) ──────────────────────────────
  try {
    const intervalSec = INTERVAL_SECONDS[interval] || 3600;
    const ownCandles  = await buildCandlesFromOwnTrades(symbol, intervalSec, limit);
    if (ownCandles.length >= Math.min(3, limit)) {
      setCached(cacheKey, ownCandles);
      return pinLastCandle(ownCandles, lastPrice);
    }
  } catch (err) {
    logger.warn({ err, symbol }, "Own-trades candle build failed");
  }

  // ── 2. Binance public klines (no key, reference feed for major pairs) ──────
  const parts     = symbol.split("/");
  const base      = parts[0]?.toUpperCase();
  const quote     = parts[1]?.toUpperCase();
  const isUsdtPair = quote === "USDT" && base && BINANCE_USDT_PAIRS.has(base);

  if (isUsdtPair) {
    const binanceSym = `${base}USDT`;
    try {
      const candles = await fetchBinanceCandles(binanceSym, interval, limit);
      setCached(cacheKey, candles);
      return pinLastCandle(candles, lastPrice);
    } catch (err) {
      logger.warn({ err, symbol }, "Binance candle fetch failed — using synthetic");
    }
  }

  // ── 3. Synthetic fallback ───────────────────────────────────────────────────
  const candles = generateFallbackCandles(lastPrice, interval, limit);
  setCached(cacheKey, candles);
  return pinLastCandle(candles, lastPrice);
}
