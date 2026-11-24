import type { BridgeQuoteParams, BridgeQuote, BridgeQuoteWithScore } from "../bridges/IBridgeProvider.js";
import type { IBridgeProvider } from "../bridges/IBridgeProvider.js";
import { SocketBridgeProvider } from "../bridges/SocketBridgeProvider.js";
import { scoreQuotes, DEFAULT_SCORING_CONFIG, type ScoringConfig } from "./routeScoring.js";
import { logger } from "../lib/logger.js";

const PROVIDERS: IBridgeProvider[] = [
  new SocketBridgeProvider(),
];

interface CacheEntry { quotes: BridgeQuoteWithScore[]; ts: number }
const CACHE     = new Map<string, CacheEntry>();
const CACHE_TTL = 30_000;

function cacheKey(p: BridgeQuoteParams): string {
  return `${p.fromChainId}:${p.toChainId}:${p.fromTokenAddress}:${p.toTokenAddress}:${p.amountIn}`;
}

export async function getQuotesAcrossProviders(
  params: BridgeQuoteParams,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): Promise<{ quotes: BridgeQuoteWithScore[]; bestQuote: BridgeQuoteWithScore | null }> {
  const key = cacheKey(params);
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    logger.info({ key }, "bridge-agg: cache hit");
    return { quotes: cached.quotes, bestQuote: cached.quotes[0] ?? null };
  }

  const results = await Promise.allSettled(
    PROVIDERS.map(p => p.getQuotes(params)),
  );

  const valid: BridgeQuote[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      valid.push(...r.value);
    } else {
      logger.warn({ provider: PROVIDERS[i].id, err: r.reason }, "bridge-agg: provider failed");
    }
  }

  const scored = scoreQuotes(valid, config);
  CACHE.set(key, { quotes: scored, ts: Date.now() });

  return { quotes: scored, bestQuote: scored[0] ?? null };
}

export function getProvider(id: string): IBridgeProvider | undefined {
  const exact = PROVIDERS.find(p => p.id === id);
  if (exact) return exact;
  const prefix = id.split(":")[0];
  return PROVIDERS.find(p => p.id === prefix);
}
