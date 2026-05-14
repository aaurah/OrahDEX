/**
 * hybridRouter.ts — VWAP-based hybrid swap routing engine  (v3)
 *
 * ─── What changed in v3 ────────────────────────────────────────────────────
 *  • Per-pair config loaded from `routing_profiles` DB table (60 s TTL cache).
 *    In-code tier defaults (MAJOR/ALT/STABLE) used when no DB row exists.
 *  • Split routing: if the book fills a partial amount but not the threshold,
 *    and splitEnabled=true for the pair, the engine returns source="split"
 *    with explicit internal + external legs — not a single rejection.
 *  • oracle_status field in all routing logs.
 *
 * ─── Routing algorithm ─────────────────────────────────────────────────────
 * 1. Load pair config from DB (or tier default).
 * 2. Check enabled flag → if false, route external unconditionally.
 * 3. Check maxInternalSize → if amountIn exceeds cap, route external.
 * 4. Walk real orderbook (is_bot=false, is_synthetic=false) → VWAP fill sim.
 * 5. Check oracle: if stale/missing AND oracleRequired=true → route external.
 * 6. Route internal if fill ≥ minFillFraction AND slippage ≤ maxSlippage.
 * 7. Route split if fill > 0 AND splitEnabled=true AND caller opted in.
 * 8. Route external otherwise.
 *
 * ─── Partial fill contract ─────────────────────────────────────────────────
 * fillBehavior = "reject_partial" (default, no split):
 *   Sub-threshold fill → whole order sent to LetsExchange.
 *
 * fillBehavior = "split" (when split routing is invoked):
 *   Internal fills whatever depth exists; LetsExchange handles the remainder.
 *   Minimum split legs: internal ≥ MIN_SPLIT_INTERNAL_FRACTION of total.
 *   Client passes allowSplit=true to opt in; pair must have split_enabled=true.
 *
 * ─── Oracle failure policy ─────────────────────────────────────────────────
 * Controlled per-pair via oracle_required column:
 *   oracle_required=true  (default) → external if oracle unavailable.
 *   oracle_required=false (stable pairs) → internal routing allowed without oracle.
 */

import { db } from "@workspace/db";
import { ordersTable, marketsTable, routingProfilesTable } from "@workspace/db/schema";
import { and, eq, or, isNotNull, ilike } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── Engine version ────────────────────────────────────────────────────────────
export const ROUTE_VERSION = "v3";

// ─── Fee constants ────────────────────────────────────────────────────────────
export const INTERNAL_FEE_PCT = 0.003;   // 0.3%
/** ~0.35% all-in (flat estimate; actual is pair-specific 0.25–0.5% + withdrawal fee) */
export const LE_FEE_PCT       = 0.0035;

/** Minimum fraction of amountIn that must go to internal leg in a split */
const MIN_SPLIT_INTERNAL_FRACTION = 0.05;  // 5% minimum — below this we skip internal leg

// ─── In-memory DB config cache (60 s TTL) ────────────────────────────────────

interface CachedProfile {
  maxSlippageBps:   number;
  minFillFraction:  number;
  maxInternalSize:  number | null;
  oracleRequired:   boolean;
  enabled:          boolean;
  splitEnabled:     boolean;
}

interface CacheEntry {
  profile:   CachedProfile;
  expiresAt: number;
}

const CONFIG_TTL_MS = 60_000; // 60 s
const profileCache  = new Map<string, CacheEntry>();

// ─── Tier defaults ────────────────────────────────────────────────────────────
const MAJORS  = new Set(["BTC", "ETH", "BNB", "SOL", "MATIC", "AVAX", "OP", "ARB"]);
const STABLES = new Set(["USDT", "USDC", "BUSD", "TUSD", "DAI", "USDD"]);

function tierDefault(assetIn: string, assetOut: string): CachedProfile {
  const bothStables = STABLES.has(assetIn) && STABLES.has(assetOut);
  const isMajor     = (MAJORS.has(assetIn)  && STABLES.has(assetOut)) ||
                      (STABLES.has(assetIn) && MAJORS.has(assetOut))  ||
                      (MAJORS.has(assetIn)  && MAJORS.has(assetOut));

  if (bothStables) return { maxSlippageBps: 30,  minFillFraction: 0.95, maxInternalSize: null, oracleRequired: false, enabled: true, splitEnabled: false };
  if (isMajor)    return { maxSlippageBps: 100, minFillFraction: 0.90, maxInternalSize: null, oracleRequired: true,  enabled: true, splitEnabled: false };
  return               { maxSlippageBps: 250, minFillFraction: 0.70, maxInternalSize: null, oracleRequired: true,  enabled: true, splitEnabled: false };
}

