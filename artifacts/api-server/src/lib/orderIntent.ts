/**
 * orderIntent.ts — Canonical OrderIntent type + server-side validation
 *
 * OrderIntent is the single, authoritative contract for every order that
 * enters the OrahDEX matching engine.  Both the wallet (front-end) and the
 * server speak this type; the server never accepts an order whose intent
 * cannot be fully reconstructed and validated.
 *
 * ── Field contract ────────────────────────────────────────────────────────────
 *
 *   pair          "BSV/USDT" — always BASE/QUOTE
 *   side          "buy" | "sell"
 *   type          "MARKET" | "LIMIT"  (FUTURES is a kind, not a type)
 *   price         required for LIMIT; optional for MARKET (ignored); required for FUTURES (entry)
 *   amount        base-asset quantity (positive decimal string)
 *   expiry        unix-seconds timestamp — reject intent after this time
 *   nonce         UUID v4 — one-time token, stored on order to prevent replay
 *   walletAddress lowercase hex (EVM) or BSV address
 *   fundingRef    verifiable proof of committed funds (see FundingRef semantics below)
 *   signature     optional EVM personal_sign over canonicalIntentPayload()
 *
 * ── FundingRef semantics ──────────────────────────────────────────────────────
 *
 *   "ledger:{walletAddress}:{asset}:{amount}"
 *       Internal API ledger — funds already moved available→locked.
 *       Used for demo / orah wallets.
 *
 *   "evm-sig:{signatureHash}"
 *       EVM personal_sign signature proves authorisation.
 *       The on-chain balance is validated separately via reportedBalance.
 *
 *   "utxo:{txid}:{vout}"
 *       BSV UTXO reference — the output funds this order.
 *       Backend verifies via WhatsOnChain before accepting.
 *
 *   "margin:{walletAddress}:{asset}:{amount}"
 *       Futures margin account (futures_margin_accounts table).
 *       Never drawn from the spot user_balances bucket.
 *
 * ── Invariants ────────────────────────────────────────────────────────────────
 *
 *   1. No order reaches the matching engine without a valid fundingRef.
 *   2. MARKET / LIMIT orders draw from the spot bucket (user_balances).
 *   3. FUTURES orders draw exclusively from futures_margin_accounts.
 *   4. Spot and futures buckets NEVER share rows or cross-contaminate.
 *   5. nonce is globally unique — duplicate nonce → reject (replay guard).
 *   6. intent.expiry < Date.now() → reject (stale intent guard).
 */

import crypto from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrderSide = "buy" | "sell";
/** SPOT covers MARKET and LIMIT orders; FUTURES covers perpetual positions. */
export type OrderKind = "SPOT" | "FUTURES";
/** MARKET executes at the best available price; LIMIT rests in the book. */
export type OrderType = "MARKET" | "LIMIT";

export type WalletSource = "external" | "demo" | "orah";

/**
 * The canonical order intent shared between wallet and server.
 * The wallet builds and signs it; the server validates and routes it.
 */
export interface OrderIntent {
  /** Trading pair in BASE/QUOTE notation, e.g. "BSV/USDT" */
  pair:          string;
  /** SPOT for market/limit orders; FUTURES for perpetual positions */
  kind:          OrderKind;
  side:          OrderSide;
  /** MARKET or LIMIT — the execution style within the kind */
  type:          OrderType;
  /** Required for LIMIT; ignored for MARKET */
  price?:        string;
  /** Base-asset quantity as a positive decimal string */
  amount:        string;
  /**
   * Unix SECONDS — the server rejects intents received after this time.
   * Wallet should set: Math.floor(Date.now() / 1000) + 300  (5 min)
   */
  expiry:        number;
  /** UUID v4 — stored on the order row; duplicate nonce = replay, rejected */
  nonce:         string;
  walletAddress: string;
  /** Verifiable proof of committed funds (see module doc for semantics) */
  fundingRef:    string;
  /** EVM personal_sign over canonicalIntentPayload() — optional but preferred */
  signature?:    string;
}

export interface IntentValidation {
  valid:   boolean;
  error?:  string;
  code?:   string;
}

// ── Canonical payload (deterministic, signable) ───────────────────────────────

/**
 * Produce a deterministic string over the intent's key fields.
 * This is what the wallet signs and what the server verifies.
 * Fields are sorted by key so the output is stable across platforms.
 */
