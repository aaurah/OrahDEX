/**
 * Trade Engine — Single Golden Execution Path
 *
 * Every trade on OrahDEX flows through exactly this sequence:
 *   1. precheck  — instant off-chain validation (balance, slippage, route)
 *   2. build     — construct the exact on-chain call
 *   3. sign      — user signs in their wallet
 *   4. broadcast — send to chain / relayer
 *   5. confirm   — wait for finality, update UI
 *
 * Latency is tracked at every stage and stored for instrumentation.
 */

import { makeError, makeWarning, type TradeError, type TradeWarning } from "./tradeErrors";

const API_BASE = (import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "") + "/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrecheckParams {
  symbol:       string;
  side:         "buy" | "sell";
  type:         "limit" | "market" | "stop";
  amount:       number;
  price?:       number;
  slippageBps:  number;
  availableBalance: number;
  currentPrice: number;
  network:      "evm" | "bsv" | "btc" | "sol" | "tron";
  address:      string;
}

export interface PrecheckResult {
  ok:       boolean;
  errors:   TradeError[];
  warnings: TradeWarning[];
  priceImpactPct?: number;
  minReceived?:    number;
  route?:          string[];
  latencyMs:       number;
}

export interface PhaseTimings {
  precheck?:  number;
  build?:     number;
  sign?:      number;
  broadcast?: number;
  confirm?:   number;
  totalMs?:   number;
}

export interface TradeResult {
  success:    boolean;
  txid?:      string;
  explorerUrl?: string;
  matched?:   boolean;
  error?:     TradeError;
  timings:    PhaseTimings;
}

// ── Hot route cache for top pairs ─────────────────────────────────────────────
// Quotes for popular pairs are cached client-side for 5 s.
// We skip re-computation when price has moved less than 0.1%.

interface CachedRoute {
  tokenIn:   string;
  tokenOut:  string;
  amount:    number;
  result:    { priceImpactPct: number; minReceived: number; route: string[] };
  cachedAt:  number;
  lastPrice: number;
}

const HOT_PAIRS = new Set(["BSV/USDT","BSV/ETH","BTC/USDT","ETH/USDT",
                           "BNB/USDT","SOL/USDT","ETH/USDC","BTC/USDC"]);
const ROUTE_TTL_MS       = 5_000;
const PRICE_MOVE_THRESH  = 0.001; // 0.1 % — skip recompute below this

const routeCache = new Map<string, CachedRoute>();

function routeCacheKey(tokenIn: string, tokenOut: string, amount: number) {
  return `${tokenIn}:${tokenOut}:${Math.round(amount * 1000)}`;
}

function getCachedRoute(key: string, currentPrice: number): CachedRoute["result"] | null {
  const entry = routeCache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.cachedAt;
  if (age > ROUTE_TTL_MS) return null;
  const priceMove = Math.abs(currentPrice - entry.lastPrice) / (entry.lastPrice || 1);
  if (priceMove > PRICE_MOVE_THRESH) return null; // price moved too much — recompute
  return entry.result;
}

function setCachedRoute(key: string, result: CachedRoute["result"], price: number,
                        tokenIn: string, tokenOut: string, amount: number) {
  routeCache.set(key, { tokenIn, tokenOut, amount, result, cachedAt: Date.now(), lastPrice: price });
}

// ── Precheck ──────────────────────────────────────────────────────────────────
// Instant off-chain validation. No transaction is ever created here.
// Returns errors that block submission and warnings that allow it with notice.

