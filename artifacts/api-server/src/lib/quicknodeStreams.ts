/**
 * quicknodeStreams.ts — QuickNode Streams integration for OrahDEX
 *
 * Provides:
 *   - HMAC-SHA256 signature verification for incoming stream webhook events
 *   - REST API client for creating, listing, and deleting QuickNode Streams
 *   - Event topic constants derived from on-chain ABI signatures
 *   - Stream payload type definitions
 *
 * QuickNode Streams push real-time on-chain log events to our webhook endpoint
 * (/api/webhooks/quicknode), replacing the 30-90 second polling loops in
 * evmHtlc.ts and evmDepositWatcher.ts with sub-second event detection.
 *
 * Architecture:
 *   Chain event fires
 *     → QN pushes POST to /api/webhooks/quicknode (HMAC-signed)
 *     → verifyQuickNodeSignature() validates the payload
 *     → event router calls the appropriate handler
 *     → HTLC sessions update immediately; reveal() fires without waiting for poll
 */

import crypto from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { logger } from "./logger.js";

// ── QuickNode REST API base ───────────────────────────────────────────────────

const QN_STREAMS_API = "https://api.quicknode.com/streams/rest/v1/streams";

/** Header QuickNode uses to deliver the HMAC-SHA256 payload signature. */
export const QN_SIG_HEADER = "x-qn-signature";

// ── Watched contract addresses ────────────────────────────────────────────────
// Both OrahDEXHTLC and OrahDEXEscrow share the same deployer address on each chain.

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

/** A single EVM log entry as delivered by QuickNode Streams. */
export interface QNStreamLog {
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

/** Top-level body sent by QuickNode Streams to our webhook. */
export interface QNStreamPayload {
  /** Block-level context (present when dataset includes block headers). */
  blockNumber?: string | number;
  blockHash?:   string;
  network?:     string;
  /** Log entries matched by the stream filter. */
  data?:        QNStreamLog[];
  /** Some stream configurations deliver logs at the top level as an array. */
  streamData?:  QNStreamLog[];
}

/**
 * Normalise the raw webhook body into a flat list of log objects.
 * QuickNode Streams can deliver:
 *   (a) { data: [...logs] }
 *   (b) { streamData: [...logs] }
 *   (c) [...logs]  (bare array)
 */
export function extractLogs(raw: unknown): QNStreamLog[] {
  if (Array.isArray(raw)) return raw as QNStreamLog[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj["data"]))       return obj["data"]       as QNStreamLog[];
    if (Array.isArray(obj["streamData"])) return obj["streamData"] as QNStreamLog[];
  }
  return [];
}

// ── HMAC signature verification ───────────────────────────────────────────────

/**
 * Verify the QuickNode HMAC-SHA256 webhook signature.
 *
 * @param rawBody   The unparsed request body Buffer (must be captured before
 *                  express.json() parses it — register this route with
 *                  express.raw({ type: "*\/*" }) upstream of body parsers).
 * @param signature The value of the `x-qn-signature` header.
 *                  QuickNode format: "sha256=<lowercase_hex_digest>".
 * @param secret    The stream secret set when the stream was created.
 * @returns true if the signature is valid; false otherwise.
 */
