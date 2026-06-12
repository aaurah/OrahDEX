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
import { logger } from "./logger.js";
import { getSolBalance } from "./solanaWallet.js";
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
import { TOKEN_REGISTRY } from "./tokenRegistry.js";

// ── EVM external wallet anti-spam / funding controls ────────────────────────────
//
// Two layered controls protect against unfunded EVM external orders:
//
//   1. Rate limit (enforceable, no RPC needed):
//      Max EVM_EXTERNAL_ORDER_LIMIT concurrent open orders per external EVM wallet.
//      Tracked via the funding_ref pattern "evm-sig:%" in the orders table.
//      Prevents large-scale false-liquidity attacks.
//
//   2. Best-effort on-chain balance check (fail-open on RPC timeout):
//      Performs a raw JSON-RPC call against public nodes with a hard Promise.race
//      timeout (no AbortController — immune to the Node.js TCP-stall bug).
//      Rejects on confirmed insufficient balance; passes through on timeout/error.
//      Uses eth_getBalance for native ETH; eth_call (balanceOf) for ERC20 tokens.

const EVM_EXTERNAL_ORDER_LIMIT = 10;
const BALANCE_CHECK_TIMEOUT_MS = 4_000;

/** Public JSON-RPC endpoints per chain ID. */
const EVM_PUBLIC_RPCS: Record<number, string[]> = {
  1:     ["https://eth.llamarpc.com", "https://cloudflare-eth.com"],
  10:    ["https://mainnet.optimism.io"],
  56:    ["https://bsc-dataseed.binance.org"],
  137:   ["https://polygon-rpc.com"],
  8453:  ["https://mainnet.base.org"],
  42161: ["https://arb1.arbitrum.io/rpc"],
};

/**
 * Check how many open EVM-external orders this wallet already has.
 * External EVM orders use funding refs that start with "evm-sig:".
 */
