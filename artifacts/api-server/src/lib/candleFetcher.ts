/**
 * candleFetcher.ts — Sovereign candle engine
 *
 * Priority order:
 *   1. Own executed trades → OHLCV candles (most authoritative)
 *   2. OrahDEX escrow-backed order-book snapshots → quote candles with zero volume
 *   3. Public market OHLC feeds → reference history where local data is absent
 *   4. No history → unsupported pairs remain empty rather than inventing movement
 */

import { db, pool } from "@workspace/db";
import { tradesTable } from "@workspace/db/schema";
import { gte, and, eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { getCoinGeckoApiKey, resolveCoinGeckoId } from "./priceUpdater.js";

const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "12h": 43200,
  "1d": 86400, "3d": 259200, "1w": 604800, "1M": 2592000,
};

/* ── OKX interval map ─────────────────────────────────────────────────────── */
const OKX_INTERVAL_MAP: Record<string, string> = {
  "1m":  "1m",  "3m":  "3m",  "5m":  "5m",
  "15m": "15m", "30m": "30m",
  "1h":  "1H",  "2h":  "2H",  "4h":  "4H",
  "6h":  "6H",  "12h": "12H",
  "1d":  "1D",  "3d":  "3D",  "1w":  "1W",  "1M":  "1M",
};

/* ── Binance interval map ─────────────────────────────────────────────────── */
const BINANCE_INTERVAL_MAP: Record<string, string> = {
  "1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m",
  "1h":"1h","2h":"2h","4h":"4h","6h":"6h","12h":"12h",
  "1d":"1d","3d":"3d","1w":"1w","1M":"1M",
};

/* ── Binance USDT pair list — try Binance for these, fall to OKX if blocked ─ */
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
  "OSMO","LUNA","LUNC","BAND","ONDO","OKB","KCS","ORDI",
  "KSM","TRUMP","STX","FLOKI","TURBO","EIGEN","ZRO","MNT",
  "STRK","IMX","METIS","AERO","BEAM","PRIME","PIXEL",
]);

/* ── Tokens not listed on OKX — skip straight to Binance/Gate.io ───────────
   OKX returns "Instrument ID doesn't exist" for these, generating noisy warn
   logs and an unnecessary extra RTT on every candle request.               ── */
const OKX_SKIP_PAIRS = new Set(["BSV", "BB", "BGB"]);

/* ── Poloniex symbol overrides (BSV → BCHSV etc.) ─────────────────────────── */
const POLONIEX_SYMBOL_MAP: Record<string, string> = {
  "BSV": "BCHSV",
};

const POLONIEX_INTERVAL_MAP: Record<string, string> = {
  "1m":"MINUTE_1","3m":"MINUTE_5","5m":"MINUTE_5","15m":"MINUTE_15",
  "30m":"MINUTE_30","1h":"HOUR_1","2h":"HOUR_2","4h":"HOUR_4",
  "6h":"HOUR_6","12h":"HOUR_12","1d":"DAY_1","3d":"DAY_3",
  "1w":"WEEK_1","1M":"MONTH_1",
};

/* ── Gate.io interval map ─────────────────────────────────────────────────── */
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

/* ── In-memory candle cache — 1 min TTL ─────────────────────────────────────── */
interface CacheEntry { data: Candle[]; ts: number }
const candleCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;
const STALE_CANDLE_TTL_MS = 24 * 60 * 60 * 1000;
const COINGECKO_OHLC_TTL_MS = 5 * 60 * 1000;
const coingeckoOhlcCache = new Map<string, { data: Candle[]; ts: number }>();
const coingeckoOhlcPending = new Map<string, Promise<Candle[]>>();
let coingeckoBackoffUntil = 0;
const candleSourceCache = new Map<string, string>();
const candleRefreshBackoff = new Map<string, number>();

const COINGECKO_VS_CURRENCY: Record<string, string> = {
  USD: "usd", USDT: "usd", USDC: "usd", TUSD: "usd", USDD: "usd",
  BUSD: "usd", DAI: "usd", FDUSD: "usd",
  ETH: "eth", WETH: "eth",
  BTC: "btc", WBTC: "btc",
  BNB: "bnb",
  SOL: "sol",
};

