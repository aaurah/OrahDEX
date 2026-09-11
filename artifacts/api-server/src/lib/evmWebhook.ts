/**
 * evmWebhook.ts — Provider-agnostic EVM webhook integration for OrahDEX
 *
 * Provides:
 *   - HMAC-SHA256 signature verification for incoming webhook events
 *   - Event topic constants derived from on-chain ABI signatures
 *   - Webhook payload type definitions and log extraction helpers
 *
 * This module is provider-agnostic: it works with any service that pushes
 * EVM log events via HTTP webhook (Alchemy, Infura, Tenderly, a self-hosted
 * node proxy, or any custom relay).
 *
 * Architecture:
 *   Chain event fires
 *     → Provider POSTs to /api/webhooks/evm (HMAC-signed, optional)
 *     → verifyWebhookSignature() validates the payload
 *     → event router calls the appropriate handler
 *     → HTLC sessions update immediately; reveal() fires without polling delay
 *
 * RPC configuration is driven entirely by environment variables:
 *   ETH_RPC_URL, ETH_WS_URL, BASE_RPC_URL, ARB_RPC_URL, etc.
 *   EVM_WEBHOOK_SECRET — shared secret for HMAC-SHA256 payload signing
 */

import crypto from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { logger } from "./logger.js";

// ── Watched contract addresses ────────────────────────────────────────────────

export const WATCHED_CONTRACTS: string[] = [
  "0xee234ceb85697b64800e696699b7841e00413b4f", // ETH mainnet — HTLC + Escrow
  "0x4deb6023abd9e1c640ada35201be8ff591d21cf2", // Sepolia testnet — Escrow
];

// ── Event topic hashes ────────────────────────────────────────────────────────
// keccak256(ABI event signature string) = EVM topic[0]

function eventTopic(sig: string): string {
  const hash = keccak_256(Buffer.from(sig, "utf8"));
  return "0x" + Buffer.from(hash).toString("hex");
}

/** Locked(bytes32,address,address,address,uint256,bytes32,uint256) */
export const TOPIC_HTLC_LOCKED = eventTopic(
  "Locked(bytes32,address,address,address,uint256,bytes32,uint256)"
);
/** Revealed(bytes32,bytes32,address,uint256) */
export const TOPIC_HTLC_REVEALED = eventTopic(
  "Revealed(bytes32,bytes32,address,uint256)"
);
/** Refunded(bytes32,address,uint256) */
export const TOPIC_HTLC_REFUNDED = eventTopic(
  "Refunded(bytes32,address,uint256)"
);
/** OrderReleased(bytes32,address,address,uint256) */
export const TOPIC_ESCROW_RELEASED = eventTopic(
  "OrderReleased(bytes32,address,address,uint256)"
);

// ── Payload types ─────────────────────────────────────────────────────────────

/** A single EVM log entry as delivered by a webhook provider. */
export interface EvmWebhookLog {
  address:          string;
  topics:           string[];
  data:             string;
  blockNumber:      string | number;
  blockHash:        string;
  transactionHash:  string;
  transactionIndex: string | number;
  logIndex:         string | number;
  removed?:         boolean;
}

/** Top-level body sent by an EVM webhook provider. */
export interface EvmWebhookPayload {
  blockNumber?: string | number;
  blockHash?:   string;
  network?:     string;
  /** Log entries matched by the stream filter (common format). */
  data?:        EvmWebhookLog[];
  /** Alternate field name used by some providers. */
  streamData?:  EvmWebhookLog[];
  /** Alchemy webhook format wraps logs inside event.activity */
  event?:       { activity?: EvmWebhookLog[] };
}

/**
 * Normalise the raw webhook body into a flat list of log objects.
 * Handles multiple provider payload shapes:
 *   (a) { data: [...logs] }                — standard / QuickNode-compatible
 *   (b) { streamData: [...logs] }          — alternate field name
 *   (c) [...logs]                          — bare array
 *   (d) { event: { activity: [...logs] } } — Alchemy-style
 */
