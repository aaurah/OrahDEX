import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

router.get("/orders", async (req, res) => {
  try {
    const walletAddress = req.query.walletAddress as string;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    let query = db.select().from(ordersTable).where(eq(ordersTable.walletAddress, walletAddress));
    const orders = await query;

    const filtered = orders
      .filter((o) => !req.query.symbol || o.symbol === req.query.symbol)
      .filter((o) => !req.query.status || o.status === req.query.status)
      .slice(0, parseInt(req.query.limit as string) || 50);

    res.json(
      filtered.map((o) => ({
        ...o,
        price: o.price ? parseFloat(o.price) : undefined,
        stopPrice: o.stopPrice ? parseFloat(o.stopPrice) : undefined,
        quantity: parseFloat(o.quantity),
        filledQuantity: parseFloat(o.filledQuantity),
        remainingQuantity: parseFloat(o.remainingQuantity),
        total: o.total ? parseFloat(o.total) : undefined,
        fee: parseFloat(o.fee),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/orders", async (req, res) => {
  try {
    const body = req.body;
    if (!body.walletAddress || !body.symbol || !body.side || !body.type || !body.quantity) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const id = crypto.randomUUID();
    const quantity = parseFloat(body.quantity);
    const price = body.price ? parseFloat(body.price) : undefined;
    const total = price ? price * quantity : undefined;
    const fee = (total || 0) * 0.001;

    const newOrder = {
      id,
      symbol: body.symbol,
      walletAddress: body.walletAddress,
      side: body.side,
      type: body.type,
      status: "open",
      price: price?.toString(),
      stopPrice: body.stopPrice?.toString(),
      quantity: quantity.toString(),
      filledQuantity: "0",
      remainingQuantity: quantity.toString(),
      total: total?.toString(),
      fee: fee.toString(),
      feeAsset: body.symbol.split("/")[1] || "USDT",
      timeInForce: body.timeInForce || "GTC",
      txid: body.signedTx ? crypto.randomBytes(32).toString("hex") : null,
      signedTx: body.signedTx || null,
    };

    await db.insert(ordersTable).values(newOrder);

    res.status(201).json({
      ...newOrder,
      price: newOrder.price ? parseFloat(newOrder.price) : undefined,
      quantity: parseFloat(newOrder.quantity),
      filledQuantity: parseFloat(newOrder.filledQuantity),
      remainingQuantity: parseFloat(newOrder.remainingQuantity),
      total: newOrder.total ? parseFloat(newOrder.total) : undefined,
      fee: parseFloat(newOrder.fee),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to place order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/orders/:orderId", async (req, res) => {
  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.orderId));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json({
      ...order,
      price: order.price ? parseFloat(order.price) : undefined,
      quantity: parseFloat(order.quantity),
      filledQuantity: parseFloat(order.filledQuantity),
      remainingQuantity: parseFloat(order.remainingQuantity),
      total: order.total ? parseFloat(order.total) : undefined,
      fee: parseFloat(order.fee),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get order");
    res.status(500).json({ error: "Internal server error" });
  }
});

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

    res.json({
      ...order,
      price: order.price ? parseFloat(order.price) : undefined,
      quantity: parseFloat(order.quantity),
      filledQuantity: parseFloat(order.filledQuantity),
      remainingQuantity: parseFloat(order.remainingQuantity),
      total: order.total ? parseFloat(order.total) : undefined,
      fee: parseFloat(order.fee),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to cancel order");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
