import type { BridgeQuoteParams, BridgeQuote, BridgeQuoteWithScore } from "../bridges/IBridgeProvider.js";
import type { IBridgeProvider } from "../bridges/IBridgeProvider.js";
import { MockBridgeCheapSlow } from "../bridges/MockBridgeCheapSlow.js";
import { MockBridgeFastExpensive } from "../bridges/MockBridgeFastExpensive.js";
import { MockBridgeBalanced } from "../bridges/MockBridgeBalanced.js";
import { scoreQuotes, DEFAULT_SCORING_CONFIG, type ScoringConfig } from "./routeScoring.js";
import { logger } from "../lib/logger.js";

// ── Provider registry — add real providers here later ─────────────────────────

const PROVIDERS: IBridgeProvider[] = [
  new MockBridgeCheapSlow(),
  new MockBridgeFastExpensive(),
  new MockBridgeBalanced(),
];

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

  // Fan out in parallel
  const results = await Promise.allSettled(
    PROVIDERS.map(p => p.getQuote(params)),
  );

  const valid: BridgeQuote[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      valid.push(r.value);
    } else {
      logger.warn({ provider: PROVIDERS[i].id, err: r.status === "rejected" ? r.reason : "null" }, "bridge-agg: provider failed");
    }
  }

  const scored = scoreQuotes(valid, config);
  CACHE.set(key, { quotes: scored, ts: Date.now() });

  return { quotes: scored, bestQuote: scored[0] ?? null };
}

export function getProvider(id: string): IBridgeProvider | undefined {
  return PROVIDERS.find(p => p.id === id);
}
