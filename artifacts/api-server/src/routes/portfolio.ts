import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketsTable, futuresPositionsTable } from "@workspace/db/schema";
import { inArray, eq, and } from "drizzle-orm";
import { generateWalletTransactions } from "../lib/mockData.js";
import {
  getBalances,
  getLpPositions,
} from "../lib/ledger.js";
import { pool } from "@workspace/db";
import {
  calculatePortfolioGreeks,
  calculateParametricVaR,
  calculateHistoricalVaR,
} from "../lib/portfolioRisk.js";

const router: IRouter = Router();

// ── GET /portfolio ─────────────────────────────────────────────────────────────
// Reads from the user_balances ledger (single source of truth).
// On first visit, seeds the wallet with initial balances so the UI is populated.
router.get("/portfolio", async (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }

  try {
    const balances = await getBalances(walletAddress);

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
    const balances = await getBalances(walletAddress);
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
    const { rows } = await pool.query<{ available: string; locked: string }>(
      `SELECT available, locked
         FROM user_balances
        WHERE LOWER(wallet_address) = LOWER($1) AND asset_symbol = $2`,
      [walletAddress, asset],
    );
    const row = rows[0] ?? { available: "0", locked: "0" };
    res.json({
      asset,
      available: row.available,
      locked:    row.locked,
    });
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

// ── GET /portfolio/risk?walletAddress= ────────────────────────────────────────
// Returns Greeks + parametric VaR for all open futures positions.

router.get("/portfolio/risk", async (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }

  try {
    const positions = await db
      .select()
      .from(futuresPositionsTable)
      .where(
        and(
          eq(futuresPositionsTable.walletAddress, walletAddress.toLowerCase()),
          eq(futuresPositionsTable.status, "open"),
        ),
      );

    const allMarkets = await db
      .select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice })
      .from(marketsTable);

    const marketPrices: Record<string, number> = {};
    for (const m of allMarkets) {
      marketPrices[m.symbol] = parseFloat(String(m.lastPrice ?? 0));
    }

    const greeks  = calculatePortfolioGreeks(positions, [], marketPrices);
    const varResult = calculateParametricVaR(positions, marketPrices);

    res.json({
      walletAddress,
      openPositionCount: positions.length,
      greeks,
      var: varResult,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "GET /portfolio/risk failed");
    res.status(500).json({ error: "Failed to compute portfolio risk" });
  }
});

// ── GET /portfolio/Greeks?walletAddress= ─────────────────────────────────────
// Returns Greeks only (faster, no VaR calculation).

router.get("/portfolio/Greeks", async (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }

  try {
    const positions = await db
      .select()
      .from(futuresPositionsTable)
      .where(
        and(
          eq(futuresPositionsTable.walletAddress, walletAddress.toLowerCase()),
          eq(futuresPositionsTable.status, "open"),
        ),
      );

    const allMarkets = await db
      .select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice })
      .from(marketsTable);

    const marketPrices: Record<string, number> = {};
    for (const m of allMarkets) {
      marketPrices[m.symbol] = parseFloat(String(m.lastPrice ?? 0));
    }

    const greeks = calculatePortfolioGreeks(positions, [], marketPrices);

    res.json({
      walletAddress,
      openPositionCount: positions.length,
      greeks,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "GET /portfolio/Greeks failed");
    res.status(500).json({ error: "Failed to compute portfolio Greeks" });
  }
});

// ── GET /portfolio/scenario?walletAddress=&shockPercent=-20 ──────────────────
// Stress test: simulate portfolio P&L under a uniform price shock.

router.get("/portfolio/scenario", async (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  const shockPercent  = parseFloat(req.query.shockPercent as string ?? "-20");

  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  if (isNaN(shockPercent) || shockPercent < -100 || shockPercent > 100) {
    res.status(400).json({ error: "shockPercent must be a number between -100 and 100" });
    return;
  }

  try {
    const positions = await db
      .select()
      .from(futuresPositionsTable)
      .where(
        and(
          eq(futuresPositionsTable.walletAddress, walletAddress.toLowerCase()),
          eq(futuresPositionsTable.status, "open"),
        ),
      );

    const allMarkets = await db
      .select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice })
      .from(marketsTable);

    const marketPrices: Record<string, number> = {};
    for (const m of allMarkets) {
      marketPrices[m.symbol] = parseFloat(String(m.lastPrice ?? 0));
    }

    const shockFactor = 1 + shockPercent / 100;
    let totalCurrentPnl  = 0;
    let totalScenarioPnl = 0;

    const scenarioPositions = positions.map((pos) => {
      const qty         = parseFloat(String(pos.quantity ?? 0));
      const entryPrice  = parseFloat(String(pos.entryPrice ?? 0));
      const markPrice   = marketPrices[pos.symbol] ?? parseFloat(String(pos.markPrice ?? 0));
      const scenarioPrice = markPrice * shockFactor;
      const sign        = pos.side === "long" ? 1 : -1;

      const currentPnl  = qty * (markPrice - entryPrice)   * sign;
      const scenarioPnl = qty * (scenarioPrice - entryPrice) * sign;
      const change      = scenarioPnl - currentPnl;

      totalCurrentPnl  += currentPnl;
      totalScenarioPnl += scenarioPnl;

      return {
        symbol:       pos.symbol,
        side:         pos.side,
        quantity:     qty,
        entryPrice:   parseFloat(entryPrice.toFixed(6)),
        currentPrice: parseFloat(markPrice.toFixed(6)),
        scenarioPrice: parseFloat(scenarioPrice.toFixed(6)),
        currentPnl:   parseFloat(currentPnl.toFixed(2)),
        scenarioPnl:  parseFloat(scenarioPnl.toFixed(2)),
        change:       parseFloat(change.toFixed(2)),
      };
    });

    res.json({
      walletAddress,
      shockPercent,
      openPositionCount:  positions.length,
      positions:          scenarioPositions,
      totalCurrentPnl:    parseFloat(totalCurrentPnl.toFixed(2)),
      totalScenarioPnl:   parseFloat(totalScenarioPnl.toFixed(2)),
      totalChange:        parseFloat((totalScenarioPnl - totalCurrentPnl).toFixed(2)),
      timestamp:          new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "GET /portfolio/scenario failed");
    res.status(500).json({ error: "Failed to compute portfolio scenario" });
  }
});

export default router;
