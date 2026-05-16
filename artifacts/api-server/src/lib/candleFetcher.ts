/**
 * candleFetcher.ts — Sovereign candle engine
 *
 * Priority order:
 *   1. Own trades table  →  aggregate into OHLCV candles (most authoritative)
 *   2. Binance public klines API (no key required) — for pairs Binance supports
 *   2b. Gate.io public candles API (no key required) — for BSV and other non-Binance pairs
 *   3. Synthetic fallback — generated from lastPrice when no trades exist yet
 *
 * CoinGecko and CoinMarketCap are NOT used.
 */

import { db } from "@workspace/db";
import { tradesTable } from "@workspace/db/schema";
import { gte, and, eq } from "drizzle-orm";
import { logger } from "./logger.js";

/* ── Asset inception timestamps (Unix seconds) ─────────────────────────────
   Synthetic candle series will not extend before the asset existed.         */
const ASSET_INCEPTION: Record<string, number> = {
  "BTC":  1231006505, "LTC":  1317513600, "XRP":  1356998400,
  "DOGE": 1388534400, "ETH":  1438300800, "ETC":  1469404800,
  "ZEC":  1477929600, "BNB":  1503014400, "BCH":  1501545600,
  "ADA":  1506643200, "XLM":  1404172800, "TRX":  1504224000,
  "VET":  1533081600, "BSV":  1542240000, "LINK": 1503619200,
  "ATOM": 1552953600, "MATIC":1557273600, "SOL":  1568502000,
  "DOT":  1594684800, "AVAX": 1597622400, "UNI":  1600473600,
  "AAVE": 1601856000, "SHIB": 1619222400, "MANA": 1511136000,
  "SAND": 1575504000, "APE":  1645574400, "ARB":  1678924800,
  "OP":   1655251200, "SUI":  1683072000, "PEPE": 1681948800,
  "WIF":  1702944000, "BONK": 1672531200,
};
const CRYPTO_FLOOR_TS = 1483228800; // Jan 1 2017 — safe floor for unknown assets

function getInceptionTs(symbol: string): number {
  const base = symbol.split(/[-_/]/)[0]?.toUpperCase() ?? "";
  return ASSET_INCEPTION[base] ?? CRYPTO_FLOOR_TS;
}

const BINANCE_USDT_PAIRS = new Set([
  "BTC","ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX","MATIC",
  "LINK","UNI","ATOM","LTC","BCH","TRX","ETC","NEAR","ICP","VET",
  "FIL","SAND","MANA","APT","ARB","OP","SUI","INJ","PEPE","SHIB",
  "MKR","AAVE","CRV","ENS","LDO","SUSHI","COMP","GRT","SNX","YFI",
  "RUNE","FTM","ALGO","XLM","HBAR","THETA","ZEC","DASH","CRO",
  "BONK","WIF","JUP","PYTH","JTO","ORCA","RAY","W",
  "FET","RNDR","TAO","WLD","GLM","STORJ","LPT",
  "APE","AXS","ENJ","GALA","RON","CAKE","GMX","DYDX","PENDLE",
  "TON","KAS","SEI","TIA","KAVA","NEO","ZIL","WAVES","ICX",
  "OSMO","LUNA","LUNC","BAND","ONDO","OKB","KCS","BGB","ORDI",
  "KSM","TRUMP","STX","FLOKI","TURBO","EIGEN","ZRO","MNT",
  "STRK","IMX","METIS","AERO","BEAM","PRIME","PIXEL",
]);

const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "12h": 43200,
  "1d": 86400, "3d": 259200, "1w": 604800, "1M": 2592000,
};

const BINANCE_INTERVAL_MAP: Record<string, string> = {
  "1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m",
  "1h":"1h","2h":"2h","4h":"4h","6h":"6h","12h":"12h",
  "1d":"1d","3d":"3d","1w":"1w","1M":"1M",
};