async function fetchCoinGeckoOhlc(
  coinId: string,
  vsCurrency: string,
  days: "1" | "30" | "365",
): Promise<Candle[]> {
  const cacheKey = `${coinId}:${vsCurrency}:${days}`;
  const cached = coingeckoOhlcCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < COINGECKO_OHLC_TTL_MS) return cached.data;
  if (Date.now() < coingeckoBackoffUntil) return [];

  const pending = coingeckoOhlcPending.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const apiKey = await getCoinGeckoApiKey();
    const usePro = Boolean(apiKey && !apiKey.startsWith("CG-"));
    const apiBase = usePro
      ? "https://pro-api.coingecko.com/api/v3"
      : "https://api.coingecko.com/api/v3";
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) {
      headers[apiKey.startsWith("CG-") ? "x-cg-demo-api-key" : "x-cg-pro-api-key"] = apiKey;
    }

    const url = `${apiBase}/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=${encodeURIComponent(vsCurrency)}&days=${days}`;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get("Retry-After"));
      coingeckoBackoffUntil = Date.now() + Math.max(60_000, Math.min(300_000, retryAfterSeconds * 1000 || 60_000));
      throw new Error("CoinGecko OHLC rate limit reached");
    }
    if (!response.ok) throw new Error(`CoinGecko OHLC HTTP ${response.status}`);
    const raw = await response.json() as number[][];
    if (!Array.isArray(raw)) throw new Error("CoinGecko OHLC response was not an array");

    const candles = raw
      .filter((row) => Array.isArray(row) && row.length >= 5)
      .map(([timeMs, open, high, low, close]) => ({
        time: Math.floor(Number(timeMs) / 1000),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: 0,
      }))
      .filter((c) =>
        Number.isFinite(c.time) &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close) &&
        c.time > 0 &&
        Math.min(c.open, c.high, c.low, c.close) > 0 &&
        c.high >= Math.max(c.open, c.close) &&
        c.low <= Math.min(c.open, c.close),
      )
      .sort((a, b) => a.time - b.time)
      .filter((c, i, all) => i === 0 || c.time !== all[i - 1]!.time);

    if (candles.length) {
      if (coingeckoOhlcCache.size >= 200) {
        const oldest = [...coingeckoOhlcCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
        if (oldest) coingeckoOhlcCache.delete(oldest[0]);
      }
      coingeckoOhlcCache.set(cacheKey, { data: candles, ts: Date.now() });
    }
    return candles;
  })();
  coingeckoOhlcPending.set(cacheKey, request);
  try {
    return await request;
  } finally {
    coingeckoOhlcPending.delete(cacheKey);
  }
}

function getCached(key: string): Candle[] | null {
  const e = candleCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) return null;
  return e.data;
}
function getStaleCached(key: string): { data: Candle[]; source: string } | null {
  const entry = candleCache.get(key);
  const source = candleSourceCache.get(key);
  if (!entry || !source || source === "none" || !entry.data.length) return null;
  if (Date.now() - entry.ts > STALE_CANDLE_TTL_MS) return null;
  return { data: entry.data, source };
}

function setCached(key: string, data: Candle[], source: string) {
  if (candleCache.size >= 200) {
    const oldest = [...candleCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) {
      candleCache.delete(oldest[0]);
      candleSourceCache.delete(oldest[0]);
    }
  }
  candleCache.set(key, { data, ts: Date.now() });
  candleSourceCache.set(key, source);
  if (data.length) candleRefreshBackoff.delete(key);
}

export function invalidateCandlesForOrderbookUpdate(symbol: string) {
  const prefix = `${symbol.toUpperCase()}:`;
  for (const [key, source] of candleSourceCache) {
    if (!key.startsWith(prefix) || source === "orahdex-trades") continue;
    candleCache.delete(key);
    candleSourceCache.delete(key);
    candleRefreshBackoff.delete(key);
  }
  historyCache.delete(`history:${symbol.toUpperCase()}`);
}

