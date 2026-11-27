import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { db, pool } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  authenticatePersonalApiKey,
  PersonalApiKeyRateLimitError,
  sameWalletAddress,
  type PersonalApiKeyPermission,
} from "../lib/personalApiKeys.js";

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
  // Use scrypt (a memory-hard KDF) so the key hash has meaningful computational cost.
  // A server-side pepper (API_KEY_HMAC_SECRET) is used as the salt, which ensures
  // that leaked hashes from the database cannot be attacked without the server secret.
  const pepper = process.env["API_KEY_HMAC_SECRET"];
  if (!pepper) {
    throw new Error("API_KEY_HMAC_SECRET environment variable is required but not set");
  }
  return crypto.scryptSync(s, Buffer.from(pepper), 32, { N: 32768, r: 8, p: 1 }).toString("hex");
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
const MAX_BUFFERED_API_KEYS = 5_000;
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
        // Also reset if clock jumped backward (NTP sync) to avoid permanently stuck counters
        const resetDue = !lastReset || now - lastReset >= dayMs || now < lastReset;
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

function trackCall(id: string): boolean {
  if (
    (!callBuffer.has(id) && callBuffer.size >= MAX_BUFFERED_API_KEYS) ||
    (!lastUsedBuffer.has(id) && lastUsedBuffer.size >= MAX_BUFFERED_API_KEYS)
  ) {
    return false;
  }
  callBuffer.set(id, (callBuffer.get(id) ?? 0) + 1);
  lastUsedBuffer.set(id, Date.now());
  return true;
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
  }
  return null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        name: string;
        type: "public" | "private" | "personal";
        rateLimit: number;
        permission?: PersonalApiKeyPermission;
        ownerWallet?: string;
        ownerWalletKey?: string;
      };
    }
  }
}

function requestPath(req: Request): string {
  try {
    return new URL(req.originalUrl, "http://orahdex.local").pathname.replace(/\/+$/, "") || "/";
  } catch {
    return req.path.replace(/\/+$/, "") || "/";
  }
}

function privateWalletForRequest(req: Request, path: string): string | null {
  if (path === "/api/orders" && req.method === "GET") {
    return typeof req.query.walletAddress === "string" ? req.query.walletAddress : null;
  }
  if (path.startsWith("/api/withdrawals/") && req.method === "GET") {
    return decodeURIComponent(path.slice("/api/withdrawals/".length));
  }
  if ((path === "/api/notifications" || path === "/api/social/notifications") &&
      (req.method === "GET" || req.method === "DELETE")) {
    return typeof req.query.address === "string" ? req.query.address : null;
  }
  return null;
}

function isPersonalWalletRoute(path: string, method: string): boolean {
  return (path === "/api/orders" && method === "GET") ||
    (path.startsWith("/api/withdrawals/") && method === "GET") ||
    ((path === "/api/notifications" || path === "/api/social/notifications") &&
      (method === "GET" || method === "DELETE"));
}

function tradingOrderWrite(path: string, method: string): boolean {
  return (path === "/api/orders" && method === "POST") ||
    (/^\/api\/orders\/[^/]+$/.test(path) && method === "DELETE");
}

function fullAccessWrite(path: string, method: string): boolean {
  return tradingOrderWrite(path, method) ||
    (path === "/api/withdrawals" && method === "POST") ||
    ((path === "/api/notifications" || path === "/api/social/notifications") && method === "DELETE");
}

