import { randomBytes } from "node:crypto";
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
  return typeof expiresAt === "number" && Number.isFinite(expiresAt) && Date.now() > expiresAt;
}

function purgeExpiredToken(token: string): void {
  adminTokens.delete(token);
  adminTokenExpirations.delete(token);
  void db
    .delete(platformSettingsTable)
    .where(eq(platformSettingsTable.key, `${TOKEN_PREFIX}${token}`))
    .catch(() => {});
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
      } catch { /* malformed row — skip */ }
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

export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const token = (req.headers["x-admin-token"] as string | undefined) ?? "";
  if (!token || !adminTokens.has(token)) {
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
  if (typeof token !== "string" || token.length === 0 || !adminTokens.has(token)) return false;
  if (!hasTokenExpired(token)) return true;
  purgeExpiredToken(token);
  return false;
}
