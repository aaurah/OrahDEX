/**
 * depositAddresses.ts
 *
 * Manages per-user OrahDEX deposit addresses for external EVM wallets.
 * Each user wallet gets a unique custodial EVM address they can send funds to.
 * OrahDEX controls the private key; the address is only used to receive deposits.
 *
 * Deposit flow:
 *   1. User calls GET /deposit/address → receives their dedicated deposit address
 *   2. User sends ETH/tokens to that address on-chain
 *   3. User calls POST /deposit/verify with txHash → server verifies and credits ledger
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

const WALLET_SECRET =
  process.env.EVM_WALLET_SECRET ?? "orahdex-internal-evm-fallback-key-32bytes!";

function deriveKey(): Buffer {
  return scryptSync(WALLET_SECRET, "orahdex-deposit-addr-salt-v1", 32) as Buffer;
}

function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv  = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

export function decryptDepositKey(stored: string): string {
  const [ivHex, tagHex, encHex] = stored.split(":");
  const key = deriveKey();
  const iv  = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const d   = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

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
  const pubBytes  = secp.getPublicKey(privBytes, false);
  const hash      = keccak_256(pubBytes.slice(1));
  const addrHex   = Buffer.from(hash.slice(-20)).toString("hex");
  return {
    privateKey: "0x" + Buffer.from(privBytes).toString("hex"),
    address:    toChecksumAddress(addrHex),
  };
}

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS evm_deposit_addresses (
      user_wallet    TEXT PRIMARY KEY,
      deposit_address TEXT NOT NULL,
      encrypted_key  TEXT NOT NULL,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS evm_deposits_verified (
      tx_hash        TEXT NOT NULL,
      chain_id       INT  NOT NULL,
      user_wallet    TEXT NOT NULL,
      asset          TEXT NOT NULL,
      amount         NUMERIC(36,18) NOT NULL,
      verified_at    TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (tx_hash, chain_id)
    )
  `);
}

/** Returns existing or freshly-generated deposit address for an EVM wallet. */
export async function getOrCreateDepositAddress(
  userWallet: string,
): Promise<{ depositAddress: string; isNew: boolean }> {
  await ensureTable();

  const { rows } = await pool.query<{ deposit_address: string }>(
    "SELECT deposit_address FROM evm_deposit_addresses WHERE user_wallet = $1",
    [userWallet],
  );

  if (rows.length > 0) {
    return { depositAddress: rows[0].deposit_address, isNew: false };
  }

  const { privateKey, address } = generateEvmKeypair();
  const enc = encrypt(privateKey);

  await pool.query(
    `INSERT INTO evm_deposit_addresses (user_wallet, deposit_address, encrypted_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_wallet) DO NOTHING`,
    [userWallet, address, enc],
  );

  return { depositAddress: address, isNew: true };
}

/** Returns just the deposit address (null if not yet provisioned). */
export async function getDepositAddress(
  userWallet: string,
): Promise<string | null> {
  await ensureTable();
  const { rows } = await pool.query<{ deposit_address: string }>(
    "SELECT deposit_address FROM evm_deposit_addresses WHERE user_wallet = $1",
    [userWallet],
  );
  return rows[0]?.deposit_address ?? null;
}

/** Returns true if this tx has already been credited. */
export async function isDepositAlreadyCredited(
  txHash: string,
  chainId: number,
): Promise<boolean> {
  await ensureTable();
  const { rows } = await pool.query(
    "SELECT 1 FROM evm_deposits_verified WHERE tx_hash = $1 AND chain_id = $2",
    [txHash, chainId],
  );
  return rows.length > 0;
}

/** Record a verified deposit so it cannot be double-credited. */
export async function recordVerifiedDeposit(params: {
  txHash:     string;
  chainId:    number;
  userWallet: string;
  asset:      string;
  amount:     string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO evm_deposits_verified (tx_hash, chain_id, user_wallet, asset, amount)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [params.txHash, params.chainId, params.userWallet, params.asset, params.amount],
  );
}
