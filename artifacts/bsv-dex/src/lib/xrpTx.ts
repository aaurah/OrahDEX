/**
 * XRP Ledger Payment transaction builder + broadcaster (browser-safe).
 *
 * Implements XRP binary serialization and secp256k1 signing from scratch —
 * no ripple-binary-codec or xrpl.js dependency required.
 *
 * Flow:
 *   1. Fetch account sequence + current ledger index from ripple public node
 *   2. Build canonical binary-serialized Payment transaction (no TxnSignature)
 *   3. Prepend signing prefix 0x53545800 ("STX\x00")
 *   4. SHA512Half (first 32 bytes of SHA-512) → 32-byte signing hash
 *   5. Sign with secp256k1, DER-encode
 *   6. Re-serialize with TxnSignature included and submit
 *
 * Dependencies already in the project:
 *   @noble/hashes/sha2      — sha512
 *   @noble/curves/secp256k1 — signing
 */

// ── Byte helpers ──────────────────────────────────────────────────────────────

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) hex = "0" + hex;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

function u16BE(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}

function u32BE(n: number): Uint8Array {
  return new Uint8Array([(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
}

// ── XRP Base58 alphabet ───────────────────────────────────────────────────────

const XRP_BASE58 = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

function base58DecodeXrp(s: string): Uint8Array {
  let n = BigInt(0);
  for (const c of s) {
    const i = XRP_BASE58.indexOf(c);
    if (i < 0) throw new Error(`Invalid XRP base58 char: ${c}`);
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== XRP_BASE58[0]) break; bytes.unshift(0); }
  return new Uint8Array(bytes);
}

/**
 * Decode an XRP address (r…) → 20-byte account ID.
 * XRP address = Base58Check(version=0x00 + 20-byte hash) with XRP alphabet.
 */
async function decodeXrpAddress(address: string): Promise<Uint8Array> {
  const { sha256 } = await import("@noble/hashes/sha2.js");
  const decoded    = base58DecodeXrp(address);
  if (decoded.length !== 25)
    throw new Error(`Bad XRP address length ${decoded.length} for ${address}`);
  const payload  = decoded.slice(0, 21);
  const checksum = decoded.slice(21, 25);
  const expected = sha256(sha256(payload)).slice(0, 4);
  if (!checksum.every((b, i) => b === expected[i]))
    throw new Error(`Bad XRP address checksum for ${address}`);
  return decoded.slice(1, 21); // version byte stripped → 20-byte account ID
}

// ── XRP DER signature ─────────────────────────────────────────────────────────

function derEncode(r: Uint8Array, s: Uint8Array): Uint8Array {
  const rPad = r[0] & 0x80 ? concat(new Uint8Array([0]), r) : r;
  const sPad = s[0] & 0x80 ? concat(new Uint8Array([0]), s) : s;
  return concat(
    new Uint8Array([0x30, 4 + rPad.length + sPad.length]),
    new Uint8Array([0x02, rPad.length]), rPad,
    new Uint8Array([0x02, sPad.length]), sPad,
  );
}

// ── XRP binary serialization ──────────────────────────────────────────────────

/**
 * Variable-length (VL) blob prefix.
 * For lengths < 193: 1 byte.
 */
function vlEncode(data: Uint8Array): Uint8Array {
  if (data.length > 192) throw new Error(`VL too large: ${data.length}`);
  return concat(new Uint8Array([data.length]), data);
}

/**
 * Encode an XRP native amount as 8 bytes (UInt64).
 * XRP amount encoding: bit 63 = 0 (not IOU), bit 62 = 1 (positive),
 * bits 61-0 = drops (satoshis). So: 0x4000000000000000 | drops.
 */
function xrpAmountBytes(drops: bigint): Uint8Array {
  const val = 0x4000000000000000n | drops;
  const b = new Uint8Array(8);
  let v = val;
  for (let i = 7; i >= 0; i--) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}

/**
 * XRP field prefix byte.
 * If both typeCode < 16 and fieldCode < 16: single byte = (type << 4) | field.
 * If typeCode < 16 and fieldCode >= 16: two bytes = [type << 4, field].
 */
function fieldPrefix(typeCode: number, fieldCode: number): Uint8Array {
  if (typeCode < 16 && fieldCode < 16)
    return new Uint8Array([(typeCode << 4) | fieldCode]);
  if (typeCode < 16 && fieldCode >= 16)
    return new Uint8Array([(typeCode << 4), fieldCode]);
  if (typeCode >= 16 && fieldCode < 16)
    return new Uint8Array([fieldCode, typeCode]);
  return new Uint8Array([0, typeCode, fieldCode]);
}

/**
 * Serialize an XRP Payment transaction in canonical field order.
 * Pass signerPubkey (33 bytes) and optionally txnSignature (DER bytes).
 *
 * Canonical field order (typeCode ASC, fieldCode ASC within type):
 *   UInt16  (1): TransactionType (1)
 *   UInt32  (2): Flags (2), Sequence (4), LastLedgerSequence (27)
 *   Amount  (6): Amount (1), Fee (8)
 *   Blob    (7): SigningPubKey (3), [TxnSignature (4)]
 *   Account (8): Account (1), Destination (3)
 */
function serializePayment(params: {
  sequence:           number;
  lastLedgerSequence: number;
  amountDrops:        bigint;
  feeDrops:           bigint;
  signerPubkey:       Uint8Array; // 33 bytes compressed
  senderAccountId:    Uint8Array; // 20 bytes
  destAccountId:      Uint8Array; // 20 bytes
  txnSignature?:      Uint8Array; // DER bytes (only when finalizing)
}): Uint8Array {
  const {
    sequence, lastLedgerSequence, amountDrops, feeDrops,
    signerPubkey, senderAccountId, destAccountId, txnSignature,
  } = params;

  const parts: Uint8Array[] = [];

  // UInt16(1,1): TransactionType = 0 (Payment)
  parts.push(fieldPrefix(1, 1), u16BE(0));

  // UInt32(2,2): Flags = 0
  parts.push(fieldPrefix(2, 2), u32BE(0));

  // UInt32(2,4): Sequence
  parts.push(fieldPrefix(2, 4), u32BE(sequence));

  // UInt32(2,27): LastLedgerSequence  [typeCode=2 < 16, fieldCode=27 >= 16 → 2-byte prefix]
  parts.push(fieldPrefix(2, 27), u32BE(lastLedgerSequence));

  // Amount(6,1): Amount
  parts.push(fieldPrefix(6, 1), xrpAmountBytes(amountDrops));

  // Amount(6,8): Fee
  parts.push(fieldPrefix(6, 8), xrpAmountBytes(feeDrops));

  // Blob(7,3): SigningPubKey (33 bytes VL)
  parts.push(fieldPrefix(7, 3), vlEncode(signerPubkey));

  // Blob(7,4): TxnSignature (only when finalizing)
  if (txnSignature) parts.push(fieldPrefix(7, 4), vlEncode(txnSignature));

  // Account(8,1): Account (20 bytes VL)
  parts.push(fieldPrefix(8, 1), vlEncode(senderAccountId));

  // Account(8,3): Destination (20 bytes VL)
  parts.push(fieldPrefix(8, 3), vlEncode(destAccountId));

  return concat(...parts);
}

// ── XRPL public node ──────────────────────────────────────────────────────────

const XRPL_NODE = "https://xrplcluster.com/";

async function xrplRpc(method: string, params: object): Promise<any> {
  const r = await fetch(XRPL_NODE, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ method, params: [params] }),
  });
  if (!r.ok) throw new Error(`XRPL RPC failed: ${r.status}`);
  const json = await r.json();
  if (json.result?.status === "error")
    throw new Error(`XRPL error: ${json.result.error_message ?? json.result.error}`);
  return json.result;
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface XrpSendResult {
  txid:    string;
  feeDrop: number;
}

