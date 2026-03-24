import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";
import { generateWalletTransactions } from "../lib/mockData.js";

const router: IRouter = Router();

// Deterministic PRNG seeded from wallet address
// Returns a value in [0, 1) based on address + slot index
function seededRand(address: string, slot: number): number {
  let h = 0xcafe1234 ^ slot;
  for (let i = 0; i < address.length; i++) {
    h = Math.imul(h ^ address.charCodeAt(i), 0x9e3779b9);
    h ^= h >>> 16;
  }
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return Math.abs(h) / 0x7fffffff;
}

function seededBetween(address: string, slot: number, min: number, max: number): number {
  return min + seededRand(address, slot) * (max - min);
}

// Assets shown in the portfolio — quoteAsset is always USDT for price lookup
const PORTFOLIO_ASSETS = [
  { asset: "BSV",  symbol: "BSV-USDT", minAmt: 5,     maxAmt: 200,   decimals: 4 },
  { asset: "USDT", symbol: null,        minAmt: 500,   maxAmt: 15000, decimals: 2 },
  { asset: "BTC",  symbol: "BTC-USDT", minAmt: 0.001, maxAmt: 0.5,   decimals: 8 },
  { asset: "ETH",  symbol: "ETH-USDT", minAmt: 0.05,  maxAmt: 8,     decimals: 6 },
  { asset: "BNB",  symbol: "BNB-USDT", minAmt: 0.5,   maxAmt: 20,    decimals: 4 },
];

router.get("/portfolio", async (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }

  try {
    // Fetch live prices for all portfolio assets from DB
    const symbols = PORTFOLIO_ASSETS.map(a => a.symbol).filter(Boolean) as string[];
    const liveMarkets = await db
      .select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice, priceChangePercent24h: marketsTable.priceChangePercent24h })
      .from(marketsTable)
      .where(inArray(marketsTable.symbol, symbols));

    const priceMap: Record<string, { price: number; change24h: number }> = {};
    for (const m of liveMarkets) {
      priceMap[m.symbol] = {
        price: parseFloat(m.lastPrice),
        change24h: parseFloat(m.priceChangePercent24h),
      };
    }

    // Build deterministic balances from wallet address seed
    const balances = PORTFOLIO_ASSETS.map((a, i) => {
      const total = parseFloat(
        seededBetween(walletAddress, i * 3, a.minAmt, a.maxAmt).toFixed(a.decimals)
      );
      const freeRatio = 0.7 + seededRand(walletAddress, i * 3 + 1) * 0.3;
      const free = parseFloat((total * freeRatio).toFixed(a.decimals));
      const locked = parseFloat((total - free).toFixed(a.decimals));

      let price = 1;
      let change24h = 0;
      if (a.symbol && priceMap[a.symbol]) {
        price = priceMap[a.symbol].price;
        change24h = priceMap[a.symbol].change24h;
      }

      const valueUSD = parseFloat((total * price).toFixed(2));
      const pnl24h = parseFloat((valueUSD * change24h / 100).toFixed(2));

      return {
        asset: a.asset,
        free,
        locked,
        total,
        valueUSD,
        price,
        change24hPercent: parseFloat(change24h.toFixed(2)),
        pnl24h,
        pnl24hPercent: parseFloat(change24h.toFixed(2)),
      };
    });

    const totalValueUSD = parseFloat(balances.reduce((s, b) => s + b.valueUSD, 0).toFixed(2));
    const totalPnlUSD = parseFloat(balances.reduce((s, b) => s + b.pnl24h, 0).toFixed(2));
    const totalPnlPercent = totalValueUSD > 0
      ? parseFloat(((totalPnlUSD / totalValueUSD) * 100).toFixed(2))
      : 0;

    res.json({
      walletAddress,
      totalValueUSD,
      totalPnlUSD,
      totalPnlPercent,
      balances,
      openOrdersCount: Math.floor(seededRand(walletAddress, 99) * 8),
      openPositionsCount: Math.floor(seededRand(walletAddress, 100) * 3),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate portfolio");
    res.status(500).json({ error: "Failed to generate portfolio" });
  }
});

router.get("/wallet/connect", (_req, res) => {
  res.json({ message: "Use POST to connect" });
});

router.post("/wallet/connect", (req, res) => {
  const body = req.body;
  if (!body.address || !body.provider) {
    res.status(400).json({ error: "address and provider are required" });
    return;
  }
  res.json({
    address: body.address,
    provider: body.provider,
    connected: true,
    connectedAt: new Date().toISOString(),
    publicKey: body.publicKey || null,
  });
});

router.get("/wallet/transactions", (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  res.json(generateWalletTransactions(walletAddress, limit));
});

export default router;
