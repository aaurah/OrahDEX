import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketsTable, ordersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { generateRecentTrades, generateTicker } from "../lib/mockData.js";
import { fetchRealCandles } from "../lib/candleFetcher.js";

const router: IRouter = Router();

// ─── Simple in-memory TTL cache ──────────────────────────────────────────────
interface CacheEntry<T> { data: T; ts: number }
class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  constructor(private ttlMs: number) {}
  get(key: string): T | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() - e.ts > this.ttlMs) { this.store.delete(key); return null; }
    return e.data;
  }
  set(key: string, data: T) { this.store.set(key, { data, ts: Date.now() }); }
}

const marketsCache    = new TtlCache<any[]>(10_000);   // 10 s
const orderbookCache  = new TtlCache<any>(2_000);      //  2 s
const tradesCache     = new TtlCache<any[]>(5_000);    //  5 s
const tickerCache     = new TtlCache<any>(5_000);      //  5 s

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalise URL param → DB symbol (slash-separated: BTC/USDT).
 * Accepts both URL-encoded slash  (BSV%2FETH  → BSV/ETH)
 * and dash-separated params       (BSV-USDT   → BSV/USDT, BSV-USDT-PERP → BSV/USDT-PERP).
 */
const normSymbol = (raw: string): string => {
  const decoded = decodeURIComponent(raw);
  if (decoded.includes("/")) return decoded;
  return decoded.replace("-", "/");
};

/**
 * Build a realistic synthetic order book from a mid price.
 * Returns 20 bid and 20 ask levels with decaying quantity.
 */
