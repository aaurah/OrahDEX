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

import { Router, type IRouter, type Response } from "express";
import { db, pool } from "@workspace/db";
import { marketsTable, ordersTable } from "@workspace/db/schema";
import { or, eq, and, ne, desc, sql as sqlRaw } from "drizzle-orm";
import {
  settleSwap,
} from "../lib/ledger.js";
import { recordPlatformFee } from "../lib/feeCollector.js";
import { getHybridRoute } from "../lib/hybridRouter.js";
import { leRequest, AFFILIATE_ID } from "../lib/lePriceCache.js";
import { issueExchangeChallenge, verifyExchangeSignature } from "../lib/walletAuth.js";
import { logger } from "../lib/logger.js";
import { getBestExternalQuote, type ExternalVenue } from "../lib/metaRouter.js";
import { createCNExchange, getCNExchange } from "../lib/changenow.js";
import { createSXExchange, getSXExchange }  from "../lib/stealthex.js";
import { createChangellyExchange, getChangellyExchange } from "../lib/changelly.js";

const router: IRouter = Router();

const FEE_PCT = 0.003; // 0.3%

/**
 * Default server-side slippage tolerance.
 * Applied when the client does not supply `minAmountOut`.
 * Surfaced in /swap/quote so clients can display it before execution.
 */
const DEFAULT_MAX_SLIPPAGE_PCT = 5; // 5%

/**
 * Short-lived in-memory rate cache for the /swap/quote endpoint.
 * Avoids 1–3 DB round-trips on every preview quote.
 * The actual /swap execution still calls resolveRate() directly (no cache)
 * so fills always use the freshest price from the market table.
 */
const _rateCache    = new Map<string, { rate: number; expiresAt: number }>();
const _rateInFlight = new Map<string, Promise<number | null>>();
const RATE_CACHE_TTL_MS = 30_000; // 30 s — quotes refresh faster than this

async function resolveRateCached(assetIn: string, assetOut: string): Promise<number | null> {
  const key = `${assetIn}:${assetOut}`;
  const cached = _rateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  // Single-flight: if a DB fetch is already in-progress for this key, await
  // the same promise instead of launching a duplicate query (thundering-herd
  // prevention for burst quote traffic on the same pair).
  const inflight = _rateInFlight.get(key);
  if (inflight) return inflight;

  const fetch = resolveRate(assetIn, assetOut).then(rate => {
    if (rate != null) {
      _rateCache.set(key, { rate, expiresAt: Date.now() + RATE_CACHE_TTL_MS });
    }
    _rateInFlight.delete(key);
    return rate;
  }).catch(err => {
    _rateInFlight.delete(key);
    throw err;
  });

  _rateInFlight.set(key, fetch);
  return fetch;
}

function verifyEvmSwapSignature(
  res: Response,
  walletAddress: unknown,
  nonce: unknown,
  signature: unknown,
  context: "swap" | "swap_internal",
): boolean {
  const wallet = String(walletAddress ?? "");
  if (!wallet.startsWith("0x")) return true;
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    res.status(400).json({ error: "Valid EVM walletAddress required (0x + 40 hex chars)." });
    return false;
  }
  if (!signature || !nonce) {
    res.status(401).json({
      error: context === "swap_internal"
        ? "signature and nonce are required for EVM swap requests with internal settlement. Request a challenge via POST /swap/challenge and include signature + nonce."
        : "signature and nonce are required for EVM swap requests. Request a challenge via POST /swap/challenge and include signature + nonce.",
    });
    return false;
  }
  try {
    verifyExchangeSignature(String(walletAddress), String(nonce), String(signature));
    return true;
  } catch {
    res.status(401).json({ error: "Invalid or expired swap signature challenge." });
    return false;
  }
}

