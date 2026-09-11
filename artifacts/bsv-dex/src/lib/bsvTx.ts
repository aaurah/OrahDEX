/**
 * BSV (Bitcoin SV) raw transaction builder & broadcaster.
 *
 * Constructs P2PKH transactions using BIP143 sighash with SIGHASH_ALL |
 * SIGHASH_FORKID (0x41) — required for BSV/BCH replay protection.
 *
 * Dependencies already in the project:
 *   @noble/hashes/sha2      — sha256
 *   @noble/curves/secp256k1 — signing
 *
 * No RIPEMD160 needed: we decode the P2PKH address (base58check) to extract
 * the 20-byte hash160 directly, so we never have to compute it from a pubkey.
 */

// ── Byte helpers ──────────────────────────────────────────────────────────────

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) hex = "0" + hex;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
}

function u32LE(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

function u64LE(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  for (let i = 0; i < 8; i++) { b[i] = Number(n & 0xffn); n >>= 8n; }
  return b;
}

function varint(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n < 0x10000) return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  throw new Error("varint too large");
}

// ── SHA256d (double-SHA256) ───────────────────────────────────────────────────

async function sha256d(data: Uint8Array): Promise<Uint8Array> {
  const { sha256 } = await import("@noble/hashes/sha2.js");
  return sha256(sha256(data));
}

// ── Base58 decode ─────────────────────────────────────────────────────────────

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): Uint8Array {
  let n = BigInt(0);
  for (const c of s) {
    const i = BASE58.indexOf(c);
    if (i < 0) throw new Error(`Invalid base58 character: ${c}`);
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; bytes.unshift(0); }
  return new Uint8Array(bytes);
}

/**
 * Decode a P2PKH address (1…) → 20-byte hash160 (pubkey hash).
 * Validates the base58check checksum.
 */
export async function decodeP2PKH(address: string): Promise<Uint8Array> {
  const decoded = base58Decode(address);
  if (decoded.length !== 25)
    throw new Error(`Bad address length: ${decoded.length} (expected 25)`);
  const payload  = decoded.slice(0, 21);
  const checksum = decoded.slice(21, 25);
  const expected = (await sha256d(payload)).slice(0, 4);
  if (!checksum.every((b, i) => b === expected[i]))
    throw new Error(`Bad address checksum for ${address}`);
  // payload[0] = version byte (0x00 = BSV mainnet P2PKH)
  return decoded.slice(1, 21);  // 20-byte hash160
}

// ── P2PKH script ─────────────────────────────────────────────────────────────

/** Build a P2PKH scriptPubKey: OP_DUP OP_HASH160 <hash20> OP_EQUALVERIFY OP_CHECKSIG */
function p2pkhScript(hash20: Uint8Array): Uint8Array {
  return concat(
    new Uint8Array([0x76, 0xa9, 0x14]),
    hash20,
    new Uint8Array([0x88, 0xac]),
  );
}

// ── DER signature encoding ────────────────────────────────────────────────────

function derEncode(r: Uint8Array, s: Uint8Array): Uint8Array {
  // Pad r/s if high bit set (to avoid sign misinterpretation)
  const rPad = r[0] & 0x80 ? concat(new Uint8Array([0]), r) : r;
  const sPad = s[0] & 0x80 ? concat(new Uint8Array([0]), s) : s;
  return concat(
    new Uint8Array([0x30, 4 + rPad.length + sPad.length]),
    new Uint8Array([0x02, rPad.length]), rPad,
    new Uint8Array([0x02, sPad.length]), sPad,
  );
}

// ── UTXO types ────────────────────────────────────────────────────────────────

export interface UTXO {
  txid:  string;   // hex, display (big-endian) byte order
  vout:  number;
  value: number;   // satoshis
}

export interface BsvSendResult {
  txid:   string;
  txHex:  string;
  feeSat: number;
}

// ── WhatsOnChain helpers ──────────────────────────────────────────────────────

