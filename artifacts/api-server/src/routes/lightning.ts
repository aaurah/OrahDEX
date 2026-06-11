/**
 * lightning.ts — Lightning Network deposit/withdrawal routes for OrahDEX
 *
 * POST /api/lightning/invoice         - create BOLT-11 invoice for BTC deposit
 * GET  /api/lightning/invoice/:rHash  - poll invoice settlement status
 * POST /api/lightning/withdraw        - pay a BOLT-11 invoice (BTC withdrawal)
 * GET  /api/lightning/status          - check LND node connectivity
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import {
  isLndConfigured,
  pingLnd,
  createInvoice,
  checkInvoice,
  sendPayment,
  getChannelBalance,
} from "../lib/lightningClient.js";
import { creditAvailable, debitAvailable } from "../lib/ledger.js";
import { verifyEvmSignature } from "../lib/walletAuth.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── DB bootstrap: ensure lightning_invoices table exists ──────────────────────

async function ensureLightningTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lightning_invoices (
      r_hash          TEXT        PRIMARY KEY,
      wallet_address  TEXT        NOT NULL,
      amount_sat      INTEGER     NOT NULL,
      payment_request TEXT        NOT NULL,
      status          TEXT        NOT NULL DEFAULT 'pending',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

// Run once at startup (errors are non-fatal; routes will fail gracefully)
ensureLightningTable().catch(err => {
  logger.warn({ err: err?.message }, "lightning: failed to ensure lightning_invoices table");
});

// ── Validation helpers ────────────────────────────────────────────────────────

/** EVM 0x-prefixed address OR BSV/BTC base58 address */
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const BSV_ADDR_RE = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;

function isValidWalletAddress(addr: string): boolean {
  return EVM_ADDR_RE.test(addr) || BSV_ADDR_RE.test(addr);
}

/**
 * Decode a BOLT-11 invoice to extract the amount in satoshis.
 *
 * BOLT-11 format: lnbc{amount}{multiplier}1...
 * Multipliers: m=milli-BTC, u=micro-BTC, n=nano-BTC, p=pico-BTC
 * If no amount/multiplier is present the invoice is "any-amount".
 *
 * Examples:
 *   lnbc100n1 → 10 sat  (100 nano-BTC = 10 sat)
 *   lnbc1m1   → 100 000 sat
 *   lnbc50u1  → 5 000 sat
 */
function decodeBolt11AmountSat(paymentRequest: string): number | null {
  // Match: lnbc{digits}{optional-multiplier}1
  const match = paymentRequest.toLowerCase().match(/^lnbc(\d+)([munp]?)1/);
  if (!match) return null;

  const amount     = parseInt(match[1]!, 10);
  const multiplier = match[2] ?? "";

  // 1 BTC = 100_000_000 sat
  const BTC_TO_SAT = 100_000_000;
  switch (multiplier) {
    case "m": return Math.round(amount * BTC_TO_SAT * 0.001);          // milli-BTC
    case "u": return Math.round(amount * BTC_TO_SAT * 0.000_001);      // micro-BTC
    case "n": return Math.round(amount * BTC_TO_SAT * 0.000_000_001);  // nano-BTC
    case "p": return Math.round(amount * BTC_TO_SAT * 0.000_000_000_001); // pico-BTC
    case "":  return Math.round(amount * BTC_TO_SAT);                   // whole BTC
    default:  return null;
  }
}

// ── POST /api/lightning/invoice ───────────────────────────────────────────────

router.post("/lightning/invoice", async (req, res) => {
  const { walletAddress, amountSat } = req.body ?? {};

  if (!walletAddress || typeof walletAddress !== "string" || !isValidWalletAddress(walletAddress)) {
    res.status(400).json({ error: "walletAddress must be a valid EVM (0x…) or BSV (1…/3…) address" });
    return;
  }

  const sat = Number(amountSat);
  if (!Number.isInteger(sat) || sat < 1_000 || sat > 10_000_000) {
    res.status(400).json({ error: "amountSat must be an integer between 1000 and 10000000 (1k–10M sat)" });
    return;
  }

  try {
    const memo     = `OrahDEX deposit for ${walletAddress}`;
    const invoice  = await createInvoice({ amountSat: sat, memo });

    // Persist to DB
    await pool.query(
      `INSERT INTO lightning_invoices (r_hash, wallet_address, amount_sat, payment_request, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (r_hash) DO NOTHING`,
      [invoice.rHash, walletAddress.toLowerCase(), sat, invoice.paymentRequest],
    );

    res.json({
      paymentRequest: invoice.paymentRequest,
      rHash:          invoice.rHash,
      amountSat:      invoice.amountSat,
      expirySeconds:  invoice.expirySeconds,
    });
  } catch (err: any) {
    if (err?.message === "LND_NOT_CONFIGURED") {
      res.status(503).json({ error: "Lightning Network node is not configured on this server" });
      return;
    }
    logger.error({ err: err?.message }, "lightning: createInvoice failed");
    res.status(500).json({ error: "Failed to create Lightning invoice" });
  }
});

// ── GET /api/lightning/invoice/:rHash ─────────────────────────────────────────

