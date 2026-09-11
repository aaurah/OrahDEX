/**
 * leAutoRoute.ts — Automatic external-venue fill for market orders with no DEX liquidity.
 *
 * When a market order finds no matching counter-orders in the DEX order book, this module
 * queries all configured swap venues (LetsExchange, SimpleSwap, ChangeNow, StealthEx),
 * picks the best quote, and executes the exchange transparently. The order is marked
 * "filled" in the order log — the user sees a normal trade, not a swap.
 *
 * Only applies to custodial (internal-ledger) users (fundingRef starts with "ledger:").
 */

import { pool, db } from "@workspace/db";
import { leSwapsTable } from "@workspace/db/schema";
import { getBestExternalQuote } from "./metaRouter.js";
import { createSsExchangePair } from "./simpleswap.js";
import { createCNExchange } from "./changenow.js";
import { createSXExchange } from "./stealthex.js";
import { quoteFromSZ, createSzTransaction } from "./swapzone.js";
import { leRequest, getCachedLEPrices, AFFILIATE_ID } from "./lePriceCache.js";
import { LE_COIN_NETWORK } from "./leCoinNetwork.js";
import { creditAvailable } from "./ledger.js";
import { getOrCreateEvmHotWallet } from "./exchangeHotWallet.js";
import pino from "pino";

const logger = pino({ name: "leAutoRoute" });

export interface LeAutoRouteParams {
  orderId:       string;
  walletAddress: string;
  symbol:        string;   // e.g. "BTC/USDT"
  side:          "buy" | "sell";
  quantity:      number;   // base asset quantity
  lockAmount:    number;   // quote amount locked (buy) or equals quantity (sell)
  fundingRef:    string;
  feeRate:       number;
}

export interface LeAutoRouteResult {
  ok:              boolean;
  filledQty:       number;  // base quantity filled
  fillPrice:       number;  // quote per base (effective rate)
  fillValue:       number;  // quote amount spent or received
  leTransactionId?: string;
  venue?:          string;
  error?:          string;
}

/**
 * Attempt to fill an unmatched market order via the best external swap venue.
 * Returns ok=true when the fill was executed and user balances updated.
 */
