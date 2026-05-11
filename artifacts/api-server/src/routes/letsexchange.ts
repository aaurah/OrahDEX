/**
 * letsexchange.ts — LetsExchange.io API proxy
 *
 * Real API endpoints (per https://api-doc.letsexchange.io):
 *   GET  /api/v2/coins                  — full coin list
 *   POST /api/v1/info                   — rate + min/max for a pair
 *   POST /api/v1/transaction            — create exchange order
 *   GET  /api/v1/transaction/{id}       — full transaction details
 *   GET  /api/v1/transaction/{id}/status — status string only
 *
 * Our proxy routes:
 *   GET  /api/letsexchange/currencies   → v2/coins
 *   POST /api/letsexchange/estimate     → v1/info
 *   POST /api/letsexchange/exchange     → v1/transaction
 *   GET  /api/letsexchange/status/:id   → v1/transaction/{id}
 *
 * affiliate_id is extracted from the JWT (data.id field) and included in
 * every request so commissions are tracked automatically.
 */

import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { db } from "@workspace/db";
import { marketsTable, leSwapsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  leRequest, fetchLEPricesUSD, getCachedLEPrices, AFFILIATE_ID,
  type NormalisedCoin,
} from "../lib/lePriceCache.js";
import { getCoinChangeMap } from "../lib/priceUpdater.js";
import { getBuiltInLeCoins } from "../lib/leAllCoins.js";

const router: IRouter = Router();

const CACHE_TTL = 30 * 60 * 1000; // 30 min — coins list changes rarely
interface CacheEntry { data: unknown; ts: number }
const cache = new Map<string, CacheEntry>();
function cached(k: string, ttl = CACHE_TTL) {
  const e = cache.get(k);
  return e && Date.now() - e.ts < ttl ? e.data : null;
}
function setCache(k: string, d: unknown) { cache.set(k, { data: d, ts: Date.now() }); }

// Stampede guard — only one in-flight fetch for currencies at a time
let currenciesInflight: Promise<NormalisedCoin[]> | null = null;

async function fetchAndCacheCurrencies(): Promise<NormalisedCoin[]> {
  if (currenciesInflight) return currenciesInflight;
  currenciesInflight = (async () => {
    try {
      const { ok, data, status } = await leRequest("/v2/coins");
      if (!ok) throw new Error(`LE /v2/coins returned ${status}`);
      const coins = normaliseV2Coins(Array.isArray(data) ? data : []);
      setCache("currencies", coins);
      return coins;
    } finally {
      currenciesInflight = null;
    }
  })();
  return currenciesInflight;
}

/** Pre-warm the currencies cache at server startup. */
export async function warmCurrenciesCache(): Promise<void> {
  try { await fetchAndCacheCurrencies(); }
  catch (err) { logger.warn({ err }, "LE currencies warm-up failed (non-fatal)"); }
}

