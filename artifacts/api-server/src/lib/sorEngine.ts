/**
 * sorEngine.ts — OrahDEX Smart Order Router
 *
 * Builds a token graph from live market data and finds optimal swap routes
 * (up to 3 hops) using constant-product AMM math (x·y=k).
 *
 * Design:
 *  - Tokens are graph nodes; pools are weighted directed edges.
 *  - BFS enumerates all paths up to MAX_HOPS.
 *  - Each path is scored by net output after fees and price impact.
 *  - Top N routes returned, sorted descending by amountOut.
 */

import { logger } from "./logger.js";
import { FALLBACK_PRICES } from "./priceUpdater.js";

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_HOPS     = 3;
const MAX_ROUTES   = 5;
const MIN_LIQUIDITY_USD = 10_000; // ignore pools with <$10k synthetic TVL

// Intermediate routing tokens — used as bridging assets in multi-hop paths
const HUB_TOKENS = ["USDT", "USDC", "ETH", "BTC", "BSV", "BNB", "ORAH"];

// Typical AMM fee tiers
const FEE_TIERS = {
  stable:   0.0005,   // 0.05 % — stablecoin pairs
  standard: 0.003,    // 0.30 % — default
  exotic:   0.01,     // 1.00 % — long-tail / volatile
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface PoolEdge {
  poolId:     string;
  tokenIn:    string;
  tokenOut:   string;
  fee:        number;
  reserveIn:  number;   // denominated in USD
  reserveOut: number;   // denominated in USD
  tvlUsd:     number;
  chain:      string;
  protocol:   "orahdex_amm" | "virtual";
}

export interface RouteHop {
  poolId:    string;
  protocol:  string;
  tokenIn:   string;
  tokenOut:  string;
  amountIn:  number;
  amountOut: number;
  fee:       number;
  priceImpact: number;
}

export interface SorRoute {
  hops:        RouteHop[];
  amountIn:    number;
  amountOut:   number;
  totalFeeUsd: number;
  priceImpact: number;
  effectivePrice: number;    // amountOut / amountIn
  path:        string[];     // ["ETH", "USDC", "ORAH"]
}

export interface SorQuoteResult {
  tokenIn:     string;
  tokenOut:    string;
  amountIn:    number;
  routes:      SorRoute[];
  bestRoute:   SorRoute | null;
  spotPrice:   number | null;   // price without impact
  priceImpact: number | null;
  executionPrice: number | null;
}

// ── Pool graph construction ──────────────────────────────────────────────────

/**
 * Build the pool graph from live price data.
 * Uses synthetic reserves derived from fallback + live prices.
 * Each known market pair becomes two directed edges (A→B and B→A).
 */
export function buildPoolGraph(
  markets: Array<{
    symbol:    string;
    baseAsset: string;
    quoteAsset: string;
    lastPrice: string | null;
    volume24h: string | null;
    type:      string;
    status:    string;
  }>,
): Map<string, PoolEdge[]> {
  const graph = new Map<string, PoolEdge[]>();

  const addEdge = (edge: PoolEdge) => {
    const list = graph.get(edge.tokenIn) ?? [];
    list.push(edge);
    graph.set(edge.tokenIn, list);
  };

  const usdPrice = (sym: string): number =>
    FALLBACK_PRICES[sym] ?? (sym === "USDT" || sym === "USDC" ? 1 : 0);

  for (const m of markets) {
    if (m.status !== "active") continue;
    if (m.type === "futures" || m.type === "letsexchange") continue;

    const price = parseFloat(m.lastPrice ?? "0") || 0;
    if (price <= 0) continue;

    const baseUsd  = usdPrice(m.baseAsset);
    const quoteUsd = usdPrice(m.quoteAsset);
    const vol24h   = parseFloat(m.volume24h ?? "0") || 0;

    // Synthetic TVL: assume pool holds ~24h volume equivalent on each side
    const tvlUsd = vol24h > 0
      ? vol24h * 2
      : (baseUsd > 0 ? baseUsd * 1000 : 10_000);

    if (tvlUsd < MIN_LIQUIDITY_USD) continue;

    // Reserve in base-asset units: half TVL on each side
    const reserveBaseUsd  = tvlUsd / 2;
    const reserveQuoteUsd = tvlUsd / 2;

    const isStable = isStablePair(m.baseAsset, m.quoteAsset);
    const fee = isStable ? FEE_TIERS.stable
      : (baseUsd < 0.01 || quoteUsd < 0.01 ? FEE_TIERS.exotic : FEE_TIERS.standard);

    const poolId = `orahdex:${m.symbol}`;

    // Forward edge: base → quote
    addEdge({
      poolId,
      tokenIn:    m.baseAsset,
      tokenOut:   m.quoteAsset,
      fee,
      reserveIn:  reserveBaseUsd,
      reserveOut: reserveQuoteUsd,
      tvlUsd,
      chain:      "sepolia",
      protocol:   "orahdex_amm",
    });

    // Reverse edge: quote → base
    addEdge({
      poolId: `${poolId}:r`,
      tokenIn:    m.quoteAsset,
      tokenOut:   m.baseAsset,
      fee,
      reserveIn:  reserveQuoteUsd,
      reserveOut: reserveBaseUsd,
      tvlUsd,
      chain:      "sepolia",
      protocol:   "orahdex_amm",
    });
  }

  // Add virtual direct-price edges for hub tokens that have no direct pair
  // (e.g., ORAH→ETH if only ORAH/USDT and ETH/USDT exist)
  ensureHubEdges(graph, usdPrice);

  return graph;
}

function isStablePair(a: string, b: string): boolean {
  const STABLES = new Set(["USDT", "USDC", "DAI", "BUSD", "TUSD", "USDD", "FRAX"]);
  return STABLES.has(a) && STABLES.has(b);
}

/**
 * For every pair of hub tokens that are not directly connected,
 * add a virtual "USD bridge" edge with a 0.05% fee.
 */
function ensureHubEdges(graph: Map<string, PoolEdge[]>, usdPrice: (s: string) => number) {
  for (const a of HUB_TOKENS) {
    const priceA = usdPrice(a);
    if (priceA <= 0) continue;

    for (const b of HUB_TOKENS) {
      if (a === b) continue;
      const priceB = usdPrice(b);
      if (priceB <= 0) continue;

      const edges = graph.get(a) ?? [];
      const alreadyLinked = edges.some(e => e.tokenOut === b);
      if (alreadyLinked) continue;

      const tvlUsd = 5_000_000; // virtual pool with $5M TVL
      const fee    = isStablePair(a, b) ? FEE_TIERS.stable : FEE_TIERS.standard;

      const edge: PoolEdge = {
        poolId:     `virtual:${a}-${b}`,
        tokenIn:    a,
        tokenOut:   b,
        fee,
        reserveIn:  tvlUsd / 2,
        reserveOut: tvlUsd / 2,
        tvlUsd,
        chain:      "multi",
        protocol:   "virtual",
      };
      edges.push(edge);
      graph.set(a, edges);
    }
  }
}

// ── AMM math ─────────────────────────────────────────────────────────────────

/**
 * Constant-product (x·y=k) output calculation.
 * Inputs and reserves are in USD-equivalent units.
 */
function cpmmOut(amountIn: number, reserveIn: number, reserveOut: number, fee: number): number {
  if (reserveIn <= 0 || reserveOut <= 0 || amountIn <= 0) return 0;
  const amountInWithFee = amountIn * (1 - fee);
  return (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
}

function priceImpactPct(amountIn: number, reserveIn: number): number {
  if (reserveIn <= 0) return 100;
  return (amountIn / reserveIn) * 100;
}

// ── Route search ─────────────────────────────────────────────────────────────

/**
 * DFS over the pool graph to enumerate all paths from tokenIn to tokenOut
 * with at most MAX_HOPS edges.  Returns up to MAX_ROUTES best routes.
 */
export function findRoutes(
  graph:    Map<string, PoolEdge[]>,
  tokenIn:  string,
  tokenOut: string,
  amountIn: number,
): SorRoute[] {
  const routes: SorRoute[] = [];
  const visited  = new Set<string>();

  function dfs(current: string, remaining: number, hops: RouteHop[], depth: number) {
    if (depth > MAX_HOPS) return;
    if (current === tokenOut && hops.length > 0) {
      routes.push(buildRoute(hops, amountIn));
      return;
    }

    const edges = graph.get(current) ?? [];
    for (const edge of edges) {
      if (visited.has(edge.tokenOut) && edge.tokenOut !== tokenOut) continue;
      if (edge.tvlUsd < MIN_LIQUIDITY_USD) continue;

      const out = cpmmOut(remaining, edge.reserveIn, edge.reserveOut, edge.fee);
      if (out <= 0) continue;

      const impact = priceImpactPct(remaining, edge.reserveIn);

      const hop: RouteHop = {
        poolId:      edge.poolId,
        protocol:    edge.protocol,
        tokenIn:     edge.tokenIn,
        tokenOut:    edge.tokenOut,
        amountIn:    remaining,
        amountOut:   out,
        fee:         edge.fee,
        priceImpact: impact,
      };

      visited.add(current);
      dfs(edge.tokenOut, out, [...hops, hop], depth + 1);
      visited.delete(current);
    }
  }

  visited.add(tokenIn);
  dfs(tokenIn, amountIn, [], 0);

  // Sort by amountOut descending and return top N
  routes.sort((a, b) => b.amountOut - a.amountOut);
  return routes.slice(0, MAX_ROUTES);
}

function buildRoute(hops: RouteHop[], amountIn: number): SorRoute {
  const amountOut    = hops[hops.length - 1]!.amountOut;
  const totalFeeUsd  = hops.reduce((s, h) => s + h.amountIn * h.fee, 0);
  const priceImpact  = hops.reduce((max, h) => Math.max(max, h.priceImpact), 0);
  const path         = [hops[0]!.tokenIn, ...hops.map(h => h.tokenOut)];

  return {
    hops,
    amountIn,
    amountOut,
    totalFeeUsd,
    priceImpact,
    effectivePrice: amountIn > 0 ? amountOut / amountIn : 0,
    path,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function computeSorQuote(
  graph:    Map<string, PoolEdge[]>,
  tokenIn:  string,
  tokenOut: string,
  amountIn: number,
): SorQuoteResult {
  const routes   = findRoutes(graph, tokenIn, tokenOut, amountIn);
  const best     = routes[0] ?? null;

  // Spot price: 1 unit with negligible impact
  const spotRoutes = findRoutes(graph, tokenIn, tokenOut, amountIn * 0.0001);
  const spotRoute  = spotRoutes[0];
  const spotPrice  = spotRoute
    ? spotRoute.effectivePrice
    : null;

  return {
    tokenIn,
    tokenOut,
    amountIn,
    routes,
    bestRoute:      best,
    spotPrice,
    priceImpact:    best?.priceImpact ?? null,
    executionPrice: best?.effectivePrice ?? null,
  };
}