/* ── Poloniex symbol overrides — coins listed under a different ticker ────────
   BSV trades as BCHSV on Poloniex. Add others here if needed.              */
const POLONIEX_SYMBOL_MAP: Record<string, string> = {
  "BSV": "BCHSV",
};

/* Poloniex interval strings (covers every interval we use) */
const POLONIEX_INTERVAL_MAP: Record<string, string> = {
  "1m":"MINUTE_1","3m":"MINUTE_5","5m":"MINUTE_5","15m":"MINUTE_15",
  "30m":"MINUTE_30","1h":"HOUR_1","2h":"HOUR_2","4h":"HOUR_4",
  "6h":"HOUR_6","12h":"HOUR_12","1d":"DAY_1","3d":"DAY_3",
  "1w":"WEEK_1","1M":"MONTH_1",
};

/* Gate.io interval strings (fallback for coins not on Poloniex) */
const GATE_INTERVAL_MAP: Record<string, string> = {
  "1m":"1m","3m":"5m","5m":"5m","15m":"15m","30m":"30m",
  "1h":"1h","2h":"4h","4h":"4h","6h":"8h","12h":"1d",
  "1d":"1d","3d":"1d","1w":"7d","1M":"30d",
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

/* ── 2b. Poloniex public candles ──────────────────────────────────────────────────
   Poloniex lists BSV as "BCHSV". Use this for any coin in POLONIEX_SYMBOL_MAP
   that Binance no longer supports.                                               */
async function fetchPoloniexCandles(
  poloniexSym: string,
  interval:    string,
  limit:       number,
): Promise<Candle[]> {
  const pInterval = POLONIEX_INTERVAL_MAP[interval] || "HOUR_1";
  // Poloniex max is 500 candles per request
  const clampedLimit = Math.min(limit, 500);
  const url = `https://api.poloniex.com/markets/${poloniexSym}_USDT/candles?interval=${pInterval}&limit=${clampedLimit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Poloniex candles HTTP ${res.status}`);
  const data = await res.json() as string[][];
  // Format: [low, high, open, close, amount, qty, buyTakerAmt, buyTakerQty, tradeCount, ts_ms, ...]
  return data
    .filter(k => k.length >= 10 && Number(k[9]) > 0)
    .map(k => ({
      time:   Math.floor(Number(k[9]) / 1000),
      open:   parseFloat(k[2]),
      high:   parseFloat(k[1]),
      low:    parseFloat(k[0]),
      close:  parseFloat(k[3]),
      volume: parseFloat(k[5]),
    }))
    .sort((a, b) => a.time - b.time);
}

/* ── 2c. Gate.io public candles — secondary fallback for non-Binance pairs ────── */
async function fetchGateCandles(
  gateSym:  string,
  interval: string,
  limit:    number,
): Promise<Candle[]> {
  const gInterval = GATE_INTERVAL_MAP[interval] || "1h";
  const url = `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${gateSym}_USDT&interval=${gInterval}&limit=${Math.min(limit, 1000)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Gate.io candles HTTP ${res.status}`);
  const data = await res.json() as string[][];
  // Format: [ts_sec, quote_vol, close, high, low, open, base_vol, closed]
  return data
    .filter(k => k.length >= 6)
    .map(k => ({
      time:   Number(k[0]),
      open:   parseFloat(k[5]),
      high:   parseFloat(k[3]),
      low:    parseFloat(k[4]),
      close:  parseFloat(k[2]),
      volume: parseFloat(k[6]),
    }))
    .sort((a, b) => a.time - b.time);
}

/* ── 3. Synthetic fallback — proper random walk ────────────────────────────────── */
/**
 * LCG seeded PRNG — deterministic per (symbol + time-bucket) so the series
 * looks stable between requests that hit the same 60-second window.
 */
