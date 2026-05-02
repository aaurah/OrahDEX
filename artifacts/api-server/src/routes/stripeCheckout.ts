import { Router } from "express";
import { pool } from "@workspace/db";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient.js";
import { logger } from "../lib/logger.js";
import { requireAdminToken } from "../middleware/adminAuth.js";

const router = Router();

/* ── Ensure crypto_orders table exists ──────────────────────────────────────*/
async function ensureCryptoOrdersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crypto_orders (
      id TEXT PRIMARY KEY,
      stripe_payment_intent_id TEXT UNIQUE,
      wallet_address TEXT NOT NULL,
      user_wallet TEXT,
      coin_symbol TEXT NOT NULL,
      fiat_amount_cents INTEGER NOT NULL,
      fiat_currency TEXT NOT NULL DEFAULT 'usd',
      crypto_amount TEXT NOT NULL,
      exchange_rate TEXT NOT NULL,
      fee_usd TEXT NOT NULL DEFAULT '0',
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  /* Migrate existing tables that predate the user_wallet column */
  await pool.query(`
    ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS user_wallet TEXT
  `).catch(() => {});
}
ensureCryptoOrdersTable().catch(e =>
  logger.warn({ err: e?.message }, "crypto_orders table setup failed (non-fatal)")
);

/* ── GET /api/stripe/config — return publishable key (safe to expose) ────── */
router.get("/stripe/config", async (_req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Stripe config unavailable");
    res.status(503).json({ error: "Stripe not connected", publishableKey: null });
  }
});

/* ── POST /api/stripe/create-payment-intent ─────────────────────────────── */
router.post("/stripe/create-payment-intent", async (req, res) => {
  try {
    const { coinSymbol, fiatAmountUsd, walletAddress, userWallet } = req.body as {
      coinSymbol?: string;
      fiatAmountUsd?: number;
      walletAddress?: string;
      userWallet?: string;
    };

    if (!coinSymbol || typeof coinSymbol !== "string") {
      res.status(400).json({ error: "coinSymbol is required" });
      return;
    }
    // LetsExchange enforces a $120 USDT minimum on the *deposit* amount.
    // After our 1.5% fee, deposit = fiatUsd * 0.985, so the user-facing min must be
    // ceil(120 / 0.985) = $122 to guarantee the swap is accepted.
    if (!fiatAmountUsd || fiatAmountUsd < 122) {
      res.status(400).json({
        error: "Minimum purchase amount for direct checkout is $122 USD. For smaller amounts, use a partner provider (Ramp Network from $5, Alchemy Pay from $10, Transak from $15).",
        minUsd: 122,
        suggestPartnerProvider: true,
      });
      return;
    }
    if (!walletAddress || walletAddress.trim().length < 15) {
      res.status(400).json({ error: "A valid wallet address is required to receive crypto" });
      return;
    }

    /* Fetch live price from internal prices store */
    let price = 0;
    try {
      const priceRes = await pool.query(
        `SELECT last_price FROM markets WHERE symbol = $1 LIMIT 1`,
        [`${coinSymbol}/USDT`]
      );
      if (priceRes.rows.length > 0) {
        price = parseFloat(priceRes.rows[0].last_price ?? "0");
      }
    } catch { /* fallback below */ }

    /* Fallback: call internal /api/prices */
    if (!price) {
      try {
        const r = await fetch(`http://localhost:${process.env.PORT}/api/prices`);
        if (r.ok) {
          const prices = await r.json() as Record<string, number>;
          price = prices[coinSymbol] ?? 0;
        }
      } catch { /* ignore */ }
    }

    if (!price || price <= 0) {
      res.status(422).json({ error: `Price unavailable for ${coinSymbol} — try again shortly` });
      return;
    }

    const FEE_RATE = 0.015; // 1.5% OrahDEX fee
    const fee = fiatAmountUsd * FEE_RATE;
    const netUsd = fiatAmountUsd - fee;
    const cryptoAmount = netUsd / price;
    const fiatAmountCents = Math.round(fiatAmountUsd * 100);

    const stripe = await getUncachableStripeClient();

    /* Create Stripe Payment Intent */
    const orderId = crypto.randomUUID();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: fiatAmountCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      description: `OrahDEX: Buy ${cryptoAmount.toFixed(6)} ${coinSymbol}`,
      metadata: {
        orderId,
        coinSymbol,
        walletAddress: walletAddress.trim(),
        cryptoAmount: cryptoAmount.toFixed(8),
        exchangeRate: price.toString(),
        feeUsd: fee.toFixed(2),
      },
    });

    /* Persist order record */
    const effectiveUserWallet = userWallet?.trim() || walletAddress.trim();
    await pool.query(
      `INSERT INTO crypto_orders
         (id, stripe_payment_intent_id, wallet_address, user_wallet, coin_symbol,
          fiat_amount_cents, fiat_currency, crypto_amount, exchange_rate, fee_usd, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'usd', $7, $8, $9, 'pending')`,
      [
        orderId,
        paymentIntent.id,
        walletAddress.trim(),
        effectiveUserWallet,
        coinSymbol,
        fiatAmountCents,
        cryptoAmount.toFixed(8),
        price.toString(),
        fee.toFixed(2),
      ]
    );

    logger.info({ orderId, coinSymbol, fiatAmountUsd, walletAddress: walletAddress.slice(0, 8) }, "Crypto order created");

    res.json({
      clientSecret: paymentIntent.client_secret,
      orderId,
      cryptoAmount: cryptoAmount.toFixed(8),
      exchangeRate: price.toString(),
      feeUsd: fee.toFixed(2),
      netUsd: netUsd.toFixed(2),
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to create payment intent");
    res.status(500).json({ error: err?.message ?? "Failed to create order" });
  }
});

