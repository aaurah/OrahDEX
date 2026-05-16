/**
 * metaRouter.ts — Multi-venue quote collection and scoring engine
 *
 * Queries all configured external swap providers in parallel, normalises
 * their responses into a common RouteQuote shape, scores each quote by
 * net USD value (output minus fees minus slippage penalty), and returns
 * the winner plus the full quote set for transparency.
 *
 * Supported external venues (off-chain instant-swap providers):
 *   LETSEXCHANGE  — primary; wide pair coverage, affiliate revenue
 *   SIMPLESWAP    — secondary; good for small orders
 *   CHANGENOW     — tertiary; large pair catalog
 *   STEALTHEX     — privacy-focused; no KYC
 *   CHANGELLY     — established; stable API
 *
 * ─── Scoring formula ────────────────────────────────────────────────────────
 *   score = (expectedOutput × outputUsdPrice)
 *           − networkFeeUsd
 *           − venueFeeUsd
 *           − slippagePenalty
 *
 *   slippagePenalty = (slippageBps / 10000) × outputUsd × SLIPPAGE_WEIGHT
 *
 * Higher score = better quote.
 */

import { logger } from "./logger.js";
import { leRequest, AFFILIATE_ID } from "./lePriceCache.js";
import { quoteFromSSPair, isSimpleSwapConfigured } from "./simpleswap.js";
import { quoteFromCN, isChangeNowConfigured }                  from "./changenow.js";
import { quoteFromSX, isStealthExConfigured }                  from "./stealthex.js";
import { quoteFromChangelly, isChangellyConfigured }           from "./changelly.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExternalVenue =
  | "letsexchange"
  | "simpleswap"
  | "changenow"
  | "stealthex"
  | "changelly";

export interface RouteQuote {
  venue:           ExternalVenue;
  inputToken:      string;
  outputToken:     string;
  inputAmount:     number;
  expectedOutput:  number;
  networkFeeUsd:   number;          // estimated network/gas fee in USD
  venueFeeUsd:     number;          // provider fee in USD
  venueFeeRatio:   number;          // provider fee as a ratio (e.g. 0.0035)
  slippageBps:     number;          // expected slippage in basis points
  minAmount:       number | null;   // minimum input amount for this pair
  maxAmount:       number | null;
  canExecute:      boolean;         // false if amount < min or > max
  score:           number;          // computed by scoreQuote()
  raw:             unknown;         // raw provider response for debugging
}

