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
import { db, pool } from "@workspace/db";
import { marketsTable, leSwapsTable } from "@workspace/db/schema";
import { eq, and, ne, inArray, sql } from "drizzle-orm";
import {
  leRequest, fetchLEPricesUSD, getCachedLEPrices, fetchLEKeyPricesIfNeeded, AFFILIATE_ID,
  type NormalisedCoin,
} from "../lib/lePriceCache.js";
import { getCoinChangeMap } from "../lib/priceUpdater.js";
import { getBuiltInLeCoins } from "../lib/leAllCoins.js";
import { getBestExternalQuote, type ExternalVenue } from "../lib/metaRouter.js";
import { createCNExchange, getCNExchange } from "../lib/changenow.js";
import { createSXExchange, getSXExchange } from "../lib/stealthex.js";
import { createSsExchangePair, getSsExchange, fetchSSCurrencies } from "../lib/simpleswap.js";
import { createChangellyExchange, getChangellyExchange, isChangellyConfigured } from "../lib/changelly.js";
import { recordPlatformFee } from "../lib/feeCollector.js";

const router: IRouter = Router();

const BRIDGE_COMMISSION_RATE = 0.003; // 0.3% of deposit USD — estimated affiliate commission

function recordBridgeFee(amt: number, fromCoin: string, txRef: string) {
  const leUsd = getCachedLEPrices();
  const fromUsdPrice = leUsd[fromCoin.toUpperCase()] ?? 0;
  if (fromUsdPrice <= 0) return;
  const depositUsd = amt * fromUsdPrice;
  const commission = depositUsd * BRIDGE_COMMISSION_RATE;
  if (commission > 0) {
    recordPlatformFee({ source: "bridge", amount: commission, asset: "USD", txRef }).catch(() => {});
  }
}

/**
 * Returns the built-in coin catalog as NormalisedCoin[] stubs.
 * Used as an ultimate fallback when the LE API is unreachable or when the
 * LETSEXCHANGE_API_KEY environment variable has not been configured yet.
 * The stubs carry null network/image/hasExtraId so they still render in every
 * coin picker and market list; live metadata is filled in once the API key is set.
 */
function builtInCoinsAsFallback(): NormalisedCoin[] {
  return getBuiltInLeCoins().map(symbol => ({
    symbol,
    name: symbol,
    network: null,
    networkName: null,
    image: null,
    hasExtraId: false,
    minAmount: null,
    maxAmount: null,
  }));
}

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

// Stale-backup for LE currencies: set on first successful fetch, kept forever.
// Eliminates the "timed out — serving built-in fallback" warning after the
// first load; stale data is served silently while a background refresh runs.
let leCurrenciesBackup: NormalisedCoin[] | null = null;

// Guard: only one background pagination run at a time.
let currenciesBgFetchActive = false;

// Stale-backup for SS pairs: once successfully built, kept forever so pairs
// never vanish from the list if the SS API is temporarily down.
// Only the admin hidden-pairs list can suppress individual symbols.
let ssPairsBackup: Record<string, unknown>[] | null = null;

// Admin-managed set of suppressed pair base symbols (e.g. "SCAM").
// Populated via POST /api/admin/hidden-pairs; cleared via DELETE.
const hiddenPairSymbols = new Set<string>();

// ── coin_metadata logo map ────────────────────────────────────────────────────
// Loaded once per cache-fill cycle; maps UPPER symbol → logo URL.
// Used to enrich LE currencies and SS pairs when the provider returns no logo.
async function loadCoinMetaMap(): Promise<Map<string, string>> {
  try {
    const rows = await pool.query<{ symbol: string; image_url: string }>(
      `SELECT symbol, image_url FROM coin_metadata WHERE image_url IS NOT NULL AND image_url != ''`,
    );
    const m = new Map<string, string>();
    for (const r of rows.rows) m.set(r.symbol.toUpperCase(), r.image_url);
    return m;
  } catch {
    return new Map();
  }
}

/** Clear LE currencies + SS pairs caches so the next request re-builds with fresh logos. */
export function clearSwapCaches(): void {
  cache.delete("currencies");
  cache.delete("ss_pairs_v1");
  leCurrenciesBackup = null;
  ssPairsBackup      = null;
  logger.info("swap caches cleared (LE currencies + SS pairs)");
}

// ── Paginated background fetch ─────────────────────────────────────────────────
// After the first page is cached (fast path, serves the route within 5 s),
// this function fetches all remaining pages from the LE /v2/coins endpoint and
// extends the cache so the full 6 000+ coin list becomes available.
// It runs fire-and-forget; errors are non-fatal.
async function fetchRemainingCurrencyPages(
  firstPage: unknown[],
  metaMap: Map<string, string>,
): Promise<void> {
  try {
    const PAGE = 1000;
    const all: unknown[] = [...firstPage];
    let offset = PAGE;

    for (let p = 1; p < 20; p++) { // max 20 pages × 1 000 = 20 000 coins
      const { ok, data } = await leRequest(`/v2/coins?limit=${PAGE}&offset=${offset}`);
      if (!ok) break;
      const page = Array.isArray(data) ? data : [];
      if (!page.length) break;
      all.push(...page);
      offset += PAGE;
      if (page.length < PAGE) break; // last page — stop
    }

    if (all.length > firstPage.length) {
      const raw = normaliseV2Coins(all);
      const coins = raw.map(c => ({
        ...c,
        image: c.image ?? metaMap.get(c.symbol.toUpperCase()) ?? null,
      }));
      setCache("currencies", coins);
      leCurrenciesBackup = coins;
      logger.info(
        { total: coins.length, rawCoins: all.length, pages: Math.ceil(offset / PAGE) },
        "LE coins: full paginated fetch complete",
      );
    }
  } catch (err) {
    logger.warn({ err }, "LE coins background pagination error (non-fatal)");
  } finally {
    currenciesBgFetchActive = false;
  }
}

