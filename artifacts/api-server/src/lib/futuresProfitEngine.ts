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

import { pool, db, withDbRetry } from "@workspace/db";
import { futuresPositionsTable, marketsTable, platformSettingsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { guardedInterval, withRetry } from "./selfHealing.js";
import { liquidateFuturesPosition } from "./futuresSettlement.js";
import { isDbConnError } from "./dbErrors.js";
import { parseUnits, formatUnits, mulDiv, mulPriceQty, pow10 } from "./money.js";

const PRICE_DECIMALS = 8;
const QTY_DECIMALS = 8;
const MONEY_DECIMALS = 18;

function toMoneyRaw(value: string | number): bigint {
  return parseUnits(String(value), MONEY_DECIMALS);
}
function toPriceRaw(value: string | number): bigint {
  return parseUnits(String(value), PRICE_DECIMALS);
}
function toQtyRaw(value: string | number): bigint {
  return parseUnits(String(value), QTY_DECIMALS);
}
function toFeeFractionRaw(value: string | number): bigint {
  return parseUnits(String(value), MONEY_DECIMALS);
}
function moneyUnit(): bigint {
  return pow10(MONEY_DECIMALS);
}
function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/* ── shared helpers ─────────────────────────────────────────────────────── */

async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await withDbRetry(() =>
      db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key))
    );
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function setSetting(key: string, value: string) {
  await withDbRetry(() =>
    db.insert(platformSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } })
  );
}

