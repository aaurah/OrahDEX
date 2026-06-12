import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { randomUUID } from "node:crypto";
import {
  issueAdvancedOrderChallenge,
  verifyAdvancedOrderSignature,
} from "../lib/walletAuth.js";

const router: IRouter = Router();

// ── GET /orders/advanced/challenge ───────────────────────────────────────────
// Issue a single-use wallet-ownership challenge that the client must sign with
// personal_sign (EIP-191) before calling any advanced-order create endpoint.
//
// Query:  walletAddress — EVM wallet address (0x…)
// Returns: { nonce: string; message: string }
//   message is the exact string the wallet must sign.
//   nonce   must be included in the subsequent create request.
router.get("/orders/advanced/challenge", (req, res) => {
  const walletAddress = req.query.walletAddress as string | undefined;
  if (!walletAddress || typeof walletAddress !== "string" || !walletAddress.startsWith("0x")) {
    res.status(400).json({ error: "walletAddress query parameter is required (0x… EVM address)" });
    return;
  }
  const challenge = issueAdvancedOrderChallenge(walletAddress);
  res.json(challenge);
});

router.post("/orders/oco", async (req, res) => {
  const { walletAddress, symbol, side, quantity, limitPrice, stopPrice, networkType, chainId, signature, nonce } = req.body as {
    walletAddress?: string;
    symbol?: string;
    side?: string;
    quantity?: string | number;
    limitPrice?: string | number;
    stopPrice?: string | number;
    networkType?: string;
    chainId?: number;
    signature?: string;
    nonce?: string;
  };

  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  if (!signature || !nonce) {
    res.status(401).json({
      error: "signature and nonce are required. Request a challenge via GET /orders/advanced/challenge?walletAddress=<addr>",
    });
    return;
  }
  try {
    verifyAdvancedOrderSignature(walletAddress, nonce, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    res.status(401).json({ error: msg });
    return;
  }
  if (!symbol || typeof symbol !== "string") {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  if (!side || !["buy", "sell"].includes(side)) {
    res.status(400).json({ error: "side must be 'buy' or 'sell'" });
    return;
  }
  if (!quantity || isNaN(parseFloat(String(quantity))) || parseFloat(String(quantity)) <= 0) {
    res.status(400).json({ error: "quantity must be a positive number" });
    return;
  }
  if (!limitPrice || isNaN(parseFloat(String(limitPrice))) || parseFloat(String(limitPrice)) <= 0) {
    res.status(400).json({ error: "limitPrice must be a positive number" });
    return;
  }
  if (!stopPrice || isNaN(parseFloat(String(stopPrice))) || parseFloat(String(stopPrice)) <= 0) {
    res.status(400).json({ error: "stopPrice must be a positive number" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const limitOrderId = randomUUID();
    const stopOrderId = randomUUID();
    const ocoId = randomUUID();
    const net = networkType ?? "evm";
    const qtyStr = String(quantity);
    const limitPriceStr = String(limitPrice);
    const stopPriceStr = String(stopPrice);

    await client.query(
      `INSERT INTO orders (id, symbol, wallet_address, network_type, side, type, status, price, quantity, filled_quantity, remaining_quantity, fee, is_bot, is_synthetic, chain_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'limit', 'open', $6, $7, '0', $7, '0', false, false, $8, NOW(), NOW())`,
      [limitOrderId, symbol, walletAddress, net, side, limitPriceStr, qtyStr, chainId ?? null]
    );

    await client.query(
      `INSERT INTO orders (id, symbol, wallet_address, network_type, side, type, status, price, stop_price, quantity, filled_quantity, remaining_quantity, fee, is_bot, is_synthetic, chain_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'stop_limit', 'open', $6, $6, $7, '0', $7, '0', false, false, $8, NOW(), NOW())`,
      [stopOrderId, symbol, walletAddress, net, side, stopPriceStr, qtyStr, chainId ?? null]
    );

    await client.query(
      `INSERT INTO oco_orders (id, wallet_address, symbol, side, quantity, limit_price, stop_price, limit_order_id, stop_order_id, status, network_type, chain_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10, $11, NOW())`,
      [ocoId, walletAddress, symbol, side, qtyStr, limitPriceStr, stopPriceStr, limitOrderId, stopOrderId, net, chainId ?? null]
    );

    await client.query("COMMIT");

    const { rows } = await client.query(`SELECT * FROM oco_orders WHERE id = $1`, [ocoId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Failed to create OCO order");
    res.status(500).json({ error: "Failed to create OCO order" });
  } finally {
    client.release();
  }
});

router.post("/orders/trailing-stop", async (req, res) => {
  const { walletAddress, symbol, side, quantity, trailPercent, activationPrice, networkType, chainId, signature, nonce } = req.body as {
    walletAddress?: string;
    symbol?: string;
    side?: string;
    quantity?: string | number;
    trailPercent?: string | number;
    activationPrice?: string | number;
    networkType?: string;
    chainId?: number;
    signature?: string;
    nonce?: string;
  };

  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  if (!signature || !nonce) {
    res.status(401).json({
      error: "signature and nonce are required. Request a challenge via GET /orders/advanced/challenge?walletAddress=<addr>",
    });
    return;
  }
  try {
    verifyAdvancedOrderSignature(walletAddress, nonce, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    res.status(401).json({ error: msg });
    return;
  }
  if (!symbol || typeof symbol !== "string") {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  if (!side || !["buy", "sell"].includes(side)) {
    res.status(400).json({ error: "side must be 'buy' or 'sell'" });
    return;
  }
  if (!quantity || isNaN(parseFloat(String(quantity))) || parseFloat(String(quantity)) <= 0) {
    res.status(400).json({ error: "quantity must be a positive number" });
    return;
  }
  const trailPct = parseFloat(String(trailPercent));
  if (!trailPercent || isNaN(trailPct) || trailPct < 0.1 || trailPct > 50) {
    res.status(400).json({ error: "trailPercent must be between 0.1 and 50" });
    return;
  }

  const client = await pool.connect();
  try {
    const { rows: marketRows } = await client.query<{ mark_price: string }>(
      `SELECT mark_price FROM markets WHERE symbol = $1 LIMIT 1`,
      [symbol]
    );
    if (!marketRows[0]?.mark_price) {
      res.status(404).json({ error: `No market found for symbol ${symbol}` });
      return;
    }

    const currentPrice = parseFloat(marketRows[0].mark_price);
    const qtyStr = String(quantity);
    const net = networkType ?? "evm";

    let currentStopPrice: number;
    if (side === "sell") {
      currentStopPrice = currentPrice * (1 - trailPct / 100);
    } else {
      currentStopPrice = currentPrice * (1 + trailPct / 100);
    }

    let status = "active";
    if (activationPrice !== undefined && activationPrice !== null) {
      const actPrice = parseFloat(String(activationPrice));
      const reached = side === "sell" ? currentPrice >= actPrice : currentPrice <= actPrice;
      if (!reached) status = "pending";
    }

    const id = randomUUID();
    await client.query(
      `INSERT INTO trailing_stop_orders
       (id, wallet_address, symbol, side, quantity, trail_percent, activation_price, current_stop_price, high_watermark, low_watermark, status, network_type, chain_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, NOW(), NOW())`,
      [
        id,
        walletAddress,
        symbol,
        side,
        qtyStr,
        trailPct.toString(),
        activationPrice !== undefined ? String(activationPrice) : null,
        currentStopPrice.toString(),
        currentPrice.toString(),
        status,
        net,
        chainId ?? null,
      ]
    );

    const { rows } = await client.query(`SELECT * FROM trailing_stop_orders WHERE id = $1`, [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "Failed to create trailing stop order");
    res.status(500).json({ error: "Failed to create trailing stop order" });
  } finally {
    client.release();
  }
});

router.post("/orders/twap", async (req, res) => {
  const {
    walletAddress,
    symbol,
    side,
    totalQuantity,
    slices,
    durationMinutes,
    maxSlippagePercent,
    networkType,
    chainId,
    signature,
    nonce,
  } = req.body as {
    walletAddress?: string;
    symbol?: string;
    side?: string;
    totalQuantity?: string | number;
    slices?: string | number;
    durationMinutes?: string | number;
    maxSlippagePercent?: string | number;
    networkType?: string;
    chainId?: number;
    signature?: string;
    nonce?: string;
  };

  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  if (!signature || !nonce) {
    res.status(401).json({
      error: "signature and nonce are required. Request a challenge via GET /orders/advanced/challenge?walletAddress=<addr>",
    });
    return;
  }
  try {
    verifyAdvancedOrderSignature(walletAddress, nonce, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    res.status(401).json({ error: msg });
    return;
  }
  if (!symbol || typeof symbol !== "string") {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  if (!side || !["buy", "sell"].includes(side)) {
    res.status(400).json({ error: "side must be 'buy' or 'sell'" });
    return;
  }
  if (!totalQuantity || isNaN(parseFloat(String(totalQuantity))) || parseFloat(String(totalQuantity)) <= 0) {
    res.status(400).json({ error: "totalQuantity must be a positive number" });
    return;
  }
  const slicesInt = parseInt(String(slices));
  if (!slices || isNaN(slicesInt) || slicesInt < 2 || slicesInt > 100) {
    res.status(400).json({ error: "slices must be between 2 and 100" });
    return;
  }
  const durationMins = parseFloat(String(durationMinutes));
  if (!durationMinutes || isNaN(durationMins) || durationMins < 5 || durationMins > 10080) {
    res.status(400).json({ error: "durationMinutes must be between 5 and 10080 (1 week)" });
    return;
  }

  const intervalSeconds = Math.floor((durationMins * 60) / slicesInt);
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + durationMins * 60 * 1000);
  const maxSlip = maxSlippagePercent !== undefined ? parseFloat(String(maxSlippagePercent)) : 1.0;
  const net = networkType ?? "evm";
  const id = randomUUID();

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO twap_orders
       (id, wallet_address, symbol, side, total_quantity, filled_quantity, slices, completed_slices, interval_seconds, start_at, end_at, max_slippage_percent, average_fill_price, status, network_type, chain_id, created_at)
       VALUES ($1, $2, $3, $4, $5, '0', $6, 0, $7, $8, $9, $10, NULL, 'active', $11, $12, NOW())`,
      [
        id,
        walletAddress,
        symbol,
        side,
        String(totalQuantity),
        slicesInt,
        intervalSeconds,
        startAt.toISOString(),
        endAt.toISOString(),
        maxSlip.toString(),
        net,
        chainId ?? null,
      ]
    );

    const { rows } = await client.query(`SELECT * FROM twap_orders WHERE id = $1`, [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "Failed to create TWAP order");
    res.status(500).json({ error: "Failed to create TWAP order" });
  } finally {
    client.release();
  }
});

router.post("/orders/iceberg", async (req, res) => {
  const { walletAddress, symbol, side, price, totalQuantity, visibleQuantity, networkType, chainId, signature, nonce } = req.body as {
    walletAddress?: string;
    symbol?: string;
    side?: string;
    price?: string | number;
    totalQuantity?: string | number;
    visibleQuantity?: string | number;
    networkType?: string;
    chainId?: number;
    signature?: string;
    nonce?: string;
  };

  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  if (!signature || !nonce) {
    res.status(401).json({
      error: "signature and nonce are required. Request a challenge via GET /orders/advanced/challenge?walletAddress=<addr>",
    });
    return;
  }
  try {
    verifyAdvancedOrderSignature(walletAddress, nonce, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    res.status(401).json({ error: msg });
    return;
  }
  if (!symbol || typeof symbol !== "string") {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  if (!side || !["buy", "sell"].includes(side)) {
    res.status(400).json({ error: "side must be 'buy' or 'sell'" });
    return;
  }
  if (!price || isNaN(parseFloat(String(price))) || parseFloat(String(price)) <= 0) {
    res.status(400).json({ error: "price must be a positive number" });
    return;
  }
  if (!totalQuantity || isNaN(parseFloat(String(totalQuantity))) || parseFloat(String(totalQuantity)) <= 0) {
    res.status(400).json({ error: "totalQuantity must be a positive number" });
    return;
  }
  if (!visibleQuantity || isNaN(parseFloat(String(visibleQuantity))) || parseFloat(String(visibleQuantity)) <= 0) {
    res.status(400).json({ error: "visibleQuantity must be a positive number" });
    return;
  }
  if (parseFloat(String(visibleQuantity)) >= parseFloat(String(totalQuantity))) {
    res.status(400).json({ error: "visibleQuantity must be less than totalQuantity" });
    return;
  }

  const icebergId = randomUUID();
  const firstOrderId = randomUUID();
  const net = networkType ?? "evm";
  const priceStr = String(price);
  const totalQtyStr = String(totalQuantity);
  const visibleQtyStr = String(visibleQuantity);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO iceberg_orders
       (id, wallet_address, symbol, side, price, total_quantity, filled_quantity, visible_quantity, active_order_id, status, network_type, chain_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, '0', $7, NULL, 'active', $8, $9, NOW())`,
      [icebergId, walletAddress, symbol, side, priceStr, totalQtyStr, visibleQtyStr, net, chainId ?? null]
    );

    await client.query(
      `INSERT INTO orders (id, symbol, wallet_address, network_type, side, type, status, price, quantity, filled_quantity, remaining_quantity, fee, is_bot, is_synthetic, chain_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'limit', 'open', $6, $7, '0', $7, '0', false, false, $8, NOW(), NOW())`,
      [firstOrderId, symbol, walletAddress, net, side, priceStr, visibleQtyStr, chainId ?? null]
    );

    await client.query(
      `UPDATE iceberg_orders SET active_order_id = $1 WHERE id = $2`,
      [firstOrderId, icebergId]
    );

    await client.query("COMMIT");

    const { rows } = await client.query(`SELECT * FROM iceberg_orders WHERE id = $1`, [icebergId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Failed to create iceberg order");
    res.status(500).json({ error: "Failed to create iceberg order" });
  } finally {
    client.release();
  }
});

router.get("/orders/advanced", async (req, res) => {
  const walletAddress = req.query.walletAddress as string | undefined;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress query parameter is required" });
    return;
  }
  const signature = req.query.signature as string | undefined;
  const nonce     = req.query.nonce     as string | undefined;
  if (!signature || !nonce) {
    res.status(401).json({
      error: "signature and nonce are required. Request a challenge via GET /orders/advanced/challenge?walletAddress=<addr>",
    });
    return;
  }
  try {
    verifyAdvancedOrderSignature(walletAddress, nonce, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    res.status(401).json({ error: msg });
    return;
  }

  const client = await pool.connect();
  try {
    const [ocoResult, trailingResult, twapResult, icebergResult] = await Promise.all([
      client.query(`SELECT * FROM oco_orders WHERE wallet_address = $1 ORDER BY created_at DESC`, [walletAddress]),
      client.query(`SELECT * FROM trailing_stop_orders WHERE wallet_address = $1 ORDER BY created_at DESC`, [walletAddress]),
      client.query(`SELECT * FROM twap_orders WHERE wallet_address = $1 ORDER BY created_at DESC`, [walletAddress]),
      client.query(`SELECT * FROM iceberg_orders WHERE wallet_address = $1 ORDER BY created_at DESC`, [walletAddress]),
    ]);

    res.json({
      oco: ocoResult.rows,
      trailingStops: trailingResult.rows,
      twap: twapResult.rows,
      iceberg: icebergResult.rows,
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch advanced orders");
    res.status(500).json({ error: "Failed to fetch advanced orders" });
  } finally {
    client.release();
  }
});

router.delete("/orders/oco/:id", async (req, res) => {
  const { id } = req.params;
  const walletAddress = (req.query.walletAddress as string | undefined) ?? (req.body?.walletAddress as string | undefined);
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  const signature = (req.query.signature as string | undefined) ?? (req.body?.signature as string | undefined);
  const nonce     = (req.query.nonce     as string | undefined) ?? (req.body?.nonce     as string | undefined);
  if (!signature || !nonce) {
    res.status(401).json({
      error: "signature and nonce are required. Request a challenge via GET /orders/advanced/challenge?walletAddress=<addr>",
    });
    return;
  }
  try {
    verifyAdvancedOrderSignature(walletAddress, nonce, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    res.status(401).json({ error: msg });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ limit_order_id: string; stop_order_id: string; status: string; wallet_address: string }>(
      `SELECT limit_order_id, stop_order_id, status, wallet_address FROM oco_orders WHERE id = $1`,
      [id]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "OCO order not found" });
      return;
    }
    if (rows[0].wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Forbidden: order does not belong to this wallet" });
      return;
    }
    if (rows[0].status === "cancelled") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "OCO order is already cancelled" });
      return;
    }

    await client.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id IN ($1, $2) AND status = 'open'`,
      [rows[0].limit_order_id, rows[0].stop_order_id]
    );
    await client.query(
      `UPDATE oco_orders SET status = 'cancelled' WHERE id = $1`,
      [id]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Failed to cancel OCO order");
    res.status(500).json({ error: "Failed to cancel OCO order" });
  } finally {
    client.release();
  }
});

router.delete("/orders/trailing-stop/:id", async (req, res) => {
  const { id } = req.params;
  const walletAddress = (req.query.walletAddress as string | undefined) ?? (req.body?.walletAddress as string | undefined);
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  const signature = (req.query.signature as string | undefined) ?? (req.body?.signature as string | undefined);
  const nonce     = (req.query.nonce     as string | undefined) ?? (req.body?.nonce     as string | undefined);
  if (!signature || !nonce) {
    res.status(401).json({
      error: "signature and nonce are required. Request a challenge via GET /orders/advanced/challenge?walletAddress=<addr>",
    });
    return;
  }
  try {
    verifyAdvancedOrderSignature(walletAddress, nonce, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    res.status(401).json({ error: msg });
    return;
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ status: string; wallet_address: string }>(
      `SELECT status, wallet_address FROM trailing_stop_orders WHERE id = $1`,
      [id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "Trailing stop order not found" });
      return;
    }
    if (rows[0].wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
      res.status(403).json({ error: "Forbidden: order does not belong to this wallet" });
      return;
    }
    if (rows[0].status === "cancelled") {
      res.status(400).json({ error: "Trailing stop order is already cancelled" });
      return;
    }

    await client.query(
      `UPDATE trailing_stop_orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to cancel trailing stop order");
    res.status(500).json({ error: "Failed to cancel trailing stop order" });
  } finally {
    client.release();
  }
});

router.delete("/orders/twap/:id", async (req, res) => {
  const { id } = req.params;
  const walletAddress = (req.query.walletAddress as string | undefined) ?? (req.body?.walletAddress as string | undefined);
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  const signature = (req.query.signature as string | undefined) ?? (req.body?.signature as string | undefined);
  const nonce     = (req.query.nonce     as string | undefined) ?? (req.body?.nonce     as string | undefined);
  if (!signature || !nonce) {
    res.status(401).json({
      error: "signature and nonce are required. Request a challenge via GET /orders/advanced/challenge?walletAddress=<addr>",
    });
    return;
  }
  try {
    verifyAdvancedOrderSignature(walletAddress, nonce, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    res.status(401).json({ error: msg });
    return;
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ status: string; wallet_address: string }>(
      `SELECT status, wallet_address FROM twap_orders WHERE id = $1`,
      [id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "TWAP order not found" });
      return;
    }
    if (rows[0].wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
      res.status(403).json({ error: "Forbidden: order does not belong to this wallet" });
      return;
    }
    if (rows[0].status === "cancelled") {
      res.status(400).json({ error: "TWAP order is already cancelled" });
      return;
    }

    await client.query(
      `UPDATE twap_orders SET status = 'cancelled' WHERE id = $1`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to cancel TWAP order");
    res.status(500).json({ error: "Failed to cancel TWAP order" });
  } finally {
    client.release();
  }
});

router.delete("/orders/iceberg/:id", async (req, res) => {
  const { id } = req.params;
  const walletAddress = (req.query.walletAddress as string | undefined) ?? (req.body?.walletAddress as string | undefined);
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  const signature = (req.query.signature as string | undefined) ?? (req.body?.signature as string | undefined);
  const nonce     = (req.query.nonce     as string | undefined) ?? (req.body?.nonce     as string | undefined);
  if (!signature || !nonce) {
    res.status(401).json({
      error: "signature and nonce are required. Request a challenge via GET /orders/advanced/challenge?walletAddress=<addr>",
    });
    return;
  }
  try {
    verifyAdvancedOrderSignature(walletAddress, nonce, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    res.status(401).json({ error: msg });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ active_order_id: string | null; status: string; wallet_address: string }>(
      `SELECT active_order_id, status, wallet_address FROM iceberg_orders WHERE id = $1`,
      [id]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Iceberg order not found" });
      return;
    }
    if (rows[0].wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Forbidden: order does not belong to this wallet" });
      return;
    }
    if (rows[0].status === "cancelled") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Iceberg order is already cancelled" });
      return;
    }

    if (rows[0].active_order_id) {
      await client.query(
        `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status = 'open'`,
        [rows[0].active_order_id]
      );
    }

    await client.query(
      `UPDATE iceberg_orders SET status = 'cancelled', active_order_id = NULL WHERE id = $1`,
      [id]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, "Failed to cancel iceberg order");
    res.status(500).json({ error: "Failed to cancel iceberg order" });
  } finally {
    client.release();
  }
});

export default router;
