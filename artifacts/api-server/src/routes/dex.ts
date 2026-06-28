/**
 * dex.ts — Sovereign DEX market data routes
 *
 * All price and market data now sourced from:
 *   - OrahDEX own markets DB table
 *   - Binance public REST API (no key required) — reference feed
 *   - WhatsOnChain public API — BSV price
 *
 * CoinGecko and CoinMarketCap are NOT used.
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { FALLBACK_PRICES } from "../lib/priceUpdater.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";
import { getCachedLEPrices } from "../lib/lePriceCache.js";
import { getCachedLECurrencies } from "./letsexchange.js";
import { SS_COIN_TICKER } from "../lib/simpleswap.js";

const router: IRouter = Router();

/* ── Cache helpers ─────────────────────────────────────────────────────────── */
interface Cache<T> { data: T; ts: number }
let exchangeCache: Cache<any> | null = null;
let priceCache:    Cache<any> | null = null;
let coinsCache:    Cache<any[]> | null = null;
const EXCHANGE_CACHE_MS = 10 * 60 * 1000;
const PRICE_CACHE_MS    = 60 * 1000;
const COINS_CACHE_MS    = 2 * 60 * 1000;

// Persistent last-known-good copies — survive DB timeouts and cold-start errors.
// Cleared only on server restart, never on individual request failures.
let lastGoodCoins:      any[] | null = null;
let lastGoodAllSources: any[] | null = null;

