import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { like, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const TOKEN_PREFIX = "admin_session:";
// 8-hour session TTL — short enough to limit stolen-token exposure on a
// financial platform, long enough for a working shift without re-auth.
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

// In-memory stores hold SHA-256 hashes, never raw token strings.
// DB rows also store hashes only (value JSON: { hash, createdAt, expiresAt }).
// Raw tokens exist only in the caller's HttpOnly cookie and in the return
// value of generateAdminToken() long enough to set that cookie.
const adminHashes      = new Set<string>();
const adminExpirations = new Map<string, number>();

function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function hasHashExpired(hash: string): boolean {
  const expiresAt = adminExpirations.get(hash);
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return true;
  return Date.now() > expiresAt;
}

function purgeHash(hash: string): void {
  adminHashes.delete(hash);
  adminExpirations.delete(hash);
  void db
    .delete(platformSettingsTable)
    .where(eq(platformSettingsTable.key, `${TOKEN_PREFIX}${hash}`))
    .catch((err: unknown) => {
      logger.warn({ err }, "adminAuth: failed to purge expired token from DB");
    });
}

export async function hydrateAdminTokens(): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(platformSettingsTable)
      .where(like(platformSettingsTable.key, `${TOKEN_PREFIX}%`));
    const now = Date.now();
    let loaded = 0;
    let expired = 0;
    let skipped = 0;
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value) as Record<string, unknown>;
        const hash      = parsed["hash"] as string | undefined;
        const expiresAt = parsed["expiresAt"] as number | undefined;
        // Rows written by the old plain-token format lack a "hash" field.
        // Those sessions are invalidated by this upgrade — skip and leave for GC.
        if (typeof hash !== "string" || hash.length !== 64) {
          skipped++;
          continue;
        }
        if (typeof expiresAt === "number" && now > expiresAt) {
          await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, row.key));
          expired++;
        } else {
          adminHashes.add(hash);
          if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
            adminExpirations.set(hash, expiresAt);
          }
          loaded++;
        }
      } catch (parseErr: any) {
        logger.warn({ key: row.key, err: parseErr?.message }, "adminAuth: malformed session row — skipping");
      }
    }
    logger.info({ loaded, expired, skipped }, "adminAuth: hydrated admin sessions from DB");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "adminAuth: could not hydrate sessions from DB");
  }
}

export async function generateAdminToken(): Promise<string> {
  const rawToken  = randomBytes(32).toString("hex");
  const hash      = sha256hex(rawToken);
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  adminHashes.add(hash);
  adminExpirations.set(hash, expiresAt);
  const key   = `${TOKEN_PREFIX}${hash}`;
  const value = JSON.stringify({ hash, createdAt: Date.now(), expiresAt });
  try {
    await db
      .insert(platformSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "adminAuth: could not persist session to DB");
  }
  // Return raw token to caller — it goes directly into the HttpOnly cookie.
  return rawToken;
}

export async function revokeAdminToken(rawToken: string): Promise<void> {
  const hash = sha256hex(rawToken);
  adminHashes.delete(hash);
  adminExpirations.delete(hash);
  try {
    await db
      .delete(platformSettingsTable)
      .where(eq(platformSettingsTable.key, `${TOKEN_PREFIX}${hash}`));
  } catch { /* best-effort */ }
}

export async function revokeAllAdminTokens(): Promise<void> {
  adminHashes.clear();
  adminExpirations.clear();
  try {
    const rows = await db
      .select()
      .from(platformSettingsTable)
      .where(like(platformSettingsTable.key, `${TOKEN_PREFIX}%`));
    for (const row of rows) {
      await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, row.key));
    }
  } catch { /* best-effort */ }
}

/**
 * Constant-time check: hash the incoming raw token, then compare against every
 * stored hash using timingSafeEqual. Always iterates all candidates (no early
 * return) and runs timingSafeEqual even on length mismatches (via dummy buffer)
 * to prevent timing oracle attacks.
 */
function hasMatchingAdminToken(rawToken: string): { matched: boolean; hash: string } {
  const incomingHash = sha256hex(rawToken);
  const incoming     = Buffer.from(incomingHash);
  const dummy        = Buffer.alloc(incoming.length);
  let found = false;
  for (const candidate of adminHashes) {
    const expected = Buffer.from(candidate);
    if (incoming.length === expected.length) {
      if (timingSafeEqual(incoming, expected)) found = true;
    } else {
      timingSafeEqual(incoming, dummy);
    }
  }
  return { matched: found, hash: incomingHash };
}

/**
 * Express middleware — accepts ONLY the HttpOnly admin_session cookie.
 * The X-Admin-Token header path has been removed: headers are JavaScript-
 * accessible and therefore vulnerable to XSS exfiltration.
 */
export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const rawToken = (req.cookies as Record<string, string> | undefined)?.admin_session ?? "";
  if (!rawToken) {
    res.status(401).json({ error: "Admin authentication required." });
    return;
  }
  const { matched, hash } = hasMatchingAdminToken(rawToken);
  if (!matched) {
    res.status(401).json({ error: "Admin authentication required." });
    return;
  }
  if (hasHashExpired(hash)) {
    purgeHash(hash);
    res.status(401).json({ error: "Admin session expired. Please log in again." });
    return;
  }
  next();
}

export function isValidAdminToken(token: unknown): boolean {
  if (typeof token !== "string" || token.length === 0) return false;
  const { matched, hash } = hasMatchingAdminToken(token);
  if (!matched) return false;
  if (hasHashExpired(hash)) {
    purgeHash(hash);
    return false;
  }
  return true;
}

export const ADMIN_COOKIE_NAME    = "admin_session";
export const ADMIN_COOKIE_TTL_MS  = TOKEN_TTL_MS;
