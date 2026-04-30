/**
 * letsexchange.ts — LetsExchange.io API proxy
 *
 * Routes:
 *   GET  /api/letsexchange/currencies          — full coin list (v2, cached 5min)
 *   POST /api/letsexchange/estimate            — live rate for a pair (v1 enterprise)
 *   POST /api/letsexchange/exchange            — create an exchange order (v1 enterprise)
 *   GET  /api/letsexchange/status/:id          — poll order status (v1 enterprise)
 *
 * The estimate / exchange / status routes require a LetsExchange Enterprise API key.
 * With a standard affiliate key only /currencies works.  All three routes return
 * { enterpriseRequired: true } with HTTP 402 when the upstream responds with 404,
 * so the frontend can display a clear "Enterprise key needed" state.
 */

import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const API_KEY   = process.env.LETSEXCHANGE_API_KEY ?? "";
const BASE_V1   = "https://api.letsexchange.io/api/v1";
const BASE_V2   = "https://api.letsexchange.io/api/v2";
const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry { data: unknown; ts: number }
const cache = new Map<string, CacheEntry>();
function cached(k: string) { const e = cache.get(k); return e && Date.now()-e.ts < CACHE_TTL ? e.data : null; }
function setCache(k: string, d: unknown) { cache.set(k, { data: d, ts: Date.now() }); }

async function leRequest(base: string, path: string, method: "GET"|"POST" = "GET", body?: unknown) {
  const url = `${base}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  const opts: RequestInit = { method, headers };
  if (body && method === "POST") opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

// ── Coin normalisation ─────────────────────────────────────────────────────────

interface NormalisedCoin {
  symbol: string; name: string; network: string|null; networkName: string|null;
  image: string|null; hasExtraId: boolean; minAmount: string|null; maxAmount: string|null;
}

function normaliseV2Coins(raw: unknown[]): NormalisedCoin[] {
  const result: NormalisedCoin[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const c = item as Record<string, unknown>;
    const symbol = ((c.code ?? c.ticker ?? c.symbol ?? "") as string).toUpperCase();
    if (!symbol) continue;
    const name      = (c.name ?? symbol) as string;
    const image     = (c.icon ?? c.image ?? null) as string|null;
    const minAmount = (c.min_amount ?? null) as string|null;
    const maxAmount = (c.max_amount ?? null) as string|null;
    const networks  = Array.isArray(c.networks) ? c.networks as Record<string,unknown>[] : [];
    if (!networks.length) {
      const key = `${symbol}::`;
      if (!seen.has(key)) { seen.add(key); result.push({ symbol, name, network:null, networkName:null, image, hasExtraId:false, minAmount, maxAmount }); }
    } else {
      for (const net of networks) {
        if (net.is_active === 0) continue;
        const netCode = (net.code ?? "") as string;
        const key = `${symbol}::${netCode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ symbol, name, network: netCode||null, networkName:(net.name??null) as string|null, image:(net.icon??image) as string|null, hasExtraId:!!(net.has_extra), minAmount, maxAmount });
      }
    }
  }
  return result;
}

// ── GET /api/letsexchange/currencies ─────────────────────────────────────────
router.get("/letsexchange/currencies", async (_req, res) => {
  const hit = cached("currencies");
  if (hit) { res.json(hit); return; }
  try {
    const { ok, data, status } = await leRequest(BASE_V2, "/coins");
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }
    const coins = normaliseV2Coins(Array.isArray(data) ? data : []);
    setCache("currencies", coins);
    res.json(coins);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /currencies failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

// ── POST /api/letsexchange/estimate ──────────────────────────────────────────
// Body: { coin_from, coin_to, deposit_amount, network_from?, network_to? }
router.post("/letsexchange/estimate", async (req, res) => {
  const { coin_from, coin_to, deposit_amount, network_from, network_to } = req.body ?? {};
  if (!coin_from || !coin_to || !deposit_amount) {
    res.status(400).json({ error: "coin_from, coin_to, and deposit_amount are required" }); return;
  }
  const amt = parseFloat(String(deposit_amount));
  if (!isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "deposit_amount must be a positive number" }); return;
  }
  try {
    const body: Record<string,unknown> = {
      coin_from:      String(coin_from).toUpperCase(),
      coin_to:        String(coin_to).toUpperCase(),
      deposit_amount: amt,
    };
    if (network_from) body.network_from = String(network_from);
    if (network_to)   body.network_to   = String(network_to);

    const { ok, data, status } = await leRequest(BASE_V1, "/estimate", "POST", body);

    // Enterprise endpoint not available for standard affiliate keys → 404
    if (status === 404) {
      res.status(402).json({ enterpriseRequired: true, message: "LetsExchange Enterprise API access required for live rates. Contact LetsExchange to upgrade your key." });
      return;
    }
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /estimate failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

// ── POST /api/letsexchange/exchange ──────────────────────────────────────────
// Body: { coin_from, coin_to, deposit_amount, withdrawal_address, withdrawal_extra_id?, refund_address?, network_from?, network_to? }
router.post("/letsexchange/exchange", async (req, res) => {
  const { coin_from, coin_to, deposit_amount, withdrawal_address, withdrawal_extra_id, refund_address, network_from, network_to } = req.body ?? {};
  if (!coin_from || !coin_to || !deposit_amount || !withdrawal_address) {
    res.status(400).json({ error: "coin_from, coin_to, deposit_amount, and withdrawal_address are required" }); return;
  }
  const amt = parseFloat(String(deposit_amount));
  if (!isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "deposit_amount must be a positive number" }); return;
  }
  try {
    const body: Record<string,unknown> = {
      coin_from:           String(coin_from).toUpperCase(),
      coin_to:             String(coin_to).toUpperCase(),
      deposit_amount:      amt,
      withdrawal_address:  String(withdrawal_address),
    };
    if (withdrawal_extra_id) body.withdrawal_extra_id = String(withdrawal_extra_id);
    if (refund_address)      body.refund_address      = String(refund_address);
    if (network_from)        body.network_from        = String(network_from);
    if (network_to)          body.network_to          = String(network_to);

    const { ok, data, status } = await leRequest(BASE_V1, "/create", "POST", body);

    if (status === 404) {
      res.status(402).json({ enterpriseRequired: true, message: "LetsExchange Enterprise API access required to create exchanges." });
      return;
    }
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /exchange failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

// ── GET /api/letsexchange/status/:id ─────────────────────────────────────────
router.get("/letsexchange/status/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) { res.status(400).json({ error: "id is required" }); return; }
  try {
    const { ok, data, status } = await leRequest(BASE_V1, `/transaction/${encodeURIComponent(id)}`);
    if (status === 404) {
      // Could be "not found" OR "enterprise required" — try to distinguish by shape
      const d = data as Record<string,unknown>|null;
      if (!d || typeof d !== "object" || (!("id" in d) && !("status" in d))) {
        res.status(402).json({ enterpriseRequired: true, message: "LetsExchange Enterprise API access required to check transaction status." });
        return;
      }
    }
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /status failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

export default router;
