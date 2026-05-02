/**
 * buy.ts — Hybrid BUY routing (oracle price, no orderbook)
 *
 * Routing decision:
 *  1. Look up the pair in marketsTable (spot type only).
 *     If a price exists → "native": settle atomically via the ledger at the
 *     oracle price.  No orderbook walk, no VWAP, no AMM depth checks.
 *  2. Otherwise → "letsexchange": proxy the exchange to LetsExchange.io.
 *
 * Endpoints:
 *   POST /api/buy/quote   — read-only; returns route + price estimate
 *   POST /api/buy/execute — executes the buy; native clears instantly,
 *                           LE returns a deposit address + transaction ID
 *
 * Body fields (both endpoints):
 *   coinToSpend   {string}  Asset the user pays with        (e.g. "BSV")
 *   coinToBuy     {string}  Asset the user wants to receive (e.g. "ETH")
 *   amountToSpend {number}  How much of coinToSpend to send
 *
 * Additional fields for /execute:
 *   walletAddress        {string}  Required for native route (internal ledger)
 *   withdrawal           {string}  Required for LE route (destination address)
 *   networkFrom          {string}  Required for LE route
 *   networkTo            {string}  Required for LE route
 *   withdrawal_extra_id  {string?} LE optional (XRP tag, XMR payment ID, …)
 *   return               {string?} LE optional refund address
 *   rate_id              {string?} LE optional locked-rate ID from quote
 *   email                {string?} LE optional notification email
 *   minAmountOut         {number?} Slippage guard for native route
 *
 * Additional fields for /quote (LE path only):
 *   networkFrom  {string}  Required when not native (needed for /v1/info call)
 *   networkTo    {string}  Required when not native
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketsTable, leSwapsTable } from "@workspace/db/schema";
import { or, eq, and } from "drizzle-orm";
import { settleSwap } from "../lib/ledger.js";
import { recordPlatformFee } from "../lib/feeCollector.js";
import { leRequest, AFFILIATE_ID, getCachedLEPrices } from "../lib/lePriceCache.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// ── Constants ──────────────────────────────────────────────────────────────────
const NATIVE_FEE_PCT = 0.003; // 0.3% platform fee on native swaps
const SYMBOL_RE      = /^[A-Z0-9.]{1,20}$/;
const MAX_SPEND      = 1_000_000; // hard cap — prevents overflow attacks

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Look up the oracle price for spending `from` to receive `to`.
 * Returns the rate (1 `from` = N `to`) if the pair is natively listed,
 * or null if not found / price is unavailable.
 *
 * Checks direct pair (FROM/TO) and inverse (TO/FROM) in marketsTable.
 * Only considers rows with type = "spot" so LE-mirrored rows are excluded.
 */
async function resolveNativeRate(from: string, to: string): Promise<number | null> {
  const direct  = `${from}/${to}`;
  const inverse = `${to}/${from}`;

  try {
    const [mkt] = await db
      .select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice })
      .from(marketsTable)
      .where(
        and(
          or(eq(marketsTable.symbol, direct), eq(marketsTable.symbol, inverse)),
          eq(marketsTable.type, "spot"),
        ),
      )
      .limit(1);

    if (!mkt) return null;

    const price = parseFloat(String(mkt.lastPrice));
    if (!price || !Number.isFinite(price) || price <= 0) return null;

    return mkt.symbol === inverse ? 1 / price : price;
  } catch {
    return null;
  }
}

/** Validate and upper-case coin symbol; returns null on invalid input. */
function cleanSymbol(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return SYMBOL_RE.test(s) ? s : null;
}

// ── POST /api/buy/quote ────────────────────────────────────────────────────────
/**
 * Read-only price estimate.
 * Always safe to call repeatedly — no state is mutated.
 *
 * Response shape (native):
 *   { route:"native", coinToSpend, coinToBuy, amountToSpend,
 *     estimatedAmountOut, fee, feePct, rate }
 *
 * Response shape (letsexchange):
 *   { route:"letsexchange", coinToSpend, coinToBuy, amountToSpend,
 *     estimatedAmountOut, rate, minAmount, maxAmount, rate_id,
 *     networkFrom, networkTo }
 */
