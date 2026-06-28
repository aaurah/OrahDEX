import { db, pool, withDbRetry } from "@workspace/db";
import { futuresPositionsTable, marketsTable, fundingRatesTable, fundingPaymentsTable } from "@workspace/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "./logger.js";
import { guardedInterval } from "./selfHealing.js";
import { liquidateFuturesPosition } from "./futuresSettlement.js";

const INTEREST_RATE_PER_8H = 0.0001 / 8;       // 0.01% / 8 intervals = 0.00125% per interval
const MAX_FUNDING_RATE     = 0.0075;             // 0.75%
const MIN_FUNDING_RATE     = -0.0075;            // -0.75%
const MAINTENANCE_MARGIN   = 0.05;               // 5% of position value
const FUNDING_INTERVAL_MS  = 8 * 60 * 60 * 1000; // 8 hours in ms

const PERP_SYMBOLS = [
  "BSV/USDT", "BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT",
  "BNB/USDT", "ADA/USDT", "DOGE/USDT", "DOT/USDT", "AVAX/USDT",
  "MATIC/USDT", "LINK/USDT", "ARB/USDT", "OP/USDT", "SUI/USDT",
  "INJ/USDT", "NEAR/USDT", "APT/USDT",
];

// Track the last settlement time per symbol (in-process, non-persistent)
const lastSettledAt: Record<string, number> = {};

export function calculateFundingRate(
  symbol: string,
  markPrice: number,
  indexPrice: number,
): number {
  if (indexPrice <= 0) return 0;
  const premium = (markPrice - indexPrice) / indexPrice;
  const rate    = premium / 8 + INTEREST_RATE_PER_8H;
  return Math.max(MIN_FUNDING_RATE, Math.min(MAX_FUNDING_RATE, rate));
}

export async function updateFundingRate(
  symbol: string,
  markPrice: number,
  indexPrice: number,
): Promise<void> {
  const rate         = calculateFundingRate(symbol, markPrice, indexPrice);
  const premium      = indexPrice > 0 ? (markPrice - indexPrice) / indexPrice : 0;
  const nextFundingAt = new Date(Date.now() + FUNDING_INTERVAL_MS);

  await withDbRetry(() =>
    db.insert(fundingRatesTable).values({
      id:            crypto.randomUUID(),
      symbol,
      rate:          rate.toFixed(10),
      markPrice:     markPrice.toFixed(8),
      indexPrice:    indexPrice.toFixed(8),
      premium:       premium.toFixed(10),
      nextFundingAt,
    })
  );
}