/* ── GET /api/stripe/order/:id — check order status (syncs LE status live) ── */
router.get("/stripe/order/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Sync LE status before returning so the client always gets the freshest state
    const { syncLeStatus } = await import("../webhookHandlers.js");
    await syncLeStatus(id).catch(() => {});

    const result = await pool.query(
      `SELECT id, coin_symbol, fiat_amount_cents, fiat_currency,
              crypto_amount, exchange_rate, fee_usd, status, payment_method,
              error_message, le_transaction_id, le_deposit_address,
              le_deposit_extra_id, le_status, fulfilled_at, created_at, updated_at
       FROM crypto_orders WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch order" });
  }
});

/* ── GET /api/stripe/orders — list recent orders for a wallet ────────────── */
router.get("/stripe/orders", async (req, res) => {
  const { walletAddress } = req.query;
  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({ error: "walletAddress query param required" });
    return;
  }
  try {
    const addr = walletAddress.toLowerCase();
    /* Match on user_wallet (identity) OR wallet_address (destination) so
       BTC/SOL/XRP purchases appear when looked up by the user's EVM/session ID */
    const result = await pool.query(
      `SELECT id, coin_symbol, fiat_amount_cents, crypto_amount, status, created_at
       FROM crypto_orders
       WHERE LOWER(user_wallet) = $1 OR LOWER(wallet_address) = $1
       ORDER BY created_at DESC LIMIT 50`,
      [addr]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch orders" });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   ADMIN endpoints (require admin token)
   List, refund, cancel and delete Stripe crypto orders.
   ────────────────────────────────────────────────────────────────────────── */

/* GET /api/admin/stripe-orders?status=&q=&limit= */
router.get("/admin/stripe-orders", requireAdminToken, async (req, res) => {
  try {
    const status = String(req.query.status ?? "").trim().toLowerCase();
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? "100"), 10) || 100));

    const where: string[] = [];
    const params: any[] = [];
    if (status && status !== "all") { params.push(status); where.push(`LOWER(status) = $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      const i = params.length;
      where.push(`(LOWER(id) LIKE $${i} OR LOWER(stripe_payment_intent_id) LIKE $${i} OR LOWER(wallet_address) LIKE $${i} OR LOWER(user_wallet) LIKE $${i} OR LOWER(coin_symbol) LIKE $${i})`);
    }
    params.push(limit);
    const sql = `
      SELECT id, stripe_payment_intent_id, wallet_address, user_wallet, coin_symbol,
             fiat_amount_cents, fiat_currency, crypto_amount, exchange_rate, fee_usd,
             status, payment_method, error_message, created_at, updated_at
        FROM crypto_orders
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY created_at DESC
        LIMIT $${params.length}
    `;
    const result = await pool.query(sql, params);

    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
        COUNT(*) FILTER (WHERE status = 'paid')      AS paid,
        COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
        COUNT(*) FILTER (WHERE status = 'refunded')  AS refunded,
        COUNT(*) FILTER (WHERE status = 'canceled')  AS canceled,
        COUNT(*) AS total,
        COALESCE(SUM(fiat_amount_cents) FILTER (WHERE status = 'paid'), 0) AS paid_cents
      FROM crypto_orders
    `);

    res.json({ orders: result.rows, stats: stats.rows[0] ?? {} });
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin: list stripe orders failed");
    res.status(500).json({ error: err?.message ?? "Failed to list orders" });
  }
});

/* POST /api/admin/stripe-orders/:id/refund — refund the underlying PaymentIntent */
router.post("/admin/stripe-orders/:id/refund", requireAdminToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, stripe_payment_intent_id, status FROM crypto_orders WHERE id = $1`,
      [req.params.id]
    );
    const order = rows[0];
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (!order.stripe_payment_intent_id) { res.status(400).json({ error: "Order has no Stripe payment intent" }); return; }

    const stripe = await getUncachableStripeClient();
    const refund = await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id });
    await pool.query(
      `UPDATE crypto_orders SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
      [order.id]
    );
    logger.info({ orderId: order.id, refundId: refund.id }, "admin: stripe order refunded");
    res.json({ ok: true, refundId: refund.id });
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin: refund stripe order failed");
    res.status(500).json({ error: err?.message ?? "Refund failed" });
  }
});

/* POST /api/admin/stripe-orders/:id/cancel — cancel a pending PaymentIntent */
router.post("/admin/stripe-orders/:id/cancel", requireAdminToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, stripe_payment_intent_id, status FROM crypto_orders WHERE id = $1`,
      [req.params.id]
    );
    const order = rows[0];
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    if (order.stripe_payment_intent_id) {
      try {
        const stripe = await getUncachableStripeClient();
        await stripe.paymentIntents.cancel(order.stripe_payment_intent_id);
      } catch (e: any) {
        // If Stripe says it can't be canceled (already paid/etc), surface but still mark canceled locally
        logger.warn({ err: e?.message, orderId: order.id }, "stripe cancel returned error");
      }
    }
    await pool.query(
      `UPDATE crypto_orders SET status = 'canceled', updated_at = NOW() WHERE id = $1`,
      [order.id]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Cancel failed" });
  }
});