router.post("/buy/quote", async (req, res) => {
  const {
    coinToSpend, coinToBuy, amountToSpend,
    networkFrom, networkTo,
  } = req.body ?? {};

  // ── Input validation ───────────────────────────────────────────────────────
  const from = cleanSymbol(coinToSpend);
  const to   = cleanSymbol(coinToBuy);
  if (!from || !to) {
    res.status(400).json({ error: "coinToSpend and coinToBuy are required valid symbols" });
    return;
  }
  if (from === to) {
    res.status(400).json({ error: "coinToSpend and coinToBuy must be different assets" });
    return;
  }
  const amt = parseFloat(String(amountToSpend));
  if (!Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amountToSpend must be a positive number" });
    return;
  }
  if (amt > MAX_SPEND) {
    res.status(400).json({ error: "amountToSpend exceeds maximum allowed size" });
    return;
  }

  try {
    // ── Step 1: check native support ──────────────────────────────────────────
    const rate = await resolveNativeRate(from, to);

    if (rate !== null) {
      // Native path — oracle price, no orderbook
      const grossOut = amt * rate;
      const fee      = grossOut * NATIVE_FEE_PCT;
      const amtOut   = grossOut - fee;

      res.json({
        route:                "native",
        coinToSpend:          from,
        coinToBuy:            to,
        amountToSpend:        amt.toFixed(8),
        estimatedAmountOut:   amtOut.toFixed(8),
        grossOut:             grossOut.toFixed(8),
        fee:                  fee.toFixed(8),
        feePct:               NATIVE_FEE_PCT * 100,
        rate:                 rate.toFixed(8),
      });
      return;
    }

    // ── Step 2: fall back to LetsExchange ────────────────────────────────────
    // networkFrom and networkTo are required to call /v1/info.
    if (!networkFrom || !networkTo) {
      res.status(422).json({
        error:   "Pair not natively supported — networkFrom and networkTo are required for a LetsExchange quote",
        route:   "letsexchange",
        coinToSpend: from,
        coinToBuy:   to,
      });
      return;
    }

    const leBody = {
      from:         from,
      to:           to,
      network_from: String(networkFrom),
      network_to:   String(networkTo),
      amount:       amt,
      affiliate_id: AFFILIATE_ID,
      float:        false,
    };

    const { ok, data, status } = await leRequest("/v1/info", "POST", leBody);

    if (status === 403) { res.status(403).json({ error: "LetsExchange API key invalid" }); return; }
    if (status === 404) {
      const msg = ((data as any)?.error as string) ?? "Pair not available on LetsExchange";
      res.status(404).json({ error: msg, route: "letsexchange", coinToSpend: from, coinToBuy: to });
      return;
    }
    if (status === 422) { res.status(422).json({ error: "LetsExchange validation error", detail: data }); return; }
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }

    const d = data as Record<string, unknown>;

    res.json({
      route:              "letsexchange",
      coinToSpend:        from,
      coinToBuy:          to,
      amountToSpend:      amt.toFixed(8),
      estimatedAmountOut: d.amount  != null ? String(d.amount)  : null,
      rate:               d.rate    != null ? String(d.rate)    : null,
      minAmount:          d.min_amount != null ? String(d.min_amount) : null,
      maxAmount:          d.max_amount != null ? String(d.max_amount) : null,
      rate_id:            d.rate_id != null ? String(d.rate_id) : null,
      rateIdExpiresAt:    d.rate_id_expired_at ?? null,
      withdrawalFee:      d.withdrawal_fee ?? null,
      networkFrom:        String(networkFrom),
      networkTo:          String(networkTo),
    });
  } catch (err) {
    logger.error({ err }, "buy/quote failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/buy/execute ──────────────────────────────────────────────────────
/**
 * Execute the buy.
 *
 * Native response:
 *   { success:true, route:"native", coinToSpend, coinToBuy,
 *     amountSpent, amountReceived, fee, feePct, rate, timestamp }
 *
 * LetsExchange response (pass-through from LE + route tag):
 *   { success:true, route:"letsexchange", ...leTransactionObject }
 *   The LE object includes: transaction_id, status, deposit (address),
 *   deposit_extra_id, withdrawal_amount, expiration_time, etc.
 */
router.post("/buy/execute", async (req, res) => {
  const {
    coinToSpend, coinToBuy, amountToSpend,
    // Native-only
    walletAddress, minAmountOut,
    // LE-only
    withdrawal, networkFrom, networkTo,
    withdrawal_extra_id, return: refund, rate_id, email,
  } = req.body ?? {};

  // ── Input validation ───────────────────────────────────────────────────────
  const from = cleanSymbol(coinToSpend);
  const to   = cleanSymbol(coinToBuy);
  if (!from || !to) {
    res.status(400).json({ error: "coinToSpend and coinToBuy are required valid symbols" });
    return;
  }
  if (from === to) {
    res.status(400).json({ error: "coinToSpend and coinToBuy must be different assets" });
    return;
  }
  const amt = parseFloat(String(amountToSpend));
  if (!Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amountToSpend must be a positive finite number" });
    return;
  }
  if (amt > MAX_SPEND) {
    res.status(400).json({ error: "amountToSpend exceeds maximum allowed size" });
    return;
  }

  try {
    // ── Step 1: routing decision ───────────────────────────────────────────────
    const rate = await resolveNativeRate(from, to);

    // ════════════════════════════════════════════════════════════════════════════
    // NATIVE PATH
    // ════════════════════════════════════════════════════════════════════════════
    if (rate !== null) {
      if (!walletAddress) {
        res.status(400).json({ error: "walletAddress is required for a native buy" });
        return;
      }

      const grossOut = amt * rate;
      const fee      = grossOut * NATIVE_FEE_PCT;
      const amtOut   = grossOut - fee;

      // Slippage guard
      if (minAmountOut != null) {
        const minOut = parseFloat(String(minAmountOut));
        if (Number.isFinite(minOut) && amtOut < minOut) {
          res.status(422).json({
            error:         "Slippage exceeded",
            code:          "SLIPPAGE_EXCEEDED",
            amountOut:     amtOut.toFixed(8),
            minAmountOut:  minOut.toFixed(8),
          });
          return;
        }
      }

      // Atomic ledger settlement: debit coinToSpend, credit coinToBuy
      await settleSwap({
        walletAddress,
        assetIn:   from,
        assetOut:  to,
        amountIn:  amt.toFixed(18),
        amountOut: amtOut.toFixed(18),
      });

      // Record platform revenue
      await recordPlatformFee({
        source: "buy",
        amount: fee,
        asset:  to,
        txRef:  walletAddress,
      });

      logger.info({
        walletMask: `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`,
        from, to, amt, amtOut, fee, route: "native",
      }, "buy/execute: native settled");

      res.json({
        success:         true,
        route:           "native",
        coinToSpend:     from,
        coinToBuy:       to,
        amountSpent:     amt.toFixed(8),
        amountReceived:  amtOut.toFixed(8),
        fee:             fee.toFixed(8),
        feePct:          NATIVE_FEE_PCT * 100,
        rate:            rate.toFixed(8),
        timestamp:       new Date().toISOString(),
      });
      return;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // LETSEXCHANGE PATH
    // ════════════════════════════════════════════════════════════════════════════

    // Validate LE-required fields
    if (!withdrawal) {
      res.status(400).json({
        error: "withdrawal address is required for LetsExchange routing",
        route: "letsexchange",
      });
      return;
    }
    if (!networkFrom || !networkTo) {
      res.status(400).json({
        error: "networkFrom and networkTo are required for LetsExchange routing",
        route: "letsexchange",
      });
      return;
    }

    const withdrawalStr = String(withdrawal).trim();
    if (withdrawalStr.length < 10 || withdrawalStr.length > 200) {
      res.status(400).json({ error: "Invalid withdrawal address" });
      return;
    }

    const leBody: Record<string, unknown> = {
      float:               false,
      coin_from:           from,
      coin_to:             to,
      network_from:        String(networkFrom),
      network_to:          String(networkTo),
      deposit_amount:      amt,
      withdrawal:          withdrawalStr,
      withdrawal_extra_id: withdrawal_extra_id != null ? String(withdrawal_extra_id) : "",
      affiliate_id:        AFFILIATE_ID,
    };
    if (refund)  leBody["return"]  = String(refund);
    if (rate_id) leBody["rate_id"] = String(rate_id);
    if (email)   leBody["email"]   = String(email);

    const { ok, data, status } = await leRequest("/v1/transaction", "POST", leBody);

    if (status === 403) { res.status(403).json({ error: "LetsExchange API key invalid" }); return; }
    if (status === 422) { res.status(422).json({ error: "LetsExchange validation error", detail: data }); return; }
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }

    // Persist the swap record for admin tracking + revenue attribution
    const d = data as Record<string, unknown>;
    if (d?.transaction_id) {
      const leUsd     = getCachedLEPrices();
      const fromUsd   = leUsd[from] ?? 0;
      const depositUsd = fromUsd > 0 ? (amt * fromUsd).toFixed(4) : null;

      db.insert(leSwapsTable).values({
        id:               String(d.transaction_id),
        coinFrom:         from,
        coinTo:           to,
        networkFrom:      String(networkFrom),
        networkTo:        String(networkTo),
        depositAmount:    String(amt),
        withdrawalAmount: d.withdrawal_amount ? String(d.withdrawal_amount) : null,
        depositAmountUsd: depositUsd,
        status:           String(d.status ?? "waiting"),
        withdrawal:       withdrawalStr,
      }).onConflictDoNothing()
        .catch(e => logger.warn({ err: e }, "buy/execute: le_swaps insert failed"));
    }

    logger.info({
      from, to, amt,
      txId: d.transaction_id ?? null,
      route: "letsexchange",
    }, "buy/execute: LE transaction created");

    res.json({ success: true, route: "letsexchange", ...d });

  } catch (err: any) {
    if (err?.message?.startsWith("INSUFFICIENT_FUNDS")) {
      const asset = err.message.split(":")[1] ?? from;
      res.status(422).json({ error: "Insufficient balance", asset });
      return;
    }
    logger.error({ err }, "buy/execute failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