async function buildCandlesFromOrderbookSnapshots(
  symbol: string,
  intervalSec: number,
  limit: number,
): Promise<Candle[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const lookbackSec = Math.max(intervalSec * limit, intervalSec);
  const retentionStartSec = nowSec - 30 * 24 * 60 * 60;
  const requestedStartSec = nowSec - lookbackSec;
  const startSec = Math.floor(Math.max(retentionStartSec, requestedStartSec) / 60) * 60;
  const { rows } = await pool.query<{
    bucket_sec: number;
    open: string;
    high: string;
    low: string;
    close: string;
  }>(
    `SELECT bucket_sec, open, high, low, close
       FROM orderbook_quote_candles
      WHERE symbol = $1 AND bucket_sec >= $2
      ORDER BY bucket_sec ASC`,
    [symbol.toUpperCase(), startSec],
  );
  if (!rows.length) return [];

  const buckets = new Map<number, Candle>();
  for (const row of rows) {
    const time = Math.floor(Number(row.bucket_sec) / intervalSec) * intervalSec;
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    if (![time, open, high, low, close].every(Number.isFinite) || Math.min(open, high, low, close) <= 0) continue;
    const existing = buckets.get(time);
    if (!existing) {
      buckets.set(time, { time, open, high, low, close, volume: 0 });
      continue;
    }
    existing.high = Math.max(existing.high, high);
    existing.low = Math.min(existing.low, low);
    existing.close = close;
  }

  return [...buckets.values()].sort((a, b) => a.time - b.time).slice(-limit);
}

