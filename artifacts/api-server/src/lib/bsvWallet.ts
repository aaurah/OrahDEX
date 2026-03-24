/**
 * BSV Settlement Wallet — OrahDEX
 *
 * Manages the platform's on-chain BSV settlement address.
 * Private key is stored in platformSettingsTable (key: "bsv_settlement_wif").
 * On first boot a fresh key-pair is generated automatically.
 *
 * Address type: P2PKH (pay-to-public-key-hash), mainnet (version byte 0x00).
 *
 * Crypto stack (all pure-JS, no native addons):
 *   @noble/secp256k1  — secp256k1 ECDSA / public-key derivation
 *   node:crypto       — SHA-256, RIPEMD-160, random bytes
 */

import * as secp from "@noble/secp256k1";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

/* ── Base-58 alphabet (Bitcoin / BSV) ──────────────────────────────────── */
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(str: string): Buffer {
  let n = 0n;
  for (const c of str) {
    const idx = B58.indexOf(c);
    if (idx < 0) throw new Error(`Invalid base58 char: ${c}`);
    n = n * 58n + BigInt(idx);
  }
  let leadingZeros = 0;
  for (const c of str) { if (c === "1") leadingZeros++; else break; }
  const hex = n.toString(16);
  const buf = Buffer.from(hex.length % 2 ? "0" + hex : hex, "hex");
  return Buffer.concat([Buffer.alloc(leadingZeros), buf]);
}

function base58Encode(buf: Buffer): string {
  let n = BigInt("0x" + buf.toString("hex") || "00");
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (let i = 0; i < buf.length && buf[i] === 0; i++) s = "1" + s;
  return s;
}

function base58Check(payload: Buffer, version: number): string {
  const versioned = Buffer.concat([Buffer.from([version]), payload]);
  const c1 = crypto.createHash("sha256").update(versioned).digest();
  const c2 = crypto.createHash("sha256").update(c1).digest();
  return base58Encode(Buffer.concat([versioned, c2.slice(0, 4)]));
}

export function hash160(data: Buffer | Uint8Array): Buffer {
  const sha = crypto.createHash("sha256").update(data).digest();
  return crypto.createHash("ripemd160").update(sha).digest();
}

/* ── Key derivation ─────────────────────────────────────────────────────── */

/** Derive a WIF (Wallet Import Format) string from a raw 32-byte private key */
export function privKeyToWif(privKey: Buffer): string {
  return base58Check(Buffer.concat([privKey, Buffer.from([0x01])]), 0x80); // mainnet + compressed
}

/** Recover raw 32-byte private key from WIF */
export function wifToPrivKey(wif: string): Buffer {
  // base58 decode
  let n = 0n;
  for (const c of wif) { n = n * 58n + BigInt(B58.indexOf(c)); }
  const hex = n.toString(16).padStart(74, "0"); // 1 version + 32 key + 1 compressed + 4 checksum = 38 bytes = 76 hex
  const buf = Buffer.from(hex, "hex");
  // strip version byte, compressed flag, checksum
  return buf.slice(1, 33);
}

/** Derive P2PKH address from 32-byte private key */
export function privKeyToAddress(privKey: Buffer): string {
  const pubKey = secp.getPublicKey(privKey, true); // compressed 33 bytes
  const h160   = hash160(Buffer.from(pubKey));
  return base58Check(h160, 0x00); // mainnet P2PKH
}

/** Get compressed public key bytes from private key */
export function privKeyToPubKey(privKey: Buffer): Buffer {
  return Buffer.from(secp.getPublicKey(privKey, true));
}

/** Derive P2PKH address from a compressed public key (33-byte hex or Buffer) */
export function pubKeyToAddress(pubKeyHexOrBuf: string | Buffer | Uint8Array): string {
  const buf = typeof pubKeyHexOrBuf === "string"
    ? Buffer.from(pubKeyHexOrBuf.replace(/^0x/, ""), "hex")
    : Buffer.from(pubKeyHexOrBuf);
  const h160 = hash160(buf);
  return base58Check(h160, 0x00);
}

/** Check whether a string looks like a BSV P2PKH address (starts with 1, 26-35 chars) */
export function isBsvAddress(addr: string): boolean {
  return /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr);
}

/** Check whether a string looks like a paymail address (user@domain.tld) */
export function isPaymail(addr: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr);
}

/* ── Persistent key storage ─────────────────────────────────────────────── */

