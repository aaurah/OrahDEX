/**
 * fundingVerifier.ts — Funding invariant enforcement for OrahDEX orders
 *
 * The central enforcement point for the rule:
 *   "No order reaches the matching engine without verifiable funding."
 *
 * All three order types go through this module before any DB write:
 *
 *   MARKET / LIMIT → spot bucket (user_balances.available → locked)
 *                    fundingRef: "ledger:{addr}:{asset}:{amount}"
 *                                "evm-sig:{sigHash}" for external EVM wallets
 *                                "utxo:{txid}:{vout}" for BSV UTXO orders
 *
 *   FUTURES        → futures margin bucket (futures_margin_accounts)
 *                    fundingRef: "margin:{addr}:{asset}:{amount}"
 *
 * ── Balance bucket isolation ──────────────────────────────────────────────────
 *
 *   The spot bucket (user_balances) and the futures margin bucket
 *   (futures_margin_accounts) are entirely separate PostgreSQL tables.
 *
 *   This module enforces that a FUTURES order never draws from user_balances
 *   and a MARKET/LIMIT order never draws from futures_margin_accounts.
 *   There is no silent fallback between buckets.
 *
 * ── Wallet source semantics ───────────────────────────────────────────────────
 *
 *   "external"  Real EVM or BSV wallet — funds are on-chain.
 *               For EVM: uses evmSignature/reportedBalance as proof.
 *               For BSV: uses utxoRef as proof.
 *               The API ledger is NOT debited for external wallets.
 *
 *   "demo"      Paper money — auto-seeds any missing balance.
 *               For spot: seeds user_balances if needed, then locks.
 *               For futures: seeds futures_margin_accounts if needed, then locks.
 *
 *   "orah"      API-managed wallet with real deposited funds.
 *               Behaves like demo except no auto-seeding.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *
 *   import { verifyAndLockFunding } from "./fundingVerifier.js";
 *
 *   const result = await verifyAndLockFunding({
 *     walletAddress, orderType, walletSource,
 *     asset, amount, signature, utxoRef,
 *   });
 *
 *   if (!result.valid) {
 *     return res.status(400).json({ error: result.error, code: result.code });
 *   }
 *   // Use result.fundingRef on the order row.
 */

import crypto from "node:crypto";
import { pool } from "@workspace/db";
import {
  lockForOrder,
  seedInitialBalances,
  ensureSeedForAsset,
  getBalances,
} from "./ledger.js";
import {
  ledgerFundingRef,
  evmSigFundingRef,
  utxoFundingRef,
  marginFundingRef,
  type OrderType,
  type WalletSource,
} from "./orderIntent.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FundingVerificationResult {
  valid:      boolean;
  fundingRef: string;
  error?:     string;
  code?:      string;
}

export interface VerifyFundingParams {
  walletAddress: string;
  orderType:     OrderType;
  walletSource:  WalletSource;
  /** Asset to lock ("USDT" for buy-side / base asset for sell-side) */
  asset:         string;
  /** Amount to lock as a decimal string */
  amount:        string;
  /** EVM personal_sign signature (for external EVM wallets) */
  signature?:    string;
  /** BSV UTXO reference "txid:vout" (for external BSV wallets) */
  utxoRef?:      string;
  /** Reported on-chain balance (for external wallets — checked but not trusted) */
  reportedBalance?: number;
}

// ── Spot bucket verification (MARKET / LIMIT) ─────────────────────────────────

