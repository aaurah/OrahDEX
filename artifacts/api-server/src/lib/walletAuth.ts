/**
 * walletAuth.ts — Shared wallet-signature helpers for user-facing auth.
 *
 * Provides challenge/verify patterns for EVM, BSV, and Solana wallet types.
 *
 * Exported utilities
 * ──────────────────
 *  recoverEthAddress           — recover signer address from a personal_sign
 *  verifyEvmSignature          — assert signer === walletAddress (throws on mismatch)
 *  issueWithdrawChallenge      — mint a server-nonce for the EVM withdrawal flow
 *  verifyWithdrawSignature     — consume + verify the EVM withdrawal nonce
 *  issueBsvWithdrawChallenge   — mint a server-nonce for BSV withdrawal flow
 *  verifyBsvWithdrawSignature  — consume + verify the BSV withdrawal nonce
 *  issueSolWithdrawChallenge   — mint a server-nonce for Solana withdrawal flow
 *  verifySolWithdrawSignature  — consume + verify the Solana withdrawal nonce
 *  issueExchangeChallenge      — mint a server-nonce for exchange-swap flow
 *  verifyExchangeSignature     — consume + verify the exchange-swap nonce (EVM)
 *  buildOrderAuthMessage       — canonical message for spot order authorisation
 *  buildExchangeAuthMessage    — canonical message for exchange-swap authorisation
 *  recordConsumedOrderNonce    — mark an order nonce as used
 *  isOrderNonceConsumed        — check if an order nonce was already used
 */

import crypto from "node:crypto";
import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

// @noble/ed25519 v2 requires a synchronous SHA-512 implementation to be
// provided via the utils hook before any sign/verify call.
// We wire it here once at module load time using @noble/hashes/sha512.
ed.etc.sha512Sync = (...msgs) => sha512(ed.etc.concatBytes(...msgs));

// ── EVM personal_sign recovery ────────────────────────────────────────────────

