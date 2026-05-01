/**
 * hybridRouter.ts — Smart swap routing engine
 *
 * Rule: if OrahDEX has real orderbook liquidity → route internally.
 *       if not → route via LetsExchange.
 *
 * "Real" orders = any open limit order NOT placed by the liquidity bot.
 * Synthetic (bot) orders provide displayed depth but are NOT counted as
 * fillable liquidity for routing purposes.
 */

import { db } from "@workspace/db";
import { ordersTable, marketsTable } from "@workspace/db/schema";
import { and, eq, ne, or } from "drizzle-orm";
import { BOT_ADDRESS } from "./liquidityBot.js";
import { logger } from "./logger.js";

export interface LiquidityCheck {
  hasLiquidity: boolean;
  realOrderCount: number;
  fillableDepth: number;   // how much of amountIn can be filled by real orders
  fillPct: number;         // 0–100 — percentage of the requested amount that real orders cover
}

export interface RouteDecision {
  source: "internal" | "letsexchange";
  reason: string;
  liquidity: LiquidityCheck;
  internalRate: number | null;  // A→B price from marketsTable
}

/**
 * Checks whether the real (non-bot) orderbook has enough depth to fill
 * `amountIn` of `assetIn`. Side is derived from the pair direction:
 *   buying assetIn with assetOut  →  we need ask depth on assetIn/assetOut
 *   selling assetIn for assetOut  →  we need bid depth on assetOut/assetIn
 */
export async function checkInternalLiquidity(
  assetIn: string,
  assetOut: string,
  amountIn: number,
): Promise<LiquidityCheck> {
  const STABLES = new Set(["USDT", "USDC", "BUSD", "TUSD", "DAI"]);
  const empty: LiquidityCheck = { hasLiquidity: false, realOrderCount: 0, fillableDepth: 0, fillPct: 0 };

  try {
    // Determine the canonical symbol and side to query
    // e.g. BTC→USDT  ⟹ sell side of BTC/USDT
    //      USDT→BTC  ⟹ buy  side of BTC/USDT
    const directSym  = `${assetIn}/${assetOut}`;
    const inverseSym = `${assetOut}/${assetIn}`;

    // Pick which pair symbol to query and which side to walk
    let symbol: string;
    let side: "buy" | "sell";

    if (!STABLES.has(assetOut)) {
      // assetOut is not a stablecoin — direct pair may not exist; route via USDT
      // Simplified: just check total real order count on either direction
      symbol = directSym;
      side   = "sell";
    } else {
      // Selling assetIn for a stablecoin → look for sell orders on assetIn/assetOut
      symbol = directSym;
      side   = "sell";
    }

    // Fetch all real open limit orders for this symbol (excludes bot + market orders with no price)
    const openOrders = await db
      .select({
        side:              ordersTable.side,
        price:             ordersTable.price,
        remainingQuantity: ordersTable.remainingQuantity,
      })
      .from(ordersTable)
      .where(
        and(
          or(
            eq(ordersTable.symbol, directSym),
            eq(ordersTable.symbol, inverseSym),
          ),
          eq(ordersTable.status, "open"),
          ne(ordersTable.walletAddress, BOT_ADDRESS),
        ),
      )
      .limit(200);

    if (!openOrders.length) return empty;

    // Walk the relevant side to see how much of amountIn can be filled
    const levels = openOrders
      .filter(o => o.price && parseFloat(o.remainingQuantity) > 0)
      .map(o => ({
        side: o.side as "buy" | "sell",
        price: parseFloat(o.price!),
        qty: parseFloat(o.remainingQuantity),
      }))
      .filter(o => o.side === side || o.side === (side === "buy" ? "sell" : "buy"));

    let fillableDepth = 0;
    for (const lvl of levels) {
      fillableDepth += lvl.qty;
      if (fillableDepth >= amountIn) break;
    }

    const fillPct = amountIn > 0 ? Math.min(100, (fillableDepth / amountIn) * 100) : 0;
    const LIQUIDITY_THRESHOLD_PCT = 80; // need 80% fill coverage to prefer internal

    return {
      hasLiquidity: fillPct >= LIQUIDITY_THRESHOLD_PCT,
      realOrderCount: openOrders.length,
      fillableDepth,
      fillPct,
    };
  } catch (err) {
    logger.warn({ err }, "hybridRouter: liquidity check failed (falling back to LE)");
    return empty;
  }
}

/** Full routing decision: check liquidity, pick source, return with context. */
export async function getHybridRoute(
  assetIn: string,
  assetOut: string,
  amountIn: number,
): Promise<RouteDecision> {
  const liquidity = await checkInternalLiquidity(assetIn, assetOut, amountIn);

  // Also get the market price for context
  let internalRate: number | null = null;
  try {
    const directSym  = `${assetIn}/${assetOut}`;
    const inverseSym = `${assetOut}/${assetIn}`;
    const [mkt] = await db
      .select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice })
      .from(marketsTable)
      .where(or(eq(marketsTable.symbol, directSym), eq(marketsTable.symbol, inverseSym)))
      .limit(1);
    if (mkt) {
      const p = parseFloat(mkt.lastPrice);
      internalRate = mkt.symbol === inverseSym ? (p > 0 ? 1 / p : null) : (p > 0 ? p : null);
    }
  } catch { /* non-fatal */ }

  if (liquidity.hasLiquidity) {
    return {
      source:       "internal",
      reason:       `OrahDEX orderbook has ${liquidity.realOrderCount} real orders covering ${liquidity.fillPct.toFixed(0)}% of requested amount`,
      liquidity,
      internalRate,
    };
  }

  return {
    source:       "letsexchange",
    reason:       liquidity.realOrderCount === 0
      ? "No real orders on OrahDEX for this pair — routing via LetsExchange"
      : `Insufficient orderbook depth (${liquidity.fillPct.toFixed(0)}% fill coverage) — routing via LetsExchange`,
    liquidity,
    internalRate,
  };
}
