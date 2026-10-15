/**
 * universalMarkets.ts — Virtual N×(N-1) tradeable pair catalog.
 *
 * Collects unique canonical asset symbols from:
 *   1. Internal FALLBACK_PRICES (~160 coins) — highest priority, always present
 *   2. LetsExchange live /v2/coins or built-in fallback (~190–331 coins)
 *   3. SimpleSwap /get_all_currencies (~3 000 coins, normalized to canonical tickers)
 *
 * Pairs are generated only for the requested page. They are never inserted into
 * PostgreSQL, so a 5,000-asset universe can expose ~25M directional pairs safely.
 */
import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import { FALLBACK_PRICES } from "./priceUpdater.js";

export const CATALOG_MAX_ASSETS = 10_000;
const ASSET_CACHE_TTL = 30 * 60 * 1000;
let assetCache: { assets: string[]; expiresAt: number } | null = null;
let assetInflight: Promise<string[]> | null = null;

// ── SS network-specific ticker → canonical OrahDEX symbol ─────────────────────
// Mirrors SS_TO_SYMBOL in priceUpdater.ts; duplicated here to avoid circular import.
const SS_NORM: Record<string, string> = {
  usdterc20:"USDT", usdttrc20:"USDT", usdtbsc:"USDT",   usdtsol:"USDT",
  usdtmatic:"USDT", usdtton:"USDT",   usdtop:"USDT",    usdtarb:"USDT",
  usdtavax:"USDT",  usdtalgo:"USDT",  usdtkava:"USDT",  usdtcelo:"USDT",
  usdcerc20:"USDC", usdcbsc:"USDC",   usdcsol:"USDC",   usdcmatic:"USDC",
  usdcop:"USDC",    usdcarb:"USDC",   usdcbase:"USDC",  usdcavax:"USDC", usdcton:"USDC",
  "bnb-bsc":"BNB",  bnbbsc:"BNB",     pol:"MATIC",      avaxc:"AVAX",
  etharb:"ETH",     ethop:"ETH",      ethbase:"ETH",    ethlinea:"ETH",
  ethscroll:"ETH",  ethbsc:"ETH",
  wbtcerc20:"WBTC", wbtcbsc:"WBTC",
  daierc20:"DAI",   daibsc:"DAI",     daimatic:"DAI",   daiarb:"DAI",
  linkbsc:"LINK",   unibsc:"UNI",
};

function normSS(ticker: string): string | null {
  if (!ticker) return null;
  const mapped = SS_NORM[ticker.toLowerCase()];
  if (mapped) return mapped;
  const c = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length >= 1 && c.length <= 12 ? c : null;
}

/**
 * Collect up to CATALOG_MAX_ASSETS unique canonical symbols, priority-ordered:
 *   internal FALLBACK_PRICES → LE live / built-in → SS live → persisted venues.
 */
export async function collectCatalogAssets(): Promise<string[]> {
  if (assetCache && assetCache.expiresAt > Date.now()) return assetCache.assets;
  if (assetInflight) return assetInflight;
  assetInflight = (async () => {
  const seen    = new Set<string>();
  const ordered: string[] = [];

  const add = (sym: string) => {
    const s = sym.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
    if (!s || s.length > 12 || seen.has(s)) return;
    seen.add(s);
    ordered.push(s);
  };

  // 1. Internal known assets (always tradeable, have fallback prices)
  for (const sym of Object.keys(FALLBACK_PRICES)) add(sym);

  // 2. LE live API; fall back to built-in coin list on any failure
  let leFetched = false;
  try {
    const { leRequest } = await import("./lePriceCache.js");
    const res = await leRequest("/v2/coins");
    if (res.ok && Array.isArray(res.data) && (res.data as unknown[]).length > 0) {
      for (const item of res.data as Record<string, unknown>[]) {
        const code = ((item.code ?? item.ticker ?? item.symbol ?? "") as string).toUpperCase().trim();
        if (code) add(code);
      }
      leFetched = true;
    }
  } catch { /* fall through */ }

  if (!leFetched) {
    try {
      const { getBuiltInLeCoins } = await import("./leAllCoins.js");
      for (const s of getBuiltInLeCoins()) add(s);
    } catch { /* ignore */ }
  }

  // 3. SS live currency catalog (normalized)
  try {
    const { fetchSSCurrencies, isSimpleSwapConfigured } = await import("./simpleswap.js");
    if (isSimpleSwapConfigured()) {
      const currencies = await fetchSSCurrencies();
      for (const c of currencies) {
        const sym = normSS(c.symbol ?? "");
        if (sym) add(sym);
      }
    }
  } catch { /* non-fatal — SS is optional */ }

  // 4. Swapzone live currency catalog. Network variants collapse to their
  // canonical symbol for Trade; the exact network remains an execution concern.
  try {
    const { fetchSzCurrencies, isSwapzoneConfigured } = await import("./swapzone.js");
    if (await isSwapzoneConfigured()) {
      const currencies = await fetchSzCurrencies();
      for (const c of currencies) {
        const sym = normSS(c.ticker ?? "");
        if (sym) add(sym);
      }
    }
  } catch { /* non-fatal — Swapzone is optional */ }

  // Persisted provider rows keep imported assets searchable
  // when a provider catalog is temporarily unavailable.
  try {
    const result = await pool.query<{ asset: string }>(
      `SELECT base_asset AS asset FROM markets
        WHERE enabled = true AND type IN ('letsexchange','simpleswap')
       UNION
       SELECT quote_asset AS asset FROM markets
        WHERE enabled = true AND type IN ('letsexchange','simpleswap')`,
    );
    for (const row of result.rows) add(row.asset);
  } catch { /* the live catalogs above are still usable */ }

  const assets = ordered.slice(0, CATALOG_MAX_ASSETS);
  assetCache = { assets, expiresAt: Date.now() + ASSET_CACHE_TTL };
  logger.info({ assets: assets.length, virtualPairs: assets.length * (assets.length - 1) }, "virtual market asset universe refreshed");
  return assets;
  })().finally(() => { assetInflight = null; });
  return assetInflight;
}