export function extractLogs(raw: unknown): EvmWebhookLog[] {
  if (Array.isArray(raw)) return raw as EvmWebhookLog[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj["data"]))       return obj["data"]       as EvmWebhookLog[];
    if (Array.isArray(obj["streamData"])) return obj["streamData"] as EvmWebhookLog[];
    const event = obj["event"] as Record<string, unknown> | undefined;
    if (event && Array.isArray(event["activity"])) return event["activity"] as EvmWebhookLog[];
  }
  return [];
}

// ── HMAC signature verification ───────────────────────────────────────────────

/**
 * Verify an HMAC-SHA256 webhook signature.
 *
 * Supports two common header formats:
 *   - "sha256=<hex>"   (used by GitHub, QuickNode, many providers)
 *   - "<hex>"          (raw hex, no prefix)
 *
 * The secret is read from EVM_WEBHOOK_SECRET env var (falls back to
 * QUICKNODE_WEBHOOK_SECRET for backwards compatibility during migration).
 *
 * @param rawBody   The unparsed request body Buffer.
 * @param signature The signature header value.
 * @param secret    The shared HMAC secret.
 * @returns true if the signature is valid; false otherwise.
 */
export function verifyWebhookSignature(
  rawBody:   Buffer,
  signature: string,
  secret:    string,
): boolean {
  try {
    const digest = signature.startsWith("sha256=")
      ? signature.slice(7)
      : signature;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (digest.length !== expected.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(digest,   "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * Resolve the webhook HMAC secret from environment variables.
 * Checks EVM_WEBHOOK_SECRET first, then falls back to QUICKNODE_WEBHOOK_SECRET
 * so existing deployments continue to work without reconfiguration.
 */
export function getWebhookSecret(): string | undefined {
  return process.env["EVM_WEBHOOK_SECRET"] ?? process.env["QUICKNODE_WEBHOOK_SECRET"];
}

// ── Filter function builder ───────────────────────────────────────────────────

/**
 * Build a JavaScript filter function for use with webhook-capable providers
 * that support server-side log filtering (e.g., custom relay scripts).
 * The function returns true only for logs from one of our contracts.
 */
export function buildFilterFunction(contractAddresses: string[]): string {
  const lower = contractAddresses.map(a => a.toLowerCase());
  const list  = JSON.stringify(lower);
  return `function main(data) {
  var contracts = ${list};
  var logs = Array.isArray(data) ? data : (data.streamData || data.data || []);
  return logs.some(function(log) {
    return log && log.address && contracts.indexOf(log.address.toLowerCase()) !== -1;
  });
}`;
}

// ── Diagnostic helpers ────────────────────────────────────────────────────────

export function logTopics(): void {
  logger.info(
    {
      TOPIC_HTLC_LOCKED,
      TOPIC_HTLC_REVEALED,
      TOPIC_HTLC_REFUNDED,
      TOPIC_ESCROW_RELEASED,
      watched: WATCHED_CONTRACTS,
    },
    "evmWebhook: event topics",
  );
}

// ── Signature header name ─────────────────────────────────────────────────────

/**
 * The HTTP header used for webhook signature delivery.
 * Configurable via WEBHOOK_SIG_HEADER env var; defaults to x-webhook-signature.
 * Falls back to x-qn-signature for backwards compatibility with existing streams.
 */
export const WEBHOOK_SIG_HEADER = "x-webhook-signature";

/**
 * Returns the list of header names to check for the HMAC signature.
 * Checks x-webhook-signature first, then x-qn-signature (QuickNode compat).
 */
export function resolveSignatureHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const primary = headers["x-webhook-signature"];
  if (primary && typeof primary === "string") return primary;
  const legacy = headers["x-qn-signature"];
  if (legacy && typeof legacy === "string") return legacy;
  return undefined;
}
