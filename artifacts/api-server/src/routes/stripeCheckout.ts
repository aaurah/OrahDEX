import { Router } from "express";
import { pool } from "@workspace/db";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient.js";
import { logger } from "../lib/logger.js";
import { requireAdminToken } from "../middleware/adminAuth.js";
import { leRequest, AFFILIATE_ID } from "../lib/lePriceCache.js";
import { quoteFromSS, getSsRange, isSimpleSwapConfigured, SS_COIN_TICKER } from "../lib/simpleswap.js";
import { getLeCoinNetwork } from "../lib/leCoinNetwork.js";
import { FALLBACK_PRICES } from "../lib/priceUpdater.js";

/* Small-order threshold: orders with net USDT under this amount route to
   SimpleSwap (≈$10 min). At/above, they route to LetsExchange ($120 min after fee). */
const LE_THRESHOLD_USD = 122;
const SS_FLOOR_USD     = 10;

/* Ask LE: "for `netUsdt` USDT (ERC-20), how much TARGET coin do we get?"
   Returns { coinAmount, ratePerCoin } where ratePerCoin = USD price the
   customer effectively pays per unit (so the UI's "rate" matches reality). */
async function quoteFromLE(coinSymbol: string, netUsdt: number): Promise<{ coinAmount: number; ratePerCoin: number } | null> {
  let meta: ReturnType<typeof getLeCoinNetwork>;
  try {
    meta = getLeCoinNetwork(coinSymbol);
  } catch (err: any) {
    logger.warn({ coinSymbol, err: err?.message }, "LE price quote skipped for unsupported coin");
    return null;
  }
  try {
    const body = {
      from:         "USDT",
      to:           meta.coin,
      network_from: "ERC20",
      network_to:   meta.network,
      amount:       parseFloat(netUsdt.toFixed(4)),
      affiliate_id: AFFILIATE_ID,
    };
    const res = await leRequest("/v1/info", "POST", body);
    if (!res.ok || !res.data) return null;
    const d = res.data as Record<string, unknown>;
    // LE returns either `amount` (coin out) or `rate` (coin per 1 USDT)
    const coinAmount = parseFloat(String(d.amount ?? "")) || 0;
    const rate       = parseFloat(String(d.rate   ?? "")) || 0;
    if (coinAmount > 0) {
      return { coinAmount, ratePerCoin: netUsdt / coinAmount };
    }
    if (rate > 0) {
      return { coinAmount: netUsdt * rate, ratePerCoin: 1 / rate };
    }
    return null;
  } catch (e: any) {
    logger.warn({ err: e?.message, coinSymbol }, "LE price quote failed");
    return null;
  }
}

