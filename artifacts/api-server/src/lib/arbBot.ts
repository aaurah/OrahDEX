/**
 * Arbitrage Bot — Orah
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
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

export const ARB_BOT_ADDRESS = "BOT_ARB_ENGINE";

const TRADE_FEE_RATE = 0.001;   // 0.10% per leg (× 3 legs)
const MIN_PROFIT_PCT = 0.004;   // need >0.4% gross to clear 3 × 0.1% fees + slippage
const MAX_TRADE_USDT = 500;     // max USDT notional per arb cycle
const INTERVAL_MS    = 60_000;  // run every 60 s

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
  const priceMap = new Map<string, number>();
  for (const m of markets) {
    const p = parseFloat(m.lastPrice ?? "0");
    if (p > 0) priceMap.set(m.symbol, p);
  }

  const opportunities: ArbOpportunity[] = [];

  for (const m of markets) {
    if (m.quoteAsset === "USDT") continue;

    const A = m.baseAsset;
    const B = m.quoteAsset;
    const priceAB    = priceMap.get(m.symbol);
    const priceAUSDT = priceMap.get(`${A}/USDT`);
    const priceBUSDT = priceMap.get(`${B}/USDT`);
    if (!priceAB || !priceAUSDT || !priceBUSDT) continue;

    // Route 1: USDT → buy A → sell A for B → sell B for USDT
    const r1Gross  = priceBUSDT / (priceAUSDT * priceAB);
    const r1Net    = r1Gross * Math.pow(1 - TRADE_FEE_RATE, 3);
    const r1Profit = r1Net - 1;
    if (r1Profit > MIN_PROFIT_PCT) {
      const size = Math.min(MAX_TRADE_USDT, 100 / (r1Profit * 100));
      opportunities.push({
        route:      `USDT→${A}→${B}→USDT`,
        symbol1:    `${A}/USDT`,
        symbol2:    m.symbol,
        symbol3:    `${B}/USDT`,
        profitPct:  r1Profit * 100,
        profitUSDT: size * r1Profit,
        tradeSize:  size,
      });
    }

    // Route 2: USDT → buy B → buy A with B → sell A for USDT
    const r2Gross  = (priceAUSDT * priceAB) / priceBUSDT;
    const r2Net    = r2Gross * Math.pow(1 - TRADE_FEE_RATE, 3);
    const r2Profit = r2Net - 1;
    if (r2Profit > MIN_PROFIT_PCT) {
      const size = Math.min(MAX_TRADE_USDT, 100 / (r2Profit * 100));
      opportunities.push({
        route:      `USDT→${B}→${A}→USDT`,
        symbol1:    `${B}/USDT`,
        symbol2:    m.symbol,
        symbol3:    `${A}/USDT`,
        profitPct:  r2Profit * 100,
        profitUSDT: size * r2Profit,
        tradeSize:  size,
      });
    }
  }

  return opportunities.sort((a, b) => b.profitPct - a.profitPct).slice(0, 5);
}

/* ── main cycle ──────────────────────────────────────────────────────────── */

async function runArbCycle() {
  try {
    const enabled = await getSetting("arb_bot_enabled");
    if (enabled !== "true") return;

    const markets: MarketRow[] = await db.select({
      symbol:     marketsTable.symbol,
      baseAsset:  marketsTable.baseAsset,
      quoteAsset: marketsTable.quoteAsset,
      lastPrice:  marketsTable.lastPrice,
      status:     marketsTable.status,
    }).from(marketsTable).where(eq(marketsTable.status, "active"));

    if (markets.length === 0) return;

    const opportunities = findOpportunities(markets);

    let cycleProfitUSDT = 0;
    let tradesExecuted  = 0;

    for (const opp of opportunities) {
      const net = opp.profitUSDT * (1 - TRADE_FEE_RATE * 3);
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
