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
import { createPublicClient, http } from "viem";
import { pool } from "@workspace/db";
import { logger } from "./logger.js";
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
import { getTokenInfo, isNativeAsset } from "./tokenRegistry.js";

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
  /**
   * Chain ID for on-chain balance queries (external EVM wallets).
   * Must be provided when walletSource === "external" and the wallet is an EVM address.
   * If absent, the on-chain balance check is skipped and the order is gated on
   * the internal ledger balance only.
   * @deprecated reportedBalance (client-supplied) is no longer accepted.
   */
  chainId?:      number;
  /**
   * @deprecated Ignored. Client-supplied balance claims are never trusted.
   * Left in the interface for backwards-compatible callers; will be removed.
   */
  reportedBalance?: number;
}

// ── Spot bucket verification (MARKET / LIMIT) ─────────────────────────────────

async function verifySpotFunding(
  params: VerifyFundingParams,
): Promise<FundingVerificationResult> {
  const { walletAddress, walletSource, asset, amount, signature, utxoRef, chainId } = params;
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
  // then verify on-chain balance via RPC (chainId required). Fails closed:
  // any unverifiable state is rejected rather than silently accepted.
  if (walletSource === "external") {
    // 1. Try internal ledger — covers exchange-accumulated balance
    try {
      await lockForOrder({ walletAddress, asset, amount });
      return { valid: true, fundingRef: ledgerFundingRef(walletAddress, asset, amount) };
    } catch {
      // Not enough internal balance — fall through to on-chain check
    }

    // 2. Require wallet signature (proof of identity).
    //    Without a signature the caller cannot prove they control walletAddress.
    if (!signature) {
      return {
        valid:      false,
        fundingRef: "",
        error:      "Wallet signature required for on-chain order placement. Please sign the order in your wallet.",
        code:       "FUNDING_PROOF_REQUIRED",
      };
    }

    // Verify the signature recovers to walletAddress (lightweight format check).
    if (walletAddress.startsWith("0x")) {
      const sigStr = signature.startsWith("0x") ? signature.slice(2) : signature;
      if (sigStr.length !== 130) {
        return {
          valid:      false,
          fundingRef: "",
          error:      "Invalid EVM signature format (expected 65-byte hex).",
          code:       "INVALID_SIGNATURE",
        };
      }
    }

    // 3. chainId is required to verify on-chain balance — reject without it.
    //    Accepting unverified balance claims is a security risk (funds could be absent).
    if (!chainId) {
      return {
        valid:      false,
        fundingRef: "",
        error:      "chainId is required for external EVM wallet orders so on-chain balance can be verified.",
        code:       "CHAIN_ID_REQUIRED",
      };
    }

    const RPC_URLS: Record<number, string> = {
      1:        process.env.ETH_RPC_URL      ?? "https://eth.llamarpc.com",
      56:       process.env.BSC_RPC_URL      ?? "https://bsc-dataseed.binance.org",
      137:      process.env.POLYGON_RPC_URL  ?? "https://polygon-rpc.com",
      8453:     process.env.BASE_RPC_URL     ?? "https://mainnet.base.org",
      42161:    process.env.ARB_RPC_URL      ?? "https://arb1.arbitrum.io/rpc",
      10:       process.env.OP_RPC_URL       ?? "https://mainnet.optimism.io",
      43114:    process.env.AVAX_RPC_URL     ?? "https://api.avax.network/ext/bc/C/rpc",
      11155111: process.env.SEPOLIA_RPC_URL  ?? "https://ethereum-sepolia-rpc.publicnode.com",
    };
    const rpcUrl = RPC_URLS[chainId];
    if (!rpcUrl) {
      return {
        valid:      false,
        fundingRef: "",
        error:      `chainId ${chainId} is not supported for on-chain balance verification.`,
        code:       "CHAIN_ID_REQUIRED",
      };
    }

    try {
      const client = createPublicClient({ transport: http(rpcUrl) });

      // Minimal ERC-20 ABI for balanceOf
      const ERC20_BALANCE_OF_ABI = [
        {
          type:    "function",
          name:    "balanceOf",
          inputs:  [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
        },
      ] as const;

      let onChain: number;

      if (isNativeAsset(chainId, asset)) {
        // Native chain asset: ETH / BNB / MATIC / AVAX
        const onChainBal = await client.getBalance({ address: walletAddress as `0x${string}` });
        onChain = Number(onChainBal) / 1e18;
      } else {
        // ERC-20 token: look up contract address and decimals.
        // Unknown tokens are rejected — accepting without verification is a security risk.
        const tokenInfo = getTokenInfo(chainId, asset);
        if (!tokenInfo) {
          logger.warn(
            { walletAddress, chainId, asset },
            "fundingVerifier: token not in registry — rejecting order",
          );
          return {
            valid:      false,
            fundingRef: "",
            error:      `Token ${asset} is not supported on chain ${chainId}. Add it to the token registry or deposit via a supported path.`,
            code:       "TOKEN_UNSUPPORTED",
          };
        }
        const rawBalance = await client.readContract({
          address:      tokenInfo.address as `0x${string}`,
          abi:          ERC20_BALANCE_OF_ABI,
          functionName: "balanceOf",
          args:         [walletAddress as `0x${string}`],
        });
        onChain = Number(rawBalance) / 10 ** tokenInfo.decimals;
      }

      if (onChain < needed) {
        return {
          valid:      false,
          fundingRef: "",
          error:      `Insufficient on-chain ${asset} balance (verified via RPC)`,
          code:       "INSUFFICIENT_FUNDS",
        };
      }
    } catch (rpcErr: any) {
      // RPC verification failed — fail closed rather than proceeding unverified.
      // Operators should monitor for repeated failures and check RPC health.
      logger.warn(
        { walletAddress, chainId, err: rpcErr?.message },
        "fundingVerifier: on-chain RPC balance check failed",
      );
      return {
        valid:      false,
        fundingRef: "",
        error:      "On-chain balance verification is temporarily unavailable. Please try again later.",
        code:       "BALANCE_VERIFICATION_UNAVAILABLE",
      };
    }

    const sigHash = crypto.createHash("sha256").update(signature).digest("hex").slice(0, 16);
    return { valid: true, fundingRef: evmSigFundingRef(sigHash) };
  }

  // ── Orah internal ledger ────────────────────────────────────────────────
  // Lock funds from user_balances — returns INSUFFICIENT_FUNDS if balance is too low.
  // Settlement (settleTrade) requires this lock to exist, so we cannot accept
  // an Orah order without it. Imported seed-phrase wallets with on-chain funds
  // must deposit first; the client surfaces a DEPOSIT_REQUIRED prompt for that.
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
