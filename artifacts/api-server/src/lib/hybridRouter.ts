/**
 * hybridRouter.ts — VWAP-based hybrid swap routing engine  (v2)
 *
 * ─── Routing algorithm ─────────────────────────────────────────────────────
 * 1. Walk real orderbook (is_bot=false, is_synthetic=false, status=open,
 *    price IS NOT NULL) to simulate a fill of `amountIn`.
 * 2. Compute VWAP of the fill.
 * 3. Compare VWAP to oracle mid-price → implied slippage.
 * 4. Route internal iff:
 *      fillFraction ≥ pairConfig.minFillFraction   (default 90%)
 *      AND slippage ≤ pairConfig.maxSlippage        (default 1.5%)
 *    UNLESS oracle is unavailable → apply pairConfig.oracleFallback policy.
 * Otherwise route to LetsExchange.
 *
 * ─── Partial fill contract ─────────────────────────────────────────────────
 * OrahDEX does NOT do partial/split routing in this version.
 * fillBehavior = "reject_partial":
 *   If the book cannot fill ≥ minFillFraction of amountIn, the ENTIRE order
 *   is routed to LetsExchange.  No portion is settled internally.
 *   The remaining un-fillable portion is NOT dropped; LE handles the full amount.
 * Future: split-routing (internal + LE) tracked in TODO below.
 *
 * ─── Oracle failure policy ─────────────────────────────────────────────────
 * When oracle price is unavailable (missing market or stale data):
 *   pairConfig.oracleFallback = "letsexchange" (default, conservative)
 *     → route external; we cannot verify slippage, so we don't risk it.
 *   pairConfig.oracleFallback = "internal_below_size" (opt-in per pair)
 *     → allow internal routing for amountIn ≤ pair.maxSizeWithoutOracle.
 *   pairConfig.oracleFallback = "internal" (only for highly trusted pairs)
 *     → always route internal regardless of oracle availability.
 *
 * ─── Per-pair config ───────────────────────────────────────────────────────
 * Global defaults apply unless a pair is listed in PAIR_CONFIGS.
 * Future: migrate PAIR_CONFIGS to a DB table (routing_configs) for live edits.
 *
 * TODO: split routing (internal fill + LE for remainder) — requires
 *       frontend UX for split result and two execution legs.
 */

import { db } from "@workspace/db";
import { ordersTable, marketsTable } from "@workspace/db/schema";
import { and, eq, or, isNotNull } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── Routing engine version ──────────────────────────────────────────────────
// Bump when routing logic changes so historical logs remain analysable by version.
export const ROUTE_VERSION = "v2";

// ─── Fee constants ────────────────────────────────────────────────────────────
/** Platform fee charged on internal swaps */
export const INTERNAL_FEE_PCT = 0.003;   // 0.3%
/**
 * LetsExchange all-in fee estimate.
 * LE charges ~0.25–0.5% depending on pair, plus an on-chain withdrawal fee.
 * We use 0.35% as a conservative midpoint for comparison purposes.
 * ASSUMPTION: LE spread/fees modelled as flat %; actual spread is pair-specific.
 * Source: https://letsexchange.io/fees (reviewed 2025).
 */
export const LE_FEE_PCT = 0.0035;        // 0.35%

// ─── Per-pair routing config ──────────────────────────────────────────────────

type OracleFallback =
  | "letsexchange"          // route external if oracle unavailable (safe default)
  | "internal"              // trust the book unconditionally (high-confidence pairs)
  | "internal_below_size";  // allow internal only for small orders

interface PairRoutingConfig {
  /** Minimum fraction (0–1) of amountIn that must be fillable internally */
  minFillFraction:       number;
  /** Maximum implied slippage vs oracle (0–1) to prefer internal routing */
  maxSlippage:           number;
  /** What to do when oracle price is unavailable */
  oracleFallback:        OracleFallback;
  /** Only used with "internal_below_size": max amountIn to allow without oracle */
  maxSizeWithoutOracle?: number;
}

/** Global defaults — applied when no pair-specific config exists */
const DEFAULT_CONFIG: PairRoutingConfig = {
  minFillFraction:  0.90,   // 90% fill required
  maxSlippage:      0.015,  // 1.5% slippage tolerance
  oracleFallback:   "letsexchange",
};

/**
 * Tier 1 — major liquid pairs.
 * Tighter slippage tolerance; we expect deep books and tight spreads.
 */
const MAJOR_CONFIG: PairRoutingConfig = {
  minFillFraction:  0.90,
  maxSlippage:      0.010,  // 1.0% — tighter for majors
  oracleFallback:   "letsexchange",
};