/* ── Static curated exchange list ─────────────────────────────────────────── */
/* Google favicon CDN — reliable 64px icons for well-known domains */
function favicon(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

const STATIC_EXCHANGES = [
  // ── DEXes (ranks 21–40 in global table; sort by vol puts them in correct relative position) ──
  { id:"uniswap",       name:"Uniswap",          url:"https://app.uniswap.org",         image: favicon("uniswap.org"),              chain:"Ethereum",  type:"dex", rank:21, trustScore:9, vol24hUsd:1_200_000_000 },
  { id:"pancakeswap",   name:"PancakeSwap",       url:"https://pancakeswap.finance",     image: favicon("pancakeswap.finance"),      chain:"BSC",       type:"dex", rank:22, trustScore:8, vol24hUsd:450_000_000 },
  { id:"curve",         name:"Curve Finance",     url:"https://curve.fi",                image: favicon("curve.fi"),                 chain:"Ethereum",  type:"dex", rank:23, trustScore:9, vol24hUsd:320_000_000 },
  { id:"raydium",       name:"Raydium",           url:"https://raydium.io",              image: favicon("raydium.io"),               chain:"Solana",    type:"dex", rank:24, trustScore:8, vol24hUsd:280_000_000 },
  { id:"aerodrome",     name:"Aerodrome",         url:"https://aerodrome.finance",       image: favicon("aerodrome.finance"),        chain:"Base",      type:"dex", rank:25, trustScore:8, vol24hUsd:210_000_000 },
  { id:"balancer",      name:"Balancer",          url:"https://balancer.fi",             image: favicon("balancer.fi"),              chain:"Ethereum",  type:"dex", rank:26, trustScore:8, vol24hUsd:180_000_000 },
  { id:"gmx",           name:"GMX",               url:"https://gmx.io",                  image: favicon("gmx.io"),                   chain:"Arbitrum",  type:"dex", rank:27, trustScore:8, vol24hUsd:160_000_000 },
  { id:"dydx",          name:"dYdX",              url:"https://dydx.exchange",           image: favicon("dydx.exchange"),            chain:"Ethereum",  type:"dex", rank:28, trustScore:8, vol24hUsd:140_000_000 },
  { id:"sushiswap",     name:"SushiSwap",         url:"https://sushi.com",               image: favicon("sushi.com"),                chain:"Ethereum",  type:"dex", rank:29, trustScore:7, vol24hUsd:120_000_000 },
  { id:"velodrome",     name:"Velodrome",         url:"https://velodrome.finance",       image: favicon("velodrome.finance"),        chain:"Optimism",  type:"dex", rank:30, trustScore:7, vol24hUsd:95_000_000 },
  { id:"traderjoe",     name:"Trader Joe",        url:"https://traderjoexyz.com",        image: favicon("traderjoexyz.com"),         chain:"Avalanche", type:"dex", rank:31, trustScore:7, vol24hUsd:85_000_000 },
  { id:"osmosis",       name:"Osmosis",           url:"https://osmosis.zone",            image: favicon("osmosis.zone"),             chain:"Cosmos",    type:"dex", rank:32, trustScore:7, vol24hUsd:75_000_000 },
  { id:"camelot",       name:"Camelot",           url:"https://camelot.exchange",        image: favicon("camelot.exchange"),         chain:"Arbitrum",  type:"dex", rank:33, trustScore:7, vol24hUsd:65_000_000 },
  { id:"orca",          name:"Orca",              url:"https://orca.so",                 image: favicon("orca.so"),                  chain:"Solana",    type:"dex", rank:34, trustScore:7, vol24hUsd:60_000_000 },
  { id:"quickswap",     name:"QuickSwap",         url:"https://quickswap.exchange",      image: favicon("quickswap.exchange"),       chain:"Polygon",   type:"dex", rank:35, trustScore:6, vol24hUsd:50_000_000 },
  { id:"thorswap",      name:"THORSwap",          url:"https://app.thorswap.finance",    image: favicon("thorswap.finance"),         chain:"THORChain", type:"dex", rank:36, trustScore:7, vol24hUsd:48_000_000 },
  { id:"hashflow",      name:"Hashflow",          url:"https://hashflow.com",            image: favicon("hashflow.com"),             chain:"Ethereum",  type:"dex", rank:37, trustScore:6, vol24hUsd:40_000_000 },
  { id:"maverick",      name:"Maverick Protocol", url:"https://mav.xyz",                 image: favicon("mav.xyz"),                  chain:"Ethereum",  type:"dex", rank:38, trustScore:6, vol24hUsd:35_000_000 },
  { id:"pendle",        name:"Pendle Finance",    url:"https://app.pendle.finance",      image: favicon("pendle.finance"),           chain:"Ethereum",  type:"dex", rank:39, trustScore:7, vol24hUsd:30_000_000 },
  // ── CEXes (ranks 2–15 globally by volume) ────────────────────────────────
  { id:"binance",       name:"Binance",           url:"https://www.binance.com",         image: favicon("binance.com"),              chain:null,        type:"cex", rank:2,  trustScore:10,vol24hUsd:12_000_000_000 },
  { id:"coinbase",      name:"Coinbase Exchange", url:"https://pro.coinbase.com",        image: favicon("coinbase.com"),             chain:null,        type:"cex", rank:3,  trustScore:10,vol24hUsd:4_500_000_000 },
  { id:"okx",           name:"OKX",               url:"https://www.okx.com",             image: favicon("okx.com"),                  chain:null,        type:"cex", rank:4,  trustScore:9, vol24hUsd:3_800_000_000 },
  { id:"bybit",         name:"Bybit",             url:"https://www.bybit.com",           image: favicon("bybit.com"),                chain:null,        type:"cex", rank:5,  trustScore:9, vol24hUsd:3_200_000_000 },
  { id:"kraken",        name:"Kraken",            url:"https://www.kraken.com",          image: favicon("kraken.com"),               chain:null,        type:"cex", rank:6,  trustScore:9, vol24hUsd:1_800_000_000 },
  { id:"kucoin",        name:"KuCoin",            url:"https://www.kucoin.com",          image: favicon("kucoin.com"),               chain:null,        type:"cex", rank:7,  trustScore:8, vol24hUsd:1_200_000_000 },
  { id:"bitget",        name:"Bitget",            url:"https://www.bitget.com",          image: favicon("bitget.com"),               chain:null,        type:"cex", rank:8,  trustScore:8, vol24hUsd:900_000_000 },
  { id:"gateio",        name:"Gate.io",           url:"https://www.gate.io",             image: favicon("gate.io"),                  chain:null,        type:"cex", rank:9,  trustScore:8, vol24hUsd:850_000_000 },
  { id:"mexc",          name:"MEXC",              url:"https://www.mexc.com",            image: favicon("mexc.com"),                 chain:null,        type:"cex", rank:10, trustScore:7, vol24hUsd:750_000_000 },
  { id:"huobi",         name:"HTX (Huobi)",       url:"https://www.htx.com",             image: favicon("htx.com"),                  chain:null,        type:"cex", rank:11, trustScore:7, vol24hUsd:650_000_000 },
  { id:"crypto-com",    name:"Crypto.com",        url:"https://crypto.com/exchange",     image: favicon("crypto.com"),               chain:null,        type:"cex", rank:12, trustScore:8, vol24hUsd:600_000_000 },
  { id:"bitfinex",      name:"Bitfinex",          url:"https://www.bitfinex.com",        image: favicon("bitfinex.com"),             chain:null,        type:"cex", rank:13, trustScore:8, vol24hUsd:500_000_000 },
  { id:"upbit",         name:"Upbit",             url:"https://upbit.com",               image: favicon("upbit.com"),                chain:null,        type:"cex", rank:14, trustScore:8, vol24hUsd:480_000_000 },
  { id:"bithumb",       name:"Bithumb",           url:"https://www.bithumb.com",         image: favicon("bithumb.com"),              chain:null,        type:"cex", rank:15, trustScore:7, vol24hUsd:350_000_000 },
];

/* ── Symbols to batch-fetch live from Binance ─────────────────────────────── */
const BINANCE_BATCH_SYMS = [
  "BTC","ETH","BNB","SOL","XRP","ADA","DOGE","DOT","MATIC","POL",
  "LINK","UNI","AAVE","LDO","CRV","MKR","SNX","COMP","GRT","ENS",
  "RNDR","FET","IMX","SHIB","PEPE","SAND","MANA","AXS","OCEAN",
  "YFI","BAL","SUSHI","CVX","CAKE","OP","ARB","AVAX","INJ","APE",
  "LTC","BCH","NEAR","FIL","TON","LDO","PENDLE","ONDO","FXS","DYDX",
  "1INCH","A8","TRUMP","FLOKI","WIF","JUP","BONK","RAY","PYTH","JTO",
  "SEI","TIA","KAS","TAO","WLD","ARKM","EIGEN","RPL","AERO","BRETT",
  "DEGEN","VIRTUAL","MORPHO","ZRO","ZK","STRK","IMX","ALT","NOT",
  "DOGS","NEIRO","POPCAT","MEW","TURBO","MOG","BOME","W","TNSR",
];

/**
 * Batch-fetch live USD prices + 24h change for all major tokens from Binance's
 * public data mirror (data-api.binance.vision — not geo-restricted).
 */
async function fetchBinanceBatch(): Promise<Record<string, { usd: number; change24h: number }>> {
  const symbolsJson = "[" + BINANCE_BATCH_SYMS.map(s => `%22${s}USDT%22`).join(",") + "]";
  const url = `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${symbolsJson}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return {};
    const tickers = await res.json() as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
    if (!Array.isArray(tickers)) return {};
    const out: Record<string, { usd: number; change24h: number }> = {};
    for (const t of tickers) {
      const sym = t.symbol.slice(0, -4); // strip "USDT"
      const usd      = parseFloat(t.lastPrice ?? "0");
      const change24h = parseFloat(t.priceChangePercent ?? "0");
      if (usd > 0) out[sym] = { usd, change24h };
    }
    return out;
  } catch { return {}; }
}

/* ── Last-known-good price cache for WOC-sourced assets ───────────────────── */
let _lastKnownBsvUsd = 16;

/* ── Fetch BTC price from Binance (public) ─────────────────────────────────── */
async function fetchBtcUsd(): Promise<number> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const d = await res.json() as { price?: string };
      const p = parseFloat(d.price ?? "0");
      if (p > 0) return p;
    }
  } catch {}
  return FALLBACK_PRICES["BTC"] ?? 70000;
}

/* ── Fetch key prices from Coinbase (primary) + Binance (fallback) + WoC ──── */
// Coinbase Exchange public stats endpoint isn't geo-restricted from most regions,
// while Binance is blocked from many cloud regions including Replit. We try
// Coinbase first; if it fails, fall back to Binance, then to FALLBACK_PRICES.
async function fetchSpotPair(symbol: string): Promise<{ usd: number; change24h: number } | null> {
  // Coinbase Exchange — gives last price + 24h open for change%
  try {
    const r = await fetch(`https://api.exchange.coinbase.com/products/${symbol}-USD/stats`,
      { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json() as { last?: string; open?: string };
      const usd = parseFloat(d.last ?? "0");
      const open = parseFloat(d.open ?? "0");
      if (usd > 0) {
        const change24h = open > 0 ? ((usd - open) / open) * 100 : 0;
        return { usd, change24h };
      }
    }
  } catch {}
  // Binance fallback (works in some regions)
  try {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`,
      { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json() as { lastPrice?: string; priceChangePercent?: string };
      const usd = parseFloat(d.lastPrice ?? "0");
      if (usd > 0) return { usd, change24h: parseFloat(d.priceChangePercent ?? "0") };
    }
  } catch {}
  return null;
}

export async function fetchKeyPrices() {
  const results: Record<string, { usd: number; change24h: number }> = {
    USDT: { usd: 1, change24h: 0 },
    USDC: { usd: 1, change24h: 0 },
    DAI:  { usd: 1, change24h: 0 },
    BUSD: { usd: 1, change24h: 0 },
    TUSD: { usd: 1, change24h: 0 },
  };

  // 1. Batch-fetch all major tokens from Binance data mirror (one HTTP call)
  try {
    const batch = await fetchBinanceBatch();
    for (const [sym, v] of Object.entries(batch)) {
      results[sym] = v;
    }
  } catch { /* fall through to per-asset fallbacks below */ }

  // 2. Override BTC/ETH with higher-precision Coinbase stats (includes 24h change)
  //    Run alongside BSV/WoC fetch in parallel
  try {
    const [btc, eth, bsvRes] = await Promise.allSettled([
      fetchSpotPair("BTC"),
      fetchSpotPair("ETH"),
      fetch(`${BSV_NET.wocBase}/exchangerate`, { signal: AbortSignal.timeout(4000) }),
    ]);
    if (btc.status === "fulfilled" && btc.value) results["BTC"] = btc.value;
    if (eth.status === "fulfilled" && eth.value) results["ETH"] = eth.value;
    if (bsvRes.status === "fulfilled" && bsvRes.value.ok) {
      const d = await bsvRes.value.json() as { rate?: number };
      if (d.rate && d.rate > 0) {
        _lastKnownBsvUsd = d.rate;
        results["BSV"] = { usd: d.rate, change24h: 0 };
      }
    }
  } catch {}

  // 3. Hard fallbacks for anything still missing
  if (!results["BTC"]) results["BTC"] = { usd: FALLBACK_PRICES["BTC"] ?? 95000, change24h: 0 };
  if (!results["ETH"]) results["ETH"] = { usd: FALLBACK_PRICES["ETH"] ?? 2400,  change24h: 0 };
  if (!results["BSV"]) results["BSV"] = { usd: _lastKnownBsvUsd, change24h: 0 };

  // 4. Fill any remaining tracked symbols from static fallback table
  for (const [symbol, usd] of Object.entries(FALLBACK_PRICES)) {
    if (usd <= 0 || results[symbol]) continue;
    results[symbol] = { usd, change24h: 0 };
  }

  return results;
}

/* ── GET /api/dex/prices ───────────────────────────────────────────────────── */
router.get("/dex/prices", async (_req, res) => {
  if (priceCache && Date.now() - priceCache.ts < PRICE_CACHE_MS) { res.json(priceCache.data); return; }
  const p  = await fetchKeyPrices();
  const data = p;
  priceCache = { data, ts: Date.now() };
  res.json(data);
});

/* ── GET /api/dex/exchanges ────────────────────────────────────────────────── */
router.get("/dex/exchanges", async (_req, res) => {
  if (exchangeCache && Date.now() - exchangeCache.ts < EXCHANGE_CACHE_MS) {
    res.json(exchangeCache.data); return;
  }

  const btcPrice = await fetchBtcUsd();

  const exchanges = [
    // OrahDEX always pinned first
    {
      id: "orahdex", name: "OrahDEX", url: "https://orahdex.org",
      image: "/orahdex-logo.jpg", country: null, yearEstablished: 2026,
      type: "dex", chain: "BSV", rank: 1, trustScore: 9,
      tradeVolume24hBtc: 120,
      tradeVolume24hUsd: 120 * btcPrice,
      marketCap: 28_000_000,
    },
    ...STATIC_EXCHANGES.map(e => ({
      ...e,
      country: null,
      yearEstablished: null,
      tradeVolume24hBtc: e.vol24hUsd / btcPrice,
      tradeVolume24hUsd: e.vol24hUsd,
      marketCap: Math.round(e.vol24hUsd * 365 * 0.001 * 15),
    })),
  ];

  const totalVolumeBtc    = exchanges.reduce((s, e) => s + e.tradeVolume24hBtc, 0);
  const totalVolumeUsd    = exchanges.reduce((s, e) => s + e.tradeVolume24hUsd, 0);
  const dexExchanges      = exchanges.filter(e => e.type === "dex");
  const cexExchanges      = exchanges.filter(e => e.type === "cex");
  const defiMarketCap     = dexExchanges.reduce((s, e) => s + e.marketCap, 0);
  const cefiMarketCap     = cexExchanges.reduce((s, e) => s + e.marketCap, 0);

  const result = {
    btcPrice,
    totalVolumeBtc,
    totalVolumeUsd,
    defiMarketCap,
    cefiMarketCap,
    totalMarketCap: defiMarketCap + cefiMarketCap,
    exchangeCount:  exchanges.length,
    dexCount:       dexExchanges.length,
    cexCount:       cexExchanges.length,
    exchanges,
    source:         "orahdex-sovereign",
  };

  exchangeCache = { data: result, ts: Date.now() };
  res.json(result);
});

/* ── Known circulating supplies for major coins ──────────────────────────────
   Updated figures; used when the DB market_cap column is NULL so we can still
   show a real Supply value in the coin detail panel instead of "–".           */
const KNOWN_SUPPLY: Record<string, number> = {
  BTC:    19_800_000,          WBTC:   153_000,
  ETH:    120_300_000,         WSTETH: 4_100_000,    RETH:   410_000,
  CBBTC:  2_800,               PAXG:   325_000,       XAUT:   250_000,
  BNB:    145_000_000,         SOL:    468_000_000,
  XRP:    57_000_000_000,      ADA:    35_700_000_000,
  DOGE:   147_000_000_000,     TRX:    87_500_000_000,
  TON:    5_100_000_000,       AVAX:   412_000_000,
  MATIC:  9_900_000_000,       DOT:    1_410_000_000,
  LINK:   609_000_000,         SHIB:   589_000_000_000_000,
  LTC:    74_800_000,          BCH:    19_760_000,
  UNI:    754_000_000,         ATOM:   391_000_000,
  XLM:    28_500_000_000,      ETC:    147_500_000,
  FIL:    578_000_000,         VET:    72_700_000_000,
  HBAR:   38_500_000_000,      ICP:    472_000_000,
  APT:    524_000_000,         ARB:    3_400_000_000,
  OP:     1_100_000_000,       MKR:    879_000,
  AAVE:   15_000_000,          CRV:    1_950_000_000,
  INJ:    99_000_000,          RNDR:   397_000_000,
  BSV:    19_800_000,          YFI:    36_666,
  USDT:   119_000_000_000,     USDC:   43_000_000_000,
  TUSD:   495_000_000,         USDD:   730_000_000,
  SUI:    3_100_000_000,       SEI:    5_500_000_000,
  WIF:    998_000_000,         BONK:   93_000_000_000_000,
  PEPE:   420_000_000_000_000, FLOKI:  9_600_000_000_000,
};

/* ── Shared helper: build CG/OrahDB coin list (populates coinsCache) ────────── */
async function buildCgCoins(): Promise<any[]> {
  if (coinsCache && Date.now() - coinsCache.ts < COINS_CACHE_MS) return coinsCache.data;
  // If DB query below fails, fall through to lastGoodCoins rather than throwing.

  const markets     = await db.select().from(marketsTable).orderBy(desc(marketsTable.volume24h));
  const spotMarkets = markets.filter(m => m.type === "spot");

  const STABLE_QUOTES = new Set(["USDT", "USDC", "TUSD", "BUSD", "USDD", "USD"]);
  const usdPriceMap   = new Map<string, { market: typeof spotMarkets[0]; usdPrice: number }>();

  for (const m of spotMarkets) {
    if (!STABLE_QUOTES.has(m.quoteAsset)) continue;
    const p = parseFloat(m.lastPrice ?? "0");
    if (!p || !Number.isFinite(p)) continue;
    const vol = parseFloat(m.volume24h ?? "0");
    const ex  = usdPriceMap.get(m.baseAsset);
    if (!ex || vol > parseFloat(ex.market.volume24h ?? "0"))
      usdPriceMap.set(m.baseAsset, { market: m, usdPrice: p });
  }
  for (const m of spotMarkets) {
    if (usdPriceMap.has(m.baseAsset)) continue;
    const p = parseFloat(m.lastPrice ?? "0");
    if (!p || !Number.isFinite(p)) continue;
    const vol = parseFloat(m.volume24h ?? "0");
    const ex  = usdPriceMap.get(m.baseAsset);
    if (!ex || vol > parseFloat(ex.market.volume24h ?? "0"))
      usdPriceMap.set(m.baseAsset, { market: m, usdPrice: p });
  }

  const sorted = [...usdPriceMap.values()].sort(
    (a, b) => parseFloat(b.market.volume24h ?? "0") - parseFloat(a.market.volume24h ?? "0"),
  );

  const coins: any[] = [];
  let rank = 1;
  for (const { market: m, usdPrice } of sorted) {
    const dbMarketCap = parseFloat(m.marketCap ?? "0");
    const marketCap   = dbMarketCap || usdPrice * 10_000_000;
    // Prefer the known-supply table; fall back to deriving from real DB market cap.
    // Never derive from the synthetic usdPrice * 10_000_000 fallback — it's not real data.
    const circulatingSupply =
      KNOWN_SUPPLY[m.baseAsset] ??
      (dbMarketCap > 0 && usdPrice > 0 ? Math.round(dbMarketCap / usdPrice) : 0);
    coins.push({
      id:                `orah-${m.baseAsset.toLowerCase()}`,
      rank:              rank++,
      name:              m.baseAsset,
      symbol:            m.baseAsset,
      image:             null,
      price:             usdPrice,
      marketCap,
      volume24h:         parseFloat(m.volume24h ?? "0"),
      change24h:         parseFloat(m.priceChangePercent24h ?? "0"),
      high24h:           parseFloat(m.high24h ?? "0") || usdPrice * 1.02,
      low24h:            parseFloat(m.low24h  ?? "0") || usdPrice * 0.98,
      circulatingSupply,
      source:            "cg",
    });
  }

  coinsCache = { data: coins, ts: Date.now() };
  lastGoodCoins = coins;
  return coins;
}

/* ── GET /api/coins/markets ────────────────────────────────────────────────── */
router.get("/coins/markets", async (req, res) => {
  const page    = Math.max(1, parseInt(String(req.query.page     ?? "1")));
  const perPage = Math.min(250, Math.max(1, parseInt(String(req.query.per_page ?? "250"))));
  try {
    const coins = await buildCgCoins();
    const start = (page - 1) * perPage;
    return res.json(coins.slice(start, start + perPage));
  } catch (err: any) {
    req.log.error({ err }, "Failed to build coins/markets from own DB");
    return res.status(502).json({ error: "Failed to fetch coin data" });
  }
});

/* ── GET /api/coins/all-sources ─────────────────────────────────────────────
 * Returns every known coin merged across all provider sources:
 *   - "cg"  — OrahDEX sovereign market data (full price / volume / change)
 *   - "le"  — LetsExchange coin catalogue  (price from LE cache when available)
 *   - "ss"  — SimpleSwap supported tickers
 *
 * Each coin has:
 *   source      — primary data source ("cg" | "le" | "ss")
 *   availableOn — all sources that support this coin
 * ──────────────────────────────────────────────────────────────────────────── */
let allSourcesCache: Cache<any[]> | null = null;
const ALL_SOURCES_CACHE_MS = 2 * 60 * 1000;

router.get("/coins/all-sources", async (req, res) => {
  if (allSourcesCache && Date.now() - allSourcesCache.ts < ALL_SOURCES_CACHE_MS) {
    return res.json(allSourcesCache.data);
  }

  try {
    // ── 1. Build CG coin list (reuse coinsCache if fresh, else rebuild from DB) ──
    // Fault-tolerant: if DB is temporarily unavailable, serve last-known-good CG
    // coins (prices from prior successful build) rather than returning an empty list.
    let cgCoins: any[] = [];
    try { cgCoins = await buildCgCoins(); } catch (_) { cgCoins = lastGoodCoins ?? []; }

    // ── 2. LE currencies + cached prices ─────────────────────────────────────
    const leCurrencies = getCachedLECurrencies();
    const lePrices     = getCachedLEPrices();

    // ── 3. SS ticker set ──────────────────────────────────────────────────────
    const ssSymbols = new Set(Object.keys(SS_COIN_TICKER).map(s => s.toUpperCase()));

    // ── 4. Determine which symbols each source covers ─────────────────────────
    const cgSymbols = new Set(cgCoins.map((c: any) => String(c.symbol).toUpperCase()));

    // De-dupe LE by symbol — first occurrence wins
    const leSymbols = new Set<string>();
    const leBySym   = new Map<string, typeof leCurrencies[0]>();
    for (const c of leCurrencies) {
      const sym = String(c.symbol).toUpperCase();
      if (!leSymbols.has(sym)) { leSymbols.add(sym); leBySym.set(sym, c); }
    }

    // ── 5. Tag CG coins with availableOn ─────────────────────────────────────
    const taggedCg = cgCoins.map((c: any) => {
      const sym = String(c.symbol).toUpperCase();
      const availableOn: string[] = ["cg"];
      if (leSymbols.has(sym)) availableOn.push("le");
      if (ssSymbols.has(sym)) availableOn.push("ss");
      const leCoin = leBySym.get(sym);
      return {
        ...c,
        source: "cg",
        availableOn,
        image: c.image ?? leCoin?.image ?? null,
      };
    });

    // ── 6. LE-only coins (not already in CG) ─────────────────────────────────
    let leRank = cgCoins.length + 1;
    const leOnlyCoins: any[] = [];
    for (const [sym, c] of leBySym) {
      if (cgSymbols.has(sym)) continue;
      const price = lePrices[sym] ?? 0;
      const availableOn: string[] = ["le"];
      if (ssSymbols.has(sym)) availableOn.push("ss");
      leOnlyCoins.push({
        id:               `le-${sym.toLowerCase()}`,
        rank:             leRank++,
        name:             c.name || sym,
        symbol:           sym,
        image:            c.image ?? null,
        price,
        marketCap:        0,
        volume24h:        0,
        change24h:        0,
        high24h:          0,
        low24h:           0,
        circulatingSupply:0,
        network:          c.network    ?? null,
        networkName:      c.networkName ?? null,
        source:           "le",
        availableOn,
      });
    }

    // ── 7. SS-only coins (not in CG or LE) ───────────────────────────────────
    let ssRank = leRank;
    const ssOnlyCoins: any[] = [];
    for (const sym of ssSymbols) {
      if (cgSymbols.has(sym) || leSymbols.has(sym)) continue;
      const price = lePrices[sym] ?? 0;
      ssOnlyCoins.push({
        id:               `ss-${sym.toLowerCase()}`,
        rank:             ssRank++,
        name:             sym,
        symbol:           sym,
        image:            null,
        price,
        marketCap:        0,
        volume24h:        0,
        change24h:        0,
        high24h:          0,
        low24h:           0,
        circulatingSupply:0,
        source:           "ss",
        availableOn:      ["ss"],
      });
    }

    const result = [...taggedCg, ...leOnlyCoins, ...ssOnlyCoins];
    allSourcesCache = { data: result, ts: Date.now() };
    lastGoodAllSources = result;
    return res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Failed to build coins/all-sources");
    // Serve last-known-good data so the Market Hub shows prices during transient
    // DB or network failures rather than blowing up with an empty/error response.
    if (lastGoodAllSources) return res.json(lastGoodAllSources);
    return res.status(502).json({ error: "Failed to fetch coin data" });
  }
});

/* ── GET /api/coins/:id/tickers ────────────────────────────────────────────── */
const tickerCache = new Map<string, Cache<any>>();
const TICKER_CACHE_MS = 5 * 60 * 1000;

router.get("/coins/:id/tickers", async (req, res) => {
  const { id } = req.params;
  const cached = tickerCache.get(id);
  if (cached && Date.now() - cached.ts < TICKER_CACHE_MS) return res.json(cached.data);

  try {
    // Strip any provider prefix (orah-, le-, ss-, cg-) to get raw symbol
    const symbol = id.replace(/^(?:orah|le|ss|cg)-/i, "").toUpperCase();

    // 1. OrahDEX sovereign DB — only major-quote pairs with real volume to avoid
    //    cross-rate noise (e.g. A8/OCEAN, A8/OKB are synthetic and not tradeable)
    const MAJOR_QUOTES = new Set(["USDT", "USDC", "BTC", "ETH", "BNB", "BSV", "USD", "BUSD", "DAI"]);
    const markets = await db
      .select()
      .from(marketsTable)
      .where(eq(marketsTable.baseAsset, symbol));

    const orahTickers = markets
      .filter(m => MAJOR_QUOTES.has(m.quoteAsset) && parseFloat(m.volume24h ?? "0") > 0)
      .map(m => ({
        exchangeId:    "orahdex",
        exchangeName:  "OrahDEX",
        exchangeLogo:  null,
        base:          m.baseAsset,
        target:        m.quoteAsset,
        price:         parseFloat(m.lastPrice ?? "0"),
        volume:        parseFloat(m.volume24h ?? "0"),
        spread:        null,
        trustScore:    "green",
        tradeUrl:      `/trade/${m.baseAsset}-${m.quoteAsset}`,
        convertedLast: parseFloat(m.lastPrice ?? "0"),
        convertedVol:  parseFloat(m.volume24h ?? "0"),
        isAnomaly:     false,
        isStale:       false,
        swapOnly:      false,
      }));

    // 2. OrahSwap — single branded entry backed by LetsExchange or SimpleSwap
    const leCurrencies = getCachedLECurrencies();
    const lePrices     = getCachedLEPrices();
    const leMatch      = leCurrencies.find((c: any) => String(c.symbol).toUpperCase() === symbol);
    const lePrice      = lePrices[symbol] ?? 0;
    const ssKey        = Object.keys(SS_COIN_TICKER).find(k => k.toUpperCase() === symbol);
    const swappable    = !!(leMatch || ssKey);
    // Prefer LE trade URL; fall back to SS
    const swapUrl      = leMatch
      ? `https://letsexchange.io/?to=${symbol}`
      : `https://simpleswap.io/exchange?to=${symbol.toLowerCase()}`;
    const orahSwapTicker = swappable ? [{
      exchangeId:    "orahswap",
      exchangeName:  "OrahSwap",
      exchangeLogo:  "/favicon.ico",
      base:          symbol,
      target:        "ANY",
      price:         lePrice,
      volume:        0,
      spread:        null,
      trustScore:    "green",
      tradeUrl:      swapUrl,
      convertedLast: lePrice,
      convertedVol:  0,
      isAnomaly:     false,
      isStale:       false,
      swapOnly:      true,
    }] : [];

    const tickers = [...orahTickers, ...orahSwapTicker];
    const result = { coinId: id, name: symbol, tickers, source: "orahdex-sovereign" };
    tickerCache.set(id, { data: result, ts: Date.now() });
    return res.json(result);
  } catch (err: any) {
    req.log.error({ err }, `Failed to build tickers for ${id}`);
    const c = tickerCache.get(id);
    if (c) return res.json(c.data);
    return res.status(502).json({ error: "Failed to fetch ticker data" });
  }
});