async function loadPairConfig(assetIn: string, assetOut: string): Promise<CachedProfile> {
  const key = `${assetIn}/${assetOut}`;
  const now = Date.now();
  const cached = profileCache.get(key);
  if (cached && cached.expiresAt > now) return cached.profile;

  // Also check the inverse pair key (BSV/USDT and USDT/BSV share a profile)
  const invKey = `${assetOut}/${assetIn}`;

  try {
    const [row] = await db
      .select()
      .from(routingProfilesTable)
      .where(
        or(
          and(eq(routingProfilesTable.baseSymbol, assetIn),  eq(routingProfilesTable.quoteSymbol, assetOut)),
          and(eq(routingProfilesTable.baseSymbol, assetOut), eq(routingProfilesTable.quoteSymbol, assetIn)),
        ),
      )
      .limit(1);

    const profile: CachedProfile = row
      ? {
          maxSlippageBps:  row.maxSlippageBps,
          minFillFraction: parseFloat(row.minFillFraction),
          maxInternalSize: row.maxInternalSize ? parseFloat(row.maxInternalSize) : null,
          oracleRequired:  row.oracleRequired,
          enabled:         row.enabled,
          splitEnabled:    row.splitEnabled,
        }
      : tierDefault(assetIn, assetOut);

    const entry = { profile, expiresAt: now + CONFIG_TTL_MS };
    profileCache.set(key,    entry);
    profileCache.set(invKey, entry);
    return profile;
  } catch {
    // DB failure → use tier default (safe degradation)
    return tierDefault(assetIn, assetOut);
  }
}

// Expose for admin endpoints to invalidate cache after a profile update
export function invalidatePairConfigCache(assetIn?: string, assetOut?: string): void {
  if (assetIn && assetOut) {
    profileCache.delete(`${assetIn}/${assetOut}`);
    profileCache.delete(`${assetOut}/${assetIn}`);
  } else {
    profileCache.clear();
  }
}

// ─── Oracle price lookup ──────────────────────────────────────────────────────

type OracleStatus = "available" | "missing" | "stale";

interface OracleLookup {
  price:  number | null;
  status: OracleStatus;
}

async function getOraclePrice(assetIn: string, assetOut: string): Promise<OracleLookup> {
  const directSym  = `${assetIn}/${assetOut}`;
  const inverseSym = `${assetOut}/${assetIn}`;
  try {
    const [mkt] = await db
      .select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice, updatedAt: marketsTable.updatedAt })
      .from(marketsTable)
      .where(or(eq(marketsTable.symbol, directSym), eq(marketsTable.symbol, inverseSym)))
      .limit(1);

    if (!mkt) return { price: null, status: "missing" };

    const p = parseFloat(mkt.lastPrice);
    if (!p || !isFinite(p) || p <= 0) return { price: null, status: "missing" };

    // Consider stale if updatedAt is > 5 minutes old
    const ageMs = mkt.updatedAt ? Date.now() - new Date(mkt.updatedAt).getTime() : 0;
    if (ageMs > 5 * 60 * 1000) return { price: null, status: "stale" };

    const price = mkt.symbol === inverseSym ? 1 / p : p;
    return { price, status: "available" };
  } catch {
    return { price: null, status: "missing" };
  }
}

// ─── Order-book VWAP fill simulation ─────────────────────────────────────────

export interface FillSimulation {
  fillFraction:   number;
  realOrderCount: number;
  vwap:           number;
  oraclePrice:    number | null;
  oracleStatus:   OracleStatus;
  slippage:       number | null;
  quoteTotal:     number;
  levels:         { price: number; qty: number }[];  // sorted levels used
}