/**
 * Tier 2 — mid-cap alt pairs.
 * Looser thresholds to allow internal routing when book is shallower.
 */
const ALT_CONFIG: PairRoutingConfig = {
  minFillFraction:  0.70,   // 70% fill acceptable
  maxSlippage:      0.025,  // 2.5% tolerance
  oracleFallback:   "letsexchange",
};

/**
 * Tier 3 — stablecoin-only pairs (USDT/USDC/BUSD).
 * Tiny slippage tolerance; no oracle fallback needed (pegged pairs).
 */
const STABLE_CONFIG: PairRoutingConfig = {
  minFillFraction:  0.95,
  maxSlippage:      0.003,  // 0.3%
  oracleFallback:   "internal",  // stablecoins are always 1:1; no oracle needed
};

// Coin tier classification
const MAJORS  = new Set(["BTC", "ETH", "BNB", "SOL", "MATIC", "AVAX", "OP", "ARB"]);
const STABLES = new Set(["USDT", "USDC", "BUSD", "TUSD", "DAI", "USDD"]);

/**
 * Explicit per-symbol overrides take priority over tier classification.
 * Key format: "BASE/QUOTE" (canonical order, e.g. "BTC/USDT").
 * Future: load these from a DB table `routing_configs`.
 */
const PAIR_CONFIGS: Record<string, PairRoutingConfig> = {
  // BSV is native to OrahDEX — favour internal even below 70% fill
  "BSV/USDT": { minFillFraction: 0.60, maxSlippage: 0.020, oracleFallback: "letsexchange" },
  "BSV/BTC":  { minFillFraction: 0.60, maxSlippage: 0.025, oracleFallback: "letsexchange" },
};

function getPairConfig(assetIn: string, assetOut: string): PairRoutingConfig {
  const directKey  = `${assetIn}/${assetOut}`;
  const inverseKey = `${assetOut}/${assetIn}`;
  if (PAIR_CONFIGS[directKey])  return PAIR_CONFIGS[directKey];
  if (PAIR_CONFIGS[inverseKey]) return PAIR_CONFIGS[inverseKey];

  const bothMajors  = MAJORS.has(assetIn)  && MAJORS.has(assetOut);
  const bothStables = STABLES.has(assetIn) && STABLES.has(assetOut);
  const oneMajorOneStable =
    (MAJORS.has(assetIn)  && STABLES.has(assetOut)) ||
    (STABLES.has(assetIn) && MAJORS.has(assetOut));

  if (bothStables)          return STABLE_CONFIG;
  if (bothMajors || oneMajorOneStable) return MAJOR_CONFIG;
  return ALT_CONFIG;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FillSimulation {
  fillFraction:   number;   // 0–1, fraction of amountIn covered by real orders
  realOrderCount: number;
  vwap:           number;   // volume-weighted avg price (assetOut per assetIn)
  oraclePrice:    number | null;
  slippage:       number | null;  // fraction vs oracle (null = oracle unavailable)
  quoteTotal:     number;
}

export interface LiquidityCheck {
  hasLiquidity:   boolean;
  realOrderCount: number;
  fillPct:        number;         // 0–100
  fillableDepth:  number;
  vwap:           number;
  slippage:       number | null;
  oraclePrice:    number | null;
  oracleAvailable: boolean;
}

export interface RouteDecision {
  source:           "internal" | "letsexchange";
  reason:           string;
  /**
   * Explicit partial-fill contract:
   *   "reject_partial" — if book fills < minFillFraction, whole order goes to LE.
   *   There is no split routing in this version; LE handles 100% when triggered.
   */
  fillBehavior:     "reject_partial";
  liquidity:        LiquidityCheck;
  pairConfig:       PairRoutingConfig;
  oracleFallbackApplied: boolean;  // true when oracle was missing and fallback used
  internalRate:     number | null;
  fees: {
    internal:     { pct: number; description: string };
    letsexchange: { pct: number; description: string; assumption: string };
  };
  effectiveRate: {
    internal:     number | null;  // oracle * (1 - INTERNAL_FEE_PCT)
    letsexchange: number | null;  // oracle * (1 - LE_FEE_PCT)
  };
  slippageEstimate:  number | null;
  routeVersion:      string;       // ROUTE_VERSION — for log analytics
}

// ─── Oracle price lookup ──────────────────────────────────────────────────────

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
    if (!p || !isFinite(p) || p <= 0) return null;
    return mkt.symbol === inverseSym ? 1 / p : p;
  } catch { return null; }
}

// ─── Order-book VWAP fill simulation ─────────────────────────────────────────