function hashPersonalMessage(message: string): Uint8Array {
  const prefix = `\x19Ethereum Signed Message:\n${Buffer.byteLength(message, "utf8")}`;
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

  // noble-secp256k1 recovered format: [recovery_bit(1), r(32), s(32)]
  const recoveredSig = new Uint8Array(65);
  recoveredSig[0] = recovery;
  recoveredSig.set(rBytes, 1);
  recoveredSig.set(sBytes, 33);

  // Returns compressed pubkey (33 bytes); prehash: false because msgHash is keccak256 already
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

// ── BSV withdrawal nonce store ────────────────────────────────────────────────
// Uses a prefixed key in withdrawNonces to avoid collision with EVM entries.
// BSV wallet addresses start with "1" (P2PKH) or "3" (P2SH) on mainnet.

/**
 * Issue a single-use, 5-minute withdrawal challenge for a BSV wallet.
 * Returns the nonce + human-readable message the wallet must sign.
 */
export function issueBsvWithdrawChallenge(
  walletAddress: string,
): { nonce: string; message: string } {
  const nonce   = crypto.randomBytes(16).toString("hex");
  const ts      = new Date().toISOString();
  const message =
    `Authorize OrahDEX BSV withdrawal\n\n` +
    `Wallet: ${walletAddress}\n` +
    `Nonce: ${nonce}\n` +
    `Timestamp: ${ts}\n\n` +
    `This request will not trigger a blockchain transaction.`;

  withdrawNonces.set(`bsv:${walletAddress}`, {
    nonce,
    message,
    expiresAt: Date.now() + WITHDRAW_NONCE_TTL_MS,
  });

  return { nonce, message };
}

/**
 * Verify a BSV withdrawal challenge signature.
 * BSV message signing uses the Bitcoin Signed Message prefix with secp256k1 ECDSA,
 * identical to Bitcoin's message-sign spec (double-SHA256, varint-prefixed).
 * Consumes the nonce on success (single-use).
 * Throws on any failure.
 */
export function verifyBsvWithdrawSignature(
  walletAddress: string,
  signatureBase64: string,
): void {
  const key    = `bsv:${walletAddress}`;
  const stored = withdrawNonces.get(key);

  if (!stored || stored.expiresAt < Date.now()) {
    throw new Error(
      "BSV withdrawal challenge expired or not found. " +
      "Request a fresh challenge via POST /withdraw/challenge.",
    );
  }

  verifyBsvMessageSignature(walletAddress, stored.message, signatureBase64);

  withdrawNonces.delete(key);
}

/**
 * Verify a Bitcoin (BSV) message signature against an address.
 * Signature is base64-encoded (compact 65-byte format: 1 byte header + r + s).
 * The signed message uses the Bitcoin Signed Message prefix.
 */
function verifyBsvMessageSignature(
  address: string,
  message: string,
  signatureBase64: string,
): void {
  const msgHash = hashBitcoinMessage(message);
  const sigBuf  = Buffer.from(signatureBase64, "base64");
  if (sigBuf.length !== 65) {
    throw new Error("Invalid BSV signature format (expected 65-byte base64)");
  }

  const headerByte = sigBuf[0];
  // Bitcoin compact sig: header byte encodes recovery + compression flag.
  // Header range: 27–30 (uncompressed), 31–34 (compressed).
  const isCompressed = headerByte >= 31;
  const recovery     = (headerByte - (isCompressed ? 31 : 27)) & 0x03;

  const rBytes = sigBuf.subarray(1, 33);
  const sBytes = sigBuf.subarray(33, 65);

  const recoveredSig = new Uint8Array(65);
  recoveredSig[0] = recovery;
  recoveredSig.set(rBytes, 1);
  recoveredSig.set(sBytes, 33);

  const compressedPubKey   = secp.recoverPublicKey(recoveredSig, msgHash, { prehash: false });
  const recoveredAddress   = bsvPubKeyToAddress(compressedPubKey, isCompressed);

  if (recoveredAddress !== address) {
    throw new Error("BSV signature does not match wallet address");
  }
}

/**
 * Hash a message using the Bitcoin Signed Message convention:
 *   SHA256d( "\x18Bitcoin Signed Message:\n" + varint(len) + message )
 */
function hashBitcoinMessage(message: string): Uint8Array {
  const msgBuf    = Buffer.from(message, "utf8");
  const prefix    = Buffer.from("\x18Bitcoin Signed Message:\n", "utf8");
  const varint    = encodeVarint(msgBuf.length);
  const preimage  = Buffer.concat([prefix, varint, msgBuf]);
  const hash1     = crypto.createHash("sha256").update(preimage).digest();
  const hash2     = crypto.createHash("sha256").update(hash1).digest();
  return new Uint8Array(hash2);
}

function encodeVarint(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n < 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = 0xfd;
    b.writeUInt16LE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = 0xfe;
  b.writeUInt32LE(n, 1);
  return b;
}

/** Derive a BSV P2PKH address from a secp256k1 public key. */
function bsvPubKeyToAddress(pubKey: Uint8Array, compressed: boolean): string {
  // If not compressed, expand to uncompressed (65 bytes) before hashing
  const keyBytes = compressed ? pubKey : secp.Point.fromBytes(pubKey).toBytes(false);
  const sha256d  = crypto.createHash("sha256").update(keyBytes).digest();
  const ripemd   = crypto.createHash("ripemd160").update(sha256d).digest();
  // BSV mainnet P2PKH version byte: 0x00
  const versioned = Buffer.concat([Buffer.from([0x00]), ripemd]);
  const checksum  = crypto.createHash("sha256")
    .update(crypto.createHash("sha256").update(versioned).digest())
    .digest()
    .subarray(0, 4);
  return base58Encode(Buffer.concat([versioned, checksum]));
}

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buf: Buffer): string {
  let n = buf.length ? BigInt("0x" + buf.toString("hex")) : 0n;
  let s = "";
  while (n > 0n) { s = B58_ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  for (let i = 0; i < buf.length && buf[i] === 0; i++) s = "1" + s;
  return s;
}

// ── Solana withdrawal nonce store ─────────────────────────────────────────────
// Solana addresses are base58-encoded Ed25519 public keys (32–44 chars).
// Uses prefixed key "sol:${address}" in withdrawNonces.

/**
 * Issue a single-use, 5-minute withdrawal challenge for a Solana wallet.
 */
export function issueSolWithdrawChallenge(
  walletAddress: string,
): { nonce: string; message: string } {
  const nonce   = crypto.randomBytes(16).toString("hex");
  const ts      = new Date().toISOString();
  const message =
    `Authorize OrahDEX Solana withdrawal\n\n` +
    `Wallet: ${walletAddress}\n` +
    `Nonce: ${nonce}\n` +
    `Timestamp: ${ts}\n\n` +
    `This request will not trigger a blockchain transaction.`;

  withdrawNonces.set(`sol:${walletAddress}`, {
    nonce,
    message,
    expiresAt: Date.now() + WITHDRAW_NONCE_TTL_MS,
  });

  return { nonce, message };
}

/**
 * Verify a Solana withdrawal challenge signature.
 * Signature is a hex or base64 encoded 64-byte Ed25519 signature.
 * The public key is derived by base58-decoding `walletAddress`.
 * Consumes the nonce on success (single-use).
 * Throws on any failure.
 */
export function verifySolWithdrawSignature(
  walletAddress: string,
  signatureHexOrBase64: string,
): void {
  const key    = `sol:${walletAddress}`;
  const stored = withdrawNonces.get(key);

  if (!stored || stored.expiresAt < Date.now()) {
    throw new Error(
      "Solana withdrawal challenge expired or not found. " +
      "Request a fresh challenge via POST /withdraw/challenge.",
    );
  }

  verifySolanaSignature(walletAddress, stored.message, signatureHexOrBase64);

  withdrawNonces.delete(key);
}

/**
 * Verify a Solana Ed25519 signature.
 * `publicKeyBase58` is the wallet address (Solana pubkey in base58).
 * `signatureHexOrBase64` is the 64-byte signature in hex or base64.
 */
function verifySolanaSignature(
  publicKeyBase58: string,
  message: string,
  signatureHexOrBase64: string,
): void {
  const pubKeyBytes = base58Decode(publicKeyBase58);
  if (pubKeyBytes.length !== 32) {
    throw new Error("Invalid Solana public key length (expected 32 bytes)");
  }

  // Accept both hex and base64 encoding
  let sigBytes: Uint8Array;
  if (/^[0-9a-fA-F]{128}$/.test(signatureHexOrBase64)) {
    sigBytes = Buffer.from(signatureHexOrBase64, "hex");
  } else {
    sigBytes = Buffer.from(signatureHexOrBase64, "base64");
  }
  if (sigBytes.length !== 64) {
    throw new Error("Invalid Solana signature length (expected 64 bytes)");
  }

  const msgBytes = Buffer.from(message, "utf8");
  const valid    = ed.verify(sigBytes, msgBytes, pubKeyBytes);
  if (!valid) {
    throw new Error("Solana signature does not match wallet address");
  }
}

function base58Decode(str: string): Buffer {
  let n = 0n;
  for (const c of str) {
    const idx = B58_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error(`Invalid base58 char: ${c}`);
    n = n * 58n + BigInt(idx);
  }
  let leadingZeros = 0;
  for (const c of str) { if (c === "1") leadingZeros++; else break; }
  const hex = n.toString(16);
  const buf = Buffer.from(hex.length % 2 ? "0" + hex : hex, "hex");
  return Buffer.concat([Buffer.alloc(leadingZeros), buf]);
}

// ── Exchange swap nonce store ─────────────────────────────────────────────────
// Server-issued single-use nonces for POST /trade/exchange.
// Key: walletAddress.toLowerCase()

interface ExchangeNonce {
  nonce:     string;
  message:   string;
  expiresAt: number;
}

const exchangeNonces = new Map<string, ExchangeNonce>();

const EXCHANGE_NONCE_TTL_MS = 5 * 60 * 1_000;  // 5 minutes
const EXCHANGE_NONCE_SWEEP  = 5 * 60 * 1_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of exchangeNonces.entries()) {
    if (v.expiresAt < now) exchangeNonces.delete(k);
  }
}, EXCHANGE_NONCE_SWEEP).unref();