router.get("/lightning/invoice/:rHash", async (req, res) => {
  const rHash = (req.params.rHash ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");

  if (!rHash || rHash.length < 32) {
    res.status(400).json({ error: "Invalid rHash" });
    return;
  }

  try {
    // Look up DB record first (must exist to credit the right wallet)
    const { rows } = await pool.query<{
      wallet_address: string;
      amount_sat: number;
      status: string;
    }>(
      `SELECT wallet_address, amount_sat, status FROM lightning_invoices WHERE r_hash = $1`,
      [rHash],
    );

    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    // Already credited — return settled immediately without hitting LND again
    if (row.status === "settled") {
      res.json({ settled: true, amountSat: row.amount_sat, alreadyCredited: true });
      return;
    }

    const status = await checkInvoice(rHash);

    if (status.settled) {
      // Credit internal ledger (idempotent via DB status check above)
      const btcAmount = (row.amount_sat / 1e8).toFixed(8);
      await creditAvailable(row.wallet_address, "BTC", btcAmount);

      // Mark DB row as settled
      await pool.query(
        `UPDATE lightning_invoices SET status = 'settled' WHERE r_hash = $1`,
        [rHash],
      );

      logger.info({ rHash, walletAddress: row.wallet_address, amountSat: row.amount_sat }, "lightning: deposit settled and credited");

      res.json({ settled: true, amountSat: status.amountSat || row.amount_sat, crediting: true });
    } else {
      res.json({ settled: false });
    }
  } catch (err: any) {
    if (err?.message === "LND_NOT_CONFIGURED") {
      res.status(503).json({ error: "Lightning Network node is not configured on this server" });
      return;
    }
    logger.error({ err: err?.message, rHash }, "lightning: checkInvoice failed");
    res.status(500).json({ error: "Failed to check invoice status" });
  }
});

// ── POST /api/lightning/withdraw ──────────────────────────────────────────────

router.post("/lightning/withdraw", async (req, res) => {
  const { walletAddress, paymentRequest, signature, nonce } = req.body ?? {};

  if (!walletAddress || typeof walletAddress !== "string" || !isValidWalletAddress(walletAddress)) {
    res.status(400).json({ error: "walletAddress must be a valid EVM (0x…) or BSV (1…/3…) address" });
    return;
  }

  if (!paymentRequest || typeof paymentRequest !== "string" || !paymentRequest.toLowerCase().startsWith("lnbc")) {
    res.status(400).json({ error: "paymentRequest must be a valid BOLT-11 invoice (starts with lnbc)" });
    return;
  }

  if (!signature || !nonce) {
    res.status(400).json({ error: "signature and nonce are required" });
    return;
  }

  // Verify EVM signature (only supported for EVM wallets in this route)
  if (EVM_ADDR_RE.test(walletAddress)) {
    try {
      verifyEvmSignature(walletAddress, nonce, signature);
    } catch (err: any) {
      res.status(401).json({ error: `Signature verification failed: ${err?.message}` });
      return;
    }
  }

  // Decode amount from BOLT-11
  const amountSat = decodeBolt11AmountSat(paymentRequest);
  if (amountSat === null || amountSat <= 0) {
    res.status(400).json({ error: "Could not parse amount from BOLT-11 invoice" });
    return;
  }

  const btcAmount = (amountSat / 1e8).toFixed(8);

  try {
    // Debit BTC balance before sending (throws INSUFFICIENT_FUNDS if balance too low)
    await debitAvailable(walletAddress.toLowerCase(), "BTC", btcAmount);

    // Send Lightning payment
    let payment;
    try {
      payment = await sendPayment({ paymentRequest });
    } catch (payErr: any) {
      // Refund the deducted balance if payment failed
      await creditAvailable(walletAddress.toLowerCase(), "BTC", btcAmount).catch(refundErr => {
        logger.error({ refundErr: refundErr?.message, walletAddress, btcAmount }, "lightning: CRITICAL — failed to refund balance after payment failure");
      });
      throw payErr;
    }

    logger.info({ paymentHash: payment.paymentHash, walletAddress, amountSat, feeSat: payment.feeSat }, "lightning: withdrawal sent");

    res.json({ success: true, paymentHash: payment.paymentHash, feeSat: payment.feeSat });
  } catch (err: any) {
    if (err?.message === "LND_NOT_CONFIGURED") {
      res.status(503).json({ error: "Lightning Network node is not configured on this server" });
      return;
    }
    if (err?.message?.startsWith("INSUFFICIENT_FUNDS")) {
      res.status(402).json({ error: "Insufficient BTC balance for this withdrawal" });
      return;
    }
    logger.error({ err: err?.message, walletAddress }, "lightning: sendPayment failed");
    res.status(500).json({ error: `Lightning payment failed: ${err?.message}` });
  }
});

// ── GET /api/lightning/status ─────────────────────────────────────────────────

router.get("/lightning/status", async (_req, res) => {
  const configured = isLndConfigured();
  const [online, balance] = await Promise.all([
    pingLnd(),
    getChannelBalance(),
  ]);
  res.json({ configured, online, balance });
});

export default router;