async function getFallbackUsdPrice(coinSymbol: string): Promise<{
  price: number;
  source: "markets" | "fallback_prices";
}> {
  try {
    const priceRes = await pool.query(
      `SELECT last_price FROM markets WHERE symbol = $1 LIMIT 1`,
      [`${coinSymbol}/USDT`]
    );
    if (priceRes.rows.length > 0) {
      const price = parseFloat(priceRes.rows[0].last_price ?? "0");
      if (price > 0) {
        return { price, source: "markets" };
      }
    }
  } catch (err: any) {
    logger.warn({ coinSymbol, err: err?.message }, "Stripe checkout market fallback lookup failed");
  }

  return {
    price: FALLBACK_PRICES[coinSymbol.toUpperCase()] ?? 0,
    source: "fallback_prices",
  };
}

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
  /* Provider column must exist before any INSERT below — don't rely on the
     webhookHandlers side-effect migration winning the race at startup. */
  await pool.query(`
    ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS provider TEXT
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
    /* Two-tier fulfillment:
         - Orders ≥ $122 USD route to LetsExchange (its $120 USDT deposit min).
         - Orders $10–$121 route to SimpleSwap (≈$10 USDT min, varies per coin).
       Effective floor depends on whether SimpleSwap is configured. */
    const ssAvailable = isSimpleSwapConfigured() && !!SS_COIN_TICKER[(coinSymbol ?? "").toUpperCase()];
    const minAllowed = ssAvailable ? SS_FLOOR_USD : LE_THRESHOLD_USD;
    if (!fiatAmountUsd || fiatAmountUsd < minAllowed) {
      res.status(400).json({
        error: `Minimum purchase amount is $${minAllowed} USD.`,
        minUsd: minAllowed,
      });
      return;
    }
    if (!walletAddress || walletAddress.trim().length < 15) {
      res.status(400).json({ error: "A valid wallet address is required to receive crypto" });
      return;
    }

    const FEE_RATE = 0.015; // 1.5% OrahDEX fee
    const fee = fiatAmountUsd * FEE_RATE;
    const netUsd = fiatAmountUsd - fee;
    const fiatAmountCents = Math.round(fiatAmountUsd * 100);

    /* Pick fulfillment provider by order size, then quote from that provider so
       the customer is shown the exact amount they'll actually receive. */
    let provider: "letsexchange" | "simpleswap" =
      ssAvailable && fiatAmountUsd < LE_THRESHOLD_USD ? "simpleswap" : "letsexchange";

    /* Enforce SimpleSwap's per-coin range BEFORE creating a Stripe PI.
       SS min varies by coin and can exceed our $10 floor. If the order is too
       small for SS but big enough for LE, fall through to LE; otherwise reject
       so the customer is never charged for an unfillable swap. */
    if (provider === "simpleswap") {
      const range = await getSsRange(coinSymbol);
      if (range && range.min > 0 && netUsd < range.min) {
        const grossNeeded = Math.ceil(range.min / (1 - FEE_RATE));
        if (grossNeeded < LE_THRESHOLD_USD) {
          res.status(400).json({
            error: `Minimum for ${coinSymbol} is $${grossNeeded} USD.`,
            minUsd: grossNeeded,
          });
          return;
        }
        // SS min is high enough that LE is the only viable backend.
        provider = "letsexchange";
        if (fiatAmountUsd < LE_THRESHOLD_USD) {
          res.status(400).json({
            error: `Minimum for ${coinSymbol} is $${LE_THRESHOLD_USD} USD.`,
            minUsd: LE_THRESHOLD_USD,
          });
          return;
        }
      }
      if (range?.max && netUsd > range.max) {
        // Order exceeds SS max — promote to LE if it fits the LE floor.
        if (fiatAmountUsd >= LE_THRESHOLD_USD) provider = "letsexchange";
      }
    }

    let price = 0;
    let cryptoAmount = 0;
    let priceSource: "letsexchange" | "simpleswap" | "markets" | "fallback_prices" = provider as "letsexchange" | "simpleswap";

    const primaryQuote = provider === "simpleswap"
      ? await quoteFromSS(coinSymbol, netUsd)
      : await quoteFromLE(coinSymbol, netUsd);

    if (primaryQuote && primaryQuote.coinAmount > 0 && primaryQuote.ratePerCoin > 0) {
      price = primaryQuote.ratePerCoin;
      cryptoAmount = primaryQuote.coinAmount;
    } else {
      const fallback = await getFallbackUsdPrice(coinSymbol);
      price = fallback.price;
      if (price > 0) priceSource = fallback.source;

      if (!price || price <= 0) {
        res.status(422).json({ error: `Price unavailable for ${coinSymbol} — try again shortly` });
        return;
      }
      cryptoAmount = netUsd / price;
    }
    logger.info({ coinSymbol, fiatAmountUsd, netUsd, price, cryptoAmount, priceSource }, "Stripe checkout price quote");

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

    /* Persist order record (with provider so the webhook routes correctly) */
    const effectiveUserWallet = userWallet?.trim() || walletAddress.trim();
    await pool.query(
      `INSERT INTO crypto_orders
         (id, stripe_payment_intent_id, wallet_address, user_wallet, coin_symbol,
          fiat_amount_cents, fiat_currency, crypto_amount, exchange_rate, fee_usd, status, provider)
       VALUES ($1, $2, $3, $4, $5, $6, 'usd', $7, $8, $9, 'pending', $10)`,
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
        provider,
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
      priceSource,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to create payment intent");
    res.status(500).json({ error: "Failed to create order" });
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
              error_message, provider,
              le_transaction_id, le_deposit_address, le_deposit_extra_id, le_status,
              ss_transaction_id, ss_deposit_address, ss_deposit_extra_id, ss_status,
              fulfilled_at, created_at, updated_at
       FROM crypto_orders WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

/* ── GET /api/stripe/orders — list recent orders for one or more identities
   `walletAddress` accepts a comma-separated list so Portfolio can include
   both the connected wallet and the session identity. ───────────────────── */
router.get("/stripe/orders", async (req, res) => {
  const raw = req.query.walletAddress;
  if (!raw || typeof raw !== "string") {
    res.status(400).json({ error: "walletAddress query param required" });
    return;
  }
  try {
    const addrs = Array.from(new Set(
      raw.split(",").map(s => s.trim().toLowerCase()).filter(s => s.length >= 6)
    ));
    if (!addrs.length) { res.json([]); return; }

    /* Match on user_wallet (identity) OR wallet_address (destination) so
       BTC/SOL/XRP purchases appear when looked up by the user's EVM/session ID */
    const result = await pool.query(
      `SELECT id, coin_symbol, fiat_amount_cents, crypto_amount, status, created_at
       FROM crypto_orders
       WHERE LOWER(user_wallet) = ANY($1::text[])
          OR LOWER(wallet_address) = ANY($1::text[])
       ORDER BY created_at DESC LIMIT 50`,
      [addrs]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* ── DELETE /api/stripe/orders/:id — user-scoped delete for pending/failed/cancelled
   Requires `walletAddress` query (comma-separated) for ownership; refuses when
   the order is already completed/processing/paid (those carry real money or
   in-flight crypto and must NEVER be hidden by users). Cancels the underlying
   Stripe PaymentIntent if one exists. ────────────────────────────────────── */
router.delete("/stripe/orders/:id", async (req, res) => {
  const raw = req.query.walletAddress;
  if (!raw || typeof raw !== "string") {
    res.status(400).json({ error: "walletAddress query param required" });
    return;
  }
  const addrs = Array.from(new Set(
    raw.split(",").map(s => s.trim().toLowerCase()).filter(s => s.length >= 6)
  ));
  if (!addrs.length) { res.status(400).json({ error: "walletAddress invalid" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT id, stripe_payment_intent_id, status, user_wallet, wallet_address
         FROM crypto_orders WHERE id = $1`,
      [req.params.id]
    );
    const order = rows[0];
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    /* Ownership check */
    const ownerOk = addrs.includes((order.user_wallet ?? "").toLowerCase()) ||
                    addrs.includes((order.wallet_address ?? "").toLowerCase());
    if (!ownerOk) { res.status(403).json({ error: "Not your order" }); return; }

    /* Only deletable while not yet fulfilled */
    const status = String(order.status ?? "").toLowerCase();
    const DELETABLE = new Set(["pending", "failed", "canceled", "cancelled"]);
    if (!DELETABLE.has(status)) {
      res.status(409).json({
        error: `Cannot delete a ${status} order — completed and processing purchases are permanent.`,
      });
      return;
    }

    /* Best-effort cancel of the Stripe PaymentIntent so it can't later succeed */
    if (order.stripe_payment_intent_id) {
      try {
        const stripe = await getUncachableStripeClient();
        await stripe.paymentIntents.cancel(order.stripe_payment_intent_id);
      } catch (e: any) {
        logger.warn({ err: e?.message, orderId: order.id }, "user delete: stripe cancel failed");
      }
    }

    await pool.query(`DELETE FROM crypto_orders WHERE id = $1`, [order.id]);
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err?.message }, "user delete stripe order failed");
    res.status(500).json({ error: "Delete failed" });
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
      SELECT co.id, co.stripe_payment_intent_id, co.wallet_address, co.user_wallet,
             co.coin_symbol, co.fiat_amount_cents, co.fiat_currency, co.crypto_amount,
             co.exchange_rate, co.fee_usd, co.status, co.payment_method,
             co.error_message, co.created_at, co.updated_at,
             kv.first_name       AS kyc_first_name,
             kv.last_name        AS kyc_last_name,
             kv.date_of_birth    AS kyc_date_of_birth,
             kv.nationality      AS kyc_nationality,
             kv.country_of_residence AS kyc_country,
             kv.id_type          AS kyc_id_type,
             kv.id_number        AS kyc_id_number,
             kv.status           AS kyc_status,
             kv.submitted_at     AS kyc_submitted_at
        FROM crypto_orders co
        LEFT JOIN kyc_verifications kv
          ON kv.wallet_address = LOWER(COALESCE(co.user_wallet, co.wallet_address))
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY co.created_at DESC
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
    res.status(500).json({ error: "Failed to list orders" });
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
    res.status(500).json({ error: "Refund failed" });
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
    res.status(500).json({ error: "Cancel failed" });
  }
});