export function canonicalIntentPayload(
  intent: Omit<OrderIntent, "signature" | "fundingRef">,
): string {
  const fields: Record<string, string | number | undefined> = {
    amount:        intent.amount,
    expiry:        intent.expiry,
    kind:          intent.kind,
    nonce:         intent.nonce,
    pair:          intent.pair,
    price:         intent.price,
    side:          intent.side,
    type:          intent.type,
    walletAddress: intent.walletAddress,
  };
  // Sort keys so the payload is stable regardless of insertion order
  const sorted = Object.keys(fields).sort().reduce<Record<string, unknown>>((acc, k) => {
    if (fields[k] !== undefined) acc[k] = fields[k];
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

// ── Server-side structural validation ────────────────────────────────────────

/**
 * Validate an OrderIntent for structural correctness.
 * Does NOT check funding — that is handled by fundingVerifier.ts.
 * Does NOT check nonce uniqueness — that is enforced at DB insert time.
 */
export function validateOrderIntent(intent: Partial<OrderIntent>): IntentValidation {
  if (!intent.pair || !intent.pair.includes("/")) {
    return { valid: false, error: "pair must be BASE/QUOTE (e.g. BSV/USDT)", code: "INVALID_PAIR" };
  }
  if (!["SPOT", "FUTURES"].includes(intent.kind ?? "")) {
    return { valid: false, error: "kind must be SPOT or FUTURES", code: "INVALID_KIND" };
  }
  if (intent.side !== "buy" && intent.side !== "sell") {
    return { valid: false, error: "side must be 'buy' or 'sell'", code: "INVALID_SIDE" };
  }
  if (!["MARKET", "LIMIT"].includes(intent.type ?? "")) {
    return { valid: false, error: "type must be MARKET or LIMIT", code: "INVALID_TYPE" };
  }
  const amount = parseFloat(intent.amount ?? "0");
  if (!isFinite(amount) || amount <= 0) {
    return { valid: false, error: "amount must be a positive number", code: "INVALID_AMOUNT" };
  }
  if (intent.type === "LIMIT" && !intent.price) {
    return { valid: false, error: "price is required for LIMIT orders", code: "PRICE_REQUIRED" };
  }
  if (intent.price !== undefined) {
    const p = parseFloat(intent.price);
    if (!isFinite(p) || p <= 0) {
      return { valid: false, error: "price must be a positive number", code: "INVALID_PRICE" };
    }
  }
  if (!intent.walletAddress) {
    return { valid: false, error: "walletAddress is required", code: "MISSING_WALLET" };
  }
  if (!intent.nonce) {
    return { valid: false, error: "nonce is required", code: "MISSING_NONCE" };
  }
  // expiry is unix SECONDS — compare against current unix seconds
  if (!intent.expiry || intent.expiry < Math.floor(Date.now() / 1000)) {
    return { valid: false, error: "intent has expired", code: "INTENT_EXPIRED" };
  }
  if (!intent.fundingRef) {
    return { valid: false, error: "fundingRef is required — no order without verifiable funding", code: "MISSING_FUNDING_REF" };
  }
  return { valid: true };
}

// ── FundingRef builders ───────────────────────────────────────────────────────

/** Build a ledger fundingRef after funds are locked in user_balances */
export function ledgerFundingRef(walletAddress: string, asset: string, amount: string): string {
  return `ledger:${walletAddress.toLowerCase()}:${asset}:${amount}`;
}

/** Build an EVM-signature fundingRef from a personal_sign signature */
export function evmSigFundingRef(signature: string): string {
  const hash = crypto.createHash("sha256").update(signature).digest("hex").slice(0, 16);
  return `evm-sig:${hash}`;
}

/** Build a UTXO fundingRef for BSV native orders */
export function utxoFundingRef(txid: string, vout: number): string {
  return `utxo:${txid}:${vout}`;
}

/** Build a margin fundingRef after funds are locked in futures_margin_accounts */
export function marginFundingRef(walletAddress: string, asset: string, amount: string): string {
  return `margin:${walletAddress.toLowerCase()}:${asset}:${amount}`;
}

/** Parse a fundingRef back into its components */
export function parseFundingRef(ref: string): {
  kind: "ledger" | "evm-sig" | "utxo" | "margin" | "unknown";
  raw: string;
} {
  if (ref.startsWith("ledger:"))  return { kind: "ledger",  raw: ref };
  if (ref.startsWith("evm-sig:")) return { kind: "evm-sig", raw: ref };
  if (ref.startsWith("utxo:"))    return { kind: "utxo",    raw: ref };
  if (ref.startsWith("margin:"))  return { kind: "margin",  raw: ref };
  return { kind: "unknown", raw: ref };
}

/** True if this fundingRef belongs to the futures margin bucket */
export function isFundingRefForFutures(ref: string): boolean {
  return ref.startsWith("margin:");
}

/** True if this fundingRef belongs to the spot bucket */
export function isFundingRefForSpot(ref: string): boolean {
  return ref.startsWith("ledger:") || ref.startsWith("evm-sig:") || ref.startsWith("utxo:");
}
