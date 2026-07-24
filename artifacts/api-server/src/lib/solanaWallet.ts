/**
 * solanaWallet.ts — OrahDEX
 *
 * Raw Solana transaction building WITHOUT @solana/web3.js.
 * Uses only @noble/ed25519 for signing and fetch for JSON-RPC.
 *
 * Supports:
 *   - SOL native transfer (SystemProgram.Transfer)
 *   - Fetching recent blockhash from mainnet RPC
 *   - Broadcasting signed transactions
 *   - Querying native SOL balance in lamports
 *   - Loading the platform hot wallet from env
 */

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

// @noble/ed25519 v2 requires a synchronous sha512 implementation
ed.etc.sha512Sync = (...msgs) => sha512(ed.etc.concatBytes(...msgs));

// ── Base58 ────────────────────────────────────────────────────────────────────

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(str: string): Uint8Array {
  let n = 0n;
  for (const c of str) {
    const idx = B58_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error(`Invalid base58 character: '${c}'`);
    n = n * 58n + BigInt(idx);
  }

  // Count leading '1's (each represents a leading zero byte)
  let leadingZeros = 0;
  for (const c of str) {
    if (c === "1") leadingZeros++;
    else break;
  }

  // Convert bigint to bytes
  const hex = n.toString(16);
  const hexPadded = hex.length % 2 ? "0" + hex : hex;
  const bytes = new Uint8Array(hexPadded.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexPadded.slice(i * 2, i * 2 + 2), 16);
  }

  // Prepend leading zero bytes
  const result = new Uint8Array(leadingZeros + bytes.length);
  result.set(bytes, leadingZeros);
  return result;
}

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  // Count leading zero bytes
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b === 0) leadingZeros++;
    else break;
  }

  // Convert bytes to bigint
  let n = 0n;
  for (const b of bytes) {
    n = n * 256n + BigInt(b);
  }

  let s = "";
  while (n > 0n) {
    const rem = Number(n % 58n);
    s = B58_ALPHABET[rem] + s;
    n /= 58n;
  }

  // Prepend leading '1's
  return "1".repeat(leadingZeros) + s;
}

// ── Compact-u16 encoding (Solana wire format) ─────────────────────────────────

/**
 * Encode a number as Solana's compact-u16.
 * Values < 128 fit in 1 byte. Values 128–16383 use 2 bytes.
 */