export interface VirtualCatalogPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

/**
 * Return one deterministic page of the virtual Cartesian pair catalog.
 * Filtering is index-aware, so large offsets do not scan or allocate N² rows.
 */
export async function getVirtualCatalogPage(options: {
  q?: string;
  quote?: string;
  limit: number;
  offset: number;
}): Promise<{ items: VirtualCatalogPair[]; total: number; assets: number }> {
  const assets = await collectCatalogAssets();
  const n = assets.length;
  const q = (options.q ?? "").trim().toUpperCase();
  const quote = (options.quote ?? "").trim().toUpperCase();
  const limit = Math.max(1, Math.min(200, options.limit));
  const offset = Math.max(0, options.offset);
  const items: VirtualCatalogPair[] = [];

  const emit = (baseIndex: number, quoteIndex: number) => {
    if (baseIndex === quoteIndex || items.length >= limit) return;
    const baseAsset = assets[baseIndex];
    const quoteAsset = assets[quoteIndex];
    items.push({ symbol: `${baseAsset}/${quoteAsset}`, baseAsset, quoteAsset });
  };

  // Exact quote filters have only N-1 possible rows and can be indexed directly.
  if (quote) {
    const quoteIndex = assets.indexOf(quote);
    if (quoteIndex < 0) return { items, total: 0, assets: n };
    const [basePrefix, pairQuotePrefix] = q.includes("/") ? q.split("/", 2) : ["", ""];
    const baseIndices = assets
      .map((asset, index) => ({ asset, index }))
      .filter(({ asset, index }) => {
        if (index === quoteIndex) return false;
        if (!q) return true;
        if (q.includes("/")) return asset.startsWith(basePrefix) && quote.startsWith(pairQuotePrefix);
        return asset.startsWith(q) || quote.startsWith(q);
      })
      .map(({ index }) => index);
    for (const index of baseIndices.slice(offset, offset + limit)) emit(index, quoteIndex);
    return { items, total: baseIndices.length, assets: n };
  }

  // Full pair-prefix search, e.g. BTC/US, directly enumerates matching blocks.
  if (q.includes("/")) {
    const [basePrefix, quotePrefix] = q.split("/", 2);
    const bases = assets.map((asset, index) => ({ asset, index })).filter(v => v.asset.startsWith(basePrefix));
    const quotes = assets.map((asset, index) => ({ asset, index })).filter(v => v.asset.startsWith(quotePrefix));
    let total = 0;
    let skip = offset;
    for (const base of bases) {
      const blockSize = quotes.length - (quotes.some(v => v.index === base.index) ? 1 : 0);
      total += blockSize;
      if (skip >= blockSize) { skip -= blockSize; continue; }
      for (const target of quotes) {
        if (target.index === base.index) continue;
        if (skip > 0) { skip--; continue; }
        emit(base.index, target.index);
      }
    }
    return { items, total, assets: n };
  }

  if (q) {
    const matched = assets.map((asset, index) => ({ asset, index })).filter(v => v.asset.startsWith(q));
    const matchedSet = new Set(matched.map(v => v.index));
    const unmatched = assets.map((asset, index) => ({ asset, index })).filter(v => !matchedSet.has(v.index));
    const firstCount = matched.length * Math.max(0, n - 1);
    const secondCount = unmatched.length * matched.length;
    const total = firstCount + secondCount;
    let cursor = offset;

    if (cursor < firstCount && n > 1) {
      while (cursor < firstCount && items.length < limit) {
        const base = matched[Math.floor(cursor / (n - 1))].index;
        const slot = cursor % (n - 1);
        emit(base, slot < base ? slot : slot + 1);
        cursor++;
      }
    }
    if (items.length >= limit) return { items, total, assets: n };
    if (cursor >= firstCount) cursor -= firstCount;
    while (cursor >= 0 && cursor < secondCount && items.length < limit && matched.length > 0) {
      const base = unmatched[Math.floor(cursor / matched.length)].index;
      const target = matched[cursor % matched.length].index;
      emit(base, target);
      cursor++;
    }
    return { items, total, assets: n };
  }

  const total = n * Math.max(0, n - 1);
  let cursor = offset;
  while (cursor < total && items.length < limit && n > 1) {
    const baseIndex = Math.floor(cursor / (n - 1));
    const quoteSlot = cursor % (n - 1);
    emit(baseIndex, quoteSlot < baseIndex ? quoteSlot : quoteSlot + 1);
    cursor++;
  }
  return { items, total, assets: n };
}

/** Legacy entry point retained for callers; catalog rows are virtual now. */
export async function generateUniversalMarkets(): Promise<{ assets: number; inserted: number }> {
  const assets = await collectCatalogAssets();
  logger.info({ assets: assets.length, virtualPairs: assets.length * (assets.length - 1) }, "universal catalog is virtual; no DB rows inserted");
  return { assets: assets.length, inserted: 0 };
}
