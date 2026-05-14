/**
 * exchangeHotWallet.ts — OrahDEX
 *
 * Manages the platform's EVM hot wallet used for paying out user withdrawals.
 *
 * Key hierarchy (same pattern as BSV settlement wallet):
 *   1. EXCHANGE_HOT_WALLET_KEY env var  — operator-supplied 0x-hex private key
 *   2. DB: platform_settings.key = "exchange_hot_wallet_key"  — auto-generated + AES-256-GCM encrypted
 *   3. If neither exists → generates a fresh keypair, encrypts, and persists
 *
 * The raw private key is NEVER returned to clients.
 * Only the address is exposed via admin endpoints.
 */

import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "node:crypto";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { getRequiredEnv } from "./requiredEnv.js";

// ── Encryption (AES-256-GCM) ───────────────────────────────────────────────────

function deriveKey(): Buffer {
  return scryptSync(
    getRequiredEnv("EVM_WALLET_SECRET", "[FATAL] EVM_WALLET_SECRET is not set. Refusing to derive hot-wallet encryption keys."),
    "orahdex-hot-wallet-salt-v1",
    32,
  ) as Buffer;
}

function encrypt(plain: string): string {
  const key  = deriveKey();
  const iv   = randomBytes(16);
  const c    = createCipheriv("aes-256-gcm", key, iv);
  const enc  = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag  = c.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

function decrypt(stored: string): string {
  const [ivHex, tagHex, encHex] = stored.split(":");
  const key = deriveKey();
  const d   = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"), { authTagLength: 16 });
  d.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([d.update(Buffer.from(encHex, "hex")), d.final()]).toString("utf8");
}

// ── EVM keypair ────────────────────────────────────────────────────────────────

function checksumAddress(hex: string): string {
  const addr    = hex.toLowerCase();
  const hashHex = Buffer.from(keccak_256(Buffer.from(addr, "utf8"))).toString("hex");
  return "0x" + [...addr].map((c, i) => parseInt(hashHex[i], 16) >= 8 ? c.toUpperCase() : c).join("");
}

function generateEvmKeypair(): { privKeyHex: `0x${string}`; address: string } {
  const priv  = randomBytes(32);
  const pub   = secp.getPublicKey(priv, false);      // 65-byte uncompressed
  const hash  = keccak_256(pub.slice(1));             // skip 0x04 prefix
  const addr  = checksumAddress(Buffer.from(hash.slice(-20)).toString("hex"));
  return { privKeyHex: `0x${Buffer.from(priv).toString("hex")}`, address: addr };
}

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await db.insert(platformSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface HotWalletInfo {
  address:    string;
  privKeyHex: `0x${string}`;
  source:     "env" | "db" | "generated";
}

/**
 * Returns (or creates) the exchange EVM hot wallet.
 * Returns the private key hex IN MEMORY only — never persisted in plaintext.
 */
export async function getOrCreateEvmHotWallet(): Promise<HotWalletInfo> {
  // Helper: a string is "private-key shaped" if it's exactly 64 hex chars
  // (with optional 0x prefix → 66 total).
  const isPrivKeyShape = (s?: string): boolean => {
    if (!s) return false;
    const stripped = s.startsWith("0x") ? s.slice(2) : s;
    return stripped.length === 64 && /^[0-9a-fA-F]+$/.test(stripped);
  };
  const toAccount = (s: string): HotWalletInfo => {
    const raw  = (s.startsWith("0x") ? s : `0x${s}`) as `0x${string}`;
    const pub  = secp.getPublicKey(Buffer.from(raw.slice(2), "hex"), false);
    const hash = keccak_256(pub.slice(1));
    const addr = checksumAddress(Buffer.from(hash.slice(-20)).toString("hex"));
    return { privKeyHex: raw, address: addr, source: "env" };
  };

  // 1a. Standard env var
  const envKey = process.env.EXCHANGE_HOT_WALLET_KEY;
  if (isPrivKeyShape(envKey)) return toAccount(envKey!);

  // 1b. Allow operators to reuse EVM_WALLET_SECRET as the hot wallet key ONLY
  // when EXCHANGE_HOT_WALLET_KEY_ALLOW_EVM_SECRET=1 is explicitly set.
  // This opt-in prevents silent key sharing between the escrow relayer and the
  // hot withdrawal wallet (key compromise would affect both roles otherwise).
  const allowSharedKey = process.env.EXCHANGE_HOT_WALLET_KEY_ALLOW_EVM_SECRET === "1";
  const evmSecret = process.env.EVM_WALLET_SECRET;
  if (allowSharedKey && isPrivKeyShape(evmSecret) && !isPrivKeyShape(envKey)) {
    logger.warn(
      "Using EVM_WALLET_SECRET as the exchange hot wallet key because " +
      "EXCHANGE_HOT_WALLET_KEY_ALLOW_EVM_SECRET=1 is set. " +
      "This shares one key between the escrow relayer and hot wallet. " +
      "Set EXCHANGE_HOT_WALLET_KEY to a separate key for production deployments."
    );
    return toAccount(evmSecret!);
  }
  if (!allowSharedKey && isPrivKeyShape(evmSecret) && !isPrivKeyShape(envKey)) {
    logger.warn(
      "EXCHANGE_HOT_WALLET_KEY is not set. EVM_WALLET_SECRET is a private key but " +
      "EXCHANGE_HOT_WALLET_KEY_ALLOW_EVM_SECRET is not set, so it will not be used " +
      "as the hot wallet key. Set EXCHANGE_HOT_WALLET_KEY for EVM withdrawals, or " +
      "set EXCHANGE_HOT_WALLET_KEY_ALLOW_EVM_SECRET=1 to share the key (not recommended)."
    );
  }

  // 2. DB (encrypted)
  const stored = await getSetting("exchange_hot_wallet_key").catch(() => null);
  if (stored) {
    try {
      const raw  = decrypt(stored) as `0x${string}`;
      const pub  = secp.getPublicKey(Buffer.from(raw.slice(2), "hex"), false);
      const hash = keccak_256(pub.slice(1));
      const addr = checksumAddress(Buffer.from(hash.slice(-20)).toString("hex"));
      return { privKeyHex: raw, address: addr, source: "db" };
    } catch {
      // decryption failure — fall through to regenerate
    }
  }

  // 3. Generate fresh keypair and persist (encrypted)
  const { privKeyHex, address } = generateEvmKeypair();
  await setSetting("exchange_hot_wallet_key",     encrypt(privKeyHex));
  await setSetting("exchange_hot_wallet_address", address);
  logger.info({ address }, "Exchange EVM hot wallet generated — fund this address to enable auto-withdrawals");
  return { privKeyHex, address, source: "generated" };
}

/** Returns just the address (no key) — safe to expose to admin UI */
export async function getEvmHotWalletAddress(): Promise<string> {
  // Always go through the full loader so the swap-tolerant env logic applies.
  const { address } = await getOrCreateEvmHotWallet();
  return address;
}
