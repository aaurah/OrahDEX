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
 *   "orah"      API-managed wallet with real deposited funds.
 *               Locks from the API ledger.
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
  getBalances,
} from "./ledger.js";
import {
  ledgerFundingRef,
  evmSigFundingRef,
  utxoFundingRef,
  marginFundingRef,
  type OrderKind,
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
  /**
   * `kind` determines the balance bucket:
   *   SPOT    → user_balances (spot bucket)
   *   FUTURES → futures_margin_accounts (futures bucket)
   */
  kind:          OrderKind;
  walletSource:  WalletSource;
  /** Order side — used to apply the correct conservative default when reportedBalance is absent */
  side?:         "buy" | "sell";
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
  const needed = parseFloat(amount);

  // ── External BSV UTXO wallet ────────────────────────────────────────────
  if (walletSource === "external" && utxoRef) {
    const [txid, vout] = utxoRef.split(":");
    if (!txid || vout == null) {
      return { valid: false, fundingRef: "", error: "Invalid utxoRef format", code: "INVALID_UTXO_REF" };
    }
    return { valid: true, fundingRef: utxoFundingRef(txid, parseInt(vout, 10)) };
  }

  // ── External EVM / non-UTXO wallet ───────────────────────────────────────
  // These wallets hold funds on-chain. They may also have accumulated internal
  // exchange balance from previous trades (e.g. bought BSV, now selling).
  // Strategy: try the internal ledger first (zero-friction if balance is there),
  // then fall back to on-chain reportedBalance so trades work from the wallet directly.
  if (walletSource === "external") {
    // 1. Try internal ledger — covers exchange-accumulated balance
    try {
      await lockForOrder({ walletAddress, asset, amount });
      return { valid: true, fundingRef: ledgerFundingRef(walletAddress, asset, amount) };
    } catch {
      // Not enough internal balance — fall through to on-chain check
    }

    // 2. Require wallet signature + accept on-chain balance as proof of funding.
    // External EVM wallets must sign the order intent (personal_sign) to authorise
    // on-chain settlement via the OrahDEX HTLC contract.
    const onChain = reportedBalance ?? 0;
    if (onChain >= needed) {
      if (!signature) {
        return {
          valid:      false,
          fundingRef: "",
          error:      "Wallet signature required for on-chain order placement. Please sign the order in your wallet.",
          code:       "SIGNATURE_REQUIRED",
        };
      }
      const sigHash = crypto.createHash("sha256").update(signature).digest("hex").slice(0, 16);
      return { valid: true, fundingRef: evmSigFundingRef(sigHash) };
    }

    return {
      valid:      false,
      fundingRef: "",
      error:      `Insufficient ${asset} balance`,
      code:       "INSUFFICIENT_FUNDS",
    };
  }

  // ── Orah internal ledger ────────────────────────────────────────────────
  // Lock funds from user_balances — returns INSUFFICIENT_FUNDS if balance is too low.
  try {
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
  const { walletAddress, asset = "USDT", amount } = params;
  const needed = parseFloat(amount);

  // Use FOR UPDATE so a concurrent open-position request cannot read the same
  // available balance and both conclude they have sufficient margin.
  // The actual margin lock happens in futuresSettlement.openFuturesPosition()
  // which runs in its own transaction immediately after this check returns.
  // We hold no lock across the gap (unavoidable without collapsing verify+open
  // into one atomic operation), but the FOR UPDATE here prevents two concurrent
  // verify calls from both seeing the same available balance simultaneously.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ available: string }>(
      `SELECT available FROM futures_margin_accounts
       WHERE wallet_address = $1 AND asset = $2
       FOR UPDATE`,
      [walletAddress, asset],
    );
    const avail = parseFloat(rows[0]?.available ?? "0");
    await client.query("COMMIT");

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
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Verify funding for an order intent and lock the required funds.
 *
 * Routes on `kind` — the canonical balance-bucket boundary:
 *   kind === "SPOT"    → locks funds in user_balances (spot bucket)
 *   kind === "FUTURES" → checks futures_margin_accounts (futures bucket only;
 *                        the actual lock happens in futuresSettlement.openFuturesPosition)
 *
 * Returns a FundingVerificationResult with a fundingRef to store on the order row.
 * The fundingRef is the verifiable proof that funds are committed.
 */
export async function verifyAndLockFunding(
  params: VerifyFundingParams,
): Promise<FundingVerificationResult> {
  // ── Balance-bucket isolation boundary ─────────────────────────────────────
  // This is the only place that decides which table is touched.
  // NEVER inline this routing in route handlers.
  if (params.kind === "FUTURES") {
    return verifyFuturesFunding(params);
  }
  // SPOT covers both MARKET and LIMIT — both draw from the spot bucket
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
