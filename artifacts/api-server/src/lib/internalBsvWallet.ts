/**
 * internalBsvWallet.ts
 *
 * Generates and persists a custodial BTC/BSV/BCH wallet for each EVM user.
 *
 * One secp256k1 keypair derives a single legacy P2PKH address (starts with "1")
 * shared across all three Bitcoin forks: BTC, BSV, and BCH.
 *
 * The private key is AES-256-GCM encrypted at rest; it is NEVER returned to
 * the client — only the public addresses are exposed.
 */

import * as secp from "@noble/secp256k1";
import {
  randomBytes,
  createHash,
} from "node:crypto";
import { pool } from "@workspace/db";
import {
  decryptBsvWalletKey,
  encryptBsvWalletKey,
  prepareBsvWalletReencryption,
  verifyBsvWalletRecords,
  type BsvWalletCipherRecord,
} from "./bsvWalletCrypto.mjs";

// ── Encryption helpers ────────────────────────────────────────────────────────

function configuredWalletSecrets(): string[] {
  return [
    process.env.BSV_WALLET_SECRET_NEXT?.trim(),
    process.env.BSV_WALLET_SECRET?.trim(),
  ].filter((secret): secret is string => Boolean(secret));
}

function encrypt(plaintext: string): string {
  const [activeSecret] = configuredWalletSecrets();
  if (!activeSecret) {
    throw new Error("BSV_WALLET_SECRET is not configured; refusing to encrypt internal BSV wallet keys.");
  }
  return encryptBsvWalletKey(plaintext, activeSecret);
}

export function decrypt(stored: string): string {
  let lastError: unknown;
  for (const secret of configuredWalletSecrets()) {
    try {
      return decryptBsvWalletKey(stored, secret);
    } catch (error) {
      lastError = error;
    }
  }
  if (!configuredWalletSecrets().length) {
    throw new Error("BSV_WALLET_SECRET is not configured; refusing to decrypt internal BSV wallet keys.");
  }
  throw new Error("Could not decrypt internal BSV wallet key with configured secrets.", { cause: lastError });
}

const MAX_BSV_WALLETS_PER_ROTATION = 500;

async function getEncryptedBsvWalletRows(client: Pick<typeof pool, "query"> = pool): Promise<BsvWalletCipherRecord[]> {
  const { rows } = await client.query<BsvWalletCipherRecord>(
    `SELECT evm_address, bsv_address, encrypted_key
     FROM internal_bsv_wallets
     WHERE encrypted_key <> 'phantom-native'
     ORDER BY created_at ASC
     LIMIT $1`,
    [MAX_BSV_WALLETS_PER_ROTATION + 1],
  );
  if (rows.length > MAX_BSV_WALLETS_PER_ROTATION) {
    throw new Error("BSV wallet count exceeds the safe per-run migration limit.");
  }
  return rows;
}

function getCurrentAndNextWalletSecrets(): { current: string; next: string } {
  const current = process.env.BSV_WALLET_SECRET?.trim() ?? "";
  const next = process.env.BSV_WALLET_SECRET_NEXT?.trim() ?? "";
  if (!current || !next) {
    throw new Error("Both the current and staged BSV wallet secrets must be configured.");
  }
  if (current === next) {
    throw new Error("The staged BSV wallet secret must differ from the current secret.");
  }
  return { current, next };
}

/** Read-only preflight: verify every eligible row and its stored address. */
export async function preflightStoredBsvWalletReencryption(): Promise<{
  status: "ready" | "empty" | "failed";
  checked: number;
  verified: number;
  failed: number;
}> {
  const { current, next } = getCurrentAndNextWalletSecrets();
  const rows = await getEncryptedBsvWalletRows();
  const sourceVerification = verifyBsvWalletRecords(rows, [current, next]);
  if (sourceVerification.failed > 0) {
    return {
      status: "failed",
      checked: sourceVerification.checked,
      verified: sourceVerification.verified,
      failed: sourceVerification.failed,
    };
  }
  try {
    const prepared = prepareBsvWalletReencryption(rows, current, next);
    const verification = verifyBsvWalletRecords(
      rows.map((row, index) => ({ ...row, encrypted_key: prepared[index].encrypted_key })),
      [next],
    );
    return {
      status: rows.length === 0 ? "empty" : verification.failed === 0 ? "ready" : "failed",
      checked: verification.checked,
      verified: verification.verified,
      failed: verification.failed,
    };
  } catch {
    return {
      status: rows.length === 0 ? "empty" : "failed",
      checked: rows.length,
      verified: Math.max(0, rows.length - 1),
      failed: rows.length === 0 ? 0 : 1,
    };
  }
}