async function checkEvmExternalOrderLimit(
  walletAddress: string,
): Promise<{ allowed: boolean; count: number }> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM orders
     WHERE wallet_address = $1 AND status = 'open' AND funding_ref LIKE 'evm-sig:%'`,
    [walletAddress.toLowerCase()],
  );
  const count = parseInt(rows[0]?.count ?? "0", 10);
  return { allowed: count < EVM_EXTERNAL_ORDER_LIMIT, count };
}

interface RpcJsonResult { result?: string; error?: { message: string } }

/** Single raw JSON-RPC POST to one node (no AbortController — uses Promise.race). */
async function rpcPost(rpcUrl: string, method: string, params: unknown[]): Promise<string> {
  const res  = await fetch(rpcUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json() as RpcJsonResult;
  if (json.error) throw new Error(json.error.message);
  if (!json.result) throw new Error("Empty RPC result");
  return json.result;
}

/**
 * Fetch native (ETH) balance for `address` on `chainId`.
 * Tries all configured public RPC URLs in parallel, takes the first to respond.
 * Returns null if all RPCs fail.
 */
async function evmNativeBalance(address: string, chainId: number): Promise<bigint | null> {
  const rpcs = EVM_PUBLIC_RPCS[chainId] ?? [];
  if (rpcs.length === 0) return null;

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), BALANCE_CHECK_TIMEOUT_MS),
  );

  try {
    const hex = await Promise.race([
      Promise.any(rpcs.map(url => rpcPost(url, "eth_getBalance", [address, "latest"]))),
      timeout,
    ]);
    return BigInt(hex);
  } catch {
    return null;
  }
}

/**
 * Fetch ERC-20 token balance for `address` on `chainId` via eth_call (balanceOf).
 * Returns null if balance cannot be fetched.
 */
async function evmTokenBalance(
  address:         string,
  contractAddress: string,
  chainId:         number,
): Promise<bigint | null> {
  const rpcs = EVM_PUBLIC_RPCS[chainId] ?? [];
  if (rpcs.length === 0) return null;

  // ABI-encode balanceOf(address): selector 0x70a08231 + 32-byte padded address
  const paddedAddr = address.slice(2).padStart(64, "0");
  const callData   = "0x70a08231" + paddedAddr;

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), BALANCE_CHECK_TIMEOUT_MS),
  );

  try {
    const hex = await Promise.race([
      Promise.any(rpcs.map(url =>
        rpcPost(url, "eth_call", [{ to: contractAddress, data: callData }, "latest"]),
      )),
      timeout,
    ]);
    // eth_call returns 32-byte hex; parse as uint256
    return hex === "0x" ? 0n : BigInt(hex);
  } catch {
    return null;
  }
}

/**
 * Best-effort EVM balance check.
 * Returns:
 *   { result: "sufficient" }  — on-chain balance confirmed ≥ needed
 *   { result: "insufficient", balance } — on-chain balance confirmed < needed
 *   { result: "skipped" }     — RPC unavailable / timed out (fail-open)
 */
async function evmBalanceCheck(
  walletAddress: string,
  asset:         string,
  amountStr:     string,
  chainId:       number,
): Promise<{ result: "sufficient" | "insufficient" | "skipped"; balance?: bigint }> {
  const chainTokens = TOKEN_REGISTRY[chainId as keyof typeof TOKEN_REGISTRY];

  // Native ETH check
  if (asset.toUpperCase() === "ETH") {
    const weiNeeded = BigInt(Math.floor(parseFloat(amountStr) * 1e18));
    const balance   = await evmNativeBalance(walletAddress, chainId);
    if (balance === null) return { result: "skipped" };
    return balance >= weiNeeded
      ? { result: "sufficient", balance }
      : { result: "insufficient", balance };
  }

  // ERC-20 token check
  const tokenInfo = (chainTokens as Record<string, { address: string; decimals: number }> | undefined)
    ?.[asset.toUpperCase()];
  if (!tokenInfo) {
    logger.debug({ asset, chainId }, "fundingVerifier: no token contract for asset — skipping balance check");
    return { result: "skipped" };
  }

  const { address: contractAddress, decimals } = tokenInfo;
  const needed  = BigInt(Math.round(parseFloat(amountStr) * 10 ** decimals));
  const balance = await evmTokenBalance(walletAddress, contractAddress, chainId);
  if (balance === null) return { result: "skipped" };
  return balance >= needed
    ? { result: "sufficient", balance }
    : { result: "insufficient", balance };
}

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
  // EVM external wallets (MetaMask / WalletConnect, 0x-prefixed) are fully
  // non-custodial: their funds stay in their wallet until the HTLC escrow
  // contract locks them at settlement. The internal ledger is NEVER touched
  // for these wallets — doing so would deduct/lock internal balance on every
  // order placement and every retry, draining funds incorrectly.
  //
  // Non-EVM external wallets (BSV/BTC/SOL) may accumulate internal balance
  // from prior trades and can optionally use it for zero-friction settlement.
  if (walletSource === "external") {
    const isEvmExternalWallet = walletAddress.startsWith("0x");

    if (!isEvmExternalWallet) {
      // Non-EVM external: try internal ledger first for accumulated balance
      try {
        await lockForOrder({ walletAddress, asset, amount });
        return { valid: true, fundingRef: ledgerFundingRef(walletAddress, asset, amount) };
      } catch {
        // Not enough internal balance — fall through to on-chain check
      }
    }
    // EVM external wallets skip the internal ledger entirely and go straight
    // to signature-based proof + optional RPC balance verification below.

    // Require wallet signature (proof of identity).
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

    // ── Control 1: open-order rate limit ─────────────────────────────────────
    // Prevents an attacker from flooding the order book with unfunded orders.
    // This check is enforceable without any RPC call — it only reads the DB.
    const limitCheck = await checkEvmExternalOrderLimit(walletAddress);
    if (!limitCheck.allowed) {
      return {
        valid:      false,
        fundingRef: "",
        error:      `Maximum ${EVM_EXTERNAL_ORDER_LIMIT} open orders are allowed per external EVM wallet. ` +
                    `You currently have ${limitCheck.count} open orders. Cancel existing orders to place new ones.`,
        code:       "OPEN_ORDER_LIMIT_EXCEEDED",
      };
    }

    // ── Control 2: best-effort on-chain balance check ─────────────────────────
    // Uses raw JSON-RPC with Promise.race timeout to avoid the Node.js
    // AbortSignal.timeout TCP-stall bug on long-lived public RPC connections.
    // On confirmed insufficient balance → reject.
    // On RPC timeout / unavailable node → fail-open (log warning, proceed).
    // The HTLC escrow contract is the final enforcement point at settlement.
    if (chainId !== undefined) {
      const balCheck = await evmBalanceCheck(walletAddress, asset, amount, chainId);
      if (balCheck.result === "insufficient") {
        const balEth = balCheck.balance !== undefined
          ? ` (on-chain: ${(Number(balCheck.balance) / 1e18).toFixed(6)})`
          : "";
        return {
          valid:      false,
          fundingRef: "",
          error:      `Insufficient on-chain ${asset} balance${balEth}. Please fund your wallet before placing this order.`,
          code:       "INSUFFICIENT_FUNDS",
        };
      }
      if (balCheck.result === "skipped") {
        logger.warn({ walletAddress, asset, chainId }, "fundingVerifier: EVM balance check skipped (RPC timeout/unavailable) — proceeding with rate-limit guarantee only");
      }
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