async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function setSetting(key: string, value: string) {
  await db.insert(platformSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
}

export interface WalletInfo {
  address: string;
  wif: string;
  pubKeyHex: string;
  privKeyHex: string;
}

/** Load or generate the platform settlement wallet */
export async function getOrCreateWallet(): Promise<WalletInfo> {
  // 1. Try env secret first
  const envWif = process.env["BSV_SETTLEMENT_KEY"];
  if (envWif && envWif.length > 50) {
    const privKey = wifToPrivKey(envWif);
    return {
      address:    privKeyToAddress(privKey),
      wif:        envWif,
      pubKeyHex:  privKeyToPubKey(privKey).toString("hex"),
      privKeyHex: privKey.toString("hex"),
    };
  }

  // 2. Try DB
  const storedWif = await getSetting("bsv_settlement_wif");
  if (storedWif && storedWif.length > 50) {
    const privKey = wifToPrivKey(storedWif);
    return {
      address:    privKeyToAddress(privKey),
      wif:        storedWif,
      pubKeyHex:  privKeyToPubKey(privKey).toString("hex"),
      privKeyHex: privKey.toString("hex"),
    };
  }

  // 3. Generate fresh key and persist it
  const privKey = crypto.randomBytes(32);
  const wif     = privKeyToWif(privKey);
  const address = privKeyToAddress(privKey);
  await setSetting("bsv_settlement_wif",     wif);
  await setSetting("bsv_settlement_address", address);

  logger.info({ address }, "BSV settlement wallet generated — fund this address to enable on-chain broadcasting");
  return {
    address,
    wif,
    pubKeyHex:  privKeyToPubKey(privKey).toString("hex"),
    privKeyHex: privKey.toString("hex"),
  };
}

/* ── UTXO & balance from WhatsOnChain ───────────────────────────────────── */

export interface Utxo {
  txid: string;
  vout: number;
  satoshis: number;
  height: number;
}

export interface WalletBalance {
  address: string;
  confirmedSatoshis: number;
  unconfirmedSatoshis: number;
  totalSatoshis: number;
  bsv: number;
  utxos: Utxo[];
  funded: boolean;
}

/* ── Address decoding ───────────────────────────────────────────────────── */

/** Extract the 20-byte hash160 from a BSV P2PKH address */
function decodeAddressToHash160(address: string): Buffer {
  const decoded = base58Decode(address); // [version(1) | hash160(20) | checksum(4)] = 25 bytes
  if (decoded.length !== 25) throw new Error(`Invalid BSV address (decoded length ${decoded.length})`);
  return decoded.slice(1, 21);
}

/* ── Raw-transaction helpers ────────────────────────────────────────────── */

function dsha256(data: Buffer): Buffer {
  const h1 = crypto.createHash("sha256").update(data).digest();
  return crypto.createHash("sha256").update(h1).digest();
}

function u32LE(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function u64LE(satoshis: number): Buffer {
  const b = Buffer.alloc(8);
  const lo = satoshis >>> 0;
  const hi = Math.floor(satoshis / 0x100000000);
  b.writeUInt32LE(lo, 0);
  b.writeUInt32LE(hi, 4);
  return b;
}

function varint(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) { const b = Buffer.alloc(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = 0xfe; b.writeUInt32LE(n, 1); return b;
}

function p2pkhScript(address: string): Buffer {
  const h160 = decodeAddressToHash160(address);
  return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), h160, Buffer.from([0x88, 0xac])]);
}

/** BSV BIP143 sighash (SIGHASH_ALL | SIGHASH_FORKID = 0x41) */
function bsvSighash(
  inputIdx: number,
  utxoSatoshis: number,
  scriptCode: Buffer,
  inputs: Array<{ txid: string; vout: number }>,
  outputsRaw: Buffer[],
): Buffer {
  const SIGHASH = 0x41;
  const SEQ = 0xffffffff;

  const prevouts    = Buffer.concat(inputs.map(i => Buffer.concat([Buffer.from(i.txid, "hex").reverse(), u32LE(i.vout)])));
  const hashPrevouts = dsha256(prevouts);
  const sequences   = Buffer.concat(inputs.map(() => u32LE(SEQ)));
  const hashSeq     = dsha256(sequences);
  const hashOutputs = dsha256(Buffer.concat(outputsRaw));

  const inp     = inputs[inputIdx];
  const outpoint = Buffer.concat([Buffer.from(inp.txid, "hex").reverse(), u32LE(inp.vout)]);

  const preimage = Buffer.concat([
    u32LE(1),           // version
    hashPrevouts,
    hashSeq,
    outpoint,
    varint(scriptCode.length), scriptCode,
    u64LE(utxoSatoshis),
    u32LE(SEQ),         // nSequence of this input
    hashOutputs,
    u32LE(0),           // locktime
    u32LE(SIGHASH),     // sighash type (4 bytes)
  ]);
  return dsha256(preimage);
}

/** DER-encode r||s (each 32 bytes, big-endian) from secp compact signature */
function derEncode(compact64: Uint8Array): Buffer {
  const pad = (b: Buffer) => (b[0] & 0x80) ? Buffer.concat([Buffer.from([0x00]), b]) : b;
  const r = pad(Buffer.from(compact64.slice(0, 32)));
  const s = pad(Buffer.from(compact64.slice(32, 64)));
  const inner = Buffer.concat([Buffer.from([0x02, r.length]), r, Buffer.from([0x02, s.length]), s]);
  return Buffer.concat([Buffer.from([0x30, inner.length]), inner]);
}

export interface BroadcastResult { txid: string; hex: string }

/**
 * Build a BSV P2PKH transaction from UTXOs, sign, and broadcast via WhatsOnChain.
 * @param toAddress  Destination BSV address
 * @param satoshis   Amount to send in satoshis
 * @param wallet     Settlement wallet (private key)
 * @param utxos      Spendable UTXOs
 * @param feeSats    Miner fee in satoshis (default 500)
 */
