/**
 * hybridRouter.ts — VWAP-based hybrid swap routing engine
 *
 * Routing criterion:
 *   Walk the real orderbook (excluding bot + synthetic orders) to simulate a
 *   fill of `amountIn`. Compute the volume-weighted average price (VWAP) of
 *   that fill. Compare VWAP to the oracle mid-price.  If the implied slippage
 *   is within MAX_SLIPPAGE_PCT (default 1.5%) AND the fill covers at least
 *   MIN_FILL_PCT (default 90%) of the requested amount, route internally.
 *   Otherwise route to LetsExchange.
 *
 * This is strictly superior to a raw depth-% heuristic:
 *   - A large order at a terrible price scores high on depth but would give
 *     worse execution than LE → now correctly routed to LE.
 *   - A small order at near-mid price may not fill 100% but still qualifies
 *     for internal routing if slippage is acceptable.
 *
 * Classification:
 *   Real orders = is_bot = false AND is_synthetic = false.
 *   Bot/synthetic flags are set explicitly at insert time (not inferred from
 *   address strings), making this robust to bot address changes.
 */

import { db } from "@workspace/db";
import { ordersTable, marketsTable } from "@workspace/db/schema";
import { and, eq, or, isNotNull, not } from "drizzle-orm";
import { logger } from "./logger.js";

/** Maximum slippage (as a fraction 0–1) to prefer internal routing */
const MAX_SLIPPAGE     = 0.015; // 1.5%
/** Minimum fraction of the requested amount that must be fillable internally */
const MIN_FILL_FRACTION = 0.90; // 90%
/** Platform fee charged on internal swaps */
export const INTERNAL_FEE_PCT = 0.003; // 0.3%
/** Approximate LetsExchange all-in fee */
export const LE_FEE_PCT       = 0.0035; // 0.35%

export interface FillSimulation {
  /** Fraction of amountIn covered by real orders (0–1) */
  fillFraction:    number;
  /** Number of real orders on this side of the book */
  realOrderCount:  number;
  /** Volume-weighted average price of the fill (0 if no orders) */
  vwap:            number;
  /** Oracle mid-price used for slippage computation */
  oraclePrice:     number | null;
  /** Implied slippage vs oracle (fraction, 0 = no slippage; null = oracle unavailable) */
  slippage:        number | null;
  /** Total quote received / spent for the filled portion */
  quoteTotal:      number;
}

export interface LiquidityCheck {
  hasLiquidity:   boolean;
  realOrderCount: number;
  fillPct:        number;         // 0–100
  fillableDepth:  number;
  vwap:           number;
  slippage:       number | null;
  oraclePrice:    number | null;
}

export interface RouteDecision {
  source:          "internal" | "letsexchange";
  reason:          string;
  liquidity:       LiquidityCheck;
  internalRate:    number | null;
  fees: {
    internal:      { pct: number; description: string };
    letsexchange:  { pct: number; description: string };
  };
  effectiveRate: {
    internal:     number | null;
    letsexchange: number | null;
  };
  slippageEstimate: number | null;
}

// ── Oracle price lookup ───────────────────────────────────────────────────────

async function getOraclePrice(assetIn: string, assetOut: string): Promise<number | null> {
  const directSym  = `${assetIn}/${assetOut}`;
  const inverseSym = `${assetOut}/${assetIn}`;
  try {
    const [mkt] = await db
      .select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice })
      .from(marketsTable)
      .where(or(eq(marketsTable.symbol, directSym), eq(marketsTable.symbol, inverseSym)))
      .limit(1);
    if (!mkt) return null;
    const p = parseFloat(mkt.lastPrice);
    if (!p || !isFinite(p)) return null;
    return mkt.symbol === inverseSym ? 1 / p : p;
  } catch { return null; }
}

// ── VWAP fill simulation ──────────────────────────────────────────────────────

/**
 * Walks the real orderbook for the A→B direction and computes how much of
 * `amountIn` of asset A can be filled, at what VWAP, and implied slippage.
 *
 * For "selling A for B" we need ask orders priced in B per A (sell side asks).
 * For "buying A with B" we need bid orders.
 *
 * In practice, OrahDEX stores orders as:
 *   symbol = BASE/QUOTE, side = "buy"|"sell"
 *
 * assetIn→assetOut swap:
 *   If the pair assetIn/assetOut exists: we are selling assetIn → need "sell" orders (or taker fills "buy" orders)
 *   Actually: a user who wants to sell assetIn for assetOut needs to fill against BUY orders.
 *   We walk the buy side of assetIn/assetOut sorted by price desc (best bid first).
 */
