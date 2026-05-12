/**
 * P2P Intent Layer API
 *
 * Implements the intent model from the OrahDEX architecture document:
 *   "I will swap up to X of token A for token B at price P or better."
 *
 * Intents are signed off-chain, matched off-chain, settled on-chain.
 * This API handles the off-chain part: posting, listing, filling, cancelling.
 *
 * Auth model (mirrors liquidity.ts):
 *   External EVM wallets (0x…) MUST sign a server-issued challenge bound to
 *   (action, target) before POST / fill / DELETE so that an attacker who
 *   merely knows a wallet address cannot impersonate the maker, fill on
 *   behalf of a taker, or cancel another maker's intent.
 *   Internal-EVM (server-provisioned) and non-EVM wallets fall through —
 *   they have no off-server signing surface, and their write paths are
 *   already bounded by the per-wallet ledger guard upstream.
 *
 * Endpoints:
 *   POST   /api/p2p/challenge        — mint a single-use signing challenge
 *   POST   /api/p2p/intents          — post a new swap intent
 *   GET    /api/p2p/intents          — list open intents (filterable)
 *   GET    /api/p2p/intents/:id      — get a single intent
 *   POST   /api/p2p/intents/:id/fill — fill an intent (taker)
 *   DELETE /api/p2p/intents/:id      — cancel an intent (maker only)
 *   GET    /api/p2p/stats            — aggregate stats
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { p2pIntentsTable } from "@workspace/db/schema";
import { eq, and, desc, count, sql as drizzleSql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { FALLBACK_PRICES } from "../lib/priceUpdater.js";
import {
  issueP2PChallenge,
  verifyP2PSignature,
  hashP2PPostTarget,
} from "../lib/walletAuth.js";
import { isInternalEvmWallet } from "../lib/internalEvmWallet.js";

const router = Router();

// ── Whitelists & limits ──────────────────────────────────────────────────────
//
// Whitelisting tokens/fiat prevents DB pollution and downstream surprises in
// the matcher. Add new symbols here, not via arbitrary user input.

const TOKEN_WHITELIST = new Set<string>([
  "BTC","ETH","BSV","USDT","USDC","DAI","WBTC","WETH",
  "BNB","SOL","XRP","ADA","DOGE","DOT","LINK","TRX","BTT","WIN","JST","ORAH",
  "AVAX","ARB","OP","POL","MATIC","CAKE","UNI","AAVE","GMX","DEGEN","BRETT",
]);

const FIAT_WHITELIST = new Set<string>([
  "USD","EUR","GBP","AUD","NGN","INR","BRL","CAD","JPY","ZAR","CNY","KRW",
  "MXN","TRY","ARS","CHF","SGD","HKD","PHP","RUB",
]);

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const MIN_TTL_MS         = 60_000;            // 1 minute floor
const MAX_TTL_MS         = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_TTL_MS     = 24 * 60 * 60 * 1000;     // 24 hours
const MAX_PAYMENTS_LEN   = 512;
const MAX_TERMS_LEN      = 2_000;
const MAX_LIST_LIMIT     = 200;

// numeric(36,18) ⇒ 36 total digits, 18 after decimal ⇒ 18 integer digits max.
// We accept positive decimal strings only and bound them well under that.
const AMOUNT_RE   = /^(?:\d{1,18})(?:\.\d{1,18})?$/;
const PRICE_RE    = /^(?:\d{1,18})(?:\.\d{1,18})?$/;

// ── Validation helpers ───────────────────────────────────────────────────────

/**
 * Canonicalise an EVM-shaped address: trim, force lowercase `0x` prefix,
 * lowercase hex body. Returns null if the input is not 20 bytes of hex.
 * MUST be applied to any address before auth/persist so an attacker can't
 * smuggle `0X…` past the EVM detector and fall through to the no-sig path.
 */
function canonEvmAddress(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  if (!/^0x[0-9a-fA-F]{40}$/i.test(trimmed)) return null;
  return "0x" + trimmed.slice(2).toLowerCase();
}

function isEvmAddress(s: unknown): s is string {
  return typeof s === "string" && /^0x[0-9a-fA-F]{40}$/i.test(s.trim());
}