// ── Coin normalisation ─────────────────────────────────────────────────────────

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
        if (net.is_active === 0 || net.is_active === false) continue;
        const netCode = (net.code ?? "") as string;
        const key = `${symbol}::${netCode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          symbol, name,
          network:     netCode || null,
          networkName: (net.name ?? null) as string|null,
          image:       (net.icon ?? image) as string|null,
          hasExtraId:  !!(net.has_extra_id ?? net.has_extra),
          minAmount, maxAmount,
        });
      }
    }
  }
  return result;
}

// ── GET /api/letsexchange/currencies ─────────────────────────────────────────
router.get("/letsexchange/currencies", async (_req, res) => {
  if (!process.env.LETSEXCHANGE_API_KEY) {
    // No API key configured — return built-in coin list as fallback so the UI
    // remains functional. Coins are returned as minimal NormalisedCoin objects.
    const fallback: NormalisedCoin[] = getBuiltInLeCoins().map(sym => ({
      symbol: sym, name: sym, network: null, networkName: null,
      image: null, hasExtraId: false, minAmount: null, maxAmount: null,
    }));
    res.json(fallback);
    return;
  }
  const hit = cached("currencies") as NormalisedCoin[] | null;
  if (hit) { res.json(hit); return; }
  try {
    const coins = await fetchAndCacheCurrencies();
    res.json(coins);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /currencies failed");
    // Live API failed — serve built-in fallback so the UI stays functional.
    const fallback: NormalisedCoin[] = getBuiltInLeCoins().map(sym => ({
      symbol: sym, name: sym, network: null, networkName: null,
      image: null, hasExtraId: false, minAmount: null, maxAmount: null,
    }));
    res.json(fallback);
  }
});

// ── GET /api/letsexchange/pairs ───────────────────────────────────────────────
// Returns all LE coins expressed as OrahDEX-compatible market objects.
// Each coin gets a virtual pair against every LE_QUOTES entry, so the full
// list is available to any consumer (pair selector, market feed, etc.)
// without the client having to rebuild it from the coin list.
//
// Query params:
//   quote   (string, default "BSV")   — filter to a single quote asset
//   all     (boolean, default false)  — return all quotes, not just BSV
//
// Response shape per item:
//   symbol, baseAsset, quoteAsset, network, networkName,
//   image, hasExtraId, minAmount, maxAmount,
//   lastPrice (0), priceChangePercent24h (0), volume (0),
//   type ("letsexchange"), leSource (true)

// 22 quotes = every QUOTE_TAB currency (all of which the DB already carries).
// With 3 336 LE coins in the DB this yields ≈ 44 940 pairs — above the 44K target.
// fetchLEPairsFromDB() filters to exactly these quotes so the DB query stays lean.
const LE_PAIR_QUOTES = [
  // High-count (3 336 pairs each from DB all-to-all)
  "BSV", "BTC", "ETH", "USDT", "USDC", "BNB",
  // Mid-count (3 315 — self-skip for coins that ARE these quotes)
  "SOL", "XRP", "TRX", "DOGE",
  // Lower-count from DB; live API fills gaps to ~972 per quote
  "LTC", "BCH", "AVAX", "MATIC",
  // QUOTE_TAB currencies with ~198–199 DB rows each (live API tops up to 972)
  "ARB", "OP", "FTM", "CRO", "MNT", "ZK", "SCR", "LINEA",
];
const PAIRS_CACHE_TTL = 10 * 60 * 1000; // 10 min
const MIN_DB_SEEDED_PAIR_COUNT = 100;
const COUNT_CACHE_MAX_AGE_SECONDS = 60;

function buildPairs(coins: NormalisedCoin[]) {
  const changeMap = getCoinChangeMap();
  const pairs: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const coin of coins) {
    for (const q of LE_PAIR_QUOTES) {
      if (coin.symbol === q) continue;
      const key = `${coin.symbol}/${q}::${coin.network ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        symbol:                `${coin.symbol}/${q}`,
        baseAsset:             coin.symbol,
        quoteAsset:            q,
        network:               coin.network,
        networkName:           coin.networkName,
        image:                 coin.image,
        hasExtraId:            coin.hasExtraId,
        minAmount:             coin.minAmount,
        maxAmount:             coin.maxAmount,
        lastPrice:             0,
        priceChangePercent24h: changeMap[coin.symbol] ?? 0,
        volume:                0,
        type:                  "letsexchange",
        leSource:              true,
      });
    }
  }
  return pairs;
}

// Helper: fetch stable LE pairs from the markets DB table.
// Returns pairs in the same shape as buildPairs() so they're drop-in compatible.
// Only used when the DB is seeded (>= 100 LE rows) — falls back to live LE otherwise.
async function fetchLEPairsFromDB(): Promise<Record<string, unknown>[]> {
  // Filter to LE_PAIR_QUOTES so we only load the ~44K relevant rows instead of 319K+
  const rows = await db
    .select({
      symbol:                marketsTable.symbol,
      baseAsset:             marketsTable.baseAsset,
      quoteAsset:            marketsTable.quoteAsset,
      lastPrice:             marketsTable.lastPrice,
      priceChangePercent24h: marketsTable.priceChangePercent24h,
      volume:                marketsTable.volume24h,
    })
    .from(marketsTable)
    .where(and(
      eq(marketsTable.type, "letsexchange"),
      eq(marketsTable.enabled, true),
      inArray(marketsTable.quoteAsset, LE_PAIR_QUOTES),
    ));

  const changeMap = getCoinChangeMap();
  return rows.map(r => ({
    symbol:                r.symbol,
    baseAsset:             r.baseAsset,
    quoteAsset:            r.quoteAsset,
    network:               null,
    networkName:           null,
    image:                 null,
    hasExtraId:            false,
    minAmount:             null,
    maxAmount:             null,
    lastPrice:             parseFloat(String(r.lastPrice)) || 0,
    priceChangePercent24h: parseFloat(String(r.priceChangePercent24h)) || (changeMap[r.baseAsset] ?? 0),
    volume:                parseFloat(String(r.volume)) || 0,
    type:                  "letsexchange",
    leSource:              true,
  }));
}

