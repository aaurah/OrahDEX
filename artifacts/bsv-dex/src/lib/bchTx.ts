/**
 * Bitcoin Cash (BCH) UTXO transaction builder + broadcaster (browser-safe).
 *
 * BCH uses the same BIP143 sighash with SIGHASH_FORKID as BSV (0x41).
 * Addresses are CashAddr format: "bitcoincash:q..." from m/44'/145'/0'/0/0.
 *
 * UTXO + broadcast: api.blockchair.com/bitcoin-cash
 *
 * Dependencies already in the project:
 *   @noble/hashes/sha2      — sha256
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

function u32LE(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

function u64LE(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}

function varint(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n < 0x10000) return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  throw new Error("varint too large");
}

async function sha256d(data: Uint8Array): Promise<Uint8Array> {
  const { sha256 } = await import("@noble/hashes/sha2.js");
  return sha256(sha256(data));
}

// ── DER encoding ──────────────────────────────────────────────────────────────

function derEncode(r: Uint8Array, s: Uint8Array): Uint8Array {
  const rPad = r[0] & 0x80 ? concat(new Uint8Array([0]), r) : r;
  const sPad = s[0] & 0x80 ? concat(new Uint8Array([0]), s) : s;
  return concat(
    new Uint8Array([0x30, 4 + rPad.length + sPad.length]),
    new Uint8Array([0x02, rPad.length]), rPad,
    new Uint8Array([0x02, sPad.length]), sPad,
  );
}

// ── CashAddr decode ───────────────────────────────────────────────────────────

const CASHADDR_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function cashAddrConvertBits(data: number[], fromBits: number, toBits: number): number[] {
  let acc = 0, bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const v of data) {
    acc = (acc << fromBits) | v;
    bits += fromBits;
    while (bits >= toBits) { bits -= toBits; result.push((acc >> bits) & maxv); }
  }
  return result;
}

/**
 * Decode a BCH CashAddr address (bitcoincash:q… or q…) → 20-byte hash160.
 * The hash is suitable for building a standard P2PKH scriptPubKey.
 */
function decodeCashAddr(address: string): Uint8Array {
  const lower    = address.toLowerCase();
  const colonIdx = lower.indexOf(":");
  const dataStr  = colonIdx >= 0 ? lower.slice(colonIdx + 1) : lower;

  const data5: number[] = [];
  for (const c of dataStr) {
    const i = CASHADDR_CHARSET.indexOf(c);
    if (i < 0) throw new Error(`Invalid CashAddr char: '${c}' in '${address}'`);
    data5.push(i);
  }

  // Last 8 groups are the checksum; strip them
  const payload5 = data5.slice(0, data5.length - 8);

  // Convert 5-bit groups → 8-bit bytes
  // Payload before encoding: [version_byte=0x00, ...20 bytes hash160]
  const bytes = cashAddrConvertBits(payload5, 5, 8);

  if (bytes.length < 21)
    throw new Error(`CashAddr decode too short for '${address}' (got ${bytes.length} bytes)`);

  return new Uint8Array(bytes.slice(1, 21)); // strip version byte → 20-byte hash160
}

/** Normalise BCH address: strip 'bitcoincash:' prefix for API calls. */
function stripBchPrefix(address: string): string {
  const lower = address.toLowerCase();
  return lower.startsWith("bitcoincash:") ? address.slice(12) : address;
}

// ── Scripts ───────────────────────────────────────────────────────────────────

function p2pkhScript(hash20: Uint8Array): Uint8Array {
  return concat(new Uint8Array([0x76, 0xa9, 0x14]), hash20, new Uint8Array([0x88, 0xac]));
}

// ── UTXO fetch + broadcast (Blockchair BCH) ───────────────────────────────────

export interface BchUTXO {
  txid:  string;
  vout:  number;
  value: number;
}

