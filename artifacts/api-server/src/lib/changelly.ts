/**
 * changelly.ts — Changelly API v2 helper
 *
 * Docs: https://api.changelly.com/v2 / https://docs.changelly.com
 *
 * Auth: RSA-SHA256 (new key-pair scheme)
 *   X-Api-Key       = SHA256(publicKey) as base64   → CHANGELLY_API_KEY env var
 *   X-Api-Signature = RSA-SHA256 signature of body  → derived from CHANGELLY_PRIVATE_KEY (DER hex)
 *
 * Flow:
 *   1. Quote   — POST /getExchangeAmount      (estimate output for given input)
 *   2. Min     — POST /getMinAmount           (pair minimum)
 *   3. Create  — POST /createTransaction      (returns deposit address)
 *   4. Status  — POST /getTransactions        (poll for completion)
 */

import { createSign, createPrivateKey, createPublicKey, createHash } from "crypto";
import { logger } from "./logger.js";

const CHANGELLY_BASE = "https://api.changelly.com/v2";

// CHANGELLY_API_KEY   = SHA256(publicKey) as base64 — shared with Changelly at registration
// CHANGELLY_PRIVATE_KEY = RSA private key in PKCS#8 DER format, hex-encoded — never shared
const API_KEY         = process.env.CHANGELLY_API_KEY     ?? "";
const PRIVATE_KEY_HEX = process.env.CHANGELLY_PRIVATE_KEY ?? "";

export function isChangellyConfigured(): boolean {
  return API_KEY.length > 0 && PRIVATE_KEY_HEX.length > 0;
}

/**
 * Sign a request body with the RSA private key using SHA256 (per Changelly docs).
 * Returns the base64-encoded signature.
 */
function signBody(body: string): string {
  const privateKey = createPrivateKey({
    key:    Buffer.from(PRIVATE_KEY_HEX, "hex"),
    format: "der",
    type:   "pkcs8",
  });
  return createSign("sha256").update(Buffer.from(body)).sign(privateKey, "base64");
}

async function changellyRequest(
  endpoint: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  if (!API_KEY || !PRIVATE_KEY_HEX) {
    return { ok: false, status: 0, data: { error: "CHANGELLY_API_KEY or CHANGELLY_PRIVATE_KEY not configured" } };
  }

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id:      "orahdex",
    method:  endpoint,
    params,
  });

  try {
    const signature = signBody(body);
    const res = await fetch(CHANGELLY_BASE, {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "X-Api-Key":       API_KEY,
        "X-Api-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    let data: unknown = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.message ?? "network error" } };
  }
}

/** Extract result from JSON-RPC response envelope. */
function extractResult(data: unknown): unknown | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.error) return null; // JSON-RPC error
  return d.result ?? null;
}

export interface ChangellyQuoteResult {
  estimatedAmount: number;
  minAmount:       number | null;
}

/**
 * Get minimum exchange amount for a pair.
 */
export async function getChangellyMinAmount(
  from: string,
  to: string,
): Promise<number | null> {
  try {
    const { ok, data } = await changellyRequest("getMinAmount", {
      from: from.toLowerCase(),
      to:   to.toLowerCase(),
    });
    if (!ok) return null;
    const result = extractResult(data);
    if (result == null) return null;
    const min = parseFloat(String(result)) || 0;
    return min > 0 ? min : null;
  } catch {
    return null;
  }
}

/**
 * Get a quote: how much `to` coin do we receive for `amount` of `from`.
 */
export async function quoteFromChangelly(
  from: string,
  to: string,
  amount: number,
): Promise<ChangellyQuoteResult | null> {
  try {
    const [minResult, quoteResult] = await Promise.all([
      getChangellyMinAmount(from, to),
      changellyRequest("getExchangeAmount", {
        from:   from.toLowerCase(),
        to:     to.toLowerCase(),
        amount: String(amount),
      }),
    ]);

    const { ok, data } = quoteResult;
    if (!ok) return null;
    const result = extractResult(data);
    if (result == null) return null;

    // result may be a string (amount) or array of objects
    let estimated = 0;
    if (typeof result === "string" || typeof result === "number") {
      estimated = parseFloat(String(result)) || 0;
    } else if (Array.isArray(result) && result.length > 0) {
      const r = result[0] as Record<string, unknown>;
      estimated = parseFloat(String(r.result ?? r.amount ?? "")) || 0;
    }

    if (estimated <= 0) return null;

    return {
      estimatedAmount: estimated,
      minAmount:       minResult,
    };
  } catch (err) {
    logger.warn({ err }, "Changelly: quoteFromChangelly failed");
    return null;
  }
}

export interface ChangellyExchange {
  id:             string;
  depositAddress: string;
  depositExtraId: string | null;
  estimatedAmount: string | null;
}

/**
 * Create a transaction. Returns the deposit address for the user to send to.
 */
export async function createChangellyExchange(args: {
  from:            string;
  to:              string;
  amount:          number;
  address:         string;
  extraId?:        string;
  refundAddress?:  string;
}): Promise<{ ok: true; exchange: ChangellyExchange } | { ok: false; error: string }> {
  const params: Record<string, unknown> = {
    from:    args.from.toLowerCase(),
    to:      args.to.toLowerCase(),
    amount:  String(args.amount),
    address: args.address.trim(),
  };
  if (args.extraId)       params["extraId"]       = args.extraId;
  if (args.refundAddress) params["refundAddress"]  = args.refundAddress;

  const { ok, status, data } = await changellyRequest("createTransaction", params);
  if (!ok) {
    const d = data as Record<string, unknown> | null;
    const errObj = (d as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
    const msg = (errObj?.message as string) ?? `Changelly HTTP ${status}`;
    logger.error({ msg, from: args.from, to: args.to }, "Changelly: createChangellyExchange failed");
    return { ok: false, error: msg };
  }

  const result = extractResult(data);
  if (!result || typeof result !== "object") {
    return { ok: false, error: "Changelly response missing result" };
  }

  const r = result as Record<string, unknown>;
  const id = String(r.id ?? "");
  const depositAddress = String(r.payinAddress ?? "");
  if (!id || !depositAddress) {
    return { ok: false, error: "Changelly response missing id or payinAddress" };
  }

  return {
    ok: true,
    exchange: {
      id,
      depositAddress,
      depositExtraId:  r.payinExtraId   ? String(r.payinExtraId)  : null,
      estimatedAmount: r.amountExpectedTo ? String(r.amountExpectedTo) : null,
    },
  };
}

export async function getChangellyExchange(id: string): Promise<{
  status: string;
  txTo:   string | null;
} | null> {
  const { ok, data } = await changellyRequest("getTransactions", { id });
  if (!ok) return null;
  const result = extractResult(data);
  if (!Array.isArray(result) || result.length === 0) return null;
  const r = result[0] as Record<string, unknown>;
  return {
    status: String(r.status ?? ""),
    txTo:   r.payoutHash ? String(r.payoutHash) : null,
  };
}