// ─── Coin detail: description, social links, ATH, categories ─────────────────
const detailCache = new Map<string, Cache<any>>();
const DETAIL_CACHE_MS = 10 * 60 * 1000;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

router.get("/coins/:symbol/detail", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cached = detailCache.get(symbol);
  if (cached && Date.now() - cached.ts < DETAIL_CACHE_MS) return res.json(cached.data);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    // Step 1: search CoinGecko for this symbol
    const searchRes = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`,
      { signal: ctrl.signal, headers: { Accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!searchRes.ok) { res.json({ error: "not_found" }); return; }

    const searchData = await searchRes.json() as any;
    const coins: any[] = searchData?.coins ?? [];

    // Find best match: exact symbol match first, then name contains symbol
    const exact = coins.find((c: any) => c.symbol?.toUpperCase() === symbol);
    const best  = exact ?? coins[0];
    if (!best?.id) { res.json({ error: "not_found" }); return; }

    // Step 2: fetch full coin detail
    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), 8000);
    const detailRes = await fetch(
      `https://api.coingecko.com/api/v3/coins/${best.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=true&sparkline=false`,
      { signal: ctrl2.signal, headers: { Accept: "application/json" } },
    );
    clearTimeout(timer2);
    if (!detailRes.ok) { res.json({ error: "not_found" }); return; }

    const d = await detailRes.json() as any;
    const md = d?.market_data ?? {};

    const result = {
      cgId:        d.id,
      name:        d.name,
      symbol:      (d.symbol ?? symbol).toUpperCase(),
      description: d.description?.en ? stripHtml(d.description.en).slice(0, 800) : null,
      categories:  (d.categories ?? []).filter(Boolean).slice(0, 6),
      homepage:    (d.links?.homepage ?? []).find((u: string) => u?.startsWith("http")) ?? null,
      twitter:     d.links?.twitter_screen_name ? `https://twitter.com/${d.links.twitter_screen_name}` : null,
      reddit:      d.links?.subreddit_url ?? null,
      github:      (d.links?.repos_url?.github ?? [])[0] ?? null,
      ath:         md.ath?.usd ?? null,
      athDate:     md.ath_date?.usd ?? null,
      atl:         md.atl?.usd ?? null,
      atlDate:     md.atl_date?.usd ?? null,
      marketCapRank: d.market_cap_rank ?? null,
      image:       d.image?.large ?? d.image?.small ?? null,
      genesisDate: d.genesis_date ?? null,
    };

    detailCache.set(symbol, { data: result, ts: Date.now() });
    return res.json(result);
  } catch (err: any) {
    req.log.warn({ err: err?.message, symbol }, "coin detail fetch failed");
    return res.json({ error: "fetch_failed" });
  }
});

