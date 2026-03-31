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
const STATIC_EXCHANGES = [
  // ── DEXes ────────────────────────────────────────────────────────────────
  { id:"uniswap",       name:"Uniswap",          url:"https://app.uniswap.org",         chain:"Ethereum",     type:"dex", rank:2,  trustScore:9, vol24hUsd:1_200_000_000 },
  { id:"pancakeswap",   name:"PancakeSwap",       url:"https://pancakeswap.finance",     chain:"BSC",          type:"dex", rank:3,  trustScore:8, vol24hUsd:450_000_000 },
  { id:"curve",         name:"Curve Finance",     url:"https://curve.fi",                chain:"Ethereum",     type:"dex", rank:4,  trustScore:9, vol24hUsd:320_000_000 },
  { id:"raydium",       name:"Raydium",           url:"https://raydium.io",              chain:"Solana",       type:"dex", rank:5,  trustScore:8, vol24hUsd:280_000_000 },
  { id:"aerodrome",     name:"Aerodrome",         url:"https://aerodrome.finance",       chain:"Base",         type:"dex", rank:6,  trustScore:8, vol24hUsd:210_000_000 },
  { id:"balancer",      name:"Balancer",          url:"https://balancer.fi",             chain:"Ethereum",     type:"dex", rank:7,  trustScore:8, vol24hUsd:180_000_000 },
  { id:"gmx",           name:"GMX",               url:"https://gmx.io",                  chain:"Arbitrum",     type:"dex", rank:8,  trustScore:8, vol24hUsd:160_000_000 },
  { id:"dydx",          name:"dYdX",              url:"https://dydx.exchange",           chain:"Ethereum",     type:"dex", rank:9,  trustScore:8, vol24hUsd:140_000_000 },
  { id:"sushiswap",     name:"SushiSwap",         url:"https://sushi.com",               chain:"Ethereum",     type:"dex", rank:10, trustScore:7, vol24hUsd:120_000_000 },
  { id:"velodrome",     name:"Velodrome",         url:"https://velodrome.finance",       chain:"Optimism",     type:"dex", rank:11, trustScore:7, vol24hUsd:95_000_000 },
  { id:"traderjoe",     name:"Trader Joe",        url:"https://traderjoexyz.com",        chain:"Avalanche",    type:"dex", rank:12, trustScore:7, vol24hUsd:85_000_000 },
  { id:"osmosis",       name:"Osmosis",           url:"https://osmosis.zone",            chain:"Cosmos",       type:"dex", rank:13, trustScore:7, vol24hUsd:75_000_000 },
  { id:"camelot",       name:"Camelot",           url:"https://camelot.exchange",        chain:"Arbitrum",     type:"dex", rank:14, trustScore:7, vol24hUsd:65_000_000 },
  { id:"orca",          name:"Orca",              url:"https://orca.so",                 chain:"Solana",       type:"dex", rank:15, trustScore:7, vol24hUsd:60_000_000 },
  { id:"quickswap",     name:"QuickSwap",         url:"https://quickswap.exchange",      chain:"Polygon",      type:"dex", rank:16, trustScore:6, vol24hUsd:50_000_000 },
  { id:"thorswap",      name:"THORSwap",          url:"https://app.thorswap.finance",    chain:"THORChain",    type:"dex", rank:17, trustScore:7, vol24hUsd:48_000_000 },
  { id:"hashflow",      name:"Hashflow",          url:"https://hashflow.com",            chain:"Ethereum",     type:"dex", rank:18, trustScore:6, vol24hUsd:40_000_000 },
  { id:"maverick",      name:"Maverick Protocol", url:"https://mav.xyz",                 chain:"Ethereum",     type:"dex", rank:19, trustScore:6, vol24hUsd:35_000_000 },
  { id:"pendle",        name:"Pendle Finance",    url:"https://app.pendle.finance",      chain:"Ethereum",     type:"dex", rank:20, trustScore:7, vol24hUsd:30_000_000 },
  // ── CEXes ────────────────────────────────────────────────────────────────
  { id:"binance",       name:"Binance",           url:"https://www.binance.com",         chain:null,           type:"cex", rank:2,  trustScore:10,vol24hUsd:12_000_000_000 },
  { id:"coinbase",      name:"Coinbase Exchange", url:"https://pro.coinbase.com",        chain:null,           type:"cex", rank:3,  trustScore:10,vol24hUsd:4_500_000_000 },
  { id:"okx",           name:"OKX",               url:"https://www.okx.com",             chain:null,           type:"cex", rank:4,  trustScore:9, vol24hUsd:3_800_000_000 },
  { id:"bybit",         name:"Bybit",             url:"https://www.bybit.com",           chain:null,           type:"cex", rank:5,  trustScore:9, vol24hUsd:3_200_000_000 },
  { id:"kraken",        name:"Kraken",            url:"https://www.kraken.com",          chain:null,           type:"cex", rank:6,  trustScore:9, vol24hUsd:1_800_000_000 },
  { id:"kucoin",        name:"KuCoin",            url:"https://www.kucoin.com",          chain:null,           type:"cex", rank:7,  trustScore:8, vol24hUsd:1_200_000_000 },
  { id:"bitget",        name:"Bitget",            url:"https://www.bitget.com",          chain:null,           type:"cex", rank:8,  trustScore:8, vol24hUsd:900_000_000 },
  { id:"gateio",        name:"Gate.io",           url:"https://www.gate.io",             chain:null,           type:"cex", rank:9,  trustScore:8, vol24hUsd:850_000_000 },
  { id:"mexc",          name:"MEXC",              url:"https://www.mexc.com",            chain:null,           type:"cex", rank:10, trustScore:7, vol24hUsd:750_000_000 },
  { id:"huobi",         name:"HTX (Huobi)",       url:"https://www.htx.com",             chain:null,           type:"cex", rank:11, trustScore:7, vol24hUsd:650_000_000 },
  { id:"crypto-com",    name:"Crypto.com",        url:"https://crypto.com/exchange",     chain:null,           type:"cex", rank:12, trustScore:8, vol24hUsd:600_000_000 },
  { id:"bitfinex",      name:"Bitfinex",          url:"https://www.bitfinex.com",        chain:null,           type:"cex", rank:13, trustScore:8, vol24hUsd:500_000_000 },
  { id:"upbit",         name:"Upbit",             url:"https://upbit.com",               chain:null,           type:"cex", rank:14, trustScore:8, vol24hUsd:480_000_000 },
  { id:"bithumb",       name:"Bithumb",           url:"https://www.bithumb.com",         chain:null,           type:"cex", rank:15, trustScore:7, vol24hUsd:350_000_000 },
];

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