function buildCandlesFromCrossReference(
  baseCandles: Candle[],
  quoteCandles: Candle[],
  limit: number,
): Candle[] {
  const quoteByTime = new Map(quoteCandles.map((candle) => [Number(candle.time), candle]));
  const derived: Candle[] = [];
  for (const base of baseCandles) {
    const quote = quoteByTime.get(Number(base.time));
    if (!quote || quote.open <= 0 || quote.high <= 0 || quote.low <= 0 || quote.close <= 0) continue;
    const open = base.open / quote.open;
    const close = base.close / quote.close;
    const high = Math.max(open, close, base.high / quote.low);
    const low = Math.min(open, close, base.low / quote.high);
    if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) continue;
    derived.push({ time: Number(base.time), open, high, low, close, volume: 0 });
  }
  return derived.slice(-limit);
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
    .where(and(eq(tradesTable.symbol, symbol), gte(tradesTable.timestamp, since)));

  if (!rows.length) return [];

  const buckets = new Map<number, { o: number; h: number; l: number; c: number; v: number }>();
  for (const row of rows) {
    const ts     = Math.floor(row.timestamp.getTime() / 1000);
    const bucket = Math.floor(ts / intervalSec) * intervalSec;
    const price  = parseFloat(row.price);
    const qty    = parseFloat(row.quantity);
    const e = buckets.get(bucket);
    if (!e) {
      buckets.set(bucket, { o: price, h: price, l: price, c: price, v: qty });
    } else {
      e.h = Math.max(e.h, price);
      e.l = Math.min(e.l, price);
      e.c = price;
      e.v += qty;
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-limit)
    .map(([t, b]) => ({ time: t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
}

/* ── 2. OKX public candles (primary real-data source — not geo-blocked) ─────── */
async function fetchOkxCandles(
  base:     string,
  interval: string,
  limit:    number,
): Promise<Candle[]> {
  const bar = OKX_INTERVAL_MAP[interval] || "1H";
  // OKX max 300 per call; for larger limits make up to 5 paginated calls
  const perPage = 300;
  const pages   = Math.min(5, Math.ceil(limit / perPage));
  const all: Candle[] = [];

  // OKX returns newest-first; to paginate backwards we pass `after` (older timestamp)
  let after = "";
  for (let p = 0; p < pages; p++) {
    const qs = `instId=${base}-USDT&bar=${bar}&limit=${Math.min(perPage, limit - all.length)}${after ? `&after=${after}` : ""}`;
    const res = await fetch(`https://www.okx.com/api/v5/market/candles?${qs}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`OKX candles HTTP ${res.status}`);
    const json = await res.json() as { code: string; msg: string; data: string[][] };
    if (json.code !== "0") throw new Error(`OKX: ${json.msg}`);
    if (!json.data?.length) break;

    const batch = json.data
      .filter(k => k.length >= 6 && Number(k[0]) > 0)
      .map(k => ({
        time:   Math.floor(Number(k[0]) / 1000),
        open:   parseFloat(k[1]),
        high:   parseFloat(k[2]),
        low:    parseFloat(k[3]),
        close:  parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

    all.push(...batch);
    if (all.length >= limit || batch.length < perPage) break;
    // next page: `after` = oldest ts in current batch (already newest-first)
    after = json.data[json.data.length - 1]![0];
  }

  // OKX returns newest first — reverse to chronological order and deduplicate
  return all
    .sort((a, b) => a.time - b.time)
    .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1]!.time)
    .slice(-limit);
}

/* ── 3. Binance public klines ─────────────────────────────────────────────────── */
async function fetchBinanceCandles(
  binanceSym: string,
  interval:   string,
  limit:      number,
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

/* ── 4. Gate.io public candles ─────────────────────────────────────────────────── */
async function fetchGateCandles(
  pair:     string,
  interval: string,
  limit:    number,
): Promise<Candle[]> {
  const gInterval = GATE_INTERVAL_MAP[interval] || "1h";
  const url = `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${pair}&interval=${gInterval}&limit=${Math.min(limit, 1000)}`;
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

/* ── 5. Poloniex public candles ─────────────────────────────────────────────────── */
async function fetchPoloniexCandles(
  poloniexSym: string,
  interval:    string,
  limit:       number,
): Promise<Candle[]> {
  const pInterval = POLONIEX_INTERVAL_MAP[interval] || "HOUR_1";
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

/* ── Bitfinex symbol map (our base → Bitfinex pair suffix, no t-prefix) ─────── */
const BITFINEX_SYM: Record<string, string> = {
  BTC:"BTCUSD", ETH:"ETHUSD", XRP:"XRPUSD", LTC:"LTCUSD",
  BCH:"BCHUSD", EOS:"EOSUSD", XLM:"XLMUSD", DASH:"DSHUSD",
  ZEC:"ZECUSD", XMR:"XMRUSD", DOGE:"DOGEUSD", NEO:"NEOUSD",
  LINK:"LINKUSD", ADA:"ADAUSD", DOT:"DOTUSD", SOL:"SOLUSD",
  ATOM:"ATOMUSD", AVAX:"AVAXUSD", MATIC:"MATICUSD", UNI:"UNIUSD",
  AAVE:"AAVEUSD", MKR:"MKRUSD", SNX:"SNXUSD", COMP:"COMPUSD",
  CRV:"CRVUSD", GRT:"GRTUSD", ENJ:"ENJUSD", SAND:"SANDUSD",
  MANA:"MANAUSD", THETA:"THETAUSD", FTM:"FTMUSD", NEAR:"NEARUSD",
  ALGO:"ALGOUSD", VET:"VETUSD", HBAR:"HBARUSD", AXS:"AXSUSD",
  GALA:"GALAUSD", APE:"APEUSD", IMX:"IMXUSD", OP:"OPUSD",
  ARB:"ARBUSD", APT:"APTUSD", SUI:"SUIUSD", TIA:"TIAUSD",
  INJ:"INJUSD", RUNE:"RUNEUSD", ZIL:"ZILUSD", FIL:"FILUSD",
  SUSHI:"SUSHIUSD", CHZ:"CHZUSD", FLOW:"FLOWUSD", KSM:"KSMUSD",
  OCEAN:"OCEANUSD", STORJ:"STORJUSD", XTZ:"XTZUSD", WAVES:"WAVESUSD",
  KAVA:"KAVAUSD", TON:"TONUSD", PENDLE:"PENDLEUSD",
};

/* ── Bitfinex public candles — free, up to 10 000 daily candles per call ─────── */
async function fetchBitfinexHistory(base: string): Promise<Candle[]> {
  const pair = BITFINEX_SYM[base];
  if (!pair) return [];
  const url = `https://api-pub.bitfinex.com/v2/candles/trade:1D:t${pair}/hist?limit=10000&sort=1`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(18_000),
  });
  if (!res.ok) throw new Error(`Bitfinex history HTTP ${res.status}`);
  const data = await res.json() as number[][];
  if (!Array.isArray(data) || data.length < 3) throw new Error("Bitfinex returned empty history");
  // Format: [MTS_ms, OPEN, CLOSE, HIGH, LOW, VOLUME]
  return data
    .filter(k => Array.isArray(k) && k.length >= 6 && k[0] > 0 && k[1] > 0)
    .map(k => ({
      time:   Math.floor(k[0] / 1000),
      open:   k[1],
      close:  k[2],
      high:   k[3],
      low:    k[4],
      volume: Math.abs(k[5] ?? 0), // volume can be negative on Bitfinex (sell side)
    }))
    .sort((a, b) => a.time - b.time);
}

/* ── 6-hour cache for full history (static data changes very slowly) ─────────── */
interface HistoryCacheEntry { data: Candle[]; ts: number; includesOrderbook: boolean }
const historyCache = new Map<string, HistoryCacheEntry>();
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * fetchFullHistoryCandles — returns A-to-Z OHLCV for a symbol:
 *   1. Bitfinex daily candles from 2013+ (up to 10 000 candles, free, no key)
 *   2. OKX daily candles paginated (up to 1500 = ~4 years) — for coins not on Bitfinex
 *   3. Gate.io daily (fallback for obscure pairs)
 *   4. Synthetic random walk anchored to lastPrice
 *
 * Results are cached for 6 hours — historical data barely changes.
 */
export async function fetchFullHistoryCandles(
  symbol:    string,
  lastPrice: number,
): Promise<Candle[]> {
  const cacheKey = `history:${symbol}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HISTORY_TTL_MS) {
    return cached.includesOrderbook
      ? cached.data.map((candle) => ({ ...candle }))
      : pinLastCandle([...cached.data], lastPrice);
  }

  const parts = symbol.split("/");
  const base  = parts[0]?.toUpperCase() ?? "";

  /* 1. Bitfinex — full daily history from inception (2013+ for major coins) */
  let merged: Candle[] = [];
  try {
    const bfx = await fetchBitfinexHistory(base);
    if (bfx.length >= 10) {
      merged = bfx;
      logger.info({ symbol, count: merged.length, first: merged[0]?.time }, "Bitfinex full history loaded");
    }
  } catch (err) {
    logger.warn({ err, symbol }, "Bitfinex history failed");
  }

  /* 2. OKX extended daily pagination — for coins not on Bitfinex or to supplement */
  if (merged.length < 10 && !OKX_SKIP_PAIRS.has(base)) {
    try {
      const okx = await fetchOkxCandles(base, "1d", 1500);
      if (okx.length >= 5) {
        if (merged.length >= 10) {
          // Stitch: Bitfinex historical + OKX recent (OKX is more precise for recent data)
          const cutoff = okx[0]!.time;
          const pre = merged.filter(c => c.time < cutoff);
          merged = [...pre, ...okx]
            .sort((a, b) => a.time - b.time)
            .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1]!.time);
        } else {
          merged = okx;
        }
        logger.info({ symbol, count: merged.length, source: "okx+bfx" }, "OKX extended history");
      }
    } catch (_) {}
  }

  /* 3. Gate.io — fallback for obscure pairs not on Bitfinex/OKX */
  if (merged.length < 5) {
    try {
      const gate = await fetchGateCandles(`${base}_USDT`, "1d", 1000);
      if (gate.length >= 5) merged = gate;
    } catch (_) {}
  }

  let includesOrderbook = false;
  try {
    const quoteCandles = await buildCandlesFromOrderbookSnapshots(symbol, 86_400, 30);
    if (quoteCandles.length) {
      const quoteDays = new Set(quoteCandles.map((candle) => candle.time));
      merged = [
        ...merged.filter((candle) => !quoteDays.has(candle.time)),
        ...quoteCandles,
      ].sort((a, b) => a.time - b.time);
      includesOrderbook = true;
    }
  } catch (err) {
    logger.warn({ err, symbol }, "Order-book daily candle history unavailable");
  }

  // Keep sparse real history rather than inventing price movements.
  if (merged.length === 0) {
    logger.warn({ symbol }, "Historical candle sources unavailable");
    return [];
  }

  historyCache.set(cacheKey, { data: merged, ts: Date.now(), includesOrderbook });
  logger.info({ symbol, total: merged.length }, "Full history assembled");
  return includesOrderbook
    ? merged.map((candle) => ({ ...candle }))
    : pinLastCandle([...merged], lastPrice);
}

/* ── Resample daily candles into weekly or monthly OHLCV bars ────────────────── */
export function resampleCandles(candles: Candle[], targetInterval: '1w' | '1M'): Candle[] {
  if (!candles.length) return candles;

  const bucketKey = (ts: number): string => {
    const d = new Date(ts * 1000);
    if (targetInterval === '1M') {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    /* Weekly: Monday-aligned */
    const dow  = d.getUTCDay(); // 0=Sun
    const diff = dow === 0 ? -6 : 1 - dow;
    const mon  = new Date(d.getTime() + diff * 86_400_000);
    return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, '0')}-${String(mon.getUTCDate()).padStart(2, '0')}`;
  };

  const startTs = (ts: number): number => {
    const d = new Date(ts * 1000);
    if (targetInterval === '1M') {
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
    }
    const dow  = d.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    return Math.floor((d.getTime() + diff * 86_400_000) / 1000 / 86_400) * 86_400;
  };

  type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };
  const buckets = new Map<string, Bar>();

  for (const c of candles) {
    const key = bucketKey(c.time);
    const b   = buckets.get(key);
    if (!b) {
      buckets.set(key, { time: startTs(c.time), open: c.open, high: c.high, low: c.low, close: c.close, volume: (c as any).volume ?? 0 });
    } else {
      if (c.high > b.high) b.high = c.high;
      if (c.low  < b.low)  b.low  = c.low;
      b.close   = c.close;
      b.volume += (c as any).volume ?? 0;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time) as unknown as Candle[];
}

/* ── Pin the last candle's close to the live price ──────────────────────────── */
function pinLastCandle(candles: Candle[], lastPrice: number): Candle[] {
  if (!candles.length || !(lastPrice > 0)) return candles;
  const last = candles[candles.length - 1]!;
  candles[candles.length - 1] = {
    ...last,
    close: lastPrice,
    high:  Math.max(last.high, lastPrice),
    low:   Math.min(last.low,  lastPrice),
  };
  return candles;
}

/* ── Validate that a candle array looks like real price data ─────────────────── */
function isValidCandleSet(candles: Candle[], minCount: number): boolean {
  if (candles.length < minCount) return false;
  // Reject flat data using relative precision so tiny-priced tokens are not
  // rounded to zero by a fixed decimal comparison.
  const closes = candles.map(c => c.close);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  return maxClose - minClose > Math.max(Math.abs(maxClose) * 1e-10, 1e-30);
}

/* ── Main export ───────────────────────────────────────────────────────────────── */
export async function fetchRealCandles(
  symbol:    string,
  lastPrice: number,
  interval:  string,
  limit:     number,
  onSource?: (source: string) => void,
): Promise<Candle[]> {
  const cacheKey = `${symbol}:${interval}:${limit}`;
  const cached   = getCached(cacheKey);
  if (cached !== null) {
    const source = candleSourceCache.get(cacheKey) ?? "unknown";
    onSource?.(source);
    if (cached.length === 0) return [];
    if (source === "coingecko" || source === "orderbook-snapshots" || source === "cross-reference") {
      return cached.map((candle) => ({ ...candle }));
    }
    return pinLastCandle([...cached.slice(0, -1), { ...cached[cached.length - 1]! }], lastPrice);
  }

  const stale = getStaleCached(cacheKey);
  if (stale && Date.now() < (candleRefreshBackoff.get(cacheKey) ?? 0)) {
    onSource?.(stale.source);
    return stale.data.slice(-limit).map((candle) => ({ ...candle }));
  }

  const parts     = symbol.split("/");
  const base      = parts[0]?.toUpperCase() ?? "";
  const quote     = parts[1]?.toUpperCase() ?? "";
  const isUsdtPair = quote === "USDT" && base.length > 0;
  const minRequired = Math.min(3, limit);

  // ── 1. Own trades (sovereign source of truth) ──────────────────────────────
  try {
    const intervalSec = INTERVAL_SECONDS[interval] || 3600;
    const ownCandles  = await buildCandlesFromOwnTrades(symbol, intervalSec, limit);
    if (isValidCandleSet(ownCandles, minRequired)) {
      setCached(cacheKey, ownCandles, "orahdex-trades");
      onSource?.("orahdex-trades");
      return pinLastCandle(ownCandles, lastPrice);
    }
  } catch (err) {
    logger.warn({ err, symbol }, "Own-trades candle build failed");
  }

  // ── 2. First-party live order-book quotes, never reported as traded volume ──
  try {
    const intervalSec = INTERVAL_SECONDS[interval] || 3600;
    const quoteCandles = await buildCandlesFromOrderbookSnapshots(symbol, intervalSec, limit);
    if (isValidCandleSet(quoteCandles, minRequired)) {
      setCached(cacheKey, quoteCandles, "orderbook-snapshots");
      onSource?.("orderbook-snapshots");
      return quoteCandles;
    }
    if (quoteCandles.length > 0) {
      logger.debug(
        { symbol, interval, count: quoteCandles.length, minRequired },
        "Order-book candle observations are too sparse; trying external reference history",
      );
    }
  } catch (err) {
    logger.warn({ err, symbol }, "Order-book candle history unavailable");
  }

  // ── 3. OKX (primary external history source — global, not geo-blocked) ─────
  if (isUsdtPair && !OKX_SKIP_PAIRS.has(base)) {
    try {
      const candles = await fetchOkxCandles(base, interval, limit);
      if (isValidCandleSet(candles, minRequired)) {
        setCached(cacheKey, candles, "okx");
        onSource?.("okx");
        logger.debug({ symbol, count: candles.length, source: "okx" }, "Candles from OKX");
        return pinLastCandle(candles, lastPrice);
      }
    } catch (err) {
      logger.warn({ err, symbol }, "OKX candle fetch failed — trying Binance");
    }
  }

  // ── 3. Binance (works from some regions; try as secondary) ─────────────────
  if (isUsdtPair && BINANCE_USDT_PAIRS.has(base)) {
    try {
      const candles = await fetchBinanceCandles(`${base}USDT`, interval, limit);
      if (isValidCandleSet(candles, minRequired)) {
        setCached(cacheKey, candles, "binance");
        onSource?.("binance");
        logger.debug({ symbol, count: candles.length, source: "binance" }, "Candles from Binance");
        return pinLastCandle(candles, lastPrice);
      }
    } catch (err) {
      logger.warn({ err, symbol }, "Binance candle fetch failed — trying Gate.io");
    }
  }

  // ── 4. Gate.io (broad coverage, USDT pairs, not geo-blocked) ───────────────
  if (isUsdtPair) {
    try {
      const candles = await fetchGateCandles(`${base}_USDT`, interval, limit);
      if (isValidCandleSet(candles, minRequired)) {
        setCached(cacheKey, candles, "gateio");
        onSource?.("gateio");
        logger.debug({ symbol, count: candles.length, source: "gateio" }, "Candles from Gate.io");
        return pinLastCandle(candles, lastPrice);
      }
    } catch (err) {
      logger.warn({ err, symbol }, "Gate.io candle fetch failed — trying Poloniex");
    }
  }

  // ── 5. Poloniex (for coins with different tickers, e.g. BSV → BCHSV) ────────
  if (isUsdtPair && POLONIEX_SYMBOL_MAP[base]) {
    try {
      const candles = await fetchPoloniexCandles(POLONIEX_SYMBOL_MAP[base]!, interval, limit);
      if (isValidCandleSet(candles, minRequired)) {
        setCached(cacheKey, candles, "poloniex");
        onSource?.("poloniex");
        logger.debug({ symbol, count: candles.length, source: "poloniex" }, "Candles from Poloniex");
        return pinLastCandle(candles, lastPrice);
      }
    } catch (err) {
      logger.warn({ err, symbol }, "Poloniex candle fetch failed");
    }
  }

  // Gate.io lists many direct crypto-cross markets (for example AAVE_ETH).
  // Query that exact pair before using CoinGecko as a broader reference feed.
  if (quote && quote !== "USDT") {
    try {
      const candles = await fetchGateCandles(`${base}_${quote}`, interval, limit);
      if (isValidCandleSet(candles, minRequired)) {
        setCached(cacheKey, candles, "gateio");
        onSource?.("gateio");
        logger.debug({ symbol, count: candles.length, source: "gateio-cross" }, "Cross-pair candles from Gate.io");
        return pinLastCandle(candles, lastPrice);
      }
    } catch (err) {
      logger.debug({ symbol, err }, "Gate.io cross-pair candles unavailable");
    }
  }

  // Known non-USDT markets can use genuine CoinGecko OHLC as a reference
  // source when OrahDEX has no executions. Direct exchange feeds above take
  // precedence; reference candles are labeled separately in the chart.
  const coinId = await resolveCoinGeckoId(base);
  const vsCurrency = COINGECKO_VS_CURRENCY[quote];
  if (coinId && vsCurrency) {
    const days: "1" | "30" | "365" =
      ["1m", "3m", "5m", "15m", "30m", "1h"].includes(interval) ? "1" :
      ["1d", "3d", "1w", "1M"].includes(interval) ? "365" : "30";
    try {
      let candles: Candle[];
      try {
        candles = await fetchCoinGeckoOhlc(coinId, vsCurrency, days);
      } catch (err) {
        if (days !== "365") throw err;
        logger.warn({ err, symbol }, "Long-range CoinGecko candles unavailable; trying shorter reference history");
        candles = await fetchCoinGeckoOhlc(coinId, vsCurrency, "30");
      }
      if (isValidCandleSet(candles, minRequired)) {
        const result = candles.slice(-limit);
        setCached(cacheKey, result, "coingecko");
        onSource?.("coingecko");
        return result;
      }
    } catch (err) {
      logger.warn({ err, symbol, coinId, vsCurrency, days }, "CoinGecko reference candles unavailable");
    }
  }

  // Derive a genuine cross-rate reference series when the exact pair is not
  // listed by a candle provider but both assets have candles against USDT.
  const stableQuotes = new Set(["USD", "USDT", "USDC", "BUSD", "TUSD", "USDD", "DAI", "FDUSD"]);
  if (base && quote && !stableQuotes.has(quote) && !stableQuotes.has(base)) {
    try {
      const [baseCandles, quoteCandles] = await Promise.all([
        fetchRealCandles(`${base}/USDT`, 0, interval, limit),
        fetchRealCandles(`${quote}/USDT`, 0, interval, limit),
      ]);
      const crossCandles = buildCandlesFromCrossReference(baseCandles, quoteCandles, limit);
      if (isValidCandleSet(crossCandles, minRequired)) {
        setCached(cacheKey, crossCandles, "cross-reference");
        onSource?.("cross-reference");
        return crossCandles;
      }
    } catch (err) {
      logger.debug({ err, symbol }, "Cross-reference candles unavailable");
    }
  }

  const staleFallback = getStaleCached(cacheKey);
  if (staleFallback) {
    candleRefreshBackoff.set(cacheKey, Date.now() + CACHE_TTL_MS);
    onSource?.(staleFallback.source);
    return staleFallback.data.slice(-limit).map((candle) => ({ ...candle }));
  }

  logger.warn({ symbol, interval }, "Real candle sources unavailable — returning no history");
  setCached(cacheKey, [], "none");
  onSource?.("none");
  return [];
}