export interface MetaQuoteResult {
  best:      RouteQuote | null;
  all:       RouteQuote[];
  errors:    Record<ExternalVenue, string | null>;
  /** Lowest minimum input amount across all quotes, even canExecute=false ones.
   *  Set when best=null because the amount is below every venue's threshold. */
  lowestMin: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Weight applied to slippage when computing the score penalty. */
const SLIPPAGE_WEIGHT = 0.5;

/**
 * Estimated flat venue fees (ratio of input amount) where the provider
 * bakes their margin into the rate rather than charging an explicit fee.
 * These are conservative estimates; actual fees vary per pair.
 */
export const VENUE_FEE_RATIOS: Record<ExternalVenue, number> = {
  letsexchange: 0.0035, // ~0.35% all-in (0.25–0.5% + on-chain withdrawal)
  simpleswap:   0.0050, // ~0.5%
  changenow:    0.0040, // ~0.4%
  stealthex:    0.0040, // ~0.4%
  changelly:    0.0050, // ~0.5%
};

// ─── Scoring ─────────────────────────────────────────────────────────────────

export function scoreQuote(
  q:              RouteQuote,
  inputUsdPrice:  number,
  outputUsdPrice: number,
  prefs?: {
    maxSlippageBps?:    number;
    blacklistVenues?:   ExternalVenue[];
    preferredVenues?:   ExternalVenue[];
  },
): number {
  if (!q.canExecute)                                          return -Infinity;
  if (prefs?.blacklistVenues?.includes(q.venue))             return -Infinity;
  if (prefs?.maxSlippageBps != null && q.slippageBps > prefs.maxSlippageBps) return -Infinity;

  const outputUsd       = q.expectedOutput * outputUsdPrice;
  const totalCostUsd    = q.networkFeeUsd + q.venueFeeUsd;
  const netValueUsd     = outputUsd - totalCostUsd;
  const slippagePenalty = (q.slippageBps / 10_000) * outputUsd * SLIPPAGE_WEIGHT;

  let score = netValueUsd - slippagePenalty;

  // Small boost for preferred venues (e.g. affiliate revenue)
  if (prefs?.preferredVenues?.includes(q.venue)) score *= 1.005;

  return score;
}

// ─── Provider quote collectors ────────────────────────────────────────────────

async function quoteLetsExchange(
  from:   string,
  to:     string,
  amount: number,
): Promise<{ quote: RouteQuote | null; error: string | null }> {
  try {
    // LE /v1/info requires: from, to, network_from, network_to, amount
    // (NOT coin_from / coin_to / deposit_amount — those cause 422)
    const { ok, status, data } = await leRequest("/v1/info", "POST", {
      from,
      to,
      network_from:   from,   // for native chains the network = coin symbol
      network_to:     to,
      amount,
      affiliate_id:   AFFILIATE_ID,
    });

    if (!ok || !data || typeof data !== "object") {
      return { quote: null, error: `LetsExchange HTTP ${status}` };
    }

    const d = data as Record<string, unknown>;
    const estimated = parseFloat(String(d.estimated_to ?? d.to_amount ?? "")) || 0;
    const minAmt    = d.min_amount != null ? parseFloat(String(d.min_amount)) || null : null;
    const maxAmt    = d.max_amount != null ? parseFloat(String(d.max_amount)) || null : null;

    if (estimated <= 0) return { quote: null, error: "LetsExchange returned zero estimate" };

    const canExecute =
      (minAmt == null || amount >= minAmt) &&
      (maxAmt == null || amount <= maxAmt);

    const feeRatio = VENUE_FEE_RATIOS.letsexchange;
    const inputUsd = amount; // caller provides USD context for scoring; we store ratios here
    const quote: RouteQuote = {
      venue:          "letsexchange",
      inputToken:     from,
      outputToken:    to,
      inputAmount:    amount,
      expectedOutput: estimated,
      networkFeeUsd:  0,           // baked into rate
      venueFeeUsd:    amount * feeRatio, // rough USD est — caller rescales with inputUsdPrice
      venueFeeRatio:  feeRatio,
      slippageBps:    0,           // instant-swap providers give fixed quotes
      minAmount:      minAmt,
      maxAmount:      maxAmt,
      canExecute,
      score:          0,           // filled by getBestExternalQuote
      raw:            data,
    };
    return { quote, error: null };
  } catch (err: any) {
    return { quote: null, error: err?.message ?? "LetsExchange error" };
  }
}

async function quoteSimpleSwap(
  from:   string,
  to:     string,
  amount: number,
): Promise<{ quote: RouteQuote | null; error: string | null }> {
  if (!isSimpleSwapConfigured()) {
    return { quote: null, error: "SIMPLESWAP_API_KEY not configured" };
  }

  try {
    const result = await quoteFromSSPair(from, to, amount);
    if (!result) return { quote: null, error: "SimpleSwap returned no result" };

    const canExecute =
      (result.minAmount == null || amount >= result.minAmount) &&
      (result.maxAmount == null || amount <= result.maxAmount);

    const feeRatio = VENUE_FEE_RATIOS.simpleswap;
    const quote: RouteQuote = {
      venue:          "simpleswap",
      inputToken:     from,
      outputToken:    to,
      inputAmount:    amount,
      expectedOutput: result.estimatedAmount,
      networkFeeUsd:  0,
      venueFeeUsd:    amount * feeRatio,
      venueFeeRatio:  feeRatio,
      slippageBps:    0,
      minAmount:      result.minAmount,
      maxAmount:      result.maxAmount,
      canExecute,
      score:          0,
      raw:            result,
    };
    return { quote, error: null };
  } catch (err: any) {
    return { quote: null, error: err?.message ?? "SimpleSwap error" };
  }
}

async function quoteChangeNow(
  from:   string,
  to:     string,
  amount: number,
): Promise<{ quote: RouteQuote | null; error: string | null }> {
  if (!(await isChangeNowConfigured())) {
    return { quote: null, error: "CHANGENOW_API_KEY not configured" };
  }

  try {
    const result = await quoteFromCN(from, to, amount);
    if (!result) return { quote: null, error: "ChangeNOW returned no result" };

    const canExecute =
      (result.minAmount == null || amount >= result.minAmount) &&
      (result.maxAmount == null || amount <= result.maxAmount);

    const feeRatio = VENUE_FEE_RATIOS.changenow;
    const quote: RouteQuote = {
      venue:          "changenow",
      inputToken:     from,
      outputToken:    to,
      inputAmount:    amount,
      expectedOutput: result.estimatedAmount,
      networkFeeUsd:  0,
      venueFeeUsd:    amount * feeRatio,
      venueFeeRatio:  feeRatio,
      slippageBps:    0,
      minAmount:      result.minAmount,
      maxAmount:      result.maxAmount,
      canExecute,
      score:          0,
      raw:            result,
    };
    return { quote, error: null };
  } catch (err: any) {
    return { quote: null, error: err?.message ?? "ChangeNOW error" };
  }
}

async function quoteStealthEx(
  from:   string,
  to:     string,
  amount: number,
): Promise<{ quote: RouteQuote | null; error: string | null }> {
  if (!isStealthExConfigured()) {
    return { quote: null, error: "STEALTHEX_API_KEY not configured" };
  }

  try {
    const result = await quoteFromSX(from, to, amount);
    if (!result) return { quote: null, error: "StealthEX returned no result" };

    const canExecute = result.minAmount == null || amount >= result.minAmount;
    const feeRatio   = VENUE_FEE_RATIOS.stealthex;
    const quote: RouteQuote = {
      venue:          "stealthex",
      inputToken:     from,
      outputToken:    to,
      inputAmount:    amount,
      expectedOutput: result.estimatedAmount,
      networkFeeUsd:  0,
      venueFeeUsd:    amount * feeRatio,
      venueFeeRatio:  feeRatio,
      slippageBps:    0,
      minAmount:      result.minAmount,
      maxAmount:      null,
      canExecute,
      score:          0,
      raw:            result,
    };
    return { quote, error: null };
  } catch (err: any) {
    return { quote: null, error: err?.message ?? "StealthEX error" };
  }
}

async function quoteChangelly(
  from:   string,
  to:     string,
  amount: number,
): Promise<{ quote: RouteQuote | null; error: string | null }> {
  if (!isChangellyConfigured()) {
    return { quote: null, error: "CHANGELLY_API_KEY or CHANGELLY_API_SECRET not configured" };
  }

  try {
    const result = await quoteFromChangelly(from, to, amount);
    if (!result) return { quote: null, error: "Changelly returned no result" };

    const canExecute = result.minAmount == null || amount >= result.minAmount;
    const feeRatio   = VENUE_FEE_RATIOS.changelly;
    const quote: RouteQuote = {
      venue:          "changelly",
      inputToken:     from,
      outputToken:    to,
      inputAmount:    amount,
      expectedOutput: result.estimatedAmount,
      networkFeeUsd:  0,
      venueFeeUsd:    amount * feeRatio,
      venueFeeRatio:  feeRatio,
      slippageBps:    0,
      minAmount:      result.minAmount,
      maxAmount:      null,
      canExecute,
      score:          0,
      raw:            result,
    };
    return { quote, error: null };
  } catch (err: any) {
    return { quote: null, error: err?.message ?? "Changelly error" };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Collect quotes from all configured external swap providers in parallel,
 * score each one, and return the best + all results.
 *
 * @param from            Input token symbol (e.g. "BTC")
 * @param to              Output token symbol (e.g. "ETH")
 * @param amount          Input amount in token units
 * @param inputUsdPrice   Current USD price of the input token (for scoring)
 * @param outputUsdPrice  Current USD price of the output token (for scoring)
 * @param prefs           Optional scoring preferences
 */
export async function getBestExternalQuote(
  from:           string,
  to:             string,
  amount:         number,
  inputUsdPrice:  number,
  outputUsdPrice: number,
  prefs?: {
    maxSlippageBps?:  number;
    blacklistVenues?: ExternalVenue[];
    preferredVenues?: ExternalVenue[];
  },
): Promise<MetaQuoteResult> {
  const fromU = from.toUpperCase();
  const toU   = to.toUpperCase();

  // Prefer LetsExchange slightly by default (affiliate + proven reliability)
  const defaultPrefs = {
    ...prefs,
    preferredVenues: prefs?.preferredVenues ?? ["letsexchange"],
  };

  // Fire all provider quote requests in parallel
  const [leR, ssR, cnR, sxR, clR] = await Promise.all([
    quoteLetsExchange(fromU, toU, amount),
    quoteSimpleSwap(fromU, toU, amount),
    quoteChangeNow(fromU, toU, amount),
    quoteStealthEx(fromU, toU, amount),
    quoteChangelly(fromU, toU, amount),
  ]);

  const errors: Record<ExternalVenue, string | null> = {
    letsexchange: leR.error,
    simpleswap:   ssR.error,
    changenow:    cnR.error,
    stealthex:    sxR.error,
    changelly:    clR.error,
  };

  // Score each successful quote
  const rawQuotes = [leR.quote, ssR.quote, cnR.quote, sxR.quote, clR.quote].filter(
    (q): q is RouteQuote => q !== null,
  );

  const scored = rawQuotes.map(q => ({
    ...q,
    score: scoreQuote(q, inputUsdPrice, outputUsdPrice, defaultPrefs),
  }));

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  const best = scored.find(q => Number.isFinite(q.score)) ?? null;

  // Compute the lowest minimum across ALL quotes (including canExecute=false).
  // This lets the caller tell the user exactly what amount to enter even when
  // the requested amount is below every venue's threshold.
  const allMins = scored
    .map(q => q.minAmount)
    .filter((m): m is number => m !== null && m > 0);
  const lowestMin = allMins.length > 0 ? Math.min(...allMins) : null;

  logger.info(
    {
      from:  fromU,
      to:    toU,
      amount,
      best:  best?.venue ?? "none",
      lowestMin,
      scores: scored.map(q => ({ venue: q.venue, output: q.expectedOutput, score: q.score.toFixed(4) })),
      errors: Object.fromEntries(
        Object.entries(errors).filter(([, v]) => v !== null),
      ),
    },
    "metaRouter: best external quote selected",
  );

  return { best, all: scored, errors, lowestMin };
}

/**
 * Quick helper that returns just the winning venue name, or "letsexchange"
 * as a safe fallback when no quotes are available.
 */
export async function pickExternalVenue(
  from:          string,
  to:            string,
  amount:        number,
  inputUsdPrice: number,
  outputUsdPrice: number,
): Promise<ExternalVenue> {
  try {
    const { best } = await getBestExternalQuote(from, to, amount, inputUsdPrice, outputUsdPrice);
    return best?.venue ?? "letsexchange";
  } catch {
    return "letsexchange";
  }
}
