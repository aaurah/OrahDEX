/**
 * swapzone.ts — Swapzone API helper
 *
 * Docs: https://documenter.getpostman.com/view/16362858/UVXokDS6
 *
 * Swapzone is a meta-aggregator that combines 15+ instant-swap providers
 * (ChangeNOW, Changelly, GoDex, Exolix, SideShift, StealthEx, etc.) behind
 * one API key. It provides access to exchanges OrahDEX doesn't connect to
 * directly, so it can win when none of the primary venues have a good rate.
 *
 * Flow:
 *   1. Quote   — GET /exchange/get-rate  (returns array of routes sorted by rate)
 *   2. Create  — POST /exchange/create-transaction  (returns deposit address)
 *   3. Status  — GET /exchange/get-status?id=  (poll for completion)
 *   4. Coins   — GET /exchange/get-currencies  (full coin list for pair sync)
 *
 * Auth: x-api-key header
 * Sign-up: https://swapzone.io/partners/sign-up
 */

import { logger } from "./logger.js";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const SZ_BASE = "https://api.swapzone.io/v1";

// ─── API key resolution: env var → DB (with 60 s cache) ────────────────────
let _cachedKey: string | null = null;
let _cacheExpiry = 0;

async function getApiKey(): Promise<string> {
  const envKey = process.env.SWAPZONE_API_KEY ?? "";
  if (envKey) return envKey;

  const now = Date.now();
  if (_cachedKey !== null && now < _cacheExpiry) return _cachedKey ?? "";

  try {
    const rows = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "swapzone_api_key"));
    _cachedKey  = rows[0]?.value ?? "";
    _cacheExpiry = now + 60_000;
    return _cachedKey ?? "";
  } catch {
    return "";
  }
}

export async function isSwapzoneConfigured(): Promise<boolean> {
  return (await getApiKey()).length > 0;
}

export function invalidateSzKeyCache(): void {
  _cachedKey   = null;
  _cacheExpiry = 0;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function szRequest(
  path:    string,
  method:  "GET" | "POST" = "GET",
  body?:   unknown,
  params?: Record<string, string | number | boolean>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, data: { error: "SWAPZONE_API_KEY not configured" } };
  }

  let url = `${SZ_BASE}${path}`;

  // SSRF guard
  if (!url.startsWith(SZ_BASE + "/")) {
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
        "Content-Type": "application/json",
        "x-api-key":    apiKey,
      },
      body:   method === "POST" && body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    let data: unknown = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.message ?? "network error" } };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SzRoute {
  rateId:        string;
  fromAmount:    number;
  toAmount:      number;
  exchangerName: string;
  minAmount:     number;
  maxAmount:     number | null;
  duration:      string | null;
  fixed:         boolean;
}

export interface SzQuoteResult {
  estimatedAmount: number;
  minAmount:       number | null;
  maxAmount:       number | null;
  rateId:          string;
  exchangerName:   string;
  routes:          SzRoute[];
}

export interface SzExchange {
  id:              string;
  depositAddress:  string;
  depositExtraId:  string | null;
  estimatedAmount: string | null;
  exchangerName:   string | null;
}

export interface SzCurrency {
  name:          string;
  ticker:        string;
  image:         string | null;
  network:       string | null;
  hasExternalId: boolean;
}

// ─── Quote ────────────────────────────────────────────────────────────────────

/**
 * Fetch all available routes for a pair and return the one with the highest
 * estimated output. The `rateId` from this best route must be passed to
 * createSzTransaction() within the validity window (usually ~60 s).
 */
export async function quoteFromSZ(
  from:   string,
  to:     string,
  amount: number,
  fixed   = false,
): Promise<SzQuoteResult | null> {
  try {
    const { ok, data } = await szRequest("/exchange/get-rate", "GET", undefined, {
      from:      from.toLowerCase(),
      to:        to.toLowerCase(),
      amount,
      fixed,
      available: true,
    });

    if (!ok || !data || typeof data !== "object") return null;

    const d = data as Record<string, unknown>;

    // Swapzone returns either { routes: [...] } or (error) { error: '...' }
    const rawRoutes = Array.isArray(d["routes"])
      ? (d["routes"] as unknown[])
      : Array.isArray(d)
        ? (d as unknown[])
        : [];

    if (rawRoutes.length === 0) return null;

    // Parse and filter valid routes
    const routes: SzRoute[] = rawRoutes
      .map((r: any) => ({
        rateId:        String(r.rateId   ?? r.id   ?? ""),
        fromAmount:    parseFloat(String(r.fromAmount ?? r.amountFrom ?? amount)) || 0,
        toAmount:      parseFloat(String(r.toAmount   ?? r.amountTo   ?? ""))     || 0,
        exchangerName: String(r.exchangerName ?? r.exchanger ?? ""),
        minAmount:     parseFloat(String(r.minAmount ?? r.min ?? "0"))  || 0,
        maxAmount:     r.maxAmount != null ? parseFloat(String(r.maxAmount)) || null : null,
        duration:      r.duration ? String(r.duration) : null,
        fixed:         Boolean(r.fixed),
      }))
      .filter(r => r.rateId && r.toAmount > 0);

    if (routes.length === 0) return null;

    // Pick the route with the highest output
    routes.sort((a, b) => b.toAmount - a.toAmount);
    const best = routes[0]!;

    return {
      estimatedAmount: best.toAmount,
      minAmount:       best.minAmount > 0 ? best.minAmount : null,
      maxAmount:       best.maxAmount,
      rateId:          best.rateId,
      exchangerName:   best.exchangerName,
      routes,
    };
  } catch (err) {
    logger.warn({ err }, "Swapzone: quoteFromSZ failed");
    return null;
  }
}

