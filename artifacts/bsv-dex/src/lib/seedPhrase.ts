/**
 * OrahDEX HD Wallet — BIP39 + BIP44/SLIP-0010 multi-chain derivation (browser-safe).
 *
 * One seed phrase → five chain addresses:
 *   EVM (Ethereum, BSC, Polygon…)  : m/44'/60'/0'/0/0   secp256k1
 *   BTC / BSV / BCH (Bitcoin forks): m/44'/0'/0'/0/0    secp256k1 — shared key
 *     → All three produce the identical legacy P2PKH address (starts with "1")
 *   SOL (Solana)                   : m/44'/501'/0'/0'   ed25519 SLIP-0010 (Phantom-compatible)
 *
 * BTC, BCH, and BSV are all Bitcoin forks sharing the same secp256k1 curve.
 * Deriving from the same BIP44 path (coin type 0') ensures the same legacy
 * address across all three chains when switching networks.
 *
 * All addresses are fully compatible with MetaMask, Trust Wallet, Phantom, Ledger, etc.
 */

import {
  generateMnemonic as scureGenerateMnemonic,
  mnemonicToAccount,
  english,
} from "viem/accounts";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@scure/bip39";
import { sha256 } from "@noble/hashes/sha2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { hmac } from "@noble/hashes/hmac.js";
import { ed25519 } from "@noble/curves/ed25519.js";

// ─── BIP39 mnemonic generation ────────────────────────────────────────────────

export function generateMnemonic(wordCount: 12 | 24 = 12): string[] {
  const strength = wordCount === 12 ? 128 : 256;
  const phrase = scureGenerateMnemonic(english, strength);
  return phrase.split(" ");
}

// ─── Multi-chain address derivation ──────────────────────────────────────────

export interface HdWalletAddresses {
  evm: string;
  btc: string;
  bch: string;
  bsv: string;
  sol: string;
}

export async function deriveAllAddresses(mnemonic: string[]): Promise<HdWalletAddresses> {
  const phrase = mnemonic.join(" ");

  const evm = mnemonicToAccount(phrase, { accountIndex: 0, addressIndex: 0 }).address;

  const seed = await mnemonicToSeed(phrase);
  const root = HDKey.fromMasterSeed(seed);

  const bitcoinKey = root.derive("m/44'/0'/0'/0/0");
  const btc = deriveP2PKH(bitcoinKey);
  const bch = btc;
  const bsv = btc;
  const sol = deriveSolanaAddress(seed);

  return { evm, btc, bch, bsv, sol };
}

// ─── P2PKH Base58Check (BTC / BSV) ───────────────────────────────────────────

function deriveP2PKH(key: HDKey): string {
  if (!key.publicKey) throw new Error("no public key");
  const pkh = hash160(key.publicKey);
  return encodeBase58Check(pkh, 0x00);
}

// ─── Solana (ed25519 / SLIP-0010) ────────────────────────────────────────────

/**
 * Derive a Solana address using SLIP-0010 (ed25519 curve).
 * Path: m/44'/501'/0'/0' — same as Phantom wallet default.
 * Address = plain Base58 of the 32-byte ed25519 public key.
 */
function deriveSolanaAddress(seed: Uint8Array): string {
  const privateKey = slip10Derive(seed, [
    0x80000000 + 44,   // 44'
    0x80000000 + 501,  // 501'  (Solana coin type)
    0x80000000 + 0,    // 0'
    0x80000000 + 0,    // 0'
  ]);
  const publicKey = ed25519.getPublicKey(privateKey);
  return base58Encode(publicKey); // plain Base58, no checksum
}

/**
 * SLIP-0010 key derivation for ed25519 (hardened-only).
 * https://github.com/satoshilabs/slips/blob/master/slip-0010.md
 */
function slip10Derive(seed: Uint8Array, indexes: number[]): Uint8Array {
  const seedKey = new TextEncoder().encode("ed25519 seed");
  let I = hmac(sha512, seedKey, seed);
  let key = I.slice(0, 32);
  let chainCode = I.slice(32);

  for (const index of indexes) {
    const data = new Uint8Array(37);
    data[0] = 0x00;
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, index >>> 0, false);
    I = hmac(sha512, chainCode, data);
    key = I.slice(0, 32);
    chainCode = I.slice(32);
  }
  return key;
}