// Helper: fetch OrahDEX native spot markets from the DB
async function fetchNativeMarkets(): Promise<Record<string, unknown>[]> {
  const rows = await db.select({
    symbol:               marketsTable.symbol,
    baseAsset:            marketsTable.baseAsset,
    quoteAsset:           marketsTable.quoteAsset,
    lastPrice:            marketsTable.lastPrice,
    priceChangePercent24h: marketsTable.priceChangePercent24h,
    volume:               marketsTable.volume24h,
    type:                 marketsTable.type,
  }).from(marketsTable).where(eq(marketsTable.type, "spot")); // DB-side filter — never loads LE rows

  return rows
    .map(r => ({
      symbol:               r.symbol,
      baseAsset:            r.baseAsset,
      quoteAsset:           r.quoteAsset,
      lastPrice:            parseFloat(String(r.lastPrice)) || 0,
      priceChangePercent24h: parseFloat(String(r.priceChangePercent24h)) || 0,
      volume:               parseFloat(String(r.volume)) || 0,
      type:                 "spot",
      leSource:             false,
      orahSource:           true,
    }));
}

router.get("/letsexchange/pairs", async (req, res) => {
  const filterQuote = typeof req.query.quote === "string" ? req.query.quote.toUpperCase() : null;
  const returnAll   = req.query.all === "true" || req.query.all === "1";

  const cacheKey = "le_pairs_all";
  let cachedResult = cached(cacheKey) as Record<string, unknown>[] | null;
  let coins: NormalisedCoin[] | null | undefined;

  if (!cachedResult) {
    // ── Merge DB catalog + live API for maximum pair coverage ──────────────
    // DB:      36 000+ all-to-all pairs (191 coins × 190 quotes) — real prices
    // Live API: ~14 000 pairs (972 unique coins × 14 quotes)     — newer coins
    // Combined: ~47 000 unique pairs after deduplication
    //
    // Priority order (lower layer is applied first, higher layers override):
    //   1. live API buildPairs  (base layer — newer coins, lastPrice=0)
    //   2. DB pairs             (override — real prices, wide all-to-all catalog)
    //   3. native spot pairs    (override — most accurate prices from the DEX)
    const mergeMap = new Map<string, Record<string, unknown>>();

    // Layer 1: live LE API buildPairs (fresh coin list, 14 quotes)
    try {
      coins = cached("currencies") as NormalisedCoin[] | null;
      if (!coins) coins = await fetchAndCacheCurrencies();
      if (coins && coins.length >= 100) {
        buildPairs(coins).forEach(p => mergeMap.set(p.symbol as string, p));
        logger.debug({ live: mergeMap.size, coins: coins.length }, "letsexchange /pairs: live layer loaded");
      }
    } catch (err: any) {
      logger.warn({ err }, "letsexchange /pairs: live API layer failed (non-fatal)");
    }

    // Layer 2: DB all-to-all pairs (191 coins × 190 quotes — real prices)
    try {
      const dbPairs = await fetchLEPairsFromDB();
      dbPairs.forEach(p => mergeMap.set(p.symbol as string, p)); // DB overrides live (has real prices)
      logger.debug({ db: dbPairs.length, total: mergeMap.size }, "letsexchange /pairs: DB layer merged");
    } catch (err: any) {
      logger.warn({ err }, "letsexchange /pairs: DB layer failed (non-fatal)");
    }

    cachedResult = Array.from(mergeMap.values());
    if (cachedResult.length > 0) {
      cache.set(cacheKey, { data: cachedResult, ts: Date.now() - (CACHE_TTL - PAIRS_CACHE_TTL) });
      logger.info({ total: cachedResult.length }, "letsexchange /pairs: merged catalog cached");
    }
  }

  const lePairs: Record<string, unknown>[] = cachedResult ?? [];

  // Layer 3: OrahDEX native spot pairs (most accurate prices — override LE)
  let nativePairs: Record<string, unknown>[] = [];
  try {
    const cacheHit = cached("native_markets") as Record<string, unknown>[] | null;
    if (cacheHit) {
      nativePairs = cacheHit;
    } else {
      nativePairs = await fetchNativeMarkets();
      setCache("native_markets", nativePairs);
    }
  } catch (err: any) {
    logger.warn({ err }, "letsexchange /pairs: could not fetch native markets (non-fatal)");
  }

  // Final dedup: native DEX pairs override LE pairs when symbol matches
  const bySymbol = new Map<string, Record<string, unknown>>();
  lePairs.forEach(p => { bySymbol.set(p.symbol as string, p); });
  nativePairs.forEach(p => { bySymbol.set(p.symbol as string, p); }); // native wins on price

  // ── Cross-rate enrichment ────────────────────────────────────────────────
  // Priority (highest → lowest):
  //   1. DB native USDT/USDC pair prices (most accurate, real-time)
  //   2. CoinGecko live prices for top ~500 coins (fetched async, cached 1 h)
  //   3. Static fallback table (always available, covers major coins)
  //   4. Stablecoins pinned at $1 (override everything)

  const STABLES: Record<string, number> = {
    USDT: 1, USDC: 1, TUSD: 1, USDD: 1, BUSD: 1, DAI: 1, FDUSD: 1,
    PYUSD: 1, USDE: 1, USDM: 1, CRVUSD: 1, FRAX: 1, LUSD: 1, MIM: 0.998,
    SUSD: 1, USDP: 1, EURC: 1.09, USDN: 1,
  };
  const FALLBACK_USD: Record<string, number> = {
    BTC: 95000, ETH: 2400,  BNB: 600,   BSV: 16,    BCH: 320,  SOL: 150,
    XRP: 0.52,  DOGE: 0.08, LTC: 65,    TRX: 0.24,  ADA: 0.35, DOT: 5.2,
    LINK: 11,   MATIC: 0.32, AVAX: 18,  UNI: 5.8,   AAVE: 95,  MKR: 1400,
    SNX: 1.8,   SUSHI: 0.7, COMP: 42,   YFI: 5800,  CRV: 0.35,
    "1INCH": 0.22, FTM: 0.51, CRO: 0.085, OP: 0.70, ARB: 0.42,
    IMX: 0.80,  APT: 5.2,   SUI: 0.92,  NEAR: 2.1,  FIL: 3.5,
    ICP: 5.8,   ATOM: 4.2,  ALGO: 0.14, MANA: 0.25, SAND: 0.28,
    AXS: 3.8,   THETA: 0.73, VET: 0.022, ETC: 17,   XLM: 0.088,
    ZIL: 0.011, ENJ: 0.11,  BAT: 0.12,  ZRX: 0.24,  GRT: 0.096,
    LRC: 0.14,  DYDX: 0.58, PEPE: 0.0000085, SHIB: 0.0000094,
    FLOKI: 0.000052, BONK: 0.000012, WIF: 1.4,   POPCAT: 0.34,
    TON: 3.1,   NOT: 0.0065, HMSTR: 0.0018, DOGS: 0.00018,
    INJ: 10.2,  SEI: 0.24,  TIA: 3.8,   PYTH: 0.23, JUP: 0.48,
    RNDR: 3.8,  WLD: 0.98,  FET: 0.60,  AGIX: 0.44, OCEAN: 0.33,
    TAO: 220,   ROSE: 0.046, CFX: 0.088, STX: 0.75, AR: 5.8,
    KAS: 0.053, JASMY: 0.016, ACH: 0.022, MAGIC: 0.38, GMX: 12,
    PERP: 0.43, BICO: 0.12, BAND: 0.98, REN: 0.042, NMR: 12,
    RAY: 1.8,   MNGO: 0.012, ORCA: 0.28, JTO: 1.5,
    RSR: 0.0048, LQTY: 0.72, ALCX: 10, SPELL: 0.00055, CVX: 1.8, BAL: 1.5,
    ANKR: 0.017, SKL: 0.024, CTSI: 0.078, STORJ: 0.36, OGN: 0.065,
    // Meme / culture tokens with LE support (only entries not already above)
    DOGINME: 0.0000945, LMWR: 0.021, TURBO: 0.0082, MOG: 0.0000082,
    MEW: 0.0058, NEIRO: 0.00048, MEME: 0.012, EIGEN: 2.42,
  };

  // Layer 1: static fallbacks
  const usdPrices: Record<string, number> = { ...FALLBACK_USD };

  // Layer 2: LE live rates from shared cache (non-blocking).
  // getCachedLEPrices() returns {} on a cold cache; kick off a refresh for next time.
  // When serving from DB we may not have coins loaded — skip the background warmup
  // if coins isn't available (it will be warmed on the next live-fallback cycle).
  const lePrices = getCachedLEPrices();
  if (Object.keys(lePrices).length === 0 && coins) fetchLEPricesUSD(coins).catch(() => {});
  Object.assign(usdPrices, lePrices); // LE rates overwrite static fallbacks

  // Layer 3: DB native USDT/USDC prices (most accurate)
  for (const p of nativePairs) {
    const q     = p.quoteAsset as string;
    const price = p.lastPrice  as number;
    if ((q === "USDT" || q === "USDC") && price > 0) {
      usdPrices[(p.baseAsset as string).toUpperCase()] = price;
    }
  }

  // Layer 4: stablecoins always pinned at $1
  Object.assign(usdPrices, STABLES);

  // Enrich LE-only pairs that still have lastPrice === 0
  let allPairs = Array.from(bySymbol.values()).map(p => {
    if ((p.lastPrice as number) > 0) return p; // already has a real price
    const baseUsd  = usdPrices[(p.baseAsset  as string)?.toUpperCase()];
    const quoteUsd = usdPrices[(p.quoteAsset as string)?.toUpperCase()];
    if (!baseUsd || !quoteUsd) return p;
    return { ...p, lastPrice: baseUsd / quoteUsd };
  });

  let result = allPairs;
  if (!returnAll && filterQuote) {
    result = allPairs.filter(p => p.quoteAsset === filterQuote);
  } else if (!returnAll) {
    // Default: BSV quote
    result = allPairs.filter(p => p.quoteAsset === "BSV");
  }

  res.set("Cache-Control", "public, max-age=60");
  res.json(result);
});

