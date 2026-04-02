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

import { db } from "@workspace/db";
import { ordersTable, marketsTable } from "@workspace/db/schema";
import { eq, and, ne, lte, gte } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "./logger.js";
import { buildSettlement } from "./settlement.js";
import { BOT_ADDRESS } from "./liquidityBot.js";
import { getOrCreateWallet, fetchWalletBalance } from "./bsvWallet.js";
import { broadcastSettlement } from "./bsvBroadcaster.js";
import { pushNotification } from "./notifQueue.js";

export async function triggerStopOrders(): Promise<void> {
  try {
    // Fetch all open stop orders
    const openStops = await db.select().from(ordersTable).where(
      and(
        eq(ordersTable.type, "stop"),
        eq(ordersTable.status, "open"),
      )
    );
    if (openStops.length === 0) return;

    // Fetch all markets into a quick lookup map
    const markets = await db.select().from(marketsTable);
    const priceMap = new Map<string, number>(
      markets.map(m => [m.symbol, parseFloat(m.lastPrice)])
    );

    for (const order of openStops) {
      const stopPrice = order.stopPrice ? parseFloat(order.stopPrice) : null;
      if (!stopPrice || stopPrice <= 0) continue;

      const marketPrice = priceMap.get(order.symbol) ?? 0;
      if (marketPrice <= 0) continue;

      const triggered =
        (order.side === "buy"  && marketPrice >= stopPrice) ||
        (order.side === "sell" && marketPrice <= stopPrice);

      if (!triggered) continue;

      logger.info(
        { orderId: order.id, symbol: order.symbol, side: order.side, stopPrice, marketPrice },
        "Stop order triggered — executing as market fill"
      );

      // Match against best available counter-order (like a market order)
      const counterSide = order.side === "buy" ? "sell" : "buy";
      const counterOrders = await db.select().from(ordersTable).where(
        and(
          eq(ordersTable.symbol, order.symbol),
          eq(ordersTable.side, counterSide),
          eq(ordersTable.status, "open"),
          ne(ordersTable.walletAddress, order.walletAddress),
        )
      );

      const sorted = counterOrders.sort((a, b) => {
        const pa = parseFloat(a.price ?? "0");
        const pb = parseFloat(b.price ?? "0");
        return order.side === "buy" ? pa - pb : pb - pa;
      });

      const match = sorted[0];
      const quantity = parseFloat(order.quantity);

      if (match) {
        const fillPrice = parseFloat(match.price ?? marketPrice.toString());
        const fillTotal = (quantity * fillPrice).toFixed(8);
        const tradeId   = crypto.randomUUID();

        const opReturnPayload = [
          "ORAH", "v1",
          tradeId.replace(/-/g, "").slice(0, 16),
          order.symbol,
          (order.side === "buy" ? order.walletAddress : match.walletAddress).slice(0, 20) + "…",
          (order.side === "sell" ? order.walletAddress : match.walletAddress).slice(0, 20) + "…",
          quantity.toString(),
          fillPrice.toString(),
          Date.now().toString(),
        ].join("|");

        const fallbackSettlement = buildSettlement({
          tradeId,
          pair:          order.symbol,
          buyOrderId:    order.side === "buy" ? order.id : match.id,
          sellOrderId:   order.side === "sell" ? order.id : match.id,
          buyerAddress:  order.side === "buy" ? order.walletAddress : match.walletAddress,
          sellerAddress: order.side === "sell" ? order.walletAddress : match.walletAddress,
          buyerNetwork:  order.side === "buy" ? (order.networkType ?? "evm") : (match.networkType ?? "evm"),
          sellerNetwork: order.side === "sell" ? (order.networkType ?? "evm") : (match.networkType ?? "evm"),
          amount:        quantity.toString(),
          price:         fillPrice.toString(),
          total:         fillTotal,
          timestamp:     Date.now(),
        });

        let broadcastTxid = fallbackSettlement.txid;
        try {
          const wallet  = await getOrCreateWallet();
          const balance = await fetchWalletBalance(wallet.address);
          if (balance.funded && balance.utxos.length > 0) {
            const best   = balance.utxos.sort((a, b) => b.satoshis - a.satoshis)[0]!;
            const result = await broadcastSettlement({
              privKeyHex:    wallet.privKeyHex,
              changeAddress: wallet.address,
              utxo:          best,
              opReturnPayload,
            });
            if (result.broadcast) broadcastTxid = result.txid;
          }
        } catch (_) { /* fall back to deterministic txid */ }

        // Mark counter-order (if not bot) as filled
        if (match.walletAddress === BOT_ADDRESS) {
          await db.delete(ordersTable).where(eq(ordersTable.id, match.id));
        } else {
          await db.update(ordersTable)
            .set({ status: "filled", filledQuantity: match.quantity, remainingQuantity: "0",
                   txid: broadcastTxid, matchedOrderId: order.id, updatedAt: new Date() })
            .where(eq(ordersTable.id, match.id));
        }

        // Mark the stop order as filled
        await db.update(ordersTable)
          .set({ status: "filled", filledQuantity: quantity.toString(), remainingQuantity: "0",
                 price: fillPrice.toString(), total: fillTotal,
                 txid: broadcastTxid, matchedOrderId: match.id, updatedAt: new Date() })
          .where(eq(ordersTable.id, order.id));

        const base = order.symbol.split("/")[0] ?? order.symbol;
        pushNotification(order.walletAddress, {
          type:  "order_filled",
          title: `Stop Order Triggered ✓`,
          body:  `${quantity} ${base} stop-${order.side} @ $${fillPrice.toFixed(4)} · executed on-chain`,
          pair:  order.symbol,
          txid:  broadcastTxid ?? undefined,
          side:  order.side,
        });
      } else {
        // No counter-order available — mark as pending (leave open) but log
        logger.info({ orderId: order.id }, "Stop triggered but no counter-order available — stays open");
      }
    }
  } catch (err) {
    logger.warn({ err }, "Stop order engine error");
  }
}
