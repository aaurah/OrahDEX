import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { like, eq, or, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const TOKEN_PREFIX = "admin_session_hash:";
const LEGACY_TOKEN_PREFIX = "admin_session:";
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ADMIN_SESSIONS = 1_000;

const adminTokens = new Set<string>();
const adminTokenExpirations = new Map<string, number>();
const verifiedAdminRequests = new WeakSet<Request>();

function hasTokenExpired(token: string): boolean {
  const expiresAt = adminTokenExpirations.get(token);
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return true;
  return Date.now() > expiresAt;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function purgeExpiredToken(token: string): void {
  adminTokens.delete(token);
  adminTokenExpirations.delete(token);
  void db
    .delete(platformSettingsTable)
    .where(eq(platformSettingsTable.key, `${TOKEN_PREFIX}${token}`))
    .catch((err: unknown) => {
      logger.warn({ err }, "adminAuth: failed to purge expired admin token from DB");
    });
}

export async function hydrateAdminTokens(): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(platformSettingsTable)
      .where(or(
        like(platformSettingsTable.key, `${TOKEN_PREFIX}%`),
        like(platformSettingsTable.key, `${LEGACY_TOKEN_PREFIX}%`),
      ))
      .orderBy(desc(platformSettingsTable.updatedAt));
    const now = Date.now();
    let expired = 0;
    let overLimit = 0;
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value) as { token?: string; tokenHash?: string; expiresAt: number };
        const tokenHash = parsed.tokenHash ?? (parsed.token ? hashToken(parsed.token) : "");
        const expiresAt = parsed.expiresAt;
        if (!tokenHash) {
          await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, row.key));
          continue;
        }
        if (expiresAt && now > expiresAt) {
          await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, row.key));
          expired++;
        } else if (adminTokens.size >= MAX_ADMIN_SESSIONS) {
          // Keep the newest sessions and revoke overflow rows deterministically.
          await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, row.key));
          overLimit++;
        } else {
          adminTokens.add(tokenHash);
          if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
            adminTokenExpirations.set(tokenHash, expiresAt);
          }
          // Upgrade old plaintext sessions in place without invalidating them.
          if (row.key.startsWith(LEGACY_TOKEN_PREFIX)) {
            await db.insert(platformSettingsTable)
              .values({
                key: `${TOKEN_PREFIX}${tokenHash}`,
                value: JSON.stringify({ tokenHash, expiresAt }),
              })
              .onConflictDoUpdate({
                target: platformSettingsTable.key,
                set: { value: JSON.stringify({ tokenHash, expiresAt }), updatedAt: new Date() },
              });
            await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, row.key));
          }
        }
      } catch (parseErr: any) {
        logger.warn({ key: row.key, err: parseErr?.message }, "adminAuth: malformed admin session row — skipping");
      }
    }
    logger.info({ sessions: adminTokens.size, expired, overLimit }, "adminAuth: hydrated admin sessions from DB");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "adminAuth: could not hydrate tokens from DB");
  }
}

export async function generateAdminToken(): Promise<string> {
  const now = Date.now();
  for (const [hash, expiresAt] of adminTokenExpirations) {
    if (expiresAt <= now) {
      adminTokens.delete(hash);
      adminTokenExpirations.delete(hash);
    }
  }
  if (adminTokens.size >= MAX_ADMIN_SESSIONS) {
    throw new Error("Maximum number of active admin sessions reached.");
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = now + TOKEN_TTL_MS;
  const key = `${TOKEN_PREFIX}${tokenHash}`;
  const value = JSON.stringify({ tokenHash, createdAt: now, expiresAt });
  try {
    await db
      .insert(platformSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "adminAuth: could not persist token to DB");
    throw new Error("Unable to persist the admin session. Please retry.");
  }
  adminTokens.add(tokenHash);
  adminTokenExpirations.set(tokenHash, expiresAt);
  return token;
}

export async function revokeAdminToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  adminTokens.delete(tokenHash);
  adminTokenExpirations.delete(tokenHash);
  try {
    await db
      .delete(platformSettingsTable)
      .where(eq(platformSettingsTable.key, `${TOKEN_PREFIX}${tokenHash}`));
  } catch { /* best-effort */ }
}