/* DELETE /api/admin/stripe-orders/:id — delete the local DB row (does NOT touch Stripe) */
router.delete("/admin/stripe-orders/:id", requireAdminToken, async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM crypto_orders WHERE id = $1`, [req.params.id]);
    res.json({ ok: true, deleted: r.rowCount ?? 0 });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Delete failed" });
  }
});

/* POST /api/admin/stripe-orders/bulk-delete — body: { status?: string, olderThanDays?: number } */
router.post("/admin/stripe-orders/bulk-delete", requireAdminToken, async (req, res) => {
  try {
    const { status, olderThanDays } = req.body ?? {};
    const where: string[] = [];
    const params: any[] = [];
    if (typeof status === "string" && status.trim() && status !== "all") {
      params.push(status.trim().toLowerCase());
      where.push(`LOWER(status) = $${params.length}`);
    }
    if (typeof olderThanDays === "number" && olderThanDays > 0) {
      params.push(olderThanDays);
      where.push(`created_at < NOW() - ($${params.length} || ' days')::interval`);
    }
    if (!where.length) { res.status(400).json({ error: "Refusing to wipe all orders without a filter (status or olderThanDays required)" }); return; }
    const r = await pool.query(`DELETE FROM crypto_orders WHERE ${where.join(" AND ")}`, params);
    res.json({ ok: true, deleted: r.rowCount ?? 0 });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Bulk delete failed" });
  }
});

export default router;