/**
 * Walks the real (non-bot, non-synthetic) orderbook to simulate filling `amountIn`
 * of `assetIn` and returning `assetOut`.
 *
 * Order classification:
 *   is_bot = false AND is_synthetic = false → "real" orders counted in routing.
 *
 * Price normalisation:
 *   Direct pair  assetIn/assetOut, side="buy" → buyers of assetIn provide assetOut.
 *   Inverse pair assetOut/assetIn, side="sell" → sellers of assetOut provide assetIn.
 *   Both are normalised to: price = assetOut per 1 assetIn, qty = assetIn qty.
 */
export async function simulateFill(
  assetIn:  string,
  assetOut: string,
  amountIn: number,
): Promise<FillSimulation> {
  const directSym  = `${assetIn}/${assetOut}`;
  const inverseSym = `${assetOut}/${assetIn}`;

  try {
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
          or(eq(ordersTable.symbol, directSym), eq(ordersTable.symbol, inverseSym)),
          eq(ordersTable.status,      "open"),
          eq(ordersTable.isBot,       false),
          eq(ordersTable.isSynthetic, false),
          isNotNull(ordersTable.price),
        ),
      )
      .limit(500);

    if (!rawOrders.length) {
      return { fillFraction: 0, realOrderCount: 0, vwap: 0, oraclePrice: null, slippage: null, quoteTotal: 0 };
    }

    // Normalise orders to { price: assetOut/assetIn, qty: assetIn }
    const levels: { price: number; qty: number }[] = [];
    for (const o of rawOrders) {
      const p   = parseFloat(o.price!);
      const qty = parseFloat(o.remainingQuantity);
      if (!isFinite(p) || p <= 0 || !isFinite(qty) || qty <= 0) continue;

      if (o.symbol === directSym && o.side === "buy") {
        levels.push({ price: p, qty });
      } else if (o.symbol === inverseSym && o.side === "sell") {
        // e.g. USDT/BTC sell order: price = USDT/BTC, qty = BTC qty
        // Normalised: price_BTC_per_USDT = 1/p, qty = BTC qty
        levels.push({ price: 1 / p, qty: qty / p });
      }
    }

    // Sort best-first (highest price = best deal for seller of assetIn)
    levels.sort((a, b) => b.price - a.price);

    let remaining  = amountIn;
    let quoteTotal = 0;
    let filledBase = 0;
    for (const lvl of levels) {
      if (remaining <= 0) break;
      const take  = Math.min(remaining, lvl.qty);
      filledBase  += take;
      quoteTotal  += take * lvl.price;
      remaining   -= take;
    }

    const fillFraction = amountIn > 0 ? Math.min(1, filledBase / amountIn) : 0;
    const vwap         = filledBase > 0 ? quoteTotal / filledBase : 0;
    const oraclePrice  = await getOraclePrice(assetIn, assetOut);
    const slippage     = (oraclePrice && oraclePrice > 0 && vwap > 0)
      ? Math.abs(vwap - oraclePrice) / oraclePrice
      : null;

    return { fillFraction, realOrderCount: rawOrders.length, vwap, oraclePrice, slippage, quoteTotal };
  } catch (err) {
    logger.warn({ err, assetIn, assetOut }, "hybridRouter: fill simulation failed");
    return { fillFraction: 0, realOrderCount: 0, vwap: 0, oraclePrice: null, slippage: null, quoteTotal: 0 };
  }
}

// ─── Liquidity check ──────────────────────────────────────────────────────────

export async function checkInternalLiquidity(
  assetIn:  string,
  assetOut: string,
  amountIn: number,
): Promise<LiquidityCheck> {
  const config = getPairConfig(assetIn, assetOut);
  const sim    = await simulateFill(assetIn, assetOut, amountIn);

  const oracleAvailable = sim.oraclePrice !== null;
  const hasLiquidity    =
    sim.fillFraction >= config.minFillFraction &&
    (oracleAvailable
      ? (sim.slippage !== null && sim.slippage <= config.maxSlippage)
      : config.oracleFallback !== "letsexchange"); // fallback policy

  return {
    hasLiquidity,
    realOrderCount:  sim.realOrderCount,
    fillPct:         sim.fillFraction * 100,
    fillableDepth:   sim.fillFraction * amountIn,
    vwap:            sim.vwap,
    slippage:        sim.slippage,
    oraclePrice:     sim.oraclePrice,
    oracleAvailable,
  };
}

// ─── Public routing decision ──────────────────────────────────────────────────

