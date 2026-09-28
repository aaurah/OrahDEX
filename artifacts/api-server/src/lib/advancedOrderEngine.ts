import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { randomUUID } from "node:crypto";
import { isDbConnError } from "./dbErrors.js";
import { guardedInterval, withRetry } from "./selfHealing.js";
import { assertEngineChildOrderAuthorized } from "./engineChildOrderInvariant.js";
import { parseUnits, formatUnits, mulDiv, mulPriceQty, pow10 } from "./money.js";

const LEDGER_DECIMALS = 18;
const UNIT = pow10(LEDGER_DECIMALS);

interface EngineDbClient {
  query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount?: number | null }>;
  release(): void;
}

async function runTrailingStopEngine(): Promise<void> {
  let client: EngineDbClient | null = null;
  try {
    client = (await withRetry(() => pool.connect(), { maxAttempts: 2, baseDelayMs: 500 })) as unknown as EngineDbClient;
  } catch (err) {
    logger.warn({ err }, "Trailing stop engine: DB connect failed, skipping cycle");
    return;
  }
  if (!client) return;
  try {
    const { rows: activeStops } = await client.query<{
      id: string;
      wallet_address: string;
      symbol: string;
      side: string;
      quantity: string;
      trail_percent: string;
      activation_price: string | null;
      current_stop_price: string;
      high_watermark: string;
      low_watermark: string;
      status: string;
      network_type: string | null;
      chain_id: number | null;
    }>(
      `SELECT * FROM trailing_stop_orders WHERE status IN ('active', 'pending')`
    );

    for (const stop of activeStops) {
      try {
        const { rows: marketRows } = await client.query<{ mark_price: string }>(
          `SELECT mark_price FROM markets WHERE symbol = $1 LIMIT 1`,
          [stop.symbol]
        );
        if (!marketRows[0]?.mark_price) continue;

        const currentPriceRaw = parseUnits(marketRows[0].mark_price, LEDGER_DECIMALS);
        const trailPercentRaw = parseUnits(stop.trail_percent, LEDGER_DECIMALS);
        const trailFractionRaw = trailPercentRaw / 100n;
        const highWatermarkRaw = parseUnits(stop.high_watermark, LEDGER_DECIMALS);
        const lowWatermarkRaw = parseUnits(stop.low_watermark, LEDGER_DECIMALS);
        const currentStopPriceRaw = parseUnits(stop.current_stop_price, LEDGER_DECIMALS);

        if (stop.status === "pending" && stop.activation_price !== null) {
          const activationPriceRaw = parseUnits(stop.activation_price, LEDGER_DECIMALS);
          const activated =
            stop.side === "sell"
              ? currentPriceRaw >= activationPriceRaw
              : currentPriceRaw <= activationPriceRaw;
          if (!activated) continue;

          await client.query(
            `UPDATE trailing_stop_orders SET status = 'active', updated_at = NOW() WHERE id = $1`,
            [stop.id]
          );
          stop.status = "active";
        }

        let newHighRaw = highWatermarkRaw;
        let newLowRaw = lowWatermarkRaw;
        let newStopPriceRaw = currentStopPriceRaw;

        if (stop.side === "sell") {
          if (currentPriceRaw > newHighRaw) {
            newHighRaw = currentPriceRaw;
            const trailDistanceRaw = mulDiv(newHighRaw, trailFractionRaw, UNIT, "floor");
            newStopPriceRaw = newHighRaw - trailDistanceRaw;
          }
          if (currentPriceRaw <= newStopPriceRaw) {
            assertEngineChildOrderAuthorized({
                id: stop.id,
                walletAddress: stop.wallet_address,
                authorizationRef: (stop as any).parent_authorization_ref ?? null,
                fundingRef: (stop as any).funding_ref ?? null,
              });
              const orderId = randomUUID();
            // Wrap INSERT + UPDATE atomically so a crash between the two can't
            // spawn duplicate market orders from a single trailing stop trigger.
            await client.query("BEGIN");
            try {
              await client.query(
                `INSERT INTO orders (id, symbol, wallet_address, network_type, side, type, status, quantity, filled_quantity, remaining_quantity, fee, is_bot, is_synthetic, parent_order_id, funding_ref, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, 'market', 'open', $6, '0', $6, '0', false, false, $7, $8, NOW(), NOW())`,
                [orderId, stop.symbol, stop.wallet_address, stop.network_type ?? "evm", "sell", stop.quantity, stop.id, (stop as any).funding_ref ?? null]
              );
              await client.query(
                `UPDATE trailing_stop_orders SET status = 'triggered', triggered_order_id = $1, updated_at = NOW() WHERE id = $2`,
                [orderId, stop.id]
              );
              await client.query("COMMIT");
            } catch (triggerErr) {
              await client.query("ROLLBACK").catch(() => {});
              logger.error({ err: triggerErr, stopId: stop.id }, "Trailing stop sell-trigger transaction failed");
              continue;
            }
            logger.info({ stopId: stop.id, orderId, symbol: stop.symbol }, "Trailing stop triggered (sell)");
            continue;
          }
        } else {
          if (currentPriceRaw < newLowRaw) {
            newLowRaw = currentPriceRaw;
            const trailDistanceRaw = mulDiv(newLowRaw, trailFractionRaw, UNIT, "floor");
            newStopPriceRaw = newLowRaw + trailDistanceRaw;
          }
          if (currentPriceRaw >= newStopPriceRaw) {
            assertEngineChildOrderAuthorized({
                id: stop.id,
                walletAddress: stop.wallet_address,
                authorizationRef: (stop as any).parent_authorization_ref ?? null,
                fundingRef: (stop as any).funding_ref ?? null,
              });
              const orderId = randomUUID();
            // Atomic: INSERT order + UPDATE stop status in one transaction
            await client.query("BEGIN");
            try {
              await client.query(
                `INSERT INTO orders (id, symbol, wallet_address, network_type, side, type, status, quantity, filled_quantity, remaining_quantity, fee, is_bot, is_synthetic, parent_order_id, funding_ref, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, 'market', 'open', $6, '0', $6, '0', false, false, $7, $8, NOW(), NOW())`,
                [orderId, stop.symbol, stop.wallet_address, stop.network_type ?? "evm", "buy", stop.quantity, stop.id, (stop as any).funding_ref ?? null]
              );
              await client.query(
                `UPDATE trailing_stop_orders SET status = 'triggered', triggered_order_id = $1, updated_at = NOW() WHERE id = $2`,
                [orderId, stop.id]
              );
              await client.query("COMMIT");
            } catch (triggerErr) {
              await client.query("ROLLBACK").catch(() => {});
              logger.error({ err: triggerErr, stopId: stop.id }, "Trailing stop buy-trigger transaction failed");
              continue;
            }
            logger.info({ stopId: stop.id, orderId, symbol: stop.symbol }, "Trailing stop triggered (buy)");
            continue;
          }
        }

        await client.query(
          `UPDATE trailing_stop_orders
           SET high_watermark = $1, low_watermark = $2, current_stop_price = $3, updated_at = NOW()
           WHERE id = $4`,
          [
            formatUnits(newHighRaw, LEDGER_DECIMALS),
            formatUnits(newLowRaw, LEDGER_DECIMALS),
            formatUnits(newStopPriceRaw, LEDGER_DECIMALS),
            stop.id,
          ]
        );
      } catch (err) {
        if (isDbConnError(err)) logger.warn({ stopId: stop.id }, "Trailing stop: DB unavailable, skipping order");
        else logger.error({ err, stopId: stop.id }, "Error processing trailing stop");
      }
    }
  } catch (err) {
    if (isDbConnError(err)) logger.warn({ err }, "runTrailingStopEngine: DB error, skipping cycle");
    else logger.error({ err }, "runTrailingStopEngine error");
  } finally {
    client?.release();
  }
}

