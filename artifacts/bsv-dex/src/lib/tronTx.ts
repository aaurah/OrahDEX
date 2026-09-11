/**
 * TRON (TRX) transfer builder + broadcaster (browser-safe).
 *
 * TRX uses the same secp256k1 key as EVM (path m/44'/60'/0'/0/0).
 * The TRX address is the EVM address re-encoded with 0x41 prefix + Base58Check.
 *
 * Flow (TronGrid creates the unsigned tx, we just sign the txID):
 *   1. POST /wallet/createtransaction → get unsigned tx + txID
 *   2. Sign txID bytes with secp256k1 (compact r||s||v, 65 bytes)
 *   3. POST /wallet/broadcasttransaction with signature
 *
 * Dependencies already in the project:
 *   @noble/curves/secp256k1 — signing
 *   @noble/hashes/sha2      — sha256 (for address checksum verification)
 */

// ── Byte helpers ──────────────────────────────────────────────────────────────

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) hex = "0" + hex;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ── Base58Check decode (Bitcoin alphabet — Tron uses Bitcoin Base58) ──────────

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): Uint8Array {
  let n = BigInt(0);
  for (const c of s) {
    const i = BASE58.indexOf(c);
    if (i < 0) throw new Error(`Invalid base58 char: ${c}`);
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; bytes.unshift(0); }
  return new Uint8Array(bytes);
}

/**
 * Decode a Tron address (T…) → 21-byte hex (0x41 prefix + 20-byte address).
 * TronGrid API expects hex addresses like "41a614f803b6fd780986…" (42 chars).
 */
async function tronAddressToHex(address: string): Promise<string> {
  const { sha256 } = await import("@noble/hashes/sha2.js");
  const decoded    = base58Decode(address);
  if (decoded.length !== 25)
    throw new Error(`Bad Tron address length ${decoded.length} for ${address}`);
  const payload  = decoded.slice(0, 21); // 0x41 + 20 bytes
  const checksum = decoded.slice(21, 25);
  const expected = sha256(sha256(payload)).slice(0, 4);
  if (!checksum.every((b: number, i: number) => b === expected[i]))
    throw new Error(`Bad Tron address checksum for ${address}`);
  return bytesToHex(payload); // 42-char hex with 41 prefix
}

// ── TronGrid API ──────────────────────────────────────────────────────────────

const TRON_API = "https://api.trongrid.io";

// ── Main export ───────────────────────────────────────────────────────────────

export interface TrxSendResult {
  txid:  string;
  feeEnergyUnits: number;
}

/**
 * Create, sign, and broadcast a TRX transfer.
 *
 * TRX uses the same private key as EVM (secp256k1 at m/44'/60'/0'/0/0).
 * The signature format for TRON is: 65-byte compact = r(32) + s(32) + v(1)
 * where v = recovery bit (0 or 1).
 *
 * @param senderAddress  Tron address (T…) of the sender
 * @param destAddress    Tron address (T…) of the recipient
 * @param amountTrx      Amount to send in TRX (NOT SUN; 1 TRX = 1,000,000 SUN)
 * @param privateKey     32-byte secp256k1 private key (same as EVM)
 */
export async function buildSignBroadcastTrxTx(
  senderAddress: string,
  destAddress:   string,
  amountTrx:     number,
  privateKey:    Uint8Array,
): Promise<TrxSendResult> {
  const { secp256k1 } = await import("@noble/curves/secp256k1.js");

  const amountSun = Math.round(amountTrx * 1_000_000);
  if (amountSun <= 0) throw new Error("Amount must be positive");

  const senderHex = await tronAddressToHex(senderAddress);
  const destHex   = await tronAddressToHex(destAddress);

  // ── 1. Create unsigned transaction via TronGrid ───────────────────────────
  const createRes = await fetch(`${TRON_API}/wallet/createtransaction`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      owner_address: senderHex,
      to_address:    destHex,
      amount:        amountSun,
      visible:       false,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`TronGrid createtransaction failed: ${text.slice(0, 200)}`);
  }

  const txData = await createRes.json();
  if (txData.Error || txData.error) {
    throw new Error(`TronGrid error: ${txData.Error ?? txData.error}`);
  }

  const txId: string = txData.txID;
  if (!txId) throw new Error("TronGrid returned no txID");

  // ── 2. Sign txID ──────────────────────────────────────────────────────────
  // TRON signs the raw txID bytes (32 bytes) with secp256k1.
  // The signature is compact r||s (64 bytes) + recovery byte (1 byte) = 65 bytes.
  const txIdBytes = hexToBytes(txId);

  const pubkey   = secp256k1.getPublicKey(privateKey, true); // 33-byte compressed
  const sigResult = secp256k1.sign(txIdBytes, privateKey, { lowS: true, prehash: false });

  // Handle both @noble/curves API shapes: compact Uint8Array (v2) or Signature object (v1)
  const compact64: Uint8Array = (sigResult as any).toCompactRawBytes
    ? (sigResult as any).toCompactRawBytes()
    : sigResult as unknown as Uint8Array;

  // Determine recovery bit — try both values and check which recovers our pubkey
  let recoveryBit = (sigResult as any).recovery ?? -1;
  if (recoveryBit < 0) {
    for (let rec = 0; rec <= 1; rec++) {
      try {
        const probe     = new Uint8Array([rec, ...compact64]);
        const recovered = secp256k1.recoverPublicKey(probe, txIdBytes, { prehash: false });
        if (recovered.length === pubkey.length && recovered.every((b, i) => b === pubkey[i])) {
          recoveryBit = rec;
          break;
        }
      } catch { /* try next */ }
    }
    if (recoveryBit < 0) recoveryBit = 0; // fallback
  }

  const sig65 = new Uint8Array(65);
  sig65.set(compact64, 0);
  sig65[64] = recoveryBit;

  const sigHex = bytesToHex(sig65);

  // ── 3. Broadcast ──────────────────────────────────────────────────────────
  const broadcastBody = {
    ...txData,
    signature: [sigHex],
    visible: false,
  };

  const broadcastRes = await fetch(`${TRON_API}/wallet/broadcasttransaction`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(broadcastBody),
  });

  if (!broadcastRes.ok) {
    const text = await broadcastRes.text();
    throw new Error(`TronGrid broadcast failed: ${text.slice(0, 200)}`);
  }

  const broadcastData = await broadcastRes.json();
  if (!broadcastData.result) {
    throw new Error(
      `TRX broadcast rejected: ${broadcastData.message ?? broadcastData.code ?? JSON.stringify(broadcastData)}`,
    );
  }

  return { txid: txId, feeEnergyUnits: 0 };
}