export async function getHybridRoute(
  assetIn:  string,
  assetOut: string,
  amountIn: number,
): Promise<RouteDecision> {
  const config    = getPairConfig(assetIn, assetOut);
  const liquidity = await checkInternalLiquidity(assetIn, assetOut, amountIn);

  const oracle          = liquidity.oraclePrice;
  const oracleFallbackApplied = !liquidity.oracleAvailable;

  // Effective rates after fees (vs oracle; null when oracle unavailable)
  const internalEffective  = oracle ? oracle * (1 - INTERNAL_FEE_PCT) : null;
  const leEffective        = oracle ? oracle * (1 - LE_FEE_PCT)       : null;
  // VWAP-adjusted internal rate when available
  const internalVwapEff = liquidity.vwap > 0
    ? liquidity.vwap * (1 - INTERNAL_FEE_PCT)
    : internalEffective;

  const fees = {
    internal:     { pct: INTERNAL_FEE_PCT * 100, description: "OrahDEX platform fee (0.3%)" },
    letsexchange: {
      pct: LE_FEE_PCT * 100,
      description: "LetsExchange all-in fee (~0.35%)",
      assumption:  "Flat 0.35% estimate; actual LE fee is pair-specific (0.25–0.5%) plus on-chain withdrawal fee",
    },
  };

  const effectiveRate = { internal: internalVwapEff, letsexchange: leEffective };

  let source: "internal" | "letsexchange";
  let reason:  string;

  if (oracleFallbackApplied) {
    // Oracle is missing — apply explicit fallback policy
    const policy = config.oracleFallback;
    if (policy === "internal") {
      source = "internal";
      reason = `Oracle unavailable; pair config allows unconditional internal routing (fillPct=${liquidity.fillPct.toFixed(0)}%)`;
    } else if (policy === "internal_below_size") {
      const maxSize = config.maxSizeWithoutOracle ?? 0;
      if (amountIn <= maxSize && liquidity.fillPct >= config.minFillFraction * 100) {
        source = "internal";
        reason = `Oracle unavailable; amount ${amountIn} ≤ maxSizeWithoutOracle ${maxSize} — internal routing allowed`;
      } else {
        source = "letsexchange";
        reason = `Oracle unavailable and amount ${amountIn} exceeds safe size for oracle-free routing`;
      }
    } else {
      // Default: "letsexchange" (conservative)
      source = "letsexchange";
      reason = "Oracle price unavailable — routing to LetsExchange (conservative fallback)";
    }
  } else if (liquidity.hasLiquidity) {
    source = "internal";
    const slipStr = liquidity.slippage !== null
      ? ` slippage ${(liquidity.slippage * 100).toFixed(2)}%`
      : "";
    reason = `OrahDEX orderbook: ${liquidity.realOrderCount} real orders, ` +
      `${liquidity.fillPct.toFixed(0)}% fill,${slipStr} VWAP ${liquidity.vwap.toFixed(6)}`;
  } else if (liquidity.realOrderCount === 0) {
    source = "letsexchange";
    reason = "No real (non-bot, non-synthetic) orders on OrahDEX for this pair";
  } else if (liquidity.fillPct < config.minFillFraction * 100) {
    source = "letsexchange";
    reason = `Insufficient depth: ${liquidity.fillPct.toFixed(0)}% fill ` +
      `(pair requires ≥ ${(config.minFillFraction * 100).toFixed(0)}%)`;
  } else {
    source = "letsexchange";
    const slipPct = liquidity.slippage !== null ? (liquidity.slippage * 100).toFixed(2) : "?";
    reason = `Slippage too high: ${slipPct}% vs oracle ` +
      `(pair allows ≤ ${(config.maxSlippage * 100).toFixed(1)}%)`;
  }

  // Structured routing decision log — no PII (wallet addresses excluded)
  logger.info({
    event:                "hybrid_route",
    routeVersion:         ROUTE_VERSION,
    assetIn,
    assetOut,
    amountIn,
    source,
    realOrders:           liquidity.realOrderCount,
    fillPct:              parseFloat(liquidity.fillPct.toFixed(2)),
    vwap:                 liquidity.vwap,
    slippage:             liquidity.slippage,
    oraclePrice:          oracle,
    oracleAvailable:      liquidity.oracleAvailable,
    oracleFallback:       config.oracleFallback,
    oracleFallbackApplied,
    pairMinFill:          config.minFillFraction,
    pairMaxSlippage:      config.maxSlippage,
  }, `hybridRouter ${ROUTE_VERSION}: ${source} — ${reason}`);

  return {
    source,
    reason,
    fillBehavior:          "reject_partial",
    liquidity,
    pairConfig:            config,
    oracleFallbackApplied,
    internalRate:          oracle,
    fees,
    effectiveRate,
    slippageEstimate:      liquidity.slippage,
    routeVersion:          ROUTE_VERSION,
  };
}
