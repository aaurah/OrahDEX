import { Router } from "express";
import { logger } from "../lib/logger.js";

const router = Router();

interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string;
  txns?: { h24?: { buys: number; sells: number } };
  volume?: { h24?: number; h6?: number; h1?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number };
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: Array<{ url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
  boosts?: { active?: number };
}

/* ── Simple in-memory cache ───────────────────────────────────────────────── */
const cache = new Map<string, { data: DexPair[]; ts: number }>();
const CACHE_TTL = 30_000; // 30 s

async function fetchDexScreener(query: string): Promise<DexPair[]> {
  const cacheKey = query.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Orah/1.0", Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!r.ok) return [];
    const json = await r.json() as { pairs?: DexPair[] };
    const pairs = (json.pairs ?? []).filter(p => p.chainId === "base");
    cache.set(cacheKey, { data: pairs, ts: Date.now() });
    return pairs;
  } catch {
    clearTimeout(timer);
    return [];
  }
}

async function fetchDexScreenerByAddresses(addresses: string): Promise<DexPair[]> {
  const cacheKey = `addr:${addresses}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(addresses)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Orah/1.0", Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!r.ok) return [];
    const json = await r.json() as { pairs?: DexPair[] };
    const pairs = (json.pairs ?? []).filter(p => p.chainId === "base");
    cache.set(cacheKey, { data: pairs, ts: Date.now() });
    return pairs;
  } catch {
    clearTimeout(timer);
    return [];
  }
}

function dedup(pairs: DexPair[]): DexPair[] {
  const seen = new Set<string>();
  return pairs.filter(p => {
    if (seen.has(p.pairAddress)) return false;
    seen.add(p.pairAddress);
    return true;
  });
}

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/dexscreener/base/top
   Returns the top Base chain pairs by 24h volume.
   Queries several popular tokens in parallel to get broad coverage.
─────────────────────────────────────────────────────────────────────────── */
router.get("/dexscreener/base/top", async (_req, res) => {
  try {
    const queries = ["USDC", "WETH", "BRETT", "DEGEN", "CBBTC"];
    const results = await Promise.all(queries.map(q => fetchDexScreener(q)));
    const all = dedup(results.flat());
    const sorted = all
      .filter(p => (p.volume?.h24 ?? 0) > 100 && parseFloat(p.priceUsd ?? "0") > 0)
      .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
      .slice(0, 100);
    res.json({ pairs: sorted, source: "dexscreener", chain: "base" });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "DexScreener Base/top failed");
    res.json({ pairs: [], source: "dexscreener", chain: "base" });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/dexscreener/base/search?q=SYMBOL_OR_ADDRESS
   Full-text pair search on Base chain.
─────────────────────────────────────────────────────────────────────────── */
router.get("/dexscreener/base/search", async (req, res) => {
  const q = (req.query.q as string ?? "").trim();
  if (!q) { res.json({ pairs: [] }); return; }
  try {
    const pairs = q.startsWith("0x")
      ? await fetchDexScreenerByAddresses(q)
      : await fetchDexScreener(q);
    const sorted = pairs
      .filter(p => parseFloat(p.priceUsd ?? "0") > 0)
      .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
      .slice(0, 80);
    res.json({ pairs: sorted, source: "dexscreener", chain: "base" });
  } catch (err: any) {
    logger.warn({ err: err?.message, q }, "DexScreener Base/search failed");
    res.json({ pairs: [] });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/dexscreener/base/new
   Newest pairs on Base by creation time, min liquidity $1k.
─────────────────────────────────────────────────────────────────────────── */
router.get("/dexscreener/base/new", async (_req, res) => {
  try {
    const queries = ["USDC", "WETH", "DEGEN"];
    const results = await Promise.all(queries.map(q => fetchDexScreener(q)));
    const all = dedup(results.flat());
    const sorted = all
      .filter(p => (p.liquidity?.usd ?? 0) > 1_000 && parseFloat(p.priceUsd ?? "0") > 0)
      .sort((a, b) => (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0))
      .slice(0, 50);
    res.json({ pairs: sorted, source: "dexscreener", chain: "base" });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "DexScreener Base/new failed");
    res.json({ pairs: [] });
  }
});

export default router;
