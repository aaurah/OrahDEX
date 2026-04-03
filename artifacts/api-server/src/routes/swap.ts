/**
 * swap.ts — AMM swap settlement with proper ledger accounting.
 *
 * For each swap:
 *  1. Check user's available balance of assetIn.
 *  2. Debit assetIn from available.
 *  3. Credit assetOut to available.
 *  4. All in one atomic DB transaction.
 *
 * The AMM price is computed from the marketsTable (same prices the chart shows).
 * A 0.3% fee is deducted from the output amount.
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { or, eq } from "drizzle-orm";
import {
  settleSwap,
  getBalances,
  seedInitialBalances,
} from "../lib/ledger.js";

const router: IRouter = Router();

const FEE_PCT = 0.003; // 0.3%

// ── POST /swap/quote ───────────────────────────────────────────────────────────
// Returns an estimated output amount without mutating any state.
router.post("/swap/quote", async (req, res) => {
  const { assetIn, assetOut, amountIn } = req.body ?? {};
  if (!assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn are required" });
    return;
  }

  try {
    const rate = await resolveRate(assetIn.toUpperCase(), assetOut.toUpperCase());
    if (!rate) {
      res.status(422).json({ error: "No price available for this pair" });
      return;
    }

    const amtIn   = parseFloat(amountIn);
    const grossOut = amtIn * rate;
    const fee      = grossOut * FEE_PCT;
    const amtOut   = grossOut - fee;

    res.json({
      assetIn:    assetIn.toUpperCase(),
      assetOut:   assetOut.toUpperCase(),
      amountIn:   amtIn.toFixed(8),
      amountOut:  amtOut.toFixed(8),
      fee:        fee.toFixed(8),
      feePct:     FEE_PCT * 100,
      rate:       rate.toFixed(8),
      priceImpactPct: 0.1,   // simplified — real AMM would calculate from reserves
    });
  } catch (err) {
    req.log.error({ err }, "Swap quote failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /swap ─────────────────────────────────────────────────────────────────
// Executes a swap and settles the balances atomically.
router.post("/swap", async (req, res) => {
  const { walletAddress, assetIn, assetOut, amountIn, minAmountOut } = req.body ?? {};
  if (!walletAddress || !assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "walletAddress, assetIn, assetOut, amountIn are required" });
    return;
  }

  try {
    // Seed balances for first-time user
    const existing = await getBalances(walletAddress);
    if (existing.length === 0) await seedInitialBalances(walletAddress);

    const rate = await resolveRate(assetIn.toUpperCase(), assetOut.toUpperCase());
    if (!rate) {
      res.status(422).json({ error: "No price available for this pair" });
      return;
    }

    const amtIn    = parseFloat(amountIn);
    const grossOut = amtIn * rate;
    const fee      = grossOut * FEE_PCT;
    const amtOut   = grossOut - fee;

    // Slippage check
    if (minAmountOut && amtOut < parseFloat(minAmountOut)) {
      res.status(422).json({
        error:    "Slippage exceeded",
        code:     "SLIPPAGE_EXCEEDED",
        amtOut:   amtOut.toFixed(8),
        minOut:   parseFloat(minAmountOut).toFixed(8),
      });
      return;
    }

    await settleSwap({
      walletAddress,
      assetIn:   assetIn.toUpperCase(),
      assetOut:  assetOut.toUpperCase(),
      amountIn:  amtIn.toFixed(18),
      amountOut: amtOut.toFixed(18),
    });

    req.log.info({ walletAddress, assetIn, assetOut, amtIn, amtOut }, "Swap settled");

    res.json({
      success:   true,
      assetIn:   assetIn.toUpperCase(),
      assetOut:  assetOut.toUpperCase(),
      amountIn:  amtIn.toFixed(8),
      amountOut: amtOut.toFixed(8),
      fee:       fee.toFixed(8),
      feePct:    FEE_PCT * 100,
      rate:      rate.toFixed(8),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.message?.startsWith("INSUFFICIENT_FUNDS")) {
      const asset = err.message.split(":")[1] ?? assetIn;
      res.status(422).json({ error: "Insufficient balance", asset });
      return;
    }
    req.log.error({ err }, "Swap failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Helper: resolve exchange rate A→B ─────────────────────────────────────────
// Looks up A/B or B/A in the marketsTable and returns the A→B rate.
async function resolveRate(assetIn: string, assetOut: string): Promise<number | null> {
  const STABLES = new Set(["USDT", "USDC", "BUSD", "TUSD"]);

  // Direct pair A/B
  const direct = `${assetIn}/${assetOut}`;
  // Inverse pair B/A
  const inverse = `${assetOut}/${assetIn}`;

  try {
    const [mkt] = await db
      .select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice })
      .from(marketsTable)
      .where(or(eq(marketsTable.symbol, direct), eq(marketsTable.symbol, inverse)))
      .limit(1);

    if (!mkt) {
      // Try routing via USDT if neither is stablecoin
      if (!STABLES.has(assetIn) && !STABLES.has(assetOut)) {
        const [inMkt]  = await db.select({ lastPrice: marketsTable.lastPrice })
          .from(marketsTable).where(eq(marketsTable.symbol, `${assetIn}/USDT`)).limit(1);
        const [outMkt] = await db.select({ lastPrice: marketsTable.lastPrice })
          .from(marketsTable).where(eq(marketsTable.symbol, `${assetOut}/USDT`)).limit(1);
        if (inMkt && outMkt) {
          const inPrice  = parseFloat(inMkt.lastPrice);
          const outPrice = parseFloat(outMkt.lastPrice);
          if (outPrice > 0) return inPrice / outPrice;
        }
      }
      return null;
    }

    const price = parseFloat(mkt.lastPrice);
    if (!price || !Number.isFinite(price)) return null;

    // If we got the inverse, flip it
    if (mkt.symbol === inverse) return 1 / price;
    return price;
  } catch {
    return null;
  }
}

export default router;
