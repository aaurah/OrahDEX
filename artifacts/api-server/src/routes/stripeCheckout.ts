import { Router } from "express";
import { pool } from "@workspace/db";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient.js";
import { logger } from "../lib/logger.js";

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
    if (!fiatAmountUsd || fiatAmountUsd < 10) {
      res.status(400).json({ error: "Minimum purchase amount is $10" });
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
          const prices = await r.json();
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

/* ── GET /api/stripe/order/:id — check order status ─────────────────────── */
router.get("/stripe/order/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM crypto_orders WHERE id = $1`,
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

export default router;
