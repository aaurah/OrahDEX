/**
 * stealthex.ts — StealthEX API helper (v2)
 *
 * Docs: https://stealthex.io/api/
 * Base: https://api.stealthex.io/api/v2
 *
 * Auth: api_key query parameter on every request.
 *
 * Flow:
 *   1. Range    — GET /range/{from}/{to}?api_key=…      → { min_amount }
 *   2. Quote    — GET /estimate/{from}/{to}?api_key=…&amount=…
 *   3. Create   — POST /exchange?api_key=…              → deposit address
 *   4. Status   — GET /exchange/{id}?api_key=…
 */

import { logger } from "./logger.js";

const SX_BASE = "https://api.stealthex.io/api/v2";
const API_KEY = process.env.STEALTHEX_API_KEY ?? "";

export function isStealthExConfigured(): boolean {
  return API_KEY.length > 0;
}

async function sxRequest(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  extraParams?: Record<string, string | number>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  if (!API_KEY) {
    return { ok: false, status: 0, data: { error: "STEALTHEX_API_KEY not configured" } };
  }

  const qs = new URLSearchParams({ api_key: API_KEY });
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) qs.set(k, String(v));
  }
  const url = `${SX_BASE}${path}?${qs.toString()}`;

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" && body !== undefined ? JSON.stringify(body) : undefined,
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

export interface SxQuoteResult {
  estimatedAmount: number;
  minAmount:       number | null;
}

/**
 * Get minimum exchange amount for a pair.
 * Endpoint: GET /range/{from}/{to} → { min_amount }
 */
export async function getSxMinAmount(
  from: string,
  to: string,
): Promise<number | null> {
  try {
    const { ok, data } = await sxRequest(`/range/${from.toLowerCase()}/${to.toLowerCase()}`);
    if (!ok || !data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    const min = parseFloat(String(d.min_amount ?? "")) || 0;
    return min > 0 ? min : null;
  } catch {
    return null;
  }
}

/**
 * Get a quote: how much `to` coin do we receive for `amount` of `from`.
 * Endpoint: GET /estimate/{from}/{to}?amount={amount}
 */
export async function quoteFromSX(
  from:   string,
  to:     string,
  amount: number,
): Promise<SxQuoteResult | null> {
  try {
    const [minResult, quoteResult] = await Promise.all([
      getSxMinAmount(from, to),
      sxRequest(`/estimate/${from.toLowerCase()}/${to.toLowerCase()}`, "GET", undefined, {
        amount,
      }),
    ]);

    const { ok, data } = quoteResult;
    if (!ok || !data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;

    const estimated = parseFloat(String(d.estimated_amount ?? "")) || 0;
    if (estimated <= 0) return null;

    return {
      estimatedAmount: estimated,
      minAmount:       minResult,
    };
  } catch (err) {
    logger.warn({ err }, "StealthEX: quoteFromSX failed");
    return null;
  }
}

export interface SxExchange {
  id:              string;
  depositAddress:  string;
  depositExtraId:  string | null;
  estimatedAmount: string | null;
}

/**
 * Create an exchange. Returns the deposit address for the user to send to.
 * Endpoint: POST /exchange
 * Body: { currency_from, currency_to, amount_from, address_to, extra_id_to }
 */
export async function createSXExchange(args: {
  from:     string;
  to:       string;
  amount:   number;
  address:  string;
  extraId?: string;
}): Promise<{ ok: true; exchange: SxExchange } | { ok: false; error: string }> {
  const body: Record<string, unknown> = {
    currency_from: args.from.toLowerCase(),
    currency_to:   args.to.toLowerCase(),
    amount_from:   args.amount,
    address_to:    args.address.trim(),
    extra_id_to:   args.extraId ?? "",
  };

  const { ok, status, data } = await sxRequest("/exchange", "POST", body);
  if (!ok || !data || typeof data !== "object") {
    const d = data as Record<string, unknown> | null;
    const errObj = (d as Record<string, unknown>)?.err as Record<string, unknown> | undefined;
    const msg = (errObj?.details as string) ?? (d?.message as string) ?? `StealthEX HTTP ${status}`;
    logger.error({ msg, from: args.from, to: args.to }, "StealthEX: createSXExchange failed");
    return { ok: false, error: msg };
  }

  const d = data as Record<string, unknown>;
  const id = String(d.id ?? "");
  const depositAddress = String(d.address_from ?? "");
  if (!id || !depositAddress) {
    return { ok: false, error: "StealthEX response missing id or address_from" };
  }

  return {
    ok: true,
    exchange: {
      id,
      depositAddress,
      depositExtraId:  d.extra_id_from ? String(d.extra_id_from) : null,
      estimatedAmount: d.amount_to     ? String(d.amount_to)     : null,
    },
  };
}

export async function getSXExchange(id: string): Promise<{
  status: string;
  txTo:   string | null;
} | null> {
  const { ok, data } = await sxRequest(`/exchange/${id}`);
  if (!ok || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    status: String(d.status ?? ""),
    txTo:   d.tx_to ? String(d.tx_to) : null,
  };
}