function checkPersonalApiKeyScope(req: Request, permission: PersonalApiKeyPermission, ownerWalletKey: string): string | null {
  const path = requestPath(req);
  // Key-management operations always need their own one-time wallet proof;
  // an API key never substitutes for that challenge.
  if (path === "/api/wallet-request/challenge" || path.startsWith("/api/user/api-keys")) return null;

  if (isPersonalWalletRoute(path, req.method)) {
    const privateWallet = privateWalletForRequest(req, path);
    if (
      permission !== "full" ||
      !privateWallet ||
      !sameWalletAddress(privateWallet, ownerWalletKey)
    ) {
      return "This API key cannot access another wallet's account data.";
    }
  } else if (path.startsWith("/api/orders/") && req.method === "GET") {
    // An order-id lookup has no wallet parameter to bind to the key owner.
    return "This API key cannot access an order without wallet ownership context.";
  }

  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return null;

  const walletAddress = req.body?.walletAddress;
  if (tradingOrderWrite(path, req.method) || (permission === "full" && path === "/api/withdrawals" && req.method === "POST")) {
    if (typeof walletAddress !== "string" || !sameWalletAddress(walletAddress, ownerWalletKey)) {
      return "This API key can only be used with its owner's wallet.";
    }
  }
  if (permission === "trading" && tradingOrderWrite(path, req.method)) return null;
  if (permission === "full" && fullAccessWrite(path, req.method)) {
    if (path === "/api/notifications" || path === "/api/social/notifications") {
      const address = typeof req.query.address === "string" ? req.query.address : "";
      if (!address || !sameWalletAddress(address, ownerWalletKey)) {
        return "This API key can only be used with its owner's wallet.";
      }
    }
    return null;
  }
  return "This API key's permission does not allow this request.";
}

/**
 * Middleware that rejects any request that arrives with an API key in the
 * query string (?apiKey=...).  Keys must be sent via Authorization: Bearer
 * or the X-API-Key header so they never appear in server access logs.
 *
 * Returns HTTP 400 with an actionable message instead of silently ignoring
 * the query param, so integrators are guided to fix their clients.
 */
export function rejectQueryParamApiKey(req: Request, res: Response, next: NextFunction): void {
  if (req.query["apiKey"] ?? req.query["api_key"]) {
    res.status(400).json({
      error: "API keys must not be sent as query parameters (they appear in server logs). " +
             "Send the key in the Authorization header: Authorization: Bearer <your-key>",
    });
    return;
  }
  next();
}

/**
 * Middleware that blocks requests that have no valid API key attached.
 * Must be applied AFTER apiKeyAuth (which populates req.apiKey).
 * Explicitly whitelisted paths bypass this check.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (req.apiKey) return next();
  res.status(401).json({
    error: "API key required. Include your key in the Authorization header: Authorization: Bearer <your-key>. " +
           "Personal keys can be created in Settings → API Access.",
  });
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const presented =
    (req.header("x-api-key") ?? "").trim() ||
    (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  if (!presented || !presented.startsWith("orah_")) return next();

  if (presented.startsWith("orah_user_")) {
    try {
      const personalKey = await authenticatePersonalApiKey(presented);
      if (!personalKey) {
        res.status(401).json({ error: "Invalid or revoked personal API key." });
        return;
      }
      const scopeError = checkPersonalApiKeyScope(req, personalKey.permission, personalKey.ownerWalletKey);
      if (scopeError) {
        res.status(403).json({ error: scopeError });
        return;
      }
      req.apiKey = {
        id: personalKey.id,
        name: personalKey.name,
        type: "personal",
        rateLimit: personalKey.rateLimit,
        permission: personalKey.permission,
        ownerWallet: personalKey.ownerWallet,
        ownerWalletKey: personalKey.ownerWalletKey,
      };
      next();
      return;
    } catch (err) {
      if (err instanceof PersonalApiKeyRateLimitError) {
        res.setHeader("Retry-After", "60");
        res.status(429).json({ error: err.message, limit: err.limit, window: "1 minute" });
        return;
      }
      logger.error({ err }, "apiKeyAuth: personal key verification unavailable");
      res.status(503).json({ error: "Personal API key verification is temporarily unavailable. Retry shortly." });
      return;
    }
  }

  try {
    const keys = await getCachedKeys();
    const match = findMatch(keys, presented);
    if (match) {
      if (!trackCall(match.id)) {
        res.status(503).json({ error: "API key usage tracking is at capacity. Retry shortly." });
        return;
      }
      req.apiKey = { id: match.id, name: match.name, type: match.type, rateLimit: match.rateLimit };
    }
  } catch (err) {
    logger.error({ err }, "apiKeyAuth: key lookup unavailable");
    res.status(503).json({ error: "API key verification is temporarily unavailable. Retry shortly." });
    return;
  }
  next();
}