export async function revokeAllAdminTokens(): Promise<void> {
  await db
    .delete(platformSettingsTable)
    .where(or(
      like(platformSettingsTable.key, `${TOKEN_PREFIX}%`),
      like(platformSettingsTable.key, `${LEGACY_TOKEN_PREFIX}%`),
    ));
  adminTokens.clear();
  adminTokenExpirations.clear();
}

type PersistedTokenStatus = "valid" | "missing" | "invalid" | "unavailable";

async function verifyPersistedAdminToken(tokenHash: string): Promise<PersistedTokenStatus> {
  const key = `${TOKEN_PREFIX}${tokenHash}`;
  try {
    const rows = await db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, key))
      .limit(1);
    const row = rows[0];
    if (!row) return "missing";

    let parsed: { tokenHash?: unknown; expiresAt?: unknown };
    try {
      parsed = JSON.parse(row.value) as { tokenHash?: unknown; expiresAt?: unknown };
    } catch {
      await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, key));
      return "invalid";
    }

    const expiresAt = parsed.expiresAt;
    if (parsed.tokenHash !== tokenHash || typeof expiresAt !== "number" ||
        !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, key));
      adminTokens.delete(tokenHash);
      adminTokenExpirations.delete(tokenHash);
      return "invalid";
    }

    // The database row is authoritative so sessions can be created and revoked
    // consistently across API instances, not only in the process-local cache.
    adminTokens.add(tokenHash);
    adminTokenExpirations.set(tokenHash, expiresAt);
    return "valid";
  } catch (err) {
    logger.warn({ err }, "adminAuth: persisted session verification failed");
    return "unavailable";
  }
}

function hasMatchingAdminToken(token: string): boolean {
  const incoming = Buffer.from(hashToken(token));
  // Dummy buffer used when lengths differ so timingSafeEqual always runs
  // (prevents early short-circuit that leaks token-length timing info).
  const dummy = Buffer.alloc(incoming.length);
  let found = false;
  for (const candidate of adminTokens) {
    const expected = Buffer.from(candidate);
    if (incoming.length === expected.length) {
      if (timingSafeEqual(incoming, expected)) found = true;
    } else {
      timingSafeEqual(incoming, dummy); // constant-time no-op
    }
  }
  return found;
}

export async function requireAdminToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (verifiedAdminRequests.has(req)) {
    next();
    return;
  }

  // Accept token from HttpOnly cookie (preferred) or X-Admin-Token header (legacy).
  // cookie-parser must be wired in app.ts for req.cookies to be populated.
  const cookieToken  = (req.cookies as Record<string, string> | undefined)?.admin_session ?? "";
  const headerToken  = (req.headers["x-admin-token"] as string | undefined) ?? "";
  const token        = cookieToken || headerToken;

  if (!token) {
    res.status(401).json({ error: "Admin authentication required." });
    return;
  }
  const tokenHash = hashToken(token);
  if (hasMatchingAdminToken(token) && hasTokenExpired(tokenHash)) {
    purgeExpiredToken(tokenHash);
    res.status(401).json({ error: "Admin session expired. Please log in again." });
    return;
  }
  const persistedStatus = await verifyPersistedAdminToken(tokenHash);
  if (persistedStatus === "unavailable") {
    res.status(503).json({ error: "Admin session verification is temporarily unavailable." });
    return;
  }
  if (persistedStatus !== "valid") {
    res.status(401).json({ error: "Admin session expired or revoked. Please log in again." });
    return;
  }
  verifiedAdminRequests.add(req);
  next();
}

export async function isValidAdminToken(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0) return false;
  const tokenHash = hashToken(token);
  if (hasMatchingAdminToken(token) && hasTokenExpired(tokenHash)) {
    purgeExpiredToken(tokenHash);
    return false;
  }
  return await verifyPersistedAdminToken(tokenHash) === "valid";
}

/**
 * Shared cookie options for the admin_session HttpOnly cookie.
 * Export allows admin.ts to set the cookie with consistent options.
 */
export const ADMIN_COOKIE_NAME = "admin_session";
export const ADMIN_COOKIE_TTL_MS = TOKEN_TTL_MS;