// ─── Create transaction ───────────────────────────────────────────────────────

/**
 * Create a Swapzone exchange transaction.
 * rateId must come from a recent quoteFromSZ() call (expires ~60 s).
 */
export async function createSzTransaction(args: {
  from:             string;
  to:               string;
  amount:           number;
  rateId:           string;
  addressReceive:   string;
  addressRefund:    string;
  extraIdReceive?:  string;
  extraIdRefund?:   string;
}): Promise<{ ok: true; exchange: SzExchange } | { ok: false; error: string }> {
  const body: Record<string, unknown> = {
    from:            args.from.toLowerCase(),
    to:              args.to.toLowerCase(),
    amount:          args.amount,
    rateId:          args.rateId,
    addressReceive:  args.addressReceive.trim(),
    addressRefund:   args.addressRefund.trim(),
  };
  if (args.extraIdReceive) body["extraIdReceive"] = args.extraIdReceive;
  if (args.extraIdRefund)  body["extraIdRefund"]  = args.extraIdRefund;

  const { ok, status, data } = await szRequest("/exchange/create-transaction", "POST", body);

  if (!ok || !data || typeof data !== "object") {
    const d = data as Record<string, unknown> | null;
    const msg = (d?.["message"] as string) ?? (d?.["error"] as string) ?? `Swapzone HTTP ${status}`;
    logger.error({ msg, from: args.from, to: args.to }, "Swapzone: createSzTransaction failed");
    return { ok: false, error: msg };
  }

  // Response may be nested under "transaction" or at root
  const d = data as Record<string, unknown>;
  const tx = (typeof d["transaction"] === "object" && d["transaction"] !== null)
    ? (d["transaction"] as Record<string, unknown>)
    : d;

  const id             = String(tx["id"] ?? "");
  const depositAddress = String(tx["addressDeposit"] ?? tx["depositAddress"] ?? "");

  if (!id || !depositAddress) {
    return { ok: false, error: "Swapzone response missing id or deposit address" };
  }

  return {
    ok: true,
    exchange: {
      id,
      depositAddress,
      depositExtraId:  tx["extraIdDeposit"]   ? String(tx["extraIdDeposit"])  : null,
      estimatedAmount: tx["amountEstimated"]   ? String(tx["amountEstimated"]) : null,
      exchangerName:   tx["exchangerName"]     ? String(tx["exchangerName"])   : null,
    },
  };
}

// ─── Transaction status ───────────────────────────────────────────────────────

export async function getSzTransactionStatus(id: string): Promise<{
  status: string;
  txTo:   string | null;
} | null> {
  const safeId = id.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(safeId)) return null;

  const { ok, data } = await szRequest("/exchange/get-status", "GET", undefined, {
    id: safeId,
  });
  if (!ok || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    status: String(d["status"] ?? ""),
    txTo:   d["hashOut"] ? String(d["hashOut"]) : null,
  };
}

// ─── Currency list (for pair sync) ───────────────────────────────────────────

/**
 * Fetch all currencies supported by Swapzone.
 * Used by the background pair-sync worker to populate the markets DB.
 */
export async function fetchSzCurrencies(): Promise<SzCurrency[]> {
  try {
    const { ok, data } = await szRequest("/exchange/get-currencies");
    if (!ok || !Array.isArray(data)) return [];
    return (data as any[]).map((c: any) => ({
      name:          String(c.name    ?? ""),
      ticker:        String(c.ticker  ?? "").toLowerCase(),
      image:         c.image  ? String(c.image)   : null,
      network:       c.network ? String(c.network) : null,
      hasExternalId: Boolean(c.hasExternalId),
    }));
  } catch (err) {
    logger.warn({ err }, "Swapzone: fetchSzCurrencies failed");
    return [];
  }
}
