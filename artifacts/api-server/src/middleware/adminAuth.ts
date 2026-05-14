import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const adminTokens = new Set<string>();

export function generateAdminToken(): string {
  const token = randomBytes(32).toString("hex");
  adminTokens.add(token);
  return token;
}

export function revokeAdminToken(token: string): void {
  adminTokens.delete(token);
}

export function revokeAllAdminTokens(): void {
  adminTokens.clear();
}

export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const token = (req.headers["x-admin-token"] as string | undefined) ?? "";
  if (!token || !adminTokens.has(token)) {
    res.status(401).json({ error: "Admin authentication required." });
    return;
  }
  next();
}
