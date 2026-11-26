import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { userApiKeysTable } from "@workspace/db/schema";

export type PersonalApiKeyPermission = "read" | "trading" | "full";

const MIN_RATE_LIMIT = 10;
const MAX_RATE_LIMIT = 200;
const MIN_SECRET_BYTES = 32;

export class ApiKeyConfigurationError extends Error {
  readonly code = "API_KEY_CONFIGURATION_MISSING";

  constructor() {
    super("Personal API keys are unavailable until API_KEY_HMAC_SECRET is configured in Replit Secrets.");
    this.name = "ApiKeyConfigurationError";
  }
}

export class PersonalApiKeyRateLimitError extends Error {
  readonly code = "API_KEY_RATE_LIMIT";

  constructor(readonly limit: number) {
    super("This API key has reached its per-minute request limit.");
    this.name = "PersonalApiKeyRateLimitError";
  }
}

export interface PersonalApiKeyInput {
  name: string;
  permission: PersonalApiKeyPermission;
  rateLimit: number;
}

export interface PersonalApiKeyView extends PersonalApiKeyInput {
  id: string;
  keyPreview: string;
  status: "active" | "revoked";
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AuthenticatedPersonalApiKey {
  id: string;
  name: string;
  ownerWallet: string;
  ownerWalletKey: string;
  permission: PersonalApiKeyPermission;
  rateLimit: number;
}

export function normalizeWalletAddress(walletAddress: string): string {
  const trimmed = walletAddress.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

export function sameWalletAddress(left: string, right: string): boolean {
  return normalizeWalletAddress(left) === normalizeWalletAddress(right);
}

export function normalizePersonalApiKeyInput(input: unknown): PersonalApiKeyInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Key details are required.");
  }
  const value = input as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const permission = value.permission;
  const rateLimit = Number(value.rateLimit);

  if (!name || name.length > 100) {
    throw new Error("Key name must be between 1 and 100 characters.");
  }
  if (permission !== "read" && permission !== "trading" && permission !== "full") {
    throw new Error("Choose a supported API key permission.");
  }
  if (!Number.isInteger(rateLimit) || rateLimit < MIN_RATE_LIMIT || rateLimit > MAX_RATE_LIMIT) {
    throw new Error(`Rate limit must be an integer from ${MIN_RATE_LIMIT} to ${MAX_RATE_LIMIT} requests per minute.`);
  }

  return { name, permission, rateLimit };
}

export function personalApiKeyRequestContext(input: unknown): string {
  return JSON.stringify(normalizePersonalApiKeyInput(input));
}

function getApiKeySecret(): string {
  const secret = process.env.API_KEY_HMAC_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new ApiKeyConfigurationError();
  }
  return secret;
}

export function hashPersonalApiKey(key: string): string {
  return crypto.createHmac("sha256", getApiKeySecret()).update(key, "utf8").digest("hex");
}

function toPublicView(row: typeof userApiKeysTable.$inferSelect): PersonalApiKeyView {
  return {
    id: row.id,
    name: row.name,
    permission: row.permission as PersonalApiKeyPermission,
    rateLimit: row.rateLimit,
    keyPreview: row.keyPreview,
    status: row.status as "active" | "revoked",
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listPersonalApiKeys(walletAddress: string): Promise<PersonalApiKeyView[]> {
  const ownerWalletKey = normalizeWalletAddress(walletAddress);
  const rows = await db.select().from(userApiKeysTable)
    .where(eq(userApiKeysTable.ownerWalletKey, ownerWalletKey))
    .orderBy(desc(userApiKeysTable.createdAt));
  return rows.map(toPublicView);
}

export async function createPersonalApiKey(
  walletAddress: string,
  rawInput: unknown,
): Promise<{ key: string; apiKey: PersonalApiKeyView }> {
  const ownerWallet = walletAddress.trim();
  const ownerWalletKey = normalizeWalletAddress(ownerWallet);
  if (!ownerWallet || ownerWallet.length > 255) throw new Error("A supported wallet address is required.");

  const input = normalizePersonalApiKeyInput(rawInput);
  const key = `orah_user_${crypto.randomBytes(32).toString("base64url")}`;
  const id = `uak_${crypto.randomBytes(16).toString("hex")}`;
  const keyPreview = `${key.slice(0, 14)}…${key.slice(-4)}`;
  const [row] = await db.insert(userApiKeysTable).values({
    id,
    ownerWallet,
    ownerWalletKey,
    ...input,
    keyHash: hashPersonalApiKey(key),
    keyPreview,
  }).returning();

  if (!row) throw new Error("Could not save the API key.");
  return { key, apiKey: toPublicView(row) };
}

export async function revokePersonalApiKey(id: string, walletAddress: string): Promise<boolean> {
  const ownerWalletKey = normalizeWalletAddress(walletAddress);
  const rows = await db.update(userApiKeysTable)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(userApiKeysTable.id, id), eq(userApiKeysTable.ownerWalletKey, ownerWalletKey)))
    .returning({ id: userApiKeysTable.id });
  return rows.length > 0;
}

export async function authenticatePersonalApiKey(
  presentedKey: string,
): Promise<AuthenticatedPersonalApiKey | null> {
  const keyHash = hashPersonalApiKey(presentedKey);
  const result = await pool.query<{
    id: string;
    name: string;
    owner_wallet: string;
    owner_wallet_key: string;
    permission: PersonalApiKeyPermission;
    rate_limit: number;
    rate_window_calls: number;
  }>(
    `UPDATE user_api_keys
     SET rate_window_calls = CASE
           WHEN rate_window_started_at IS NULL OR rate_window_started_at <= NOW() - INTERVAL '1 minute' THEN 1
           ELSE rate_window_calls + 1
         END,
         rate_window_started_at = CASE
           WHEN rate_window_started_at IS NULL OR rate_window_started_at <= NOW() - INTERVAL '1 minute' THEN NOW()
           ELSE rate_window_started_at
         END,
         last_used_at = NOW()
     WHERE key_hash = $1 AND status = 'active'
     RETURNING id, name, owner_wallet, owner_wallet_key, permission, rate_limit, rate_window_calls`,
    [keyHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.rate_window_calls > row.rate_limit) {
    throw new PersonalApiKeyRateLimitError(row.rate_limit);
  }
  return {
    id: row.id,
    name: row.name,
    ownerWallet: row.owner_wallet,
    ownerWalletKey: row.owner_wallet_key,
    permission: row.permission,
    rateLimit: row.rate_limit,
  };
}