// ── POST /swap/challenge ───────────────────────────────────────────────────────
// Issues a single-use nonce/message that an EVM wallet must sign before
// calling POST /swap or POST /swap/execute when an internal ledger leg is used.
router.post("/swap/challenge", (req, res) => {
  const { walletAddress, assetIn, assetOut, amountIn } = req.body ?? {};
  if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(String(walletAddress))) {
    res.status(400).json({ error: "Valid EVM address required (0x…)" });
    return;
  }
  if (!assetIn || !assetOut || amountIn == null) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn are required" });
    return;
  }
  const amt = parseFloat(String(amountIn));
  if (!Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amountIn must be a positive finite number" });
    return;
  }

  const challenge = issueExchangeChallenge({
    walletAddress: String(walletAddress),
    assetIn: String(assetIn).toUpperCase(),
    assetOut: String(assetOut).toUpperCase(),
    amountIn: String(amt),
  });
  res.json(challenge);
});

// ── POST /swap/quote ───────────────────────────────────────────────────────────
// Returns an estimated output amount without mutating any state.
router.post("/swap/quote", async (req, res) => {
  const { assetIn, assetOut, amountIn } = req.body ?? {};
  if (!assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn are required" });
    return;
  }

  try {
    const rate = await resolveRateCached(assetIn.toUpperCase(), assetOut.toUpperCase());
    if (!rate) {
      res.status(422).json({
        error: "No price available for this pair",
        hint: "Market prices for this pair have not loaded yet. Prices refresh automatically — please try again in a moment, or check that market data is seeded.",
        code: "NO_PRICE_DATA",
      });
      return;
    }

    const amtIn   = parseFloat(amountIn);
    const grossOut = amtIn * rate;
    const fee      = grossOut * FEE_PCT;
    const amtOut   = grossOut - fee;

    // Estimate price impact from live order-book depth instead of a hardcoded value.
    // Buying base asset (assetIn is a stablecoin) → look at sell-side depth.
    // Selling base asset → look at buy-side depth.
    // impact = amtIn / totalCounterLiquidity × 100, capped at 50%.
    // Falls back to 0.1 when the pair has no open counter-orders (thin/new market).
    const QUOTE_ASSETS = new Set(["USDT","USDC","BUSD","TUSD","DAI","USDE"]);
    const buyingBase = QUOTE_ASSETS.has(assetIn.toUpperCase());
    const obPair = buyingBase
      ? `${assetOut.toUpperCase()}/${assetIn.toUpperCase()}`
      : `${assetIn.toUpperCase()}/${assetOut.toUpperCase()}`;
    const counterSide = buyingBase ? "sell" : "buy";
    let priceImpactPct = 0.1;
    try {
      const counterRows = await db
        .select({ qty: ordersTable.remainingQuantity, price: ordersTable.price, qty2: ordersTable.quantity })
        .from(ordersTable)
        .where(and(
          eq(ordersTable.symbol, obPair),
          eq(ordersTable.side, counterSide),
          eq(ordersTable.status, "open"),
        ));
      // Sum liquidity in the same units as amtIn (quote for buys, base for sells)
      const totalLiq = counterRows.reduce((acc, o) => {
        const qty = parseFloat(o.qty ?? o.qty2 ?? "0");
        const px  = parseFloat(o.price ?? "0");
        return acc + (buyingBase ? qty * px : qty);
      }, 0);
      if (totalLiq > 0) priceImpactPct = Math.min((amtIn / totalLiq) * 100, 50);
    } catch {
      // Non-fatal: fall back to 0.1 so the quote still returns
    }

    res.json({
      assetIn:            assetIn.toUpperCase(),
      assetOut:           assetOut.toUpperCase(),
      amountIn:           amtIn.toFixed(8),
      amountOut:          amtOut.toFixed(8),
      fee:                fee.toFixed(8),
      feePct:             FEE_PCT * 100,
      rate:               rate.toFixed(8),
      priceImpactPct,
      defaultSlippagePct: DEFAULT_MAX_SLIPPAGE_PCT,
      minAmountOutHint:   (amtOut * (1 - DEFAULT_MAX_SLIPPAGE_PCT / 100)).toFixed(8),
      slippageNote:       `Set minAmountOut ≥ minAmountOutHint in your swap request. ` +
                          `If omitted, the server enforces a ${DEFAULT_MAX_SLIPPAGE_PCT}% tolerance automatically.`,
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
  const { walletAddress, assetIn, assetOut, amountIn, minAmountOut, signature, nonce } = req.body ?? {};
  if (!walletAddress || !assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "walletAddress, assetIn, assetOut, amountIn are required" });
    return;
  }

  if (!verifyEvmSwapSignature(res, walletAddress, nonce, signature, "swap")) {
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

    // Slippage check.
    // If the client supplied minAmountOut, enforce it strictly. Otherwise
    // apply a server-side default cap so a malformed/malicious request without
    // a min cannot be filled at any arbitrarily bad rate.
    // Clients should always send a real minAmountOut from a fresh quote.
    const effectiveMinOut = minAmountOut != null && minAmountOut !== ""
      ? parseFloat(minAmountOut)
      : grossOut * (1 - DEFAULT_MAX_SLIPPAGE_PCT / 100);
    if (Number.isFinite(effectiveMinOut) && amtOut < effectiveMinOut) {
      res.status(422).json({
        error:    "Slippage exceeded",
        code:     "SLIPPAGE_EXCEEDED",
        amtOut:   amtOut.toFixed(8),
        minOut:   effectiveMinOut.toFixed(8),
        defaulted: minAmountOut == null || minAmountOut === "",
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

    req.log.info({
      walletMask: `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`,
      assetIn, assetOut, amtIn, amtOut, fee,
    }, "Swap settled");

    res.json({
      success:    true,
      dataSource: "synthetic_amm",  // settled against internal ledger balances, not the order book
      assetIn:    assetIn.toUpperCase(),
      assetOut:   assetOut.toUpperCase(),
      amountIn:   amtIn.toFixed(8),
      amountOut:  amtOut.toFixed(8),
      fee:        fee.toFixed(8),
      feePct:     FEE_PCT * 100,
      rate:       rate.toFixed(8),
      timestamp:  new Date().toISOString(),
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
// Read-only: returns which source (internal / letsexchange / split) would be
// used to execute a swap, plus quotes, fee breakdown, and pair config.
// Pass allowSplit=true to see whether a split-route would be used.
router.post("/swap/route", async (req, res) => {
  const { assetIn, assetOut, amountIn, allowSplit } = req.body ?? {};
  if (!assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn are required" }); return;
  }
  const amt = parseFloat(String(amountIn));
  if (!isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amountIn must be a positive number" }); return;
  }

  try {
    const [a, b]   = [String(assetIn).toUpperCase(), String(assetOut).toUpperCase()];
    const splitOpt = allowSplit === true || allowSplit === "true";
    const decision = await getHybridRoute(a, b, amt, splitOpt);

    // Build full internal quote using VWAP when available, oracle rate otherwise
    let internalQuote: Record<string, unknown> | null = null;
    const rate = decision.liquidity.vwap > 0 ? decision.liquidity.vwap : await resolveRate(a, b);
    if (rate) {
      const grossOut = amt * rate;
      const fee      = grossOut * FEE_PCT;
      internalQuote  = {
        assetIn: a, assetOut: b,
        amountIn:  amt.toFixed(8),
        amountOut: (grossOut - fee).toFixed(8),
        grossOut:  grossOut.toFixed(8),
        fee:       fee.toFixed(8),
        feePct:    FEE_PCT * 100,
        rate:      rate.toFixed(8),
        vwap:      decision.liquidity.vwap > 0 ? decision.liquidity.vwap.toFixed(8) : null,
        slippage:  decision.liquidity.slippage !== null
          ? parseFloat((decision.liquidity.slippage * 100).toFixed(4))
          : null,
        fillPct:   parseFloat(decision.liquidity.fillPct.toFixed(2)),
      };
    }

    res.json({
      source:                decision.source,
      fillBehavior:          decision.fillBehavior,
      reason:                decision.reason,
      routeVersion:          decision.routeVersion,
      oracleFallbackApplied: decision.oracleFallbackApplied,
      liquidity:             decision.liquidity,
      pairConfig:            decision.pairConfig,
      splitLegs:             decision.splitLegs,
      internalQuote,
      internalRate:          decision.internalRate,
      fees:                  decision.fees,
      effectiveRate:         decision.effectiveRate,
      slippageEstimate:      decision.slippageEstimate,
    });
  } catch (err: any) {
    logger.error({ err }, "swap/route failed");
    res.status(500).json({ error: "Routing check failed" });
  }
});

// ── POST /swap/multi-quote ────────────────────────────────────────────────────
// Read-only: query all configured external swap providers in parallel and
// return scored quotes so the caller can compare prices before executing.
//
// Body: assetIn, assetOut, amountIn
//
// Response:
//   best      — highest-scoring RouteQuote (or null if none succeed)
//   all       — all RouteQuote objects, sorted descending by score
//   errors    — per-venue error messages (null = no error)
router.post("/swap/multi-quote", async (req, res) => {
  const { assetIn, assetOut, amountIn } = req.body ?? {};
  if (!assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn are required" });
    return;
  }
  const amt = parseFloat(String(amountIn));
  if (!isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amountIn must be a positive number" });
    return;
  }
  const [a, b] = [String(assetIn).toUpperCase(), String(assetOut).toUpperCase()];

  try {
    // Resolve USD prices for both tokens using the oracle (best-effort)
    const [inUsd, outUsd] = await Promise.all([
      resolveRate(a, "USDT").catch(() => null),
      resolveRate(b, "USDT").catch(() => null),
    ]);
    const inputUsdPrice  = inUsd  ?? 1;
    const outputUsdPrice = outUsd ?? 1;

    const result = await getBestExternalQuote(a, b, amt, inputUsdPrice, outputUsdPrice);

    res.set("Cache-Control", "no-store");
    res.json({
      assetIn:  a,
      assetOut: b,
      amountIn: amt,
      inputUsdPrice,
      outputUsdPrice,
      best:   result.best,
      all:    result.all,
      errors: result.errors,
    });
  } catch (err: any) {
    logger.error({ err }, "swap/multi-quote failed");
    res.status(500).json({ error: "Multi-quote failed" });
  }
});

// ── POST /swap/execute ────────────────────────────────────────────────────────
// Unified dispatcher: auto-routes to internal / letsexchange / split.
// Body:
//   assetIn, assetOut, amountIn    — required for all paths
//   walletAddress                  — required for internal leg
//   withdrawal, networkFrom, networkTo — required for LE/CN/SX/CL leg
//   allowSplit                     — boolean; opt in to split routing
//   forceSource                    — "internal"|"letsexchange" (trusted callers only)
//   minAmountOut                   — slippage guard for internal leg
//   externalVenue                  — "letsexchange"|"changenow"|"stealthex"|"changelly"
//                                    (overrides meta-router selection for external leg)
//   withdrawal_extra_id, return, rate_id, email — forwarded to LE
//
// Response shape:
//   source: "internal" | "letsexchange" | "split"
//   For split: { internal: { ... }, external: { ... } }
router.post("/swap/execute", async (req, res) => {
  const {
    walletAddress, assetIn, assetOut, amountIn,
    minAmountOut, withdrawal, networkFrom, networkTo, withdrawal_extra_id,
    return: refund, rate_id, email, forceSource, allowSplit, signature, nonce,
    externalVenue: rawExternalVenue,
  } = req.body ?? {};
  const externalVenue: ExternalVenue | null =
    typeof rawExternalVenue === "string" ? (rawExternalVenue as ExternalVenue) : null;

  if (!assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn are required" }); return;
  }
  const amt = parseFloat(String(amountIn));
  if (!isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amountIn must be a positive finite number" }); return;
  }
  if (amt > 1_000_000) {
    res.status(400).json({ error: "amountIn exceeds maximum swap size (1,000,000)" }); return;
  }
  const [a, b]   = [String(assetIn).toUpperCase(), String(assetOut).toUpperCase()];
  const splitOpt = allowSplit === true || allowSplit === "true";

  try {
    // forceSource: only accepted from trusted server-side callers (X-Internal-Token header).
    const INTERNAL_TOKEN  = process.env.INTERNAL_API_TOKEN;
    const callerToken     = req.headers["x-internal-token"];
    const isTrustedCaller = INTERNAL_TOKEN && callerToken && callerToken === INTERNAL_TOKEN;

    // Route decision is always re-evaluated at execution time (never stale).
    let decision = await getHybridRoute(a, b, amt, splitOpt);

    if (isTrustedCaller && (forceSource === "internal" || forceSource === "letsexchange")) {
      logger.info({ a, b, forceSource }, "swap/execute: trusted caller override");
      // Rebuild decision with forced source — reuse liquidity data but override
      decision = { ...decision, source: forceSource, fillBehavior: "reject_partial", splitLegs: null };
    } else if (forceSource) {
      logger.warn({ a, b, forceSource }, "swap/execute: forceSource ignored (missing/invalid token)");
    }

    const source = decision.source;

    const requiresEvmSignature =
      source === "internal" ||
      (source === "split" && (decision.splitLegs?.internal?.amount ?? 0) > 0);
    if (requiresEvmSignature && !verifyEvmSwapSignature(res, walletAddress, nonce, signature, "swap_internal")) {
      return;
    }

    // ── Helper: execute LE leg ────────────────────────────────────────────────
    const executeLELeg = async (leAmt: number): Promise<{ ok: boolean; status: number; data: unknown }> => {
      if (!withdrawal) throw new Error("MISSING_WITHDRAWAL");
      if (!networkFrom || !networkTo) throw new Error("MISSING_NETWORK");
      const ws = String(withdrawal).trim();
      if (ws.length < 10 || ws.length > 200) throw new Error("INVALID_WITHDRAWAL");
      const leBody: Record<string, unknown> = {
        float:               false,
        coin_from:           a, coin_to: b,
        network_from:        String(networkFrom),
        network_to:          String(networkTo),
        deposit_amount:      leAmt,
        withdrawal:          ws,
        withdrawal_extra_id: withdrawal_extra_id != null ? String(withdrawal_extra_id) : "",
        affiliate_id:        AFFILIATE_ID,
      };
      if (refund)  leBody["return"]  = String(refund);
      if (rate_id) leBody["rate_id"] = String(rate_id);
      if (email)   leBody["email"]   = String(email);
      return leRequest("/v1/transaction", "POST", leBody);
    };

    // ── Helper: execute internal leg ──────────────────────────────────────────
    const executeInternalLeg = async (internalAmt: number) => {
      if (!walletAddress) throw new Error("MISSING_WALLET");
      const rate = await resolveRate(a, b);
      if (!rate) throw new Error("NO_ORACLE");
      const gross   = internalAmt * rate;
      const fee     = gross * FEE_PCT;
      const amtOut  = gross - fee;
      if (minAmountOut) {
        const minOut = parseFloat(String(minAmountOut)) * (internalAmt / amt);
        if (amtOut < minOut) throw new Error(`SLIPPAGE_EXCEEDED:${amtOut.toFixed(8)}:${minOut.toFixed(8)}`);
      }
      await settleSwap({ walletAddress, assetIn: a, assetOut: b,
        amountIn: internalAmt.toFixed(18), amountOut: amtOut.toFixed(18) });
      await recordPlatformFee({ source: "swap", amount: fee, asset: b, txRef: walletAddress });
      return { gross, fee, amtOut, rate };
    };

    // ── Internal-only execution ───────────────────────────────────────────────
    if (source === "internal") {
      const { gross, fee, amtOut, rate } = await executeInternalLeg(amt).catch(err => {
        const msg = String(err?.message ?? "");
        if (msg === "MISSING_WALLET")  throw Object.assign(new Error("walletAddress is required for internal swap"), { status: 400 });
        if (msg === "NO_ORACLE")       throw Object.assign(new Error("No price available for this pair internally"), { status: 422 });
        if (msg.startsWith("SLIPPAGE_EXCEEDED")) {
          const [, out, min] = msg.split(":");
          throw Object.assign(new Error("Slippage exceeded"), { status: 422, detail: { amtOut: out, minOut: min } });
        }
        throw err;
      });
      logger.info({ walletMask: `${walletAddress?.slice(0,6)}…${walletAddress?.slice(-4)}`, a, b, amt, amtOut, source }, "hybrid swap: internal settled");
      return res.json({
        success: true, source: "internal",
        assetIn: a, assetOut: b,
        amountIn: amt.toFixed(8), amountOut: amtOut.toFixed(8),
        fee: fee.toFixed(8), feePct: FEE_PCT * 100,
        rate: rate.toFixed(8), timestamp: new Date().toISOString(),
      });
    }

    // ── Split execution: internal leg + LetsExchange leg ─────────────────────
    if (source === "split" && decision.splitLegs) {
      const internalAmt = decision.splitLegs.internal!.amount;
      const externalAmt = decision.splitLegs.external!.amount;

      // Execute internal leg first (ledger debit)
      const internalResult = await executeInternalLeg(internalAmt).catch(err => {
        const msg = String(err?.message ?? "");
        if (msg === "MISSING_WALLET") throw Object.assign(new Error("walletAddress is required for split swap internal leg"), { status: 400 });
        if (msg === "NO_ORACLE")      throw Object.assign(new Error("No price available for internal leg"), { status: 422 });
        throw err;
      });

      // Execute LE leg for the remainder.
      // If LE fails AFTER the internal leg succeeded, refund the user's internal
      // debit so they don't lose funds on a partial split execution.
      let leResult: { ok: boolean; status: number; data: unknown };
      try {
        leResult = await executeLELeg(externalAmt);
      } catch (leErr: any) {
        // Compensate: reverse the internal leg settlement so the user is whole.
        // Both balance updates run inside a single transaction so either both
        // succeed or both roll back — no partial refund leaves the user short.
        const refundClient = await pool.connect();
        try {
          await refundClient.query("BEGIN");
          await refundClient.query(
            `UPDATE user_balances
               SET available  = available + $1, updated_at = now()
             WHERE wallet_address = $2 AND asset_symbol = $3`,
            [internalAmt.toFixed(18), walletAddress, a],
          );
          await refundClient.query(
            `UPDATE user_balances
               SET available  = GREATEST(available - $1, 0), updated_at = now()
             WHERE wallet_address = $2 AND asset_symbol = $3`,
            [internalResult.amtOut.toFixed(18), walletAddress, b],
          );
          await refundClient.query("COMMIT");
        } catch (refundErr: any) {
          await refundClient.query("ROLLBACK").catch(() => {});
          logger.error(
            { refundErr: refundErr?.message, walletAddress },
            "swap: split route compensation refund failed — manual reconciliation needed",
          );
        } finally {
          refundClient.release();
        }
        const msg = String(leErr?.message ?? "");
        if (msg === "MISSING_WITHDRAWAL") throw Object.assign(new Error("withdrawal is required for split swap LetsExchange leg"), { status: 400 });
        if (msg === "MISSING_NETWORK")    throw Object.assign(new Error("networkFrom and networkTo required for LE leg"), { status: 400 });
        if (msg === "INVALID_WITHDRAWAL") throw Object.assign(new Error("Invalid withdrawal address"), { status: 400 });
        throw leErr;
      }

      if (leResult.status === 403) { res.status(403).json({ error: "LetsExchange API key invalid" }); return; }
      if (leResult.status === 422) {
        logger.warn({ leData: leResult.data }, "swap: LetsExchange 422 validation error");
        res.status(422).json({ error: "LE validation error" }); return;
      }
      if (!leResult.ok) {
        logger.warn({ leStatus: leResult.status, leData: leResult.data }, "swap: LetsExchange error");
        res.status(leResult.status > 0 && leResult.status < 600 ? leResult.status : 502).json({ error: "Exchange provider error" }); return;
      }

      logger.info({
        walletMask: `${walletAddress?.slice(0,6)}…${walletAddress?.slice(-4)}`,
        a, b, amt, internalAmt, externalAmt, source: "split",
      }, "hybrid swap: split settled");

      return res.json({
        success: true, source: "split",
        requestedAmount: amt.toFixed(8),
        assetIn: a, assetOut: b,
        timestamp: new Date().toISOString(),
        internal: {
          filled:    internalAmt.toFixed(8),
          vwap:      internalResult.rate.toFixed(8),
          amountOut: internalResult.amtOut.toFixed(8),
          fee:       internalResult.fee.toFixed(8),
          feePct:    FEE_PCT * 100,
        },
        external: {
          filled:    externalAmt.toFixed(8),
          provider:  "letsexchange",
          ...(leResult.data as object),
        },
      });
    }

    // ── External-only execution (LetsExchange / ChangeNOW / StealthEX / Changelly) ──
    if (!withdrawal) {
      res.status(400).json({ error: "withdrawal address is required for external routing" }); return;
    }
    const withdrawalStr = String(withdrawal).trim();
    if (withdrawalStr.length < 10 || withdrawalStr.length > 200) {
      res.status(400).json({ error: "Invalid withdrawal address" }); return;
    }

    // Determine which venue to use.
    // Priority: explicit externalVenue param > meta-router selection > letsexchange fallback.
    let chosenVenue: ExternalVenue = externalVenue ?? "letsexchange";
    if (!externalVenue) {
      // Auto-select best venue via meta-router (best-effort; falls back to LE on error)
      try {
        const [inUsd, outUsd] = await Promise.all([
          resolveRate(a, "USDT").catch(() => null),
          resolveRate(b, "USDT").catch(() => null),
        ]);
        const { best } = await getBestExternalQuote(a, b, amt, inUsd ?? 1, outUsd ?? 1);
        if (best) chosenVenue = best.venue;
      } catch (metaErr) {
        logger.warn({ metaErr }, "swap/execute: meta-router selection failed, defaulting to letsexchange");
      }
    }

    logger.info({ a, b, amt, chosenVenue }, "hybrid swap: external leg executing");

    // ── ChangeNOW ─────────────────────────────────────────────────────────────
    if (chosenVenue === "changenow") {
      const result = await createCNExchange({
        from:     a,
        to:       b,
        amount:   amt,
        address:  withdrawalStr,
        extraId:  withdrawal_extra_id ? String(withdrawal_extra_id) : undefined,
        refundAddress: refund ? String(refund) : undefined,
        // Forward the rate_id returned by GET /swap/quote so ChangeNOW honours
        // the locked rate the user was shown, rather than re-pricing at execution.
        rateId:   rate_id ? String(rate_id) : undefined,
      });
      if (!result.ok) {
        res.status(422).json({ error: result.error, venue: "changenow" }); return;
      }
      logger.info({ a, b, amt, id: result.exchange.id, venue: "changenow" }, "hybrid swap: ChangeNOW routed");
      return res.json({
        success: true,
        source:  "changenow",
        id:      result.exchange.id,
        depositAddress:  result.exchange.depositAddress,
        depositExtraId:  result.exchange.depositExtraId,
        estimatedAmount: result.exchange.estimatedAmount,
      });
    }

    // ── StealthEX ─────────────────────────────────────────────────────────────
    if (chosenVenue === "stealthex") {
      const result = await createSXExchange({
        from:     a,
        to:       b,
        amount:   amt,
        address:  withdrawalStr,
        extraId:  withdrawal_extra_id ? String(withdrawal_extra_id) : undefined,
      });
      if (!result.ok) {
        res.status(422).json({ error: result.error, venue: "stealthex" }); return;
      }
      logger.info({ a, b, amt, id: result.exchange.id, venue: "stealthex" }, "hybrid swap: StealthEX routed");
      return res.json({
        success: true,
        source:  "stealthex",
        id:      result.exchange.id,
        depositAddress:  result.exchange.depositAddress,
        depositExtraId:  result.exchange.depositExtraId,
        estimatedAmount: result.exchange.estimatedAmount,
      });
    }

    // ── Changelly ─────────────────────────────────────────────────────────────
    if (chosenVenue === "changelly") {
      const result = await createChangellyExchange({
        from:           a,
        to:             b,
        amount:         amt,
        address:        withdrawalStr,
        extraId:        withdrawal_extra_id ? String(withdrawal_extra_id) : undefined,
        refundAddress:  refund ? String(refund) : undefined,
      });
      if (!result.ok) {
        res.status(422).json({ error: result.error, venue: "changelly" }); return;
      }
      logger.info({ a, b, amt, id: result.exchange.id, venue: "changelly" }, "hybrid swap: Changelly routed");
      return res.json({
        success: true,
        source:  "changelly",
        id:      result.exchange.id,
        depositAddress:  result.exchange.depositAddress,
        depositExtraId:  result.exchange.depositExtraId,
        estimatedAmount: result.exchange.estimatedAmount,
      });
    }

    // ── LetsExchange (default) ────────────────────────────────────────────────
    if (!networkFrom || !networkTo) {
      res.status(400).json({ error: "networkFrom and networkTo are required for LetsExchange routing" }); return;
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
    if (status === 422) {
      logger.warn({ leData: data }, "swap: LetsExchange 422 validation error (LE-only path)");
      res.status(422).json({ error: "Validation error" }); return;
    }
    if (!ok) {
      logger.warn({ leStatus: status, leData: data }, "swap: LetsExchange error (LE-only path)");
      res.status(status > 0 && status < 600 ? status : 502).json({ error: "Exchange provider error" }); return;
    }

    logger.info({ a, b, amt, withdrawal: withdrawalStr, venue: "letsexchange" }, "hybrid swap: LE routed");
    return res.json({ success: true, source: "letsexchange", ...(data as object) });

  } catch (err: any) {
    if (err?.message?.startsWith("INSUFFICIENT_FUNDS")) {
      const asset = err.message.split(":")[1] ?? assetIn;
      res.status(422).json({ error: "Insufficient balance", asset }); return;
    }
    logger.error({ err }, "swap/execute failed");
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});
// ── GET /swap/exchange/:venue/:id ─────────────────────────────────────────────
// Unified exchange status endpoint for all external swap venues.
// venue: "changenow" | "stealthex" | "changelly"
// Returns: { status, txTo }
router.get("/swap/exchange/:venue/:id", async (req, res) => {
  const { venue, id } = req.params;
  if (!id) { res.status(400).json({ error: "id is required" }); return; }

  try {
    let result: { status: string; txTo: string | null } | null = null;

    switch (venue) {
      case "changenow":
        result = await getCNExchange(id);
        break;
      case "stealthex":
        result = await getSXExchange(id);
        break;
      case "changelly":
        result = await getChangellyExchange(id);
        break;
      default:
        res.status(400).json({ error: `Unknown venue: ${venue}. Use changenow, stealthex, or changelly.` });
        return;
    }

    if (!result) {
      res.status(404).json({ error: "Exchange not found or provider unavailable" });
      return;
    }

    res.json({ venue, id, ...result });
  } catch (err: any) {
    logger.error({ err, venue, id }, "swap/exchange status failed");
    res.status(500).json({ error: "Status check failed" });
  }
});

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
      .where(and(
        or(eq(marketsTable.symbol, direct), eq(marketsTable.symbol, inverse)),
        ne(marketsTable.type, "letsexchange"),
      ))
      .orderBy(desc(marketsTable.updatedAt))
      .limit(1);

    if (!mkt) {
      // Try routing via USDT if neither is stablecoin
      if (!STABLES.has(assetIn) && !STABLES.has(assetOut)) {
        const [inMkt]  = await db.select({ lastPrice: marketsTable.lastPrice })
          .from(marketsTable)
          .where(and(eq(marketsTable.symbol, `${assetIn}/USDT`), ne(marketsTable.type, "letsexchange")))
          .orderBy(desc(marketsTable.updatedAt)).limit(1);
        const [outMkt] = await db.select({ lastPrice: marketsTable.lastPrice })
          .from(marketsTable)
          .where(and(eq(marketsTable.symbol, `${assetOut}/USDT`), ne(marketsTable.type, "letsexchange")))
          .orderBy(desc(marketsTable.updatedAt)).limit(1);
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
