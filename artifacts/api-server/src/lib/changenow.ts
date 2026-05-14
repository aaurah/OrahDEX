/**
 * changenow.ts — ChangeNOW API helper
 *
 * Docs: https://documenter.getpostman.com/view/8180765/SVfTPnM8
 *
 * Flow:
 *   1. Quote   — GET /v2/exchange/estimated-amount   (estimate output for given input)
 *   2. Min     — GET /v2/exchange/min-amount          (pair minimum)
 *   3. Create  — POST /v2/exchange                   (returns deposit address)
 *   4. Status  — GET /v2/exchange/{id}               (poll for completion)
 *
 * Auth: x-changenow-api-key header
 */

import { logger } from "./logger.js";

const CN_BASE = "https://api.changenow.io/v2";

function getApiKey(): string {
  return process.env.CHANGENOW_API_KEY ?? "";
}

export function isChangeNowConfigured(): boolean {
  return getApiKey().length > 0;
}

async function cnRequest(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  params?: Record<string, string | number>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, data: { error: "CHANGENOW_API_KEY not configured" } };
  }

  let url = `${CN_BASE}${path}`;

  // SSRF guard: verify the URL stays within the hardcoded API base.
  if (!url.startsWith(CN_BASE + "/")) {
    return { ok: false, status: 0, data: { error: "Invalid request path" } };
  }

  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
    url += `?${qs.toString()}`;
  }

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type":        "application/json",
        "x-changenow-api-key": apiKey,
      },
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

export interface CnQuoteResult {
  estimatedAmount:  number;
  minAmount:        number | null;
  maxAmount:        number | null;
  rateId?:          string;
}

/**
 * Get a quote: how much `to` coin do we get for `amount` of `from` coin.
 * Uses the "standard" (floating-rate) flow.
 */
export async function quoteFromCN(
  from: string,
  to: string,
  amount: number,
): Promise<CnQuoteResult | null> {
  try {
    const { ok, data } = await cnRequest("/exchange/estimated-amount", "GET", undefined, {
      fromCurrency: from.toLowerCase(),
      toCurrency:   to.toLowerCase(),
      fromAmount:   amount,
      type:         "direct",
      flow:         "standard",
    });
    if (!ok || !data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    const estimated = parseFloat(String(d.toAmount ?? d.estimatedAmount ?? "")) || 0;
    if (estimated <= 0) return null;

    return {
      estimatedAmount: estimated,
      minAmount:       d.minAmount != null ? parseFloat(String(d.minAmount)) || null : null,
      maxAmount:       d.maxAmount != null ? parseFloat(String(d.maxAmount)) || null : null,
      rateId:          d.rateId    ? String(d.rateId) : undefined,
    };
  } catch (err) {
    logger.warn({ err }, "ChangeNOW: quoteFromCN failed");
    return null;
  }
}

/**
 * Get minimum exchange amount for a pair.
 */
export async function getCnMinAmount(
  from: string,
  to: string,
): Promise<number | null> {
  try {
    const { ok, data } = await cnRequest("/exchange/min-amount", "GET", undefined, {
      fromCurrency: from.toLowerCase(),
      toCurrency:   to.toLowerCase(),
      flow:         "standard",
    });
    if (!ok || !data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    const min = parseFloat(String(d.minAmount ?? "")) || 0;
    return min > 0 ? min : null;
  } catch {
    return null;
  }
}

export interface CnExchange {
  id:              string;
  depositAddress:  string;
  depositExtraId:  string | null;
  estimatedAmount: string | null;
}

/**
 * Create an exchange order. Returns the deposit address to send funds to.
 */
export async function createCNExchange(args: {
  from:           string;
  to:             string;
  amount:         number;
  address:        string;
  extraId?:       string;
  refundAddress?: string;
  rateId?:        string;
}): Promise<{ ok: true; exchange: CnExchange } | { ok: false; error: string }> {
  const body: Record<string, unknown> = {
    fromCurrency:    args.from.toLowerCase(),
    toCurrency:      args.to.toLowerCase(),
    fromAmount:      args.amount,
    address:         args.address.trim(),
    flow:            "standard",
  };
  if (args.extraId)       body["extraId"]       = args.extraId;
  if (args.refundAddress) body["refundAddress"]  = args.refundAddress;
  if (args.rateId)        body["rateId"]         = args.rateId;

  const { ok, status, data } = await cnRequest("/exchange", "POST", body);
  if (!ok || !data || typeof data !== "object") {
    const d = data as Record<string, unknown> | null;
    const msg = (d?.message as string) ?? (d?.error as string) ?? `ChangeNOW HTTP ${status}`;
    logger.error({ msg, from: args.from, to: args.to }, "ChangeNOW: createCNExchange failed");
    return { ok: false, error: msg };
  }

  const d = data as Record<string, unknown>;
  const id = String(d.id ?? "");
  const depositAddress = String(d.payinAddress ?? d.depositAddress ?? "");
  if (!id || !depositAddress) {
    return { ok: false, error: "ChangeNOW response missing id or depositAddress" };
  }

  return {
    ok: true,
    exchange: {
      id,
      depositAddress,
      depositExtraId:  d.payinExtraId   ? String(d.payinExtraId)  : null,
      estimatedAmount: d.expectedAmountTo ? String(d.expectedAmountTo) : null,
    },
  };
}

export async function getCNExchange(id: string): Promise<{
  status: string;
  txTo:   string | null;
} | null> {
  const { ok, data } = await cnRequest(`/exchange/${id}`);
  if (!ok || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    status: String(d.status ?? ""),
    txTo:   d.payoutHash ? String(d.payoutHash) : null,
  };
}