/**
 * Issue a single-use, 5-minute exchange-swap challenge for an EVM wallet.
 * The client must sign the returned `message` with personal_sign and include
 * `signature` + `nonce` in POST /trade/exchange.
 */
export function issueExchangeChallenge(params: {
  walletAddress: string;
  assetIn:       string;
  assetOut:      string;
  amountIn:      string;
}): { nonce: string; message: string } {
  const nonce   = crypto.randomBytes(16).toString("hex");
  const message = buildExchangeAuthMessage({
    walletAddress: params.walletAddress,
    assetIn:       params.assetIn,
    assetOut:      params.assetOut,
    amountIn:      params.amountIn,
    nonce,
  });

  exchangeNonces.set(params.walletAddress.toLowerCase(), {
    nonce,
    message,
    expiresAt: Date.now() + EXCHANGE_NONCE_TTL_MS,
  });

  return { nonce, message };
}

/**
 * Verify an exchange-swap signature.
 * Asserts the nonce matches the server-issued challenge, the signature is valid,
 * and consumes the nonce on success (single-use).
 * Throws a descriptive Error on any failure.
 */
export function verifyExchangeSignature(
  walletAddress: string,
  nonce:         string,
  signature:     string,
): void {
  const addr   = walletAddress.toLowerCase();
  const stored = exchangeNonces.get(addr);

  if (!stored || stored.expiresAt < Date.now()) {
    throw new Error(
      "Exchange challenge expired or not found. " +
      "Request a fresh challenge via POST /trade/exchange/challenge.",
    );
  }

  if (stored.nonce !== nonce) {
    throw new Error(
      "Exchange nonce mismatch. " +
      "Use the nonce returned by POST /trade/exchange/challenge.",
    );
  }

  // verifyEvmSignature throws on mismatch
  verifyEvmSignature(walletAddress, stored.message, signature);

  // Single-use: consume immediately after successful verification
  exchangeNonces.delete(addr);
}

