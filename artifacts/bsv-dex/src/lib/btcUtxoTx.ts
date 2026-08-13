/**
 * BTC / LTC / DOGE UTXO transaction builder + broadcaster (browser-safe).
 *
 * BTC  — P2WPKH native-segwit (bc1q… from m/84'/0'/0'/0/0)
 *         BIP143 sighash, SIGHASH_ALL = 0x01  (no FORKID)
 *         Segwit serialisation with witness data
 *         UTXO + broadcast: mempool.space
 *
 * LTC  — P2PKH legacy (L… from m/44'/2'/0'/0/0)
 *         Legacy sighash, SIGHASH_ALL = 0x01
 *         UTXO + broadcast: litecoinspace.org
 *
 * DOGE — P2PKH legacy (D… from m/44'/3'/0'/0/0)
 *         Same sighash/serialisation as LTC
 *         UTXO: api.blockchair.com; broadcast: api.blockchair.com
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
  for (let i = 0; i < 8; i++) { b[i] = Number(n & 0xffn); n >>= 8n; }
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

// ── DER signature encoding ─────────────────────────────────────────────────

function derEncode(r: Uint8Array, s: Uint8Array): Uint8Array {
  const rPad = r[0] & 0x80 ? concat(new Uint8Array([0]), r) : r;
  const sPad = s[0] & 0x80 ? concat(new Uint8Array([0]), s) : s;
  return concat(
    new Uint8Array([0x30, 4 + rPad.length + sPad.length]),
    new Uint8Array([0x02, rPad.length]), rPad,
    new Uint8Array([0x02, sPad.length]), sPad,
  );
}

// ── Base58Check decode (Bitcoin alphabet) ────────────────────────────────────

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

/** Decode a P2PKH address (legacy L…, D…, 1…) → 20-byte hash160. */
async function decodeP2PKH(address: string): Promise<Uint8Array> {
  const decoded = base58Decode(address);
  if (decoded.length !== 25)
    throw new Error(`Bad address length ${decoded.length} for ${address}`);
  const payload  = decoded.slice(0, 21);
  const checksum = decoded.slice(21, 25);
  const expected = (await sha256d(payload)).slice(0, 4);
  if (!checksum.every((b, i) => b === expected[i]))
    throw new Error(`Bad address checksum for ${address}`);
  return decoded.slice(1, 21); // strip version byte → 20-byte hash
}

// ── Bech32 decode (BTC native segwit P2WPKH bc1q…) ──────────────────────────

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= BECH32_GEN[i];
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (const ch of hrp) ret.push(ch.charCodeAt(0) >> 5);
  ret.push(0);
  for (const ch of hrp) ret.push(ch.charCodeAt(0) & 31);
  return ret;
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0, bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const v of data) {
    acc = (acc << fromBits) | v;
    bits += fromBits;
    while (bits >= toBits) { bits -= toBits; result.push((acc >> bits) & maxv); }
  }
  if (pad && bits > 0) result.push((acc << (toBits - bits)) & maxv);
  return result;
}

/** Decode a P2WPKH bech32 address (bc1q…) → 20-byte witness program. */
function decodeBech32P2WPKH(address: string): Uint8Array {
  const lower = address.toLowerCase();
  const pos = lower.lastIndexOf("1");
  if (pos < 1) throw new Error(`Invalid bech32: ${address}`);
  const hrp = lower.slice(0, pos);
  const dataStr = lower.slice(pos + 1);

  const data: number[] = [];
  for (const ch of dataStr) {
    const v = BECH32_CHARSET.indexOf(ch);
    if (v < 0) throw new Error(`Invalid bech32 char: ${ch}`);
    data.push(v);
  }

  const expand = bech32HrpExpand(hrp);
  if (bech32Polymod([...expand, ...data]) !== 1)
    throw new Error(`Invalid bech32 checksum for ${address}`);

  const witnessVersion = data[0];
  if (witnessVersion !== 0)
    throw new Error(`Unsupported witness version ${witnessVersion}`);

  const program5 = data.slice(1, data.length - 6);
  const program  = convertBits(program5, 5, 8, false);
  if (program.length !== 20)
    throw new Error(`Invalid P2WPKH program length ${program.length} (expected 20)`);

  return new Uint8Array(program);
}

// ── Scripts ──────────────────────────────────────────────────────────────────

/** P2PKH scriptPubKey: OP_DUP OP_HASH160 <hash20> OP_EQUALVERIFY OP_CHECKSIG */
function p2pkhScript(hash20: Uint8Array): Uint8Array {
  return concat(new Uint8Array([0x76, 0xa9, 0x14]), hash20, new Uint8Array([0x88, 0xac]));
}

