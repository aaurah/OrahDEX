import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";
import { generateWalletTransactions } from "../lib/mockData.js";
import {
  getBalances,
  seedInitialBalances,
  getLpPositions,
} from "../lib/ledger.js";

const router: IRouter = Router();

// ── GET /portfolio ─────────────────────────────────────────────────────────────
// Reads from the user_balances ledger (single source of truth).
// On first visit, seeds the wallet with demo balances so the UI is populated.
router.get("/portfolio", async (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }

  try {
    // Fetch balances from the ledger
    let balances = await getBalances(walletAddress);

    // First-time visitor: seed demo balances so the app looks populated
    if (balances.length === 0) {
      await seedInitialBalances(walletAddress);
      balances = await getBalances(walletAddress);
    }

    // Gather symbols for price lookup — DB stores symbols with slash (BTC/USDT)
    const symbols = balances
      .filter(b => b.asset !== "USDT" && b.asset !== "USDC" && b.asset !== "BUSD")
      .map(b => `${b.asset}/USDT`)
      .filter(Boolean);

    const liveMarkets = await db
      .select({
        symbol:               marketsTable.symbol,
        lastPrice:            marketsTable.lastPrice,
        priceChangePercent24h: marketsTable.priceChangePercent24h,
      })
      .from(marketsTable)
      .where(inArray(marketsTable.symbol, symbols));

    const priceMap: Record<string, { price: number; change24h: number }> = {};
    for (const m of liveMarkets) {
      const base = m.symbol.split("/")[0]!;
      priceMap[base] = {
        price:    parseFloat(m.lastPrice),
        change24h: parseFloat(m.priceChangePercent24h),
      };
    }

    const enriched = balances.map(b => {
      const available = parseFloat(b.available);
      const locked    = parseFloat(b.locked);
      const total     = available + locked;

      let price     = 1;     // stablecoins
      let change24h = 0;
      if (b.asset !== "USDT" && b.asset !== "USDC" && b.asset !== "BUSD") {
        price     = priceMap[b.asset]?.price     ?? 0;
        change24h = priceMap[b.asset]?.change24h ?? 0;
      }

      const valueUSD = parseFloat((total * price).toFixed(2));
      const pnl24h   = parseFloat((valueUSD * change24h / 100).toFixed(2));

      return {
        asset:            b.asset,
        free:             parseFloat(available.toFixed(8)),
        locked:           parseFloat(locked.toFixed(8)),
        total:            parseFloat(total.toFixed(8)),
        available:        parseFloat(available.toFixed(8)),
        valueUSD,
        price,
        change24hPercent: parseFloat(change24h.toFixed(2)),
        pnl24h,
        pnl24hPercent:    parseFloat(change24h.toFixed(2)),
      };
    });

    const totalValueUSD = parseFloat(enriched.reduce((s, b) => s + b.valueUSD, 0).toFixed(2));
    const totalPnlUSD   = parseFloat(enriched.reduce((s, b) => s + b.pnl24h,   0).toFixed(2));
    const totalPnlPercent = totalValueUSD > 0
      ? parseFloat(((totalPnlUSD / totalValueUSD) * 100).toFixed(2))
      : 0;

    // LP positions (shown separately — not double-counted in balances)
    const lpPositions = await getLpPositions(walletAddress);
    const activeLP = lpPositions.filter(p => p.status === "active");

    res.json({
      walletAddress,
      totalValueUSD,
      totalPnlUSD,
      totalPnlPercent,
      balances: enriched,
      openOrdersCount:    0,   // updated separately by /orders count
      openPositionsCount: activeLP.length,
      defi: {
        lpPositions: activeLP.map(p => ({
          id:       p.id,
          pool:     `${p.assetA}/${p.assetB}`,
          assetA:   p.assetA,
          assetB:   p.assetB,
          amountA:  p.amountA,
          amountB:  p.amountB,
          lpTokens: p.lpTokens,
          estValueUsd: (
            parseFloat(p.amountA) * (priceMap[p.assetA]?.price ?? 1) +
            parseFloat(p.amountB) * (priceMap[p.assetB]?.price ?? 1)
          ).toFixed(2),
        })),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch portfolio");
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
});

// ── GET /balances ─────────────────────────────────────────────────────────────
// Raw ledger read — available + locked only.  No price data, no derived values.
router.get("/balances", async (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  try {
    let balances = await getBalances(walletAddress);
    if (balances.length === 0) {
      await seedInitialBalances(walletAddress);
      balances = await getBalances(walletAddress);
    }
    res.json({ walletAddress, balances });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch balances");
    res.status(500).json({ error: "Failed to fetch balances" });
  }
});

// ── GET /balances/:asset ───────────────────────────────────────────────────────
router.get("/balances/:asset", async (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  const asset = req.params.asset.toUpperCase();
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  try {
    const all = await getBalances(walletAddress);
    const row = all.find(b => b.asset === asset) ?? { asset, available: "0", locked: "0" };
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch balance");
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

// ── POST /wallet/connect ───────────────────────────────────────────────────────
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
    address:     body.address,
    provider:    body.provider,
    connected:   true,
    connectedAt: new Date().toISOString(),
    publicKey:   body.publicKey || null,
  });
});

// ── GET /wallet/transactions ───────────────────────────────────────────────────
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
