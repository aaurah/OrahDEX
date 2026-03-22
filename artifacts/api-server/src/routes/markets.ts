import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { generateOrderBook, generateRecentTrades, generateTicker } from "../lib/mockData.js";
import { fetchRealCandles } from "../lib/candleFetcher.js";

const router: IRouter = Router();

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
    const symbol = decodeURIComponent(req.params.symbol);
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
    const symbol = decodeURIComponent(req.params.symbol);
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
    const symbol = decodeURIComponent(req.params.symbol);
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
    const symbol = decodeURIComponent(req.params.symbol);
    const depth = Math.min(parseInt(req.query.depth as string) || 50, 100);
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    const orderBook = generateOrderBook(symbol, parseFloat(market.lastPrice), depth);
    res.json(orderBook);
  } catch (err) {
    req.log.error({ err }, "Failed to get order book");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/markets/:symbol/trades", async (req, res) => {
  try {
    const symbol = decodeURIComponent(req.params.symbol);
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