export async function simulateFill(
  assetIn:  string,
  assetOut: string,
  amountIn: number,
): Promise<FillSimulation> {
  const directSym  = `${assetIn}/${assetOut}`;
  const inverseSym = `${assetOut}/${assetIn}`;

  const oracle = await getOraclePrice(assetIn, assetOut);

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

    const empty: FillSimulation = {
      fillFraction: 0, realOrderCount: 0, vwap: 0,
      oraclePrice: oracle.price, oracleStatus: oracle.status,
      slippage: null, quoteTotal: 0, levels: [],
    };
    if (!rawOrders.length) return empty;

    const levels: { price: number; qty: number }[] = [];
    for (const o of rawOrders) {
      const p   = parseFloat(o.price!);
      const qty = parseFloat(o.remainingQuantity);
      if (!isFinite(p) || p <= 0 || !isFinite(qty) || qty <= 0) continue;

      if (o.symbol === directSym  && o.side === "buy")  levels.push({ price: p,     qty });
      if (o.symbol === inverseSym && o.side === "sell") levels.push({ price: 1 / p, qty: qty / p });
    }
    levels.sort((a, b) => b.price - a.price);

    let remaining = amountIn, quoteTotal = 0, filledBase = 0;
    for (const lvl of levels) {
      if (remaining <= 0) break;
      const take  = Math.min(remaining, lvl.qty);
      filledBase  += take;
      quoteTotal  += take * lvl.price;
      remaining   -= take;
    }

    const fillFraction = amountIn > 0 ? Math.min(1, filledBase / amountIn) : 0;
    const vwap         = filledBase > 0 ? quoteTotal / filledBase : 0;
    const slippage     = (oracle.price && oracle.price > 0 && vwap > 0)
      ? Math.abs(vwap - oracle.price) / oracle.price
      : null;

    return { fillFraction, realOrderCount: rawOrders.length, vwap, oraclePrice: oracle.price, oracleStatus: oracle.status, slippage, quoteTotal, levels };
  } catch (err) {
    logger.warn({ err, assetIn, assetOut }, "hybridRouter: fill simulation failed");
    return { fillFraction: 0, realOrderCount: 0, vwap: 0, oraclePrice: oracle.price, oracleStatus: oracle.status, slippage: null, quoteTotal: 0, levels: [] };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiquidityCheck {
  hasLiquidity:    boolean;
  realOrderCount:  number;
  fillPct:         number;
  fillableDepth:   number;
  vwap:            number;
  slippage:        number | null;
  oraclePrice:     number | null;
  oracleStatus:    OracleStatus;
  oracleAvailable: boolean;
}

export interface SplitLeg {
  amount:      number;        // assetIn units routed to this leg
  quotedOut:   number;        // expected assetOut units from this leg
  vwap:        number;        // only for internal leg
  fee:         number;        // fee in assetOut units
  feePct:      number;
  provider:    "internal" | "letsexchange";
}

export interface RouteDecision {
  source:                "internal" | "letsexchange" | "split";
  fillBehavior:          "reject_partial" | "split";
  reason:                string;
  liquidity:             LiquidityCheck;
  pairConfig: {
    maxSlippageBps:      number;
    minFillFraction:     number;
    maxInternalSize:     number | null;
    oracleRequired:      boolean;
    splitEnabled:        boolean;
  };
  oracleFallbackApplied: boolean;
  internalRate:          number | null;
  splitLegs:             { internal: SplitLeg | null; external: SplitLeg | null } | null;
  fees: {
    internal:     { pct: number; description: string };
    letsexchange: { pct: number; description: string; assumption: string };
  };
  effectiveRate: {
    internal:     number | null;
    letsexchange: number | null;
  };
  slippageEstimate:      number | null;
  routeVersion:          string;
  /**
   * When source is "letsexchange" or "split", this field names the winning
   * external venue as chosen by the meta-router.  Null for internal-only routes
   * or when the meta-router has not been invoked (backward-compatible default).
   */
  externalVenue:         import("./metaRouter.js").ExternalVenue | null;
}

// ─── Liquidity check ──────────────────────────────────────────────────────────

export async function checkInternalLiquidity(
  assetIn:  string,
  assetOut: string,
  amountIn: number,
): Promise<LiquidityCheck> {
  const [config, sim] = await Promise.all([
    loadPairConfig(assetIn, assetOut),
    simulateFill(assetIn, assetOut, amountIn),
  ]);

  const maxSlippage = config.maxSlippageBps / 10_000;

  const hasLiquidity =
    config.enabled &&
    sim.fillFraction >= config.minFillFraction &&
    (sim.oracleStatus === "available"
      ? (sim.slippage !== null && sim.slippage <= maxSlippage)
      : !config.oracleRequired);

  return {
    hasLiquidity,
    realOrderCount:  sim.realOrderCount,
    fillPct:         sim.fillFraction * 100,
    fillableDepth:   sim.fillFraction * amountIn,
    vwap:            sim.vwap,
    slippage:        sim.slippage,
    oraclePrice:     sim.oraclePrice,
    oracleStatus:    sim.oracleStatus,
    oracleAvailable: sim.oracleStatus === "available",
  };
}

// ─── Split route computation ──────────────────────────────────────────────────

function buildSplitLegs(
  amountIn:    number,
  sim:         FillSimulation,
  oraclePrice: number | null,
): { internal: SplitLeg; external: SplitLeg } {
  const internalAmt  = sim.fillFraction * amountIn;
  const externalAmt  = amountIn - internalAmt;

  const internalGross = sim.quoteTotal;                       // sim walked the book
  const internalFee   = internalGross * INTERNAL_FEE_PCT;
  const internalOut   = internalGross - internalFee;

  // External leg quote: use oracle if available, else mark as unknown
  const leRate        = oraclePrice ? oraclePrice * (1 - LE_FEE_PCT) : 0;
  const externalOut   = leRate * externalAmt;
  const externalFee   = externalAmt * (oraclePrice ?? 0) * LE_FEE_PCT;

  return {
    internal: {
      amount:   internalAmt,
      quotedOut: internalOut,
      vwap:     sim.vwap,
      fee:      internalFee,
      feePct:   INTERNAL_FEE_PCT * 100,
      provider: "internal",
    },
    external: {
      amount:   externalAmt,
      quotedOut: externalOut,
      vwap:     0,
      fee:      externalFee,
      feePct:   LE_FEE_PCT * 100,
      provider: "letsexchange",
    },
  };
}

// ─── Public routing decision ──────────────────────────────────────────────────

export async function getHybridRoute(
  assetIn:   string,
  assetOut:  string,
  amountIn:  number,
  allowSplit = false,
): Promise<RouteDecision> {
  const [config, sim] = await Promise.all([
    loadPairConfig(assetIn, assetOut),
    simulateFill(assetIn, assetOut, amountIn),
  ]);

  const oracle         = sim.oraclePrice;
  const oracleStatus   = sim.oracleStatus;
  const maxSlippage    = config.maxSlippageBps / 10_000;
  const oracleMissing  = oracleStatus !== "available";

  const oracleFallbackApplied = oracleMissing && config.oracleRequired;

  const internalEffective  = oracle ? oracle * (1 - INTERNAL_FEE_PCT) : null;
  const leEffective        = oracle ? oracle * (1 - LE_FEE_PCT)       : null;
  const internalVwapEff    = sim.vwap > 0 ? sim.vwap * (1 - INTERNAL_FEE_PCT) : internalEffective;

  const fees = {
    internal:     { pct: INTERNAL_FEE_PCT * 100, description: "OrahDEX platform fee (0.3%)" },
    letsexchange: {
      pct: LE_FEE_PCT * 100,
      description: "LetsExchange all-in fee (~0.35%)",
      assumption:  "Flat 0.35% estimate; actual LE fee is pair-specific (0.25–0.5%) plus on-chain withdrawal fee",
    },
  };
  const effectiveRate = { internal: internalVwapEff, letsexchange: leEffective };

  const pairConfig = {
    maxSlippageBps:  config.maxSlippageBps,
    minFillFraction: config.minFillFraction,
    maxInternalSize: config.maxInternalSize,
    oracleRequired:  config.oracleRequired,
    splitEnabled:    config.splitEnabled,
  };

  let source:       RouteDecision["source"];
  let fillBehavior: RouteDecision["fillBehavior"];
  let reason:       string;
  let splitLegs:    RouteDecision["splitLegs"] = null;

  // ── Decision tree ─────────────────────────────────────────────────────────

  if (!config.enabled) {
    // Pair disabled in routing_profiles → always route external
    source       = "letsexchange";
    fillBehavior = "reject_partial";
    reason       = "Internal routing disabled for this pair (routing_profiles.enabled=false)";

  } else if (config.maxInternalSize !== null && amountIn > config.maxInternalSize) {
    // Amount exceeds size cap → route external
    source       = "letsexchange";
    fillBehavior = "reject_partial";
    reason       = `Amount ${amountIn} exceeds max internal size ${config.maxInternalSize} for this pair`;

  } else if (oracleFallbackApplied) {
    // Oracle required but unavailable → route external (conservative)
    source       = "letsexchange";
    fillBehavior = "reject_partial";
    reason       = `Oracle ${oracleStatus} — routing external (oracle_required=true for this pair)`;

  } else {
    // Normal routing path
    const fillOk     = sim.fillFraction >= config.minFillFraction;
    const slippageOk = sim.slippage === null || sim.slippage <= maxSlippage;
    const hasDepth   = sim.fillFraction > 0;

    if (fillOk && slippageOk) {
      // ── Full internal fill ───────────────────────────────────────────────
      source       = "internal";
      fillBehavior = "reject_partial";
      const slipStr = sim.slippage !== null ? ` slippage ${(sim.slippage*100).toFixed(2)}%` : "";
      reason = `OrahDEX orderbook: ${sim.realOrderCount} real orders, ` +
        `${(sim.fillFraction*100).toFixed(0)}% fill,${slipStr} VWAP ${sim.vwap.toFixed(6)}`;

    } else if (hasDepth && allowSplit && config.splitEnabled &&
               sim.fillFraction >= MIN_SPLIT_INTERNAL_FRACTION) {
      // ── Split routing ────────────────────────────────────────────────────
      const legs   = buildSplitLegs(amountIn, sim, oracle);
      source       = "split";
      fillBehavior = "split";
      splitLegs    = { internal: legs.internal, external: legs.external };
      reason       = `Split: ${(sim.fillFraction*100).toFixed(0)}% internal (${legs.internal.amount.toFixed(6)} ${assetIn}), ` +
        `${((1-sim.fillFraction)*100).toFixed(0)}% via LetsExchange`;

    } else if (sim.realOrderCount === 0) {
      source       = "letsexchange";
      fillBehavior = "reject_partial";
      reason       = "No real (non-bot, non-synthetic) orders on OrahDEX for this pair";

    } else if (!fillOk) {
      source       = "letsexchange";
      fillBehavior = "reject_partial";
      reason       = `Insufficient depth: ${(sim.fillFraction*100).toFixed(0)}% fill ` +
        `(pair requires ≥ ${(config.minFillFraction*100).toFixed(0)}%)`;

    } else {
      source       = "letsexchange";
      fillBehavior = "reject_partial";
      const slipPct = sim.slippage !== null ? (sim.slippage*100).toFixed(2) : "?";
      reason = `Slippage too high: ${slipPct}% vs oracle ` +
        `(pair allows ≤ ${(maxSlippage*100).toFixed(1)}%)`;
    }
  }

  // ── Structured routing log — no PII ──────────────────────────────────────
  logger.info({
    event:                "hybrid_route",
    routeVersion:         ROUTE_VERSION,
    assetIn, assetOut, amountIn, source, allowSplit,
    realOrders:           sim.realOrderCount,
    fillPct:              parseFloat((sim.fillFraction * 100).toFixed(2)),
    vwap:                 sim.vwap,
    slippage:             sim.slippage,
    oraclePrice:          oracle,
    oracleStatus,
    oracleFallbackApplied,
    pairMaxSlippageBps:   config.maxSlippageBps,
    pairMinFill:          config.minFillFraction,
    pairSplitEnabled:     config.splitEnabled,
    splitLegsInternal:    splitLegs?.internal?.amount ?? null,
    splitLegsExternal:    splitLegs?.external?.amount ?? null,
  }, `hybridRouter ${ROUTE_VERSION}: ${source} — ${reason}`);

  return {
    source, fillBehavior, reason,
    liquidity: {
      hasLiquidity:    source === "internal",
      realOrderCount:  sim.realOrderCount,
      fillPct:         sim.fillFraction * 100,
      fillableDepth:   sim.fillFraction * amountIn,
      vwap:            sim.vwap,
      slippage:        sim.slippage,
      oraclePrice:     oracle,
      oracleStatus,
      oracleAvailable: oracleStatus === "available",
    },
    pairConfig,
    oracleFallbackApplied,
    internalRate:      oracle,
    splitLegs,
    fees, effectiveRate,
    slippageEstimate:  sim.slippage,
    routeVersion:      ROUTE_VERSION,
    externalVenue:     null,
  };
}