// ─── CashAddr (BCH) ──────────────────────────────────────────────────────────

function deriveCashAddr(key: HDKey): string {
  if (!key.publicKey) throw new Error("no public key");
  const pkh = hash160(key.publicKey);
  return encodeCashAddr("bitcoincash", pkh);
}

function encodeCashAddr(prefix: string, pkh: Uint8Array): string {
  const payload = new Uint8Array(pkh.length + 1);
  payload[0] = 0x00;
  payload.set(pkh, 1);

  const data5 = convertBits(payload, 8, 5, true);
  const checksum = cashAddrPolymod(prefix, data5);

  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  let encoded = prefix + ":";
  for (const b of data5) encoded += CHARSET[b];
  for (let i = 39; i >= 0; i--) encoded += CHARSET[Number((checksum >> BigInt(i * 5)) & 0x1fn)];
  return encoded;
}

function cashAddrPolymod(prefix: string, data: Uint8Array): bigint {
  const GENERATOR = [
    0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n,
  ];
  let checksum = 1n;
  for (const ch of prefix) {
    const b = BigInt(ch.charCodeAt(0) & 0x1f);
    const high = checksum >> 35n;
    checksum = ((checksum & 0x07ffffffffn) << 5n) ^ b;
    for (let i = 0; i < 5; i++) if ((high >> BigInt(i)) & 1n) checksum ^= GENERATOR[i];
  }
  const highSep = checksum >> 35n;
  checksum = ((checksum & 0x07ffffffffn) << 5n);
  for (let i = 0; i < 5; i++) if ((highSep >> BigInt(i)) & 1n) checksum ^= GENERATOR[i];
  for (const b of data) {
    const high = checksum >> 35n;
    checksum = ((checksum & 0x07ffffffffn) << 5n) ^ BigInt(b);
    for (let i = 0; i < 5; i++) if ((high >> BigInt(i)) & 1n) checksum ^= GENERATOR[i];
  }
  for (let j = 0; j < 8; j++) {
    const high = checksum >> 35n;
    checksum = ((checksum & 0x07ffffffffn) << 5n);
    for (let i = 0; i < 5; i++) if ((high >> BigInt(i)) & 1n) checksum ^= GENERATOR[i];
  }
  return checksum ^ 1n;
}

function convertBits(data: Uint8Array, from: number, to: number, pad: boolean): Uint8Array {
  let acc = 0, bits = 0;
  const result: number[] = [];
  const maxv = (1 << to) - 1;
  for (const val of data) {
    acc = (acc << from) | val;
    bits += from;
    while (bits >= to) { bits -= to; result.push((acc >> bits) & maxv); }
  }
  if (pad && bits > 0) result.push((acc << (to - bits)) & maxv);
  return new Uint8Array(result);
}

// ─── Base58 (plain, no checksum) — used for Solana ───────────────────────────

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let result = "";
  for (const b of bytes) { if (b !== 0) break; result += "1"; }
  return result + digits.reverse().map(d => BASE58[d]).join("");
}

// ─── Base58Check (BTC / BSV) ─────────────────────────────────────────────────

function encodeBase58Check(payload: Uint8Array, version: number): string {
  const versioned = new Uint8Array(1 + payload.length);
  versioned[0] = version;
  versioned.set(payload, 1);
  const checksum = sha256(sha256(versioned)).slice(0, 4);
  const full = new Uint8Array(versioned.length + 4);
  full.set(versioned);
  full.set(checksum, versioned.length);
  return base58Encode(full);
}

// ─── HASH160 = SHA256 → RIPEMD160 ────────────────────────────────────────────

function hash160(pubkey: Uint8Array): Uint8Array {
  return ripemd160(sha256(pubkey));
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateMnemonic(
  input: string,
): { valid: boolean; words: string[]; error?: string } {
  const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length !== 12 && words.length !== 24) {
    return { valid: false, words, error: `Enter 12 or 24 words (you entered ${words.length})` };
  }
  const invalid = words.filter(w => !english.includes(w));
  if (invalid.length > 0) {
    return {
      valid: false, words,
      error: `Unknown word${invalid.length > 1 ? "s" : ""}: ${invalid.slice(0, 3).join(", ")}`,
    };
  }
  return { valid: true, words };
}
