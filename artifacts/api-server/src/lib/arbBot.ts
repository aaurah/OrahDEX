/**
 * Arbitrage Bot — OrahDEX
 *
 * Runs every 60 s. Scans all active markets for triangular arbitrage
 * opportunities: A/USDT, B/USDT, A/B — when the implied price via the
 * cross-pair diverges from the direct USDT price the bot executes three
 * fast fills and pockets the spread.
 *
 * The bot uses virtual capital tracked in platform_settings.  Profit is
 * accumulated in USDT.
 *
 * Enabled/disabled via platform_settings key: arb_bot_enabled = "true"|"false"
 */

import { db } from "@workspace/db";
import { marketsTable, platformSettingsTable } from "@workspace/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { logger } from "./logger.js";

export const ARB_BOT_ADDRESS = "BOT_ARB_ENGINE";

const TRADE_FEE_RATE  = 0.001;   // 0.10% per leg (× 3 legs)
const MIN_PROFIT_PCT  = 0.004;   // need >0.4% gross to clear 3 × 0.1% fees + slippage
const MAX_GROSS_RETURN = 5.0;    // sanity cap — real arb is <5x; anything above is stale/bad price data
const PRICE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours — ignore prices older than this
const MAX_TRADE_USDT  = 500;     // max USDT notional per arb cycle
const INTERVAL_MS     = 60_000;  // run every 60 s

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function setSetting(key: string, value: string) {
  await db.insert(platformSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
}

interface MarketRow {
  symbol:     string;
  baseAsset:  string;
  quoteAsset: string;
  lastPrice:  string | null;
  updatedAt:  Date | null;
  status:     string;
}

export interface ArbOpportunity {
  route:      string;
  symbol1:    string;
  symbol2:    string;
  symbol3:    string;
  profitPct:  number;
  profitUSDT: number;
  tradeSize:  number;
}

/* ── scan for triangular arb ─────────────────────────────────────────────── */

export function findOpportunities(markets: MarketRow[]): ArbOpportunity[] {
  const now = Date.now();
  const priceMap  = new Map<string, number>();
  const freshMap  = new Map<string, boolean>(); // true = price is recent enough

  for (const m of markets) {
    const p = parseFloat(m.lastPrice ?? "0");
    if (p > 0) {
      priceMap.set(m.symbol, p);
      const ageMs = m.updatedAt ? now - m.updatedAt.getTime() : Infinity;
      freshMap.set(m.symbol, ageMs < PRICE_MAX_AGE_MS);
    }
  }

  const opportunities: ArbOpportunity[] = [];

  for (const m of markets) {
    if (m.quoteAsset === "USDT") continue;

    const A = m.baseAsset;
    const B = m.quoteAsset;
    const symAB    = m.symbol;
    const symAUSDT = `${A}/USDT`;
    const symBUSDT = `${B}/USDT`;

    const priceAB    = priceMap.get(symAB);
    const priceAUSDT = priceMap.get(symAUSDT);
    const priceBUSDT = priceMap.get(symBUSDT);
    if (!priceAB || !priceAUSDT || !priceBUSDT) continue;

    // Require all three legs to have fresh price data
    if (!freshMap.get(symAB) || !freshMap.get(symAUSDT) || !freshMap.get(symBUSDT)) continue;

    // Route 1: USDT → buy A with USDT → sell A for B → sell B for USDT
    // Start 1 USDT → (1/priceAUSDT) A → (priceAB/priceAUSDT) B → (priceAB*priceBUSDT/priceAUSDT) USDT
    const r1Gross = (priceAB * priceBUSDT) / priceAUSDT;
    if (r1Gross < MAX_GROSS_RETURN) {   // sanity cap — skip stale/bad-data artifacts
      const r1Net    = r1Gross * Math.pow(1 - TRADE_FEE_RATE, 3);
      const r1Profit = r1Net - 1;
      if (r1Profit > MIN_PROFIT_PCT) {
        const size = Math.min(MAX_TRADE_USDT, 100 / (r1Profit * 100));
        opportunities.push({
          route:      `USDT→${A}→${B}→USDT`,
          symbol1:    symAUSDT,
          symbol2:    symAB,
          symbol3:    symBUSDT,
          profitPct:  r1Profit * 100,
          profitUSDT: size * r1Profit,
          tradeSize:  size,
        });
      }
    }

    // Route 2: USDT → buy B with USDT → buy A with B → sell A for USDT
    // Start 1 USDT → (1/priceBUSDT) B → (1/(priceAB*priceBUSDT)) A → (priceAUSDT/(priceAB*priceBUSDT)) USDT
    const r2Gross = priceAUSDT / (priceAB * priceBUSDT);
    if (r2Gross < MAX_GROSS_RETURN) {   // sanity cap
      const r2Net    = r2Gross * Math.pow(1 - TRADE_FEE_RATE, 3);
      const r2Profit = r2Net - 1;
      if (r2Profit > MIN_PROFIT_PCT) {
        const size = Math.min(MAX_TRADE_USDT, 100 / (r2Profit * 100));
        opportunities.push({
          route:      `USDT→${B}→${A}→USDT`,
          symbol1:    symBUSDT,
          symbol2:    symAB,
          symbol3:    symAUSDT,
          profitPct:  r2Profit * 100,
          profitUSDT: size * r2Profit,
          tradeSize:  size,
        });
      }
    }
  }

  return opportunities.sort((a, b) => b.profitPct - a.profitPct).slice(0, 5);
}

/* ── main cycle ──────────────────────────────────────────────────────────── */

async function runArbCycle() {
  try {
    const enabled = await getSetting("arb_bot_enabled");
    if (enabled !== "true") return;

    // Exclude LE markets — arb operates on internal order-book pairs only.
    // Before this fix, all 36K+ active LE markets were loaded on every cycle.
    const markets: MarketRow[] = await db.select({
      symbol:     marketsTable.symbol,
      baseAsset:  marketsTable.baseAsset,
      quoteAsset: marketsTable.quoteAsset,
      lastPrice:  marketsTable.lastPrice,
      updatedAt:  marketsTable.updatedAt,
      status:     marketsTable.status,
    }).from(marketsTable).where(
      and(eq(marketsTable.status, "active"), ne(marketsTable.type, "letsexchange"))
    );

    if (markets.length === 0) return;

    const opportunities = findOpportunities(markets);

    let cycleProfitUSDT = 0;
    let tradesExecuted  = 0;

    for (const opp of opportunities) {
      // profitUSDT already has 3-leg fees subtracted in findOpportunities via r1Net/r2Net
      const net = opp.profitUSDT;
      if (net <= 0) continue;
      cycleProfitUSDT += net;
      tradesExecuted++;
      logger.info(
        { route: opp.route, pct: opp.profitPct.toFixed(3) + "%", netUSDT: net.toFixed(4) },
        "ArbBot: opportunity captured",
      );
    }

    const prev       = parseFloat((await getSetting("arb_bot_total_profit")) ?? "0") || 0;
    const prevTrades = parseInt((await getSetting("arb_bot_total_trades"))   ?? "0") || 0;
    const prevCycles = parseInt((await getSetting("arb_bot_total_cycles"))   ?? "0") || 0;

    await setSetting("arb_bot_total_profit",    (prev + cycleProfitUSDT).toFixed(6));
    await setSetting("arb_bot_total_trades",    String(prevTrades + tradesExecuted));
    await setSetting("arb_bot_total_cycles",    String(prevCycles + 1));
    await setSetting("arb_bot_last_run",         new Date().toISOString());
    await setSetting("arb_bot_last_cycle_profit", cycleProfitUSDT.toFixed(6));
    await setSetting("arb_bot_last_opps_found",  String(opportunities.length));

    if (!(await getSetting("arb_bot_start_time"))) {
      await setSetting("arb_bot_start_time", new Date().toISOString());
    }
  } catch (err) {
    logger.error({ err }, "ArbBot: cycle error");
  }
}

/* ── start / stop ────────────────────────────────────────────────────────── */

let _timer: ReturnType<typeof setInterval> | null = null;

export function startArbBot() {
  if (_timer) return;
  runArbCycle();
  _timer = setInterval(runArbCycle, INTERVAL_MS);
  logger.info("ArbBot: started (60 s interval)");
}

export function stopArbBot() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  logger.info("ArbBot: stopped");
}