async function runIcebergEngine(): Promise<void> {
  let client: EngineDbClient | null = null;
  try {
    client = (await withRetry(() => pool.connect(), { maxAttempts: 2, baseDelayMs: 500 })) as unknown as EngineDbClient;
  } catch (err) {
    logger.warn({ err }, "Iceberg engine: DB connect failed, skipping cycle");
    return;
  }
  if (!client) return;
  try {
    const { rows: icebergs } = await client.query<{
      id: string;
      wallet_address: string;
      symbol: string;
      side: string;
      price: string;
      total_quantity: string;
      filled_quantity: string;
      visible_quantity: string;
      active_order_id: string | null;
      status: string;
      network_type: string | null;
      chain_id: number | null;
    }>(
      `SELECT * FROM iceberg_orders WHERE status = 'active'`
    );

    for (const iceberg of icebergs) {
      try {
        const totalQtyRaw = parseUnits(iceberg.total_quantity, LEDGER_DECIMALS);
        let filledQtyRaw = parseUnits(iceberg.filled_quantity, LEDGER_DECIMALS);
        const visibleQtyRaw = parseUnits(iceberg.visible_quantity, LEDGER_DECIMALS);

        if (filledQtyRaw >= totalQtyRaw) {
          await client.query(
            `UPDATE iceberg_orders SET status = 'completed' WHERE id = $1`,
            [iceberg.id]
          );
          continue;
        }

        if (iceberg.active_order_id !== null) {
          const { rows: orderRows } = await client.query<{ status: string; filled_quantity: string }>(
            `SELECT status, filled_quantity FROM orders WHERE id = $1`,
            [iceberg.active_order_id]
          );
          const activeOrder = orderRows[0];
          if (!activeOrder) {
            await client.query(
              `UPDATE iceberg_orders SET active_order_id = NULL WHERE id = $1`,
              [iceberg.id]
            );
          } else if (activeOrder.status !== "filled") {
            continue;
          } else {
            filledQtyRaw += parseUnits(activeOrder.filled_quantity, LEDGER_DECIMALS);
            await client.query(
              `UPDATE iceberg_orders SET filled_quantity = $1, active_order_id = NULL WHERE id = $2`,
              [formatUnits(filledQtyRaw, LEDGER_DECIMALS), iceberg.id]
            );
            if (filledQtyRaw >= totalQtyRaw) {
              await client.query(
                `UPDATE iceberg_orders SET status = 'completed' WHERE id = $1`,
                [iceberg.id]
              );
              continue;
            }
          }
        }

        const remainingRaw = totalQtyRaw - filledQtyRaw;
        const sliceQtyRaw = visibleQtyRaw < remainingRaw ? visibleQtyRaw : remainingRaw;
        assertEngineChildOrderAuthorized({
                id: iceberg.id,
                walletAddress: iceberg.wallet_address,
                authorizationRef: (iceberg as any).parent_authorization_ref ?? null,
                fundingRef: (iceberg as any).funding_ref ?? null,
              });
              const orderId = randomUUID();

        await client.query(
          `INSERT INTO orders (id, symbol, wallet_address, network_type, side, type, status, price, quantity, filled_quantity, remaining_quantity, fee, is_bot, is_synthetic, parent_order_id, funding_ref, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'limit', 'open', $6, $7, '0', $7, '0', false, false, $8, $9, NOW(), NOW())`,
          [
            orderId,
            iceberg.symbol,
            iceberg.wallet_address,
            iceberg.network_type ?? "evm",
            iceberg.side,
            iceberg.price,
            formatUnits(sliceQtyRaw, LEDGER_DECIMALS),
            iceberg.id,
            (iceberg as any).funding_ref ?? null,
          ]
        );

        await client.query(
          `UPDATE iceberg_orders SET active_order_id = $1 WHERE id = $2`,
          [orderId, iceberg.id]
        );

        logger.info(
          { icebergId: iceberg.id, orderId, sliceQty: formatUnits(sliceQtyRaw, LEDGER_DECIMALS) },
          "Iceberg slice placed",
        );
      } catch (err) {
        if (isDbConnError(err)) logger.warn({ icebergId: iceberg.id }, "Iceberg: DB unavailable, skipping order");
        else logger.error({ err, icebergId: iceberg.id }, "Error processing iceberg order");
      }
    }
  } catch (err) {
    if (isDbConnError(err)) logger.warn({ err }, "runIcebergEngine: DB error, skipping cycle");
    else logger.error({ err }, "runIcebergEngine error");
  } finally {
    client?.release();
  }
}

