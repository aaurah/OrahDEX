/**
 * walletAuth.ts — Shared EVM wallet-signature helpers for user-facing auth.
 *
 * Provides the same challenge/verify pattern used for admin wallet auth
 * (admin.ts), extended to cover user withdrawal and order/trade flows.
 *
 * Exported utilities
 * ──────────────────
 *  recoverEthAddress        — recover the signer address from a personal_sign
 *  verifyEvmSignature       — assert signer === walletAddress (throws on mismatch)
 *  issueWithdrawChallenge   — mint a server-nonce for the withdrawal flow
 *  verifyWithdrawSignature  — consume + verify the withdrawal nonce
 *  buildOrderAuthMessage    — canonical message for spot order authorisation
 *  buildExchangeAuthMessage — canonical message for exchange-swap authorisation
 */

import crypto from "node:crypto";
import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";

// ── EVM personal_sign recovery ────────────────────────────────────────────────

function hashPersonalMessage(message: string): Uint8Array {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
  const buf = Buffer.concat([Buffer.from(prefix, "utf8"), Buffer.from(message, "utf8")]);
  return keccak_256(buf);
}

export function recoverEthAddress(message: string, sigHex: string): string {
  const sigStr = sigHex.startsWith("0x") ? sigHex.slice(2) : sigHex;
  if (sigStr.length !== 130) throw new Error("Invalid signature length");

  const rBytes = Buffer.from(sigStr.slice(0, 64), "hex");
  const sBytes = Buffer.from(sigStr.slice(64, 128), "hex");
  const v      = parseInt(sigStr.slice(128, 130), 16);
  const recovery = v >= 27 ? v - 27 : v;

  const msgHash = hashPersonalMessage(message);

  // noble-secp256k1 v3 recovered format: [recovery_bit(1), r(32), s(32)]
  const recoveredSig = new Uint8Array(65);
  recoveredSig[0] = recovery;
  recoveredSig.set(rBytes, 1);
  recoveredSig.set(sBytes, 33);

  // Returns compressed pubkey (33 bytes); prehash:false because msgHash is keccak256 already
  const compressedPubKey   = secp.recoverPublicKey(recoveredSig, msgHash, { prehash: false });
  // Expand to uncompressed (65 bytes: 0x04 + x + y)
  const uncompressedPubKey = secp.Point.fromBytes(compressedPubKey).toBytes(false);
  // Derive Ethereum address: keccak256(x || y), take last 20 bytes
  const pubKeyBytes = uncompressedPubKey.slice(1);
  const hash        = keccak_256(pubKeyBytes);
  return "0x" + Buffer.from(hash).slice(-20).toString("hex");
}

/**
 * Verify that `signature` (MetaMask personal_sign) was produced by the
 * private key corresponding to `walletAddress` over `message`.
 * Throws a descriptive Error if the check fails.
 */
export function verifyEvmSignature(
  walletAddress: string,
  message:       string,
  signature:     string,
): void {
  let recovered: string;
  try {
    recovered = recoverEthAddress(message, signature);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid signature format: ${msg}`);
  }
  if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error("Signature does not match wallet address");
  }
}

// ── Withdrawal nonce store ────────────────────────────────────────────────────

interface WithdrawNonce {
  nonce:     string;
  message:   string;
  expiresAt: number;
}

const withdrawNonces = new Map<string, WithdrawNonce>();

const WITHDRAW_NONCE_TTL_MS  = 5 * 60 * 1_000;  // 5 minutes
const WITHDRAW_NONCE_SWEEP   = 5 * 60 * 1_000;  // sweep interval

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of withdrawNonces.entries()) {
    if (v.expiresAt < now) withdrawNonces.delete(k);
  }
}, WITHDRAW_NONCE_SWEEP).unref();

/**
 * Issue a single-use, 5-minute withdrawal challenge for an EVM wallet.
 * Returns the nonce + human-readable message the wallet must sign.
 * Only call for EVM (0x…) addresses.
 */
export function issueWithdrawChallenge(
  walletAddress: string,
): { nonce: string; message: string } {
  const nonce   = crypto.randomBytes(16).toString("hex");
  const ts      = new Date().toISOString();
  const message =
    `Authorize OrahDEX withdrawal\n\n` +
    `Wallet: ${walletAddress}\n` +
    `Nonce: ${nonce}\n` +
    `Timestamp: ${ts}\n\n` +
    `This request will not trigger a blockchain transaction.`;

  withdrawNonces.set(walletAddress.toLowerCase(), {
    nonce,
    message,
    expiresAt: Date.now() + WITHDRAW_NONCE_TTL_MS,
  });

  return { nonce, message };
}

/**
 * Verify a withdrawal challenge signature.
 * Consumes the nonce on success (single-use).
 * Throws a descriptive Error on any failure — return the message as 401 to the client.
 */
export function verifyWithdrawSignature(
  walletAddress: string,
  signature:     string,
): void {
  const addr   = walletAddress.toLowerCase();
  const stored = withdrawNonces.get(addr);

  if (!stored || stored.expiresAt < Date.now()) {
    throw new Error(
      "Withdrawal challenge expired or not found. " +
      "Request a fresh challenge via POST /withdraw/challenge.",
    );
  }

  // verifyEvmSignature throws on mismatch
  verifyEvmSignature(walletAddress, stored.message, signature);

  // Single-use: consume immediately after successful verification
  withdrawNonces.delete(addr);
}

// ── Canonical auth message builders ──────────────────────────────────────────

/**
 * Canonical message a client must sign to authorise placing a spot order.
 * Both client and server MUST produce the identical string.
 */
export function buildOrderAuthMessage(params: {
  walletAddress: string;
  symbol:        string;
  side:          string;
  quantity:      string;
  nonce:         string;
  expiry:        string;
}): string {
  return [
    "Authorize OrahDEX order",
    `Wallet: ${params.walletAddress}`,
    `Symbol: ${params.symbol}`,
    `Side: ${params.side}`,
    `Quantity: ${params.quantity}`,
    `Nonce: ${params.nonce}`,
    `Expiry: ${params.expiry}`,
  ].join("\n");
}

/**
 * Canonical message a client must sign to authorise an internal exchange swap.
 * Both client and server MUST produce the identical string.
 */
export function buildExchangeAuthMessage(params: {
  walletAddress: string;
  assetIn:       string;
  assetOut:      string;
  amountIn:      string;
  nonce:         string;
}): string {
  return [
    "Authorize OrahDEX exchange swap",
    `Wallet: ${params.walletAddress}`,
    `From: ${params.assetIn}`,
    `To: ${params.assetOut}`,
    `Amount: ${params.amountIn}`,
    `Nonce: ${params.nonce}`,
  ].join("\n");
}
