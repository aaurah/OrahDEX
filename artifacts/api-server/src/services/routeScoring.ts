import type { BridgeQuote, BridgeQuoteWithScore } from "../bridges/IBridgeProvider.js";

export interface ScoringConfig {
  feeWeight: number;      // 0–1, higher = penalise expensive routes more
  timeWeight: number;     // 0–1, higher = penalise slow routes more
  slippageWeight: number; // 0–1, higher = penalise high slippage more
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  feeWeight:      0.50,
  timeWeight:     0.30,
  slippageWeight: 0.20,
};

/** Min-max normalise an array of numbers → [0, 1] (lower raw = higher normalised). */
function normaliseInverse(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 1);
  return values.map(v => 1 - (v - min) / (max - min));
}

/**
 * Score an array of quotes. Returns them sorted best-first with a numeric score [0–1].
 * Higher score = better route.
 */
export function scoreQuotes(
  quotes: BridgeQuote[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): BridgeQuoteWithScore[] {
  if (quotes.length === 0) return [];

  const fees      = quotes.map(q => Number(q.fee));
  const times     = quotes.map(q => q.estimatedTimeSeconds);
  const slippages = quotes.map(q => q.slippageBps);

  const normFee      = normaliseInverse(fees);
  const normTime     = normaliseInverse(times);
  const normSlippage = normaliseInverse(slippages);

  const scored: BridgeQuoteWithScore[] = quotes.map((q, i) => ({
    ...q,
    score: normFee[i] * config.feeWeight
         + normTime[i] * config.timeWeight
         + normSlippage[i] * config.slippageWeight,
  }));

  return scored.sort((a, b) => b.score - a.score);
}

/** Score a single quote relative to a peer set (used for display). */
export function computeRouteScore(
  quote: BridgeQuote,
  allQuotes: BridgeQuote[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  const scored = scoreQuotes(allQuotes, config);
  return scored.find(q => q.providerId === quote.providerId)?.score ?? 0;
}
