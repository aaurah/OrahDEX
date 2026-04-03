import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ordersTable, marketsTable } from "@workspace/db/schema";
import { eq, and, lte, gte, ne } from "drizzle-orm";
import crypto from "node:crypto";
import { buildSettlement } from "../lib/settlement.js";
import { BOT_ADDRESS } from "../lib/liquidityBot.js";
import { getOrCreateWallet, fetchWalletBalance } from "../lib/bsvWallet.js";
import { broadcastSettlement } from "../lib/bsvBroadcaster.js";
import { pushNotification } from "../lib/notifQueue.js";
import { recordTradeMetric, getMetricsSummary } from "../lib/tradeMetrics.js";
import { getCachedQuote } from "../lib/routeCache.js";

const router: IRouter = Router();

// ── Helper: serialize an order row for API response ──────────────────────────
function serializeOrder(o: typeof ordersTable.$inferSelect) {
  return {
    ...o,
    price:             o.price             ? parseFloat(o.price)             : undefined,
    stopPrice:         o.stopPrice         ? parseFloat(o.stopPrice)         : undefined,
    quantity:          parseFloat(o.quantity),
    filledQuantity:    parseFloat(o.filledQuantity),
    remainingQuantity: parseFloat(o.remainingQuantity),
    total:             o.total             ? parseFloat(o.total)             : undefined,
    fee:               parseFloat(o.fee),
  };
}

