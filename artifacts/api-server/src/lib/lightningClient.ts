/**
 * lightningClient.ts — LND REST API client for OrahDEX Lightning Network integration.
 *
 * Endpoints used:
 *   POST /v1/invoices                   - create invoice for deposit
 *   GET  /v1/invoice/:r_hash            - check invoice status
 *   POST /v1/channels/transactions      - send payment
 *   GET  /v1/balance/channels           - check channel balance
 *   GET  /v1/getinfo                    - check node is online
 *
 * Configuration (environment variables):
 *   LND_REST_URL        - e.g. https://localhost:8080
 *   LND_MACAROON        - hex-encoded admin macaroon for auth
 *   LND_TLS_SKIP_VERIFY - "true" to skip TLS cert verification (for self-signed)
 */

import https from "node:https";
import { logger } from "./logger.js";

// ── Config helpers ─────────────────────────────────────────────────────────────

const LND_REST_URL  = process.env.LND_REST_URL?.replace(/\/$/, "") ?? "";
const LND_MACAROON  = process.env.LND_MACAROON ?? "";
const TLS_SKIP = process.env.LND_TLS_SKIP_VERIFY === "true" && process.env.NODE_ENV !== "production";

// ── Public types ───────────────────────────────────────────────────────────────

export interface LightningInvoice {
  paymentRequest: string;  // BOLT-11 invoice string (lnbc...)
  rHash: string;           // hex payment hash (used to track settlement)
  expirySeconds: number;
  amountSat: number;
}

export interface LightningPayment {
  paymentHash: string;
  feeSat: number;
  status: "succeeded" | "failed" | "in_flight";
}

// ── Internal HTTP helper ───────────────────────────────────────────────────────

/**
 * Raw fetch against the LND REST API.
 * Handles the custom TLS agent and Macaroon header injection.
 */