// ── GET /api/letsexchange/pairs/count ─────────────────────────────────────────
// Lightweight count endpoint so clients can show total pair counts without
// transferring the full pairs payload.
router.get("/letsexchange/pairs/count", async (req, res) => {
  const filterQuote = typeof req.query.quote === "string" ? req.query.quote.toUpperCase() : null;
  const returnAll   = req.query.all === "true" || req.query.all === "1";

  try {
    const cacheKey = "le_pairs_all";
    let lePairs = cached(cacheKey) as Record<string, unknown>[] | null;
    let coins: NormalisedCoin[] | null | undefined;

    if (!lePairs) {
      // Mirrors /pairs: merge live API buildPairs + DB all-to-all catalog
      const mergeMap = new Map<string, Record<string, unknown>>();
      try {
        coins = cached("currencies") as NormalisedCoin[] | null;
        if (!coins) coins = await fetchAndCacheCurrencies();
        if (coins && coins.length >= 100) buildPairs(coins).forEach(p => mergeMap.set(p.symbol as string, p));
      } catch { /* non-fatal */ }
      try {
        const dbPairs = await fetchLEPairsFromDB();
        dbPairs.forEach(p => mergeMap.set(p.symbol as string, p)); // DB overrides live (has real prices)
      } catch { /* non-fatal */ }
      lePairs = Array.from(mergeMap.values());
      if (lePairs.length > 0) cache.set(cacheKey, { data: lePairs, ts: Date.now() });
    }

    let nativePairs: Record<string, unknown>[] = [];
    try {
      const cacheHit = cached("native_markets") as Record<string, unknown>[] | null;
      if (cacheHit) nativePairs = cacheHit;
      else {
        nativePairs = await fetchNativeMarkets();
        setCache("native_markets", nativePairs);
      }
    } catch {
      nativePairs = [];
    }

    const bySymbol = new Map<string, Record<string, unknown>>();
    lePairs.forEach(p => { bySymbol.set(p.symbol as string, p); });
    nativePairs.forEach(p => { bySymbol.set(p.symbol as string, p); }); // native wins on price

    const allPairs = Array.from(bySymbol.values());
    let filtered = allPairs;
    if (!returnAll && filterQuote) {
      filtered = allPairs.filter(p => p.quoteAsset === filterQuote);
    } else if (!returnAll) {
      filtered = allPairs.filter(p => p.quoteAsset === "BSV");
    }

    res.set("Cache-Control", `public, max-age=${COUNT_CACHE_MAX_AGE_SECONDS}`);
    res.json({ count: filtered.length });
  } catch (err: any) {
    logger.warn({ err }, "letsexchange /pairs/count failed");
    res.json({ count: 0 });
  }
});

