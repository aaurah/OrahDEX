/**
 * webhookHandlers.ts
 *
 * Stripe webhook → LetsExchange fulfillment pipeline
 *
 * Flow on payment_intent.succeeded:
 *   1. Read order from DB (coin, destination wallet, net USD amount)
 *   2. Create a LetsExchange exchange: USDT → target coin → user's wallet
 *   3. Store the LE deposit address + transaction ID in the order
 *   4. Update order status to "processing"
 *
 * The LE deposit address is where OrahDEX must send USDT (from the hot wallet)
 * to trigger the actual crypto delivery to the user.
 */

import Stripe from "stripe";
import { pool } from "@workspace/db";
import { leRequest, AFFILIATE_ID } from "./lib/lePriceCache.js";
import { createSsExchange, getSsExchange, isSimpleSwapConfigured } from "./lib/simpleswap.js";
import { logger } from "./lib/logger.js";
import { getLeCoinNetwork } from "./lib/leCoinNetwork.js";
import { STRIPE_API_VERSION } from "./lib/stripeVersion.js";

// ── Column migration — runs once at startup ────────────────────────────────────
async function ensureFulfillmentColumns(): Promise<void> {
  const cols = [
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS le_transaction_id   TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS le_deposit_address  TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS le_deposit_extra_id TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS le_status           TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS fulfilled_at        TIMESTAMPTZ",
    // SimpleSwap (small-order) fulfillment columns
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS provider            TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS ss_transaction_id   TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS ss_deposit_address  TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS ss_deposit_extra_id TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS ss_status           TEXT",
  ];
  for (const sql of cols) {
    await pool.query(sql).catch(() => {});
  }
}
ensureFulfillmentColumns();

// LE_COIN_NETWORK is imported from lib/leCoinNetwork.ts (single source-of-truth)