export function verifyQuickNodeSignature(
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

// ── QuickNode Streams REST API client ─────────────────────────────────────────

export interface CreateStreamParams {
  /** Human-readable name shown in the QuickNode dashboard. */
  name:         string;
  /** Network identifier, e.g. "ethereum-mainnet". */
  network:      string;
  /** Dataset to stream: "logs" recommended for event-based filtering. */
  dataset:      string;
  /**
   * JavaScript filter function source (NOT base64 — this function handles
   * encoding automatically). The function must be named `main(data)` and
   * return true/false. `data.streamData` is an array of log objects.
   */
  filterFn:     string;
  /** Publicly reachable URL for QuickNode to POST events to. */
  destinationUrl: string;
  /**
   * Optional HMAC secret. When provided QuickNode signs each POST body
   * with HMAC-SHA256 and includes the digest in `x-qn-signature`.
   * Store this in the QUICKNODE_WEBHOOK_SECRET env var.
   */
  webhookSecret?: string;
  /** Number of past blocks to replay on stream creation (0 = from now). */
  startBlock?:  number;
}

export interface QNStream {
  id:         string;
  name:       string;
  network:    string;
  dataset:    string;
  status:     string;
  destination_url: string;
  created_at: string;
  updated_at: string;
}

function qnHeaders(): Record<string, string> {
  const key = process.env.QUICKNODE_API_KEY;
  if (!key) throw new Error("QUICKNODE_API_KEY env var is not set");
  return { "Content-Type": "application/json", "x-api-key": key };
}

/** Create a new QuickNode Stream and return the created stream object. */
export async function createQuickNodeStream(p: CreateStreamParams): Promise<QNStream> {
  const filterB64 = Buffer.from(p.filterFn, "utf8").toString("base64");

  const body: Record<string, unknown> = {
    name:            p.name,
    network:         p.network,
    dataset:         p.dataset,
    filter_function: filterB64,
    status:          "active",
    destination:     "webhook",
    destination_attributes: {
      url:              p.destinationUrl,
      compression:      "none",
      headers:          {},
      max_retry:        3,
      retry_interval_sec: 1,
      post_timeout_sec: 10,
      ...(p.webhookSecret ? { secret: p.webhookSecret } : {}),
    },
    fix_block_reorgs: 0,
    batch_size:       1,
    ...(p.startBlock != null ? { start_range: p.startBlock } : {}),
  };

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);

  try {
    const res = await fetch(QN_STREAMS_API, {
      method:  "POST",
      headers: qnHeaders(),
      body:    JSON.stringify(body),
      signal:  ctrl.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`QuickNode Streams API ${res.status}: ${text}`);
    }
    return JSON.parse(text) as QNStream;
  } finally {
    clearTimeout(timer);
  }
}

/** List all QuickNode Streams for this account. */
export async function listQuickNodeStreams(): Promise<QNStream[]> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(QN_STREAMS_API, {
      headers: qnHeaders(),
      signal:  ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`QuickNode Streams list ${res.status}`);
    const json = await res.json() as { data?: QNStream[] } | QNStream[];
    return Array.isArray(json)
      ? json
      : ((json as { data?: QNStream[] }).data ?? []);
  } finally {
    clearTimeout(timer);
  }
}

/** Delete a QuickNode Stream by ID. */
export async function deleteQuickNodeStream(streamId: string): Promise<void> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${QN_STREAMS_API}/${streamId}`, {
      method:  "DELETE",
      headers: qnHeaders(),
      signal:  ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok && res.status !== 404) {
      throw new Error(`QuickNode Streams delete ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Activate or pause an existing stream. */
export async function setQuickNodeStreamStatus(
  streamId: string,
  status:   "active" | "paused",
): Promise<void> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${QN_STREAMS_API}/${streamId}`, {
      method:  "PATCH",
      headers: qnHeaders(),
      body:    JSON.stringify({ status }),
      signal:  ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`QuickNode Streams patch ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

// ── Filter function builder ────────────────────────────────────────────────────

/**
 * Build the QuickNode filter function JS source for the given contract addresses.
 * The function is passed `data` where `data.streamData` is an array of EVM log objects.
 * Returns true only for logs emitted by one of our contracts, cutting noise.
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

// ── Log convenience ───────────────────────────────────────────────────────────

export function logTopics(): void {
  logger.info(
    {
      TOPIC_HTLC_LOCKED,
      TOPIC_HTLC_REVEALED,
      TOPIC_HTLC_REFUNDED,
      TOPIC_ESCROW_RELEASED,
      watched: WATCHED_CONTRACTS,
    },
    "quicknodeStreams: event topics",
  );
}