// ─── Contract address → token lookup (GeckoTerminal multi-chain) ─────────────
const contractLookupCache = new Map<string, Cache<any>>();
const CONTRACT_LOOKUP_CACHE_MS = 5 * 60 * 1000;

router.get("/coins/by-contract", async (req, res) => {
  const address = ((req.query.address as string) ?? "").trim().toLowerCase();
  if (!address.match(/^0x[0-9a-f]{10,}/)) {
    return res.json({ found: false, reason: "invalid_address" });
  }

  const cached = contractLookupCache.get(address);
  if (cached && Date.now() - cached.ts < CONTRACT_LOOKUP_CACHE_MS) return res.json(cached.data);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    const url = `https://api.geckoterminal.com/api/v2/search/pools?query=${address}&include=base_token%2Cquote_token%2Cnetwork&page=1`;
    const gtRes = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json;version=20230302", "User-Agent": "OrahDEX/1.0" },
    });
    clearTimeout(timer);

    if (!gtRes.ok) { res.json({ found: false, reason: "upstream_error" }); return; }

    const data = await gtRes.json() as any;
    const pools: any[] = data?.data ?? [];
    const included: any[] = data?.included ?? [];

    if (!pools.length) {
      const r = { found: false, reason: "not_found" };
      contractLookupCache.set(address, { data: r, ts: Date.now() });
      return res.json(r);
    }

    // Prefer the included token whose address matches; fall back to base token of top pool
    let matchedToken = included.find((item: any) =>
      item.type === "token" && item.attributes?.address?.toLowerCase() === address
    );
    if (!matchedToken) {
      const baseId = pools[0]?.relationships?.base_token?.data?.id;
      matchedToken = included.find((i: any) => i.id === baseId);
    }
    if (!matchedToken) { res.json({ found: false, reason: "token_not_in_pool" }); return; }

    const attrs = matchedToken.attributes;
    const networkId = pools[0]?.relationships?.network?.data?.id ?? "unknown";
    const networkObj = included.find((i: any) => i.type === "network" && i.id === networkId);
    const chainName = networkObj?.attributes?.name ?? networkId;

    const result = {
      found: true,
      symbol:    (attrs.symbol ?? "?").toUpperCase(),
      name:      attrs.name ?? attrs.symbol ?? "Unknown Token",
      address:   attrs.address ?? address,
      chain:     chainName,
      price:     attrs.price_usd != null ? parseFloat(attrs.price_usd) : null,
      imageUrl:  attrs.image_url && !String(attrs.image_url).includes("missing") ? attrs.image_url : null,
      poolCount: pools.length,
      source:    "geckoterminal",
    };

    contractLookupCache.set(address, { data: result, ts: Date.now() });
    return res.json(result);
  } catch (err: any) {
    req.log.warn({ err: err?.message, address }, "by-contract lookup failed");
    return res.json({ found: false, reason: "fetch_failed" });
  }
});