// ── POST /api/letsexchange/estimate ──────────────────────────────────────────
// Real endpoint: POST /api/v1/info
// Required: from, to, network_from, network_to, amount, affiliate_id
// Response:  min_amount, max_amount, amount (output), rate, rate_id, rate_id_expired_at, withdrawal_fee
router.post("/letsexchange/estimate", async (req, res) => {
  const body = req.body ?? {};
  const normalizeUpper = (v: unknown): string =>
    typeof v === "string" ? v.trim().toUpperCase() : "";

  const fromRaw = body.from ?? body.coin_from;
  const toRaw = body.to ?? body.coin_to;
  const from = normalizeUpper(fromRaw);
  const to = normalizeUpper(toRaw);
  const network_from = normalizeUpper(body.network_from) || from;
  const network_to = normalizeUpper(body.network_to) || to;
  const amount = body.amount ?? body.deposit_amount;
  const isFloat = body.float;

  const missingRequired =
    !from || !to || !network_from || !network_to || amount === null || amount === undefined;
  if (missingRequired) {
    res.status(400).json({ error: "from, to, network_from, network_to, and amount are required" }); return;
  }
  const amt = parseFloat(String(amount));
  if (!isFinite(amt) || amt <= 0) { res.status(400).json({ error: "amount must be positive" }); return; }

  try {
    const body: Record<string,unknown> = {
      from,
      to,
      network_from,
      network_to,
      amount:       amt,
      affiliate_id: AFFILIATE_ID,
      float:        isFloat ?? false,
    };

    const { ok, data, status } = await leRequest("/v1/info", "POST", body);

    if (status === 403) {
      res.status(403).json({ error: "Invalid API key", detail: data }); return;
    }
    if (status === 404) {
      // 404 from /v1/info means "Rate is not available for this pair" — valid business response
      const d = data as Record<string,unknown>|null;
      const msg = (d?.error as string) ?? "Rate is not available for this pair";
      res.status(404).json({ error: msg, detail: data }); return;
    }
    if (status === 422) {
      res.status(422).json({ error: "Validation error", detail: data }); return;
    }
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /estimate failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

// ── POST /api/letsexchange/exchange ──────────────────────────────────────────
// Real endpoint: POST /api/v1/transaction
// Required: float, coin_from, coin_to, network_from, network_to, deposit_amount,
//           withdrawal (address), withdrawal_extra_id (send "" if none), affiliate_id
// Optional: return (refund address), return_extra_id, rate_id, email
// Response: transaction_id, status, deposit, deposit_extra_id, withdrawal_amount, ...
router.post("/letsexchange/exchange", async (req, res) => {
  const {
    coin_from, coin_to, network_from, network_to,
    deposit_amount, withdrawal, withdrawal_extra_id,
    return: refund, return_extra_id,
    rate_id, float: isFloat, email,
  } = req.body ?? {};

  if (!coin_from || !coin_to || !network_from || !network_to || !deposit_amount || !withdrawal) {
    res.status(400).json({ error: "coin_from, coin_to, network_from, network_to, deposit_amount, and withdrawal are required" }); return;
  }
  const amt = parseFloat(String(deposit_amount));
  if (!isFinite(amt) || amt <= 0) { res.status(400).json({ error: "deposit_amount must be positive" }); return; }
  // Withdrawal address sanity: must be at least 10 chars and not suspiciously long
  const withdrawalStr = String(withdrawal).trim();
  if (withdrawalStr.length < 10 || withdrawalStr.length > 200) {
    res.status(400).json({ error: "Invalid withdrawal address" }); return;
  }

  try {
    const fromNetwork = String(network_from).trim().toUpperCase();
    const toNetwork = String(network_to).trim().toUpperCase();
    const body: Record<string,unknown> = {
      float:                isFloat ?? false,
      coin_from:            String(coin_from).toUpperCase(),
      coin_to:              String(coin_to).toUpperCase(),
      network_from:         fromNetwork,
      network_to:           toNetwork,
      deposit_amount:       amt,
      withdrawal:           withdrawalStr,
      withdrawal_extra_id:  withdrawal_extra_id != null ? String(withdrawal_extra_id) : "",
      affiliate_id:         AFFILIATE_ID,
    };
    if (refund)          body["return"]          = String(refund);
    if (return_extra_id) body["return_extra_id"] = String(return_extra_id);
    if (rate_id)         body["rate_id"]         = String(rate_id);
    if (email)           body["email"]           = String(email);

    const { ok, data, status } = await leRequest("/v1/transaction", "POST", body);

    if (status === 403) { res.status(403).json({ error: "Invalid API key", detail: data }); return; }
    if (status === 422) { res.status(422).json({ error: "Validation error", detail: data }); return; }
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }

    // Persist the swap record so we can track exchange income
    const d = data as Record<string, unknown>;
    if (d?.transaction_id) {
      const leUsd = getCachedLEPrices();
      const fromUsd = leUsd[String(coin_from).toUpperCase()] ?? 0;
      const depositUsd = fromUsd > 0 ? (amt * fromUsd).toFixed(4) : null;
      db.insert(leSwapsTable).values({
        id:               String(d.transaction_id),
        coinFrom:         String(coin_from).toUpperCase(),
        coinTo:           String(coin_to).toUpperCase(),
        networkFrom:      fromNetwork,
        networkTo:        toNetwork,
        depositAmount:    String(amt),
        withdrawalAmount: d.withdrawal_amount ? String(d.withdrawal_amount) : null,
        depositAmountUsd: depositUsd,
        status:           String(d.status ?? "waiting"),
        withdrawal:       withdrawalStr,
      }).onConflictDoNothing().catch(e => logger.warn({ err: e }, "le_swaps insert failed"));
    }

    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /exchange failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

// ── GET /api/letsexchange/status/:id ─────────────────────────────────────────
// Real endpoint: GET /api/v1/transaction/{id}
// Returns full transaction object including status, deposit, withdrawal_amount, hashes, etc.
router.get("/letsexchange/status/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) { res.status(400).json({ error: "id is required" }); return; }
  try {
    const { ok, data, status } = await leRequest(`/v1/transaction/${encodeURIComponent(id)}`);
    if (status === 403) { res.status(403).json({ error: "Invalid API key", detail: data }); return; }
    if (status === 404) { res.status(404).json({ error: "Transaction not found", detail: data }); return; }
    if (!ok) { res.status(status).json({ error: "LetsExchange error", detail: data }); return; }

    // Sync status + withdrawal amount back to our DB record
    const d = data as Record<string, unknown>;
    if (d?.transaction_id && d?.status) {
      const isFinished = ["finished", "refunded", "overdue", "emergency"].includes(String(d.status));
      db.update(leSwapsTable).set({
        status:           String(d.status),
        withdrawalAmount: d.withdrawal_amount ? String(d.withdrawal_amount) : undefined,
        completedAt:      isFinished ? new Date() : undefined,
      } as any).where(eq(leSwapsTable.id, String(d.transaction_id)))
        .catch(e => logger.warn({ err: e }, "le_swaps status sync failed"));
    }

    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /status failed");
    res.status(502).json({ error: "Failed to reach LetsExchange" });
  }
});

// Pre-warm LE price cache at startup: fetch coin list then batch-request USD rates.
// Runs entirely in the background — errors are caught inside each helper.
(async () => {
  try {
    const { ok, data } = await leRequest("/v2/coins");
    if (!ok || !Array.isArray(data)) return;
    const coins = normaliseV2Coins(data);
    setCache("currencies", coins);
    await fetchLEPricesUSD(coins);
  } catch { /* non-fatal */ }
})();

export default router;
