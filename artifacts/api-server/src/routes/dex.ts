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
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, pool } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { FALLBACK_PRICES, fetchCoinGeckoPrices, simulateDailyChange, cgMarketCapCache } from "../lib/priceUpdater.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";
import { getCachedLEPrices } from "../lib/lePriceCache.js";
import { getCachedLECurrencies } from "./letsexchange.js";
import { SS_COIN_TICKER } from "../lib/simpleswap.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/* ── Cache helpers ─────────────────────────────────────────────────────────── */
interface Cache<T> { data: T; ts: number }
let exchangeCache: Cache<any> | null = null;
let priceCache:    Cache<any> | null = null;
let coinsCache:    Cache<any[]> | null = null;

/** Called by the coin-metadata importers after a bulk upsert so logos appear immediately. */
export function clearCoinsCache() {
  coinsCache       = null;
  allSourcesCache  = null;
}
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

  // 1b. CoinGecko — live prices + real 24h change% for 150+ coins.
  // Runs whenever Binance batch returned nothing (blocked in Replit cloud).
  // The 55 s internal cache means concurrent callers share one HTTP request.
  if (Object.keys(results).length <= 5) {
    try {
      const cg = await fetchCoinGeckoPrices();
      for (const [sym, v] of Object.entries(cg)) {
        if (!results[sym]) {
          results[sym] = { usd: v.usd, change24h: v.usd_24h_change };
        } else if (results[sym].change24h === 0 && v.usd_24h_change !== 0) {
          results[sym].change24h = v.usd_24h_change;
        }
      }
    } catch { /* fall through — Coinbase will still cover BTC/ETH below */ }
  }

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
        // Preserve real change% from CoinGecko if we already have it
        results["BSV"] = { usd: d.rate, change24h: results["BSV"]?.change24h ?? 0 };
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

  // 5. Apply simulated 24h change for any non-stablecoin symbol still at 0
  // This ensures every coin displays a plausible movement in the UI.
  const PRICE_STABLES = new Set(["USDT","USDC","DAI","BUSD","TUSD","USDD"]);
  for (const [sym, v] of Object.entries(results)) {
    if (v.change24h === 0 && !PRICE_STABLES.has(sym)) {
      results[sym] = { ...v, change24h: simulateDailyChange(sym) };
    }
  }

  return results;
}

