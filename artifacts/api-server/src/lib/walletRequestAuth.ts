import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { verifyWalletMessageSignature } from "./walletAuth.js";

export type WalletRequestResource =
  | "withdrawal-history"
  | "notifications"
  | "social-notifications";

type WalletRequestMethod = "GET" | "DELETE";

interface StoredWalletRequestChallenge {
  wallet: string;
  resource: WalletRequestResource;
  method: WalletRequestMethod;
  path: string;
  message: string;
  expiresAt: number;
}

const CHALLENGE_PREFIX = "wallet_request_challenge:";
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

function normalizeWallet(walletAddress: string): string {
  return walletAddress.trim().toLowerCase();
}

function targetPath(resource: WalletRequestResource, wallet: string): string {
  switch (resource) {
    case "withdrawal-history":
      return `/withdrawals/${encodeURIComponent(wallet)}`;
    case "notifications":
      return "/notifications";
    case "social-notifications":
      return "/social/notifications";
  }
}

function isAllowedMethod(resource: WalletRequestResource, method: string): method is WalletRequestMethod {
  if (resource === "withdrawal-history") return method === "GET";
  return method === "GET" || method === "DELETE";
}

export async function issueWalletRequestChallenge(params: {
  walletAddress: string;
  resource: WalletRequestResource;
  method: string;
}): Promise<{ challengeId: string; message: string }> {
  const wallet = normalizeWallet(params.walletAddress);
  const method = params.method.toUpperCase();
  if (!wallet || !isAllowedMethod(params.resource, method)) {
    throw new Error("Unsupported wallet authorization request.");
  }

  const challengeId = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const path = targetPath(params.resource, wallet);
  const message = [
    "Authorize OrahDEX account access",
    `Wallet: ${wallet}`,
    `Action: ${method} ${path}`,
    `Nonce: ${crypto.randomBytes(24).toString("hex")}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    "",
    "This signature only authorizes the displayed read or notification action. It does not approve a transaction.",
  ].join("\n");
  const value: StoredWalletRequestChallenge = {
    wallet, resource: params.resource, method, path, message, expiresAt,
  };

  await pool.query(
    `DELETE FROM platform_settings
     WHERE key LIKE $1
       AND updated_at < NOW() - INTERVAL '10 minutes'`,
    [`${CHALLENGE_PREFIX}%`],
  );
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [`${CHALLENGE_PREFIX}${challengeId}`, JSON.stringify(value)],
  );

  return { challengeId, message };
}

export async function verifyWalletRequestProof(params: {
  walletAddress: string;
  resource: WalletRequestResource;
  method: string;
  challengeId: string | undefined;
  signature: string | undefined;
}): Promise<void> {
  if (!params.challengeId || !params.signature) {
    throw new Error("Wallet signature proof is required.");
  }
  const wallet = normalizeWallet(params.walletAddress);
  const method = params.method.toUpperCase();
  if (!isAllowedMethod(params.resource, method)) {
    throw new Error("Unsupported wallet authorization request.");
  }

  // DELETE ... RETURNING makes the challenge single-use even with concurrent requests.
  const result = await pool.query<{ value: string }>(
    `DELETE FROM platform_settings
     WHERE key = $1
     RETURNING value`,
    [`${CHALLENGE_PREFIX}${params.challengeId}`],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Wallet authorization expired or was already used.");

  const stored = JSON.parse(row.value) as StoredWalletRequestChallenge;
  const expectedPath = targetPath(params.resource, wallet);
  if (
    stored.expiresAt < Date.now() ||
    stored.wallet !== wallet ||
    stored.resource !== params.resource ||
    stored.method !== method ||
    stored.path !== expectedPath
  ) {
    throw new Error("Wallet authorization does not match this request.");
  }
  verifyWalletMessageSignature(wallet, stored.message, params.signature);
}