// ── Liquidity nonce store ────────────────────────────────────────────────────
// Single-use nonces for POST /liquidity and DELETE /liquidity/:id.
// Key: walletAddress.toLowerCase()

interface LiquidityNonce {
  nonce:     string;
  message:   string;
  /** Action the challenge was issued for ("add" | "remove"). Bound at verify. */
  action:    "add" | "remove";
  /** Pool the challenge was issued for. Bound at verify to prevent cross-pool replay. */
  poolId:    string;
  expiresAt: number;
}

const liquidityNonces = new Map<string, LiquidityNonce>();

const LP_NONCE_TTL_MS = 5 * 60 * 1_000;
const LP_NONCE_SWEEP  = 5 * 60 * 1_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of liquidityNonces.entries()) {
    if (v.expiresAt < now) liquidityNonces.delete(k);
  }
}, LP_NONCE_SWEEP).unref();

/**
 * Issue a single-use, 5-minute liquidity-action challenge for an EVM wallet.
 * The client signs the returned `message` and sends signature + nonce with
 * the next call to POST /liquidity or DELETE /liquidity/:positionId.
 */
export function issueLiquidityChallenge(params: {
  walletAddress: string;
  action:        "add" | "remove";
  poolId:        string;
}): { nonce: string; message: string } {
  const nonce   = crypto.randomBytes(16).toString("hex");
  const ts      = new Date().toISOString();
  const message =
    `Authorize OrahDEX liquidity ${params.action}\n\n` +
    `Wallet: ${params.walletAddress}\n` +
    `Pool: ${params.poolId}\n` +
    `Nonce: ${nonce}\n` +
    `Timestamp: ${ts}\n\n` +
    `This request will not trigger a blockchain transaction.`;

  liquidityNonces.set(params.walletAddress.toLowerCase(), {
    nonce,
    message,
    action:    params.action,
    poolId:    params.poolId,
    expiresAt: Date.now() + LP_NONCE_TTL_MS,
  });

  return { nonce, message };
}

/**
 * Verify a liquidity-action signature. Single-use nonce; consumed on success.
 * The challenge is bound to (action, poolId) — verification fails if the
 * incoming request targets a different action or pool, even if the signature
 * itself is valid. This prevents a captured-but-unused challenge from being
 * spent against a different intent within its TTL.
 *
 * Throws on any failure — wrap with try/catch and respond 401 to the client.
 */
export function verifyLiquiditySignature(params: {
  walletAddress: string;
  nonce:         string;
  signature:     string;
  action:        "add" | "remove";
  poolId:        string;
}): void {
  const addr   = params.walletAddress.toLowerCase();
  const stored = liquidityNonces.get(addr);

  if (!stored || stored.expiresAt < Date.now()) {
    throw new Error(
      "Liquidity challenge expired or not found. " +
      "Request a fresh challenge via POST /liquidity/challenge.",
    );
  }
  if (stored.nonce !== params.nonce) {
    throw new Error("Liquidity nonce mismatch.");
  }
  if (stored.action !== params.action) {
    throw new Error(
      `Liquidity challenge was issued for '${stored.action}', not '${params.action}'. ` +
      `Request a fresh challenge for the correct action.`,
    );
  }
  if (stored.poolId !== params.poolId) {
    throw new Error(
      `Liquidity challenge was issued for pool '${stored.poolId}', not '${params.poolId}'. ` +
      `Request a fresh challenge for the correct pool.`,
    );
  }

  verifyEvmSignature(params.walletAddress, stored.message, params.signature);
  liquidityNonces.delete(addr);
}