async function rebuildTotal() {
  const spreadRaw  = toMoneyRaw((await getSetting("bot_spread_profit"))      ?? "0");
  const fundingRaw = toMoneyRaw((await getSetting("bot_funding_profit"))     ?? "0");
  const liquidRaw  = toMoneyRaw((await getSetting("bot_liquidation_profit")) ?? "0");
  await setSetting("bot_cumulative_profit", formatUnits(spreadRaw + fundingRaw + liquidRaw, MONEY_DECIMALS));
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
    const positions = await withDbRetry(() =>
      db.select().from(futuresPositionsTable)
        .where(eq(futuresPositionsTable.status, "open"))
    );

    let cycleIncomeRaw = 0n;  // total platform revenue this cycle
    let appliedCount   = 0;   // positions that actually paid
    let underfundedCnt = 0;   // positions whose locked margin couldn't cover full payment

    /* For each open position, debit the funding payment from the user's
     * locked margin and record it on the position's fundingFee field.
     * Positive funding rate = longs pay; negative = shorts pay. The full
     * payment is collected by the platform (counterparty / insurance fund). */
    for (const pos of positions) {
      const rateRaw = toFeeFractionRaw(FUNDING_MAP[pos.symbol] ?? DEFAULT_FUNDING);
      const markRaw = (() => {
        try { return toPriceRaw(pos.markPrice); } catch { return toPriceRaw(pos.entryPrice); }
      })();
      const qtyRaw = toQtyRaw(pos.quantity);
      if (markRaw <= 0n || qtyRaw <= 0n || rateRaw === 0n) continue;

      const notionalRaw = mulPriceQty({
        priceRaw: markRaw,
        priceDecimals: PRICE_DECIMALS,
        quantityRaw: qtyRaw,
        quantityDecimals: QTY_DECIMALS,
        outputDecimals: MONEY_DECIMALS,
        rounding: "floor",
      });
      const paymentRaw = mulDiv(notionalRaw, rateRaw, moneyUnit(), "floor");
      const signedPaymentRaw = pos.side === "long" ? paymentRaw : -paymentRaw;
      if (signedPaymentRaw <= 0n) {
        // User is a funding receiver. Credit their locked margin (80% of the
        // owed amount — platform keeps its 20% cut both on pay and receive).
        // This replaces the previous model where receivers got nothing.
        const creditRaw = mulDiv(
          absBigInt(signedPaymentRaw),
          moneyUnit() - toFeeFractionRaw(PLATFORM_CUT),
          moneyUnit(),
          "floor",
        );
        if (creditRaw > 0n) {
          const creditSql = formatUnits(creditRaw, MONEY_DECIMALS);
          const rcvClient = await withRetry(() => pool.connect(), { maxAttempts: 2, baseDelayMs: 500 });
          try {
            await rcvClient.query("BEGIN");
            await rcvClient.query(
              `UPDATE futures_margin_accounts
               SET locked = locked + $1, updated_at = now()
               WHERE wallet_address = $2 AND asset = 'USDT'`,
              [creditSql, pos.walletAddress],
            );
            await rcvClient.query(
              `UPDATE futures_positions
               SET funding_fee = (COALESCE(funding_fee::numeric, 0) - $1)::text,
                   margin      = (margin::numeric + $1)::text
               WHERE id = $2 AND status = 'open'`,
              [creditSql, pos.id],
            );
            await rcvClient.query("COMMIT");
            cycleIncomeRaw -= creditRaw; // platform paid out from its cut
          } catch (rcvErr) {
            await rcvClient.query("ROLLBACK").catch(() => {});
            logger.warn({ err: rcvErr, positionId: pos.id }, "Funding credit to receiver failed");
          } finally {
            rcvClient.release();
          }
        }
        continue;
      }

      // Atomically debit from locked margin (capped to what's available so a
      // funding payment can never push margin below zero — that would be the
      // job of the liquidation engine on the next tick).
      const client = await withRetry(() => pool.connect(), { maxAttempts: 2, baseDelayMs: 1_000 });
      try {
        await client.query("BEGIN");

        const { rows } = await client.query<{ locked: string }>(
          `SELECT locked FROM futures_margin_accounts
           WHERE wallet_address = $1 AND asset = 'USDT' FOR UPDATE`,
          [pos.walletAddress],
        );
        const lockedRaw = toMoneyRaw(rows[0]?.locked ?? "0");
        const chargedRaw = paymentRaw < lockedRaw ? paymentRaw : lockedRaw;
        if (chargedRaw < paymentRaw) underfundedCnt++;

        if (chargedRaw > 0n) {
          const chargedSql = formatUnits(chargedRaw, MONEY_DECIMALS);
          await client.query(
            `UPDATE futures_margin_accounts
             SET locked = locked - $1, updated_at = now()
             WHERE wallet_address = $2 AND asset = 'USDT'`,
            [chargedSql, pos.walletAddress],
          );
          await client.query(
            `UPDATE futures_positions
             SET funding_fee = (COALESCE(funding_fee::numeric, 0) + $1)::text,
                 margin      = GREATEST((margin::numeric - $1), 0)::text
             WHERE id = $2 AND status = 'open'`,
            [chargedSql, pos.id],
          );
          cycleIncomeRaw += chargedRaw;
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

    const prevRaw = toMoneyRaw((await getSetting("bot_funding_profit")) ?? "0");
    const newTotalRaw = prevRaw + cycleIncomeRaw;

    await setSetting("bot_funding_profit",     formatUnits(newTotalRaw, MONEY_DECIMALS));
    await setSetting("bot_last_funding_income", formatUnits(cycleIncomeRaw, MONEY_DECIMALS));
    await setSetting("bot_last_funding_at",     new Date().toISOString());
    await rebuildTotal();

    logger.info(
      { positions: positions.length, applied: appliedCount, underfunded: underfundedCnt,
        cycleIncome: formatUnits(cycleIncomeRaw, MONEY_DECIMALS),
        cumulative: formatUnits(newTotalRaw, MONEY_DECIMALS) },
      "Futures profit engine: funding cycle complete",
    );
  } catch (err) {
    if (isDbConnError(err)) logger.warn("Futures profit engine: funding cycle skipped — DB unavailable");
    else logger.error({ err }, "Futures profit engine: funding cycle failed");
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   LIQUIDATION ENGINE — every 60 seconds
   ══════════════════════════════════════════════════════════════════════════ */

async function runLiquidationCycle(): Promise<void> {
  try {
    // Exclude LE markets (36K rows) — only spot/perp prices needed for position mark-to-market.
    const markets   = await withDbRetry(() =>
      db.select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice })
        .from(marketsTable)
        .where(inArray(marketsTable.type, ["spot", "futures"]))
    );
    const positions = await withDbRetry(() =>
      db.select().from(futuresPositionsTable)
        .where(eq(futuresPositionsTable.status, "open"))
    );

    /* build a price map from live market data */
    const priceMapRaw: Record<string, bigint> = {};
    for (const m of markets) {
      try {
        priceMapRaw[m.symbol] = toPriceRaw(m.lastPrice ?? "0");
      } catch {
        // skip malformed market prices
      }
    }

    /* --- update mark prices and unrealized PnL for all open positions --- */
    for (const pos of positions) {
      const baseSym = pos.symbol.replace("-PERP", "");
      const markRaw = priceMapRaw[baseSym] ?? priceMapRaw[pos.symbol] ?? (() => {
        try { return toPriceRaw(pos.markPrice); } catch { return 0n; }
      })();
      if (markRaw <= 0n) continue;

      const entryRaw = (() => { try { return toPriceRaw(pos.entryPrice); } catch { return 0n; } })();
      const qtyRaw = (() => { try { return toQtyRaw(pos.quantity); } catch { return 0n; } })();
      const marginRaw = (() => { try { return toMoneyRaw(pos.margin); } catch { return 1n; } })();
      if (entryRaw <= 0n || qtyRaw <= 0n || marginRaw <= 0n) continue;

      const priceDiffRaw = markRaw - entryRaw;
      const absPnlRaw = mulPriceQty({
        priceRaw: absBigInt(priceDiffRaw),
        priceDecimals: PRICE_DECIMALS,
        quantityRaw: qtyRaw,
        quantityDecimals: QTY_DECIMALS,
        outputDecimals: MONEY_DECIMALS,
        rounding: "floor",
      });
      const upnlRaw = pos.side === "long" ? absPnlRaw : -absPnlRaw;
      const upnlPct = (Number(formatUnits(upnlRaw, MONEY_DECIMALS)) / Number(formatUnits(marginRaw, MONEY_DECIMALS))) * 100;
      try {
        await withRetry(() => pool.query(
          `UPDATE futures_positions
           SET mark_price            = $1,
               unrealized_pnl        = $2,
               unrealized_pnl_percent = $3
           WHERE id = $4 AND status = 'open'`,
          [formatUnits(markRaw, PRICE_DECIMALS), formatUnits(upnlRaw, MONEY_DECIMALS), upnlPct.toFixed(4), pos.id],
        ), { maxAttempts: 2, baseDelayMs: 500 });
      } catch { /* non-fatal */ }
    }

    /* --- check and liquidate real positions --- */
    let realLiqFeesRaw = 0n;
    for (const pos of positions) {
      const baseSym = pos.symbol.replace("-PERP", "");
      const markRaw = priceMapRaw[baseSym] ?? priceMapRaw[pos.symbol] ?? (() => {
        try { return toPriceRaw(pos.markPrice); } catch { return 0n; }
      })();
      const liqRaw = (() => { try { return toPriceRaw(pos.liquidationPrice); } catch { return 0n; } })();
      if (markRaw <= 0n || liqRaw <= 0n) continue;

      const isLiquidated =
        (pos.side === "long"  && markRaw <= liqRaw) ||
        (pos.side === "short" && markRaw >= liqRaw);

      if (isLiquidated) {
        /* Delegate to the canonical liquidation function which:
         *   - confiscates (removes) the locked margin from futures_margin_accounts
         *   - marks the position row as "liquidated" with optimistic concurrency check
         * This replaces the previous raw DB update that left margin stranded. */
        const liqResult = await liquidateFuturesPosition(pos.id, formatUnits(markRaw, PRICE_DECIMALS));
        const feeRaw = mulDiv(toMoneyRaw(liqResult.loss), toFeeFractionRaw(LIQUIDATION_FEE), moneyUnit(), "floor");
        realLiqFeesRaw += feeRaw;

        logger.info(
          {
            positionId: pos.id,
            symbol: pos.symbol,
            side: pos.side,
            markPrice: formatUnits(markRaw, PRICE_DECIMALS),
            liqPrice: formatUnits(liqRaw, PRICE_DECIMALS),
            marginLost: liqResult.loss,
            fee: formatUnits(feeRaw, MONEY_DECIMALS),
          },
          "Futures profit engine: position liquidated",
        );
      }
    }

    const cycleIncomeRaw = realLiqFeesRaw;

    const prevRaw = toMoneyRaw((await getSetting("bot_liquidation_profit")) ?? "0");
    const newTotalRaw = prevRaw + cycleIncomeRaw;

    await setSetting("bot_liquidation_profit",     formatUnits(newTotalRaw, MONEY_DECIMALS));
    await setSetting("bot_last_liquidation_income", formatUnits(cycleIncomeRaw, MONEY_DECIMALS));
    await setSetting("bot_last_liquidation_at",     new Date().toISOString());
    await rebuildTotal();

  } catch (err) {
    if (isDbConnError(err)) logger.warn("Futures profit engine: liquidation cycle skipped — DB unavailable");
    else logger.error({ err }, "Futures profit engine: liquidation cycle failed");
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