/** P2WPKH scriptPubKey: OP_0 PUSH20 <hash20> */
function p2wpkhScript(hash20: Uint8Array): Uint8Array {
  return concat(new Uint8Array([0x00, 0x14]), hash20);
}

// ── UTXO types ────────────────────────────────────────────────────────────────

export interface UTXO {
  txid:  string;
  vout:  number;
  value: number;
}

export interface UtxoSendResult {
  txid:   string;
  txHex:  string;
  feeSat: number;
  chain:  string;
}

// ── UTXO fetchers ─────────────────────────────────────────────────────────────

async function fetchBtcUtxos(address: string): Promise<UTXO[]> {
  const r = await fetch(`https://mempool.space/api/address/${address}/utxo`);
  if (!r.ok) throw new Error(`mempool.space UTXO fetch failed: ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) return [];
  return data.map((u: any) => ({ txid: String(u.txid), vout: Number(u.vout), value: Number(u.value) }));
}

async function fetchLtcUtxos(address: string): Promise<UTXO[]> {
  const r = await fetch(`https://litecoinspace.org/api/address/${address}/utxo`);
  if (!r.ok) throw new Error(`litecoinspace UTXO fetch failed: ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) return [];
  return data.map((u: any) => ({ txid: String(u.txid), vout: Number(u.vout), value: Number(u.value) }));
}

async function fetchDogeUtxos(address: string): Promise<UTXO[]> {
  const r = await fetch(
    `https://api.blockchair.com/dogecoin/outputs?q=recipient(${address}),is_spent(false)&fields=transaction_hash,index,value&limit=50`,
  );
  if (!r.ok) throw new Error(`Blockchair DOGE UTXO fetch failed: ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data?.data)) return [];
  return data.data.map((u: any) => ({
    txid:  String(u.transaction_hash),
    vout:  Number(u.index),
    value: Number(u.value),
  }));
}

// ── Broadcasters ──────────────────────────────────────────────────────────────

async function broadcastBtcTx(txHex: string): Promise<string> {
  const r = await fetch("https://mempool.space/api/tx", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: txHex,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`BTC broadcast failed: ${text.slice(0, 200)}`);
  return text.trim();
}

async function broadcastLtcTx(txHex: string): Promise<string> {
  const r = await fetch("https://litecoinspace.org/api/tx", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: txHex,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`LTC broadcast failed: ${text.slice(0, 200)}`);
  return text.trim();
}

async function broadcastDogeTx(txHex: string): Promise<string> {
  const r = await fetch("https://api.blockchair.com/dogecoin/push/transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: txHex }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`DOGE broadcast failed: ${text.slice(0, 200)}`);
  }
  const json = await r.json();
  return String(json?.data?.transaction_hash ?? "submitted");
}

// ── Coin selection ────────────────────────────────────────────────────────────

const DUST = 546;

function selectCoins(utxos: UTXO[], targetSat: number, feePerByte: number, bytesPerInput: number): {
  selected: UTXO[];
  feeSat: number;
  changeSat: number;
} {
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected: UTXO[] = [];
  let inputSat = 0;

  for (const u of sorted) {
    selected.push(u);
    inputSat += u.value;
    const estBytes = 10 + bytesPerInput * selected.length + 34 * 2;
    const fee = estBytes * feePerByte;
    if (inputSat >= targetSat + fee) break;
  }

  const finalBytes = 10 + bytesPerInput * selected.length + 34 * 2;
  const feeSat     = finalBytes * feePerByte;
  const changeSat  = inputSat - targetSat - feeSat;

  if (changeSat < 0)
    throw new Error(
      `Insufficient balance. Need ${((targetSat + feeSat) / 1e8).toFixed(8)}, ` +
      `wallet has ${(inputSat / 1e8).toFixed(8)}.`,
    );

  return { selected, feeSat, changeSat };
}

// ── BTC (P2WPKH segwit) ───────────────────────────────────────────────────────

/**
 * Build, sign, and broadcast a BTC P2WPKH native-segwit transaction.
 * Sender address must be a bech32 bc1q… address derived at m/84'/0'/0'/0/0.
 */
export async function buildSignBroadcastBtcTx(
  senderAddress:    string,
  recipientAddress: string,
  amountSat:        number,
  privateKey:       Uint8Array,
): Promise<UtxoSendResult> {
  const { secp256k1 } = await import("@noble/curves/secp256k1.js");
  const { sha256 }    = await import("@noble/hashes/sha2.js");

  const pubkey       = secp256k1.getPublicKey(privateKey, true); // 33-byte compressed
  const senderHash20 = decodeBech32P2WPKH(senderAddress);

  let recipHash20: Uint8Array;
  let recipScript: Uint8Array;
  if (recipientAddress.toLowerCase().startsWith("bc1q")) {
    recipHash20 = decodeBech32P2WPKH(recipientAddress);
    recipScript = p2wpkhScript(recipHash20);
  } else {
    recipHash20 = await decodeP2PKH(recipientAddress);
    recipScript = p2pkhScript(recipHash20);
  }

  const utxos = await fetchBtcUtxos(senderAddress);
  if (!utxos.length) throw new Error("No UTXOs found. Your BTC wallet has no spendable coins.");

  // Segwit input: ~68 vbytes (41 non-witness + 27 witness half-weight)
  const VBYTE_PER_INPUT = 68;
  const FEE_RATE = 20; // sat/vbyte
  const { selected, feeSat, changeSat } = selectCoins(utxos, amountSat, FEE_RATE, VBYTE_PER_INPUT);

  const outputs: Array<{ valueSat: bigint; script: Uint8Array }> = [
    { valueSat: BigInt(amountSat), script: recipScript },
  ];
  if (changeSat >= DUST)
    outputs.push({ valueSat: BigInt(changeSat), script: p2wpkhScript(senderHash20) });

  // ── BIP143 sighash components ─────────────────────────────────────────────
  const SIGHASH_ALL = 0x01;
  const senderScript    = p2pkhScript(senderHash20); // scriptCode for P2WPKH
  const scriptCodeField = concat(varint(senderScript.length), senderScript);

  const hashPrevouts = await sha256d(concat(
    ...selected.map(u => concat(hexToBytes(u.txid).reverse(), u32LE(u.vout))),
  ));
  const hashSequence = await sha256d(concat(
    ...selected.map(() => u32LE(0xffffffff)),
  ));
  const hashOutputs = await sha256d(concat(
    ...outputs.map(o => concat(u64LE(o.valueSat), varint(o.script.length), o.script)),
  ));

  // ── Sign each input ───────────────────────────────────────────────────────
  const witnesses: Uint8Array[] = [];
  for (const utxo of selected) {
    const preimage = concat(
      u32LE(1),                          // nVersion = 1 (standard for P2WPKH segwit txs)
      hashPrevouts,
      hashSequence,
      hexToBytes(utxo.txid).reverse(),
      u32LE(utxo.vout),
      scriptCodeField,
      u64LE(BigInt(utxo.value)),
      u32LE(0xffffffff),
      hashOutputs,
      u32LE(0),                          // nLocktime
      u32LE(SIGHASH_ALL),
    );

    const sighash = sha256(sha256(preimage));
    const raw     = secp256k1.sign(sighash, privateKey, { lowS: true, prehash: false });
    const der     = derEncode(raw.slice(0, 32), raw.slice(32, 64));
    const derSig  = concat(der, new Uint8Array([SIGHASH_ALL]));

    witnesses.push(concat(
      new Uint8Array([0x02]),            // 2 witness items
      varint(derSig.length), derSig,
      varint(pubkey.length), pubkey,
    ));
  }

  // Fix version: BTC segwit uses version 1 or 2? Standard is version 1.
  // ── Serialize segwit transaction ──────────────────────────────────────────
  const parts: Uint8Array[] = [u32LE(1)]; // version 1

  // marker + flag
  parts.push(new Uint8Array([0x00, 0x01]));

  // inputs (empty scriptSig — segwit)
  parts.push(varint(selected.length));
  for (const utxo of selected) {
    parts.push(hexToBytes(utxo.txid).reverse());
    parts.push(u32LE(utxo.vout));
    parts.push(new Uint8Array([0x00])); // empty scriptSig
    parts.push(u32LE(0xffffffff));
  }

  // outputs
  parts.push(varint(outputs.length));
  for (const o of outputs) {
    parts.push(u64LE(o.valueSat));
    parts.push(varint(o.script.length));
    parts.push(o.script);
  }

  // witness (one per input)
  for (const w of witnesses) parts.push(w);

  parts.push(u32LE(0)); // locktime

  const txBytes = concat(...parts);
  const txHex   = bytesToHex(txBytes);

  // txid = SHA256d of the NON-witness serialisation
  const legacyParts: Uint8Array[] = [u32LE(1)];
  legacyParts.push(varint(selected.length));
  for (const utxo of selected) {
    legacyParts.push(hexToBytes(utxo.txid).reverse());
    legacyParts.push(u32LE(utxo.vout));
    legacyParts.push(new Uint8Array([0x00]));
    legacyParts.push(u32LE(0xffffffff));
  }
  legacyParts.push(varint(outputs.length));
  for (const o of outputs) {
    legacyParts.push(u64LE(o.valueSat));
    legacyParts.push(varint(o.script.length));
    legacyParts.push(o.script);
  }
  legacyParts.push(u32LE(0));
  const legacyBytes = concat(...legacyParts);
  const localTxid   = bytesToHex(sha256(sha256(legacyBytes)).reverse());

  const broadcastTxid = await broadcastBtcTx(txHex);
  return { txid: broadcastTxid || localTxid, txHex, feeSat, chain: "btc" };
}

// ── Legacy P2PKH (LTC / DOGE) ─────────────────────────────────────────────────

interface LegacyChainConfig {
  fetchUtxos:  (addr: string) => Promise<UTXO[]>;
  broadcast:   (hex: string)  => Promise<string>;
  feePerByte:  number;
  chainName:   string;
}

const LEGACY_CHAINS: Record<string, LegacyChainConfig> = {
  ltc: {
    fetchUtxos: fetchLtcUtxos,
    broadcast:  broadcastLtcTx,
    feePerByte: 10,
    chainName:  "LTC",
  },
  doge: {
    fetchUtxos: fetchDogeUtxos,
    broadcast:  broadcastDogeTx,
    feePerByte: 1000,
    chainName:  "DOGE",
  },
};

/**
 * Build, sign, and broadcast a legacy P2PKH transaction for LTC or DOGE.
 * Sender address must be a Base58Check P2PKH address for the chosen chain.
 */
export async function buildSignBroadcastLegacyUtxoTx(
  chain:            "ltc" | "doge",
  senderAddress:    string,
  recipientAddress: string,
  amountSat:        number,
  privateKey:       Uint8Array,
): Promise<UtxoSendResult> {
  const { secp256k1 } = await import("@noble/curves/secp256k1.js");
  const { sha256 }    = await import("@noble/hashes/sha2.js");

  const cfg        = LEGACY_CHAINS[chain];
  const pubkey     = secp256k1.getPublicKey(privateKey, true);
  const senderH20  = await decodeP2PKH(senderAddress);
  const recipH20   = await decodeP2PKH(recipientAddress);

  const utxos = await cfg.fetchUtxos(senderAddress);
  if (!utxos.length)
    throw new Error(`No UTXOs found. Your ${cfg.chainName} wallet has no spendable coins.`);

  // Legacy P2PKH input: ~148 bytes
  const { selected, feeSat, changeSat } = selectCoins(utxos, amountSat, cfg.feePerByte, 148);

  const outputs: Array<{ valueSat: bigint; script: Uint8Array }> = [
    { valueSat: BigInt(amountSat), script: p2pkhScript(recipH20) },
  ];
  if (changeSat >= DUST)
    outputs.push({ valueSat: BigInt(changeSat), script: p2pkhScript(senderH20) });

  const SIGHASH_ALL = 0x01;
  const senderScript = p2pkhScript(senderH20);

  // ── Legacy sighash per input ───────────────────────────────────────────────
  const scriptSigs: Uint8Array[] = [];
  for (let i = 0; i < selected.length; i++) {
    // Serialise tx with input i having scriptSig = senderScript, rest = empty
    const parts: Uint8Array[] = [u32LE(1), varint(selected.length)];
    for (let j = 0; j < selected.length; j++) {
      parts.push(hexToBytes(selected[j].txid).reverse());
      parts.push(u32LE(selected[j].vout));
      if (j === i) {
        parts.push(varint(senderScript.length));
        parts.push(senderScript);
      } else {
        parts.push(new Uint8Array([0x00]));
      }
      parts.push(u32LE(0xffffffff));
    }
    parts.push(varint(outputs.length));
    for (const o of outputs) {
      parts.push(u64LE(o.valueSat));
      parts.push(varint(o.script.length));
      parts.push(o.script);
    }
    parts.push(u32LE(0));
    parts.push(u32LE(SIGHASH_ALL)); // 4-byte LE sighash type at end

    const preimage = concat(...parts);
    const sighash  = sha256(sha256(preimage));

    const raw    = secp256k1.sign(sighash, privateKey, { lowS: true, prehash: false });
    const der    = derEncode(raw.slice(0, 32), raw.slice(32, 64));
    const derSig = concat(der, new Uint8Array([SIGHASH_ALL]));

    const scriptSig = concat(
      varint(derSig.length), derSig,
      varint(pubkey.length), pubkey,
    );
    scriptSigs.push(scriptSig);
  }

  // ── Serialise final transaction ────────────────────────────────────────────
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

  const txBytes = concat(...parts);
  const txHex   = bytesToHex(txBytes);
  const localTxid = bytesToHex(sha256(sha256(txBytes)).reverse());

  const broadcastTxid = await cfg.broadcast(txHex);
  return { txid: broadcastTxid || localTxid, txHex, feeSat, chain };
}