async function fetchAndCacheCurrencies(): Promise<NormalisedCoin[]> {
  if (currenciesInflight) return currenciesInflight;
  currenciesInflight = (async () => {
    try {
      // Phase 1 — fast first-page fetch (completes in ~1–2 s, within the
      // route's 5 s race window).  Request 1 000 coins to maximise the first
      // response without blowing the timeout.
      const { ok, data, status } = await leRequest("/v2/coins?limit=1000");
      if (!ok) throw new Error(`LE /v2/coins returned ${status}`);
      const firstPage = Array.isArray(data) ? data : [];

      const metaMap = await loadCoinMetaMap();
      const raw = normaliseV2Coins(firstPage);
      const coins = raw.map(c => ({
        ...c,
        image: c.image ?? metaMap.get(c.symbol.toUpperCase()) ?? null,
      }));
      setCache("currencies", coins);
      leCurrenciesBackup = coins; // persist beyond TTL — never go back to built-in fallback

      // Phase 2 — if the first page was full, more pages exist (LE has 6 000+
      // coins).  Kick off a background fetch for the remaining pages so the
      // full list is available within ~30–60 s of startup without blocking
      // the route response.
      if (firstPage.length >= 1000 && !currenciesBgFetchActive) {
        currenciesBgFetchActive = true;
        fetchRemainingCurrencyPages(firstPage, metaMap); // fire-and-forget
      }

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

/** Non-blocking read of the LE currencies cache. Returns built-in fallback if not yet loaded. */
export function getCachedLECurrencies(): NormalisedCoin[] {
  const hit = cached("currencies") as NormalisedCoin[] | null;
  if (hit && hit.length > 0) return hit;
  return builtInCoinsAsFallback();
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
// Returns the full LE coin list (1 000+ entries with network variants).
// On cold cache AND with an API key configured, waits up to 5 s for the live
// data so the first response after a restart carries the full list instead of
// the 331-coin built-in fallback.
//
// Both the underlying fetch and the timed Promise.race are deduplicated so that
// N concurrent cold-cache requests produce exactly one API call and one timeout
// timer instead of N separate timers all firing simultaneously.
let _timedCurrencyRace: Promise<NormalisedCoin[]> | null = null;

router.get("/letsexchange/currencies", async (_req, res) => {
  // 1. Hot cache hit — fastest path (< 1 ms)
  const hit = cached("currencies") as NormalisedCoin[] | null;
  if (hit && hit.length > 0) { res.json(hit); return; }

  // 2. Cache expired but we have a stale backup from a previous successful
  //    fetch — serve it immediately (no timeout, no warning) and refresh in bg.
  if (leCurrenciesBackup && leCurrenciesBackup.length > 0) {
    res.json(leCurrenciesBackup);
    // Background refresh so next request gets a fresh TTL entry
    if (process.env.LETSEXCHANGE_API_KEY) {
      fetchAndCacheCurrencies().catch(() => { /* silent — backup still valid */ });
    }
    return;
  }

  // 3. True cold-start (first boot, no backup yet) — try live data within 12 s.
  if (process.env.LETSEXCHANGE_API_KEY) {
    try {
      if (!_timedCurrencyRace) {
        _timedCurrencyRace = Promise.race([
          fetchAndCacheCurrencies(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 12000)
          ),
        ]).finally(() => { _timedCurrencyRace = null; });
      }
      const coins = await _timedCurrencyRace;
      res.json(coins);
      return;
    } catch {
      // Only reaches here on very first boot if LE API is unreachable for >12 s
      logger.warn("letsexchange cold-start fetch timed out — serving built-in fallback");
    }
  }

  res.json(builtInCoinsAsFallback());
});

// ── GET /api/letsexchange/usd-prices — coin→USD price map from LE cache ──────
// Returns { ETH: 2500, BTC: 95000, ... } from the shared LE price cache.
// Always responds immediately — never blocks on a live LE API call.
// A background refresh is kicked off when the cache is cold so the next
// request (after ~8-10 s) will get fresh data.
router.get("/letsexchange/usd-prices", (_req, res) => {
  const cached = getCachedLEPrices();
  res.json(cached);
  // If cache is cold, warm it in the background — fire and forget
  if (Object.keys(cached).length === 0) {
    fetchLEKeyPricesIfNeeded().catch(() => {});
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
    // Built-in: ~190 well-known coins × 22 quotes                — always available
    // Combined: ~47 000 unique pairs after deduplication
    //
    // Priority order (lower layer is applied first, higher layers override):
    //   0. built-in catalog  (ultimate fallback — always present)
    //   1. live API buildPairs  (base layer — newer coins, lastPrice=0)
    //   2. DB pairs             (override — real prices, wide all-to-all catalog)
    //   3. native spot pairs    (override — most accurate prices from the DEX)
    const mergeMap = new Map<string, Record<string, unknown>>();

    // Layer 0 (pre-seed): built-in catalog ensures we never serve an empty list
    // even when the LE API key is missing or the API is temporarily unreachable.
    buildPairs(builtInCoinsAsFallback()).forEach(p => mergeMap.set(p.symbol as string, p));

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

    // Layer 2: DB all-to-all pairs — only update price fields; keep live API metadata
    // (network, networkName, image, hasExtraId, minAmount, maxAmount) from Layer 1.
    // XRP/TON/XMR etc. need correct hasExtraId to show memo/tag fields in the UI.
    try {
      const dbPairs = await fetchLEPairsFromDB();
      dbPairs.forEach(p => {
        const existing = mergeMap.get(p.symbol as string);
        if (existing) {
          // Merge: keep live API metadata, update only price-related fields from DB
          mergeMap.set(p.symbol as string, {
            ...existing,
            lastPrice:             (p.lastPrice as number) > 0 ? p.lastPrice : existing.lastPrice,
            priceChangePercent24h: p.priceChangePercent24h != null ? p.priceChangePercent24h : existing.priceChangePercent24h,
            volume:                p.volume != null ? p.volume : existing.volume,
          });
        } else {
          // DB-only pair (not in live API): insert as-is
          mergeMap.set(p.symbol as string, p);
        }
      });
      logger.debug({ db: dbPairs.length, total: mergeMap.size }, "letsexchange /pairs: DB layer merged (price-only)");
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
    BTC: 103000, ETH: 2500,  BNB: 620,   BSV: 18,    BCH: 340,  SOL: 165,
    XRP: 2.30,   DOGE: 0.20, LTC: 88,    TRX: 0.26,  ADA: 0.72, DOT: 4.8,
    LINK: 14,    MATIC: 0.22, AVAX: 22,  UNI: 6.2,   AAVE: 180, MKR: 1600,
    SNX: 1.5,    SUSHI: 0.6, COMP: 48,   YFI: 5200,  CRV: 0.28,
    "1INCH": 0.20, FTM: 0.48, CRO: 0.10, OP: 0.78,  ARB: 0.38,
    IMX: 0.72,   APT: 5.8,   SUI: 3.50,  NEAR: 2.8,  FIL: 3.2,
    ICP: 5.4,    ATOM: 4.0,  ALGO: 0.18, MANA: 0.22, SAND: 0.24,
    AXS: 4.2,    THETA: 0.78, VET: 0.025, ETC: 19,   XLM: 0.28,
    ZIL: 0.012,  ENJ: 0.10,  BAT: 0.14,  ZRX: 0.26,  GRT: 0.12,
    LRC: 0.12,   DYDX: 0.60, PEPE: 0.000013, SHIB: 0.000015,
    FLOKI: 0.00011, BONK: 0.000022, WIF: 1.2,  POPCAT: 0.32,
    TON: 3.4,    NOT: 0.0060, HMSTR: 0.0015, DOGS: 0.00020,
    INJ: 9.8,    SEI: 0.22,  TIA: 3.2,   PYTH: 0.20, JUP: 0.52,
    RNDR: 4.2,   WLD: 1.10,  FET: 0.72,  AGIX: 0.48, OCEAN: 0.38,
    TAO: 380,    ROSE: 0.052, CFX: 0.090, STX: 0.82, AR: 8.2,
    KAS: 0.088,  JASMY: 0.018, ACH: 0.020, MAGIC: 0.34, GMX: 14,
    PERP: 0.38,  BICO: 0.10, BAND: 0.90, REN: 0.038, NMR: 13,
    RAY: 2.2,    MNGO: 0.010, ORCA: 0.30, JTO: 1.8,
    RSR: 0.0055, LQTY: 0.68, ALCX: 9, SPELL: 0.00048, CVX: 2.0, BAL: 1.4,
    ANKR: 0.020, SKL: 0.022, CTSI: 0.072, STORJ: 0.38, OGN: 0.060,
    DOGINME: 0.0001, LMWR: 0.018, TURBO: 0.0088, MOG: 0.0000090,
    MEW: 0.0062, NEIRO: 0.00052, MEME: 0.011, EIGEN: 2.60,
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

// ── GET /api/simpleswap/pairs ─────────────────────────────────────────────────
// Returns all SimpleSwap coins expressed as OrahDEX pair objects using the same
// quote currencies as the LE pairs endpoint.  Deduplication against LE happens
// on the frontend (LE wins when both sources carry the same base symbol).
router.get("/simpleswap/pairs", async (req, res) => {
  const filterQuote = typeof req.query.quote === "string" ? req.query.quote.toUpperCase() : null;
  const returnAll   = req.query.all === "true" || req.query.all === "1";

  // SS ticker → canonical OrahDEX symbol (network-specific tickers collapse to base symbol)
  const SS_TO_SYMBOL: Record<string, string> = {
    usdterc20: "USDT",  usdttrc20: "USDT", usdtbsc:   "USDT", usdtsol:   "USDT",
    usdtmatic: "USDT",  usdtton:   "USDT", usdtop:    "USDT", usdtarb:   "USDT",
    usdtavax:  "USDT",  usdtalgo:  "USDT", usdtkava:  "USDT", usdtcelo:  "USDT",
    usdcerc20: "USDC",  usdcbsc:   "USDC", usdcsol:   "USDC", usdcmatic: "USDC",
    usdcop:    "USDC",  usdcarb:   "USDC", usdcbase:  "USDC", usdcavax:  "USDC",
    usdcton:   "USDC",
    "bnb-bsc": "BNB",   bnbbsc:    "BNB",
    pol:       "MATIC",
    avaxc:     "AVAX",
    etharb:    "ETH",   ethop:     "ETH",  ethbase:   "ETH",  ethlinea:  "ETH",
    ethscroll: "ETH",   ethbsc:    "ETH",
    wbtcerc20: "WBTC",  wbtcbsc:   "WBTC",
    daierc20:  "DAI",   daibsc:    "DAI",  daimatic:  "DAI",  daiarb:    "DAI",
    linkbsc:   "LINK",  unibsc:    "UNI",
  };

  function normalizeSsSymbol(ticker: string): string | null {
    if (!ticker) return null;
    const mapped = SS_TO_SYMBOL[ticker.toLowerCase()];
    if (mapped) return mapped;
    const cleaned = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleaned.length < 1 || cleaned.length > 12) return null;
    return cleaned;
  }

  const SS_PAIRS_TTL = 60 * 60 * 1000; // 1 hour
  const cacheKey = "ss_pairs_v1";
  let builtPairs = cached(cacheKey, SS_PAIRS_TTL) as Record<string, unknown>[] | null;

  if (!builtPairs) {
    // Priority order (lower applied first, higher overrides):
    //   0. DB stored SS pairs  — stable, survives restarts, has real prices
    //   1. Live SS API         — newer coins, enriches metadata (image, hasExtraId)
    const mergeMap = new Map<string, Record<string, unknown>>();

    // Layer 0: DB — always available even when SS API is down
    try {
      const dbRows = await db.select({
        symbol:                marketsTable.symbol,
        baseAsset:             marketsTable.baseAsset,
        quoteAsset:            marketsTable.quoteAsset,
        lastPrice:             marketsTable.lastPrice,
        priceChangePercent24h: marketsTable.priceChangePercent24h,
      }).from(marketsTable).where(
        and(eq(marketsTable.type, "simpleswap"), eq(marketsTable.enabled, true)),
      );
      const changeMap = getCoinChangeMap();
      for (const r of dbRows) {
        mergeMap.set(r.symbol, {
          symbol: r.symbol, baseAsset: r.baseAsset, quoteAsset: r.quoteAsset,
          network: null, networkName: null, image: null, hasExtraId: false,
          minAmount: null, maxAmount: null,
          lastPrice:             parseFloat(String(r.lastPrice)) || 0,
          priceChangePercent24h: parseFloat(String(r.priceChangePercent24h)) || (changeMap[r.baseAsset] ?? 0),
          volume: 0, type: "simpleswap", ssSource: true, leSource: false,
        });
      }
      logger.debug({ rows: dbRows.length }, "simpleswap /pairs: DB layer loaded");
    } catch (err: any) {
      logger.warn({ err }, "simpleswap /pairs: DB layer failed (non-fatal)");
    }

    // Layer 1: Live SS API — adds newer coins and enriches metadata
    const currencies = await fetchSSCurrencies();
    if (currencies.length > 0) {
      const seenSymbols = new Set<string>();
      const uniqueCoins: { symbol: string; name: string; network: string | null; image: string | null; hasExtraId: boolean }[] = [];
      for (const c of currencies) {
        const sym = normalizeSsSymbol(c.symbol);
        if (!sym || seenSymbols.has(sym)) continue;
        seenSymbols.add(sym);
        uniqueCoins.push({ symbol: sym, name: c.name, network: c.network, image: c.image, hasExtraId: c.hasExtraId });
      }
      const QUOTES_SET = new Set(LE_PAIR_QUOTES);
      for (const coin of uniqueCoins) {
        if (QUOTES_SET.has(coin.symbol)) continue;
        for (const q of LE_PAIR_QUOTES) {
          if (coin.symbol === q) continue;
          const sym = `${coin.symbol}/${q}`;
          const existing = mergeMap.get(sym);
          mergeMap.set(sym, {
            ...(existing ?? {}),
            symbol: sym, baseAsset: coin.symbol, quoteAsset: q,
            network: coin.network, networkName: null, image: coin.image,
            hasExtraId: coin.hasExtraId, minAmount: null, maxAmount: null,
            lastPrice:             (existing?.lastPrice as number) || 0,
            priceChangePercent24h: (existing?.priceChangePercent24h as number) || 0,
            volume: (existing?.volume as number) || 0,
            type: "simpleswap", ssSource: true, leSource: false,
          });
        }
      }
      logger.debug({ coins: uniqueCoins.length }, "simpleswap /pairs: live API layer merged");
    }

    builtPairs = Array.from(mergeMap.values());
    // Enrich missing logos from coin_metadata (CoinPaprika data)
    if (builtPairs.length > 0) {
      const metaMap = await loadCoinMetaMap();
      builtPairs = builtPairs.map(p => ({
        ...p,
        image: (p as any).image || metaMap.get(String((p as any).baseAsset ?? "").toUpperCase()) || null,
      }));
      setCache(cacheKey, builtPairs);
      ssPairsBackup = builtPairs;
    }
    logger.info({ total: builtPairs.length }, "simpleswap /pairs: built");
  }

  // Fall back to stale in-memory backup if build produced nothing
  const source = (builtPairs && builtPairs.length > 0) ? builtPairs : ssPairsBackup;
  if (!source) {
    res.status(503).json({ error: "SimpleSwap currencies unavailable" });
    return;
  }

  // Filter admin-hidden symbols
  const visible = hiddenPairSymbols.size > 0
    ? source.filter((p: Record<string, unknown>) => !hiddenPairSymbols.has(String(p.baseAsset ?? "")))
    : source;

  let result = visible;
  if (!returnAll && filterQuote) {
    result = visible.filter((p: Record<string, unknown>) => p.quoteAsset === filterQuote);
  } else if (!returnAll) {
    result = visible.filter((p: Record<string, unknown>) => p.quoteAsset === "BSV");
  }

  res.set("Cache-Control", "public, max-age=300");
  res.json(result);
});

// ── Admin: hidden pairs management ───────────────────────────────────────────
// POST /api/admin/hidden-pairs        { symbol: "SCAM" }  → hides the pair
// DELETE /api/admin/hidden-pairs/:sym                    → unhides the pair
// GET  /api/admin/hidden-pairs                           → list hidden symbols
router.get("/admin/hidden-pairs", (_req, res) => {
  res.json({ hidden: Array.from(hiddenPairSymbols) });
});

router.post("/admin/hidden-pairs", (req, res) => {
  const sym = typeof req.body?.symbol === "string" ? req.body.symbol.trim().toUpperCase() : null;
  if (!sym) { res.status(400).json({ error: "symbol required" }); return; }
  hiddenPairSymbols.add(sym);
  // Invalidate SS cache so next request rebuilds without hidden coin
  cache.delete("ss_pairs_v1");
  logger.info({ sym }, "admin: pair hidden");
  res.json({ hidden: sym, total: hiddenPairSymbols.size });
});

router.delete("/admin/hidden-pairs/:sym", (req, res) => {
  const sym = req.params.sym?.toUpperCase() ?? "";
  hiddenPairSymbols.delete(sym);
  cache.delete("ss_pairs_v1");
  logger.info({ sym }, "admin: pair unhidden");
  res.json({ unhidden: sym, total: hiddenPairSymbols.size });
});

// ── GET /api/letsexchange/pairs/count ─────────────────────────────────────────
// Lightweight count endpoint so clients can show total pair counts without
// transferring the full pairs payload.
router.get("/letsexchange/pairs/count", async (req, res) => {
  const filterQuote = typeof req.query.quote === "string" ? req.query.quote.toUpperCase() : null;
  const returnAll   = req.query.all === "true" || req.query.all === "1";

  // Fast path: when ?all=true, return native market count + LE API pair estimate.
  // We deliberately exclude type='letsexchange' rows from the DB count — those are
  // synthetic rows seeded only in dev, so counting them would produce wildly different
  // totals between dev (1.17 M rows) and production (0 rows).  Instead we derive the
  // LE pair count from the live LE API coin list (same in every environment).
  if (returnAll && !filterQuote) {
    try {
      const [nativeRows] = await db
        .select({ count: sql<number>`count(*)` })
        .from(marketsTable)
        .where(and(eq(marketsTable.enabled, true), ne(marketsTable.type, "letsexchange")));
      const nativeCount = Number(nativeRows?.count ?? 0);

      // Use cached LE coin list if available, otherwise fall back to built-in catalog.
      let leCoins: NormalisedCoin[] | null = cached("currencies") as NormalisedCoin[] | null;
      if (!leCoins || leCoins.length < 10) {
        try { leCoins = await fetchAndCacheCurrencies(); } catch { /* non-fatal */ }
      }
      const leCoinCount = (leCoins && leCoins.length > 0) ? leCoins.length : builtInCoinsAsFallback().length;
      // All-to-all LE pairs (directional: A→B and B→A are both valid swaps)
      const leEstimate = leCoinCount * leCoinCount;

      const total = nativeCount + leEstimate;
      res.set("Cache-Control", `public, max-age=${COUNT_CACHE_MAX_AGE_SECONDS}`);
      res.json({ count: total });
      return;
    } catch { /* fall through to original logic */ }
  }

  // Guard: fast-path above may have partially committed headers (e.g. res.set()
  // succeeded but res.json() threw because the socket closed mid-write).
  // If headers are already sent, do not attempt another response.
  if (res.headersSent) return;

  try {
    const cacheKey = "le_pairs_all";
    let lePairs = cached(cacheKey) as Record<string, unknown>[] | null;
    let coins: NormalisedCoin[] | null | undefined;

    if (!lePairs) {
      // Mirrors /pairs: Layer 0 (built-in) + Layer 1 (live API) + Layer 2 (DB)
      const mergeMap = new Map<string, Record<string, unknown>>();
      // Layer 0: built-in catalog ensures a non-zero count even without API key / DB
      buildPairs(builtInCoinsAsFallback()).forEach(p => mergeMap.set(p.symbol as string, p));
      try {
        coins = cached("currencies") as NormalisedCoin[] | null;
        if (!coins) coins = await fetchAndCacheCurrencies();
        if (coins && coins.length >= 100) buildPairs(coins).forEach(p => mergeMap.set(p.symbol as string, p));
      } catch { /* non-fatal */ }
      try {
        const dbPairs = await fetchLEPairsFromDB();
        dbPairs.forEach(p => {
          const existing = mergeMap.get(p.symbol as string);
          if (existing) {
            mergeMap.set(p.symbol as string, {
              ...existing,
              lastPrice:             (p.lastPrice as number) > 0 ? p.lastPrice : existing.lastPrice,
              priceChangePercent24h: p.priceChangePercent24h != null ? p.priceChangePercent24h : existing.priceChangePercent24h,
              volume:                p.volume != null ? p.volume : existing.volume,
            });
          } else {
            mergeMap.set(p.symbol as string, p);
          }
        });
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
    if (!res.headersSent) res.json({ count: 0 });
  }
});

// ── POST /api/letsexchange/estimate ──────────────────────────────────────────
// Hybrid: queries ALL configured venues (LetsExchange, ChangeNOW, StealthEX,
// SimpleSwap) in parallel and returns the best rate.  Response includes
// best_venue so the frontend can route exchange creation to the winner.
// ── Estimate result cache ─────────────────────────────────────────────────────
// Each call fires 5 parallel HTTP requests to external venues.  Multiple users
// polling every 45 s for the same pair would cause unbounded connection growth.
// Cache results for 60 s so concurrent sessions share one outbound request set.
const ESTIMATE_CACHE_TTL_MS = 60_000;
interface EstimateCacheEntry { body: unknown; expiresAt: number }
const estimateCache = new Map<string, EstimateCacheEntry>();
function estimateCacheKey(from: string, to: string, amt: number, forceVenue: string | null): string {
  // Bucket amount to 2 significant figures to improve hit rate without losing precision.
  const mag  = amt > 0 ? Math.pow(10, Math.floor(Math.log10(amt)) - 1) : 1;
  const buck = Math.round(amt / mag) * mag;
  return `${from}:${to}:${buck}:${forceVenue ?? ""}`;
}
// Lazy expiry — purge stale entries periodically to prevent unbounded map growth.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of estimateCache) if (now > v.expiresAt) estimateCache.delete(k);
}, 5 * 60_000).unref();

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

  // ── Cache lookup (skip for force_venue calls — those are explicit comparisons) ──
  const forceVenueRaw = typeof body.force_venue === "string" ? body.force_venue as ExternalVenue : null;
  if (!forceVenueRaw) {
    const cacheKey = estimateCacheKey(from, to, amt, null);
    const cached = estimateCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      res.setHeader("X-Cache", "HIT");
      res.json(cached.body);
      return;
    }
  }

  try {
    // Query all configured venues in parallel via the meta-router
    const lePrices = getCachedLEPrices();
    const inUsd  = lePrices[from]  ?? 1;
    const outUsd = lePrices[to]    ?? 1;

    // When force_venue is provided, pin to that single provider only
    const ALL_VENUES: ExternalVenue[] = ["letsexchange", "simpleswap", "changenow", "stealthex", "changelly", "swapzone"];
    const routePrefs = forceVenueRaw ? {
      preferredVenues: [forceVenueRaw],
      blacklistVenues: ALL_VENUES.filter(v => v !== forceVenueRaw),
    } : undefined;

    const { best, all, errors, lowestMin } = await getBestExternalQuote(from, to, amt, inUsd, outUsd, routePrefs);
    if (!best) {
      const errDetails = Object.entries(errors)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      // If lowestMin is set, the pair IS supported — the user just needs to send more.
      // Return 422 with min_amount so the frontend can show a helpful prompt.
      if (lowestMin != null && lowestMin > 0) {
        res.status(422).json({
          error:          "below_minimum",
          min_amount:     String(lowestMin),
          pair_supported: true,
          detail:         errDetails,
        });
        return;
      }
      // All live venues failed — check DB for a cached rate as last resort.
      // This keeps every pair quotable even during complete API outages.
      try {
        const [cachedRow] = await db
          .select({ lastPrice: marketsTable.lastPrice })
          .from(marketsTable)
          .where(eq(marketsTable.symbol, `${from}/${to}`))
          .limit(1);
        const cachedRate = parseFloat(cachedRow?.lastPrice ?? "0");
        if (cachedRate > 0) {
          logger.info({ from, to, cachedRate }, "estimate: all venues failed — serving cached DB rate");
          res.json({
            amount:             String(cachedRate * amt),
            rate:               String(cachedRate),
            min_amount:         "",
            max_amount:         "",
            rate_id:            null,
            rate_id_expired_at: null,
            withdrawal_fee:     "0",
            best_venue:         "cached",
            stale:              true,
            venue_quotes:       [],
          });
          return;
        }
      } catch { /* non-fatal — fall through to 503 */ }
      res.status(503).json({ error: `No rate available for ${from}→${to}`, detail: errDetails }); return;
    }

    // For LetsExchange winner: fetch rate_id for optional fixed-rate locking
    let rate_id: string | null = null;
    let rate_id_expired_at: string | null = null;
    if (best.venue === "letsexchange" && process.env.LETSEXCHANGE_API_KEY) {
      try {
        const leBody: Record<string, unknown> = {
          from, to, network_from, network_to, amount: amt,
          affiliate_id: AFFILIATE_ID, float: isFloat ?? false,
        };
        const { ok: leOk, data: leData } = await leRequest("/v1/info", "POST", leBody);
        if (leOk && leData && typeof leData === "object") {
          const d = leData as Record<string, unknown>;
          rate_id = d.rate_id ? String(d.rate_id) : null;
          rate_id_expired_at = d.rate_id_expired_at ? String(d.rate_id_expired_at) : null;
        }
      } catch { /* non-fatal — proceed with floating rate */ }
    }

    const estimatedOutput = best.expectedOutput;
    const rate = amt > 0 ? estimatedOutput / amt : 0;

    // Non-blocking: persist live rate to DB so future fallbacks use real rates.
    // Covers all 1.88M bridge pairs over time as users trade them.
    if (rate > 0) {
      db.update(marketsTable)
        .set({ lastPrice: String(rate) })
        .where(eq(marketsTable.symbol, `${from}/${to}`))
        .catch(() => {}); // non-fatal — never block the response
    }

    // Use the winning venue's minAmount; fall back to lowestMin across all venues
    // so the UI always shows a real minimum (never "0" or blank).
    const resolvedMin = best.minAmount ?? lowestMin;
    const resolvedMax = best.maxAmount ?? null;

    // Per-venue quotes for price comparison UI (LE + SS shown side by side)
    const venue_quotes = all.map(q => ({
      venue:      q.venue,
      rate:       q.inputAmount > 0 ? String(q.expectedOutput / q.inputAmount) : null,
      output:     String(q.expectedOutput),
      minAmount:  q.minAmount != null ? String(q.minAmount) : null,
      maxAmount:  q.maxAmount != null ? String(q.maxAmount) : null,
      canExecute: q.canExecute,
    }));

    const responseBody = {
      amount:             String(estimatedOutput),
      rate:               String(rate),
      min_amount:         resolvedMin != null && resolvedMin > 0 ? String(resolvedMin) : "",
      max_amount:         resolvedMax != null && resolvedMax > 0 ? String(resolvedMax) : "",
      rate_id,
      rate_id_expired_at,
      withdrawal_fee:     "0",
      best_venue:         best.venue,
      venue_quotes,
    };

    // Store in cache (only non-force_venue calls; rate_id is short-lived but still useful)
    if (!forceVenueRaw && rate > 0) {
      const cacheKey = estimateCacheKey(from, to, amt, null);
      estimateCache.set(cacheKey, { body: responseBody, expiresAt: Date.now() + ESTIMATE_CACHE_TTL_MS });
    }

    res.json(responseBody);
  } catch (err: any) {
    logger.error({ err }, "letsexchange /estimate failed");
    res.status(502).json({ error: "Failed to reach exchange providers" });
  }
});

// ── POST /api/letsexchange/exchange ──────────────────────────────────────────
// Hybrid: routes to the winning venue from /estimate (passed as best_venue).
// Falls back to LetsExchange when best_venue is omitted or "letsexchange".
// Response is normalised to the same OrderResult shape regardless of venue.
router.post("/letsexchange/exchange", async (req, res) => {
  const {
    coin_from, coin_to, network_from, network_to,
    deposit_amount, withdrawal, withdrawal_extra_id,
    return: refund, return_extra_id,
    rate_id, float: isFloat, email,
    best_venue: rawBestVenue,
  } = req.body ?? {};

  if (!coin_from || !coin_to || !network_from || !network_to || !deposit_amount || !withdrawal) {
    res.status(400).json({ error: "coin_from, coin_to, network_from, network_to, deposit_amount, and withdrawal are required" }); return;
  }
  const amt = parseFloat(String(deposit_amount));
  if (!isFinite(amt) || amt <= 0) { res.status(400).json({ error: "deposit_amount must be positive" }); return; }
  const withdrawalStr = String(withdrawal).trim();
  if (withdrawalStr.length < 10 || withdrawalStr.length > 200) {
    res.status(400).json({ error: "Invalid withdrawal address" }); return;
  }

  const bestVenue: string = typeof rawBestVenue === "string" ? rawBestVenue : "letsexchange";
  const fromU       = String(coin_from).toUpperCase();
  const toU         = String(coin_to).toUpperCase();
  const fromNetwork = String(network_from).trim().toUpperCase();
  const toNetwork   = String(network_to).trim().toUpperCase();

  try {
    // ── Auto-fallback exchange creation ───────────────────────────────────────
    // Try the winning venue first; on any failure fall through to the next in
    // priority order so a single-venue outage never blocks the whole flow.
    const VENUE_PRIORITY = ["changenow", "stealthex", "simpleswap", "changelly", "letsexchange"] as const;
    const orderedVenues = [
      bestVenue,
      ...VENUE_PRIORITY.filter(v => v !== bestVenue),
    ];

    const venueErrors: Record<string, string> = {};

    for (const venue of orderedVenues) {
      // ── ChangeNOW ───────────────────────────────────────────────────────────
      if (venue === "changenow") {
        const result = await createCNExchange({
          from:          fromU,
          to:            toU,
          amount:        amt,
          address:       withdrawalStr,
          extraId:       withdrawal_extra_id ? String(withdrawal_extra_id) : undefined,
          refundAddress: refund ? String(refund) : undefined,
        });
        if (result.ok) {
          if (venue !== bestVenue) logger.warn({ originalVenue: bestVenue, fallbackVenue: venue }, "exchange: fell back to alternate venue");
          const ex = result.exchange;
          recordBridgeFee(amt, fromU, ex.id ?? "changenow");
          res.json({
            transaction_id:    ex.id,
            status:            "wait",
            deposit:           ex.depositAddress,
            deposit_extra_id:  ex.depositExtraId ?? null,
            deposit_amount:    String(amt),
            withdrawal_amount: ex.estimatedAmount ?? "0",
            withdrawal:        withdrawalStr,
            coin_from:         fromU,
            coin_to:           toU,
            coin_from_network: fromNetwork,
            coin_to_network:   toNetwork,
            best_venue:        "changenow",
          });
          return;
        }
        venueErrors["changenow"] = result.error;
        logger.warn({ error: result.error, from: fromU, to: toU }, "exchange: changenow failed, trying next venue");
        continue;
      }

      // ── StealthEX ───────────────────────────────────────────────────────────
      if (venue === "stealthex") {
        const result = await createSXExchange({
          from:    fromU,
          to:      toU,
          amount:  amt,
          address: withdrawalStr,
          extraId: withdrawal_extra_id ? String(withdrawal_extra_id) : undefined,
        });
        if (result.ok) {
          if (venue !== bestVenue) logger.warn({ originalVenue: bestVenue, fallbackVenue: venue }, "exchange: fell back to alternate venue");
          const ex = result.exchange;
          recordBridgeFee(amt, fromU, ex.id ?? "stealthex");
          res.json({
            transaction_id:    ex.id,
            status:            "wait",
            deposit:           ex.depositAddress,
            deposit_extra_id:  ex.depositExtraId ?? null,
            deposit_amount:    String(amt),
            withdrawal_amount: ex.estimatedAmount ?? "0",
            withdrawal:        withdrawalStr,
            coin_from:         fromU,
            coin_to:           toU,
            coin_from_network: fromNetwork,
            coin_to_network:   toNetwork,
            best_venue:        "stealthex",
          });
          return;
        }
        venueErrors["stealthex"] = result.error;
        logger.warn({ error: result.error, from: fromU, to: toU }, "exchange: stealthex failed, trying next venue");
        continue;
      }

      // ── SimpleSwap ──────────────────────────────────────────────────────────
      if (venue === "simpleswap") {
        const result = await createSsExchangePair({
          from:    fromU,
          to:      toU,
          amount:  amt,
          address: withdrawalStr,
          extraId: withdrawal_extra_id ? String(withdrawal_extra_id) : undefined,
        });
        if (result.ok) {
          if (venue !== bestVenue) logger.warn({ originalVenue: bestVenue, fallbackVenue: venue }, "exchange: fell back to alternate venue");
          const ex = result.exchange;
          recordBridgeFee(amt, fromU, ex.id ?? "simpleswap");
          res.json({
            transaction_id:    ex.id,
            status:            "wait",
            deposit:           ex.depositAddress,
            deposit_extra_id:  ex.depositExtraId ?? null,
            deposit_amount:    String(amt),
            withdrawal_amount: ex.withdrawalAmount ?? "0",
            withdrawal:        withdrawalStr,
            coin_from:         fromU,
            coin_to:           toU,
            coin_from_network: fromNetwork,
            coin_to_network:   toNetwork,
            best_venue:        "simpleswap",
          });
          return;
        }
        venueErrors["simpleswap"] = result.error;
        logger.warn({ error: result.error, from: fromU, to: toU }, "exchange: simpleswap failed, trying next venue");
        continue;
      }

      // ── Changelly ───────────────────────────────────────────────────────────
      if (venue === "changelly") {
        if (!isChangellyConfigured()) {
          venueErrors["changelly"] = "CHANGELLY_API_KEY or CHANGELLY_API_SECRET not configured";
          continue;
        }
        const result = await createChangellyExchange({
          from:           fromU,
          to:             toU,
          amount:         amt,
          address:        withdrawalStr,
          extraId:        withdrawal_extra_id ? String(withdrawal_extra_id) : undefined,
          refundAddress:  refund ? String(refund) : undefined,
        });
        if (result.ok) {
          if (venue !== bestVenue) logger.warn({ originalVenue: bestVenue, fallbackVenue: venue }, "exchange: fell back to alternate venue");
          const ex = result.exchange;
          recordBridgeFee(amt, fromU, ex.id ?? "changelly");
          res.json({
            transaction_id:    ex.id,
            status:            "wait",
            deposit:           ex.depositAddress,
            deposit_extra_id:  ex.depositExtraId ?? null,
            deposit_amount:    String(amt),
            withdrawal_amount: ex.estimatedAmount ?? "0",
            withdrawal:        withdrawalStr,
            coin_from:         fromU,
            coin_to:           toU,
            coin_from_network: fromNetwork,
            coin_to_network:   toNetwork,
            best_venue:        "changelly",
          });
          return;
        }
        venueErrors["changelly"] = result.error;
        logger.warn({ error: result.error, from: fromU, to: toU }, "exchange: changelly failed, trying next venue");
        continue;
      }

      // ── LetsExchange (default / last-resort) ─────────────────────────────────
      if (!process.env.LETSEXCHANGE_API_KEY) {
        venueErrors["letsexchange"] = "LETSEXCHANGE_API_KEY not configured";
        continue;
      }

      const leBody: Record<string, unknown> = {
        float:               isFloat ?? false,
        coin_from:           fromU,
        coin_to:             toU,
        network_from:        fromNetwork,
        network_to:          toNetwork,
        deposit_amount:      amt,
        withdrawal:          withdrawalStr,
        withdrawal_extra_id: withdrawal_extra_id != null ? String(withdrawal_extra_id) : "",
        affiliate_id:        AFFILIATE_ID,
      };
      if (refund)          leBody["return"]          = String(refund);
      if (return_extra_id) leBody["return_extra_id"] = String(return_extra_id);
      if (rate_id)         leBody["rate_id"]         = String(rate_id);
      if (email)           leBody["email"]           = String(email);

      const { ok: leOk, data: leData, status: leStatus } = await leRequest("/v1/transaction", "POST", leBody);
      if (leStatus === 403) { res.status(403).json({ error: "Invalid API key", detail: leData }); return; }
      if (!leOk) {
        venueErrors["letsexchange"] = `LetsExchange HTTP ${leStatus}`;
        logger.warn({ status: leStatus, from: fromU, to: toU }, "exchange: letsexchange failed, no more venues");
        continue;
      }

      if (venue !== bestVenue) logger.warn({ originalVenue: bestVenue, fallbackVenue: "letsexchange" }, "exchange: fell back to alternate venue");
      const d = leData as Record<string, unknown>;
      if (d?.transaction_id) {
        recordBridgeFee(amt, fromU, String(d.transaction_id));
        const leUsd = getCachedLEPrices();
        const fromUsd = leUsd[fromU] ?? 0;
        const depositUsd = fromUsd > 0 ? (amt * fromUsd).toFixed(4) : null;
        db.insert(leSwapsTable).values({
          id:               String(d.transaction_id),
          coinFrom:         fromU,
          coinTo:           toU,
          networkFrom:      fromNetwork,
          networkTo:        toNetwork,
          depositAmount:    String(amt),
          withdrawalAmount: d.withdrawal_amount ? String(d.withdrawal_amount) : null,
          depositAmountUsd: depositUsd,
          status:           String(d.status ?? "waiting"),
          withdrawal:       withdrawalStr,
        }).onConflictDoNothing().catch(e => logger.warn({ err: e }, "le_swaps insert failed"));
      }
      res.json({ ...d, best_venue: "letsexchange" });
      return;
    }

    // All venues failed
    const errorSummary = Object.entries(venueErrors).map(([v, e]) => `${v}: ${e}`).join("; ");
    logger.error({ venueErrors, from: fromU, to: toU }, "exchange: all venues failed");
    res.status(422).json({ error: "No exchange provider could fulfil this pair at this amount. Please try a different amount or contact support.", detail: errorSummary });
  } catch (err: any) {
    logger.error({ err }, "letsexchange /exchange failed");
    res.status(502).json({ error: "Failed to reach exchange provider" });
  }
});

// ── GET /api/letsexchange/status/:id ─────────────────────────────────────────
// Hybrid: routes to the correct venue via ?venue=changenow|stealthex|simpleswap.
// Defaults to LetsExchange. Normalises all responses to a common StatusResult shape.
router.get("/letsexchange/status/:id", async (req, res) => {
  const { id } = req.params;
  const venue = typeof req.query.venue === "string" ? req.query.venue : "letsexchange";
  if (!id) { res.status(400).json({ error: "id is required" }); return; }

  // Map venue-specific status strings to the LE vocabulary used by the frontend
  const normalizeStatus = (raw: string): string => {
    const map: Record<string, string> = {
      new: "wait", waiting: "wait",
      confirming: "confirmation", verifying: "confirmation",
      exchanging: "exchanging", sending: "sending",
      finished: "finished", failed: "failed",
      refunded: "refunded", overdue: "overdue",
      emergency: "failed",
    };
    return map[raw.toLowerCase()] ?? raw;
  };

  // Helper: try to get status from one specific venue.
  // Returns the normalised status object or null if not found.
  const tryGetStatus = async (v: string, exchangeId: string): Promise<Record<string, unknown> | null> => {
    try {
      if (v === "changenow") {
        const result = await getCNExchange(exchangeId);
        if (!result || !result.status) return null;
        return { transaction_id: exchangeId, status: normalizeStatus(result.status), hash_out: result.txTo ?? null, best_venue: "changenow" };
      }
      if (v === "stealthex") {
        const result = await getSXExchange(exchangeId);
        if (!result || !result.status) return null;
        return { transaction_id: exchangeId, status: normalizeStatus(result.status), hash_out: result.txTo ?? null, best_venue: "stealthex" };
      }
      if (v === "simpleswap") {
        const result = await getSsExchange(exchangeId);
        if (!result || !result.status) return null;
        return { transaction_id: exchangeId, status: normalizeStatus(result.status), hash_out: result.txTo ?? null, best_venue: "simpleswap" };
      }
      if (v === "changelly") {
        const result = await getChangellyExchange(exchangeId);
        if (!result || !result.status) return null;
        return { transaction_id: exchangeId, status: normalizeStatus(result.status), hash_out: result.txTo ?? null, best_venue: "changelly" };
      }
      // LetsExchange
      const { ok: leOk, data: leData, status: leHttpStatus } = await leRequest(`/v1/transaction/${encodeURIComponent(exchangeId)}`);
      if (leHttpStatus === 403) return null;
      if (!leOk || !leData || typeof leData !== "object") return null;
      const d = leData as Record<string, unknown>;
      if (!d.transaction_id && !d.status) return null;
      return { ...d, best_venue: "letsexchange" };
    } catch {
      return null;
    }
  };

  try {
    // ── Try primary venue ─────────────────────────────────────────────────────
    const primaryResult = await tryGetStatus(venue, id);
    if (primaryResult) {
      // Sync LE swap status to DB
      if (venue === "letsexchange" && primaryResult.transaction_id && primaryResult.status) {
        const isFinished = ["finished", "refunded", "overdue", "emergency"].includes(String(primaryResult.status));
        db.update(leSwapsTable).set({
          status:           String(primaryResult.status),
          withdrawalAmount: primaryResult.withdrawal_amount ? String(primaryResult.withdrawal_amount) : undefined,
          completedAt:      isFinished ? new Date() : undefined,
        } as any).where(eq(leSwapsTable.id, String(primaryResult.transaction_id)))
          .catch(e => logger.warn({ err: e }, "le_swaps status sync failed"));
      }
      res.json(primaryResult);
      return;
    }

    // ── Rescue: try all other venues in case venue metadata was lost ──────────
    const ALL_VENUES = ["changenow", "stealthex", "simpleswap", "changelly", "letsexchange", "swapzone"];
    for (const fallbackVenue of ALL_VENUES.filter(v => v !== venue)) {
      const rescued = await tryGetStatus(fallbackVenue, id);
      if (rescued) {
        logger.info({ id, originalVenue: venue, foundVenue: fallbackVenue }, "status: rescued exchange on alternate venue");
        res.json({ ...rescued, venue_rescued: true });
        return;
      }
    }

    res.status(404).json({ error: "Exchange not found" });
  } catch (err: any) {
    logger.error({ err }, "letsexchange /status failed");
    res.status(502).json({ error: "Failed to reach exchange provider" });
  }
});

// ── GET /api/letsexchange/config ─────────────────────────────────────────────
// Returns the affiliate ID derived from the JWT so the frontend can construct
// the widget iframe URL without exposing the raw API key.
router.get("/letsexchange/config", (_req, res) => {
  res.json({ affiliateId: AFFILIATE_ID || null });
});

// Pre-warm LE coin + price cache at startup.
// fetchAndCacheCurrencies() fetches the first 1 000 coins immediately, then
// kicks off background pagination for the remaining 5 000+ pages so the full
// list is available within ~30–60 s without blocking any request.
(async () => {
  try {
    const coins = await fetchAndCacheCurrencies();
    if (coins.length > 0) await fetchLEPricesUSD(coins);
  } catch { /* non-fatal */ }
})();

export default router;
