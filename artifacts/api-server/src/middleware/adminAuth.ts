import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { like, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const TOKEN_PREFIX = "admin_session:";
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const adminTokens = new Set<string>();
const adminTokenExpirations = new Map<string, number>();

function hasTokenExpired(token: string): boolean {
  const expiresAt = adminTokenExpirations.get(token);
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return true;
  return Date.now() > expiresAt;
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
      .where(like(platformSettingsTable.key, `${TOKEN_PREFIX}%`));
    const now = Date.now();
    let expired = 0;
    for (const row of rows) {
      try {
        const { token, expiresAt } = JSON.parse(row.value) as { token: string; expiresAt: number };
        if (expiresAt && now > expiresAt) {
          await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, row.key));
          expired++;
        } else {
          adminTokens.add(token);
          if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
            adminTokenExpirations.set(token, expiresAt);
          }
        }
      } catch (parseErr: any) {
        logger.warn({ key: row.key, err: parseErr?.message }, "adminAuth: malformed admin session row — skipping");
      }
    }
    logger.info({ sessions: adminTokens.size, expired }, "adminAuth: hydrated admin sessions from DB");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "adminAuth: could not hydrate tokens from DB");
  }
}

export async function generateAdminToken(): Promise<string> {
  const token = randomBytes(32).toString("hex");
  adminTokens.add(token);
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  adminTokenExpirations.set(token, expiresAt);
  const key = `${TOKEN_PREFIX}${token}`;
  const value = JSON.stringify({ token, createdAt: Date.now(), expiresAt });
  try {
    await db
      .insert(platformSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "adminAuth: could not persist token to DB");
  }
  return token;
}

export async function revokeAdminToken(token: string): Promise<void> {
  adminTokens.delete(token);
  adminTokenExpirations.delete(token);
  try {
    await db
      .delete(platformSettingsTable)
      .where(eq(platformSettingsTable.key, `${TOKEN_PREFIX}${token}`));
  } catch { /* best-effort */ }
}

export async function revokeAllAdminTokens(): Promise<void> {
  adminTokens.clear();
  adminTokenExpirations.clear();
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

function hasMatchingAdminToken(token: string): boolean {
  const incoming = Buffer.from(token);
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

export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  // Accept token from HttpOnly cookie (preferred) or X-Admin-Token header (legacy).
  // cookie-parser must be wired in app.ts for req.cookies to be populated.
  const cookieToken  = (req.cookies as Record<string, string> | undefined)?.admin_session ?? "";
  const headerToken  = (req.headers["x-admin-token"] as string | undefined) ?? "";
  const token        = cookieToken || headerToken;

  if (!token || !hasMatchingAdminToken(token)) {
    res.status(401).json({ error: "Admin authentication required." });
    return;
  }
  if (hasTokenExpired(token)) {
    purgeExpiredToken(token);
    res.status(401).json({ error: "Admin session expired. Please log in again." });
    return;
  }
  next();
}

export function isValidAdminToken(token: unknown): boolean {
  if (typeof token !== "string" || token.length === 0 || !hasMatchingAdminToken(token)) return false;
  if (hasTokenExpired(token)) {
    purgeExpiredToken(token);
    return false;
  }
  return true;
}

/**
 * Shared cookie options for the admin_session HttpOnly cookie.
 * Export allows admin.ts to set the cookie with consistent options.
 */
export const ADMIN_COOKIE_NAME = "admin_session";
export const ADMIN_COOKIE_TTL_MS = TOKEN_TTL_MS;