/**
 * Atomically re-encrypt all eligible records with the staged key.
 * Addresses and plaintext keys are verified server-side and never returned.
 */
export async function migrateStoredBsvWalletEncryption(): Promise<{
  status: "migrated" | "empty";
  checked: number;
  migrated: number;
}> {
  const { current, next } = getCurrentAndNextWalletSecrets();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE internal_bsv_wallets IN SHARE ROW EXCLUSIVE MODE");
    const rows = await getEncryptedBsvWalletRows(client);
    const prepared = prepareBsvWalletReencryption(rows, current, next);
    const verified = verifyBsvWalletRecords(
      rows.map((row, index) => ({ ...row, encrypted_key: prepared[index].encrypted_key })),
      [next],
    );
    if (verified.failed > 0 || verified.verified !== rows.length) {
      throw new Error("Staged BSV wallet ciphertext verification failed.");
    }

    for (const update of prepared) {
      const result = await client.query(
        `UPDATE internal_bsv_wallets
         SET encrypted_key = $1
         WHERE evm_address = $2 AND encrypted_key = $3`,
        [update.encrypted_key, update.evm_address, update.expected_ciphertext],
      );
      if (result.rowCount !== 1) {
        throw new Error("A BSV wallet row changed during migration.");
      }
    }

    await client.query("COMMIT");
    return {
      status: rows.length === 0 ? "empty" : "migrated",
      checked: rows.length,
      migrated: prepared.length,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// ── Hash utilities ────────────────────────────────────────────────────────────

function hash256(buf: Buffer): Buffer {
  return createHash("sha256").update(
    createHash("sha256").update(buf).digest()
  ).digest();
}

function hash160(buf: Buffer): Buffer {
  const sha = createHash("sha256").update(buf).digest();
  return createHash("ripemd160").update(sha).digest();
}

// ── Base58Check (BSV / BTC legacy P2PKH) ─────────────────────────────────────

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Buffer): string {
  let num    = BigInt("0x" + bytes.toString("hex"));
  let result = "";
  while (num > 0n) {
    const rem = num % 58n;
    num = num / 58n;
    result = BASE58_ALPHABET[Number(rem)] + result;
  }
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result = "1" + result;
  }
  return result;
}

/**
 * P2PKH address — BSV and BTC both use version byte 0x00 and Base58Check.
 * The resulting address string is IDENTICAL for both chains.
 */
function pubKeyToLegacyAddress(compressedPubKey: Uint8Array): string {
  const pkh      = hash160(Buffer.from(compressedPubKey));
  const versioned = Buffer.concat([Buffer.from([0x00]), pkh]);
  const checksum  = hash256(versioned).slice(0, 4);
  return base58Encode(Buffer.concat([versioned, checksum]));
}

// ── CashAddr (BCH) ───────────────────────────────────────────────────────────

const CASHADDR_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BCH_PREFIX        = "bitcoincash";

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] {
  const result: number[] = [];
  let acc = 0, bits = 0;
  const maxv = (1 << toBits) - 1;
  for (const b of data) {
    acc = ((acc << fromBits) | b) >>> 0;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >>> bits) & maxv);
    }
  }
  if (pad && bits > 0) result.push((acc << (toBits - bits)) & maxv);
  return result;
}

function cashAddrChecksum(payload: number[]): bigint {
  const GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
  let c = 1n;
  for (const d of payload) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    for (let i = 0; i < 5; i++) {
      if ((c0 >> BigInt(i)) & 1n) c ^= GEN[i];
    }
  }
  return c ^ 1n;
}

function expandPrefix(prefix: string): number[] {
  const out: number[] = [];
  for (const ch of prefix) out.push(ch.charCodeAt(0) & 0x1f);
  out.push(0); // separator
  return out;
}

/**
 * Convert a pubkey hash to BCH CashAddr format.
 * Version byte 0x00 = P2PKH, 160-bit hash.
 */
