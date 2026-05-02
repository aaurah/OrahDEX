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
 * The LE deposit address is where OrahDEX must send USDT (from the hot wallet
 * or manually) to trigger the actual crypto delivery to the user.
 */

import { pool } from "@workspace/db";
import { leRequest, AFFILIATE_ID } from "./lib/lePriceCache.js";
import { getStripeSync } from "./stripeClient.js";
import { logger } from "./lib/logger.js";

// ── Column migration — runs once at startup ────────────────────────────────────
async function ensureFulfillmentColumns(): Promise<void> {
  const cols = [
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS le_transaction_id   TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS le_deposit_address  TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS le_deposit_extra_id TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS le_status           TEXT",
    "ALTER TABLE crypto_orders ADD COLUMN IF NOT EXISTS fulfilled_at        TIMESTAMPTZ",
  ];
  for (const sql of cols) {
    await pool.query(sql).catch(() => {});
  }
}
ensureFulfillmentColumns();

// ── Coin → LetsExchange network mapping ───────────────────────────────────────
// coin_to / network_to used when creating a USDT → target exchange on LE.
// Verified against the LE /v2/coins response; update if LE changes their codes.
const LE_COIN_NETWORK: Record<string, { coin: string; network: string }> = {
  BTC:   { coin: "BTC",   network: "BTC"   },
  ETH:   { coin: "ETH",   network: "ETH"   },
  BSV:   { coin: "BSV",   network: "BSV"   },
  BNB:   { coin: "BNB",   network: "BEP20" },
  SOL:   { coin: "SOL",   network: "SOL"   },
  XRP:   { coin: "XRP",   network: "XRP"   },
  ADA:   { coin: "ADA",   network: "ADA"   },
  DOGE:  { coin: "DOGE",  network: "DOGE"  },
  DOT:   { coin: "DOT",   network: "DOT"   },
  AVAX:  { coin: "AVAX",  network: "AVAX"  },
  MATIC: { coin: "MATIC", network: "POL"   },
  USDT:  { coin: "USDT",  network: "ERC20" },
  USDC:  { coin: "USDC",  network: "ERC20" },
  LINK:  { coin: "LINK",  network: "ERC20" },
  UNI:   { coin: "UNI",   network: "ERC20" },
};

// ── Core fulfillment logic ─────────────────────────────────────────────────────
async function fulfillOrder(paymentIntentId: string, metadata: Record<string, string>): Promise<void> {
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

  const leMeta = LE_COIN_NETWORK[coinSymbol.toUpperCase()];
  if (!leMeta) {
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

  try {
    const leBody: Record<string, unknown> = {
      float:               true,                     // flexible rate — no lock
      coin_from:           "USDT",
      coin_to:             leMeta.coin,
      network_from:        "ERC20",                  // USDT on Ethereum — most liquid
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
      logger.error({ orderId, msg, leBody }, "Fulfillment: LE exchange creation failed");
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
      "Fulfillment: LE exchange created — send USDT to deposit address to trigger delivery"
    );
  } catch (err: any) {
    logger.error({ err: err?.message, orderId }, "Fulfillment: unexpected error");
    await pool.query(
      `UPDATE crypto_orders SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [err?.message ?? "Fulfillment failed", orderId]
    );
  }
}

// ── Sync a single order's LE status from the LE API ───────────────────────────
// Called from the order-status polling endpoint so the frontend always gets
// the latest LE state without a separate background job.
export async function syncLeStatus(orderId: string): Promise<void> {
  const res = await pool.query(
    `SELECT le_transaction_id, le_status, status FROM crypto_orders WHERE id = $1`,
    [orderId]
  );
  if (!res.rows.length) return;
  const { le_transaction_id: leTxId, le_status: leStatus, status } = res.rows[0];

  // Only sync while LE is in-flight
  if (!leTxId || status === "completed" || status === "failed") return;
  // Don't hammer LE for terminal states we already know
  if (leStatus === "finished" || leStatus === "failed" || leStatus === "refunded") return;

  try {
    const { ok, data } = await leRequest(`/v1/transaction/${leTxId}`);
    if (!ok || !data) return;
    const d         = data as Record<string, unknown>;
    const newLeStatus = String(d.status ?? leStatus);
    const hashOut   = d.hash_out ? String(d.hash_out) : null;

    let newStatus = status as string;
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

// ── Exported webhook handler ───────────────────────────────────────────────────
export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
        "Received type: " + typeof payload + ". " +
        "FIX: Ensure webhook route is registered BEFORE app.use(express.json())."
      );
    }

    // 1. Let stripe-replit-sync verify the signature and sync to DB
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // 2. Also handle our own fulfillment (signature already verified above)
    try {
      const event = JSON.parse(payload.toString()) as { type: string; data: { object: Record<string, unknown> } };
      if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object;
        const metadata = (pi.metadata as Record<string, string>) ?? {};
        const piId     = String(pi.id ?? "");
        // Fire-and-forget — webhook must respond quickly
        void fulfillOrder(piId, metadata);
      }
    } catch (parseErr: any) {
      logger.warn({ err: parseErr?.message }, "Webhook: failed to parse event for fulfillment (non-fatal)");
    }
  }
}