/**
 * Normalise an amount to a canonical decimal string suitable for
 * numeric(36,18). Rejects NaN/Infinity/scientific-notation/negative input.
 * Returned form has no leading + and no leading zeros beyond a single "0.".
 */
function normaliseAmount(v: unknown, label: string): string {
  let s: string;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${label} must be a positive finite number`);
    // Avoid scientific notation; toFixed(18) then trim trailing zeros.
    s = v.toFixed(18).replace(/0+$/, "").replace(/\.$/, "");
  } else if (typeof v === "string") {
    s = v.trim();
  } else {
    throw new Error(`${label} is required`);
  }
  if (!AMOUNT_RE.test(s)) throw new Error(`${label} must be a positive decimal with ≤18 fractional digits`);
  // Strip leading zeros: "007.5" → "7.5", "0.5" stays.
  s = s.replace(/^0+(?=\d)/, "");
  if (s === "" || s === "0" || /^0+(?:\.0*)?$/.test(s)) {
    throw new Error(`${label} must be > 0`);
  }
  return s;
}

function normalisePrice(v: unknown, label: string): string {
  if (v === undefined || v === null || v === "") return "";
  const s = typeof v === "string" ? v.trim() : String(v);
  if (!PRICE_RE.test(s)) throw new Error(`${label} must be a positive decimal`);
  const stripped = s.replace(/^0+(?=\d)/, "");
  if (/^0+(?:\.0*)?$/.test(stripped)) throw new Error(`${label} must be > 0`);
  return stripped;
}

function normaliseToken(v: unknown, label: string): string {
  if (typeof v !== "string" || !v) throw new Error(`${label} is required`);
  const sym = v.toUpperCase();
  if (!TOKEN_WHITELIST.has(sym) && !FIAT_WHITELIST.has(sym)) {
    throw new Error(`${label} '${sym}' is not a supported token or fiat code`);
  }
  return sym;
}

function normaliseFiat(v: unknown): string {
  if (typeof v !== "string" || !v) return "USD";
  const sym = v.toUpperCase();
  if (!FIAT_WHITELIST.has(sym)) throw new Error(`fiat '${sym}' is not a supported currency`);
  return sym;
}

function normaliseTtlMs(v: unknown): number {
  if (v === undefined || v === null || v === "") return DEFAULT_TTL_MS;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error("expiresInMs must be a finite number");
  if (n < MIN_TTL_MS)      throw new Error(`expiresInMs must be ≥ ${MIN_TTL_MS}`);
  return Math.min(n, MAX_TTL_MS);
}

function normaliseString(v: unknown, label: string, max: number): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new Error(`${label} must be a string`);
  if (v.length > max) throw new Error(`${label} exceeds max length ${max}`);
  return v;
}

/**
 * Compare two numeric(36,18) decimal strings without precision loss.
 * Returns -1, 0, or 1.  Accepts canonicalised strings (per normaliseAmount).
 */
function cmpDecimal(a: string, b: string): number {
  const [ai, af = ""] = a.split(".");
  const [bi, bf = ""] = b.split(".");
  // Compare integer parts by length then lexically.
  if (ai.length !== bi.length) return ai.length < bi.length ? -1 : 1;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const len = Math.max(af.length, bf.length);
  const aP  = af.padEnd(len, "0");
  const bP  = bf.padEnd(len, "0");
  if (aP === bP) return 0;
  return aP < bP ? -1 : 1;
}

/**
 * Enforce signed-challenge auth for external EVM wallets.
 * Internal-EVM (server-provisioned) and non-EVM wallets fall through.
 * Throws a structured error the route handler maps to a 401.
 */
async function requireP2PAuth(params: {
  walletAddress: string;
  nonce:         unknown;
  signature:     unknown;
  action:        "post" | "fill" | "cancel";
  target:        string;
}): Promise<void> {
  const { walletAddress, action, target } = params;
  if (!isEvmAddress(walletAddress)) return;  // BSV / SOL / other → fall through

  const nonce     = typeof params.nonce     === "string" ? params.nonce     : "";
  const signature = typeof params.signature === "string" ? params.signature : "";
  const internal  = await isInternalEvmWallet(walletAddress);

  if (!internal) {
    if (!nonce || !signature) {
      // Re-check the registry once to close the TOCTOU race where the
      // wallet was provisioned in another request between our first check
      // and now — don't spuriously 401 a freshly-created internal wallet.
      const recheck = await isInternalEvmWallet(walletAddress);
      if (recheck) return;
      const err = new Error(
        "Signed challenge required for external EVM wallets. " +
        "Call POST /api/p2p/challenge first.",
      );
      (err as any).status = 401;
      throw err;
    }
    try {
      verifyP2PSignature({ walletAddress, nonce, signature, action, target });
    } catch (e: any) {
      const err = new Error(e?.message ?? "Invalid signature");
      (err as any).status = 401;
      throw err;
    }
  } else if (signature) {
    // Internal wallet but caller still supplied a sig — verify strictly so
    // a forged sig can't masquerade as a valid one.
    try {
      verifyP2PSignature({ walletAddress, nonce, signature, action, target });
    } catch (e: any) {
      const err = new Error(e?.message ?? "Invalid signature");
      (err as any).status = 401;
      throw err;
    }
  }
}

// ── Stale-intent expirer (background sweep) ──────────────────────────────────
// Replaces the old write-on-read in GET. Runs every 60s; opportunistic.

let lastExpireSweep = 0;
const EXPIRE_SWEEP_MS = 60_000;

async function sweepExpiredIntentsIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastExpireSweep < EXPIRE_SWEEP_MS) return;
  lastExpireSweep = now;
  try {
    await db.update(p2pIntentsTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(
        eq(p2pIntentsTable.status, "open"),
        drizzleSql`expires_at < NOW()`,
      ));
  } catch (err: any) {
    logger.warn({ err: err?.message }, "P2P expire sweep failed");
  }
}

// ── POST /api/p2p/challenge ──────────────────────────────────────────────────
// Body: { walletAddress, action, ...targetFields }
//   action="post"   → also requires { tokenIn, tokenOut, amountIn, minAmountOut }
//   action="fill"   → also requires { intentId }
//   action="cancel" → also requires { intentId }
router.post("/p2p/challenge", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const walletAddress = canonEvmAddress(body.walletAddress);
  const action        = body.action;

  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress must be an EVM (0x…) address" });
    return;
  }
  if (action !== "post" && action !== "fill" && action !== "cancel") {
    res.status(400).json({ error: "action must be 'post', 'fill', or 'cancel'" });
    return;
  }

  let target: string;
  try {
    if (action === "post") {
      const tokenIn      = normaliseToken(body.tokenIn,  "tokenIn");
      const tokenOut     = normaliseToken(body.tokenOut, "tokenOut");
      if (tokenIn === tokenOut) throw new Error("tokenIn and tokenOut must differ");
      const amountIn     = normaliseAmount(body.amountIn,     "amountIn");
      const minAmountOut = normaliseAmount(body.minAmountOut, "minAmountOut");
      target = hashP2PPostTarget({ tokenIn, tokenOut, amountIn, minAmountOut });
    } else {
      const intentId = body.intentId;
      if (typeof intentId !== "string" || !UUID_RE.test(intentId)) {
        throw new Error("intentId is required and must be a UUID");
      }
      target = intentId;
    }
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "Invalid challenge target" });
    return;
  }

  const challenge = issueP2PChallenge({ walletAddress, action, target });
  res.json(challenge);
});

// ── POST /api/p2p/intents ────────────────────────────────────────────────────
router.post("/p2p/intents", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const rawMaker = body.makerAddress;
    if (typeof rawMaker !== "string" || !rawMaker) {
      res.status(400).json({ error: "makerAddress is required" });
      return;
    }
    // Canonicalise EVM addresses up-front: an attacker who sends `0X…`
    // (uppercase X) would otherwise slip past the EVM detector and skip the
    // sig check, then get persisted as canonical `0x…` after toLowerCase().
    const canonMaker = canonEvmAddress(rawMaker);
    const makerAddress = canonMaker ?? rawMaker;

    let tokenIn: string, tokenOut: string, amountIn: string, minAmountOut: string,
        priceStr: string, fiat: string, paymentMethods: string, terms: string,
        ttlMs: number;
    try {
      tokenIn        = normaliseToken(body.tokenIn,  "tokenIn");
      tokenOut       = normaliseToken(body.tokenOut, "tokenOut");
      if (tokenIn === tokenOut) throw new Error("tokenIn and tokenOut must differ");
      amountIn       = normaliseAmount(body.amountIn,     "amountIn");
      minAmountOut   = normaliseAmount(body.minAmountOut, "minAmountOut");
      priceStr       = normalisePrice(body.price, "price");
      fiat           = normaliseFiat(body.fiat);
      paymentMethods = normaliseString(body.paymentMethods, "paymentMethods", MAX_PAYMENTS_LEN);
      terms          = normaliseString(body.terms,          "terms",          MAX_TERMS_LEN);
      ttlMs          = normaliseTtlMs(body.expiresInMs);
    } catch (e: any) {
      res.status(400).json({ error: e?.message ?? "Invalid input" });
      return;
    }

    // Auth — bound to the canonical (tokens, amounts) target.
    const target = hashP2PPostTarget({ tokenIn, tokenOut, amountIn, minAmountOut });
    try {
      await requireP2PAuth({
        walletAddress: makerAddress,
        nonce:     body.nonce,
        signature: body.signature,
        action:    "post",
        target,
      });
    } catch (e: any) {
      res.status(e?.status ?? 401).json({ error: e?.message ?? "Unauthorised" });
      return;
    }

    const addr      = makerAddress.toLowerCase();
    const expiresAt = new Date(Date.now() + ttlMs);

    // Derive implied price if the client did not provide one. Prefer the
    // current price-oracle snapshot; if that's unavailable, leave the field
    // null rather than baking in a stale fallback or a misleading placeholder
    // (the column is nullable per schema).
    let impliedPrice: string | null = priceStr || null;
    if (!impliedPrice) {
      const inPrice  = FALLBACK_PRICES[tokenIn]  ?? 0;
      const outPrice = FALLBACK_PRICES[tokenOut] ?? 0;
      if (inPrice > 0 && outPrice > 0) {
        impliedPrice = (inPrice / outPrice).toFixed(18).replace(/0+$/, "").replace(/\.$/, "");
      }
    }

    const intentId = randomUUID();
    const [intent] = await db.insert(p2pIntentsTable).values({
      intentId,
      makerAddress:    addr,
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      price:           impliedPrice,
      fiat,
      paymentMethods,
      terms,
      signature:       typeof body.signature === "string" ? body.signature.slice(0, 200) : "",
      status:          "open",
      expiresAt,
    }).returning();

    logger.info({ intentId, addr, tokenIn, tokenOut }, "P2P intent posted");
    res.status(201).json(intent);
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /p2p/intents failed");
    res.status(500).json({ error: "Failed to post intent" });
  }
});

// ── GET /api/p2p/intents ─────────────────────────────────────────────────────
router.get("/p2p/intents", async (req, res) => {
  try {
    const {
      tokenIn,
      tokenOut,
      maker,
      status   = "open",
      limit:    limitStr = "50",
    } = req.query as Record<string, string | undefined>;

    const limitN = Math.min(Math.max(parseInt(limitStr ?? "50", 10) || 50, 1), MAX_LIST_LIMIT);

    // Sweep stale intents at most once per minute, off the hot path.
    void sweepExpiredIntentsIfDue();

    const conditions = [];
    if (status)   conditions.push(eq(p2pIntentsTable.status, status));
    if (tokenIn) {
      const t = tokenIn.toUpperCase();
      if (TOKEN_WHITELIST.has(t) || FIAT_WHITELIST.has(t)) {
        conditions.push(eq(p2pIntentsTable.tokenIn, t));
      }
    }
    if (tokenOut) {
      const t = tokenOut.toUpperCase();
      if (TOKEN_WHITELIST.has(t) || FIAT_WHITELIST.has(t)) {
        conditions.push(eq(p2pIntentsTable.tokenOut, t));
      }
    }
    if (maker)    conditions.push(eq(p2pIntentsTable.makerAddress, maker.toLowerCase()));

    const intents = await db.select().from(p2pIntentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(p2pIntentsTable.createdAt))
      .limit(limitN);

    res.json({ intents, total: intents.length });
  } catch (err: any) {
    logger.error({ err: err?.message }, "GET /p2p/intents failed");
    res.status(500).json({ error: "Failed to list intents" });
  }
});

// ── GET /api/p2p/intents/:id ─────────────────────────────────────────────────
router.get("/p2p/intents/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!UUID_RE.test(id)) { res.status(400).json({ error: "Invalid intent id" }); return; }
    const [intent] = await db.select().from(p2pIntentsTable)
      .where(eq(p2pIntentsTable.intentId, id));

    if (!intent) { res.status(404).json({ error: "Intent not found" }); return; }
    res.json(intent);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch intent" });
  }
});

// ── POST /api/p2p/intents/:id/fill ───────────────────────────────────────────
router.post("/p2p/intents/:id/fill", async (req, res) => {
  try {
    const id = req.params.id;
    if (!UUID_RE.test(id)) { res.status(400).json({ error: "Invalid intent id" }); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawTaker = body.takerAddress;
    if (typeof rawTaker !== "string" || !rawTaker) {
      res.status(400).json({ error: "takerAddress is required" });
      return;
    }
    // Canonicalise EVM addresses up-front (see note in POST /p2p/intents).
    const canonTaker = canonEvmAddress(rawTaker);
    const takerAddress = canonTaker ?? rawTaker;

    let amountOut: string;
    try {
      amountOut = normaliseAmount(body.amountOut, "amountOut");
    } catch (e: any) {
      res.status(400).json({ error: e?.message ?? "Invalid amountOut" });
      return;
    }

    // Auth — taker must control takerAddress.
    try {
      await requireP2PAuth({
        walletAddress: takerAddress,
        nonce:     body.nonce,
        signature: body.signature,
        action:    "fill",
        target:    id,
      });
    } catch (e: any) {
      res.status(e?.status ?? 401).json({ error: e?.message ?? "Unauthorised" });
      return;
    }

    const [intent] = await db.select().from(p2pIntentsTable)
      .where(eq(p2pIntentsTable.intentId, id));

    if (!intent) { res.status(404).json({ error: "Intent not found" }); return; }
    if (intent.makerAddress === takerAddress.toLowerCase()) {
      res.status(400).json({ error: "Cannot fill your own intent" }); return;
    }
    // ── Private-trade enforcement ──────────────────────────────────────────
    // Direct-trade UI lets makers gate an intent to a single counterparty by
    // storing `terms = "private:<lowercased-address>"`. That gate MUST be
    // enforced on the server too, otherwise anyone can bypass the UI and
    // call the fill endpoint directly.
    const termsStr = (intent.terms ?? "").trim();
    if (termsStr.toLowerCase().startsWith("private:")) {
      const allowed = termsStr.slice("private:".length).trim().toLowerCase();
      // Strict semantics: if the maker tagged the intent as private but
      // didn't (or no longer) carries a target address, treat the intent as
      // unfillable rather than silently public. Without this guard, a stray
      // `terms: "private:"` would let *anyone* fill what the maker intended
      // to be a gated trade.
      if (!allowed) {
        res.status(409).json({
          error: "This intent is marked private but has no counterparty set — ask the maker to repost",
        });
        return;
      }
      if (allowed !== takerAddress.toLowerCase()) {
        res.status(403).json({
          error: "This is a private trade — only the named counterparty can fill it",
        });
        return;
      }
    }
    if (intent.status !== "open") {
      res.status(409).json({ error: `Intent is already ${intent.status}` }); return;
    }
    if (new Date() > intent.expiresAt) {
      await db.update(p2pIntentsTable)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(p2pIntentsTable.intentId, id));
      res.status(410).json({ error: "Intent has expired" }); return;
    }

    // Decimal-safe slippage check (no float coercion).
    if (cmpDecimal(amountOut, intent.minAmountOut) < 0) {
      res.status(400).json({
        error: `amountOut ${amountOut} is below minAmountOut ${intent.minAmountOut} (slippage check failed)`,
      });
      return;
    }

    // Atomic compare-and-set on status='open' so only one taker can fill.
    const updated = await db.update(p2pIntentsTable).set({
      status:          "filled",
      takerAddress:    takerAddress.toLowerCase(),
      filledAmountOut: amountOut,
      updatedAt:       new Date(),
    }).where(and(
      eq(p2pIntentsTable.intentId, id),
      eq(p2pIntentsTable.status, "open"),
    )).returning();

    if (updated.length === 0) {
      res.status(409).json({ error: "Intent was just filled or cancelled by another request" });
      return;
    }

    logger.info({ id, takerAddress, amountOut }, "P2P intent filled");
    res.json({ success: true, intent: updated[0] });
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /p2p/intents/:id/fill failed");
    res.status(500).json({ error: "Fill failed" });
  }
});

// ── DELETE /api/p2p/intents/:id ──────────────────────────────────────────────
router.delete("/p2p/intents/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!UUID_RE.test(id)) { res.status(400).json({ error: "Invalid intent id" }); return; }

    // Accept walletAddress / nonce / signature from the request body only.
    // Query-string parameters are recorded in access logs and proxies, which
    // would expose cryptographic signatures to unintended parties.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawAddr   = typeof body.walletAddress === "string" ? body.walletAddress : "";
    const nonce     = typeof body.nonce         === "string" ? body.nonce         : "";
    const signature = typeof body.signature     === "string" ? body.signature     : "";

    if (!rawAddr) {
      res.status(400).json({ error: "walletAddress is required to cancel an intent" });
      return;
    }

    // Canonicalise the caller-supplied address before comparing to the
    // canonical maker stored in the DB (which is always lowercase 0x…).
    const callerAddr = (canonEvmAddress(rawAddr) ?? rawAddr).toLowerCase();

    // Look up the intent FIRST so we can verify the canonical maker.
    const [intent] = await db.select().from(p2pIntentsTable)
      .where(eq(p2pIntentsTable.intentId, id));

    if (!intent) { res.status(404).json({ error: "Intent not found" }); return; }
    if (intent.makerAddress !== callerAddr) {
      res.status(403).json({ error: "Only the maker can cancel this intent" }); return;
    }
    if (intent.status !== "open") {
      res.status(409).json({ error: `Intent is already ${intent.status}` }); return;
    }

    // Auth — the canonical maker (from DB) must produce a fresh signature.
    try {
      await requireP2PAuth({
        walletAddress: intent.makerAddress,
        nonce,
        signature,
        action:        "cancel",
        target:        id,
      });
    } catch (e: any) {
      res.status(e?.status ?? 401).json({ error: e?.message ?? "Unauthorised" });
      return;
    }

    // Atomic compare-and-set: only flip if still open.
    const updated = await db.update(p2pIntentsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(
        eq(p2pIntentsTable.intentId, id),
        eq(p2pIntentsTable.status, "open"),
      )).returning();

    if (updated.length === 0) {
      res.status(409).json({ error: "Intent was just filled or cancelled by another request" });
      return;
    }

    logger.info({ id, addr: intent.makerAddress }, "P2P intent cancelled by maker");
    res.json({ success: true, intentId: id, status: "cancelled" });
  } catch (err: any) {
    logger.error({ err: err?.message }, "DELETE /p2p/intents/:id failed");
    res.status(500).json({ error: "Cancel failed" });
  }
});

// ── GET /api/p2p/stats ───────────────────────────────────────────────────────
router.get("/p2p/stats", async (_req, res) => {
  try {
    const [stats] = await db.select({
      total:     count(),
      open:      drizzleSql<number>`COUNT(*) FILTER (WHERE status = 'open')`,
      filled:    drizzleSql<number>`COUNT(*) FILTER (WHERE status = 'filled')`,
      cancelled: drizzleSql<number>`COUNT(*) FILTER (WHERE status = 'cancelled')`,
      expired:   drizzleSql<number>`COUNT(*) FILTER (WHERE status = 'expired')`,
    }).from(p2pIntentsTable);

    res.json({
      total:     stats?.total     ?? 0,
      open:      stats?.open      ?? 0,
      filled:    stats?.filled    ?? 0,
      cancelled: stats?.cancelled ?? 0,
      expired:   stats?.expired   ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