/**
 * Look up the pool that a wallet's outstanding liquidity challenge was bound
 * to. Used by DELETE /liquidity/:positionId so the route can verify the
 * challenge against the position's resolved poolId without the client having
 * to round-trip it.
 */
export function peekLiquidityChallengePoolId(walletAddress: string): string | null {
  const stored = liquidityNonces.get(walletAddress.toLowerCase());
  if (!stored || stored.expiresAt < Date.now()) return null;
  return stored.poolId;
}

// ── P2P intent nonce store ───────────────────────────────────────────────────
// Single-use nonces for POST /p2p/intents, POST /p2p/intents/:id/fill,
// DELETE /p2p/intents/:id. Bound to (action, target) so a captured challenge
// for one intent cannot be replayed against a different intent.
//
// `target` semantics:
//   action="post"   → SHA-256 hex of `${tokenIn}|${tokenOut}|${amountIn}|${minAmountOut}`
//   action="fill"   → intentId
//   action="cancel" → intentId

interface P2PNonce {
  nonce:     string;
  message:   string;
  action:    "post" | "fill" | "cancel";
  target:    string;
  expiresAt: number;
}

const p2pNonces = new Map<string, P2PNonce>();

const P2P_NONCE_TTL_MS = 5 * 60 * 1_000;
const P2P_NONCE_SWEEP  = 5 * 60 * 1_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of p2pNonces.entries()) {
    if (v.expiresAt < now) p2pNonces.delete(k);
  }
}, P2P_NONCE_SWEEP).unref();

/** Hash the canonical fields of a post-intent challenge target. */
export function hashP2PPostTarget(params: {
  tokenIn: string; tokenOut: string; amountIn: string; minAmountOut: string;
}): string {
  const canon = `${params.tokenIn.toUpperCase()}|${params.tokenOut.toUpperCase()}|${params.amountIn}|${params.minAmountOut}`;
  return crypto.createHash("sha256").update(canon, "utf8").digest("hex");
}

export function issueP2PChallenge(params: {
  walletAddress: string;
  action:        "post" | "fill" | "cancel";
  target:        string;
}): { nonce: string; message: string } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const ts    = new Date().toISOString();
  const message =
    `Authorize OrahDEX P2P ${params.action}\n\n` +
    `Wallet: ${params.walletAddress}\n` +
    `Target: ${params.target}\n` +
    `Nonce: ${nonce}\n` +
    `Timestamp: ${ts}\n\n` +
    `This request will not trigger a blockchain transaction.`;

  p2pNonces.set(params.walletAddress.toLowerCase(), {
    nonce,
    message,
    action:    params.action,
    target:    params.target,
    expiresAt: Date.now() + P2P_NONCE_TTL_MS,
  });

  return { nonce, message };
}

export function verifyP2PSignature(params: {
  walletAddress: string;
  nonce:         string;
  signature:     string;
  action:        "post" | "fill" | "cancel";
  target:        string;
}): void {
  const addr   = params.walletAddress.toLowerCase();
  const stored = p2pNonces.get(addr);

  if (!stored || stored.expiresAt < Date.now()) {
    throw new Error(
      "P2P challenge expired or not found. " +
      "Request a fresh challenge via POST /p2p/challenge.",
    );
  }
  if (stored.nonce !== params.nonce) {
    throw new Error("P2P nonce mismatch.");
  }
  if (stored.action !== params.action) {
    throw new Error(
      `P2P challenge was issued for '${stored.action}', not '${params.action}'.`,
    );
  }
  if (stored.target !== params.target) {
    throw new Error(
      `P2P challenge target mismatch — challenge was bound to a different intent.`,
    );
  }

  verifyEvmSignature(params.walletAddress, stored.message, params.signature);
  p2pNonces.delete(addr);
}

// ── Creator-coin trade nonce store ───────────────────────────────────────────
// Single-use, 5-minute nonces for POST /social/creators/:address/trade.
// Bound to (action, creator, side, amount) so a captured challenge cannot be
// replayed against a different trade.

interface TradeNonce {
  nonce:     string;
  message:   string;
  creator:   string;   // creator address (lowercase)
  side:      "buy" | "sell";
  amount:    string;   // raw input amount (paymentAsset units for buy, tokens for sell)
  asset:     string;   // payment asset symbol (uppercase)
  expiresAt: number;
}

const tradeNonces = new Map<string, TradeNonce>();
const TRADE_NONCE_TTL_MS = 5 * 60 * 1_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of tradeNonces.entries()) {
    if (v.expiresAt < now) tradeNonces.delete(k);
  }
}, TRADE_NONCE_TTL_MS).unref();