export async function settleFundingPayments(symbol: string): Promise<void> {
  const [latestRate] = await withDbRetry(() =>
    db.select()
      .from(fundingRatesTable)
      .where(eq(fundingRatesTable.symbol, symbol))
      .orderBy(desc(fundingRatesTable.createdAt))
      .limit(1)
  );

  if (!latestRate) {
    logger.warn({ symbol }, "No funding rate found for symbol, skipping settlement");
    return;
  }

  const rate     = parseFloat(latestRate.rate);
  const markPrice = parseFloat(latestRate.markPrice);

  const positions = await withDbRetry(() =>
    db.select()
      .from(futuresPositionsTable)
      .where(
        and(
          eq(futuresPositionsTable.symbol, `${symbol}-PERP`),
          eq(futuresPositionsTable.status, "open"),
        ),
      )
  );

  if (positions.length === 0) return;

  // Acquire a pool client with retry — pool.connect() itself can timeout under load
  const client = await withDbRetry(() => pool.connect());
  try {
    await client.query("BEGIN");

    for (const pos of positions) {
      const quantity      = parseFloat(pos.quantity);
      const posValue      = quantity * markPrice;
      const absPayment    = posValue * Math.abs(rate);

      // rate > 0: longs pay shorts; rate < 0: shorts pay longs
      const isLong        = pos.side === "long";
      const pays          = (rate > 0 && isLong) || (rate < 0 && !isLong);
      const payment       = pays ? absPayment : -absPayment; // positive = deducted from margin

      const direction: "paid" | "received" = pays ? "paid" : "received";

      // Deduct from margin (or add for receiving side)
      await client.query(
        `UPDATE futures_positions
         SET margin       = margin - $1,
             funding_fee  = funding_fee + $2
         WHERE id = $3`,
        [payment.toFixed(8), absPayment.toFixed(8), pos.id],
      );

      await client.query(
        `INSERT INTO funding_payments (id, wallet_address, position_id, symbol, funding_rate, position_size, payment, direction, settled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          crypto.randomUUID(),
          pos.walletAddress,
          pos.id,
          symbol,
          rate.toFixed(10),
          posValue.toFixed(8),
          absPayment.toFixed(8),
          direction,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err, symbol }, "Funding settlement transaction failed");
    throw err;
  } finally {
    client.release();
  }

  // Post-settlement: check for under-margined positions and liquidate
  const updatedPositions = await withDbRetry(() =>
    db.select()
      .from(futuresPositionsTable)
      .where(
        and(
          eq(futuresPositionsTable.symbol, `${symbol}-PERP`),
          eq(futuresPositionsTable.status, "open"),
        ),
      )
  );

  for (const pos of updatedPositions) {
    const margin         = parseFloat(pos.margin);
    const quantity       = parseFloat(pos.quantity);
    const maintenanceReq = quantity * markPrice * MAINTENANCE_MARGIN;

    if (margin < maintenanceReq) {
      logger.warn(
        { positionId: pos.id, walletAddress: pos.walletAddress, margin, maintenanceReq },
        "Position below maintenance margin after funding — triggering liquidation",
      );
      try {
        await liquidateFuturesPosition(pos.id, markPrice);
      } catch (err) {
        logger.error({ err, positionId: pos.id }, "Liquidation failed during funding settlement");
      }
    }
  }
}

export function startFundingRateEngine(): void {
  const TICK_INTERVAL_MS = 60_000; // 1 minute

  const run = async () => {
    // Only fetch the 18 PERP symbols we actually need — not all 36K markets rows.
    const markets = await withDbRetry(() =>
      db.select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice })
        .from(marketsTable)
        .where(inArray(marketsTable.symbol, PERP_SYMBOLS))
    );
    const priceMap: Record<string, number> = {};
    for (const m of markets) {
      priceMap[m.symbol] = parseFloat(m.lastPrice) || 0;
    }

    const now = Date.now();

    for (const symbol of PERP_SYMBOLS) {
      const basePrice = priceMap[symbol] ?? 0;
      if (basePrice <= 0) continue;

      // Apply ±5% noise to the mark price to create funding rate variance
      const noise      = 1 + (Math.random() - 0.5) * 0.05;
      const markPrice  = basePrice * noise;
      const indexPrice = basePrice; // simplified — production would use spot oracle

      try {
        await updateFundingRate(symbol, markPrice, indexPrice);
      } catch (err) {
        logger.error({ err, symbol }, "Failed to update funding rate");
      }

      // Settle every 8h: check if it has been at least 8h since last settlement
      const lastSettled = lastSettledAt[symbol] ?? 0;
      if (now - lastSettled >= FUNDING_INTERVAL_MS) {
        lastSettledAt[symbol] = now;
        try {
          await settleFundingPayments(symbol);
          logger.info({ symbol }, "Funding payments settled");
        } catch (err) {
          logger.error({ err, symbol }, "Failed to settle funding payments");
        }
      }
    }
  };

  // guardedInterval replaces raw setInterval — handles stuck ticks and backs off on failures
  guardedInterval("funding-rate-engine", run, TICK_INTERVAL_MS, {
    timeoutMs:      55_000,
    initialDelayMs: 0,
  });

  logger.info("Funding rate engine started");
}