async function runTwapEngine(): Promise<void> {
  let client: EngineDbClient | null = null;
  try {
    client = (await withRetry(() => pool.connect(), { maxAttempts: 2, baseDelayMs: 500 })) as unknown as EngineDbClient;
  } catch (err) {
    logger.warn({ err }, "TWAP engine: DB connect failed, skipping cycle");
    return;
  }
  if (!client) return;
  try {
    const { rows: twaps } = await client.query<{
      id: string;
      wallet_address: string;
      symbol: string;
      side: string;
      total_quantity: string;
      filled_quantity: string;
      slices: number;
      completed_slices: number;
      interval_seconds: number;
      start_at: Date;
      end_at: Date;
      max_slippage_percent: string;
      average_fill_price: string | null;
      status: string;
      network_type: string | null;
      chain_id: number | null;
    }>(
      `SELECT * FROM twap_orders WHERE status = 'active' AND start_at <= NOW() AND end_at > NOW()`
    );

    for (const twap of twaps) {
      try {
        const startAt = twap.start_at.getTime();
        const elapsedSeconds = (Date.now() - startAt) / 1000;
        const expectedSlices = Math.floor(elapsedSeconds / twap.interval_seconds);
        const slicesToExecute = Math.min(expectedSlices, twap.slices) - twap.completed_slices;

        if (slicesToExecute <= 0) continue;

        const totalQtyRaw = parseUnits(twap.total_quantity, LEDGER_DECIMALS);
        const sliceQtyRaw = mulDiv(totalQtyRaw, 1n, BigInt(twap.slices), "floor");

        for (let i = 0; i < slicesToExecute; i++) {
          if (twap.completed_slices + i >= twap.slices) break;

          assertEngineChildOrderAuthorized({
                id: twap.id,
                walletAddress: twap.wallet_address,
                authorizationRef: (twap as any).parent_authorization_ref ?? null,
                fundingRef: (twap as any).funding_ref ?? null,
              });
              const orderId = randomUUID();
          await client.query(
            `INSERT INTO orders (id, symbol, wallet_address, network_type, side, type, status, quantity, filled_quantity, remaining_quantity, fee, is_bot, is_synthetic, parent_order_id, funding_ref, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'market', 'open', $6, '0', $6, '0', false, false, $7, $8, NOW(), NOW())`,
            [
              orderId,
              twap.symbol,
              twap.wallet_address,
              twap.network_type ?? "evm",
              twap.side,
              formatUnits(sliceQtyRaw, LEDGER_DECIMALS),
              twap.id,
              (twap as any).funding_ref ?? null,
            ]
          );

          logger.info(
            {
              twapId: twap.id,
              orderId,
              sliceQty: formatUnits(sliceQtyRaw, LEDGER_DECIMALS),
              slice: twap.completed_slices + i + 1,
            },
            "TWAP slice placed",
          );
        }

        const newCompletedSlices = Math.min(twap.completed_slices + slicesToExecute, twap.slices);
        const filledQtyRaw = parseUnits(twap.filled_quantity, LEDGER_DECIMALS);
        const newFilledQtyRaw = filledQtyRaw + sliceQtyRaw * BigInt(slicesToExecute);

        const { rows: marketRows } = await client.query<{ mark_price: string }>(
          `SELECT mark_price FROM markets WHERE symbol = $1 LIMIT 1`,
          [twap.symbol]
        );
        const markPrice = marketRows[0]?.mark_price ?? null;

        let newAvgFillPrice: string | null = twap.average_fill_price;
        if (markPrice !== null) {
          const markPriceRaw = parseUnits(markPrice, LEDGER_DECIMALS);
          const prevAvgRaw = twap.average_fill_price !== null
            ? parseUnits(twap.average_fill_price, LEDGER_DECIMALS)
            : markPriceRaw;
          const weightedRaw =
            prevAvgRaw * BigInt(twap.completed_slices) +
            markPriceRaw * BigInt(slicesToExecute);
          newAvgFillPrice = formatUnits(
            mulDiv(weightedRaw, 1n, BigInt(newCompletedSlices), "floor"),
            LEDGER_DECIMALS,
          );
        }

        const isComplete = newCompletedSlices >= twap.slices;

        await client.query(
          `UPDATE twap_orders
           SET completed_slices = $1, filled_quantity = $2, average_fill_price = $3, status = $4
           WHERE id = $5`,
          [
            newCompletedSlices,
            formatUnits(newFilledQtyRaw, LEDGER_DECIMALS),
            newAvgFillPrice,
            isComplete ? "completed" : "active",
            twap.id,
          ]
        );

        if (isComplete) {
          logger.info({ twapId: twap.id }, "TWAP order completed");
        }
      } catch (err) {
        if (isDbConnError(err)) logger.warn({ twapId: twap.id }, "TWAP: DB unavailable, skipping order");
        else logger.error({ err, twapId: twap.id }, "Error processing TWAP order");
      }
    }

    const { rows: expired } = await client.query<{ id: string }>(
      `SELECT id FROM twap_orders WHERE status = 'active' AND end_at <= NOW()`
    );
    for (const row of expired) {
      await client.query(
        `UPDATE twap_orders SET status = 'completed' WHERE id = $1`,
        [row.id]
      );
    }
  } catch (err) {
    if (isDbConnError(err)) logger.warn({ err }, "runTwapEngine: DB error, skipping cycle");
    else logger.error({ err }, "runTwapEngine error");
  } finally {
    client?.release();
  }
}

export function startAdvancedOrderEngines(): void {
  // guardedInterval replaces the raw setInterval + busy-flag pattern.
  // Engines are staggered 10 s apart so they never compete for pool connections.
  guardedInterval("trailing-stop-engine", runTrailingStopEngine, 30_000, {
    timeoutMs: 25_000,
    initialDelayMs: 0,
  });
  guardedInterval("iceberg-engine", runIcebergEngine, 30_000, {
    timeoutMs: 25_000,
    initialDelayMs: 10_000,
  });
  guardedInterval("twap-engine", runTwapEngine, 30_000, {
    timeoutMs: 25_000,
    initialDelayMs: 20_000,
  });

  logger.info("Advanced order engines started (trailing-stop / iceberg / TWAP — 30 s intervals, staggered)");
}
