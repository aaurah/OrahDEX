import type { BridgeQuoteParams, BridgeQuoteWithScore } from "../bridges/IBridgeProvider.js";
import { getLiFiQuotes } from "../bridges/LiFiProvider.js";
import { scoreQuotes, DEFAULT_SCORING_CONFIG, type ScoringConfig } from "./routeScoring.js";
import { logger } from "../lib/logger.js";

// ── Simple in-memory quote cache (30-second TTL) ──────────────────────────────

interface CacheEntry { quotes: BridgeQuoteWithScore[]; ts: number }
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function cacheKey(p: BridgeQuoteParams): string {
  return `${p.fromChainId}:${p.toChainId}:${p.fromTokenAddress}:${p.toTokenAddress}:${p.amountIn}`;
}

// ── Aggregator ────────────────────────────────────────────────────────────────

export async function getQuotesAcrossProviders(
  params: BridgeQuoteParams,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): Promise<{ quotes: BridgeQuoteWithScore[]; bestQuote: BridgeQuoteWithScore | null }> {
  const key = cacheKey(params);
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    logger.info({ key }, "bridge-agg: cache hit");
    return { quotes: cached.quotes, bestQuote: cached.quotes[0] ?? null };
  }

  const quotes = await getLiFiQuotes(params);
  const scored = scoreQuotes(quotes, config);
  CACHE.set(key, { quotes: scored, ts: Date.now() });

  return { quotes: scored, bestQuote: scored[0] ?? null };
}
