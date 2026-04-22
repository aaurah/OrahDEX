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
  let n = BigInt("0x" + buf.toString("hex") || "00");
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