function encodeCompactU16(n: number): Uint8Array {
  if (n < 128) {
    return new Uint8Array([n]);
  } else if (n < 16384) {
    // Low 7 bits | 0x80, then high bits
    return new Uint8Array([(n & 0x7f) | 0x80, (n >> 7) & 0xff]);
  } else {
    throw new Error(`compact-u16 value too large: ${n}`);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SolanaKeypair {
  publicKey: Uint8Array;  // 32 bytes
  secretKey: Uint8Array;  // 64 bytes (seed + public key)
}

// ── RPC helpers ───────────────────────────────────────────────────────────────

const SOLANA_RPC_URL = () =>
  process.env.QN_SOL_ENDPOINT ?? process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(SOLANA_RPC_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id:      1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Solana RPC HTTP error: ${response.status} ${response.statusText}`);
  }

  const body = await response.json() as { result?: unknown; error?: { message: string; code: number } };

  if (body.error) {
    throw new Error(`Solana RPC error [${body.error.code}]: ${body.error.message}`);
  }

  return body.result;
}

// ── Public exports ────────────────────────────────────────────────────────────

/**
 * Get recent blockhash from Solana mainnet RPC.
 * Returns the blockhash as a base58 string.
 */
export async function getSolRecentBlockhash(): Promise<string> {
  const result = await rpcCall("getLatestBlockhash", [{ commitment: "finalized" }]);
  const r = result as { value: { blockhash: string } };
  return r.value.blockhash;
}

/**
 * Get native SOL balance in lamports for the given base58 address.
 */
export async function getSolBalance(address: string): Promise<bigint> {
  const result = await rpcCall("getBalance", [address, { commitment: "confirmed" }]);
  const r = result as { value: number };
  return BigInt(r.value);
}

/**
 * Broadcast a signed transaction (base64-encoded) to Solana mainnet.
 * Returns the transaction signature (txid) as a base58 string.
 */
export async function broadcastSolTx(signedTxBase64: string): Promise<string> {
  const result = await rpcCall("sendTransaction", [
    signedTxBase64,
    {
      encoding:            "base64",
      preflightCommitment: "confirmed",
    },
  ]);
  return result as string;
}

/**
 * Build and sign a SOL native transfer transaction.
 *
 * Transaction binary layout (SystemProgram.Transfer):
 *   [1 byte]    num_signatures = 1
 *   [64 bytes]  signature (filled after signing)
 *   Message:
 *     [3 bytes]  header: [1, 0, 1]
 *     [cu16]     account count = 3
 *     [32 bytes] from pubkey
 *     [32 bytes] to pubkey
 *     [32 bytes] system program ID (all zeros)
 *     [32 bytes] recent blockhash (decoded from base58)
 *     [cu16]     instruction count = 1
 *     Instruction:
 *       [1 byte] program_id_index = 2
 *       [cu16]   accounts count = 2
 *       [2 bytes] account indices [0, 1]
 *       [cu16]   data length = 12
 *       [4 bytes] instruction type = 2 (Transfer) as little-endian u32
 *       [8 bytes] lamports as little-endian u64
 *
 * Returns a base64-encoded signed transaction ready for sendTransaction.
 */
export async function buildAndSignSolTransfer(params: {
  fromKeypair:      SolanaKeypair;
  toPubkey:         string;   // base58 Solana address
  lamports:         bigint;
  recentBlockhash:  string;   // base58 blockhash
}): Promise<string> {
  const { fromKeypair, toPubkey, lamports, recentBlockhash } = params;

  // Decode addresses and blockhash from base58 to raw bytes
  const fromPubkeyBytes = fromKeypair.publicKey;  // already 32 bytes
  const toPubkeyBytes   = base58Decode(toPubkey);
  const blockhashBytes  = base58Decode(recentBlockhash);

  if (toPubkeyBytes.length !== 32) {
    throw new Error(`Invalid toPubkey: expected 32 bytes, got ${toPubkeyBytes.length}`);
  }
  if (blockhashBytes.length !== 32) {
    throw new Error(`Invalid blockhash: expected 32 bytes, got ${blockhashBytes.length}`);
  }

  // SystemProgram ID = all zeros (32 bytes)
  const systemProgramId = new Uint8Array(32);

  // ── Build the instruction data: Transfer (type=2) + lamports ──────────────
  // [2, 0, 0, 0] = little-endian u32 value 2 (Transfer instruction)
  // [lo, ..., hi] = little-endian u64 lamports
  const instructionData = new Uint8Array(12);
  const dataView = new DataView(instructionData.buffer);
  dataView.setUint32(0, 2, true);        // instruction type = Transfer = 2, LE
  dataView.setBigUint64(4, lamports, true); // lamports, LE

  // ── Assemble the message ───────────────────────────────────────────────────
  const messageParts: Uint8Array[] = [];

  // Header: [num_required_signatures, num_readonly_signed, num_readonly_unsigned]
  messageParts.push(new Uint8Array([1, 0, 1]));

  // Account list: 3 accounts
  messageParts.push(encodeCompactU16(3));
  messageParts.push(fromPubkeyBytes);       // index 0: from (writable, signer)
  messageParts.push(toPubkeyBytes);         // index 1: to (writable)
  messageParts.push(systemProgramId);       // index 2: system program (read-only)

  // Recent blockhash
  messageParts.push(blockhashBytes);

  // Instructions: 1 instruction
  messageParts.push(encodeCompactU16(1));

  // Instruction:
  //   program_id_index = 2 (SystemProgram at index 2)
  messageParts.push(new Uint8Array([2]));

  //   accounts: [0, 1] (from=0, to=1)
  messageParts.push(encodeCompactU16(2));
  messageParts.push(new Uint8Array([0, 1]));

  //   data
  messageParts.push(encodeCompactU16(instructionData.length));
  messageParts.push(instructionData);

  // Concatenate all message parts
  const messageLength = messageParts.reduce((sum, p) => sum + p.length, 0);
  const messageBytes  = new Uint8Array(messageLength);
  let offset = 0;
  for (const part of messageParts) {
    messageBytes.set(part, offset);
    offset += part.length;
  }

  // ── Sign the message with the from keypair ─────────────────────────────────
  // @noble/ed25519 takes a 32-byte seed (not the 64-byte expanded form)
  const seed        = fromKeypair.secretKey.slice(0, 32);
  const signature   = await ed.sign(messageBytes, seed);

  // ── Assemble the full transaction ──────────────────────────────────────────
  // [num_signatures=1][64-byte signature][message bytes]
  const txLength = 1 + 64 + messageLength;
  const txBytes  = new Uint8Array(txLength);
  txBytes[0] = 1;                      // num_signatures
  txBytes.set(signature, 1);           // 64-byte Ed25519 signature
  txBytes.set(messageBytes, 1 + 64);   // message

  // Encode as base64
  return Buffer.from(txBytes).toString("base64");
}

/**
 * Load the platform's SOL hot wallet from the SOLANA_HOT_WALLET_PRIVATE_KEY
 * environment variable (expected to be a base58-encoded 32-byte seed).
 *
 * The 64-byte secretKey is constructed as: seed (32 bytes) || publicKey (32 bytes),
 * matching the convention used by the Solana CLI and most tooling.
 */
export async function getSolHotWallet(): Promise<SolanaKeypair> {
  const keyEnv = process.env.SOLANA_HOT_WALLET_PRIVATE_KEY;
  if (!keyEnv) {
    throw new Error(
      "SOLANA_HOT_WALLET_PRIVATE_KEY is not set. " +
      "Provide a base58-encoded 32-byte Ed25519 seed to enable SOL withdrawals.",
    );
  }

  const decoded = base58Decode(keyEnv.trim());

  let seed: Uint8Array;
  if (decoded.length === 32) {
    // 32-byte raw seed
    seed = decoded;
  } else if (decoded.length === 64) {
    // 64-byte expanded keypair (some wallets export seed+pubkey) — take first 32
    seed = decoded.slice(0, 32);
  } else {
    throw new Error(
      `SOLANA_HOT_WALLET_PRIVATE_KEY decoded to ${decoded.length} bytes; ` +
      "expected 32 (seed) or 64 (seed+pubkey).",
    );
  }

  // Derive the public key from the seed
  const publicKey = await ed.getPublicKeyAsync(seed);

  // Construct 64-byte secretKey = seed || publicKey (standard representation)
  const secretKey = new Uint8Array(64);
  secretKey.set(seed, 0);
  secretKey.set(publicKey, 32);

  return { publicKey, secretKey };
}

/**
 * Helper: return the base58 public key string for a keypair.
 */
export function solKeypairAddress(kp: SolanaKeypair): string {
  return base58Encode(kp.publicKey);
}