async function lndFetch(
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const { method = "GET", body, timeoutMs = 15_000 } = options;

  const agent = TLS_SKIP
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

  const ctrl    = new AbortController();
  const timer   = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${LND_REST_URL}${path}`, {
      method,
      headers: {
        "Grpc-Metadata-macaroon": LND_MACAROON,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      // @ts-ignore — native fetch in Node 18+ accepts `agent` for https
      dispatcher: undefined,
      ...(agent ? { agent } : {}),
    });

    let json: unknown;
    try { json = await res.json(); } catch { json = null; }

    return { ok: res.ok, status: res.status, body: json };
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Returns true if the required LND env vars are set. */
export function isLndConfigured(): boolean {
  return Boolean(LND_REST_URL && LND_MACAROON);
}

/**
 * Pings the LND node via GET /v1/getinfo.
 * Returns false (never throws) if the node is unreachable or misconfigured.
 */
export async function pingLnd(): Promise<boolean> {
  if (!isLndConfigured()) return false;
  try {
    const result = await lndFetch("/v1/getinfo", { timeoutMs: 5_000 });
    return result.ok;
  } catch (err: any) {
    logger.debug({ err: err?.message }, "lightningClient: pingLnd failed");
    return false;
  }
}

/**
 * Creates a BOLT-11 invoice for a Lightning deposit.
 * Throws Error("LND_NOT_CONFIGURED") if LND env vars are absent.
 */
export async function createInvoice(params: {
  amountSat: number;
  memo: string;
  expirySeconds?: number;
}): Promise<LightningInvoice> {
  if (!isLndConfigured()) throw new Error("LND_NOT_CONFIGURED");

  const expiry = params.expirySeconds ?? 3600;

  const result = await lndFetch("/v1/invoices", {
    method: "POST",
    body: {
      value:  params.amountSat,
      memo:   params.memo,
      expiry: expiry,
    },
  });

  if (!result.ok) {
    throw new Error(`LND createInvoice failed (${result.status}): ${JSON.stringify(result.body)}`);
  }

  const data = result.body as {
    payment_request?: string;
    r_hash?: string;          // base64 in some LND versions
    r_hash_str?: string;      // hex in LND REST
  };

  if (!data.payment_request) {
    throw new Error("LND returned no payment_request");
  }

  // LND REST returns r_hash as base64 and r_hash_str as hex
  const rHash = data.r_hash_str
    ? data.r_hash_str
    : Buffer.from(data.r_hash ?? "", "base64").toString("hex");

  return {
    paymentRequest: data.payment_request,
    rHash,
    expirySeconds: expiry,
    amountSat: params.amountSat,
  };
}

/**
 * Checks the settlement status of an invoice by its payment hash (hex).
 */
export async function checkInvoice(rHashHex: string): Promise<{
  settled: boolean;
  amountSat: number;
  settledAt?: number;
}> {
  if (!isLndConfigured()) throw new Error("LND_NOT_CONFIGURED");

  // LND REST uses URL-safe base64 for the r_hash path parameter
  const rHashB64 = Buffer.from(rHashHex, "hex").toString("base64url");
  const result   = await lndFetch(`/v1/invoice/${encodeURIComponent(rHashB64)}`);

  if (!result.ok) {
    throw new Error(`LND checkInvoice failed (${result.status}): ${JSON.stringify(result.body)}`);
  }

  const data = result.body as {
    settled?: boolean;
    value?: string;
    amt_paid_sat?: string;
    settle_date?: string;  // unix timestamp as string
  };

  const amountSat = parseInt(data.amt_paid_sat ?? data.value ?? "0", 10) || 0;
  const settledAt = data.settle_date ? parseInt(data.settle_date, 10) : undefined;

  return {
    settled: data.settled === true,
    amountSat,
    ...(settledAt ? { settledAt } : {}),
  };
}

/**
 * Sends a Lightning payment for a BOLT-11 invoice (used for withdrawals).
 * Throws Error("LND_NOT_CONFIGURED") if LND env vars are absent.
 */
export async function sendPayment(params: {
  paymentRequest: string;
  maxFeeSat?: number;
}): Promise<LightningPayment> {
  if (!isLndConfigured()) throw new Error("LND_NOT_CONFIGURED");

  const maxFee = params.maxFeeSat ?? 100;

  const result = await lndFetch("/v1/channels/transactions", {
    method: "POST",
    body: {
      payment_request: params.paymentRequest,
      fee_limit: { fixed: maxFee },
    },
    timeoutMs: 60_000,  // payments can take up to ~60s to route
  });

  if (!result.ok) {
    throw new Error(`LND sendPayment failed (${result.status}): ${JSON.stringify(result.body)}`);
  }

  const data = result.body as {
    payment_hash?: string;
    payment_route?: { total_fees?: string };
    payment_error?: string;
  };

  if (data.payment_error) {
    throw new Error(`Lightning payment error: ${data.payment_error}`);
  }

  const feeSat = parseInt(data.payment_route?.total_fees ?? "0", 10) || 0;

  return {
    paymentHash: data.payment_hash ?? "",
    feeSat,
    status: "succeeded",
  };
}

/**
 * Returns the local (outbound) and remote (inbound) channel balances in satoshis.
 */
export async function getChannelBalance(): Promise<{ localSat: number; remoteSat: number }> {
  if (!isLndConfigured()) return { localSat: 0, remoteSat: 0 };

  try {
    const result = await lndFetch("/v1/balance/channels", { timeoutMs: 8_000 });

    if (!result.ok) return { localSat: 0, remoteSat: 0 };

    const data = result.body as {
      local_balance?:  { sat?: string };
      remote_balance?: { sat?: string };
      balance?: string;          // older LND versions return a flat "balance" field
    };

    const localSat  = parseInt(data.local_balance?.sat  ?? data.balance ?? "0", 10) || 0;
    const remoteSat = parseInt(data.remote_balance?.sat ?? "0", 10) || 0;

    return { localSat, remoteSat };
  } catch (err: any) {
    logger.debug({ err: err?.message }, "lightningClient: getChannelBalance failed");
    return { localSat: 0, remoteSat: 0 };
  }
}