export function issueTradeChallenge(params: {
  walletAddress: string;
  creator:       string;
  side:          "buy" | "sell";
  amount:        string;
  asset:         string;
}): { nonce: string; message: string } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const ts    = new Date().toISOString();
  const message =
    `Authorize OrahDEX trade\n\n` +
    `Wallet: ${params.walletAddress}\n` +
    `Creator: ${params.creator}\n` +
    `Side: ${params.side}\n` +
    `Amount: ${params.amount} ${params.asset.toUpperCase()}\n` +
    `Nonce: ${nonce}\n` +
    `Timestamp: ${ts}\n\n` +
    `This request will not trigger a blockchain transaction.`;

  tradeNonces.set(params.walletAddress.toLowerCase(), {
    nonce,
    message,
    creator:   params.creator.toLowerCase(),
    side:      params.side,
    amount:    params.amount,
    asset:     params.asset.toUpperCase(),
    expiresAt: Date.now() + TRADE_NONCE_TTL_MS,
  });

  return { nonce, message };
}

export function verifyTradeSignature(params: {
  walletAddress: string;
  nonce:         string;
  signature:     string;
  creator:       string;
  side:          "buy" | "sell";
  amount:        string;
  asset:         string;
}): void {
  const addr   = params.walletAddress.toLowerCase();
  const stored = tradeNonces.get(addr);
  if (!stored || stored.expiresAt < Date.now()) {
    throw new Error("Trade challenge expired or not found. Request a fresh challenge.");
  }
  if (stored.nonce !== params.nonce)               throw new Error("Trade nonce mismatch.");
  if (stored.creator !== params.creator.toLowerCase()) throw new Error("Trade challenge creator mismatch.");
  if (stored.side !== params.side)                 throw new Error("Trade challenge side mismatch.");
  if (stored.amount !== params.amount)             throw new Error("Trade challenge amount mismatch.");
  if (stored.asset !== params.asset.toUpperCase()) throw new Error("Trade challenge asset mismatch.");
  verifyEvmSignature(params.walletAddress, stored.message, params.signature);
  tradeNonces.delete(addr);
}

// ── Consumed order nonce store ────────────────────────────────────────────────
// Tracks used (walletAddress, nonce) pairs for spot orders to prevent replay.
// Entries are pruned lazily once their expiry has passed.
// Key: walletAddress.toLowerCase() → array of { nonce, expiresAt }

interface ConsumedNonce {
  nonce:     string;
  expiresAt: number;
}

const consumedOrderNonces = new Map<string, ConsumedNonce[]>();

const ORDER_NONCE_SWEEP = 5 * 60 * 1_000;

setInterval(() => {
  const now = Date.now();
  for (const [addr, entries] of consumedOrderNonces.entries()) {
    const alive = entries.filter(e => e.expiresAt > now);
    if (alive.length === 0) {
      consumedOrderNonces.delete(addr);
    } else {
      consumedOrderNonces.set(addr, alive);
    }
  }
}, ORDER_NONCE_SWEEP).unref();

/**
 * Check whether an order nonce has already been consumed for `walletAddress`.
 * Returns true if the (address, nonce) pair is in the consumed set.
 */
export function isOrderNonceConsumed(walletAddress: string, nonce: string): boolean {
  const addr    = walletAddress.toLowerCase();
  const entries = consumedOrderNonces.get(addr);
  if (!entries) return false;
  return entries.some(e => e.nonce === nonce);
}

/**
 * Mark a (walletAddress, nonce) pair as consumed.
 * `expiryUnixSec` is the order's expiry timestamp (Unix seconds) — entries are
 * automatically pruned after this time, since expired nonces cannot be replayed
 * anyway (the expiry check in orders.ts rejects them first).
 */
export function recordConsumedOrderNonce(
  walletAddress:  string,
  nonce:          string,
  expiryUnixSec:  number,
): void {
  const addr   = walletAddress.toLowerCase();
  const list   = consumedOrderNonces.get(addr) ?? [];
  list.push({ nonce, expiresAt: expiryUnixSec * 1_000 });
  consumedOrderNonces.set(addr, list);
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

// ── BSV / Solana order challenge store ────────────────────────────────────────
// Server-issued single-use challenges bound to order parameters.
// These are separate from the withdrawal-challenge store to prevent a captured
// withdrawal challenge from being replayed as an order signature.

interface BsvOrderNonce {
  nonce:    string;
  message:  string;
  symbol:   string;
  side:     string;
  quantity: string;
  expiresAt: number;
}

const bsvOrderNonces = new Map<string, BsvOrderNonce>();
const BSV_ORDER_NONCE_TTL_MS = 5 * 60 * 1_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of bsvOrderNonces.entries()) {
    if (v.expiresAt < now) bsvOrderNonces.delete(k);
  }
}, BSV_ORDER_NONCE_TTL_MS).unref();