export async function precheck(params: PrecheckParams): Promise<PrecheckResult> {
  const t0 = performance.now();
  const errors:   TradeError[]   = [];
  const warnings: TradeWarning[] = [];

  const { symbol, side, type, amount, price, slippageBps,
          availableBalance, currentPrice, network } = params;

  const [base, quote = "USDT"] = symbol.split("/");

  // ── 1. Amount sanity ───────────────────────────────────────────────────────
  if (!amount || amount <= 0) {
    errors.push(makeError("AMOUNT_TOO_SMALL", "Amount must be greater than zero"));
    return { ok: false, errors, warnings, latencyMs: performance.now() - t0 };
  }

  const MIN_USD = 0.5;
  const orderValueUsd = side === "buy"
    ? (price ?? currentPrice) * amount
    : currentPrice * amount;

  if (orderValueUsd < MIN_USD) {
    errors.push(makeError("AMOUNT_TOO_SMALL", `Min order value is $${MIN_USD}`));
  }

  // ── 2. Price required for limit/stop ──────────────────────────────────────
  if ((type === "limit" || type === "stop") && (!price || price <= 0)) {
    errors.push(makeError("PRICE_REQUIRED"));
  }

  // ── 3. Balance check ──────────────────────────────────────────────────────
  // sell → need base asset; buy → need quote asset (in USD terms vs balances)
  const requiredBalance = side === "sell"
    ? amount
    : (price ?? currentPrice) > 0 ? (price ?? currentPrice) * amount : amount;

  if (availableBalance < requiredBalance * 0.9999) {
    errors.push(makeError("INSUFFICIENT_BALANCE",
      `Need ${requiredBalance.toFixed(6)} ${side === "sell" ? base : quote}, have ${availableBalance.toFixed(6)}`));
  }

  // ── 4. Slippage + price impact (via route cache or API precheck) ───────────
  let priceImpactPct: number | undefined;
  let minReceived:    number | undefined;
  let route:          string[] | undefined;

  if (amount > 0 && currentPrice > 0 && errors.length === 0) {
    const tokenIn  = side === "buy"  ? quote : base;
    const tokenOut = side === "buy"  ? base  : quote;
    const key = routeCacheKey(tokenIn, tokenOut, amount);
    const isHot = HOT_PAIRS.has(symbol);

    const cached = isHot ? getCachedRoute(key, currentPrice) : null;

    if (cached) {
      priceImpactPct = cached.priceImpactPct;
      minReceived    = cached.minReceived;
      route          = cached.route;
    } else {
      // Hit the API precheck endpoint
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const resp = await fetch(`${API_BASE}/orders/precheck`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, side, type, amount, price, slippageBps, currentPrice }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (resp.ok) {
          const data = await resp.json();
          priceImpactPct = data.priceImpactPct;
          minReceived    = data.minReceived;
          route          = data.route ?? [tokenIn, "BSV", tokenOut];

          if (isHot) {
            setCachedRoute(key, { priceImpactPct: priceImpactPct ?? 0, minReceived: minReceived ?? 0, route: route ?? [] }, currentPrice, tokenIn, tokenOut, amount);
          }

          // Only propagate server errors that are NOT slippage-related for limit/stop orders.
          // Limit orders execute at an exact price — slippage doesn't apply.
          if (data.errors?.length) {
            for (const e of data.errors) {
              const isSlippageError = e.code === "SLIPPAGE_TOO_HIGH" || e.code === "PRICE_IMPACT_HIGH";
              if (isSlippageError && (type === "limit" || type === "stop")) continue;
              errors.push(makeError(e.code, e.detail));
            }
          }
        }
      } catch {
        // API unreachable — do local estimates only, don't block submission
      }
    }

    // Local price-impact estimate when API is unreachable.
    // Use the same pool TVL model as the server (500k for top-tier pairs).
    if (priceImpactPct === undefined) {
      const isTopTier = HOT_PAIRS.has(symbol);
      const poolTvlUsd = isTopTier ? 500_000 : 50_000;
      priceImpactPct = Math.min((orderValueUsd / poolTvlUsd) * 100, 50);
    }

    // Slippage + impact checks:
    // • Limit / stop orders have a guaranteed execution price — slippage doesn't apply.
    //   Only block on truly extreme impact (>5%) that would move the market severely.
    // • Market orders respect the user's slippage tolerance.
    const slippagePct = slippageBps / 100;
    if (priceImpactPct > 5) {
      // Severe impact blocks any order type
      errors.push(makeError("PRICE_IMPACT_HIGH",
        `${priceImpactPct.toFixed(1)}% price impact — split into smaller orders`));
    } else if (type === "market" && priceImpactPct > slippagePct) {
      // Only apply slippage tolerance check for market orders
      errors.push(makeError("SLIPPAGE_TOO_HIGH",
        `Price impact ${priceImpactPct.toFixed(2)}% > slippage tolerance ${slippagePct.toFixed(2)}%`));
    }

    // Moderate impact warning (only when not already a blocking error)
    if (priceImpactPct > 1 && (type === "market" ? priceImpactPct <= slippagePct : true)) {
      warnings.push(makeWarning("PRICE_IMPACT_MODERATE"));
    }
  }

  // ── 5. Large order warning ─────────────────────────────────────────────────
  if (orderValueUsd > 10_000) warnings.push(makeWarning("LARGE_ORDER"));

  return {
    ok:      errors.length === 0,
    errors,
    warnings,
    priceImpactPct,
    minReceived,
    route,
    latencyMs: performance.now() - t0,
  };
}

// ── Latency tracker ────────────────────────────────────────────────────────────
// Lightweight in-tab timer. Results are POSTed to /api/metrics/trades at the
// end of each trade so the server can build aggregate latency + failure stats.

export class TradeTimer {
  private timings: PhaseTimings = {};
  private marks: Record<string, number> = {};
  private t0 = performance.now();

  mark(phase: keyof PhaseTimings) {
    this.marks[phase] = performance.now();
  }

  end(phase: keyof PhaseTimings) {
    const start = this.marks[phase];
    if (start !== undefined) {
      (this.timings as any)[phase] = Math.round(performance.now() - start);
    }
  }

  finish(): PhaseTimings {
    this.timings.totalMs = Math.round(performance.now() - this.t0);
    return { ...this.timings };
  }
}

// ── Report trade metrics to the server ────────────────────────────────────────
export async function reportTradeMetrics(params: {
  symbol:     string;
  side:       "buy" | "sell";
  network:    string;
  walletType: string;
  success:    boolean;
  errorCode?: string;
  timings:    PhaseTimings;
}) {
  try {
    navigator.sendBeacon(
      `${API_BASE}/metrics/trades`,
      JSON.stringify(params),
    );
  } catch {
    // silent — metrics are best-effort
  }
}

// ── Route reliability badge ────────────────────────────────────────────────────
// Badges are derived from server-side metrics returned by /api/metrics/trades.

export type ReliabilityBadge = "fast" | "reliable" | "slow" | "unstable" | null;

export function getBadge(avgMs?: number, failRate?: number): ReliabilityBadge {
  if (avgMs === undefined || failRate === undefined) return null;
  if (failRate > 0.15) return "unstable";
  if (avgMs > 30_000)  return "slow";
  if (failRate < 0.02 && avgMs < 5_000)  return "fast";
  if (failRate < 0.05 && avgMs < 15_000) return "reliable";
  return null;
}