// ── Core fulfillment logic ─────────────────────────────────────────────────────
export async function fulfillOrder(paymentIntentId: string, metadata: Record<string, string>): Promise<void> {
  const { orderId, coinSymbol, walletAddress } = metadata;
  if (!orderId || !coinSymbol || !walletAddress) {
    logger.warn({ orderId, paymentIntentId }, "Fulfillment: missing metadata — cannot process");
    return;
  }

  // Load order from DB
  const res = await pool.query(`SELECT * FROM crypto_orders WHERE id = $1`, [orderId]);
  if (!res.rows.length) {
    logger.warn({ orderId }, "Fulfillment: order not found in DB");
    return;
  }
  const order = res.rows[0];

  // Idempotency guard — don't re-process if already past pending
  if (order.status !== "pending") {
    logger.info({ orderId, status: order.status }, "Fulfillment: already processed, skipping");
    return;
  }

  // Mark processing immediately so duplicate webhooks don't race
  await pool.query(
    `UPDATE crypto_orders SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [orderId]
  );

  let leMeta: ReturnType<typeof getLeCoinNetwork>;
  try {
    leMeta = getLeCoinNetwork(coinSymbol);
  } catch {
    const msg = `No LetsExchange network mapping for ${coinSymbol}`;
    logger.error({ orderId, coinSymbol }, `Fulfillment: ${msg}`);
    await pool.query(
      `UPDATE crypto_orders SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [msg, orderId]
    );
    return;
  }

  // Net USD = fiat paid − 1.5% fee (already calculated at order creation time)
  const fiatUsd = order.fiat_amount_cents / 100;
  const netUsd  = fiatUsd * (1 - 0.015);

  // ── Branch by provider (set at quote time in stripeCheckout.ts) ──
  const provider = (order.provider as string) || "letsexchange";

  if (provider === "simpleswap") {
    try {
      logger.info({ orderId, coinSymbol, netUsd }, "Fulfillment: creating SimpleSwap exchange");
      const result = await createSsExchange({
        coinSymbol,
        netUsdt:       netUsd,
        walletAddress: walletAddress.trim(),
      });
      if (!result.ok) {
        logger.error({ orderId, msg: result.error }, "Fulfillment: SimpleSwap creation failed");
        await pool.query(
          `UPDATE crypto_orders SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
          [result.error, orderId]
        );
        return;
      }
      const ex = result.exchange;
      await pool.query(
        `UPDATE crypto_orders
         SET ss_transaction_id   = $1,
             ss_deposit_address  = $2,
             ss_deposit_extra_id = $3,
             ss_status           = 'waiting',
             crypto_amount       = COALESCE($4, crypto_amount),
             updated_at          = NOW()
         WHERE id = $5`,
        [ex.id, ex.depositAddress, ex.depositExtraId, ex.withdrawalAmount, orderId]
      );
      logger.info(
        { orderId, ssId: ex.id, depositAddress: ex.depositAddress, coin: coinSymbol },
        "Fulfillment: SimpleSwap exchange created — deposit USDT to trigger delivery"
      );
    } catch (err: any) {
      logger.error({ err: err?.message, orderId }, "Fulfillment: SimpleSwap unexpected error");
      await pool.query(
        `UPDATE crypto_orders SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [err?.message ?? "SimpleSwap fulfillment failed", orderId]
      );
    }
    return;
  }

  // ── Default: LetsExchange (large orders ≥ $122) ──
  try {
    const leBody: Record<string, unknown> = {
      float:               true,
      coin_from:           "USDT",
      coin_to:             leMeta.coin,
      network_from:        "ERC20",
      network_to:          leMeta.network,
      deposit_amount:      parseFloat(netUsd.toFixed(4)),
      withdrawal:          walletAddress.trim(),
      withdrawal_extra_id: "",
      affiliate_id:        AFFILIATE_ID,
    };

    logger.info({ orderId, coinSymbol, netUsd, leMeta }, "Fulfillment: creating LE exchange");

    const { ok, data, status: leHttpStatus } = await leRequest("/v1/transaction", "POST", leBody);

    if (!ok) {
      const d   = data as Record<string, unknown> | null;
      const msg = (d?.error as string) ?? (d?.message as string) ?? `LE returned HTTP ${leHttpStatus}`;
      logger.error({ orderId, msg }, "Fulfillment: LE exchange creation failed");
      await pool.query(
        `UPDATE crypto_orders SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [msg, orderId]
      );
      return;
    }

    const leData        = data as Record<string, unknown>;
    const leTxId        = String(leData.transaction_id ?? "");
    const leDepositAddr = String(leData.deposit         ?? "");
    const leExtraId     = leData.deposit_extra_id ? String(leData.deposit_extra_id) : null;
    const leWithdrawal  = leData.withdrawal_amount ? String(leData.withdrawal_amount) : null;

    await pool.query(
      `UPDATE crypto_orders
       SET le_transaction_id   = $1,
           le_deposit_address  = $2,
           le_deposit_extra_id = $3,
           le_status           = 'waiting',
           crypto_amount       = COALESCE($4, crypto_amount),
           updated_at          = NOW()
       WHERE id = $5`,
      [leTxId, leDepositAddr, leExtraId, leWithdrawal, orderId]
    );

    logger.info(
      { orderId, leTxId, leDepositAddr, coin: coinSymbol },
      "Fulfillment: LE exchange created — deposit USDT to trigger delivery"
    );
  } catch (err: any) {
    logger.error({ err: err?.message, orderId }, "Fulfillment: unexpected error");
    await pool.query(
      `UPDATE crypto_orders SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [err?.message ?? "Fulfillment failed", orderId]
    );
  }
}

// ── Sync a single order's status from the active provider ─────────────────────
export async function syncLeStatus(orderId: string): Promise<void> {
  const res = await pool.query(
    `SELECT provider, le_transaction_id, le_status,
            ss_transaction_id, ss_status, status
       FROM crypto_orders WHERE id = $1`,
    [orderId]
  );
  if (!res.rows.length) return;
  const row = res.rows[0];
  const status = row.status as string;
  if (status === "completed" || status === "failed") return;

  const provider = (row.provider as string) || "letsexchange";

  // SimpleSwap branch
  if (provider === "simpleswap") {
    const ssId = row.ss_transaction_id as string | null;
    const ssSt = row.ss_status as string | null;
    if (!ssId) return;
    if (ssSt === "finished" || ssSt === "failed" || ssSt === "expired" || ssSt === "refunded") return;
    try {
      const info = await getSsExchange(ssId);
      if (!info) return;
      const newSs = info.status || ssSt || "waiting";
      let newStatus = status;
      let fulfilledAt: Date | null = null;
      if (newSs === "finished") { newStatus = "completed"; fulfilledAt = new Date(); }
      else if (newSs === "failed" || newSs === "expired" || newSs === "refunded") { newStatus = "failed"; }
      await pool.query(
        `UPDATE crypto_orders
         SET ss_status    = $1,
             status       = $2,
             fulfilled_at = COALESCE($3, fulfilled_at),
             updated_at   = NOW()
         WHERE id = $4`,
        [newSs, newStatus, fulfilledAt, orderId]
      );
      if (info.txTo && newSs === "finished") {
        logger.info({ orderId, ssId, txTo: info.txTo }, "SimpleSwap exchange finished — crypto delivered");
      }
    } catch (err: any) {
      logger.warn({ err: err?.message, orderId }, "syncLeStatus: SimpleSwap API error (non-fatal)");
    }
    return;
  }

  // LetsExchange branch (default)
  const leTxId = row.le_transaction_id as string | null;
  const leStatus = row.le_status as string | null;
  if (!leTxId) return;
  if (leStatus === "finished" || leStatus === "failed" || leStatus === "refunded") return;

  try {
    const { ok, data } = await leRequest(`/v1/transaction/${leTxId}`);
    if (!ok || !data) return;
    const d           = data as Record<string, unknown>;
    const newLeStatus = String(d.status ?? leStatus);
    const hashOut     = d.hash_out ? String(d.hash_out) : null;

    let newStatus   = status as string;
    let fulfilledAt: Date | null = null;

    if (newLeStatus === "finished") {
      newStatus   = "completed";
      fulfilledAt = new Date();
    } else if (newLeStatus === "failed" || newLeStatus === "refunded") {
      newStatus = "failed";
    }

    await pool.query(
      `UPDATE crypto_orders
       SET le_status    = $1,
           status       = $2,
           fulfilled_at = COALESCE($3, fulfilled_at),
           updated_at   = NOW()
       WHERE id = $4`,
      [newLeStatus, newStatus, fulfilledAt, orderId]
    );

    if (hashOut && newLeStatus === "finished") {
      logger.info({ orderId, leTxId, hashOut }, "LE exchange finished — crypto delivered");
    }
  } catch (err: any) {
    logger.warn({ err: err?.message, orderId }, "syncLeStatus: LE API error (non-fatal)");
  }
}

// ── Stripe signature verification (no external sync library needed) ────────────
function verifyStripeSignature(payload: Buffer, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const secretKey     = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) throw new Error("STRIPE_SECRET_KEY not set");

  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION as any });

  if (webhookSecret) {
    // Full signature verification when secret is available
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  // In production we MUST refuse unsigned webhooks — anyone could POST a fake
  // payment_intent.succeeded and trigger fulfillOrder.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is required in production. Refusing to process " +
      "unsigned webhook to prevent forged payment events."
    );
  }

  // Dev/preview only: parse without verification (log warning)
  logger.warn(
    "STRIPE_WEBHOOK_SECRET not set — skipping signature verification. " +
    "This is only allowed outside production. Configure it in Secrets before deploying."
  );
  return JSON.parse(payload.toString()) as Stripe.Event;
}

// ── Exported webhook handler ───────────────────────────────────────────────────
export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
        "Received type: " + typeof payload
      );
    }

    let event: Stripe.Event;
    try {
      event = verifyStripeSignature(payload, signature);
    } catch (err: any) {
      logger.error({ err: err?.message }, "Stripe webhook signature verification failed");
      throw new Error(`Webhook signature error: ${err?.message}`);
    }

    logger.info({ type: event.type }, "Stripe webhook received");

    if (event.type === "payment_intent.succeeded") {
      const pi       = event.data.object as Stripe.PaymentIntent;
      const metadata = pi.metadata as Record<string, string>;
      // Fire-and-forget — webhook must respond quickly
      void fulfillOrder(pi.id, metadata);
    }
  }
}
