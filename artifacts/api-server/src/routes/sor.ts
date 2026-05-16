/**
 * sor.ts — Smart Order Router API endpoints
 *
 * GET /api/sor/quote?from=ETH&to=USDC&amount=1&chainId=11155111
 *   Returns the best swap route(s) with expected output, price impact, and hop breakdown.
 *
 * GET /api/sor/tokens
 *   Returns all routable token symbols with USD prices.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { notInArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { buildPoolGraph, computeSorQuote, type SorQuoteResult } from "../lib/sorEngine.js";
import { FALLBACK_PRICES } from "../lib/priceUpdater.js";

const router = Router();

// Cache the pool graph for 15 s to avoid rebuilding on every request
let cachedGraph: ReturnType<typeof buildPoolGraph> | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 15_000;

async function getGraph() {
  const now = Date.now();
  if (cachedGraph && now - cacheAt < CACHE_TTL_MS) return cachedGraph;

  const markets = await db.select({
    symbol:     marketsTable.symbol,
    baseAsset:  marketsTable.baseAsset,
    quoteAsset: marketsTable.quoteAsset,
    lastPrice:  marketsTable.lastPrice,
    volume24h:  marketsTable.volume24h,
    type:       marketsTable.type,
    status:     marketsTable.status,
  }).from(marketsTable)
    .where(notInArray(marketsTable.type, ["letsexchange"]));

  cachedGraph = buildPoolGraph(markets);
  cacheAt     = now;
  return cachedGraph;
}

// ── GET /api/sor/quote ────────────────────────────────────────────────────────

router.get("/sor/quote", async (req, res) => {
  try {
    const { from, to, amount } = req.query as Record<string, string>;

    if (!from || !to || !amount) {
      res.status(400).json({ error: "Missing required query params: from, to, amount" });
      return;
    }

    const tokenIn  = from.trim().toUpperCase();
    const tokenOut = to.trim().toUpperCase();
    const amountIn = parseFloat(amount);

    if (!Number.isFinite(amountIn) || amountIn <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    if (tokenIn === tokenOut) {
      res.status(400).json({ error: "from and to must be different tokens" });
      return;
    }

    const graph  = await getGraph();
    const result: SorQuoteResult = computeSorQuote(graph, tokenIn, tokenOut, amountIn);

    // Attach USD context
    const fromUsd = FALLBACK_PRICES[tokenIn] ?? null;
    const toUsd   = FALLBACK_PRICES[tokenOut] ?? null;

    res.json({
      ...result,
      fromUsdPrice: fromUsd,
      toUsdPrice:   toUsd,
      tradeValueUsd: fromUsd ? amountIn * fromUsd : null,
      cached: Date.now() - cacheAt < CACHE_TTL_MS,
    });
  } catch (err) {
    logger.error({ err }, "SOR quote error");
    res.status(500).json({ error: "Route computation failed" });
  }
});

// ── GET /api/sor/tokens ───────────────────────────────────────────────────────

router.get("/sor/tokens", async (_req, res) => {
  try {
    const graph  = await getGraph();
    const tokens: { symbol: string; usdPrice: number | null; peerCount: number }[] = [];

    for (const [sym, edges] of graph.entries()) {
      tokens.push({
        symbol:    sym,
        usdPrice:  FALLBACK_PRICES[sym] ?? null,
        peerCount: edges.length,
      });
    }

    tokens.sort((a, b) => (b.usdPrice ?? 0) - (a.usdPrice ?? 0));
    res.json({ tokens, total: tokens.length });
  } catch (err) {
    logger.error({ err }, "SOR tokens error");
    res.status(500).json({ error: "Failed to list routable tokens" });
  }
});

// ── GET /api/sor/paths ────────────────────────────────────────────────────────
// Returns all possible paths (not scored) — useful for the route display UI

router.get("/sor/paths", async (req, res) => {
  try {
    const { from, to, amount } = req.query as Record<string, string>;
    if (!from || !to || !amount) {
      res.status(400).json({ error: "Missing required query params: from, to, amount" });
      return;
    }

    const graph  = await getGraph();
    const result = computeSorQuote(
      graph,
      from.trim().toUpperCase(),
      to.trim().toUpperCase(),
      parseFloat(amount),
    );

    // Return all routes with human-readable path labels
    const paths = result.routes.map((r, i) => ({
      rank:          i + 1,
      path:          r.path,
      pathLabel:     r.path.join(" → "),
      hops:          r.hops.length,
      amountOut:     r.amountOut,
      priceImpact:   r.priceImpact.toFixed(3),
      totalFeeUsd:   r.totalFeeUsd.toFixed(4),
      effectiveRate: r.effectivePrice.toFixed(8),
      hopDetails:    r.hops.map(h => ({
        pool:        h.poolId,
        protocol:    h.protocol,
        tokenIn:     h.tokenIn,
        tokenOut:    h.tokenOut,
        fee:         (h.fee * 100).toFixed(3) + "%",
        priceImpact: h.priceImpact.toFixed(3) + "%",
      })),
    }));

    res.json({ paths, bestPath: paths[0] ?? null });
  } catch (err) {
    logger.error({ err }, "SOR paths error");
    res.status(500).json({ error: "Path search failed" });
  }
});

export default router;
