/**
 * portfolioRisk.ts — Portfolio risk analytics: Greeks and Value-at-Risk.
 *
 * Greeks for futures are simplified (delta only; gamma/theta/vega = 0).
 * Options Greeks are read from stored contract fields and scaled by position size.
 * VaR is computed both historically (from price history) and parametrically.
 */

import type { FuturesPosition } from "@workspace/db/schema";
import { logger } from "./logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PortfolioGreeks {
  totalDelta: number;       // net directional exposure in USD
  totalGamma: number;       // rate of delta change (USD per 1% price move)
  totalTheta: number;       // daily time decay in USD
  totalVega: number;        // sensitivity to 1% volatility change in USD
  portfolioBeta: number;    // weighted correlation to BTC (1.0 baseline)
  netExposureUsd: number;   // total long minus short USD exposure
}

export interface VaRResult {
  var95: number;              // 95% confidence 1-day VaR in USD (positive = potential loss)
  var99: number;              // 99% confidence 1-day VaR in USD
  cvar95: number;             // Conditional VaR / Expected Shortfall at 95% in USD
  method: "historical" | "parametric";
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Assumed daily volatility per asset (as decimals)
const DAILY_VOL: Record<string, number> = {
  BTC:  0.03,
  WBTC: 0.03,
  ETH:  0.04,
  WETH: 0.04,
  SOL:  0.06,
};
const DEFAULT_DAILY_VOL = 0.08;

// Asset beta relative to BTC (BTC = 1.0 baseline)
const ASSET_BETA: Record<string, number> = {
  BTC:  1.0,
  WBTC: 1.0,
  ETH:  0.85,
  WETH: 0.85,
  SOL:  0.75,
};
const DEFAULT_BETA = 0.6;

// Standard normal quantiles for VaR
const Z_95  = 1.645;
const Z_99  = 2.326;
// Expected value of standard normal below -z_95 (φ(z_95)/0.05)
const CVaR_95_FACTOR = 2.063;

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractBaseAsset(symbol: string): string {
  // Handles formats: BTC/USDT, BTCUSDT, BTC-USDT
  return symbol.split(/[\/\-]/)[0]?.toUpperCase() ?? symbol.toUpperCase();
}

function dailyVolForSymbol(symbol: string): number {
  const base = extractBaseAsset(symbol);
  return DAILY_VOL[base] ?? DEFAULT_DAILY_VOL;
}

function betaForSymbol(symbol: string): number {
  const base = extractBaseAsset(symbol);
  return ASSET_BETA[base] ?? DEFAULT_BETA;
}

function parseNumeric(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return isNaN(n) ? 0 : n;
}

// ── Greeks calculation ────────────────────────────────────────────────────────

/**
 * Calculate aggregate portfolio Greeks.
 *
 * For futures positions:
 *   delta = quantity * markPrice * (side === "long" ? 1 : -1)
 *   gamma = theta = vega = 0 (linear instruments)
 *
 * For options positions (any shape; expected to have Greek fields):
 *   each Greek is scaled by position quantity and side sign.
 *
 * Beta is the exposure-weighted average of per-asset beta coefficients.
 */
export function calculatePortfolioGreeks(
  positions: FuturesPosition[],
  optionsPositions: any[],
  marketPrices: Record<string, number>,
): PortfolioGreeks {
  let totalDelta     = 0;
  let totalGamma     = 0;
  let totalTheta     = 0;
  let totalVega      = 0;
  let longExposure   = 0;
  let shortExposure  = 0;
  let betaNumerator  = 0;
  let betaDenominator = 0;

  // Process futures positions
  for (const pos of positions) {
    if (pos.status !== "open") continue;

    const qty      = parseNumeric(pos.quantity);
    const markPrice = parseNumeric(pos.markPrice) ||
      marketPrices[pos.symbol] ||
      parseNumeric(pos.entryPrice);

    if (markPrice <= 0 || qty <= 0) continue;

    const sign     = pos.side === "long" ? 1 : -1;
    const deltaUsd = qty * markPrice * sign;
    const absUsd   = qty * markPrice;

    totalDelta += deltaUsd;
    if (sign > 0) longExposure  += absUsd;
    else          shortExposure += absUsd;

    const beta = betaForSymbol(pos.symbol);
    betaNumerator   += absUsd * beta;
    betaDenominator += absUsd;
  }

  // Process options positions
  for (const opt of optionsPositions) {
    const qty  = parseNumeric(opt.quantity ?? opt.size);
    const sign = (opt.side ?? "long") === "long" ? 1 : -1;

    // Scale each Greek by quantity and direction
    totalDelta += parseNumeric(opt.delta) * qty * sign;
    totalGamma += parseNumeric(opt.gamma) * qty * sign;
    totalTheta += parseNumeric(opt.theta) * qty * sign;
    totalVega  += parseNumeric(opt.vega)  * qty * sign;

    const notional = parseNumeric(opt.notional ?? opt.markValue ?? 0);
    const absNotional = Math.abs(notional);
    if (absNotional > 0) {
      const beta = betaForSymbol(opt.symbol ?? "");
      betaNumerator   += absNotional * beta;
      betaDenominator += absNotional;
    }
  }

  const portfolioBeta   = betaDenominator > 0 ? betaNumerator / betaDenominator : 0;
  const netExposureUsd  = longExposure - shortExposure;

  return {
    totalDelta:     parseFloat(totalDelta.toFixed(4)),
    totalGamma:     parseFloat(totalGamma.toFixed(6)),
    totalTheta:     parseFloat(totalTheta.toFixed(4)),
    totalVega:      parseFloat(totalVega.toFixed(4)),
    portfolioBeta:  parseFloat(portfolioBeta.toFixed(4)),
    netExposureUsd: parseFloat(netExposureUsd.toFixed(2)),
  };
}

// ── Historical VaR ────────────────────────────────────────────────────────────

/**
 * Calculate Value-at-Risk using historical simulation.
 *
 * For each historical day t, compute the portfolio P&L assuming today's
 * positions had been held at those historical price levels.
 * Sort returns ascending, pick the 5th and 1st percentile observations.
 * CVaR = mean of all returns below the VaR threshold.
 *
 * Falls back to parametric if fewer than 30 days of history exist.
 *
 * @param positions     Open futures positions
 * @param priceHistory  Map of symbol → array of closing prices (oldest first)
 */
export function calculateHistoricalVaR(
  positions: FuturesPosition[],
  priceHistory: Record<string, number[]>,
): VaRResult {
  const openPositions = positions.filter((p) => p.status === "open");

  // Determine the usable history length (minimum across all position symbols)
  let minLen = Infinity;
  for (const pos of openPositions) {
    const hist = priceHistory[pos.symbol];
    if (!hist || hist.length < 2) { minLen = 0; break; }
    if (hist.length < minLen) minLen = hist.length;
  }

  if (minLen < 30) {
    // Insufficient history — use parametric
    const prices: Record<string, number> = {};
    for (const pos of openPositions) {
      const hist = priceHistory[pos.symbol];
      const last = hist && hist.length > 0 ? hist[hist.length - 1]! : parseNumeric(pos.markPrice);
      prices[pos.symbol] = last;
    }
    logger.warn({ minLen }, "Insufficient price history for historical VaR; using parametric fallback");
    return calculateParametricVaR(openPositions, prices);
  }

  // Compute daily portfolio P&L using day-over-day returns
  const dailyPnl: number[] = [];

  for (let i = 1; i < minLen; i++) {
    let dayPnl = 0;
    for (const pos of openPositions) {
      const hist     = priceHistory[pos.symbol]!;
      const prevPrice = hist[hist.length - minLen + i - 1]!;
      const currPrice = hist[hist.length - minLen + i]!;

      if (prevPrice <= 0) continue;

      const qty  = parseNumeric(pos.quantity);
      const sign = pos.side === "long" ? 1 : -1;
      dayPnl    += qty * (currPrice - prevPrice) * sign;
    }
    dailyPnl.push(dayPnl);
  }

  if (dailyPnl.length === 0) {
    const prices: Record<string, number> = {};
    for (const pos of openPositions) prices[pos.symbol] = parseNumeric(pos.markPrice);
    return calculateParametricVaR(openPositions, prices);
  }

  // Sort ascending (worst losses first)
  dailyPnl.sort((a, b) => a - b);

  const n = dailyPnl.length;
  const idx95 = Math.max(0, Math.floor(n * 0.05) - 1);
  const idx99 = Math.max(0, Math.floor(n * 0.01) - 1);

  const var95Threshold = dailyPnl[idx95]!;
  const var99Threshold = dailyPnl[idx99]!;

  // CVaR at 95%: mean of all returns below the 5th percentile
  const tail95 = dailyPnl.slice(0, idx95 + 1);
  const cvar95Raw = tail95.length > 0 ? tail95.reduce((s, x) => s + x, 0) / tail95.length : var95Threshold;

  return {
    var95:  parseFloat(Math.abs(Math.min(var95Threshold, 0)).toFixed(2)),
    var99:  parseFloat(Math.abs(Math.min(var99Threshold, 0)).toFixed(2)),
    cvar95: parseFloat(Math.abs(Math.min(cvar95Raw, 0)).toFixed(2)),
    method: "historical",
  };
}

// ── Parametric VaR ────────────────────────────────────────────────────────────

/**
 * Calculate parametric (variance-covariance) Value-at-Risk.
 *
 * Assumes:
 *   - Daily returns are normally distributed
 *   - No cross-asset correlation (conservative, overestimates VaR for diversified portfolios)
 *   - Per-asset daily vol: BTC 3%, ETH 4%, SOL 6%, others 8%
 *
 * Portfolio variance = Σ (position_delta_usd * vol)²
 * VaR  = z * sqrt(variance)
 * CVaR = (φ(z) / (1-p)) * sqrt(variance)  ≈  CVaR_factor * sqrt(variance)
 */
export function calculateParametricVaR(
  positions: FuturesPosition[],
  marketPrices: Record<string, number>,
): VaRResult {
  let portfolioVariance = 0;

  for (const pos of positions) {
    if (pos.status !== "open") continue;

    const qty       = parseNumeric(pos.quantity);
    const price     = marketPrices[pos.symbol] ?? parseNumeric(pos.markPrice);
    if (qty <= 0 || price <= 0) continue;

    const deltaUsd  = qty * price;   // absolute exposure (vol works symmetrically)
    const vol       = dailyVolForSymbol(pos.symbol);
    portfolioVariance += (deltaUsd * vol) ** 2;
  }

  const portfolioStd = Math.sqrt(portfolioVariance);

  return {
    var95:  parseFloat((Z_95 * portfolioStd).toFixed(2)),
    var99:  parseFloat((Z_99 * portfolioStd).toFixed(2)),
    cvar95: parseFloat((CVaR_95_FACTOR * portfolioStd).toFixed(2)),
    method: "parametric",
  };
}