export async function attemptLeAutoRoute(
  params: LeAutoRouteParams,
): Promise<LeAutoRouteResult> {
  const { orderId, walletAddress, symbol, side, quantity, lockAmount, fundingRef } = params;

  // Only for custodial (internal ledger) users — format: "ledger:{addr}:{asset}:{amount}"
  if (!fundingRef.startsWith("ledger:")) {
    return fail("LE auto-route only available for custodial accounts");
  }

  const parts = symbol.split("/");
  const baseAsset  = parts[0] ?? "";
  const quoteAsset = parts[1] ?? "USDT";
  if (!baseAsset) return fail("Invalid symbol");

  // BUY  BTC/USDT → user spends lockAmount USDT, receives BTC
  // SELL BTC/USDT → user spends quantity   BTC,  receives USDT
  const fromCoin = side === "buy" ? quoteAsset : baseAsset;
  const toCoin   = side === "buy" ? baseAsset  : quoteAsset;
  const spendAmt = side === "buy" ? lockAmount  : quantity;

  if (spendAmt <= 0) return fail("Spend amount is zero");

  // USD prices for venue scoring
  const leUsd     = getCachedLEPrices();
  const inputUsd  = leUsd[fromCoin]  ?? (fromCoin  === "USDT" ? 1 : 0);
  const outputUsd = leUsd[toCoin]    ?? (toCoin    === "USDT" ? 1 : 0);

  // Query all venues in parallel; prefer LetsExchange and SimpleSwap
  const { best, lowestMin } = await getBestExternalQuote(
    fromCoin, toCoin, spendAmt, inputUsd, outputUsd,
    { preferredVenues: ["letsexchange", "simpleswap"] },
  );

  if (!best || !best.canExecute || best.expectedOutput <= 0) {
    const minNote = lowestMin ? ` (min: ${lowestMin.toFixed(4)} ${fromCoin})` : "";
    return fail(`No venue available for ${spendAmt} ${fromCoin}→${toCoin}${minNote}`);
  }

  const expectedOutput = best.expectedOutput;
  const venue          = best.venue;

  // Effective fill amounts
  // BUY:  filledQty = base received (expectedOutput), fillValue = USDT spent (lockAmount)
  // SELL: filledQty = base sold (quantity),           fillValue = USDT received (expectedOutput)
  const filledQty = side === "buy" ? expectedOutput : quantity;
  const fillValue = side === "buy" ? lockAmount      : expectedOutput;
  const fillPrice = filledQty > 0 ? fillValue / filledQty : 0;

  // Platform's receiving address — where the venue sends the toCoin
  let platformReceiveAddr = "";
  try {
    const hw = await getOrCreateEvmHotWallet();
    platformReceiveAddr = hw.address;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "leAutoRoute: hot wallet unavailable — skipping exchange creation");
  }

  // Create exchange on the winning venue (platform acts as counterparty)
  // The actual coin movement is tracked and reconciled via leSwapsTable + selfHealingReconciler.
  let leTransactionId: string | undefined;

  if (platformReceiveAddr) {
    try {
      const exchResult = await createVenueExchange(venue, fromCoin, toCoin, spendAmt, platformReceiveAddr);
      if (exchResult.ok && exchResult.transactionId) {
        leTransactionId = exchResult.transactionId;

        const leUsdNow   = getCachedLEPrices();
        const fromUsdNow = leUsdNow[fromCoin] ?? (fromCoin === "USDT" ? 1 : 0);
        const depositUsd = fromUsdNow > 0 ? (spendAmt * fromUsdNow).toFixed(4) : null;

        db.insert(leSwapsTable).values({
          id:               leTransactionId,
          coinFrom:         fromCoin,
          coinTo:           toCoin,
          networkFrom:      fromCoin,
          networkTo:        toCoin,
          depositAmount:    String(spendAmt),
          withdrawalAmount: String(expectedOutput),
          depositAmountUsd: depositUsd,
          status:           "wait",
          withdrawal:       platformReceiveAddr,
        }).onConflictDoNothing()
          .catch(e => logger.warn({ err: (e as any)?.message }, "leAutoRoute: leSwapsTable insert failed"));
      }
    } catch (exchErr: any) {
      logger.warn(
        { err: exchErr?.message, venue, from: fromCoin, to: toCoin },
        "leAutoRoute: exchange creation failed — proceeding with optimistic balance credit",
      );
    }
  }

  // ── Settle user balances ─────────────────────────────────────────────────────
  // Consume locked FROM balance, credit TO balance
  const addr = walletAddress.toLowerCase();
  try {
    await pool.query(
      `UPDATE user_balances
       SET locked     = GREATEST(locked - $1::numeric, 0),
           updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [String(spendAmt), addr, fromCoin],
    );
    await creditAvailable(walletAddress, toCoin, String(expectedOutput));
  } catch (balErr: any) {
    logger.error(
      { err: balErr?.message, orderId, fromCoin, toCoin },
      "leAutoRoute: balance settlement failed",
    );
    return fail(`Balance settlement error: ${balErr?.message}`);
  }

  logger.info(
    { orderId, venue, fromCoin, toCoin, spendAmt, expectedOutput, fillPrice, leTransactionId },
    "leAutoRoute: market order filled via external venue",
  );

  return { ok: true, filledQty, fillPrice, fillValue, leTransactionId, venue };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fail(error: string): LeAutoRouteResult {
  return { ok: false, filledQty: 0, fillPrice: 0, fillValue: 0, error };
}

export async function createVenueExchange(
  venue:   string,
  from:    string,
  to:      string,
  amount:  number,
  address: string,
): Promise<{ ok: boolean; transactionId?: string; depositAddress?: string; depositExtraId?: string | null }> {
  try {
    if (venue === "simpleswap") {
      const r = await createSsExchangePair({ from, to, amount, address });
      return r.ok
        ? { ok: true, transactionId: r.exchange.id, depositAddress: r.exchange.depositAddress, depositExtraId: r.exchange.depositExtraId ?? null }
        : { ok: false };
    }
    if (venue === "changenow") {
      const r = await createCNExchange({ from, to, amount, address });
      return r.ok
        ? { ok: true, transactionId: r.exchange.id, depositAddress: r.exchange.depositAddress }
        : { ok: false };
    }
    if (venue === "stealthex") {
      const r = await createSXExchange({ from, to, amount, address });
      return r.ok
        ? { ok: true, transactionId: r.exchange.id, depositAddress: r.exchange.depositAddress }
        : { ok: false };
    }
    if (venue === "letsexchange") {
      const fromU2 = from.toUpperCase();
      const toU2   = to.toUpperCase();
      const body = {
        from:         fromU2,
        to:           toU2,
        network_from: LE_COIN_NETWORK[fromU2]?.network ?? fromU2,
        network_to:   LE_COIN_NETWORK[toU2]?.network   ?? toU2,
        amount,
        withdrawal:   address,
        affiliate_id: AFFILIATE_ID,
      };
      const { ok, data } = await leRequest("/v1/transaction", "POST", body);
      if (ok && data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        const txId        = String(d.id ?? d.transaction_id ?? "");
        const depositAddr = String(d.deposit_address ?? "");
        const depositExtra = d.deposit_extra_id ? String(d.deposit_extra_id) : null;
        return txId ? { ok: true, transactionId: txId, depositAddress: depositAddr, depositExtraId: depositExtra } : { ok: false };
      }
      return { ok: false };
    }
    if (venue === "swapzone") {
      // SwapZone requires a fresh rateId — get a new quote right before creating
      const szQuote = await quoteFromSZ(from, to, amount);
      if (!szQuote?.rateId) return { ok: false };
      const r = await createSzTransaction({
        from,
        to,
        amount,
        rateId:         szQuote.rateId,
        addressReceive: address,
        addressRefund:  address,
      });
      return r.ok
        ? { ok: true, transactionId: r.exchange.id, depositAddress: r.exchange.depositAddress, depositExtraId: r.exchange.depositExtraId ?? null }
        : { ok: false };
    }
    // Other venues (changelly) not yet integrated for auto-route
    return { ok: false };
  } catch (e: any) {
    logger.warn({ err: e?.message, venue }, "createVenueExchange: exception");
    return { ok: false };
  }
}