function makeRng(seed: number) {
  let s = (seed | 0) >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Interval-scaled per-candle volatility (log-normal).
 * Approximated from ~80% annualised vol → scaled by √(intervalSec / 1 year in sec).
 */
function intervalVol(sec: number): number {
  const annualVol = 0.80;
  const secsPerYear = 365 * 24 * 3600;
  return annualVol * Math.sqrt(sec / secsPerYear);
}

function generateFallbackCandles(lastPrice: number, interval: string, limit: number, inceptionTs: number = CRYPTO_FLOOR_TS): Candle[] {
  const sec   = INTERVAL_SECONDS[interval] || 3600;
  const now   = Math.floor(Date.now() / 1000);
  const vol   = intervalVol(sec);

  // Clamp limit so candles never extend before the asset's inception date.
  const maxCandles  = Math.max(1, Math.floor((now - inceptionTs) / sec));
  const actualLimit = Math.min(limit, maxCandles);

  // Use a seeded RNG so repeated calls within the same 60s window return the same series.
  const timeBucket = Math.floor(now / 60);
  const rng = makeRng(timeBucket ^ (lastPrice * 1000 | 0));

  // Walk BACKWARD from lastPrice using pure GBM (no drift).
  const logCloses = new Array<number>(actualLimit);
  logCloses[actualLimit - 1] = Math.log(Math.max(lastPrice, 1e-12));

  for (let i = actualLimit - 2; i >= 0; i--) {
    const shock  = (rng() * 2 - 1) * vol;
    logCloses[i] = logCloses[i + 1] + shock;
  }

  const candles: Candle[] = [];
  for (let i = 0; i < actualLimit; i++) {
    const close = Math.exp(logCloses[i]);
    const open  = i === 0
      ? close * Math.exp((rng() - 0.5) * vol * 0.5)
      : Math.exp(logCloses[i - 1]);

    const body    = Math.abs(close - open);
    const minWick = close * 0.0008;
    const hiWick  = Math.max(body * (0.4 + rng() * 1.2), minWick);
    const loWick  = Math.max(body * (0.4 + rng() * 1.2), minWick);
    const high    = Math.max(open, close) + hiWick;
    const low     = Math.min(open, close) - loWick;

    const medianVol = 500 * (sec / 3600);
    const volume    = Math.exp(Math.log(medianVol) + (rng() - 0.5) * 1.2);

    candles.push({ time: now - sec * (actualLimit - i), open, high, low, close, volume });
  }
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

  // ── 2b. Poloniex (for coins with a different ticker, e.g. BSV → BCHSV) ─────
  if (base && quote === "USDT" && POLONIEX_SYMBOL_MAP[base]) {
    const poloniexSym = POLONIEX_SYMBOL_MAP[base]!;
    try {
      const candles = await fetchPoloniexCandles(poloniexSym, interval, limit);
      if (candles.length >= Math.min(3, limit)) {
        setCached(cacheKey, candles);
        return pinLastCandle(candles, lastPrice);
      }
    } catch (err) {
      logger.warn({ err, symbol }, "Poloniex candle fetch failed — trying Gate.io");
    }
  }

  // ── 2c. Gate.io (secondary real-data fallback for non-Binance USDT pairs) ──
  if (base && quote === "USDT" && !BINANCE_USDT_PAIRS.has(base)) {
    try {
      const candles = await fetchGateCandles(base, interval, limit);
      if (candles.length >= Math.min(3, limit)) {
        setCached(cacheKey, candles);
        return pinLastCandle(candles, lastPrice);
      }
    } catch (err) {
      logger.warn({ err, symbol }, "Gate.io candle fetch failed — using synthetic");
    }
  }

  // ── 3. Synthetic fallback ───────────────────────────────────────────────────
  const inception = getInceptionTs(symbol);
  const candles = generateFallbackCandles(lastPrice, interval, limit, inception);
  setCached(cacheKey, candles);
  return pinLastCandle(candles, lastPrice);
}
