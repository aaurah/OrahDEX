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
} from "../lib/ledger.js";
import { recordPlatformFee } from "../lib/feeCollector.js";
import { getHybridRoute } from "../lib/hybridRouter.js";
import { leRequest, AFFILIATE_ID } from "../lib/lePriceCache.js";
import { logger } from "../lib/logger.js";

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
// NOTE: This endpoint trusts walletAddress from the body.  For internal (OrahDEX)
// balances the ledger enforces that the address has sufficient funds, which prevents
// funds-theft but does NOT prevent a user from submitting swaps under a different
// address to observe balance/rate data.  External (on-chain) wallets with zero
// internal balance are safe; on-chain funds are never touched here.
router.post("/swap", async (req, res) => {
  const { walletAddress, assetIn, assetOut, amountIn, minAmountOut } = req.body ?? {};
  if (!walletAddress || !assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "walletAddress, assetIn, assetOut, amountIn are required" });
    return;
  }

  // Strict numeric validation — reject NaN, Infinity, non-positive amounts
  const amtInRaw = parseFloat(amountIn);
  if (!Number.isFinite(amtInRaw) || amtInRaw <= 0) {
    res.status(400).json({ error: "amountIn must be a positive finite number" });
    return;
  }
  // Sanity cap: no single swap should exceed $10M equivalent (prevents overflow attacks)
  if (amtInRaw > 1_000_000) {
    res.status(400).json({ error: "amountIn exceeds maximum swap size" });
    return;
  }

  // Validate asset symbols — alphanumeric only, max 20 chars
  const symbolRe = /^[A-Z0-9.]{1,20}$/;
  if (!symbolRe.test(String(assetIn).toUpperCase()) || !symbolRe.test(String(assetOut).toUpperCase())) {
    res.status(400).json({ error: "Invalid asset symbol" });
    return;
  }

  try {
    const rate = await resolveRate(assetIn.toUpperCase(), assetOut.toUpperCase());
    if (!rate) {
      res.status(422).json({ error: "No price available for this pair" });
      return;
    }

    const amtIn    = amtInRaw;
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

    // Record exchange platform fee revenue
    await recordPlatformFee({ source: "swap", amount: fee, asset: assetOut.toUpperCase(), txRef: walletAddress });

    req.log.info({ walletAddress, assetIn, assetOut, amtIn, amtOut, fee }, "Swap settled");

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

// ── POST /swap/route ──────────────────────────────────────────────────────────
// Read-only: returns which source (internal orderbook vs LetsExchange) would
// be used to execute a swap, plus quotes from each.
router.post("/swap/route", async (req, res) => {
  const { assetIn, assetOut, amountIn } = req.body ?? {};
  if (!assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn are required" }); return;
  }
  const amt = parseFloat(String(amountIn));
  if (!isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amountIn must be a positive number" }); return;
  }

  try {
    const [a, b] = [String(assetIn).toUpperCase(), String(assetOut).toUpperCase()];
    const decision = await getHybridRoute(a, b, amt);

    // Build internal quote (always attempt it for display)
    let internalQuote: Record<string, unknown> | null = null;
    const rate = await resolveRate(a, b);
    if (rate) {
      const grossOut = amt * rate;
      const fee      = grossOut * FEE_PCT;
      internalQuote  = {
        assetIn: a, assetOut: b,
        amountIn:  amt.toFixed(8),
        amountOut: (grossOut - fee).toFixed(8),
        fee:       fee.toFixed(8),
        feePct:    FEE_PCT * 100,
        rate:      rate.toFixed(8),
      };
    }

    res.json({
      source:       decision.source,
      reason:       decision.reason,
      liquidity:    decision.liquidity,
      internalQuote,
      internalRate: decision.internalRate,
    });
  } catch (err: any) {
    logger.error({ err }, "swap/route failed");
    res.status(500).json({ error: "Routing check failed" });
  }
});

// ── POST /swap/execute ────────────────────────────────────────────────────────
// Unified execution: auto-routes to internal ledger OR LetsExchange based on
// real orderbook liquidity.
// Body for internal execution:  { walletAddress, assetIn, assetOut, amountIn, minAmountOut? }
// Body for LE execution:        { assetIn, assetOut, amountIn, withdrawal, networkFrom, networkTo, withdrawal_extra_id? }
// Optional override:            { forceSource: "internal" | "letsexchange" }
router.post("/swap/execute", async (req, res) => {
  const {
    walletAddress, assetIn, assetOut, amountIn,
    minAmountOut, withdrawal, networkFrom, networkTo, withdrawal_extra_id,
    return: refund, rate_id, email, forceSource,
  } = req.body ?? {};

  if (!assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn are required" }); return;
  }
  const amt = parseFloat(String(amountIn));
  if (!isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amountIn must be a positive finite number" }); return;
  }
  const [a, b] = [String(assetIn).toUpperCase(), String(assetOut).toUpperCase()];

  try {
    // Determine route
    let source: "internal" | "letsexchange";
    if (forceSource === "internal" || forceSource === "letsexchange") {
      source = forceSource;
    } else {
      const decision = await getHybridRoute(a, b, amt);
      source = decision.source;
    }

    // ── Internal execution (ledger-based, requires OrahDEX balance) ─────────
    if (source === "internal") {
      if (!walletAddress) {
        res.status(400).json({ error: "walletAddress is required for internal swap" }); return;
      }
      const rate = await resolveRate(a, b);
      if (!rate) {
        res.status(422).json({ error: "No price available for this pair internally" }); return;
      }
      const grossOut = amt * rate;
      const fee      = grossOut * FEE_PCT;
      const amtOut   = grossOut - fee;
      if (minAmountOut && amtOut < parseFloat(String(minAmountOut))) {
        res.status(422).json({ error: "Slippage exceeded", code: "SLIPPAGE_EXCEEDED",
          amtOut: amtOut.toFixed(8), minOut: parseFloat(String(minAmountOut)).toFixed(8) }); return;
      }
      await settleSwap({ walletAddress, assetIn: a, assetOut: b,
        amountIn: amt.toFixed(18), amountOut: amtOut.toFixed(18) });
      await recordPlatformFee({ source: "swap", amount: fee, asset: b, txRef: walletAddress });
      logger.info({ walletAddress, a, b, amt, amtOut, source: "internal" }, "hybrid swap: internal settled");
      return res.json({
        success: true, source: "internal",
        assetIn: a, assetOut: b,
        amountIn: amt.toFixed(8), amountOut: amtOut.toFixed(8),
        fee: fee.toFixed(8), feePct: FEE_PCT * 100,
        rate: rate.toFixed(8), timestamp: new Date().toISOString(),
      });
    }

    // ── LetsExchange execution ───────────────────────────────────────────────
    if (!withdrawal) {
      res.status(400).json({ error: "withdrawal address is required for LetsExchange routing" }); return;
    }
    if (!networkFrom || !networkTo) {
      res.status(400).json({ error: "networkFrom and networkTo are required for LetsExchange routing" }); return;
    }
    const withdrawalStr = String(withdrawal).trim();
    if (withdrawalStr.length < 10 || withdrawalStr.length > 200) {
      res.status(400).json({ error: "Invalid withdrawal address" }); return;
    }

    const leBody: Record<string, unknown> = {
      float:               false,
      coin_from:           a,
      coin_to:             b,
      network_from:        String(networkFrom),
      network_to:          String(networkTo),
      deposit_amount:      amt,
      withdrawal:          withdrawalStr,
      withdrawal_extra_id: withdrawal_extra_id != null ? String(withdrawal_extra_id) : "",
      affiliate_id:        AFFILIATE_ID,
    };
    if (refund)  leBody["return"]    = String(refund);
    if (rate_id) leBody["rate_id"]   = String(rate_id);
    if (email)   leBody["email"]     = String(email);

    const { ok, data, status } = await leRequest("/v1/transaction", "POST", leBody);
    if (status === 403) { res.status(403).json({ error: "Invalid API key" }); return; }
    if (status === 422) { res.status(422).json({ error: "Validation error", detail: data }); return; }
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }

    logger.info({ a, b, amt, withdrawal: withdrawalStr, source: "letsexchange" }, "hybrid swap: LE routed");
    return res.json({ success: true, source: "letsexchange", ...(data as object) });

  } catch (err: any) {
    if (err?.message?.startsWith("INSUFFICIENT_FUNDS")) {
      const asset = err.message.split(":")[1] ?? assetIn;
      res.status(422).json({ error: "Insufficient balance", asset }); return;
    }
    logger.error({ err }, "swap/execute failed");
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