function pubKeyHashToCashAddr(pkh: Buffer): string {
  // 0x00 = type P2PKH (bits 7-3 = 0) + hash-size 160-bit (bits 2-0 = 0)
  const payload5 = convertBits([0x00, ...Array.from(pkh)], 8, 5, true);
  const checksumData = [...expandPrefix(BCH_PREFIX), ...payload5, 0, 0, 0, 0, 0, 0, 0, 0];
  const checksum = cashAddrChecksum(checksumData);
  const checksumArr: number[] = [];
  for (let i = 7; i >= 0; i--) {
    checksumArr.push(Number((checksum >> BigInt(i * 5)) & 0x1fn));
  }
  return BCH_PREFIX + ":" + [...payload5, ...checksumArr].map(d => CASHADDR_CHARSET[d]).join("");
}

// ── Keypair generation ────────────────────────────────────────────────────────

function generateKeypair(): {
  privateKeyHex: string;
  legacyAddress: string;
  bchAddress: string;
} {
  const privBytes     = randomBytes(32);
  const compressedPub = secp.getPublicKey(privBytes, true); // 33 bytes
  const legacy        = pubKeyToLegacyAddress(compressedPub);

  return {
    privateKeyHex: Buffer.from(privBytes).toString("hex"),
    legacyAddress: legacy,
    bchAddress:    legacy,
  };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS internal_bsv_wallets (
      evm_address   TEXT PRIMARY KEY,
      bsv_address   TEXT NOT NULL,
      bch_address   TEXT NOT NULL DEFAULT '',
      encrypted_key TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Add bch_address column to existing tables that were created before this column existed
  await pool.query(`
    ALTER TABLE internal_bsv_wallets
      ADD COLUMN IF NOT EXISTS bch_address TEXT NOT NULL DEFAULT ''
  `);
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface BsvWalletResult {
  bsvAddress: string;
  btcAddress: string;
  bchAddress: string;
  isNew: boolean;
}

/**
 * Returns existing or freshly-generated addresses for an EVM wallet.
 *
 * If `phantomBtcAddress` is provided (from Phantom's Bitcoin provider),
 * that address is used for all three forks instead of generating a random
 * custodial key. This ensures the BTC address shown in OrahDEX matches
 * what the user sees in their Phantom wallet.
 */
export async function getOrCreateBsvWallet(
  evmAddress: string,
  phantomBtcAddress?: string,
): Promise<BsvWalletResult> {
  await ensureTable();

  const evmLower = evmAddress.toLowerCase();

  const BTC_ADDR_RE = /^(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,90}|tb1[a-zA-HJ-NP-Z0-9]{25,90})$/;

  if (phantomBtcAddress && BTC_ADDR_RE.test(phantomBtcAddress)) {
    await pool.query(
      `INSERT INTO internal_bsv_wallets (evm_address, bsv_address, bch_address, encrypted_key)
       VALUES ($1, $2, $2, 'phantom-native')
       ON CONFLICT (evm_address)
       DO UPDATE SET bsv_address = $2, bch_address = $2`,
      [evmLower, phantomBtcAddress],
    );
    return {
      bsvAddress: phantomBtcAddress,
      btcAddress: phantomBtcAddress,
      bchAddress: phantomBtcAddress,
      isNew: false,
    };
  }

  const { rows } = await pool.query<{ bsv_address: string; bch_address: string; encrypted_key: string }>(
    "SELECT bsv_address, bch_address, encrypted_key FROM internal_bsv_wallets WHERE evm_address = $1",
    [evmLower],
  );

  if (rows.length > 0) {
    const bsvAddress = rows[0].bsv_address;
    return { bsvAddress, btcAddress: bsvAddress, bchAddress: bsvAddress, isNew: false };
  }

  const { privateKeyHex, legacyAddress, bchAddress } = generateKeypair();
  const enc = encrypt(privateKeyHex);

  await pool.query(
    `INSERT INTO internal_bsv_wallets (evm_address, bsv_address, bch_address, encrypted_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (evm_address) DO NOTHING`,
    [evmLower, legacyAddress, bchAddress, enc],
  );

  return { bsvAddress: legacyAddress, btcAddress: legacyAddress, bchAddress, isNew: true };
}

/** Retrieves addresses (returns null if not yet provisioned). */
export async function getBsvWallet(evmAddress: string): Promise<BsvWalletResult | null> {
  await ensureTable();
  const { rows } = await pool.query<{ bsv_address: string; bch_address: string }>(
    "SELECT bsv_address, bch_address FROM internal_bsv_wallets WHERE evm_address = $1",
    [evmAddress.toLowerCase()],
  );
  if (!rows[0]) return null;
  const bsvAddress = rows[0].bsv_address;
  return { bsvAddress, btcAddress: bsvAddress, bchAddress: bsvAddress, isNew: false };
}
