/**
 * orderIntent.ts — Wallet-side OrderIntent builder
 *
 * Mirrors the canonical OrderIntent contract from the server.
 * The wallet builds an intent, the server verifies it.
 *
 * Usage:
 *
 *   import { buildOrderIntent, canonicalIntentPayload } from "@/lib/orderIntent";
 *
 *   const intent = buildOrderIntent({
 *     pair:          "BSV/USDT",
 *     side:          "buy",
 *     type:          "LIMIT",
 *     price:         "62.50",
 *     amount:        "1.5",
 *     walletAddress: "0xabc…",
 *   });
 *
 *   // Sign with MetaMask:
 *   const payload   = canonicalIntentPayload(intent);
 *   const signature = await window.ethereum.request({
 *     method: "personal_sign",
 *     params: [payload, walletAddress],
 *   });
 *
 *   // Submit to server:
 *   await fetch("/api/orders", {
 *     method: "POST",
 *     body: JSON.stringify({ ...intent, signature, fundingRef: "" }),
 *   });
 *   // The server computes and attaches the fundingRef after locking funds.
 */


// ── Types ─────────────────────────────────────────────────────────────────────

export type OrderSide = "buy" | "sell";
/** SPOT for market/limit orders drawn from the spot balance bucket. FUTURES for perpetual positions drawn from the futures margin bucket. */
export type OrderKind = "SPOT" | "FUTURES";
/** The execution style within the kind. */
export type OrderType = "MARKET" | "LIMIT";

/**
 * Canonical OrderIntent — what the wallet produces and the server consumes.
 *
 * The wallet builds everything except `fundingRef` (which the server populates
 * after locking funds) and `signature` (which requires the wallet's private key).
 */
export interface OrderIntent {
  /** "BSV/USDT" — always BASE/QUOTE */
  pair:          string;
  /** SPOT (market/limit, uses spot balance bucket) or FUTURES (uses futures margin bucket) */
  kind:          OrderKind;
  side:          OrderSide;
  /** MARKET or LIMIT — the execution style within the kind */
  type:          OrderType;
  /** Required for LIMIT; omit for MARKET */
  price?:        string;
  /** Base-asset quantity as a positive decimal string */
  amount:        string;
  /**
   * Unix SECONDS — server rejects intents received after this timestamp.
   * Build with: Math.floor(Date.now() / 1000) + 300  (= 5 minutes)
   */
  expiry:        number;
  /** UUID v4 one-time token — replay prevention */
  nonce:         string;
  walletAddress: string;
  /**
   * Verifiable proof of committed funds.
   * Populated by the server after locking; wallet sends "" or omits.
   * "ledger:..." → spot bucket | "margin:..." → futures bucket
   */
  fundingRef?:   string;
  /**
   * EVM personal_sign over canonicalIntentPayload().
   * Optional but strongly recommended for external wallets.
   */
  signature?:    string;
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Build a fresh OrderIntent with a new nonce and default expiry.
 * The wallet calls this immediately before submitting the order.
 */
export function buildOrderIntent(params: {
  pair:          string;
  kind:          OrderKind;
  side:          OrderSide;
  type:          OrderType;
  price?:        string;
  amount:        string;
  walletAddress: string;
  /** TTL in seconds (default: 300 = 5 minutes) */
  ttlSec?:       number;
}): Omit<OrderIntent, "fundingRef" | "signature"> {
  const { pair, kind, side, type, price, amount, walletAddress, ttlSec = 300 } = params;
  return {
    pair,
    kind,
    side,
    type,
    price,
    amount,
    walletAddress: walletAddress.toLowerCase(),
    // expiry in unix SECONDS (not ms) — matches server contract
    expiry: Math.floor(Date.now() / 1000) + ttlSec,
    nonce:  crypto.randomUUID(),
  };
}

// ── Canonical payload (matches server implementation) ─────────────────────────

/**
 * Produce the deterministic string that the wallet signs.
 * Keys are sorted so the payload is stable regardless of insertion order.
 * This must match canonicalIntentPayload() in the server orderIntent.ts.
 */
export function canonicalIntentPayload(
  intent: Omit<OrderIntent, "signature" | "fundingRef">,
): string {
  const fields: Record<string, string | number | undefined> = {
    amount:        intent.amount,
    expiry:        intent.expiry,
    nonce:         intent.nonce,
    pair:          intent.pair,
    price:         intent.price,
    side:          intent.side,
    type:          intent.type,
    walletAddress: intent.walletAddress,
  };
  const sorted = Object.keys(fields).sort().reduce<Record<string, unknown>>((acc, k) => {
    if (fields[k] !== undefined) acc[k] = fields[k];
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

// ── Client-side validation (fast, no network) ─────────────────────────────────

export interface ClientValidation {
  valid:  boolean;
  errors: string[];
}

export function validateOrderIntentClient(intent: Partial<OrderIntent>): ClientValidation {
  const errors: string[] = [];

  if (!intent.pair || !intent.pair.includes("/")) errors.push("pair must be BASE/QUOTE");
  if (intent.side !== "buy" && intent.side !== "sell") errors.push("side must be buy or sell");
  if (!["MARKET", "LIMIT", "FUTURES"].includes(intent.type ?? "")) errors.push("type must be MARKET, LIMIT, or FUTURES");

  const amount = parseFloat(intent.amount ?? "0");
  if (!isFinite(amount) || amount <= 0) errors.push("amount must be a positive number");

  if (intent.type === "LIMIT" && !intent.price) errors.push("price is required for LIMIT orders");
  if (intent.type === "FUTURES" && !intent.price) errors.push("price (entry) is required for FUTURES orders");
  if (intent.price !== undefined) {
    const p = parseFloat(intent.price);
    if (!isFinite(p) || p <= 0) errors.push("price must be a positive number");
  }

  if (!intent.walletAddress) errors.push("walletAddress is required");
  if (!intent.nonce)         errors.push("nonce is required");
  if (intent.expiry && intent.expiry < Date.now()) errors.push("intent has expired — build a new one");

  return { valid: errors.length === 0, errors };
}

// ── Balance bucket display helpers ────────────────────────────────────────────

export type BalanceBucket = "spot" | "futures-margin";

/**
 * Returns which balance bucket an order type draws from.
 * Use this in UI to show the correct "available" balance to the user.
 */
export function balanceBucketFor(type: OrderType): BalanceBucket {
  return type === "FUTURES" ? "futures-margin" : "spot";
}

/**
 * Format a balance bucket label for display.
 */
export function bucketLabel(bucket: BalanceBucket): string {
  return bucket === "spot" ? "Spot Balance" : "Futures Margin";
}
