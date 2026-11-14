/**
 * Stop Order Trigger Engine
 *
 * Runs after each price update cycle and triggers any open stop orders
 * whose market price condition has been met.
 *
 * BUY  stop: fires when market price >= stopPrice  (breakout / buy-stop)
 * SELL stop: fires when market price <= stopPrice  (stop-loss / sell-stop)
 *
 * When triggered the stop order is matched against the best available
 * counter-order exactly like a market order.
 */

import { db, withDbRetry } from "@workspace/db";
import { ordersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger.js";

export async function triggerStopOrders(): Promise<void> {
  try {
    const openStops = await withDbRetry(() =>
      db.select().from(ordersTable).where(
        and(
          eq(ordersTable.type, "stop"),
          eq(ordersTable.status, "open"),
        )
      )
    );
    if (openStops.length > 0) {
      logger.warn(
        { count: openStops.length },
        "Stop order execution is paused until settlement can be committed before order status changes",
      );
    }
  } catch (err) {
    logger.warn({ err }, "Stop order engine error");
  }
}
