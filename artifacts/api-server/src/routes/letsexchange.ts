/**
 * letsexchange.ts — LetsExchange.io API proxy routes
 *
 * Proxies requests to LetsExchange.io's public API so the frontend
 * never exposes the API key. Provides:
 *   GET  /api/letsexchange/currencies       — all supported coins/tokens
 *   GET  /api/letsexchange/pairs/:from      — available pairs for a coin
 *   POST /api/letsexchange/estimate         — estimated output for a swap
 *   POST /api/letsexchange/exchange         — create a real exchange order
 *   GET  /api/letsexchange/status/:id       — check order status
 *   GET  /api/letsexchange/min/:from/:to    — minimum exchange amount
 */

import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const API_KEY = process.env.LETSEXCHANGE_API_KEY ?? "";
const BASE_URL = "https://api.letsexchange.io/api/v2";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

interface CacheEntry { data: unknown; ts: number }
const cache = new Map<string, CacheEntry>();

function cached(key: string): unknown | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return e.data;
}
function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

async function leRequest(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

  const opts: RequestInit = { method, headers };
  if (body && method === "POST") opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

interface NormalisedCoin {
  symbol:      string;
  name:        string;
  network:     string | null;
  networkName: string | null;
  image:       string | null;
  hasExtraId:  boolean;
  minAmount:   string | null;
  maxAmount:   string | null;
}

// Normalise the v2 LetsExchange coin list.
// Each coin can have multiple networks — we expand into one entry per
// active network so the user can pick e.g. "USDT on TRC20" vs "USDT on ERC20".
function normaliseV2Coins(raw: unknown[]): NormalisedCoin[] {
  const result: NormalisedCoin[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const c = item as Record<string, unknown>;
    const symbol = ((c.code ?? c.ticker ?? c.symbol ?? "") as string).toUpperCase();
    if (!symbol) continue;

    const name      = (c.name ?? symbol) as string;
    const image     = (c.icon ?? c.image ?? null) as string | null;
    const minAmount = (c.min_amount ?? null) as string | null;
    const maxAmount = (c.max_amount ?? null) as string | null;
    const networks  = Array.isArray(c.networks) ? c.networks as Record<string, unknown>[] : [];

    if (networks.length === 0) {
      // Flat coin (v1-style)
      const key = `${symbol}::`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ symbol, name, network: null, networkName: null, image, hasExtraId: false, minAmount, maxAmount });
      }
    } else {
      for (const net of networks) {
        if (net.is_active === 0) continue;
        const netCode = (net.code ?? "") as string;
        const key = `${symbol}::${netCode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          symbol,
          name,
          network:     netCode || null,
          networkName: (net.name ?? null) as string | null,
          image:       (net.icon ?? image) as string | null,
          hasExtraId:  !!(net.has_extra),
          minAmount,
          maxAmount,
        });
      }
    }
  }

  return result;
}

// ── GET /api/letsexchange/currencies ──────────────────────────────────────────
// Returns all supported coins, one entry per coin×network. Cached for 5 minutes.
router.get("/letsexchange/currencies", async (_req, res) => {
  const key = "currencies";
  const hit = cached(key);
  if (hit) { res.json(hit); return; }
  try {
    const { ok, data, status } = await leRequest("/coins");
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }
    const raw = Array.isArray(data) ? data : [];
    const coins = normaliseV2Coins(raw);
    setCache(key, coins);
    res.json(coins);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /currencies failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

// ── GET /api/letsexchange/pairs/:from ─────────────────────────────────────────
// Returns coins you can swap TO from the given coin ticker.
router.get("/letsexchange/pairs/:from", async (req, res) => {
  const from = req.params.from?.toUpperCase();
  if (!from) { res.status(400).json({ error: "from is required" }); return; }

  const key = `pairs:${from}`;
  const hit = cached(key);
  if (hit) { res.json(hit); return; }

  try {
    const { ok, data, status } = await leRequest(`/coins-to?symbol=${encodeURIComponent(from)}`);
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }
    setCache(key, data);
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /pairs failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

// ── GET /api/letsexchange/min/:from/:to ──────────────────────────────────────
// Returns minimum exchange amount for a pair.
router.get("/letsexchange/min/:from/:to", async (req, res) => {
  const from = req.params.from?.toUpperCase();
  const to   = req.params.to?.toUpperCase();
  if (!from || !to) { res.status(400).json({ error: "from and to are required" }); return; }

  const key = `min:${from}:${to}`;
  const hit = cached(key);
  if (hit) { res.json(hit); return; }

  try {
    const { ok, data, status } = await leRequest(
      `/min-amount?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }
    setCache(key, data);
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /min failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

// ── POST /api/letsexchange/estimate ──────────────────────────────────────────
// Body: { from, to, amount }
// Returns estimated output amount.
router.post("/letsexchange/estimate", async (req, res) => {
  const { from, to, amount } = req.body ?? {};
  if (!from || !to || !amount) {
    res.status(400).json({ error: "from, to, and amount are required" });
    return;
  }

  const fromUpper = String(from).toUpperCase();
  const toUpper   = String(to).toUpperCase();
  const amt       = parseFloat(amount);
  if (!isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  try {
    const { ok, data, status } = await leRequest("/estimate", "POST", {
      from: fromUpper,
      to:   toUpper,
      amount: String(amt),
    });
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /estimate failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

// ── POST /api/letsexchange/exchange ──────────────────────────────────────────
// Body: { from, to, amount, address, refundAddress? }
// Creates a real exchange order. Returns { id, payinAddress, payinAmount, ... }
router.post("/letsexchange/exchange", async (req, res) => {
  const { from, to, amount, address, refundAddress, extraId } = req.body ?? {};
  if (!from || !to || !amount || !address) {
    res.status(400).json({ error: "from, to, amount, and address are required" });
    return;
  }

  const fromUpper = String(from).toUpperCase();
  const toUpper   = String(to).toUpperCase();
  const amt       = parseFloat(amount);
  if (!isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  try {
    const body: Record<string, string> = {
      from:    fromUpper,
      to:      toUpper,
      amount:  String(amt),
      address: String(address),
    };
    if (refundAddress) body.refundAddress = String(refundAddress);
    if (extraId)       body.extraId       = String(extraId);

    const { ok, data, status } = await leRequest("/exchange", "POST", body);
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /exchange failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

// ── GET /api/letsexchange/status/:id ─────────────────────────────────────────
// Check the status of an existing order.
router.get("/letsexchange/status/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) { res.status(400).json({ error: "id is required" }); return; }
  try {
    const { ok, data, status } = await leRequest(`/exchange/${encodeURIComponent(id)}`);
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /status failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

export default router;