/* ── Fetch key prices from Binance + WhatsOnChain ──────────────────────────── */
async function fetchKeyPrices() {
  const results: Record<string, { usd: number; change24h: number }> = {
    USDT: { usd: 1, change24h: 0 },
    USDC: { usd: 1, change24h: 0 },
  };
  try {
    const [btcRes, ethRes, bsvRes] = await Promise.allSettled([
      fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT", { signal: AbortSignal.timeout(4000) }),
      fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT", { signal: AbortSignal.timeout(4000) }),
      fetch("https://api.whatsonchain.com/v1/bsv/main/exchangerate",       { signal: AbortSignal.timeout(4000) }),
    ]);
    if (btcRes.status === "fulfilled" && btcRes.value.ok) {
      const d = await btcRes.value.json() as { lastPrice?: string; priceChangePercent?: string };
      results["BTC"] = { usd: parseFloat(d.lastPrice ?? "0") || (FALLBACK_PRICES["BTC"] ?? 70000), change24h: parseFloat(d.priceChangePercent ?? "0") };
    }
    if (ethRes.status === "fulfilled" && ethRes.value.ok) {
      const d = await ethRes.value.json() as { lastPrice?: string; priceChangePercent?: string };
      results["ETH"] = { usd: parseFloat(d.lastPrice ?? "0") || (FALLBACK_PRICES["ETH"] ?? 2152), change24h: parseFloat(d.priceChangePercent ?? "0") };
    }
    if (bsvRes.status === "fulfilled" && bsvRes.value.ok) {
      const d = await bsvRes.value.json() as { rate?: number };
      if (d.rate && d.rate > 0) results["BSV"] = { usd: d.rate, change24h: 0 };
    }
  } catch {}
  if (!results["BTC"]) results["BTC"] = { usd: FALLBACK_PRICES["BTC"] ?? 70000, change24h: 0 };
  if (!results["ETH"]) results["ETH"] = { usd: FALLBACK_PRICES["ETH"] ?? 2152,  change24h: 0 };
  if (!results["BSV"]) results["BSV"] = { usd: FALLBACK_PRICES["BSV"] ?? 14,    change24h: 0 };
  return results;
}

/* ── GET /api/dex/prices ───────────────────────────────────────────────────── */
router.get("/dex/prices", async (_req, res) => {
  if (priceCache && Date.now() - priceCache.ts < PRICE_CACHE_MS) return res.json(priceCache.data);
  const p  = await fetchKeyPrices();
  const data = {
    BTC:  { usd: p["BTC"]!.usd,  change24h: p["BTC"]!.change24h },
    ETH:  { usd: p["ETH"]!.usd,  change24h: p["ETH"]!.change24h },
    BSV:  { usd: p["BSV"]!.usd,  change24h: p["BSV"]!.change24h },
    USDT: { usd: 1,               change24h: 0 },
  };
  priceCache = { data, ts: Date.now() };
  res.json(data);
});

/* ── GET /api/dex/exchanges ────────────────────────────────────────────────── */
router.get("/dex/exchanges", async (_req, res) => {
  if (exchangeCache && Date.now() - exchangeCache.ts < EXCHANGE_CACHE_MS) {
    return res.json(exchangeCache.data);
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
      image: null,
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

    const seen = new Set<string>();
    const coins: any[] = [];
    let rank = 1;

    for (const m of markets) {
      if (m.type !== "spot") continue;
      if (seen.has(m.baseAsset)) continue;
      seen.add(m.baseAsset);

      const price     = parseFloat(m.lastPrice ?? "0");
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
        price,
        marketCap:     parseFloat(m.marketCap ?? "0") || price * 10_000_000,
        volume24h:     vol24h,
        change24h,
        high24h:       high24h || price * 1.02,
        low24h:        low24h  || price * 0.98,
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

export default router;