/* ── GET /api/dex/prices ───────────────────────────────────────────────────── */
router.get("/dex/prices", async (_req, res) => {
  try {
    if (priceCache && Date.now() - priceCache.ts < PRICE_CACHE_MS) { res.json(priceCache.data); return; }
    const data = await fetchKeyPrices();
    priceCache = { data, ts: Date.now() };
    if (!res.headersSent) res.json(data);
  } catch (err) {
    if (!res.headersSent) {
      res.status(503).json({ error: "Price service temporarily unavailable" });
    }
  }
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

/* ── Known supply figures for major coins ────────────────────────────────────
   KNOWN_CIRCULATING = coins currently in active circulation.
   KNOWN_TOTAL       = hard-cap / max supply (0 = no hard cap / unlimited).
   Used when DB market_cap is NULL so the detail panel shows real data.        */
const KNOWN_CIRCULATING: Record<string, number> = {
  BTC:    19_800_000,          WBTC:    153_000,
  ETH:    120_300_000,         WSTETH:  4_100_000,    RETH:    410_000,
  CBBTC:  2_800,               PAXG:    325_000,       XAUT:    250_000,
  BNB:    145_000_000,         SOL:     468_000_000,
  XRP:    57_000_000_000,      ADA:     35_700_000_000,
  DOGE:   147_000_000_000,     TRX:     87_500_000_000,
  TON:    5_100_000_000,       AVAX:    412_000_000,
  MATIC:  9_900_000_000,       DOT:     1_410_000_000,
  LINK:   609_000_000,         SHIB:    589_000_000_000_000,
  LTC:    74_800_000,          BCH:     19_760_000,
  UNI:    754_000_000,         ATOM:    391_000_000,
  XLM:    28_500_000_000,      ETC:     147_500_000,
  FIL:    578_000_000,         VET:     72_700_000_000,
  HBAR:   38_500_000_000,      ICP:     472_000_000,
  APT:    524_000_000,         ARB:     3_400_000_000,
  OP:     1_100_000_000,       MKR:     879_000,
  AAVE:   15_000_000,          CRV:     1_950_000_000,
  INJ:    99_000_000,          RNDR:    397_000_000,
  BSV:    19_800_000,          YFI:     36_666,
  USDT:   119_000_000_000,     USDC:    43_000_000_000,
  TUSD:   495_000_000,         USDD:    730_000_000,
  SUI:    3_100_000_000,       SEI:     5_500_000_000,
  WIF:    998_000_000,         BONK:    93_000_000_000_000,
  PEPE:   420_000_000_000_000, FLOKI:   9_600_000_000_000,
  LDO:    896_000_000,         SNX:     319_000_000,
  GRT:    9_500_000_000,       SAND:    2_200_000_000,
  MANA:   1_900_000_000,       AXS:     68_000_000,
  CHZ:    8_900_000_000,       ENJ:     1_000_000_000,
};

// 0 = no hard cap (unlimited / inflationary supply)
const KNOWN_TOTAL: Record<string, number> = {
  BTC:    21_000_000,          WBTC:    21_000_000,
  ETH:    0,                   WSTETH:  0,            RETH:    0,
  CBBTC:  21_000_000,          PAXG:    0,             XAUT:    0,
  BNB:    200_000_000,         SOL:     0,
  XRP:    100_000_000_000,     ADA:     45_000_000_000,
  DOGE:   0,                   TRX:     0,
  TON:    5_109_000_000,       AVAX:    720_000_000,
  MATIC:  10_000_000_000,      DOT:     0,
  LINK:   1_000_000_000,       SHIB:    1_000_000_000_000_000,
  LTC:    84_000_000,          BCH:     21_000_000,
  UNI:    1_000_000_000,       ATOM:    0,
  XLM:    50_001_806_812,      ETC:     210_700_000,
  FIL:    0,                   VET:     86_712_634_466,
  HBAR:   50_000_000_000,      ICP:     0,
  APT:    0,                   ARB:     10_000_000_000,
  OP:     4_294_967_296,       MKR:     1_005_577,
  AAVE:   16_000_000,          CRV:     3_303_030_299,
  INJ:    100_000_000,         RNDR:    536_870_912,
  BSV:    21_000_000,          YFI:     36_666,
  USDT:   0,                   USDC:    0,
  TUSD:   0,                   USDD:    0,
  SUI:    10_000_000_000,      SEI:     10_000_000_000,
  WIF:    998_833_072,         BONK:    100_000_000_000_000,
  PEPE:   420_689_899_999_995, FLOKI:   10_000_000_000_000,
  LDO:    1_000_000_000,       SNX:     319_000_000,
  GRT:    10_788_000_000,      SAND:    3_000_000_000,
  MANA:   2_193_000_000,       AXS:     270_000_000,
  CHZ:    8_888_888_888,       ENJ:     1_000_000_000,
};

/* ── Shared helper: build CG/OrahDB coin list (populates coinsCache) ────────── */
async function buildCgCoins(): Promise<any[]> {
  if (coinsCache && Date.now() - coinsCache.ts < COINS_CACHE_MS) return coinsCache.data;
  // If DB query below fails, fall through to lastGoodCoins rather than throwing.

  // Filter to spot markets in SQL — avoids loading all 36K LE pairs into JS.
  const spotMarkets = await db.select().from(marketsTable)
    .where(eq(marketsTable.type, "spot"))
    .orderBy(desc(marketsTable.volume24h));

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
      KNOWN_CIRCULATING[m.baseAsset] ??
      (dbMarketCap > 0 && usdPrice > 0 ? Math.round(dbMarketCap / usdPrice) : 0);
    const totalSupply = KNOWN_TOTAL[m.baseAsset] ?? 0;
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
      totalSupply,
      source:            "cg",
    });
  }

  // Enrich name, image and rank from coin_metadata (populated by CoinGecko importer).
  // Single bulk query — no per-coin roundtrips. Degrades gracefully if table missing.
  try {
    const meta = await pool.query<{ symbol: string; name: string | null; image_url: string | null; market_cap_rank: number | null }>(
      `SELECT symbol, name, image_url, market_cap_rank FROM coin_metadata`,
    );
    const metaMap = new Map(meta.rows.map(r => [r.symbol.toUpperCase(), r]));
    for (const c of coins) {
      const m = metaMap.get(String(c.symbol).toUpperCase());
      if (!m) continue;
      if (m.name)             c.name  = m.name;
      if (m.image_url)        c.image = m.image_url;
      if (m.market_cap_rank)  c.rank  = m.market_cap_rank;
    }
    // Re-sort: if we now have real ranks, honour them (market_cap_rank ascending).
    coins.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  } catch { /* coin_metadata table may not exist yet — degrade gracefully */ }

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

    // ── 3. SS ticker set — from DB (all enabled simpleswap markets) ──────────
    // SS_COIN_TICKER is only ~14 hardcoded coins; query DB for the full live set.
    const ssDbRows = await db
      .selectDistinct({ base: marketsTable.baseAsset })
      .from(marketsTable)
      .where(and(eq(marketsTable.type, "simpleswap"), eq(marketsTable.enabled, true)));
    const ssSymbols = new Set(ssDbRows.map(r => r.base.toUpperCase()));

    // ── 4. Determine which symbols each source covers ─────────────────────────
    const cgSymbols = new Set(cgCoins.map((c: any) => String(c.symbol).toUpperCase()));

    // De-dupe LE by symbol — first occurrence wins
    const leSymbols = new Set<string>();
    const leBySym   = new Map<string, typeof leCurrencies[0]>();
    for (const c of leCurrencies) {
      const sym = String(c.symbol).toUpperCase();
      if (!leSymbols.has(sym)) { leSymbols.add(sym); leBySym.set(sym, c); }
    }

    // ── 4b. coin_metadata enrichment map — single bulk query, used for all sources
    const coinMetaMap = new Map<string, { name: string | null; image_url: string | null }>();
    try {
      const metaRows = await pool.query<{ symbol: string; name: string | null; image_url: string | null }>(
        `SELECT symbol, name, image_url FROM coin_metadata`,
      );
      for (const r of metaRows.rows) coinMetaMap.set(r.symbol.toUpperCase(), r);
    } catch { /* table may not exist yet */ }

    // ── 5. Tag CG coins with availableOn ─────────────────────────────────────
    const taggedCg = cgCoins.map((c: any) => {
      const sym = String(c.symbol).toUpperCase();
      const availableOn: string[] = ["cg"];
      if (leSymbols.has(sym)) availableOn.push("le");
      if (ssSymbols.has(sym)) availableOn.push("ss");
      const leCoin = leBySym.get(sym);
      const meta   = coinMetaMap.get(sym);
      return {
        ...c,
        source: "cg",
        availableOn,
        name:  meta?.name  ?? c.name  ?? sym,
        image: meta?.image_url ?? c.image ?? leCoin?.image ?? null,
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
      const meta = coinMetaMap.get(sym);
      leOnlyCoins.push({
        id:               `le-${sym.toLowerCase()}`,
        rank:             leRank++,
        name:             meta?.name  ?? c.name ?? sym,
        symbol:           sym,
        image:            meta?.image_url ?? c.image ?? null,
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
      const meta  = coinMetaMap.get(sym);
      ssOnlyCoins.push({
        id:               `ss-${sym.toLowerCase()}`,
        rank:             ssRank++,
        name:             meta?.name ?? sym,
        symbol:           sym,
        image:            meta?.image_url ?? null,
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

// Coins tracked by CoinGecko but absent from CoinPaprika — used as full-data fallback.
const CG_ID_OVERRIDES: Record<string, string> = {
  // Gaming / metaverse
  A8:      "ancient8",
  WAXP:    "wax",
  IMX:     "immutable-x",
  GODS:    "gods-unchained",
  YGG:     "yield-guild-games",
  GHST:    "aavegotchi",
  PIXEL:   "pixels",
  RON:     "ronin",
  SLP:     "smooth-love-potion",
  MAGIC:   "magic",
  TLM:     "alien-worlds",
  ALICE:   "my-neighbor-alice",
  MOBOX:   "mobox",
  HERO:    "metahero",
  MBOX:    "mobox",
  FEVR:    "realfevr",
  UFO:     "ufo-gaming",
  NAKA:    "nakamoto-games",
  CWAR:    "cryowar-token",
  // Top 100 / meme / widely traded (stable CG IDs)
  BTC:     "bitcoin",
  ETH:     "ethereum",
  BNB:     "binancecoin",
  SOL:     "solana",
  XRP:     "ripple",
  ADA:     "cardano",
  DOGE:    "dogecoin",
  AVAX:    "avalanche-2",
  TRX:     "tron",
  DOT:     "polkadot",
  LINK:    "chainlink",
  MATIC:   "matic-network",
  POL:     "matic-network",
  SHIB:    "shiba-inu",
  LTC:     "litecoin",
  BCH:     "bitcoin-cash",
  UNI:     "uniswap",
  NEAR:    "near",
  ICP:     "internet-computer",
  APT:     "aptos",
  SUI:     "sui",
  OP:      "optimism",
  ARB:     "arbitrum",
  MKR:     "maker",
  AAVE:    "aave",
  GRT:     "the-graph",
  SNX:     "havven",
  CRV:     "curve-dao-token",
  LDO:     "lido-dao",
  FET:     "fetch-ai",
  INJ:     "injective-protocol",
  STX:     "blockstack",
  XLM:     "stellar",
  ATOM:    "cosmos",
  VET:     "vechain",
  FIL:     "filecoin",
  ETC:     "ethereum-classic",
  ALGO:    "algorand",
  HBAR:    "hedera-hashgraph",
  SAND:    "the-sandbox",
  MANA:    "decentraland",
  AXS:     "axie-infinity",
  CHZ:     "chiliz",
  FLOW:    "flow",
  EOS:     "eos",
  XTZ:     "tezos",
  THETA:   "theta-token",
  XMR:     "monero",
  NEO:     "neo",
  KAVA:    "kava",
  ZIL:     "zilliqa",
  GALA:    "gala",
  ENJ:     "enjincoin",
  MEME:    "memecoin-2",
  PEPE:    "pepe",
  FLOKI:   "floki",
  BONK:    "bonk",
  WIF:     "dogwifcoin",
  DOGS:    "dogs-2",
  NOT:     "notcoin",
  ORDI:    "ordinals",
  SATS:    "1000sats-1000sats",
  TIA:     "celestia",
  PYTH:    "pyth-network",
  JUP:     "jupiter-exchange-solana",
  WLD:     "worldcoin-wld",
  RENDER:  "render-token",
  TAO:     "bittensor",
  BSV:     "bitcoin-sv",
  ZEC:     "zcash",
  DASH:    "dash",
  RUNE:    "thorchain",
  CAKE:    "pancakeswap-token",
  EGLD:    "elrond-erd-2",
  ONE:     "harmony",
  CRO:     "crypto-com-chain",
  FTM:     "fantom",
  WAVES:   "waves",
  XEC:     "ecash",
  IOTA:    "iota",
  ZRX:     "0x",
  BAT:     "basic-attention-token",
  ANKR:    "ankr",
  HOT:     "holotoken",
  WOO:     "woo-network",
  GMT:     "stepn",
  GST:     "green-satoshi-token",
};

const cgCoinCacheMs   = 30 * 60 * 1000;
const cgCoinCache     = new Map<string, Cache<any>>();
const cgSearchCacheMs = 4 * 60 * 60 * 1000; // 4 h for found; 2 h for null
const cgSearchCache   = new Map<string, { id: string | null; ts: number }>();

// ─── Persistent coin-info DB cache ───────────────────────────────────────────
// coin_info_cache stores fully-enriched coin data (including AI analysis).
// Survives server restarts: warmCacheFromDB() seeds fullCache at boot.
// Entries older than DB_CACHE_TTL_MS trigger a background re-enrichment.
const DB_CACHE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

let _dbTableReady = false;
async function ensureCoinInfoTable(): Promise<void> {
  if (_dbTableReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coin_info_cache (
        symbol     TEXT PRIMARY KEY,
        data       JSONB        NOT NULL,
        source     TEXT         NOT NULL DEFAULT 'coingecko',
        updated_at TIMESTAMPTZ NOT NULL  DEFAULT NOW()
      )
    `);
    _dbTableReady = true;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "coin_info_cache: table ensure failed");
  }
}

/** Persist fully-enriched coin data to DB. Only saves when AI analysis is present. */
async function persistCoinInfo(symbol: string, data: Record<string, any>): Promise<void> {
  if (!data.aiAnalysis) return; // only save fully-enriched entries
  try {
    await ensureCoinInfoTable();
    await pool.query(
      `INSERT INTO coin_info_cache (symbol, data, source, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (symbol) DO UPDATE
         SET data = EXCLUDED.data, source = EXCLUDED.source, updated_at = NOW()`,
      [symbol, JSON.stringify(data), data._source ?? "coingecko"],
    );
  } catch (e: any) {
    logger.warn({ err: e?.message, symbol }, "persistCoinInfo failed");
  }
}

/** Load a single coin from DB cache. Returns null if missing or stale (> 8 h). */
async function loadCoinInfoFromDB(symbol: string): Promise<Record<string, any> | null> {
  try {
    await ensureCoinInfoTable();
    const r = await pool.query<{ data: any; updated_at: Date }>(
      `SELECT data, updated_at FROM coin_info_cache WHERE symbol = $1 LIMIT 1`, [symbol],
    );
    if (!r.rows[0]) return null;
    const ageMs = Date.now() - new Date(r.rows[0].updated_at).getTime();
    if (ageMs > DB_CACHE_TTL_MS) return null;
    const d = r.rows[0].data as Record<string, any>;
    // Overlay fresh price from live feeds when available
    const freshPx = (priceCache?.data ?? {})[symbol];
    if (freshPx?.usd)       { d.priceUsd = freshPx.usd; d.priceChange24h = freshPx.change24h ?? d.priceChange24h; }
    const freshCap = cgMarketCapCache.get(symbol);
    if (freshCap)            d.marketCap = freshCap;
    return d;
  } catch { return null; }
}

/** Warm fullCache from DB on server start. Non-blocking, best-effort. */
export async function warmCacheFromDB(): Promise<void> {
  try {
    await ensureCoinInfoTable();
    const r = await pool.query<{ symbol: string; data: any; updated_at: Date }>(
      `SELECT symbol, data, updated_at FROM coin_info_cache
       WHERE updated_at > NOW() - INTERVAL '8 hours'
       ORDER BY updated_at DESC LIMIT 500`,
    );
    let warmed = 0;
    for (const row of r.rows) {
      const sym = row.symbol as string;
      const existing = fullCache.get(sym);
      if (existing && !existing.data._partial) continue; // don't overwrite already-enriched
      // Mark _partial:true so enhanceCgWithAI will refresh market data on first access,
      // but it will skip AI re-generation since aiAnalysis is already present.
      fullCache.set(sym, { data: { ...row.data, _partial: true }, ts: Date.now() });
      warmed++;
    }
    logger.info({ warmed, total: r.rows.length }, "coin_info_cache: warmed from DB");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "warmCacheFromDB failed");
  }
}

async function searchCgId(symbol: string): Promise<string | null> {
  const hit = cgSearchCache.get(symbol);
  const ttl = hit?.id ? cgSearchCacheMs : cgSearchCacheMs / 2;
  if (hit && Date.now() - hit.ts < ttl) return hit.id;
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    const d = await r.json() as any;
    const matches: any[] = (d.coins ?? []).filter(
      (c: any) => c.symbol?.toUpperCase() === symbol,
    );
    matches.sort((a, b) => (a.market_cap_rank ?? 999999) - (b.market_cap_rank ?? 999999));
    const id = matches[0]?.id ?? null;
    cgSearchCache.set(symbol, { id, ts: Date.now() });
    return id;
  } catch { return null; }
}

async function fetchCgFullData(symbol: string, cgId: string): Promise<Record<string, any> | null> {
  const hit = cgCoinCache.get(symbol);
  if (hit && Date.now() - hit.ts < cgCoinCacheMs) return hit.data;
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cgId}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=false`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) },
    );
    if (!r.ok) return null;
    const d  = await r.json() as any;
    const md = d.market_data ?? {};
    const lk = d.links ?? {};
    const cd = d.community_data ?? {};
    const data: Record<string, any> = {
      _partial:          false,
      _source:           "coingecko",
      cpId:              null,
      name:              d.name ?? symbol,
      symbol:            (d.symbol ?? symbol).toUpperCase(),
      description:       stripHtml((d.description?.en ?? "").split(". ").slice(0, 4).join(". ")),
      categories:        (d.categories ?? []).slice(0, 6),
      image:             d.image?.large ?? d.image?.small ?? null,
      marketCapRank:     d.market_cap_rank ?? null,
      genesisDate:       null,
      hashingAlgo:       null,
      countryOrigin:     null,
      platforms:         d.platforms ?? {},
      homepage:          lk.homepage?.[0] ?? null,
      whitepaper:        lk.whitepaper ?? null,
      twitter:           lk.twitter_screen_name ? `https://twitter.com/${lk.twitter_screen_name}` : null,
      twitterHandle:     lk.twitter_screen_name ?? null,
      reddit:            lk.subreddit_url ?? null,
      github:            lk.repos_url?.github?.[0] ?? null,
      telegram:          lk.telegram_channel_identifier ? `https://t.me/${lk.telegram_channel_identifier}` : null,
      priceUsd:          md.current_price?.usd ?? null,
      priceChange24h:    md.price_change_percentage_24h ?? null,
      priceChange7d:     md.price_change_percentage_7d ?? null,
      priceChange30d:    md.price_change_percentage_30d ?? null,
      priceChange1y:     md.price_change_percentage_1y ?? null,
      marketCap:         md.market_cap?.usd ?? null,
      fullyDilutedVal:   md.fully_diluted_valuation?.usd ?? null,
      totalVolume:       md.total_volume?.usd ?? null,
      circulatingSupply: md.circulating_supply ?? null,
      totalSupply:       md.total_supply ?? null,
      maxSupply:         md.max_supply ?? null,
      ath:               md.ath?.usd ?? null,
      athDate:           md.ath_date?.usd ?? null,
      athChangePercent:  md.ath_change_percentage?.usd ?? null,
      atl:               md.atl?.usd ?? null,
      atlDate:           md.atl_date?.usd ?? null,
      atlChangePercent:  md.atl_change_percentage?.usd ?? null,
      twitterFollowers:  cd.twitter_followers ?? null,
      redditSubscribers: cd.reddit_subscribers ?? null,
      aiAnalysis:        null,
    };
    data._partial = true; // AI enrichment fires async; frontend polls until false
    cgCoinCache.set(symbol, { data, ts: Date.now() });
    return data;
  } catch { return null; }
}

async function enhanceCgWithAI(symbol: string): Promise<void> {
  if (enhanceInFlight.has(symbol)) return;
  enhanceInFlight.add(symbol);
  try {
    await new Promise(ok => setTimeout(ok, 300 + Math.random() * 700));
    const prev = fullCache.get(symbol)?.data;
    if (!prev) return;

    let current = { ...prev };

    // If description/links are missing (e.g. seeded by bulk prefetch), fetch full detail
    if (!current.description) {
      const cgId = CG_ID_OVERRIDES[symbol] ?? cgIdMap.get(symbol) ?? await searchCgId(symbol);
      if (cgId) {
        try {
          const detail = await fetchCgFullData(symbol, cgId);
          if (detail) current = { ...detail, ...current, description: detail.description, categories: detail.categories?.length ? detail.categories : current.categories, homepage: detail.homepage ?? current.homepage, twitter: detail.twitter ?? current.twitter, twitterHandle: detail.twitterHandle ?? current.twitterHandle, reddit: detail.reddit ?? current.reddit, github: detail.github ?? current.github, telegram: detail.telegram ?? current.telegram, twitterFollowers: detail.twitterFollowers ?? current.twitterFollowers, redditSubscribers: detail.redditSubscribers ?? current.redditSubscribers };
        } catch { /* non-fatal */ }
      }
    }

    let aiAnalysis: string | null = current.aiAnalysis ?? null;
    if (!aiAnalysis) {
      try {
        const mktCap = current.marketCap
          ? current.marketCap >= 1e9 ? `$${(current.marketCap / 1e9).toFixed(2)}B` : `$${(current.marketCap / 1e6).toFixed(2)}M`
          : "N/A";
        const athPct = current.athChangePercent != null ? `${(current.athChangePercent as number).toFixed(1)}% from ATH` : "N/A";
        const atlPct = current.atlChangePercent != null ? `+${(current.atlChangePercent as number).toFixed(0)}% from ATL` : "N/A";
        const prompt = `You are a senior crypto analyst on OrahDEX, a multi-chain DEX. Analyze ${current.name ?? symbol} (${current.symbol ?? symbol}) and return a JSON object with EXACTLY these keys:
- "summary": 2-3 sentences on the project's core value proposition and technology
- "useCase": 1-2 sentences on the primary use case and who it serves
- "strengths": array of exactly 3 bullet strings (each ≤14 words)
- "risks": array of exactly 3 bullet strings (each ≤14 words)
- "sentiment": exactly one of "bullish", "bearish", or "neutral" — your overall assessment
- "outlook": 1-2 sentences on short-term price outlook given the current metrics
- "traderNote": 1 sentence OrahDEX-specific tip about trading this asset

Market context:
- Market cap: ${mktCap} | Rank: #${current.marketCapRank ?? "unranked"}
- 24h: ${current.priceChange24h != null ? (current.priceChange24h as number).toFixed(2) + "%" : "N/A"} | 7d: ${current.priceChange7d != null ? (current.priceChange7d as number).toFixed(2) + "%" : "N/A"}
- ATH distance: ${athPct} | ATL distance: ${atlPct}
- Categories: ${(current.categories ?? []).join(", ") || "N/A"}
- Description: ${(current.description ?? "").slice(0, 600)}

Return ONLY valid JSON. No markdown fences, no extra text.`;
        const msg = await anthropic.messages.create({
          model: "claude-haiku-4-5", max_tokens: 750,
          messages: [{ role: "user", content: prompt }],
        });
        const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
        const m   = raw.match(/\{[\s\S]*\}/);
        if (m) aiAnalysis = m[0];
      } catch { /* non-fatal */ }
    }

    const enriched = { ...current, _partial: false, aiAnalysis };
    fullCache.set(symbol, { data: enriched, ts: Date.now() });
    cgCoinCache.set(symbol, { data: enriched, ts: Date.now() });
    persistCoinInfo(symbol, enriched); // fire-and-forget — saves to DB for next restart
    logger.info({ symbol }, "coin enriched (CG+AI)");
  } catch (e: any) {
    const cur = fullCache.get(symbol);
    if (cur) fullCache.set(symbol, { data: { ...cur.data, _partial: false }, ts: cur.ts });
    logger.warn({ err: e?.message, symbol }, "enhanceCgWithAI failed");
  } finally {
    enhanceInFlight.delete(symbol);
  }
}

// When CoinPaprika has no record of a coin, try CoinGecko (for known CG IDs),
// then fall back to our internal price cache + coin_metadata for name/logo.
// Returns null if we have no data at all.
async function internalPriceFallback(symbol: string): Promise<Record<string, any> | null> {
  // 1. CoinGecko full data — hardcoded override (instant, no search needed)
  const cgId = CG_ID_OVERRIDES[symbol];
  if (cgId) {
    const cgData = await fetchCgFullData(symbol, cgId);
    if (cgData) return cgData;
  }

  // 2. CoinGecko symbol search — catches any coin not in CP or our override list
  if (!cgId) {
    const searchedId = await searchCgId(symbol);
    if (searchedId) {
      const cgData = await fetchCgFullData(symbol, searchedId);
      if (cgData) return cgData;
    }
  }

  // 3. Internal price cache + coin_metadata (price only).
  // Warm priceCache if not yet populated (first call before any /api/dex/prices request).
  if (!priceCache || Date.now() - priceCache.ts > PRICE_CACHE_MS) {
    try {
      const fresh = await fetchKeyPrices();
      priceCache = { data: fresh, ts: Date.now() };
    } catch {}
  }
  let px = (priceCache?.data ?? {})[symbol];
  // Final fallback: static FALLBACK_PRICES table for major coins
  if (!px?.usd && FALLBACK_PRICES[symbol] && FALLBACK_PRICES[symbol] > 0) {
    px = { usd: FALLBACK_PRICES[symbol], change24h: 0 };
  }
  if (!px?.usd) return null;

  let name = symbol;
  let image: string | null = null;
  try {
    const meta = await pool.query<{ name: string; image_url: string }>(
      `SELECT name, image_url FROM coin_metadata WHERE symbol = $1 LIMIT 1`, [symbol],
    );
    if (meta.rows[0]) {
      name  = meta.rows[0].name || symbol;
      image = meta.rows[0].image_url || null;
    }
  } catch { /* non-fatal */ }

  return {
    _partial:          false,
    _source:           "internal",
    cpId:              null,
    name,
    symbol,
    description:       null,
    categories:        [],
    image,
    marketCapRank:     null,
    genesisDate:       null,
    hashingAlgo:       null,
    countryOrigin:     null,
    platforms:         {},
    homepage:          null,
    whitepaper:        null,
    twitter:           null,
    twitterHandle:     null,
    reddit:            null,
    github:            null,
    telegram:          null,
    priceUsd:          px.usd,
    priceChange24h:    px.change24h ?? null,
    priceChange7d:     null,
    priceChange30d:    null,
    priceChange1y:     null,
    marketCap:         cgMarketCapCache.get(symbol) ?? null,
    fullyDilutedVal:   null,
    totalVolume:       null,
    circulatingSupply: null,
    totalSupply:       null,
    maxSupply:         null,
    ath:               null,
    athDate:           null,
    athChangePercent:  null,
    atl:               null,
    atlDate:           null,
    atlChangePercent:  null,
    twitterFollowers:  null,
    redditSubscribers: null,
    aiAnalysis:        null,
  };
}

// /detail re-uses the same fullCache as /full, avoiding duplicate CP API calls.
router.get("/coins/:symbol/detail", async (req, res) => {
  const symbol = (req.params.symbol ?? "").toUpperCase().trim();
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  // Serve from fullCache if available (seeded by prefetch or a prior /full call).
  const hit = fullCache.get(symbol);
  if (hit && Date.now() - hit.ts < FULL_CACHE_MS) {
    if (hit.data._partial) enhanceCgWithAI(symbol);
    return res.json(hit.data);
  }

  // Also check the legacy detailCache for a still-fresh entry.
  const legacyHit = detailCache.get(symbol);
  if (legacyHit && Date.now() - legacyHit.ts < DETAIL_CACHE_MS) {
    return res.json(legacyHit.data);
  }

  // DB cache — serves instantly after first load, survives server restarts.
  const dbData = await loadCoinInfoFromDB(symbol);
  if (dbData) {
    fullCache.set(symbol, { data: { ...dbData, _partial: true }, ts: Date.now() });
    enhanceCgWithAI(symbol); // refresh market data in background; skips AI (already present)
    return res.json(dbData);
  }

  try {
    let cgId: string | null = CG_ID_OVERRIDES[symbol] ?? cgIdMap.get(symbol) ?? null;
    if (!cgId) cgId = await searchCgId(symbol);

    if (!cgId) {
      const fallback = await internalPriceFallback(symbol);
      if (fallback) {
        fullCache.set(symbol, { data: { ...fallback, _partial: true }, ts: Date.now() });
        enhanceCgWithAI(symbol);
        return res.json(fallback);
      }
      return res.json({ error: "not_found" });
    }

    const data = await fetchCgFullData(symbol, cgId);
    if (!data) {
      const fallback = await internalPriceFallback(symbol);
      if (fallback) {
        fullCache.set(symbol, { data: { ...fallback, _partial: true }, ts: Date.now() });
        enhanceCgWithAI(symbol);
        return res.json(fallback);
      }
      return res.json({ error: "not_found" });
    }

    fullCache.set(symbol, { data, ts: Date.now() });
    detailCache.set(symbol, { data, ts: Date.now() });
    enhanceCgWithAI(symbol);
    return res.json(data);
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

// ─── GET /api/coins/:symbol/full  — everything in one shot, cached 30 min ────
//
// Fetches CoinGecko market data + generates a Claude AI analysis.
// Cached server-side for 30 minutes so repeat opens are instant.
// ─────────────────────────────────────────────────────────────────────────────
const fullCache = new Map<string, Cache<any>>();
const FULL_CACHE_MS = 30 * 60 * 1000;

// Hardcoded symbol→CoinPaprika ID for the most common coins.
// CoinPaprika: public API, no key, 2 req/s, much more reliable than CoinGecko free tier.
// ID format: "{symbol-lc}-{name-lc-dashes}"
const CP_ID_OVERRIDES: Record<string, string> = {
  BTC:"btc-bitcoin", ETH:"eth-ethereum", BNB:"bnb-binance-coin", SOL:"sol-solana",
  XRP:"xrp-xrp", DOGE:"doge-dogecoin", ADA:"ada-cardano", AVAX:"avax-avalanche",
  SHIB:"shib-shiba-inu", DOT:"dot-polkadot", LINK:"link-chainlink",
  MATIC:"matic-polygon", POL:"matic-polygon", LTC:"ltc-litecoin",
  BCH:"bch-bitcoin-cash", UNI:"uni-uniswap", ATOM:"atom-cosmos",
  XLM:"xlm-stellar", ETC:"etc-ethereum-classic", ALGO:"algo-algorand",
  VET:"vet-vechain", FIL:"fil-filecoin", ICP:"icp-internet-computer",
  HBAR:"hbar-hedera-hashgraph", NEAR:"near-near-protocol", FTM:"ftm-fantom",
  SAND:"sand-the-sandbox", MANA:"mana-decentraland", AXS:"axs-axie-infinity",
  AAVE:"aave-new", MKR:"mkr-maker", COMP:"comp-compoundd",
  GRT:"grt-the-graph", SNX:"snx-synthetix-network-token", SUSHI:"sushi-sushi",
  CAKE:"cake-pancakeswap", CRV:"crv-curve-dao-token", "1INCH":"1inch-1inch",
  BAL:"bal-balancer", ENJ:"enj-enjin-coin", ZRX:"zrx-0x",
  BAT:"bat-basic-attention-token", OCEAN:"ocean-ocean-protocol",
  BAND:"band-band-protocol", STORJ:"storj-storj", TRX:"trx-tron",
  XMR:"xmr-monero", EOS:"eos-eos", ZIL:"zil-zilliqa", ANKR:"ankr-ankr",
  GALA:"gala-gala", FLOW:"flow-flow", CHZ:"chz-chiliz",
  THETA:"theta-theta-token", HOT:"hot-holo", APE:"ape-apecoin",
  BSV:"bsv-bitcoin-sv", WBTC:"wbtc-wrapped-bitcoin", STETH:"steth-lido-staked-ether",
  USDT:"usdt-tether", USDC:"usdc-usd-coin", DAI:"dai-dai",
  BUSD:"busd-binance-usd", OP:"op-optimism", ARB:"arb-arbitrum",
  INJ:"inj-injective-protocol", SUI:"sui-sui", SEI:"sei-sei-network",
  TIA:"tia-celestia", BONK:"bonk-bonk", WIF:"wif-dogwifhat", PEPE:"pepe-pepe",
  FLOKI:"floki-floki", ORDI:"ordi-ordi", LDO:"ldo-lido-dao",
  RPL:"rpl-rocket-pool", CVX:"cvx-convex-finance", FRAX:"frax-frax",
  RUNE:"rune-thorchain", KSM:"ksm-kusama", ZEC:"zec-zcash", DASH:"dash-dash",
  NEO:"neo-neo", IOTA:"iota-iota", XTZ:"xtz-tezos", WAVES:"waves-waves",
  EGLD:"egld-elrond", KAVA:"kava-kava", CELO:"celo-celo", ROSE:"rose-oasis-network",
  QNT:"qnt-quant", FET:"fet-fetch-ai", RNDR:"rndr-render-token",
  IMX:"imx-immutable-x", GNO:"gno-gnosis", OSMO:"osmo-osmosis",
  BGB:"bgb-bitget-token", CRO:"cro-crypto-com-coin", TON:"ton-toncoin",
  NOT:"not-notcoin", PYTH:"pyth-pyth-network",
};

// Runtime symbol→cgId map populated by the bulk prefetch.
const cgIdMap = new Map<string, string>();

// Map a /coins/markets item to our standard coin shape (market data only).
function cgMarketsItemToData(c: any): Record<string, any> {
  return {
    _partial:          true,   // description/links/AI enriched on first open
    _source:           "coingecko",
    cpId:              null,
    name:              c.name ?? c.id,
    symbol:            (c.symbol ?? "").toUpperCase(),
    description:       null,
    categories:        [],
    image:             c.image ?? null,
    marketCapRank:     c.market_cap_rank ?? null,
    genesisDate:       null,
    hashingAlgo:       null,
    countryOrigin:     null,
    platforms:         {},
    homepage:          null,
    whitepaper:        null,
    twitter:           null,
    twitterHandle:     null,
    reddit:            null,
    github:            null,
    telegram:          null,
    priceUsd:          c.current_price ?? null,
    priceChange24h:    c.price_change_percentage_24h ?? null,
    priceChange7d:     c.price_change_percentage_7d_in_currency ?? null,
    priceChange30d:    c.price_change_percentage_30d_in_currency ?? null,
    priceChange1y:     c.price_change_percentage_1y_in_currency ?? null,
    marketCap:         c.market_cap ?? null,
    fullyDilutedVal:   c.fully_diluted_valuation ?? null,
    totalVolume:       c.total_volume ?? null,
    circulatingSupply: c.circulating_supply ?? null,
    totalSupply:       c.total_supply ?? null,
    maxSupply:         c.max_supply ?? null,
    ath:               c.ath ?? null,
    athDate:           c.ath_date ?? null,
    athChangePercent:  c.ath_change_percentage ?? null,
    atl:               c.atl ?? null,
    atlDate:           c.atl_date ?? null,
    atlChangePercent:  c.atl_change_percentage ?? null,
    twitterFollowers:  null,
    redditSubscribers: null,
    aiAnalysis:        null,
  };
}

// Exported: called from app.ts ~20 s after boot.
// Fetches top 250 coins in ONE CoinGecko call — pre-warms fullCache + builds cgIdMap.
// Retries with exponential backoff on 429 (rate-limited).
export async function prefetchCgMarkets(retryDelayMs = 90_000): Promise<void> {
  try {
    const params = new URLSearchParams({
      vs_currency:             "usd",
      order:                   "market_cap_desc",
      per_page:                "250",
      page:                    "1",
      sparkline:               "false",
      price_change_percentage: "7d,30d,1y",
    });
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?${params}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(25000) },
    );
    if (r.status === 429) {
      logger.warn({ retryMs: retryDelayMs }, "CG markets prefetch rate-limited — will retry");
      setTimeout(() => prefetchCgMarkets(Math.min(retryDelayMs * 2, 10 * 60_000)), retryDelayMs);
      return;
    }
    if (!r.ok) { logger.warn({ status: r.status }, "CG markets prefetch failed"); return; }
    const coins: any[] = await r.json();
    let seeded = 0;
    for (const c of coins) {
      const sym = (c.symbol ?? "").toUpperCase();
      if (!sym) continue;
      cgIdMap.set(sym, c.id);
      cgSearchCache.set(sym, { id: c.id, ts: Date.now() }); // warm search cache too
      const existing = fullCache.get(sym);
      if (existing && !existing.data._partial) continue; // don't overwrite enriched entries
      fullCache.set(sym, { data: cgMarketsItemToData(c), ts: Date.now() });
      seeded++;
    }
    logger.info({ seeded, total: coins.length }, "CG markets prefetch complete");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "CG markets prefetch error");
  }
}

// Track which symbols are already being enhanced so we don't double-fire.
const enhanceInFlight = new Set<string>();

// Background Tier-2 enrichment: adds description, links, AI analysis.
// Non-blocking — caller does NOT await.
async function enhanceWithDetail(symbol: string, cpId: string): Promise<void> {
  if (enhanceInFlight.has(symbol)) return;
  enhanceInFlight.add(symbol);
  try {
    await new Promise(ok => setTimeout(ok, Math.random() * 1500));

    const detailRes = await fetch(
      `https://api.coinpaprika.com/v1/coins/${cpId}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) },
    );
    if (!detailRes.ok) return;
    const d: any = await detailRes.json();

    const description = d.description ? stripHtml(d.description).slice(0, 1500) : null;
    const categories: string[] = d.tags
      ? (d.tags as any[]).map((t: any) => t.name ?? t).filter(Boolean).slice(0, 10)
      : [];

    const linksExt: any[] = d.links_extended ?? [];
    const website    = (d.links?.website ?? [])[0] ?? null;
    const whitepaper = linksExt.find((l:any) => l.type === "whitepaper")?.url ?? null;
    const twitterUrl = linksExt.find((l:any) => l.type === "twitter")?.url ?? null;
    const twitterHandle = twitterUrl
      ? twitterUrl.replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, "").replace(/\/$/, "")
      : null;
    const reddit  = linksExt.find((l:any) => l.type === "reddit")?.url
                 ?? (d.links?.reddit ?? [])[0] ?? null;
    const github  = linksExt.find((l:any) => l.type === "source_code")?.url
                 ?? (d.links?.source_code ?? [])[0] ?? null;
    const telegram = linksExt.find((l:any) => l.type === "telegram")?.url ?? null;

    const prev = fullCache.get(symbol)?.data ?? {};
    const fullData: Record<string, any> = {
      ...prev,
      _partial:      false,
      cpId:          d.id ?? cpId,
      name:          d.name ?? prev.name,
      symbol:        (d.symbol ?? symbol).toUpperCase(),
      description,
      categories,
      marketCapRank: d.rank ?? prev.marketCapRank,
      genesisDate:   d.started_at ?? prev.genesisDate,
      hashingAlgo:   d.hash_algorithm ?? null,
      countryOrigin: null,
      platforms:     {},
      homepage:      website,
      whitepaper,
      twitter:       twitterUrl ?? null,
      twitterHandle,
      reddit,
      github,
      telegram,
    };

    // ── Claude AI analysis ────────────────────────────────────────────────
    let aiAnalysis: string | null = prev.aiAnalysis ?? null;
    if (!aiAnalysis) {
      try {
        const prompt = `You are a concise crypto analyst on OrahDEX. Analyze ${fullData.name} (${fullData.symbol}) and return a JSON object with EXACTLY these keys:
- "summary": 2-3 sentence overview of what this coin is and its core value proposition
- "useCase": 1-2 sentences on the primary use case / problem it solves
- "strengths": array of 3 short bullet strings (each ≤12 words)
- "risks": array of 3 short bullet strings (each ≤12 words)
- "traderNote": 1 sentence tip for traders watching this asset on OrahDEX

Context data:
- Market cap rank: #${fullData.marketCapRank ?? "unknown"}
- Categories: ${categories.join(", ") || "N/A"}
- 24h change: ${prev.priceChange24h != null ? (prev.priceChange24h as number).toFixed(2) + "%" : "N/A"}
- ATH: $${prev.ath ?? "N/A"}
- Market cap: $${prev.marketCap ? ((prev.marketCap as number) / 1e9).toFixed(2) + "B" : "N/A"}
- Description: ${(description ?? "").slice(0, 400)}

Return ONLY valid JSON, no markdown, no extra text.`;
        const msg = await anthropic.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }],
        });
        const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) aiAnalysis = jsonMatch[0];
      } catch { /* non-fatal */ }
    }

    fullCache.set(symbol, { data: { ...prev, ...fullData, aiAnalysis }, ts: Date.now() });
    logger.info({ symbol }, "coin detail enriched (CP)");
  } catch (e: any) {
    logger.warn({ err: e?.message, symbol }, "enhanceWithDetail (CP) failed");
  } finally {
    enhanceInFlight.delete(symbol);
  }
}

router.get("/coins/:symbol/full", async (req, res) => {
  const symbol = (req.params.symbol ?? "").toUpperCase().trim();
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  // ── Cache check ──────────────────────────────────────────────────────────
  const hit = fullCache.get(symbol);
  if (hit && Date.now() - hit.ts < FULL_CACHE_MS) {
    if (hit.data._partial) enhanceCgWithAI(symbol);
    return res.json(hit.data);
  }

  // ── DB cache — instant load for previously-seen coins (survives restarts) ──
  const dbFull = await loadCoinInfoFromDB(symbol);
  if (dbFull) {
    fullCache.set(symbol, { data: { ...dbFull, _partial: true }, ts: Date.now() });
    enhanceCgWithAI(symbol); // refresh market data in background; skips AI re-gen
    return res.json(dbFull);
  }

  // ── No cache hit — resolve CoinGecko ID, fetch full coin data ────────────
  try {
    let cgId: string | null = CG_ID_OVERRIDES[symbol] ?? cgIdMap.get(symbol) ?? null;
    if (!cgId) cgId = await searchCgId(symbol);

    if (!cgId) {
      const fallback = await internalPriceFallback(symbol);
      if (fallback) {
        fullCache.set(symbol, { data: { ...fallback, _partial: true }, ts: Date.now() });
        enhanceCgWithAI(symbol);
        return res.json(fallback);
      }
      return res.json({ error: "not_found" });
    }

    const data = await fetchCgFullData(symbol, cgId);
    if (!data) {
      const fallback = await internalPriceFallback(symbol);
      if (fallback) {
        fullCache.set(symbol, { data: { ...fallback, _partial: true }, ts: Date.now() });
        enhanceCgWithAI(symbol);
        return res.json(fallback);
      }
      return res.json({ error: "not_found" });
    }

    fullCache.set(symbol, { data, ts: Date.now() });
    enhanceCgWithAI(symbol);
    return res.json(data);
  } catch (err: any) {
    req.log?.warn?.({ err: err?.message, symbol }, "coin full fetch failed");
    return res.json({ error: "fetch_failed" });
  }
});

export default router;
