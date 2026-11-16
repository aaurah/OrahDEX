import { pool } from "@workspace/db";
import { BOT_ADDRESS } from "./liquidityBot.js";
import { logger } from "./logger.js";
import { invalidateCandlesForOrderbookUpdate } from "./candleFetcher.js";

type BookLevel = [number, number];

const SAMPLE_MIN_INTERVAL_MS = 10_000;
const RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const lastSampledAt = new Map<string, number>();

let lastCleanupAt = 0;

function bestQuotePrice(bids: BookLevel[], asks: BookLevel[]): number {
  const bid = Number(bids[0]?.[0] ?? 0);
  const ask = Number(asks[0]?.[0] ?? 0);
  if (bid > 0 && ask > 0) {
    if (bid > ask) return 0;
    return (bid + ask) / 2;
  }
  return bid > 0 ? bid : ask;
}

function trimSamplingState(now: number) {
  if (lastSampledAt.size <= 5_000) return;
  for (const [symbol, timestamp] of lastSampledAt) {
    if (now - timestamp > CLEANUP_INTERVAL_MS) lastSampledAt.delete(symbol);
  }
}

async function removeExpiredQuoteCandles(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  const cutoffSec = Math.floor((now - RETENTION_DAYS * CLEANUP_INTERVAL_MS) / 60_000) * 60;
  await pool.query(
    "DELETE FROM orderbook_quote_candles WHERE bucket_sec < $1",
    [cutoffSec],
  );
  lastCleanupAt = now;
}

async function saveQuotePrice(symbol: string, price: number, now: number): Promise<void> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol || !Number.isFinite(price) || price <= 0) return;
  if (now - (lastSampledAt.get(normalizedSymbol) ?? 0) < SAMPLE_MIN_INTERVAL_MS) return;

  lastSampledAt.set(normalizedSymbol, now);
  trimSamplingState(now);
  const bucketSec = Math.floor(now / 60_000) * 60;
  await pool.query(
    `INSERT INTO orderbook_quote_candles
       (symbol, bucket_sec, open, high, low, close, sample_count, updated_at)
     VALUES ($1, $2, $3, $3, $3, $3, 1, NOW())
     ON CONFLICT (symbol, bucket_sec) DO UPDATE SET
       high = GREATEST(orderbook_quote_candles.high, EXCLUDED.high),
       low = LEAST(orderbook_quote_candles.low, EXCLUDED.low),
       close = EXCLUDED.close,
       sample_count = orderbook_quote_candles.sample_count + 1,
       updated_at = NOW()`,
    [normalizedSymbol, bucketSec, price.toString()],
  );
  invalidateCandlesForOrderbookUpdate(normalizedSymbol);
  try {
    await removeExpiredQuoteCandles(now);
  } catch (error) {
    logger.warn({ err: error }, "Order-book candle retention cleanup failed");
  }
}

/**
 * Persist a midpoint from verified, escrow-backed OrahDEX order-book depth.
 * One-minute OHLC values are quote observations, not executed trades, so
 * volume is intentionally zero when the chart engine reads them.
 */
export async function recordOrderbookQuoteCandle(
  symbol: string,
  bids: BookLevel[],
  asks: BookLevel[],
): Promise<boolean> {
  const now = Date.now();
  const price = bestQuotePrice(bids, asks);
  if (!Number.isFinite(price) || price <= 0) return false;

  const before = lastSampledAt.get(symbol.trim().toUpperCase()) ?? 0;
  await saveQuotePrice(symbol, price, now);
  if (now - before < SAMPLE_MIN_INTERVAL_MS) return false;
  return true;
}

export function midpointFromOrderbook(bids: BookLevel[], asks: BookLevel[]): number {
  return bestQuotePrice(bids, asks);
}

/**
 * Periodically sample every active, wallet-funded order book so history grows
 * even when nobody currently has that market page open.
 */
export function startOrderbookCandleSampler(): void {
  let running = false;
  const sample = async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      const bucketSec = Math.floor(now / 60_000) * 60;
      const result = await pool.query<{ symbol: string }>(
        `WITH active_book AS (
           SELECT symbol,
             MAX(price) FILTER (WHERE side = 'buy') AS best_bid,
             MIN(price) FILTER (WHERE side = 'sell') AS best_ask
           FROM orders
           WHERE status = 'open'
             AND type = 'limit'
             AND remaining_quantity::numeric > 0
             AND (
               funding_ref LIKE 'ledger:%'
               OR funding_ref LIKE 'evm-order:1:%'
             )
             AND LOWER(wallet_address) <> LOWER($2)
           GROUP BY symbol
         ),
         marks AS (
           SELECT symbol,
             CASE
               WHEN best_bid > 0 AND best_ask > 0 AND best_bid <= best_ask
                 THEN (best_bid + best_ask) / 2
               WHEN best_bid > 0 AND (best_ask IS NULL OR best_ask <= 0) THEN best_bid
               WHEN best_ask > 0 AND (best_bid IS NULL OR best_bid <= 0) THEN best_ask
               ELSE NULL
             END AS price
           FROM active_book
         )
         INSERT INTO orderbook_quote_candles
           (symbol, bucket_sec, open, high, low, close, sample_count, updated_at)
         SELECT symbol, $1, price, price, price, price, 1, NOW()
         FROM marks
         WHERE price IS NOT NULL AND price > 0
         ON CONFLICT (symbol, bucket_sec) DO UPDATE SET
           high = GREATEST(orderbook_quote_candles.high, EXCLUDED.high),
           low = LEAST(orderbook_quote_candles.low, EXCLUDED.low),
           close = EXCLUDED.close,
           sample_count = orderbook_quote_candles.sample_count + 1,
           updated_at = NOW()
         RETURNING symbol`,
        [bucketSec, BOT_ADDRESS],
      );
      for (const row of result.rows) invalidateCandlesForOrderbookUpdate(row.symbol);
      if (result.rows.length) {
        logger.debug({ markets: result.rows.length }, "Recorded escrow order-book quote candles");
      }
      try {
        await removeExpiredQuoteCandles(now);
      } catch (error) {
        logger.warn({ err: error }, "Order-book candle retention cleanup failed");
      }
    } catch (error) {
      logger.warn({ err: error }, "Order-book quote sampler cycle failed");
    } finally {
      running = false;
    }
  };

  void sample();
  const timer = setInterval(() => void sample(), 60_000);
  timer.unref();
  logger.info({ intervalMs: 60_000 }, "Order-book candle sampler started");
}