export async function fetchBsvUtxos(address: string): Promise<UTXO[]> {
  const r = await fetch(
    `https://api.whatsonchain.com/v1/bsv/main/address/${address}/unspent`,
  );
  if (!r.ok) throw new Error(`WoC UTXO fetch failed: ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) return [];
  return data.map((u: any) => ({
    txid:  String(u.tx_hash),
    vout:  Number(u.tx_pos),
    value: Number(u.value),
  }));
}

async function broadcastBsvTx(txHex: string): Promise<string> {
  const r = await fetch("https://api.whatsonchain.com/v1/bsv/main/tx/raw", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ txhex: txHex }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Broadcast failed: ${text}`);
  // Response is a plain txid string (possibly with quotes)
  return text.replace(/"/g, "").trim();
}

// ── Core transaction builder ──────────────────────────────────────────────────

const FEE_RATE_SAT_PER_BYTE = 1;
const DUST_SAT = 546;

/**
 * Build, sign, and broadcast a BSV P2PKH transaction.
 *
 * @param senderAddress  BSV P2PKH address of the sender (e.g. "1BfxKW…")
 * @param recipientAddress  BSV P2PKH address of the recipient
 * @param amountSat  Amount to send in satoshis
 * @param privateKey  32-byte BSV private key (secp256k1)
 */
export async function buildSignBroadcastBsvTx(
  senderAddress:    string,
  recipientAddress: string,
  amountSat:        number,
  privateKey:       Uint8Array,
): Promise<BsvSendResult> {
  const { secp256k1 } = await import("@noble/curves/secp256k1.js");
  const { sha256 }    = await import("@noble/hashes/sha2.js");

  const pubkey        = secp256k1.getPublicKey(privateKey, true); // 33-byte compressed
  const senderHash20  = await decodeP2PKH(senderAddress);
  const recipHash20   = await decodeP2PKH(recipientAddress);

  // ── 1. Fetch UTXOs ────────────────────────────────────────────────────────
  const allUtxos = await fetchBsvUtxos(senderAddress);
  if (allUtxos.length === 0)
    throw new Error("No UTXOs found. Your BSV wallet has no spendable coins.");

  // Sort largest first for minimal input count
  allUtxos.sort((a, b) => b.value - a.value);

  // ── 2. Coin selection (greedy) ────────────────────────────────────────────
  const selected: UTXO[] = [];
  let inputSat = 0;

  for (const utxo of allUtxos) {
    selected.push(utxo);
    inputSat += utxo.value;
    const estSize = 10 + 148 * selected.length + 34 * 2; // ~148b/input, ~34b/output
    const fee     = estSize * FEE_RATE_SAT_PER_BYTE;
    if (inputSat >= amountSat + fee) break;
  }

  const estFinalSize = 10 + 148 * selected.length + 34 * 2;
  const feeSat       = estFinalSize * FEE_RATE_SAT_PER_BYTE;
  const changeSat    = inputSat - amountSat - feeSat;

  if (changeSat < 0)
    throw new Error(
      `Insufficient balance. Need ${((amountSat + feeSat) / 1e8).toFixed(8)} BSV, ` +
      `wallet has ${(inputSat / 1e8).toFixed(8)} BSV.`,
    );

  // ── 3. Build outputs ──────────────────────────────────────────────────────
  const outputs: Array<{ valueSat: bigint; script: Uint8Array }> = [
    { valueSat: BigInt(amountSat), script: p2pkhScript(recipHash20) },
  ];
  if (changeSat >= DUST_SAT) {
    outputs.push({ valueSat: BigInt(changeSat), script: p2pkhScript(senderHash20) });
  }

  // ── 4. BIP143 sighash preimages ───────────────────────────────────────────
  // hashPrevouts = SHA256d(all outpoints concatenated)
  const hashPrevouts = await sha256d(concat(
    ...selected.map(u => concat(hexToBytes(u.txid).reverse(), u32LE(u.vout))),
  ));

  // hashSequence = SHA256d(all sequences = 0xFFFFFFFF)
  const hashSequence = await sha256d(concat(
    ...selected.map(() => u32LE(0xffffffff)),
  ));

  // hashOutputs = SHA256d(serialized outputs)
  const hashOutputs = await sha256d(concat(
    ...outputs.map(o => concat(u64LE(o.valueSat), varint(o.script.length), o.script)),
  ));

  // Sender's scriptCode (scriptPubKey of inputs being spent — they all come from senderAddress)
  const senderScript = p2pkhScript(senderHash20);
  const scriptCodeField = concat(varint(senderScript.length), senderScript);

  // ── 5. Sign each input ────────────────────────────────────────────────────
  const SIGHASH_TYPE = 0x41; // SIGHASH_ALL | SIGHASH_FORKID

  const scriptSigs: Uint8Array[] = [];
  for (const utxo of selected) {
    const preimage = concat(
      u32LE(1),                          // nVersion
      hashPrevouts,                      // hashPrevouts
      hashSequence,                      // hashSequence
      hexToBytes(utxo.txid).reverse(),   // outpoint txid (LE)
      u32LE(utxo.vout),                  // outpoint vout
      scriptCodeField,                   // scriptCode
      u64LE(BigInt(utxo.value)),         // input value
      u32LE(0xffffffff),                 // nSequence
      hashOutputs,                       // hashOutputs
      u32LE(0),                          // nLocktime
      u32LE(SIGHASH_TYPE),               // sighash type
    );

    const sighash = sha256(sha256(preimage)); // SHA256d

    // @noble/curves v2: sign() returns a raw 64-byte Uint8Array (compact r‖s) directly
    const raw    = secp256k1.sign(sighash, privateKey, { lowS: true, prehash: false });
    const der    = derEncode(raw.slice(0, 32), raw.slice(32, 64));
    const derPlusSighash = concat(der, new Uint8Array([SIGHASH_TYPE]));

    // scriptSig = <sig_push> <der+sighash> <pubkey_push> <compressed_pubkey>
    const scriptSig = concat(
      varint(derPlusSighash.length), derPlusSighash,
      varint(pubkey.length),         pubkey,
    );
    scriptSigs.push(scriptSig);
  }

  // ── 6. Serialize transaction ──────────────────────────────────────────────
  const parts: Uint8Array[] = [u32LE(1)]; // version

  parts.push(varint(selected.length));
  for (let i = 0; i < selected.length; i++) {
    parts.push(hexToBytes(selected[i].txid).reverse()); // txid LE
    parts.push(u32LE(selected[i].vout));
    parts.push(varint(scriptSigs[i].length));
    parts.push(scriptSigs[i]);
    parts.push(u32LE(0xffffffff)); // sequence
  }

  parts.push(varint(outputs.length));
  for (const o of outputs) {
    parts.push(u64LE(o.valueSat));
    parts.push(varint(o.script.length));
    parts.push(o.script);
  }

  parts.push(u32LE(0)); // locktime

  const txBytes = concat(...parts);
  const txHex   = bytesToHex(txBytes);
  const txid    = bytesToHex(sha256(sha256(txBytes)).reverse()); // SHA256d, display order

  // ── 7. Broadcast ─────────────────────────────────────────────────────────
  const broadcastTxid = await broadcastBsvTx(txHex);

  return { txid: broadcastTxid || txid, txHex, feeSat };
}