/* DELETE /api/admin/stripe-orders/:id — delete the local DB row (does NOT touch Stripe) */
router.delete("/admin/stripe-orders/:id", requireAdminToken, async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM crypto_orders WHERE id = $1`, [req.params.id]);
    res.json({ ok: true, deleted: r.rowCount ?? 0 });
  } catch (err: any) {
    res.status(500).json({ error: "Delete failed" });
  }
});

/* POST /api/admin/stripe-orders/:id/fulfill — manually trigger crypto delivery
   Creates a LetsExchange swap (USDT → coin → customer wallet) for this order.
   Use when the Stripe webhook didn't fire or the previous fulfillment failed. */
router.post("/admin/stripe-orders/:id/fulfill", requireAdminToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, stripe_payment_intent_id, wallet_address, coin_symbol, status, le_transaction_id, fiat_amount_cents
         FROM crypto_orders WHERE id = $1`,
      [req.params.id]
    );
    const order = rows[0];
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    // Force the order back to 'pending' so fulfillOrder will process it
    await pool.query(
      `UPDATE crypto_orders SET status = 'pending', error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [order.id]
    );

    const paidAmountCents = Number(order.fiat_amount_cents);
    if (!Number.isFinite(paidAmountCents) || paidAmountCents <= 0) {
      res.status(400).json({ error: "Order fiat amount is missing or invalid" });
      return;
    }

    const { fulfillOrder } = await import("../webhookHandlers.js");
    await fulfillOrder(order.stripe_payment_intent_id ?? `manual:${order.id}`, {
      orderId: order.id,
      coinSymbol: order.coin_symbol,
      walletAddress: order.wallet_address,
    }, paidAmountCents);

    const { rows: updated } = await pool.query(
      `SELECT id, status, le_transaction_id, le_deposit_address, le_deposit_extra_id,
              le_status, error_message, crypto_amount
         FROM crypto_orders WHERE id = $1`,
      [order.id]
    );
    logger.info({ orderId: order.id }, "admin: manual fulfillment triggered");
    res.json({ ok: true, order: updated[0] });
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin: manual fulfillment failed");
    res.status(500).json({ error: "Fulfillment failed" });
  }
});

/* POST /api/admin/stripe-orders/:id/mark-paid — force-set status (e.g. for manual reconciliation) */
router.post("/admin/stripe-orders/:id/mark", requireAdminToken, async (req, res) => {
  try {
    const newStatus = String(req.body?.status ?? "").trim().toLowerCase();
    const allowed = ["pending", "paid", "processing", "failed", "refunded", "canceled", "completed"];
    if (!allowed.includes(newStatus)) { res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` }); return; }
    const r = await pool.query(
      `UPDATE crypto_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status`,
      [newStatus, req.params.id]
    );
    if (!r.rowCount) { res.status(404).json({ error: "Order not found" }); return; }
    res.json({ ok: true, order: r.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: "Update failed" });
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
    res.status(500).json({ error: "Bulk delete failed" });
  }
});

export default router;