function syntheticOrderBook(price: number, depth = 20) {
  const spread = price * 0.0002; // 0.02% spread
  const bids: [number, number][] = [];
  const asks: [number, number][] = [];
  for (let i = 0; i < depth; i++) {
    const bidPx = parseFloat((price - spread / 2 - i * price * 0.00015).toFixed(8));
    const askPx = parseFloat((price + spread / 2 + i * price * 0.00015).toFixed(8));
    const qty   = parseFloat(((Math.random() * 2 + 0.1) * Math.exp(-i * 0.08)).toFixed(4));
    bids.push([bidPx, qty]);
    asks.push([askPx, qty]);
  }
  return { bids, asks };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get("/markets", async (req, res) => {
  const cached = marketsCache.get("all");
  if (cached) { res.json(cached); return; }
  try {
    const markets = await db.select().from(marketsTable);
    const result = markets.map((m) => ({
      symbol:               m.symbol,
      baseAsset:            m.baseAsset,
      quoteAsset:           m.quoteAsset,
      lastPrice:            parseFloat(m.lastPrice),
      priceChange24h:       parseFloat(m.priceChange24h),
      priceChangePercent24h:parseFloat(m.priceChangePercent24h),
      volume24h:            parseFloat(m.volume24h),
      high24h:              parseFloat(m.high24h),
      low24h:               parseFloat(m.low24h),
      marketCap:            m.marketCap ? parseFloat(m.marketCap) : undefined,
      status:               m.status,
      type:                 m.type,
      minOrderSize:         parseFloat(m.minOrderSize),
      maxOrderSize:         parseFloat(m.maxOrderSize),
      tickSize:             parseFloat(m.tickSize),
      makerFee:             parseFloat(m.makerFee),
      takerFee:             parseFloat(m.takerFee),
    }));
    marketsCache.set("all", result);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get markets");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/markets/:symbol", async (req, res) => {
  try {
    const symbol = normSymbol(req.params.symbol);
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!market) { res.status(404).json({ error: "Market not found" }); return; }
    res.json({
      symbol:               market.symbol,
      baseAsset:            market.baseAsset,
      quoteAsset:           market.quoteAsset,
      lastPrice:            parseFloat(market.lastPrice),
      priceChange24h:       parseFloat(market.priceChange24h),
      priceChangePercent24h:parseFloat(market.priceChangePercent24h),
      volume24h:            parseFloat(market.volume24h),
      high24h:              parseFloat(market.high24h),
      low24h:               parseFloat(market.low24h),
      marketCap:            market.marketCap ? parseFloat(market.marketCap) : undefined,
      status:               market.status,
      type:                 market.type,
      minOrderSize:         parseFloat(market.minOrderSize),
      maxOrderSize:         parseFloat(market.maxOrderSize),
      tickSize:             parseFloat(market.tickSize),
      makerFee:             parseFloat(market.makerFee),
      takerFee:             parseFloat(market.takerFee),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get market");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/markets/:symbol/ticker", async (req, res) => {
  try {
    const symbol = normSymbol(req.params.symbol);
    const cached = tickerCache.get(symbol);
    if (cached) { res.json(cached); return; }
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!market) { res.status(404).json({ error: "Market not found" }); return; }
    const ticker = generateTicker({
      symbol: market.symbol,
      lastPrice:            parseFloat(market.lastPrice),
      high24h:              parseFloat(market.high24h),
      low24h:               parseFloat(market.low24h),
      volume24h:            parseFloat(market.volume24h),
      priceChange24h:       parseFloat(market.priceChange24h),
      priceChangePercent24h:parseFloat(market.priceChangePercent24h),
    });
    tickerCache.set(symbol, ticker);
    res.json(ticker);
  } catch (err) {
    req.log.error({ err }, "Failed to get ticker");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/markets/:symbol/candles", async (req, res) => {
  try {
    const symbol   = normSymbol(req.params.symbol);
    const interval = (req.query.interval as string) || "1h";
    const limit    = Math.min(parseInt(req.query.limit as string) || 200, 1000);
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!market) { res.status(404).json({ error: "Market not found" }); return; }
    const candles = await fetchRealCandles(market.symbol, parseFloat(market.lastPrice), interval, limit);
    res.json(candles);
  } catch (err) {
    req.log.error({ err }, "Failed to get candles");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/markets/:symbol/orderbook", async (req, res) => {
  try {
    const symbol = normSymbol(req.params.symbol);
    const depth  = Math.min(parseInt(req.query.depth as string) || 20, 50);

    // Serve from cache if fresh
    const cacheKey = `${symbol}:${depth}`;
    const cached = orderbookCache.get(cacheKey);
    if (cached) { res.json(cached); return; }

    // Fetch market price (fast single-row lookup)
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!market) { res.status(404).json({ error: "Market not found" }); return; }

    const lastPrice = parseFloat(market.lastPrice);

    // Try to build from real open orders — with a hard 3 s wall-clock limit
    let bids: [number, number][] = [];
    let asks: [number, number][] = [];

    try {
      const orderPromise = db
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.symbol, symbol), eq(ordersTable.status, "open")));

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("orderbook db timeout")), 3000)
      );

      const openOrders = await Promise.race([orderPromise, timeoutPromise]) as Awaited<typeof orderPromise>;

      if (openOrders && openOrders.length > 0) {
        const bidMap = new Map<string, number>();
        const askMap = new Map<string, number>();
        for (const o of openOrders) {
          if (!o.price) continue;
          const px  = parseFloat(o.price);
          const qty = parseFloat(o.remainingQuantity);
          if (!px || !qty) continue;
          const key = px.toString();
          if (o.side === "buy")  bidMap.set(key, (bidMap.get(key) ?? 0) + qty);
          else                   askMap.set(key, (askMap.get(key) ?? 0) + qty);
        }
        bids = [...bidMap.entries()]
          .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
          .slice(0, depth)
          .map(([price, qty]) => [parseFloat(price), qty]);
        asks = [...askMap.entries()]
          .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
          .slice(0, depth)
          .map(([price, qty]) => [parseFloat(price), qty]);
      }
    } catch {
      // DB slow or empty — fall through to synthetic
    }

    // If real orders are sparse, pad / replace with synthetic levels
    if (bids.length < depth / 2 || asks.length < depth / 2) {
      const synth = syntheticOrderBook(lastPrice, depth);
      // Merge: real orders take priority, synthetic fills the rest
      if (bids.length === 0) bids = synth.bids;
      if (asks.length === 0) asks = synth.asks;
    }

    const result = { bids, asks, lastPrice };
    orderbookCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get order book");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/markets/:symbol/trades", async (req, res) => {
  try {
    const symbol = normSymbol(req.params.symbol);
    const limit  = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const cached = tradesCache.get(symbol);
    if (cached) { res.json(cached); return; }

    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!market) { res.status(404).json({ error: "Market not found" }); return; }

    const trades = generateRecentTrades(symbol, parseFloat(market.lastPrice), limit);
    tradesCache.set(symbol, trades);
    res.json(trades);
  } catch (err) {
    req.log.error({ err }, "Failed to get trades");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