export async function simulateFill(
  assetIn:  string,
  assetOut: string,
  amountIn: number,
): Promise<FillSimulation> {
  const directSym  = `${assetIn}/${assetOut}`;  // e.g. BTC/USDT
  const inverseSym = `${assetOut}/${assetIn}`;  // e.g. USDT/BTC

  try {
    // Fetch all real open limit orders for either pair direction
    const rawOrders = await db
      .select({
        symbol:            ordersTable.symbol,
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
          eq(ordersTable.isBot, false),
          eq(ordersTable.isSynthetic, false),
          isNotNull(ordersTable.price),
        ),
      )
      .limit(500);

    if (!rawOrders.length) {
      return { fillFraction: 0, realOrderCount: 0, vwap: 0, oraclePrice: null, slippage: null, quoteTotal: 0 };
    }

    // Normalise to: price in assetOut per 1 assetIn, qty in assetIn
    const levels: { price: number; qty: number }[] = [];
    for (const o of rawOrders) {
      const p   = parseFloat(o.price!);
      const qty = parseFloat(o.remainingQuantity);
      if (!p || !qty || !isFinite(p) || !isFinite(qty)) continue;

      if (o.symbol === directSym) {
        // Direct pair: we sell assetIn, buyers post buy orders
        // Fill against "buy" orders (they want to buy our assetIn for assetOut)
        if (o.side === "buy") levels.push({ price: p, qty });
      } else {
        // Inverse pair assetOut/assetIn: convert
        // A "sell" order here sells assetOut for assetIn, which means they're
        // buying assetIn at price = 1/p (assetOut per assetIn)
        if (o.side === "sell") levels.push({ price: 1 / p, qty: qty * p });
      }
    }

    // Sort best-first (highest price = best deal when selling assetIn)
    levels.sort((a, b) => b.price - a.price);

    // Walk the book
    let remaining   = amountIn;
    let quoteTotal  = 0;
    let filledBase  = 0;
    for (const lvl of levels) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lvl.qty);
      filledBase  += take;
      quoteTotal  += take * lvl.price;
      remaining   -= take;
    }

    const fillFraction  = amountIn > 0 ? Math.min(1, filledBase / amountIn) : 0;
    const vwap          = filledBase > 0 ? quoteTotal / filledBase : 0;
    const oraclePrice   = await getOraclePrice(assetIn, assetOut);
    const slippage      = (oraclePrice && oraclePrice > 0 && vwap > 0)
      ? Math.abs(vwap - oraclePrice) / oraclePrice
      : null;

    return { fillFraction, realOrderCount: rawOrders.length, vwap, oraclePrice, slippage, quoteTotal };
  } catch (err) {
    logger.warn({ err }, "hybridRouter: fill simulation failed");
    return { fillFraction: 0, realOrderCount: 0, vwap: 0, oraclePrice: null, slippage: null, quoteTotal: 0 };
  }
}

// ── Public routing API ────────────────────────────────────────────────────────

export async function checkInternalLiquidity(
  assetIn:  string,
  assetOut: string,
  amountIn: number,
): Promise<LiquidityCheck> {
  const sim = await simulateFill(assetIn, assetOut, amountIn);

  const hasLiquidity =
    sim.fillFraction  >= MIN_FILL_FRACTION &&
    (sim.slippage === null || sim.slippage <= MAX_SLIPPAGE);

  return {
    hasLiquidity,
    realOrderCount: sim.realOrderCount,
    fillPct:        sim.fillFraction * 100,
    fillableDepth:  sim.fillFraction * amountIn,
    vwap:           sim.vwap,
    slippage:       sim.slippage,
    oraclePrice:    sim.oraclePrice,
  };
}

export async function getHybridRoute(
  assetIn:  string,
  assetOut: string,
  amountIn: number,
): Promise<RouteDecision> {
  const liquidity   = await checkInternalLiquidity(assetIn, assetOut, amountIn);
  const oraclePrice = liquidity.oraclePrice;

  // Effective rates after fees
  const internalEffective   = oraclePrice ? oraclePrice * (1 - INTERNAL_FEE_PCT) : null;
  const leEffective         = oraclePrice ? oraclePrice * (1 - LE_FEE_PCT)       : null;

  // Slippage-adjusted internal effective rate
  const internalVwapEff = liquidity.vwap > 0
    ? liquidity.vwap * (1 - INTERNAL_FEE_PCT)
    : internalEffective;

  const fees = {
    internal:     { pct: INTERNAL_FEE_PCT * 100, description: "OrahDEX platform fee (0.3%)" },
    letsexchange: { pct: LE_FEE_PCT       * 100, description: "LetsExchange all-in fee (~0.35%)" },
  };

  const effectiveRate = {
    internal:     internalVwapEff,
    letsexchange: leEffective,
  };

  let source: "internal" | "letsexchange";
  let reason:  string;

  if (liquidity.hasLiquidity) {
    source = "internal";
    const slipStr = liquidity.slippage !== null
      ? ` slippage ${(liquidity.slippage * 100).toFixed(2)}%`
      : "";
    reason = `OrahDEX orderbook: ${liquidity.realOrderCount} real orders, ` +
      `${liquidity.fillPct.toFixed(0)}% fill,${slipStr} VWAP ${liquidity.vwap.toFixed(6)}`;
  } else if (liquidity.realOrderCount === 0) {
    source = "letsexchange";
    reason = "No real (non-bot) orders on OrahDEX for this pair";
  } else if (liquidity.fillPct < MIN_FILL_FRACTION * 100) {
    source = "letsexchange";
    reason = `Insufficient depth: ${liquidity.fillPct.toFixed(0)}% fill ` +
      `(need ≥ ${(MIN_FILL_FRACTION * 100).toFixed(0)}%)`;
  } else {
    source = "letsexchange";
    const slipPct = liquidity.slippage !== null ? (liquidity.slippage * 100).toFixed(2) : "?";
    reason = `Slippage too high: ${slipPct}% vs oracle ` +
      `(max allowed ${(MAX_SLIPPAGE * 100).toFixed(1)}%)`;
  }

  // Structured log every routing decision
  logger.info({
    event:       "hybrid_route",
    assetIn,
    assetOut,
    amountIn,
    source,
    realOrders:  liquidity.realOrderCount,
    fillPct:     liquidity.fillPct,
    vwap:        liquidity.vwap,
    slippage:    liquidity.slippage,
    oraclePrice,
  }, `hybridRouter: ${source} — ${reason}`);

  return {
    source,
    reason,
    liquidity,
    internalRate: oraclePrice,
    fees,
    effectiveRate,
    slippageEstimate: liquidity.slippage,
  };
}
