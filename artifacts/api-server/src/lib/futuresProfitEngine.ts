/**
 * Futures Profit Engine — OrahDEX
 *
 * Two independent income streams from futures markets:
 *
 *  1. FUNDING RATE INCOME  (runs every 8 hours)
 *     Real open positions pay funding fees to counterparties every 8 h.
 *     OrahDEX retains 10 % of every funding payment as platform income.
 *
 *  2. LIQUIDATION INCOME  (runs every 60 seconds)
 *     Positions whose mark-price crosses their liquidation price are closed
 *     and charged a 0.5 % liquidation fee that goes to the platform.
 */

import { pool, db } from "@workspace/db";
import { futuresPositionsTable, marketsTable, platformSettingsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger.js";
import { guardedInterval } from "./selfHealing.js";
import { liquidateFuturesPosition } from "./futuresSettlement.js";

/* ── shared helpers ─────────────────────────────────────────────────────── */

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

async function rebuildTotal() {
  const spread   = parseFloat((await getSetting("bot_spread_profit"))      ?? "0") || 0;
  const funding  = parseFloat((await getSetting("bot_funding_profit"))     ?? "0") || 0;
  const liquid   = parseFloat((await getSetting("bot_liquidation_profit")) ?? "0") || 0;
  await setSetting("bot_cumulative_profit", (spread + funding + liquid).toFixed(6));
}

/* ── per-symbol funding rates (annualised to 8-h period) ─────────────────── */
const FUNDING_MAP: Record<string, number> = {
  "BSV/USDT": 0.0001,  "BTC/USDT": 0.00015, "ETH/USDT": 0.00012,
  "SOL/USDT": 0.00008, "XRP/USDT": 0.00006, "BNB/USDT": 0.00010,
  "ADA/USDT": 0.00004, "AVAX/USDT":0.00009, "DOGE/USDT":0.00005,
  "DOT/USDT": 0.00007, "LINK/USDT":0.00011, "MATIC/USDT":0.00008,
};
const DEFAULT_FUNDING = 0.0001;
const PLATFORM_CUT    = 0.10;   // 10 % of funding flow retained by platform
const LIQUIDATION_FEE = 0.005;  // 0.5 % of margin on liquidation
const OI_TO_VOL_RATIO = 0.15;   // estimated open-interest / 24h-volume ratio

/* ══════════════════════════════════════════════════════════════════════════
   FUNDING RATE ENGINE — every 8 hours
   ══════════════════════════════════════════════════════════════════════════ */

async function runFundingCycle(): Promise<void> {
  try {
    const positions = await db.select().from(futuresPositionsTable)
      .where(eq(futuresPositionsTable.status, "open"));

    let cycleIncome    = 0;   // total platform revenue this cycle
    let appliedCount   = 0;   // positions that actually paid
    let underfundedCnt = 0;   // positions whose locked margin couldn't cover full payment

    /* For each open position, debit the funding payment from the user's
     * locked margin and record it on the position's fundingFee field.
     * Positive funding rate = longs pay; negative = shorts pay. The full
     * payment is collected by the platform (counterparty / insurance fund). */
    for (const pos of positions) {
      const rate  = FUNDING_MAP[pos.symbol] ?? DEFAULT_FUNDING;
      const markP = parseFloat(pos.markPrice)  || parseFloat(pos.entryPrice) || 0;
      const qty   = parseFloat(pos.quantity)   || 0;
      if (markP <= 0 || qty <= 0 || rate === 0) continue;

      // Sign convention: positive payment means the user pays the platform.
      const sideMul = pos.side === "long" ? 1 : -1;
      const payment = qty * markP * rate * sideMul;
      if (payment <= 0) {
        // User would be a receiver — skip in this simplified single-sided
        // model (platform never pays funding). Still credit the position's
        // fundingFee field so the UI shows the rebate accrual.
        const credit = Math.abs(payment);
        if (credit > 0) {
          await pool.query(
            `UPDATE futures_positions
             SET funding_fee = (COALESCE(funding_fee::numeric, 0) - $1)::text
             WHERE id = $2 AND status = 'open'`,
            [credit.toFixed(8), pos.id],
          );
        }
        continue;
      }

      // Atomically debit from locked margin (capped to what's available so a
      // funding payment can never push margin below zero — that would be the
      // job of the liquidation engine on the next tick).
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const { rows } = await client.query<{ locked: string }>(
          `SELECT locked FROM futures_margin_accounts
           WHERE wallet_address = $1 AND asset = 'USDT' FOR UPDATE`,
          [pos.walletAddress],
        );
        const locked    = parseFloat(rows[0]?.locked ?? "0");
        const charged   = Math.min(payment, locked);
        if (charged < payment) underfundedCnt++;

        if (charged > 0) {
          await client.query(
            `UPDATE futures_margin_accounts
             SET locked = locked - $1, updated_at = now()
             WHERE wallet_address = $2 AND asset = 'USDT'`,
            [charged.toFixed(8), pos.walletAddress],
          );
          await client.query(
            `UPDATE futures_positions
             SET funding_fee = (COALESCE(funding_fee::numeric, 0) + $1)::text,
                 margin      = GREATEST((margin::numeric - $1), 0)::text
             WHERE id = $2 AND status = 'open'`,
            [charged.toFixed(8), pos.id],
          );
          cycleIncome += charged;
          appliedCount++;
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        logger.warn({ err, positionId: pos.id }, "Funding charge failed for position");
      } finally {
        client.release();
      }
    }

    const prev     = parseFloat((await getSetting("bot_funding_profit")) ?? "0") || 0;
    const newTotal = prev + cycleIncome;

    await setSetting("bot_funding_profit",     newTotal.toFixed(6));
    await setSetting("bot_last_funding_income", cycleIncome.toFixed(6));
    await setSetting("bot_last_funding_at",     new Date().toISOString());
    await rebuildTotal();

    logger.info(
      { positions: positions.length, applied: appliedCount, underfunded: underfundedCnt,
        cycleIncome: cycleIncome.toFixed(4), cumulative: newTotal.toFixed(4) },
      "Futures profit engine: funding cycle complete",
    );
  } catch (err) {
    logger.error({ err }, "Futures profit engine: funding cycle failed");
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   LIQUIDATION ENGINE — every 60 seconds
   ══════════════════════════════════════════════════════════════════════════ */

async function runLiquidationCycle(): Promise<void> {
  try {
    const markets   = await db.select().from(marketsTable);
    const positions = await db.select().from(futuresPositionsTable)
      .where(eq(futuresPositionsTable.status, "open"));

    /* build a price map from live market data */
    const priceMap: Record<string, number> = {};
    for (const m of markets) {
      priceMap[m.symbol] = parseFloat(m.lastPrice ?? "0") || 0;
    }

    /* --- update mark prices and unrealized PnL for all open positions --- */
    for (const pos of positions) {
      const baseSym  = pos.symbol.replace("-PERP", "");
      const markPrice = priceMap[baseSym] ?? priceMap[pos.symbol] ?? parseFloat(pos.markPrice) ?? 0;
      if (markPrice <= 0) continue;
      const entry    = parseFloat(pos.entryPrice) || 0;
      const qty      = parseFloat(pos.quantity)   || 0;
      const margin   = parseFloat(pos.margin)     || 1;
      const priceDiff = markPrice - entry;
      const dirMult  = pos.side === "long" ? 1 : -1;
      const upnl     = dirMult * priceDiff * qty;
      const upnlPct  = (upnl / margin) * 100;
      try {
        await pool.query(
          `UPDATE futures_positions
           SET mark_price            = $1,
               unrealized_pnl        = $2,
               unrealized_pnl_percent = $3
           WHERE id = $4 AND status = 'open'`,
          [markPrice.toFixed(8), upnl.toFixed(8), upnlPct.toFixed(4), pos.id],
        );
      } catch { /* non-fatal */ }
    }

    /* --- check and liquidate real positions --- */
    let realLiqFees = 0;
    for (const pos of positions) {
      const baseSym   = pos.symbol.replace("-PERP", "");
      const markPrice = priceMap[baseSym] ?? priceMap[pos.symbol] ?? parseFloat(pos.markPrice) ?? 0;
      const liqPrice   = parseFloat(pos.liquidationPrice) || 0;
      if (markPrice <= 0 || liqPrice <= 0) continue;

      const isLiquidated =
        (pos.side === "long"  && markPrice <= liqPrice) ||
        (pos.side === "short" && markPrice >= liqPrice);

      if (isLiquidated) {
        /* Delegate to the canonical liquidation function which:
         *   - confiscates (removes) the locked margin from futures_margin_accounts
         *   - marks the position row as "liquidated" with optimistic concurrency check
         * This replaces the previous raw DB update that left margin stranded. */
        const liqResult = await liquidateFuturesPosition(pos.id, markPrice);
        const fee = liqResult.loss * LIQUIDATION_FEE;
        realLiqFees += fee;

        logger.info(
          { positionId: pos.id, symbol: pos.symbol, side: pos.side, markPrice, liqPrice, marginLost: liqResult.loss, fee: fee.toFixed(4) },
          "Futures profit engine: position liquidated",
        );
      }
    }

    const cycleIncome = realLiqFees;

    const prev    = parseFloat((await getSetting("bot_liquidation_profit")) ?? "0") || 0;
    const newTotal = prev + cycleIncome;

    await setSetting("bot_liquidation_profit",     newTotal.toFixed(6));
    await setSetting("bot_last_liquidation_income", cycleIncome.toFixed(6));
    await setSetting("bot_last_liquidation_at",     new Date().toISOString());
    await rebuildTotal();

  } catch (err) {
    logger.error({ err }, "Futures profit engine: liquidation cycle failed");
  }
}

/* ── Public start function ──────────────────────────────────────────────── */
const EIGHT_HOURS    = 8 * 60 * 60 * 1000;
const NINETY_SECONDS = 90 * 1000;

export function startFuturesProfitEngine(): void {
  logger.info("Futures profit engine starting — funding rates & liquidations active");

  // funding: first run deferred to guardedInterval (no immediate fire) so
  // boot-time pool pressure from all other services has subsided first.
  guardedInterval("futures-funding", runFundingCycle, EIGHT_HOURS, {
    timeoutMs:      EIGHT_HOURS - 60_000,
    initialDelayMs: 0,
  });

  // liquidations: run every 90 s (raised from 60 s) to reduce overlap with
  // the liquidity bot (120 s cycle) and other workers — they will now
  // coincide only once every ~360 s instead of every 60 s.
  // First run is deferred by one full interval so the process is fully up
  // before touching the pool.
  guardedInterval("futures-liquidation", runLiquidationCycle, NINETY_SECONDS, {
    timeoutMs:      80_000,
    initialDelayMs: NINETY_SECONDS,
  });
}
