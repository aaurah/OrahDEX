import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db/schema";
import { eq, and, lte, gte, ne } from "drizzle-orm";
import crypto from "node:crypto";
import { buildSettlement } from "../lib/settlement.js";

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

    // ── Attempt order matching ───────────────────────────────────────────────
    let settlementTxid: string | null = null;
    let matchedOrderId: string | null = null;

    if (body.type === "limit" && price) {
      const counterSide = body.side === "buy" ? "sell" : "buy";

      // Find the best counter-order: for a new BUY find the cheapest SELL ≤ price
      // For a new SELL find the most expensive BUY ≥ price
      const counterOrders = await db.select().from(ordersTable).where(
        and(
          eq(ordersTable.symbol, body.symbol),
          eq(ordersTable.side, counterSide),
          eq(ordersTable.status, "open"),
          ne(ordersTable.walletAddress, body.walletAddress),
          body.side === "buy"
            ? lte(ordersTable.price, price.toString())
            : gte(ordersTable.price, price.toString())
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
        // ── Settle on BSV chain ───────────────────────────────────────────────
        const settlement = buildSettlement({
          tradeId:       crypto.randomUUID(),
          pair:          body.symbol,
          buyOrderId:    body.side === "buy" ? id : match.id,
          sellOrderId:   body.side === "sell" ? id : match.id,
          buyerAddress:  body.side === "buy" ? body.walletAddress : match.walletAddress,
          sellerAddress: body.side === "sell" ? body.walletAddress : match.walletAddress,
          buyerNetwork:  body.side === "buy" ? networkType : (match.networkType ?? "evm"),
          sellerNetwork: body.side === "sell" ? networkType : (match.networkType ?? "evm"),
          amount:        quantity.toString(),
          price:         (parseFloat(match.price ?? price.toString())).toString(),
          total:         (quantity * parseFloat(match.price ?? price.toString())).toFixed(8),
          timestamp:     Date.now(),
        });

        settlementTxid = settlement.txid;
        matchedOrderId = match.id;

        req.log.info(
          { txid: settlement.txid, buyOrder: id, sellOrder: match.id },
          "BSV settlement committed"
        );

        // Mark the matching counter-order as filled
        await db.update(ordersTable)
          .set({
            status:            "filled",
            filledQuantity:    match.quantity,
            remainingQuantity: "0",
            txid:              settlement.txid,
            matchedOrderId:    id,
            updatedAt:         new Date(),
          })
          .where(eq(ordersTable.id, match.id));

        // Mark the new order as filled
        await db.update(ordersTable)
          .set({
            status:            "filled",
            filledQuantity:    quantity.toString(),
            remainingQuantity: "0",
            txid:              settlement.txid,
            matchedOrderId:    match.id,
            updatedAt:         new Date(),
          })
          .where(eq(ordersTable.id, id));
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

export default router;