/**
 * Issue a BSV order challenge bound to specific order parameters.
 * The client must sign the returned `message` with their BSV wallet.
 */
export function issueBsvOrderChallenge(params: {
  walletAddress: string;
  symbol:        string;
  side:          string;
  quantity:      string;
  nonce:         string;
  expiry:        string;
}): { nonce: string; message: string } {
  // Always generate the nonce server-side to prevent nonce-grinding attacks.
  // Any client-provided nonce is intentionally ignored.
  const nonce   = crypto.randomBytes(16).toString("hex");
  const message = buildOrderAuthMessage({
    walletAddress: params.walletAddress,
    symbol:        params.symbol,
    side:          params.side,
    quantity:      params.quantity,
    nonce,
    expiry:        params.expiry,
  });

  // Normalise wallet address to lower-case to prevent duplicate challenges
  // from different case representations of the same BSV address.
  bsvOrderNonces.set(`bsv:${params.walletAddress.toLowerCase()}`, {
    nonce,
    message,
    symbol:   params.symbol,
    side:     params.side,
    quantity: params.quantity,
    expiresAt: Date.now() + BSV_ORDER_NONCE_TTL_MS,
  });

  return { nonce, message };
}

/**
 * Verify a BSV order challenge signature.
 * Binds to (symbol, side, quantity) to prevent cross-intent replay.
 * Consumes the nonce on success (single-use).
 * Throws on any failure.
 */
export function verifyBsvOrderSignature(
  walletAddress:   string,
  signatureBase64: string,
  expectedParams: { symbol: string; side: string; quantity: string },
): void {
  const key    = `bsv:${walletAddress.toLowerCase()}`;
  const stored = bsvOrderNonces.get(key);

  if (!stored || stored.expiresAt < Date.now()) {
    throw new Error(
      "BSV order challenge expired or not found. " +
      "Request a fresh challenge via POST /orders/bsv-challenge.",
    );
  }

  if (stored.symbol !== expectedParams.symbol) {
    throw new Error(`BSV order challenge symbol mismatch: expected ${stored.symbol}, got ${expectedParams.symbol}.`);
  }
  if (stored.side !== expectedParams.side) {
    throw new Error(`BSV order challenge side mismatch: expected ${stored.side}, got ${expectedParams.side}.`);
  }
  if (stored.quantity !== expectedParams.quantity) {
    throw new Error(`BSV order challenge quantity mismatch.`);
  }

  verifyBsvMessageSignature(walletAddress, stored.message, signatureBase64);
  bsvOrderNonces.delete(key);
}

// ── Solana order challenge store ──────────────────────────────────────────────

interface SolOrderNonce {
  nonce:     string;
  message:   string;
  symbol:    string;
  side:      string;
  quantity:  string;
  expiresAt: number;
}

const solOrderNonces = new Map<string, SolOrderNonce>();
const SOL_ORDER_NONCE_TTL_MS = 5 * 60 * 1_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of solOrderNonces.entries()) {
    if (v.expiresAt < now) solOrderNonces.delete(k);
  }
}, SOL_ORDER_NONCE_TTL_MS).unref();

/**
 * Issue a Solana order challenge bound to specific order parameters.
 */
export function issueSolOrderChallenge(params: {
  walletAddress: string;
  symbol:        string;
  side:          string;
  quantity:      string;
  nonce:         string;
  expiry:        string;
}): { nonce: string; message: string } {
  // Always generate the nonce server-side to prevent nonce-grinding attacks.
  const nonce   = crypto.randomBytes(16).toString("hex");
  const message = buildOrderAuthMessage({
    walletAddress: params.walletAddress,
    symbol:        params.symbol,
    side:          params.side,
    quantity:      params.quantity,
    nonce,
    expiry:        params.expiry,
  });

  solOrderNonces.set(`sol:${params.walletAddress.toLowerCase()}`, {
    nonce,
    message,
    symbol:   params.symbol,
    side:     params.side,
    quantity: params.quantity,
    expiresAt: Date.now() + SOL_ORDER_NONCE_TTL_MS,
  });

  return { nonce, message };
}