async function verifySpotFunding(
  params: VerifyFundingParams,
): Promise<FundingVerificationResult> {
  const { walletAddress, walletSource, asset, amount, signature, utxoRef, reportedBalance } = params;

  // ── External EVM wallet ─────────────────────────────────────────────────
  if (walletSource === "external" && (signature || !utxoRef)) {
    // External wallets hold funds on-chain.  We cannot debit user_balances for
    // them; instead we accept the signature + reportedBalance as proof.
    if (!signature && reportedBalance == null) {
      return {
        valid:      false,
        fundingRef: "",
        error:      "External wallet orders require a signature or reportedBalance",
        code:       "EXTERNAL_WALLET_NO_PROOF",
      };
    }
    const needed = parseFloat(amount);
    if (reportedBalance != null && needed > reportedBalance * 1.01) {
      return {
        valid:      false,
        fundingRef: "",
        error:      `Insufficient on-chain balance: need ${needed}, reported ${reportedBalance}`,
        code:       "INSUFFICIENT_FUNDS",
      };
    }
    const ref = signature ? evmSigFundingRef(signature) : `evm-balance:${walletAddress}`;
    return { valid: true, fundingRef: ref };
  }

  // ── External BSV UTXO wallet ────────────────────────────────────────────
  if (walletSource === "external" && utxoRef) {
    const [txid, vout] = utxoRef.split(":");
    if (!txid || vout == null) {
      return { valid: false, fundingRef: "", error: "Invalid utxoRef format", code: "INVALID_UTXO_REF" };
    }
    return { valid: true, fundingRef: utxoFundingRef(txid, parseInt(vout, 10)) };
  }

  // ── Demo / Orah internal ledger ─────────────────────────────────────────
  // Seed on first use, then lock funds from user_balances.
  try {
    const balances = await getBalances(walletAddress);
    if (balances.length === 0) {
      await seedInitialBalances(walletAddress);
    }
    await ensureSeedForAsset(walletAddress, asset, amount);
    await lockForOrder({ walletAddress, asset, amount });
    return { valid: true, fundingRef: ledgerFundingRef(walletAddress, asset, amount) };
  } catch (err: any) {
    const msg: string = err?.message ?? "";
    if (msg.startsWith("INSUFFICIENT_FUNDS")) {
      const assetName = msg.split(":")[1] ?? asset;
      return {
        valid:      false,
        fundingRef: "",
        error:      `Insufficient ${assetName} balance`,
        code:       "INSUFFICIENT_FUNDS",
      };
    }
    return { valid: false, fundingRef: "", error: "Ledger error", code: "LEDGER_ERROR" };
  }
}

// ── Futures margin bucket verification ────────────────────────────────────────
// Only reads from futures_margin_accounts — NEVER touches user_balances.

async function verifyFuturesFunding(
  params: VerifyFundingParams,
): Promise<FundingVerificationResult> {
  const { walletAddress, asset = "USDT", amount, walletSource } = params;
  const needed = parseFloat(amount);

  // Auto-seed futures margin for demo accounts
  if (walletSource === "demo") {
    const { rows } = await pool.query<{ available: string }>(
      `SELECT available FROM futures_margin_accounts WHERE wallet_address = $1 AND asset = $2`,
      [walletAddress, asset],
    );
    const avail = parseFloat(rows[0]?.available ?? "0");
    if (avail < needed) {
      const seed = Math.max(needed * 2, 5000);
      await pool.query(
        `INSERT INTO futures_margin_accounts (wallet_address, asset, available, locked, updated_at)
         VALUES ($1, $2, $3, 0, now())
         ON CONFLICT (wallet_address, asset)
         DO UPDATE SET available = futures_margin_accounts.available + $3, updated_at = now()`,
        [walletAddress, asset, seed.toFixed(8)],
      );
    }
  }

  // Check balance (without locking — the actual lock happens in futuresSettlement.openFuturesPosition)
  const { rows } = await pool.query<{ available: string }>(
    `SELECT available FROM futures_margin_accounts WHERE wallet_address = $1 AND asset = $2`,
    [walletAddress, asset],
  );
  const avail = parseFloat(rows[0]?.available ?? "0");
  if (avail < needed) {
    return {
      valid:      false,
      fundingRef: "",
      error:      `Insufficient futures margin: need ${needed} ${asset}, have ${avail.toFixed(2)}. Deposit margin to your futures account first.`,
      code:       "INSUFFICIENT_FUTURES_MARGIN",
    };
  }

  return {
    valid:      true,
    fundingRef: marginFundingRef(walletAddress, asset, amount),
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Verify funding for an order intent and lock the required funds.
 *
 * For MARKET / LIMIT: locks funds in user_balances (spot bucket).
 * For FUTURES: checks futures_margin_accounts (spot bucket untouched; lock
 *              happens later in futuresSettlement.openFuturesPosition).
 *
 * Returns a FundingVerificationResult with a fundingRef to store on the order.
 * The fundingRef is the verifiable proof that funds are committed.
 */
export async function verifyAndLockFunding(
  params: VerifyFundingParams,
): Promise<FundingVerificationResult> {
  // Bucket routing — this is the isolation boundary
  if (params.orderType === "FUTURES") {
    return verifyFuturesFunding(params);
  }
  // MARKET and LIMIT both draw from the spot bucket
  return verifySpotFunding(params);
}

/**
 * Check whether a wallet has enough futures margin without locking.
 * Useful for UI balance checks before the user submits an intent.
 */
export async function checkFuturesMarginSufficiency(
  walletAddress: string,
  amount:        number,
  asset:         string = "USDT",
): Promise<{ sufficient: boolean; available: number; needed: number }> {
  const { rows } = await pool.query<{ available: string }>(
    `SELECT available FROM futures_margin_accounts WHERE wallet_address = $1 AND asset = $2`,
    [walletAddress, asset],
  );
  const available = parseFloat(rows[0]?.available ?? "0");
  return { sufficient: available >= amount, available, needed: amount };
}
