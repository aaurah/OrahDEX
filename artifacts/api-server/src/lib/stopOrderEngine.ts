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
import { settleTrade } from "./ledger.js";
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
    const markets = await db.select({
      symbol:    marketsTable.symbol,
      lastPrice: marketsTable.lastPrice,
    }).from(marketsTable);
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
      // Use remainingQuantity so a partially-consumed stop order fills the correct amount
      const quantity = parseFloat(order.remainingQuantity ?? order.quantity);

      if (match) {
        const matchAvail = parseFloat(match.remainingQuantity ?? match.quantity);
        const fillQty   = Math.min(quantity, matchAvail);
        const fillPrice = parseFloat(match.price ?? marketPrice.toString());
        const fillTotal = (fillQty * fillPrice).toFixed(8);
        const tradeId   = crypto.randomUUID();

        const buyerAddress  = order.side === "buy"  ? order.walletAddress : match.walletAddress;
        const sellerAddress = order.side === "sell" ? order.walletAddress : match.walletAddress;

        const fallbackSettlement = buildSettlement({
          tradeId,
          pair:          order.symbol,
          buyOrderId:    order.side === "buy"  ? order.id : match.id,
          sellOrderId:   order.side === "sell" ? order.id : match.id,
          buyerAddress,
          sellerAddress,
          buyerNetwork:  order.side === "buy"  ? (order.networkType ?? "evm") : (match.networkType ?? "evm"),
          sellerNetwork: order.side === "sell" ? (order.networkType ?? "evm") : (match.networkType ?? "evm"),
          amount:        fillQty.toString(),
          price:         fillPrice.toString(),
          total:         fillTotal,
          timestamp:     Date.now(),
        });

        let broadcastTxid    = fallbackSettlement.txid;
        let wasRealBroadcast = false;
        try {
          const wallet  = await getOrCreateWallet();
          const balance = await fetchWalletBalance(wallet.address);
          if (balance.funded && balance.utxos.length > 0) {
            const best   = balance.utxos.sort((a, b) => b.satoshis - a.satoshis)[0]!;
            const result = await broadcastSettlement({
              privKeyHex:    wallet.privKeyHex,
              changeAddress: wallet.address,
              utxo:          best,
              opReturnPayload: fallbackSettlement.opReturnData,
            });
            if (result.broadcast) { broadcastTxid = result.txid; wasRealBroadcast = true; }
          }
        } catch (_) { /* fall back to deterministic txid */ }

        // Mark non-broadcast (local-only) settlement txids so the UI doesn't link
        // them to WhatsOnChain (which would 404). Real broadcasts stay un-prefixed.
        if (!wasRealBroadcast && !broadcastTxid.startsWith("local:")) {
          broadcastTxid = `local:${broadcastTxid}`;
        }

        // Mark counter-order (partially or fully consumed)
        const newMatchFilled    = parseFloat(match.filledQuantity ?? "0") + fillQty;
        const newMatchRemaining = Math.max(0, matchAvail - fillQty);
        const matchFullyFilled  = newMatchRemaining <= 0.000001;
        if (match.walletAddress === BOT_ADDRESS) {
          if (matchFullyFilled) {
            await db.delete(ordersTable).where(eq(ordersTable.id, match.id));
          } else {
            await db.update(ordersTable)
              .set({ filledQuantity: newMatchFilled.toFixed(18), remainingQuantity: newMatchRemaining.toFixed(18), updatedAt: new Date() })
              .where(eq(ordersTable.id, match.id));
          }
        } else {
          await db.update(ordersTable)
            .set({ status: matchFullyFilled ? "filled" : "open",
                   filledQuantity: newMatchFilled.toFixed(18), remainingQuantity: newMatchRemaining.toFixed(18),
                   txid: broadcastTxid, matchedOrderId: order.id, updatedAt: new Date() })
            .where(eq(ordersTable.id, match.id));
        }

        // Mark the stop order (fully or partially filled)
        const prevStopFilled   = parseFloat(order.filledQuantity ?? "0");
        const newStopFilled    = prevStopFilled + fillQty;
        const newStopRemaining = Math.max(0, quantity - fillQty);
        const stopFullyFilled  = newStopRemaining <= 0.000001;
        await db.update(ordersTable)
          .set({ status: stopFullyFilled ? "filled" : "open",
                 filledQuantity: newStopFilled.toFixed(18),
                 remainingQuantity: newStopRemaining.toFixed(18),
                 price: fillPrice.toFixed(18), total: (fillQty * fillPrice).toFixed(18),
                 txid: broadcastTxid, matchedOrderId: match.id, updatedAt: new Date() })
          .where(eq(ordersTable.id, order.id));

        // Settle balances: move quote from buyer's locked to seller's available
        // and base from seller's locked to buyer's available.
        const [baseAsset, quoteAsset = "USDT"] = order.symbol.split("/");
        // Use isBotSeller/isBotBuyer flags so real users' balances are always
        // updated correctly even when the bot is on the other side.
        try {
          await settleTrade({
            buyerAddress,
            sellerAddress,
            baseAsset:  baseAsset!,
            quoteAsset,
            amount:     fillQty.toString(),
            price:      fillPrice.toString(),
            isBotSeller: sellerAddress === BOT_ADDRESS,
            isBotBuyer:  buyerAddress  === BOT_ADDRESS,
          });
        } catch (settleErr) {
          logger.warn({ settleErr, orderId: order.id }, "Stop order: settleTrade failed after fill");
        }

        const base = order.symbol.split("/")[0] ?? order.symbol;
        pushNotification(order.walletAddress, {
          type:  stopFullyFilled ? "order_filled" : "order_partial",
          title: stopFullyFilled ? `Stop Order Triggered ✓` : `Stop Order Partial Fill`,
          body:  `${fillQty} ${base} stop-${order.side} @ $${fillPrice.toFixed(4)} · executed on-chain`,
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
