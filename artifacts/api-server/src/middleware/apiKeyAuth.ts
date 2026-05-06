import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const API_KEYS_DB_KEY = "admin_api_keys_list";

export interface StoredApiKey {
  id: string;
  name: string;
  type: "public" | "private";
  rateLimit: number;
  status: "active" | "revoked";
  createdAt: string;
  keyHash?: string;
  keyPreview?: string;
  key?: string;
  calls24h?: number;
  lastUsedAt?: string | null;
}

export function sha256Hex(s: string): string {
  // Use HMAC-SHA-256 with a server-side secret so that a leaked hash store
  // alone cannot be used to reverse-lookup keys without knowledge of the secret.
  const secret = process.env["API_KEY_HMAC_SECRET"] ?? "orahdex-default-hmac-secret";
  return crypto.createHmac("sha256", secret).update(s).digest("hex");
}

export async function loadStoredApiKeys(): Promise<StoredApiKey[]> {
  const rows = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, API_KEYS_DB_KEY));
  if (!rows.length) return [];
  try {
    const parsed = JSON.parse(rows[0].value) as StoredApiKey[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveStoredApiKeys(keys: StoredApiKey[]): Promise<void> {
  await db
    .insert(platformSettingsTable)
    .values({ key: API_KEYS_DB_KEY, value: JSON.stringify(keys) })
    .onConflictDoUpdate({
      target: platformSettingsTable.key,
      set: { value: JSON.stringify(keys), updatedAt: new Date() },
    });
}

const ADVISORY_LOCK_KEY = 0x4f524148_4150494b;

export async function withApiKeysLock<T>(fn: (keys: StoredApiKey[]) => Promise<{ keys: StoredApiKey[]; result: T }>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]);
    const keys = await loadStoredApiKeys();
    const { keys: newKeys, result } = await fn(keys);
    await saveStoredApiKeys(newKeys);
    return result;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [ADVISORY_LOCK_KEY]);
    } catch {}
    client.release();
  }
}

const callBuffer = new Map<string, number>();
const lastUsedBuffer = new Map<string, number>();
const FLUSH_INTERVAL_MS = 30_000;
let flushTimer: NodeJS.Timeout | null = null;

async function flushCallBuffer(): Promise<void> {
  if (callBuffer.size === 0 && lastUsedBuffer.size === 0) return;
  const callsSnapshot = new Map(callBuffer);
  const lastUsedSnapshot = new Map(lastUsedBuffer);
  callBuffer.clear();
  lastUsedBuffer.clear();
  try {
    await withApiKeysLock(async (keys) => {
      const now = Date.now();
      const updated = keys.map((k) => {
        const inc = callsSnapshot.get(k.id) ?? 0;
        const lu = lastUsedSnapshot.get(k.id);
        if (inc === 0 && lu === undefined) return k;
        const lastReset = (k as any).callsResetAt ? Number((k as any).callsResetAt) : null;
        const dayMs = 24 * 60 * 60 * 1000;
        const resetDue = !lastReset || now - lastReset >= dayMs;
        return {
          ...k,
          calls24h: (resetDue ? 0 : k.calls24h ?? 0) + inc,
          callsResetAt: resetDue ? now : lastReset,
          lastUsedAt: lu ? new Date(lu).toISOString() : k.lastUsedAt ?? null,
        } as StoredApiKey;
      });
      return { keys: updated, result: undefined };
    });
  } catch (err) {
    logger.warn({ err }, "apiKeyAuth: failed to flush call counter");
    for (const [id, n] of callsSnapshot) callBuffer.set(id, (callBuffer.get(id) ?? 0) + n);
    for (const [id, t] of lastUsedSnapshot) lastUsedBuffer.set(id, Math.max(lastUsedBuffer.get(id) ?? 0, t));
  }
}

export function startApiKeyCounterFlusher(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => void flushCallBuffer(), FLUSH_INTERVAL_MS);
  logger.info({ intervalMs: FLUSH_INTERVAL_MS }, "API key call counter flusher started");
}

function trackCall(id: string): void {
  callBuffer.set(id, (callBuffer.get(id) ?? 0) + 1);
  lastUsedBuffer.set(id, Date.now());
}

let cache: { keys: StoredApiKey[]; loadedAt: number } | null = null;
const CACHE_TTL_MS = 10_000;

async function getCachedKeys(): Promise<StoredApiKey[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.keys;
  const keys = await loadStoredApiKeys();
  cache = { keys, loadedAt: Date.now() };
  return keys;
}

export function invalidateApiKeyCache(): void {
  cache = null;
}

function findMatch(keys: StoredApiKey[], presented: string): StoredApiKey | null {
  const presentedHash = sha256Hex(presented);
  for (const k of keys) {
    if (k.status !== "active") continue;
    if (k.keyHash && k.keyHash === presentedHash) return k;
    if (k.key && k.key === presented) return k;
  }
  return null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: { id: string; name: string; type: "public" | "private"; rateLimit: number };
    }
  }
}

export async function apiKeyAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const presented =
    (req.header("x-api-key") ?? "").trim() ||
    (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  if (!presented || !presented.startsWith("orah_")) return next();

  try {
    const keys = await getCachedKeys();
    const match = findMatch(keys, presented);
    if (match) {
      req.apiKey = { id: match.id, name: match.name, type: match.type, rateLimit: match.rateLimit };
      trackCall(match.id);
    }
  } catch (err) {
    logger.warn({ err }, "apiKeyAuth: lookup failed (allowing request as anonymous)");
  }
  next();
}