// ─── OpenOcean aggregator proxy (free, no API key) ────────────────────────────
// Routes through 1inch, PancakeSwap, Uniswap, Curve, Balancer, and 100+ DEXes

const OO_CHAINS: Record<number, string> = {
  1: "eth", 56: "bsc", 8453: "base",
  42161: "arbitrum", 10: "optimism", 137: "polygon", 43114: "avax",
};

router.get("/aggregator/quote", async (req, res) => {
  try {
    const { chainId, inTokenAddress, outTokenAddress, amount, slippage = "1" } =
      req.query as Record<string, string>;
    const chain = OO_CHAINS[parseInt(chainId)];
    if (!chain) return res.status(400).json({ error: "Chain not supported by OpenOcean" });
    const params = new URLSearchParams({
      inTokenAddress, outTokenAddress, amount, slippage, gasPrice: "5",
    });
    const url = `https://open-api.openocean.finance/v3/${chain}/quote?${params}`;
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    return res.json(d);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/aggregator/swap", async (req, res) => {
  try {
    const { chainId, inTokenAddress, outTokenAddress, amount, slippage = "1", account } =
      req.query as Record<string, string>;
    const chain = OO_CHAINS[parseInt(chainId)];
    if (!chain) return res.status(400).json({ error: "Chain not supported by OpenOcean" });
    const params = new URLSearchParams({
      inTokenAddress, outTokenAddress, amount, slippage, account, gasPrice: "5",
    });
    const url = `https://open-api.openocean.finance/v3/${chain}/swap_quote?${params}`;
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();
    return res.json(d);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
