import { Router } from "express";
import { logger } from "../lib/logger.js";

const router = Router();
const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_HEADERS = { Accept: "application/json;version=20230302", "User-Agent": "OrahDEX/1.0" };

/* ── In-memory cache ─────────────────────────────────────────────────────── */
const cache = new Map<string, { data: unknown; ts: number }>();
function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.data as T);
  return fetcher().then(data => { cache.set(key, { data, ts: Date.now() }); return data; });
}

async function gt(path: string, ttl = 60_000): Promise<unknown> {
  return cached(path, ttl, async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const r = await fetch(`${GT_BASE}${path}`, { signal: ctrl.signal, headers: GT_HEADERS });
      clearTimeout(timer);
      if (!r.ok) {
        logger.warn({ path, status: r.status }, "GeckoTerminal upstream error");
        return { data: [], meta: { error: r.status } };
      }
      return r.json();
    } catch (err: any) {
      clearTimeout(timer);
      logger.warn({ path, err: err?.message }, "GeckoTerminal fetch failed");
      return { data: [], meta: { error: "fetch_failed" } };
    }
  });
}

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/gt/networks
   All supported networks, cached 10 min.
─────────────────────────────────────────────────────────────────────────── */
router.get("/gt/networks", async (_req, res) => {
  try {
    // Fetch all pages (GeckoTerminal paginates at 100 per page)
    const page1 = await gt("/networks?page=1", 600_000) as any;
    const page2 = await gt("/networks?page=2", 600_000) as any;
    const networks = [...(page1?.data ?? []), ...(page2?.data ?? [])];
    res.json({ networks, total: networks.length });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "GT networks failed");
    res.json({ networks: [], total: 0 });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/gt/trending
   Trending pools across all networks, cached 2 min.
─────────────────────────────────────────────────────────────────────────── */
router.get("/gt/trending", async (_req, res) => {
  try {
    const data = await gt("/networks/trending_pools?page=1&include=base_token,quote_token,network,dex", 120_000) as any;
    res.json(data);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "GT trending failed");
    res.json({ data: [] });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/gt/networks/:network/trending
   Trending pools on a specific network, cached 2 min.
─────────────────────────────────────────────────────────────────────────── */
router.get("/gt/networks/:network/trending", async (req, res) => {
  const net = req.params.network ?? "";
  if (!net || !/^[a-z0-9_-]{1,50}$/.test(net)) { res.status(400).json({ error: "invalid network" }); return; }
  try {
    const data = await gt(
      `/networks/${net}/trending_pools?page=1&include=base_token,quote_token,dex`,
      120_000
    ) as any;
    res.json(data);
  } catch (err: any) {
    logger.warn({ err: err?.message, net }, "GT network trending failed");
    res.json({ data: [] });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/gt/networks/:network/pools?page=1&sort=h24_volume_usd_liquidity_desc
   Top pools on a network, cached 60 s.
─────────────────────────────────────────────────────────────────────────── */
router.get("/gt/networks/:network/pools", async (req, res) => {
  const net = req.params.network ?? "";
  if (!net || !/^[a-z0-9_-]{1,50}$/.test(net)) { res.status(400).json({ error: "invalid network" }); return; }
  const page = Math.max(1, Math.min(10, parseInt(req.query.page as string ?? "1") || 1));
  const sortRaw = (req.query.sort as string) || "volume";
  const sort = sortRaw === "tx" ? "h24_tx_count_desc" : "h24_volume_usd_desc";
  try {
    const data = await gt(
      `/networks/${net}/pools?page=${page}&sort=${sort}&include=base_token,quote_token,dex`,
      60_000
    ) as any;
    res.json(data);
  } catch (err: any) {
    logger.warn({ err: err?.message, net }, "GT network pools failed");
    res.json({ data: [] });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/gt/networks/:network/new-pools
   Newest pools on a network, cached 90 s.
─────────────────────────────────────────────────────────────────────────── */
router.get("/gt/networks/:network/new-pools", async (req, res) => {
  const net = req.params.network ?? "";
  if (!net || !/^[a-z0-9_-]{1,50}$/.test(net)) { res.status(400).json({ error: "invalid network" }); return; }
  try {
    const data = await gt(
      `/networks/${net}/new_pools?page=1&include=base_token,quote_token,dex`,
      90_000
    ) as any;
    res.json(data);
  } catch (err: any) {
    logger.warn({ err: err?.message, net }, "GT network new pools failed");
    res.json({ data: [] });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/gt/search?q=TOKEN
   Search for tokens/pools by name or address, cached 30 s.
─────────────────────────────────────────────────────────────────────────── */
router.get("/gt/search", async (req, res) => {
  const q = (req.query.q as string ?? "").trim().slice(0, 100);
  if (!q) { res.json({ data: [] }); return; }
  try {
    const data = await gt(`/search/pools?query=${encodeURIComponent(q)}&page=1`, 30_000) as any;
    res.json(data);
  } catch (err: any) {
    logger.warn({ err: err?.message, q }, "GT search failed");
    res.json({ data: [] });
  }
});

export default router;