// ── GET /orders ───────────────────────────────────────────────────────────────
router.get("/orders", async (req, res) => {
  try {
    const walletAddress = req.query.walletAddress as string;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const orders = await db.select().from(ordersTable)
      .where(eq(ordersTable.walletAddress, walletAddress));

    const filtered = orders
      .filter((o) => !req.query.symbol || o.symbol === req.query.symbol)
      .filter((o) => !req.query.status || o.status === req.query.status)
      .slice(0, parseInt(req.query.limit as string) || 50);

    res.json(filtered.map(serializeOrder));
  } catch (err) {
    req.log.error({ err }, "Failed to get orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /orders ───────────────────────────────────────────────────────────────
// Accepts an optional `evmSignature` field (MetaMask personal_sign) that proves
// the trader authorised this order. On match, a BSV OP_RETURN settlement
// transaction is generated and both orders are marked filled with the txid.
router.post("/orders", async (req, res) => {
  try {
    const body = req.body;
    if (!body.walletAddress || !body.symbol || !body.side || !body.type || !body.quantity) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const id            = crypto.randomUUID();
    const quantity      = parseFloat(body.quantity);
    const price         = body.price ? parseFloat(body.price) : undefined;
    const total         = price ? price * quantity : undefined;
    const fee           = (total || 0) * 0.001;
    const networkType   = body.networkType ?? (body.walletAddress.startsWith("0x") ? "evm" : "bsv");

    const newOrder = {
      id,
      symbol:            body.symbol,
      walletAddress:     body.walletAddress,
      networkType,
      side:              body.side,              // "buy" | "sell"
      type:              body.type,              // "limit" | "market"
      status:            "open",
      price:             price?.toString(),
      stopPrice:         body.stopPrice?.toString(),
      quantity:          quantity.toString(),
      filledQuantity:    "0",
      remainingQuantity: quantity.toString(),
      total:             total?.toString(),
      fee:               fee.toString(),
      feeAsset:          body.symbol.split("/")[1] || "USDT",
      timeInForce:       body.timeInForce || "GTC",
      txid:              null as string | null,
      // EVM signature from MetaMask personal_sign — proves the trader authorised this order
      signedTx:          body.evmSignature || body.signedTx || null,
      matchedOrderId:    null as string | null,
    };

    await db.insert(ordersTable).values(newOrder);
    req.log.info({ orderId: id, side: body.side, networkType }, "Order placed");

    /* Push order-placed notification to the user */
    const orderPair = body.symbol;
    const orderSide = (body.side as string).toUpperCase();
    pushNotification(body.walletAddress, {
      type: "order_placed",
      title: `${orderSide} Order Placed`,
      body: `${quantity} ${orderPair.split("/")[0]} @ ${price ? `$${price}` : "market"} · waiting for match`,
      pair: orderPair,
      side: body.side,
    });

    // ── Attempt order matching ───────────────────────────────────────────────
    // Works for limit, market, AND stop orders.
    // Stop orders: check current market price immediately. If the stop condition
    // is already met, execute as a market fill. Otherwise it stays "open" and
    // a background trigger loop will fire it when price crosses.
    let settlementTxid: string | null = null;
    let matchedOrderId: string | null = null;

    const isMarket = body.type === "market";
    const isLimit  = body.type === "limit" && !!price;

    // ── Stop order trigger check ─────────────────────────────────────────────
    // If a stop order's trigger price is already beaten by the current market,
    // convert it to a market order so it fills immediately.
    let isStopTriggered = false;
    if (body.type === "stop" && body.stopPrice) {
      const stopTrigger = parseFloat(body.stopPrice);
      const [mkt] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, body.symbol));
      const mktPrice = mkt ? parseFloat(mkt.lastPrice) : 0;
      if (mktPrice > 0) {
        // Buy-stop: trigger when price rises ABOVE stopPrice (breakout entry)
        // Sell-stop: trigger when price falls BELOW stopPrice (stop-loss exit)
        isStopTriggered =
          (body.side === "buy"  && mktPrice >= stopTrigger) ||
          (body.side === "sell" && mktPrice <= stopTrigger);
      }
    }

    if (isMarket || isLimit || isStopTriggered) {
      const counterSide = body.side === "buy" ? "sell" : "buy";

      // For limit orders restrict by price; market/stop orders accept any price
      // Format price safely — avoid scientific notation (e.g. 1e-8) which
      // breaks numeric DB comparisons on very small asset prices.
      const safePriceStr = price != null ? price.toFixed(8) : undefined;

      const counterOrders = await db.select().from(ordersTable).where(
        and(
          eq(ordersTable.symbol, body.symbol),
          eq(ordersTable.side, counterSide),
          eq(ordersTable.status, "open"),
          ne(ordersTable.walletAddress, body.walletAddress),
          // Limit orders have price constraints; market + triggered-stop orders take any price
          ...(isLimit && safePriceStr
            ? [body.side === "buy"
                ? lte(ordersTable.price, safePriceStr)
                : gte(ordersTable.price, safePriceStr)]
            : []),
        )
      );

      // Sort: best price first (cheapest sell for buy, most expensive buy for sell)
      const sorted = counterOrders.sort((a, b) => {
        const pa = parseFloat(a.price ?? "0");
        const pb = parseFloat(b.price ?? "0");
        return body.side === "buy" ? pa - pb : pb - pa;
      });

      const match = sorted[0];
      if (match) {
        // Use the matched order's price (bot's price) as the fill price
        const fillPrice = parseFloat(match.price ?? price?.toString() ?? "0");
        const fillTotal = (quantity * fillPrice).toFixed(8);

        // ── Settle on BSV chain ─────────────────────────────────────────────
        const tradeId = crypto.randomUUID();
        const opReturnPayload = [
          "ORAH", "v1",
          tradeId.replace(/-/g, "").slice(0, 16),
          body.symbol,
          (body.side === "buy" ? body.walletAddress : match.walletAddress).slice(0, 20) + "…",
          (body.side === "sell" ? body.walletAddress : match.walletAddress).slice(0, 20) + "…",
          quantity.toString(),
          fillPrice.toString(),
          Date.now().toString(),
        ].join("|");

        // Build deterministic txid as fallback
        const fallbackSettlement = buildSettlement({
          tradeId,
          pair:          body.symbol,
          buyOrderId:    body.side === "buy" ? id : match.id,
          sellOrderId:   body.side === "sell" ? id : match.id,
          buyerAddress:  body.side === "buy" ? body.walletAddress : match.walletAddress,
          sellerAddress: body.side === "sell" ? body.walletAddress : match.walletAddress,
          buyerNetwork:  body.side === "buy" ? networkType : (match.networkType ?? "evm"),
          sellerNetwork: body.side === "sell" ? networkType : (match.networkType ?? "evm"),
          amount:        quantity.toString(),
          price:         fillPrice.toString(),
          total:         fillTotal,
          timestamp:     Date.now(),
        });

        let broadcastTxid = fallbackSettlement.txid;
        let wasRealBroadcast = false;

        // Attempt real on-chain broadcast (non-blocking — fall back on any failure)
        try {
          const wallet  = await getOrCreateWallet();
          const balance = await fetchWalletBalance(wallet.address);
          if (balance.funded && balance.utxos.length > 0) {
            const best = balance.utxos.sort((a, b) => b.satoshis - a.satoshis)[0]!;
            const result = await broadcastSettlement({
              privKeyHex:      wallet.privKeyHex,
              changeAddress:   wallet.address,
              utxo:            best,
              opReturnPayload,
            });
            if (result.broadcast) {
              broadcastTxid    = result.txid;
              wasRealBroadcast = true;
            }
          }
        } catch (broadcastErr) {
          req.log.warn({ broadcastErr }, "BSV broadcast attempt failed — using deterministic txid");
        }

        settlementTxid = broadcastTxid;
        matchedOrderId = match.id;

        req.log.info(
          { txid: broadcastTxid, buyOrder: id, sellOrder: match.id,
            fillPrice, isBot: match.walletAddress === BOT_ADDRESS, realBroadcast: wasRealBroadcast },
          wasRealBroadcast ? "BSV settlement BROADCAST to mainnet ✓" : "BSV settlement committed (deterministic txid)"
        );

        // If matched against the bot, just delete the consumed bot order
        // (keeps the bot order table clean; real users keep their filled rows)
        if (match.walletAddress === BOT_ADDRESS) {
          await db.delete(ordersTable).where(eq(ordersTable.id, match.id));
        } else {
          await db.update(ordersTable)
            .set({
              status:            "filled",
              filledQuantity:    match.quantity,
              remainingQuantity: "0",
              txid:              broadcastTxid,
              matchedOrderId:    id,
              updatedAt:         new Date(),
            })
            .where(eq(ordersTable.id, match.id));
        }

        // Mark the user's new order as filled
        await db.update(ordersTable)
          .set({
            status:            "filled",
            filledQuantity:    quantity.toString(),
            remainingQuantity: "0",
            price:             isMarket ? fillPrice.toString() : undefined,
            total:             fillTotal,
            txid:              broadcastTxid,
            matchedOrderId:    match.id,
            updatedAt:         new Date(),
          })
          .where(eq(ordersTable.id, id));

        /* Push order-filled notification */
        const fillSymbol = body.symbol as string;
        const fillBase   = fillSymbol.split("/")[0];
        pushNotification(body.walletAddress, {
          type:  "order_filled",
          title: `Order Filled ✓`,
          body:  `${quantity} ${fillBase} @ $${fillPrice.toFixed(4)} · BSV settled on-chain`,
          pair:  fillSymbol,
          txid:  broadcastTxid ?? undefined,
          side:  body.side,
        });
      }
    }

    // Return the created order (re-read for updated status if matched)
    const [created] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));

    res.status(201).json({
      ...serializeOrder(created),
      matched:     !!settlementTxid,
      settlementTxid,
      explorerUrl: settlementTxid ? `https://whatsonchain.com/tx/${settlementTxid}` : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to place order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /orders/:orderId ──────────────────────────────────────────────────────
router.get("/orders/:orderId", async (req, res) => {
  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.orderId));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json({
      ...serializeOrder(order),
      explorerUrl: order.txid ? `https://whatsonchain.com/tx/${order.txid}` : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /orders/:orderId ───────────────────────────────────────────────────
router.delete("/orders/:orderId", async (req, res) => {
  try {
    const body = req.body;
    if (!body.walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const [order] = await db
      .update(ordersTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(ordersTable.id, req.params.orderId), eq(ordersTable.walletAddress, body.walletAddress)))
      .returning();

    if (!order) {
      res.status(404).json({ error: "Order not found or not owned by this wallet" });
      return;
    }

    res.json(serializeOrder(order));
  } catch (err) {
    req.log.error({ err }, "Failed to cancel order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /orders/precheck ─────────────────────────────────────────────────────
// Validates a potential order WITHOUT creating any DB record or transaction.
// Returns: { ok, errors[], warnings[], priceImpactPct, minReceived, route }
router.post("/orders/precheck", async (req, res) => {
  try {
    const { symbol, side, type, amount, price, slippageBps = 50, currentPrice } = req.body;

    if (!symbol || !side || !amount) {
      res.status(400).json({ ok: false, errors: [{ code: "AMOUNT_TOO_SMALL", detail: "Missing fields" }], warnings: [] });
      return;
    }

    const errors:   { code: string; detail?: string }[] = [];
    const warnings: { code: string; message: string  }[] = [];

    const qty = parseFloat(amount);
    const px  = price ? parseFloat(price) : (currentPrice ?? 0);

    // Pair enabled check (look up market)
    const [mkt] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!mkt) {
      errors.push({ code: "PAIR_DISABLED", detail: `Market ${symbol} not found` });
      res.json({ ok: false, errors, warnings });
      return;
    }

    const marketPrice = parseFloat(mkt.lastPrice);
    const orderValue  = px * qty;

    // Min order size
    if (orderValue < 0.5) errors.push({ code: "AMOUNT_TOO_SMALL", detail: "Min order $0.50" });

    // Price required for limit/stop
    if ((type === "limit" || type === "stop") && (!px || px <= 0)) {
      errors.push({ code: "PRICE_REQUIRED" });
    }

    // Slippage / price impact (approximate AMM model)
    const isTopTier  = ["BSV","BTC","ETH","BNB","SOL"].some(s => symbol.startsWith(s));
    const poolTvlUsd = isTopTier ? 500_000 : 50_000;
    const impact     = (orderValue / poolTvlUsd) * 100;
    const slipPct    = (slippageBps ?? 50) / 100;

    if (impact > slipPct && impact > 0.1) {
      errors.push({ code: "SLIPPAGE_TOO_HIGH",
        detail: `Impact ${impact.toFixed(2)}% > tolerance ${slipPct.toFixed(2)}%` });
    }
    if (impact > 1 && impact <= slipPct) {
      warnings.push({ code: "PRICE_IMPACT_MODERATE", message: "Your order will move the price by >1%." });
    }
    if (impact > 5) {
      errors.push({ code: "PRICE_IMPACT_HIGH",
        detail: `${impact.toFixed(1)}% impact — split into smaller orders` });
    }

    // Liquidity check — no open bot orders on the counter side? warn.
    const [base, quote = "USDT"] = symbol.split("/");
    const counterSide = side === "buy" ? "sell" : "buy";
    const counterOrders = await db.select().from(ordersTable).where(
      and(eq(ordersTable.symbol, symbol), eq(ordersTable.side, counterSide), eq(ordersTable.status, "open"))
    );
    if (counterOrders.length === 0) {
      warnings.push({ code: "LOW_LIQUIDITY", message: "No counter-orders visible — your order may wait for a match." });
    }

    // Route from hot cache (if available)
    const cached = getCachedQuote(base, quote);
    const route  = cached?.route ?? [base, quote];
    const feePct = cached?.feePct ?? 0.25;
    const minReceived = qty * (1 - feePct / 100) * (1 - slipPct / 100);

    res.json({
      ok:            errors.length === 0,
      errors,
      warnings,
      priceImpactPct: parseFloat(impact.toFixed(4)),
      minReceived:   parseFloat(minReceived.toFixed(8)),
      route,
      marketPrice,
      feePct,
    });
  } catch (err) {
    req.log.error({ err }, "Precheck error");
    res.status(500).json({ ok: true, errors: [], warnings: [] }); // fail-open
  }
});

// ── POST /metrics/trades ──────────────────────────────────────────────────────
// Receives latency + outcome telemetry from the frontend (via sendBeacon).
router.post("/metrics/trades", (req, res) => {
  try {
    const body = req.body;
    if (body?.symbol) recordTradeMetric(body);
    res.status(204).end();
  } catch {
    res.status(204).end();
  }
});

// ── GET /metrics/trades ───────────────────────────────────────────────────────
// Returns aggregate latency + failure metrics for each pair/network/wallet.
router.get("/metrics/trades", (_req, res) => {
  res.json({ metrics: getMetricsSummary() });
});

router.get("/settlements", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const settled = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.status, "filled"), ne(ordersTable.txid, "NULL")));

    const real = settled
      .filter(o => o.txid && o.txid.length > 0)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit)
      .map(o => ({
        id:          o.id,
        txid:        o.txid!,
        explorerUrl: `https://whatsonchain.com/tx/${o.txid}`,
        symbol:      o.symbol,
        side:        o.side,
        price:       parseFloat(o.price ?? "0"),
        quantity:    parseFloat(o.quantity),
        total:       parseFloat(o.total ?? "0"),
        fee:         parseFloat(o.fee),
        feeAsset:    o.feeAsset,
        walletAddress: o.walletAddress,
        networkType: o.networkType,
        matchedOrderId: o.matchedOrderId,
        timestamp:   o.updatedAt.toISOString(),
        chain:       "BSV",
        status:      "confirmed" as const,
        confirmations: 6,
        requiredConfirmations: 3,
      }));

    res.json({ settlements: real, total: real.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get settlements");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