export async function buildAndBroadcastBsvTx(
  toAddress: string,
  satoshis: number,
  wallet: WalletInfo,
  utxos: Utxo[],
  feeSats = 500,
): Promise<BroadcastResult> {
  // Select UTXOs
  let totalIn = 0;
  const selected: Utxo[] = [];
  for (const u of utxos) {
    selected.push(u);
    totalIn += u.satoshis;
    if (totalIn >= satoshis + feeSats) break;
  }
  if (totalIn < satoshis + feeSats) {
    throw new Error(`Insufficient BSV: wallet has ${totalIn} sat, need ${satoshis + feeSats} sat (incl. fee)`);
  }

  const change      = totalIn - satoshis - feeSats;
  const privKey     = Buffer.from(wallet.privKeyHex, "hex");
  const pubKeyBuf   = Buffer.from(wallet.pubKeyHex,  "hex"); // 33-byte compressed

  // Build outputs: [recipient, change if > dust]
  const toScript     = p2pkhScript(toAddress);
  const changeScript = p2pkhScript(wallet.address);
  const outputsRaw: Buffer[] = [
    Buffer.concat([u64LE(satoshis), varint(toScript.length),     toScript]),
    ...(change > 546 ? [Buffer.concat([u64LE(change), varint(changeScript.length), changeScript])] : []),
  ];

  const inputs = selected.map(u => ({ txid: u.txid, vout: u.vout }));
  const fromScript = p2pkhScript(wallet.address);

  // Sign each input
  const scriptSigs: Buffer[] = [];
  for (let i = 0; i < selected.length; i++) {
    const msgHash = bsvSighash(i, selected[i].satoshis, fromScript, inputs, outputsRaw);
    const sig     = await secp.signAsync(msgHash, privKey, { lowS: true, prehash: false }); // returns compact Uint8Array [r|s]
    const der     = derEncode(sig); // compact [r|s] → DER
    const derWithType = Buffer.concat([der, Buffer.from([0x41])]); // SIGHASH_ALL|FORKID
    const scriptSig = Buffer.concat([
      varint(derWithType.length), derWithType,
      varint(pubKeyBuf.length),   pubKeyBuf,
    ]);
    scriptSigs.push(scriptSig);
  }

  // Serialize full transaction
  const serialInputs = selected.map((u, i) => Buffer.concat([
    Buffer.from(u.txid, "hex").reverse(),
    u32LE(u.vout),
    varint(scriptSigs[i].length), scriptSigs[i],
    u32LE(0xffffffff),
  ]));

  const txHex = Buffer.concat([
    u32LE(1),
    varint(serialInputs.length), ...serialInputs,
    varint(outputsRaw.length),   ...outputsRaw,
    u32LE(0),
  ]).toString("hex");

  // Broadcast
  const broadRes = await fetch("https://api.whatsonchain.com/v1/bsv/main/tx/raw", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ txhex: txHex }),
    signal:  AbortSignal.timeout(20_000),
  });
  const text = await broadRes.text();
  if (!broadRes.ok) throw new Error(`Broadcast failed (${broadRes.status}): ${text}`);

  const txid = text.replace(/"/g, "").trim();
  logger.info({ txid, satoshis, toAddress }, "BSV transaction broadcast");
  return { txid, hex: txHex };
}

export async function fetchWalletBalance(address: string): Promise<WalletBalance> {
  const BASE = "https://api.whatsonchain.com/v1/bsv/main";

  const empty: WalletBalance = {
    address, confirmedSatoshis: 0, unconfirmedSatoshis: 0,
    totalSatoshis: 0, bsv: 0, utxos: [], funded: false,
  };

  try {
    const balRes = await fetch(`${BASE}/address/${address}/balance`, { signal: AbortSignal.timeout(8000) });
    if (!balRes.ok) return empty;
    const bal = await balRes.json() as { confirmed: number; unconfirmed: number };

    const utxoRes = await fetch(`${BASE}/address/${address}/unspent`, { signal: AbortSignal.timeout(8000) });
    const utxos: Utxo[] = [];
    if (utxoRes.ok) {
      const raw = await utxoRes.json() as Array<{ tx_hash: string; tx_pos: number; value: number; height: number }>;
      for (const u of raw) {
        utxos.push({ txid: u.tx_hash, vout: u.tx_pos, satoshis: u.value, height: u.height });
      }
    }

    const totalSatoshis = (bal.confirmed ?? 0) + (bal.unconfirmed ?? 0);
    return {
      address,
      confirmedSatoshis:   bal.confirmed   ?? 0,
      unconfirmedSatoshis: bal.unconfirmed  ?? 0,
      totalSatoshis,
      bsv: totalSatoshis / 1e8,
      utxos,
      funded: totalSatoshis > 1000, // at least 1000 satoshis to cover fees
    };
  } catch (err) {
    logger.warn({ err }, "BSV wallet: balance fetch failed");
    return empty;
  }
}
