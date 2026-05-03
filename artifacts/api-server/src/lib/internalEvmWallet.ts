/**
 * internalEvmWallet.ts
 *
 * Generates and persists a custodial EVM wallet for each BSV user.
 * The private key is AES-256-GCM encrypted at rest; it is NEVER returned
 * to the client — only the public EVM address is exposed.
 *
 * Uses @noble/secp256k1 + @noble/hashes (already in the monorepo) so no
 * additional dependencies are needed.
 */

import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "node:crypto";
import { pool } from "@workspace/db";

// ── Encryption helpers ────────────────────────────────────────────────────────

const WALLET_SECRET =
  process.env.EVM_WALLET_SECRET ?? "orahdex-internal-evm-fallback-key-32bytes!";

function deriveKey(): Buffer {
  return scryptSync(WALLET_SECRET, "orahdex-evm-salt-v1", 32) as Buffer;
}

function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv  = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

export function decrypt(stored: string): string {
  const [ivHex, tagHex, encHex] = stored.split(":");
  const key     = deriveKey();
  const iv      = Buffer.from(ivHex, "hex");
  const tag     = Buffer.from(tagHex, "hex");
  const enc     = Buffer.from(encHex, "hex");
  const d = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// ── EVM address generation ────────────────────────────────────────────────────

function toChecksumAddress(hexAddr: string): string {
  const addr    = hexAddr.toLowerCase();
  const hash    = keccak_256(Buffer.from(addr, "utf8"));
  const hashHex = Buffer.from(hash).toString("hex");
  let out = "0x";
  for (let i = 0; i < addr.length; i++) {
    out += parseInt(hashHex[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
  }
  return out;
}

function generateEvmKeypair(): { privateKey: string; address: string } {
  const privBytes = randomBytes(32);
  const pubBytes  = secp.getPublicKey(privBytes, false); // 65-byte uncompressed
  const hash      = keccak_256(pubBytes.slice(1));        // skip 0x04 prefix
  const addrHex   = Buffer.from(hash.slice(-20)).toString("hex");
  return {
    privateKey: "0x" + Buffer.from(privBytes).toString("hex"),
    address:    toChecksumAddress(addrHex),
  };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS internal_evm_wallets (
      bsv_address   TEXT PRIMARY KEY,
      evm_address   TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns existing or freshly-generated EVM address for a BSV wallet. */
export async function getOrCreateEvmWallet(
  bsvAddress: string,
): Promise<{ evmAddress: string; isNew: boolean }> {
  await ensureTable();

  const { rows } = await pool.query<{ evm_address: string }>(
    "SELECT evm_address FROM internal_evm_wallets WHERE bsv_address = $1",
    [bsvAddress],
  );

  if (rows.length > 0) {
    return { evmAddress: rows[0].evm_address, isNew: false };
  }

  const { privateKey, address } = generateEvmKeypair();
  const enc = encrypt(privateKey);

  await pool.query(
    `INSERT INTO internal_evm_wallets (bsv_address, evm_address, encrypted_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (bsv_address) DO NOTHING`,
    [bsvAddress, address, enc],
  );

  return { evmAddress: address, isNew: true };
}

/** Retrieves just the EVM address (returns null if not yet provisioned). */
export async function getEvmWallet(
  bsvAddress: string,
): Promise<string | null> {
  await ensureTable();
  const { rows } = await pool.query<{ evm_address: string }>(
    "SELECT evm_address FROM internal_evm_wallets WHERE bsv_address = $1",
    [bsvAddress],
  );
  return rows[0]?.evm_address ?? null;
}

/**
 * Whether `evmAddress` is a server-provisioned (internal) EVM wallet.
 * Internal wallets are derived server-side and have no `personal_sign`
 * surface that the API can verify, so routes that normally require an EVM
 * signature for external wallets accept these without one. The check is
 * case-insensitive on the hex address.
 */
export async function isInternalEvmWallet(evmAddress: string): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(evmAddress)) return false;
  await ensureTable();
  const { rows } = await pool.query<{ exists: boolean }>(
    "SELECT 1 AS exists FROM internal_evm_wallets WHERE LOWER(evm_address) = LOWER($1) LIMIT 1",
    [evmAddress],
  );
  return rows.length > 0;
}