async function fetchBchUtxos(address: string): Promise<BchUTXO[]> {
  const addr = stripBchPrefix(address);
  const r    = await fetch(
    `https://api.blockchair.com/bitcoin-cash/outputs?q=recipient(${addr}),is_spent(false)&fields=transaction_hash,index,value&limit=50`,
  );
  if (!r.ok) throw new Error(`Blockchair BCH UTXO fetch failed: ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data?.data)) return [];
  return data.data.map((u: any) => ({
    txid:  String(u.transaction_hash),
    vout:  Number(u.index),
    value: Number(u.value),
  }));
}

async function broadcastBchTx(txHex: string): Promise<string> {
  const r = await fetch("https://api.blockchair.com/bitcoin-cash/push/transaction", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ data: txHex }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`BCH broadcast failed: ${text.slice(0, 200)}`);
  }
  const json = await r.json();
  return String(json?.data?.transaction_hash ?? "submitted");
}

// ── Coin selection ────────────────────────────────────────────────────────────

const DUST = 546;

function selectCoins(utxos: BchUTXO[], targetSat: number, feePerByte: number): {
  selected: BchUTXO[]; feeSat: number; changeSat: number;
} {
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected: BchUTXO[] = [];
  let inputSat = 0;

  for (const u of sorted) {
    selected.push(u);
    inputSat += u.value;
    const estBytes = 10 + 148 * selected.length + 34 * 2;
    const fee = estBytes * feePerByte;
    if (inputSat >= targetSat + fee) break;
  }

  const finalBytes = 10 + 148 * selected.length + 34 * 2;
  const feeSat     = finalBytes * feePerByte;
  const changeSat  = inputSat - targetSat - feeSat;

  if (changeSat < 0)
    throw new Error(
      `Insufficient BCH balance. Need ${((targetSat + feeSat) / 1e8).toFixed(8)} BCH, ` +
      `wallet has ${(inputSat / 1e8).toFixed(8)} BCH.`,
    );

  return { selected, feeSat, changeSat };
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface BchSendResult {
  txid:   string;
  txHex:  string;
  feeSat: number;
}

/**
 * Build, sign, and broadcast a BCH P2PKH transaction using BIP143+FORKID.
 *
 * @param senderAddress    BCH CashAddr address (bitcoincash:q…) of sender
 * @param recipientAddress BCH CashAddr address of recipient
 * @param amountSat        Amount in satoshis
 * @param privateKey       32-byte secp256k1 private key (from m/44'/145'/0'/0/0)
 */
export async function buildSignBroadcastBchTx(
  senderAddress:    string,
  recipientAddress: string,
  amountSat:        number,
  privateKey:       Uint8Array,
): Promise<BchSendResult> {
  const { secp256k1 } = await import("@noble/curves/secp256k1.js");
  const { sha256 }    = await import("@noble/hashes/sha2.js");

  const pubkey       = secp256k1.getPublicKey(privateKey, true);
  const senderHash20 = decodeCashAddr(senderAddress);
  const recipHash20  = decodeCashAddr(recipientAddress);

  const utxos = await fetchBchUtxos(senderAddress);
  if (!utxos.length) throw new Error("No UTXOs found. Your BCH wallet has no spendable coins.");

  const FEE_PER_BYTE = 2; // sat/byte (BCH fees are very low)
  const { selected, feeSat, changeSat } = selectCoins(utxos, amountSat, FEE_PER_BYTE);

  const outputs: Array<{ valueSat: bigint; script: Uint8Array }> = [
    { valueSat: BigInt(amountSat), script: p2pkhScript(recipHash20) },
  ];
  if (changeSat >= DUST)
    outputs.push({ valueSat: BigInt(changeSat), script: p2pkhScript(senderHash20) });

  // BIP143 + SIGHASH_FORKID — identical to BSV signing
  const SIGHASH_ALL_FORKID = 0x41;
  const senderScript = p2pkhScript(senderHash20);

  // Pre-images for BIP143 (committed to for each input)
  const hashPrevouts = await sha256d(concat(
    ...selected.map(u => concat(hexToBytes(u.txid).reverse(), u32LE(u.vout))),
  ));
  const hashSequence = await sha256d(concat(
    ...selected.map(() => u32LE(0xffffffff)),
  ));
  const hashOutputs = await sha256d(concat(
    ...outputs.map(o => concat(u64LE(o.valueSat), varint(o.script.length), o.script)),
  ));

  const scriptSigs: Uint8Array[] = [];
  for (const utxo of selected) {
    const scriptCode = concat(varint(senderScript.length), senderScript);
    const preimage   = concat(
      u32LE(1),
      hashPrevouts,
      hashSequence,
      hexToBytes(utxo.txid).reverse(),
      u32LE(utxo.vout),
      scriptCode,
      u64LE(BigInt(utxo.value)),
      u32LE(0xffffffff),
      hashOutputs,
      u32LE(0),
      u32LE(SIGHASH_ALL_FORKID),
    );

    const sighash = sha256(sha256(preimage));
    const raw     = secp256k1.sign(sighash, privateKey, { lowS: true, prehash: false });
    const der     = derEncode(raw.slice(0, 32), raw.slice(32, 64));
    const derSig  = concat(der, new Uint8Array([SIGHASH_ALL_FORKID]));

    const scriptSig = concat(
      varint(derSig.length), derSig,
      varint(pubkey.length), pubkey,
    );
    scriptSigs.push(scriptSig);
  }

  // Serialise transaction (legacy P2PKH format — no segwit marker)
  const parts: Uint8Array[] = [u32LE(1), varint(selected.length)];
  for (let i = 0; i < selected.length; i++) {
    parts.push(hexToBytes(selected[i].txid).reverse());
    parts.push(u32LE(selected[i].vout));
    parts.push(varint(scriptSigs[i].length));
    parts.push(scriptSigs[i]);
    parts.push(u32LE(0xffffffff));
  }
  parts.push(varint(outputs.length));
  for (const o of outputs) {
    parts.push(u64LE(o.valueSat));
    parts.push(varint(o.script.length));
    parts.push(o.script);
  }
  parts.push(u32LE(0));

  const txBytes   = concat(...parts);
  const txHex     = bytesToHex(txBytes);
  const localTxid = bytesToHex(sha256(sha256(txBytes)).reverse());

  const broadcastTxid = await broadcastBchTx(txHex);
  return { txid: broadcastTxid || localTxid, txHex, feeSat };
}
