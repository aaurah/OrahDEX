import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { verifyWalletMessageSignature } from "./walletAuth.js";

export type WalletRequestResource =
  | "withdrawal-history"
  | "notifications"
  | "social-notifications"
  | "personal-api-keys";

type WalletRequestMethod = "GET" | "POST" | "DELETE";

interface StoredWalletRequestChallenge {
  wallet: string;
  resource: WalletRequestResource;
  method: WalletRequestMethod;
  path: string;
  context?: string;
  message: string;
  expiresAt: number;
}

const CHALLENGE_PREFIX = "wallet_request_challenge:";
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

function normalizeWallet(walletAddress: string): string {
  const trimmed = walletAddress.trim();
  // EVM addresses are case-insensitive. BSV Base58 and Solana public keys are
  // case-sensitive, so preserve their exact wallet-provided representation.
  return /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

function targetPath(resource: WalletRequestResource, wallet: string, resourceId?: string): string {
  switch (resource) {
    case "withdrawal-history":
      return `/withdrawals/${encodeURIComponent(wallet)}`;
    case "notifications":
      return "/notifications";
    case "social-notifications":
      return "/social/notifications";
    case "personal-api-keys":
      return resourceId
        ? `/user/api-keys/${encodeURIComponent(resourceId)}`
        : "/user/api-keys";
  }
}

function isAllowedMethod(resource: WalletRequestResource, method: string, resourceId?: string): method is WalletRequestMethod {
  if (resource === "withdrawal-history") return method === "GET";
  if (resource === "personal-api-keys") {
    if (method === "DELETE") return typeof resourceId === "string" && /^uak_[a-f0-9]{32}$/.test(resourceId);
    return (method === "GET" || method === "POST") && !resourceId;
  }
  if (resourceId) return false;
  return method === "GET" || method === "DELETE";
}

export async function issueWalletRequestChallenge(params: {
  walletAddress: string;
  resource: WalletRequestResource;
  method: string;
  resourceId?: string;
  context?: string;
}): Promise<{ challengeId: string; message: string }> {
  const wallet = normalizeWallet(params.walletAddress);
  const method = params.method.toUpperCase();
  if (!wallet || !isAllowedMethod(params.resource, method, params.resourceId)) {
    throw new Error("Unsupported wallet authorization request.");
  }
  if (params.resource === "personal-api-keys") {
    if (method === "POST" && (!params.context || params.context.length > 1_000)) {
      throw new Error("Key creation details are required for wallet authorization.");
    }
    if (method !== "POST" && params.context !== undefined) {
      throw new Error("Unexpected wallet authorization context.");
    }
  } else if (params.context !== undefined) {
    throw new Error("Unexpected wallet authorization context.");
  }

  const challengeId = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const path = targetPath(params.resource, wallet, params.resourceId);
  const message = [
    "Authorize OrahDEX account access",
    `Wallet: ${wallet}`,
    `Action: ${method} ${path}`,
    ...(params.context ? [`Request: ${params.context}`] : []),
    `Nonce: ${crypto.randomBytes(24).toString("hex")}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    "",
    params.resource === "personal-api-keys"
      ? "This signature authorizes only the displayed API-key management action. It does not approve a blockchain transaction."
      : "This signature only authorizes the displayed read or notification action. It does not approve a transaction.",
  ].join("\n");
  const value: StoredWalletRequestChallenge = {
    wallet, resource: params.resource, method, path, context: params.context, message, expiresAt,
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
  resourceId?: string;
  context?: string;
}): Promise<void> {
  if (!params.challengeId || !params.signature) {
    throw new Error("Wallet signature proof is required.");
  }
  const wallet = normalizeWallet(params.walletAddress);
  const method = params.method.toUpperCase();
  if (!isAllowedMethod(params.resource, method, params.resourceId)) {
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
  const expectedPath = targetPath(params.resource, wallet, params.resourceId);
  if (
    stored.expiresAt < Date.now() ||
    stored.wallet !== wallet ||
    stored.resource !== params.resource ||
    stored.method !== method ||
    stored.path !== expectedPath ||
    stored.context !== params.context
  ) {
    throw new Error("Wallet authorization does not match this request.");
  }
  verifyWalletMessageSignature(wallet, stored.message, params.signature);
}
