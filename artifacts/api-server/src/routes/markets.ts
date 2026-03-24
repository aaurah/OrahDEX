import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketsTable, ordersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { generateRecentTrades, generateTicker } from "../lib/mockData.js";
import { fetchRealCandles } from "../lib/candleFetcher.js";

const router: IRouter = Router();

/**
 * Normalise URL param → DB symbol (slash-separated: BTC/USDT).
 * Accepts both URL-encoded slash  (BSV%2FETH  → BSV/ETH)
 * and dash-separated params       (BSV-USDT   → BSV/USDT, BSV-USDT-PERP → BSV/USDT-PERP).
 */
const normSymbol = (raw: string): string => {
  const decoded = decodeURIComponent(raw);
  // Already contains a slash — came as encoded %2F, use directly
  if (decoded.includes("/")) return decoded;
  // Dash-separated: convert only the FIRST dash to a slash so
  // "BSV-USDT-PERP" → "BSV/USDT-PERP" and "BTC-USDT" → "BTC/USDT"
  return decoded.replace("-", "/");
};

router.get("/markets", async (req, res) => {
  try {
    const markets = await db.select().from(marketsTable);
    const result = markets.map((m) => ({
      symbol: m.symbol,
      baseAsset: m.baseAsset,
      quoteAsset: m.quoteAsset,
      lastPrice: parseFloat(m.lastPrice),
      priceChange24h: parseFloat(m.priceChange24h),
      priceChangePercent24h: parseFloat(m.priceChangePercent24h),
      volume24h: parseFloat(m.volume24h),
      high24h: parseFloat(m.high24h),
      low24h: parseFloat(m.low24h),
      marketCap: m.marketCap ? parseFloat(m.marketCap) : undefined,
      status: m.status,
      type: m.type,
      minOrderSize: parseFloat(m.minOrderSize),
      maxOrderSize: parseFloat(m.maxOrderSize),
      tickSize: parseFloat(m.tickSize),
      makerFee: parseFloat(m.makerFee),
      takerFee: parseFloat(m.takerFee),
    }));
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
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    res.json({
      symbol: market.symbol,
      baseAsset: market.baseAsset,
      quoteAsset: market.quoteAsset,
      lastPrice: parseFloat(market.lastPrice),
      priceChange24h: parseFloat(market.priceChange24h),
      priceChangePercent24h: parseFloat(market.priceChangePercent24h),
      volume24h: parseFloat(market.volume24h),
      high24h: parseFloat(market.high24h),
      low24h: parseFloat(market.low24h),
      marketCap: market.marketCap ? parseFloat(market.marketCap) : undefined,
      status: market.status,
      type: market.type,
      minOrderSize: parseFloat(market.minOrderSize),
      maxOrderSize: parseFloat(market.maxOrderSize),
      tickSize: parseFloat(market.tickSize),
      makerFee: parseFloat(market.makerFee),
      takerFee: parseFloat(market.takerFee),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get market");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/markets/:symbol/ticker", async (req, res) => {
  try {
    const symbol = normSymbol(req.params.symbol);
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    const ticker = generateTicker({
      symbol: market.symbol,
      lastPrice: parseFloat(market.lastPrice),
      high24h: parseFloat(market.high24h),
      low24h: parseFloat(market.low24h),
      volume24h: parseFloat(market.volume24h),
      priceChange24h: parseFloat(market.priceChange24h),
      priceChangePercent24h: parseFloat(market.priceChangePercent24h),
    });
    res.json(ticker);
  } catch (err) {
    req.log.error({ err }, "Failed to get ticker");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/markets/:symbol/candles", async (req, res) => {
  try {
    const symbol = normSymbol(req.params.symbol);
    const interval = (req.query.interval as string) || "1h";
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000);
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
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

    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }

    // Pull real open orders (bot + users) from DB
    const openOrders = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.symbol, symbol), eq(ordersTable.status, "open")));

    // Aggregate by price level: sum quantities
    const bidMap = new Map<string, number>();
    const askMap = new Map<string, number>();

    for (const o of openOrders) {
      if (!o.price) continue;
      const px  = parseFloat(o.price);
      const qty = parseFloat(o.remainingQuantity);
      if (!px || !qty) continue;
      const key = px.toString();
      if (o.side === "buy") {
        bidMap.set(key, (bidMap.get(key) ?? 0) + qty);
      } else {
        askMap.set(key, (askMap.get(key) ?? 0) + qty);
      }
    }

    // Sort bids descending, asks ascending, limit to depth
    const bids = [...bidMap.entries()]
      .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
      .slice(0, depth)
      .map(([price, qty]) => [parseFloat(price), qty]);

    const asks = [...askMap.entries()]
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
      .slice(0, depth)
      .map(([price, qty]) => [parseFloat(price), qty]);

    res.json({ bids, asks, lastPrice: parseFloat(market.lastPrice) });
  } catch (err) {
    req.log.error({ err }, "Failed to get order book");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/markets/:symbol/trades", async (req, res) => {
  try {
    const symbol = normSymbol(req.params.symbol);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    const trades = generateRecentTrades(symbol, parseFloat(market.lastPrice), limit);
    res.json(trades);
  } catch (err) {
    req.log.error({ err }, "Failed to get trades");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
