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
