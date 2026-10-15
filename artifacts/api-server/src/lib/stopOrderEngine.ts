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
import { ordersTable, marketsTable } from "@workspace/db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "./logger.js";
import { buildSettlement } from "./settlement.js";
import { settleTrade } from "./ledger.js";
import { BOT_ADDRESS } from "./liquidityBot.js";
import { getOrCreateWallet, fetchWalletBalance } from "./bsvWallet.js";
import { broadcastSettlement } from "./bsvBroadcaster.js";
import { pushNotification } from "./notifQueue.js";
import { parseUnits, formatUnits, mulPriceQty } from "./money.js";

const LEDGER_DECIMALS = 18;

function raw18(value: string): bigint {
  return parseUnits(value, LEDGER_DECIMALS);
}
function nonNegative(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

export async function triggerStopOrders(): Promise<void> {
  try {
    // Fetch all open stop orders
    const openStops = await withDbRetry(() =>
      db.select().from(ordersTable).where(
        and(
          eq(ordersTable.type, "stop"),
          eq(ordersTable.status, "open"),
        )
      )
    );
    if (openStops.length === 0) return;

    // Fetch non-LE markets into a quick lookup map (stop orders only use internal pairs).
    const markets = await withDbRetry(() =>
      db.select({
        symbol:    marketsTable.symbol,
        lastPrice: marketsTable.lastPrice,
      }).from(marketsTable).where(inArray(marketsTable.type, ["spot", "futures"]))
    );
    const priceMap = new Map<string, bigint>();
    for (const m of markets) {
      try {
        priceMap.set(m.symbol, raw18(m.lastPrice));
      } catch {
        // skip malformed market prices
      }
    }

    // ── Identify triggered orders in-memory — no per-order DB round-trips ────
    const triggeredOrders = openStops.filter(order => {
      if (!order.stopPrice) return false;
      let stopRaw: bigint;
      let marketRaw: bigint;
      try {
        stopRaw = raw18(order.stopPrice);
        const market = priceMap.get(order.symbol);
        if (!market) return false;
        marketRaw = market;
      } catch {
        return false;
      }
      if (stopRaw <= 0n || marketRaw <= 0n) return false;
      return (order.side === "buy"  && marketRaw >= stopRaw) ||
             (order.side === "sell" && marketRaw <= stopRaw);
    });

    if (triggeredOrders.length === 0) return;

    // ── ONE batch query for all counter-orders across all triggered symbols ───
    // Replaces the previous N+1 pattern (one SELECT per triggered order).
    const triggeredSymbols = [...new Set(triggeredOrders.map(o => o.symbol))];
    const allCounterOrders = await withDbRetry(() =>
      db.select().from(ordersTable).where(
        and(
          inArray(ordersTable.symbol, triggeredSymbols),
          eq(ordersTable.status, "open"),
        )
      )
    );

    // Build lookup: `${symbol}:${side}` → candidate counter-orders
    const counterMap = new Map<string, typeof allCounterOrders>();
    for (const o of allCounterOrders) {
      const key = `${o.symbol}:${o.side}`;
      if (!counterMap.has(key)) counterMap.set(key, []);
      counterMap.get(key)!.push(o);
    }

    for (const order of triggeredOrders) {
      if (!order.stopPrice) continue;
      let stopRaw: bigint;
      let marketRaw: bigint;
      try {
        stopRaw = raw18(order.stopPrice);
        const market = priceMap.get(order.symbol);
        if (!market) continue;
        marketRaw = market;
      } catch {
        continue;
      }
      if (stopRaw <= 0n || marketRaw <= 0n) continue;

      logger.info(
        {
          orderId: order.id,
          symbol: order.symbol,
          side: order.side,
          stopPrice: order.stopPrice,
          marketPrice: formatUnits(marketRaw, LEDGER_DECIMALS),
        },
        "Stop order triggered — executing as market fill"
      );

      // Use pre-fetched counter-order map instead of a per-order SELECT
      const counterSide = order.side === "buy" ? "sell" : "buy";
      const sorted = (counterMap.get(`${order.symbol}:${counterSide}`) ?? [])
        .filter(c => c.walletAddress !== order.walletAddress)
        .sort((a, b) => {
          const pa = (() => { try { return raw18(a.price || "0"); } catch { return 0n; } })();
          const pb = (() => { try { return raw18(b.price || "0"); } catch { return 0n; } })();
          return order.side === "buy"
            ? (pa < pb ? -1 : pa > pb ? 1 : 0)
            : (pb < pa ? -1 : pb > pa ? 1 : 0);
        });

      const match = sorted[0];
      // Use remainingQuantity so a partially-consumed stop order fills the correct amount
      const quantityRaw = raw18(order.remainingQuantity ?? order.quantity);

      if (match) {
        const matchAvailRaw = raw18(match.remainingQuantity ?? match.quantity);
        const fillQtyRaw = quantityRaw < matchAvailRaw ? quantityRaw : matchAvailRaw;
        const fillPriceRaw = match.price ? raw18(match.price) : marketRaw;
        const fillTotalRaw = mulPriceQty({
          priceRaw: fillPriceRaw,
          priceDecimals: LEDGER_DECIMALS,
          quantityRaw: fillQtyRaw,
          quantityDecimals: LEDGER_DECIMALS,
          outputDecimals: LEDGER_DECIMALS,
          rounding: "ceil",
        });
        const fillQty = formatUnits(fillQtyRaw, LEDGER_DECIMALS);
        const fillPrice = formatUnits(fillPriceRaw, LEDGER_DECIMALS);
        const fillTotal = formatUnits(fillTotalRaw, LEDGER_DECIMALS);
        const tradeId = crypto.randomUUID();

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
          amount:        fillQty,
          price:         fillPrice,
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
        const newMatchFilledRaw = raw18(match.filledQuantity ?? "0") + fillQtyRaw;
        const newMatchRemainingRaw = nonNegative(matchAvailRaw - fillQtyRaw);
        const matchFullyFilled = newMatchRemainingRaw === 0n;
        if (match.walletAddress === BOT_ADDRESS) {
          if (matchFullyFilled) {
            await db.delete(ordersTable).where(eq(ordersTable.id, match.id));
          } else {
            await db.update(ordersTable)
              .set({ filledQuantity: formatUnits(newMatchFilledRaw, LEDGER_DECIMALS), remainingQuantity: formatUnits(newMatchRemainingRaw, LEDGER_DECIMALS), updatedAt: new Date() })
              .where(eq(ordersTable.id, match.id));
          }
        } else {
          await db.update(ordersTable)
            .set({ status: matchFullyFilled ? "filled" : "open",
                   filledQuantity: formatUnits(newMatchFilledRaw, LEDGER_DECIMALS),
                   remainingQuantity: formatUnits(newMatchRemainingRaw, LEDGER_DECIMALS),
                   txid: broadcastTxid, matchedOrderId: order.id, updatedAt: new Date() })
            .where(eq(ordersTable.id, match.id));
        }

        // Mark the stop order (fully or partially filled)
        const prevStopFilledRaw = raw18(order.filledQuantity ?? "0");
        const newStopFilledRaw = prevStopFilledRaw + fillQtyRaw;
        const newStopRemainingRaw = nonNegative(quantityRaw - fillQtyRaw);
        const stopFullyFilled = newStopRemainingRaw === 0n;
        await db.update(ordersTable)
          .set({ status: stopFullyFilled ? "filled" : "open",
                 filledQuantity: formatUnits(newStopFilledRaw, LEDGER_DECIMALS),
                 remainingQuantity: formatUnits(newStopRemainingRaw, LEDGER_DECIMALS),
                 price: fillPrice,
                 total: fillTotal,
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
            amount:     fillQty,
            price:      fillPrice,
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
          body:  `${fillQty} ${base} stop-${order.side} @ $${fillPrice} · executed on-chain`,
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
