/**
 * changelly.ts — Changelly API v2 helper
 *
 * Docs: https://api.changelly.com/v2
 *
 * Auth: X-Api-Key header + X-Api-Signature (HMAC-SHA512 of JSON body).
 *
 * Flow:
 *   1. Quote   — POST /getExchangeAmount      (estimate output for given input)
 *   2. Min     — POST /getMinAmount           (pair minimum)
 *   3. Create  — POST /createTransaction      (returns deposit address)
 *   4. Status  — POST /getTransactions        (poll for completion)
 */

import { createHmac } from "crypto";
import { logger } from "./logger.js";

const CHANGELLY_BASE   = "https://api.changelly.com/v2";
const API_KEY          = process.env.CHANGELLY_API_KEY    ?? "";
const API_SECRET       = process.env.CHANGELLY_API_SECRET ?? "";

export function isChangellyConfigured(): boolean {
  return API_KEY.length > 0 && API_SECRET.length > 0;
}

function sign(body: string): string {
  return createHmac("sha512", API_SECRET).update(body).digest("hex");
}

async function changellyRequest(
  endpoint: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  if (!API_KEY || !API_SECRET) {
    return { ok: false, status: 0, data: { error: "CHANGELLY_API_KEY or CHANGELLY_API_SECRET not configured" } };
  }

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id:      "orahdex",
    method:  endpoint,
    params,
  });
  const signature = sign(body);

  try {
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