/**
 * Verify a Solana order challenge signature.
 * Binds to (symbol, side, quantity) to prevent cross-intent replay.
 * Consumes the nonce on success (single-use).
 */
export function verifySolOrderSignature(
  walletAddress:   string,
  signatureBase64: string,
  expectedParams: { symbol: string; side: string; quantity: string },
): void {
  const key    = `sol:${walletAddress.toLowerCase()}`;
  const stored = solOrderNonces.get(key);

  if (!stored || stored.expiresAt < Date.now()) {
    throw new Error(
      "Solana order challenge expired or not found. " +
      "Request a fresh challenge via POST /orders/sol-challenge.",
    );
  }

  if (stored.symbol !== expectedParams.symbol) {
    throw new Error(`Solana order challenge symbol mismatch.`);
  }
  if (stored.side !== expectedParams.side) {
    throw new Error(`Solana order challenge side mismatch.`);
  }
  if (stored.quantity !== expectedParams.quantity) {
    throw new Error(`Solana order challenge quantity mismatch.`);
  }

  verifySolanaSignature(walletAddress, stored.message, signatureBase64);
  solOrderNonces.delete(key);
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

// ── Staking nonce store ──────────────────────────────────────────────────────
// Single-use nonces for POST /staking/stake (EVM wallets only).
// Key: walletAddress.toLowerCase()

interface StakeNonce {
  nonce:     string;
  message:   string;
  coin:      string;
  amount:    string;
  lockDays:  number;
  expiresAt: number;
}

const stakeNonces = new Map<string, StakeNonce>();

const STAKE_NONCE_TTL_MS = 5 * 60 * 1_000;
const STAKE_NONCE_SWEEP  = 5 * 60 * 1_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of stakeNonces.entries()) {
    if (v.expiresAt < now) stakeNonces.delete(k);
  }
}, STAKE_NONCE_SWEEP).unref();

/**
 * Issue a single-use, 5-minute staking challenge for an EVM wallet.
 * The client must sign the returned `message` with personal_sign and include
 * `signature` + `nonce` in POST /staking/stake.
 * The challenge is bound to (coin, amount, lockDays) to prevent tampering.
 */
export function issueStakeChallenge(params: {
  walletAddress: string;
  coin:          string;
  amount:        string;
  lockDays:      number;
}): { nonce: string; message: string } {
  const nonce   = crypto.randomBytes(16).toString("hex");
  const ts      = new Date().toISOString();
  const message =
    `Authorize OrahDEX staking\n\n` +
    `Wallet: ${params.walletAddress}\n` +
    `Coin: ${params.coin}\n` +
    `Amount: ${params.amount}\n` +
    `Lock Period: ${params.lockDays} days\n` +
    `Nonce: ${nonce}\n` +
    `Timestamp: ${ts}\n\n` +
    `This request will not trigger a blockchain transaction.\n` +
    `Your funds will be locked for the specified period.`;

  stakeNonces.set(params.walletAddress.toLowerCase(), {
    nonce,
    message,
    coin:      params.coin,
    amount:    params.amount,
    lockDays:  params.lockDays,
    expiresAt: Date.now() + STAKE_NONCE_TTL_MS,
  });

  return { nonce, message };
}

/**
 * Verify a staking challenge signature.
 * Bound to (coin, lockDays) — mismatch is rejected even with a valid signature.
 * Consumes the nonce on success (single-use).
 * Throws on any failure — wrap with try/catch and respond 401 to the client.
 */
export function verifyStakeSignature(params: {
  walletAddress: string;
  nonce:         string;
  signature:     string;
  coin:          string;
  lockDays:      number;
}): void {
  const addr   = params.walletAddress.toLowerCase();
  const stored = stakeNonces.get(addr);

  if (!stored || stored.expiresAt < Date.now()) {
    throw new Error(
      "Staking challenge expired or not found. " +
      "Request a fresh challenge via POST /staking/challenge.",
    );
  }
  if (stored.nonce !== params.nonce) {
    throw new Error("Staking nonce mismatch.");
  }
  if (stored.coin !== params.coin) {
    throw new Error(
      `Staking challenge was issued for '${stored.coin}', not '${params.coin}'. ` +
      `Request a fresh challenge.`,
    );
  }
  if (String(stored.lockDays) !== String(params.lockDays)) {
    throw new Error("Staking lock period mismatch. Request a fresh challenge.");
  }

  verifyEvmSignature(params.walletAddress, stored.message, params.signature);
  stakeNonces.delete(addr);
}
