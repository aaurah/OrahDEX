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

const router: IRouter = Router();

/* ── Cache helpers ─────────────────────────────────────────────────────────── */
interface Cache<T> { data: T; ts: number }
let exchangeCache: Cache<any> | null = null;
let priceCache:    Cache<any> | null = null;
let coinsCache:    Cache<any[]> | null = null;
const EXCHANGE_CACHE_MS = 10 * 60 * 1000;
const PRICE_CACHE_MS    = 60 * 1000;
const COINS_CACHE_MS    = 2 * 60 * 1000;

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
  };
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
        _lastKnownBsvUsd = d.rate; // persist for next call
        results["BSV"] = { usd: d.rate, change24h: 0 };
      }
    }
  } catch {}
  if (!results["BTC"]) results["BTC"] = { usd: FALLBACK_PRICES["BTC"] ?? 70000, change24h: 0 };
  if (!results["ETH"]) results["ETH"] = { usd: FALLBACK_PRICES["ETH"] ?? 2152,  change24h: 0 };
  // Use last-known-good BSV price rather than hardcoded fallback when WOC is unreachable
  if (!results["BSV"]) results["BSV"] = { usd: _lastKnownBsvUsd, change24h: 0 };

  // Ensure full cross-asset coverage for all tracked markets.
  for (const [symbol, usd] of Object.entries(FALLBACK_PRICES)) {
    if (usd <= 0) continue;
    if (!results[symbol]) {
      results[symbol] = { usd, change24h: 0 };
    }
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

/* ── GET /api/coins/markets ────────────────────────────────────────────────── */
router.get("/coins/markets", async (req, res) => {
  const page    = Math.max(1, parseInt(String(req.query.page     ?? "1")));
  const perPage = Math.min(250, Math.max(1, parseInt(String(req.query.per_page ?? "250"))));

  if (coinsCache && Date.now() - coinsCache.ts < COINS_CACHE_MS) {
    const start = (page - 1) * perPage;
    return res.json(coinsCache.data.slice(start, start + perPage));
  }

  try {
    const markets = await db
      .select()
      .from(marketsTable)
      .orderBy(desc(marketsTable.volume24h));

    const spotMarkets = markets.filter(m => m.type === "spot");

    // ── Step 1: Build a USD-price map preferring USDT/USDC-quoted markets ──────
    // This ensures that e.g. BTC shows ~$83k, not the BTC/CRO cross-rate in CRO.
    const STABLE_QUOTES = new Set(["USDT", "USDC", "TUSD", "BUSD", "USDD", "USD"]);
    const usdPriceMap = new Map<string, { market: typeof spotMarkets[0]; usdPrice: number }>();

    // Pass 1: stable-quoted markets are canonical USD prices
    for (const m of spotMarkets) {
      if (!STABLE_QUOTES.has(m.quoteAsset)) continue;
      const p = parseFloat(m.lastPrice ?? "0");
      if (!p || !Number.isFinite(p)) continue;
      const existing = usdPriceMap.get(m.baseAsset);
      const vol = parseFloat(m.volume24h ?? "0");
      if (!existing || vol > parseFloat(existing.market.volume24h ?? "0")) {
        usdPriceMap.set(m.baseAsset, { market: m, usdPrice: p });
      }
    }

    // Pass 2: for coins with no stable quote, fall back to highest-volume market
    for (const m of spotMarkets) {
      if (usdPriceMap.has(m.baseAsset)) continue;
      const p = parseFloat(m.lastPrice ?? "0");
      if (!p || !Number.isFinite(p)) continue;
      const existing = usdPriceMap.get(m.baseAsset);
      const vol = parseFloat(m.volume24h ?? "0");
      if (!existing || vol > parseFloat(existing.market.volume24h ?? "0")) {
        usdPriceMap.set(m.baseAsset, { market: m, usdPrice: p });
      }
    }

    // ── Step 2: Build coin list sorted by volume of the representative market ──
    const sorted = [...usdPriceMap.values()].sort(
      (a, b) => parseFloat(b.market.volume24h ?? "0") - parseFloat(a.market.volume24h ?? "0")
    );

    const coins: any[] = [];
    let rank = 1;
    for (const { market: m, usdPrice } of sorted) {
      const change24h = parseFloat(m.priceChangePercent24h ?? "0");
      const vol24h    = parseFloat(m.volume24h ?? "0");
      const high24h   = parseFloat(m.high24h ?? "0");
      const low24h    = parseFloat(m.low24h  ?? "0");

      coins.push({
        id:            `orah-${m.baseAsset.toLowerCase()}`,
        rank,
        name:          m.baseAsset,
        symbol:        m.baseAsset,
        image:         null,
        price:         usdPrice,
        marketCap:     parseFloat(m.marketCap ?? "0") || usdPrice * 10_000_000,
        volume24h:     vol24h,
        change24h,
        high24h:       high24h || usdPrice * 1.02,
        low24h:        low24h  || usdPrice * 0.98,
        circulatingSupply: 0,
        source:        "orahdex",
      });
      rank++;
    }

    coinsCache = { data: coins, ts: Date.now() };
    const start = (page - 1) * perPage;
    return res.json(coins.slice(start, start + perPage));
  } catch (err: any) {
    req.log.error({ err }, "Failed to build coins/markets from own DB");
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
    const symbol = id.replace(/^orah-/, "").toUpperCase();
    const markets = await db
      .select()
      .from(marketsTable)
      .where(eq(marketsTable.baseAsset, symbol));

    const tickers = markets.map(m => ({
      exchangeId:    "orahdex",
      exchangeName:  "OrahDEX",
      exchangeLogo:  null,
      base:          m.baseAsset,
      target:        m.quoteAsset,
      price:         parseFloat(m.lastPrice ?? "0"),
      volume:        parseFloat(m.volume24h ?? "0"),
      spread:        null,
      trustScore:    "green",
      tradeUrl:      `https://orahdex.org/spot/${m.baseAsset}-${m.quoteAsset}`,
      convertedLast: parseFloat(m.lastPrice ?? "0"),
      convertedVol:  parseFloat(m.volume24h ?? "0"),
      isAnomaly:     false,
      isStale:       false,
    }));

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
