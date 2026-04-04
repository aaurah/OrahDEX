/**
 * internalBsvWallet.ts
 *
 * Generates and persists a custodial BSV wallet for each EVM user.
 * The private key is AES-256-GCM encrypted at rest; it is NEVER returned
 * to the client — only the public BSV address (P2PKH) is exposed.
 *
 * Uses @noble/secp256k1 + Node.js crypto so no extra dependencies are needed.
 */

import * as secp from "@noble/secp256k1";
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "node:crypto";
import { pool } from "@workspace/db";

// ── Encryption helpers ────────────────────────────────────────────────────────

const WALLET_SECRET =
  process.env.BSV_WALLET_SECRET ?? "orahdex-internal-bsv-fallback-key-32bytes!";

function deriveKey(): Buffer {
  return scryptSync(WALLET_SECRET, "orahdex-bsv-salt-v1", 32) as Buffer;
}

function encrypt(plaintext: string): string {
  const key    = deriveKey();
  const iv     = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

export function decrypt(stored: string): string {
  const [ivHex, tagHex, encHex] = stored.split(":");
  const key = deriveKey();
  const iv  = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const d   = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// ── BSV P2PKH address generation ──────────────────────────────────────────────

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

function hash256(buf: Buffer): Buffer {
  return createHash("sha256").update(createHash("sha256").update(buf).digest()).digest();
}

function hash160(buf: Buffer): Buffer {
  const sha = createHash("sha256").update(buf).digest();
  return createHash("ripemd160").update(sha).digest();
}

function publicKeyToBsvAddress(compressedPubKey: Uint8Array): string {
  const pubKeyHash  = hash160(Buffer.from(compressedPubKey));       // 20 bytes
  const versioned   = Buffer.concat([Buffer.from([0x00]), pubKeyHash]); // 0x00 = mainnet P2PKH
  const checksum    = hash256(versioned).slice(0, 4);
  const payload     = Buffer.concat([versioned, checksum]);          // 25 bytes
  return base58Encode(payload);
}

function generateBsvKeypair(): { privateKeyHex: string; address: string } {
  const privBytes      = randomBytes(32);
  const compressedPub  = secp.getPublicKey(privBytes, true); // 33 bytes
  return {
    privateKeyHex: Buffer.from(privBytes).toString("hex"),
    address: publicKeyToBsvAddress(compressedPub),
  };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS internal_bsv_wallets (
      evm_address   TEXT PRIMARY KEY,
      bsv_address   TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns existing or freshly-generated BSV address for an EVM wallet. */
export async function getOrCreateBsvWallet(
  evmAddress: string,
): Promise<{ bsvAddress: string; isNew: boolean }> {
  await ensureTable();

  const evmLower = evmAddress.toLowerCase();

  const { rows } = await pool.query<{ bsv_address: string }>(
    "SELECT bsv_address FROM internal_bsv_wallets WHERE evm_address = $1",
    [evmLower],
  );

  if (rows.length > 0) {
    return { bsvAddress: rows[0].bsv_address, isNew: false };
  }

  const { privateKeyHex, address } = generateBsvKeypair();
  const enc = encrypt(privateKeyHex);

  await pool.query(
    `INSERT INTO internal_bsv_wallets (evm_address, bsv_address, encrypted_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (evm_address) DO NOTHING`,
    [evmLower, address, enc],
  );

  return { bsvAddress: address, isNew: true };
}

/** Retrieves just the BSV address (returns null if not yet provisioned). */
export async function getBsvWallet(
  evmAddress: string,
): Promise<string | null> {
  await ensureTable();
  const { rows } = await pool.query<{ bsv_address: string }>(
    "SELECT bsv_address FROM internal_bsv_wallets WHERE evm_address = $1",
    [evmAddress.toLowerCase()],
  );
  return rows[0]?.bsv_address ?? null;
}