/**
 * Sign and submit an XRP Payment transaction from the given address.
 *
 * @param senderAddress  XRP address (r…) of the sender
 * @param destAddress    XRP address (r…) of the recipient
 * @param amountXrp      Amount to send in XRP (NOT drops)
 * @param privateKey     32-byte secp256k1 private key
 */
export async function buildSignBroadcastXrpTx(
  senderAddress: string,
  destAddress:   string,
  amountXrp:     number,
  privateKey:    Uint8Array,
): Promise<XrpSendResult> {
  const { secp256k1 } = await import("@noble/curves/secp256k1.js");
  const { sha512 }    = await import("@noble/hashes/sha2.js");

  const pubkey = secp256k1.getPublicKey(privateKey, true); // 33-byte compressed

  const [senderAccountId, destAccountId] = await Promise.all([
    decodeXrpAddress(senderAddress),
    decodeXrpAddress(destAddress),
  ]);

  // ── Fetch account info and current ledger ─────────────────────────────────
  const [accountRes, ledgerRes] = await Promise.all([
    xrplRpc("account_info", { account: senderAddress, ledger_index: "current" }),
    xrplRpc("ledger", { ledger_index: "validated", transactions: false }),
  ]);

  const sequence           = Number(accountRes.account_data.Sequence);
  const lastLedgerSequence = Number(ledgerRes.ledger.ledger_index) + 4; // valid for ~4 ledgers

  const FEE_DROPS = 12n; // standard XRP fee
  const amountDrops = BigInt(Math.round(amountXrp * 1_000_000));

  if (amountDrops <= 0n) throw new Error("Amount must be positive");

  // ── Build unsigned transaction ────────────────────────────────────────────
  const unsignedBytes = serializePayment({
    sequence, lastLedgerSequence, amountDrops, feeDrops: FEE_DROPS,
    signerPubkey: pubkey, senderAccountId, destAccountId,
  });

  // ── SHA512Half signing hash ───────────────────────────────────────────────
  const SIGNING_PREFIX = new Uint8Array([0x53, 0x54, 0x58, 0x00]); // "STX\x00"
  const toHash         = concat(SIGNING_PREFIX, unsignedBytes);
  const hash512        = sha512(toHash);
  const signingHash    = hash512.slice(0, 32); // first 32 bytes

  // ── Sign ──────────────────────────────────────────────────────────────────
  const raw      = secp256k1.sign(signingHash, privateKey, { lowS: true, prehash: false });
  const derBytes = derEncode(raw.slice(0, 32), raw.slice(32, 64));

  // ── Re-serialize with TxnSignature ───────────────────────────────────────
  const signedBytes = serializePayment({
    sequence, lastLedgerSequence, amountDrops, feeDrops: FEE_DROPS,
    signerPubkey: pubkey, senderAccountId, destAccountId,
    txnSignature: derBytes,
  });

  const txBlob = bytesToHex(signedBytes).toUpperCase();

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitRes = await xrplRpc("submit", { tx_blob: txBlob });
  const engineResult: string = submitRes.engine_result ?? "";

  if (!engineResult.startsWith("tes") && engineResult !== "tesSUCCESS")
    throw new Error(`XRP submit error: ${engineResult} — ${submitRes.engine_result_message ?? ""}`);

  const txid = String(submitRes.tx_json?.hash ?? submitRes.transaction?.hash ?? "submitted");
  return { txid, feeDrop: Number(FEE_DROPS) };
}
