/**
 * CoinGecko metadata importer.
 *
 * Strategy:
 *   1. Fetch /coins/list once to get the global symbol → coingecko_id map.
 *   2. Determine which symbols our DB cares about (distinct base/quote in `markets`).
 *   3. Use /coins/markets (paginated, 250/page) to bulk-fetch name/image/market_cap_rank
 *      for the top coins by market cap — fast path, covers the popular tickers.
 *   4. Use /coins/{id} for full descriptions, rate-limited to respect free-tier limits
 *      (free public API ≈ 30 req/min). Runs in the background, persists progress so
 *      it can resume after restart.
 *
 * Rate-limit policy:
 *   - Free public API: 30 req/min  → 2,100 ms gap, we use 2,500 ms to be safe.
 *   - With a Pro/Demo key (header `x-cg-demo-api-key` or `x-cg-pro-api-key`),
 *     we tighten to 1,200 ms (≈ 50 req/min).
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_PRO_BASE = "https://pro-api.coingecko.com/api/v3";

interface CoinListEntry {
  id: string;
  symbol: string;
  name: string;
}

interface CoinMarketsEntry {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  market_cap_rank?: number | null;
  current_price?: number | null;
  market_cap?: number | null;
}

interface CoinDetailResponse {
  id: string;
  symbol: string;
  name: string;
  description?: { en?: string };
  links?: {
    homepage?: string[];
    whitepaper?: string;
    twitter_screen_name?: string;
    subreddit_url?: string;
    repos_url?: { github?: string[] };
  };
  image?: { large?: string; small?: string; thumb?: string };
  market_cap_rank?: number | null;
  categories?: string[];
  genesis_date?: string | null;
  hashing_algorithm?: string | null;
  country_origin?: string;
}

let importerRunning = false;
let importerProgress = {
  phase: "idle" as "idle" | "list" | "bulk" | "details" | "done" | "error",
  totalSymbols: 0,
  matched: 0,
  detailsFetched: 0,
  detailsRemaining: 0,
  lastError: null as string | null,
  startedAt: null as Date | null,
  finishedAt: null as Date | null,
};

export function getImporterStatus() {
  return { running: importerRunning, ...importerProgress };
}

export async function ensureCoinMetadataTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coin_metadata (
      symbol           TEXT PRIMARY KEY,
      coingecko_id     TEXT,
      name             TEXT,
      description      TEXT,
      website          TEXT,
      whitepaper       TEXT,
      twitter          TEXT,
      reddit           TEXT,
      github           TEXT,
      categories       JSONB,
      image_url        TEXT,
      market_cap_rank  INTEGER,
      genesis_date     TEXT,
      hashing_algo     TEXT,
      country_origin   TEXT,
      source           TEXT NOT NULL DEFAULT 'coingecko',
      details_fetched  BOOLEAN NOT NULL DEFAULT false,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_coin_metadata_rank
      ON coin_metadata (market_cap_rank NULLS LAST);
    CREATE INDEX IF NOT EXISTS idx_coin_metadata_details_fetched
      ON coin_metadata (details_fetched);
  `);
}

async function getCoinGeckoApiKey(): Promise<string | null> {
  try {
    const r = await pool.query(
      `SELECT value FROM platform_settings WHERE key = 'coingecko_api_key' LIMIT 1`,
    );
    const v = r.rows[0]?.value;
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  } catch {
    /* table may not exist yet */
  }
  return process.env.COINGECKO_API_KEY ?? null;
}

function buildHeaders(apiKey: string | null): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    if (apiKey.startsWith("CG-")) h["x-cg-demo-api-key"] = apiKey;
    else h["x-cg-pro-api-key"] = apiKey;
  }
  return h;
}

function apiBase(apiKey: string | null): string {
  return apiKey && !apiKey.startsWith("CG-") ? COINGECKO_PRO_BASE : COINGECKO_BASE;
}

async function fetchJson<T>(url: string, apiKey: string | null, timeoutMs = 15000): Promise<T> {
  const res = await fetch(url, {
    headers: buildHeaders(apiKey),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CoinGecko ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function getDistinctSymbols(): Promise<Set<string>> {
  const r = await pool.query<{ symbol: string }>(`
    SELECT DISTINCT base_asset AS symbol FROM markets WHERE enabled
    UNION
    SELECT DISTINCT quote_asset FROM markets WHERE enabled
  `);
  return new Set(r.rows.map((row) => row.symbol.toUpperCase()));
}

/**
 * Phase 1: bulk import via /coins/markets. Up to N pages of 250 coins each,
 * descending by market_cap. Captures: id, name, symbol, image, market_cap_rank.
 * Does NOT include the long description — that comes in Phase 2.
 */
async function bulkImportTopMarkets(
  ourSymbols: Set<string>,
  apiKey: string | null,
  maxPages: number,
): Promise<number> {
  let inserted = 0;
  for (let page = 1; page <= maxPages; page++) {
    const url = `${apiBase(apiKey)}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`;
    let entries: CoinMarketsEntry[];
    try {
      entries = await fetchJson<CoinMarketsEntry[]>(url, apiKey);
    } catch (err) {
      logger.warn({ err, page }, "coinGecko: bulk markets fetch failed");
      break;
    }
    if (!Array.isArray(entries) || entries.length === 0) break;

    for (const e of entries) {
      const sym = e.symbol?.toUpperCase();
      if (!sym || !ourSymbols.has(sym)) continue;
      try {
        await pool.query(
          `INSERT INTO coin_metadata
              (symbol, coingecko_id, name, image_url, market_cap_rank, source, details_fetched, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'coingecko', false, NOW())
           ON CONFLICT (symbol) DO UPDATE SET
              coingecko_id    = COALESCE(coin_metadata.coingecko_id, EXCLUDED.coingecko_id),
              name            = COALESCE(coin_metadata.name, EXCLUDED.name),
              image_url       = COALESCE(coin_metadata.image_url, EXCLUDED.image_url),
              market_cap_rank = EXCLUDED.market_cap_rank,
              updated_at      = NOW()`,
          [sym, e.id, e.name, e.image ?? null, e.market_cap_rank ?? null],
        );
        inserted++;
      } catch (err) {
        logger.warn({ err, sym }, "coinGecko: upsert failed");
      }
    }

    // free-tier safety: 30 req/min ≈ one call every 2.5s. With pro key, much faster.
    await sleep(apiKey && !apiKey.startsWith("CG-") ? 600 : 2500);
  }
  return inserted;
}

/**
 * Backfill coingecko_id for symbols that did not appear in the top-market pages.
 * Uses /coins/list (single huge response, no per-coin calls).
 */
async function backfillIdsFromList(
  ourSymbols: Set<string>,
  apiKey: string | null,
): Promise<number> {
  const list = await fetchJson<CoinListEntry[]>(
    `${apiBase(apiKey)}/coins/list`,
    apiKey,
  );
  let inserted = 0;
  // Group by symbol — CoinGecko list has many duplicates per ticker.
  const bySym: Record<string, CoinListEntry[]> = {};
  for (const c of list) {
    const sym = c.symbol?.toUpperCase();
    if (!sym || !ourSymbols.has(sym)) continue;
    (bySym[sym] ||= []).push(c);
  }
  for (const [sym, candidates] of Object.entries(bySym)) {
    // Prefer the entry whose id == symbol (e.g. id "bitcoin" for sym "BTC" loses,
    // but that case is already covered by Phase 1). For ambiguous symbols, take the
    // first entry — a later /coins/{id} pass will refine.
    const chosen = candidates[0];
    try {
      await pool.query(
        `INSERT INTO coin_metadata (symbol, coingecko_id, name, source, details_fetched, updated_at)
         VALUES ($1, $2, $3, 'coingecko', false, NOW())
         ON CONFLICT (symbol) DO UPDATE SET
            coingecko_id = COALESCE(coin_metadata.coingecko_id, EXCLUDED.coingecko_id),
            name         = COALESCE(coin_metadata.name, EXCLUDED.name),
            updated_at   = NOW()`,
        [sym, chosen.id, chosen.name],
      );
      inserted++;
    } catch (err) {
      logger.warn({ err, sym }, "coinGecko: list-backfill upsert failed");
    }
  }
  return inserted;
}

/**
 * Phase 2: per-coin /coins/{id} fetch to populate description, links, categories, etc.
 * Slow — pulls one row per call, rate-limited.
 *
 * @param maxCoins  Max coins to detail in this run (so the caller can chunk it).
 */
async function fetchDetailsForRows(
  apiKey: string | null,
  maxCoins: number,
): Promise<number> {
  let processed = 0;
  while (processed < maxCoins) {
    // Pick the next un-detailed coin, prioritising market_cap_rank.
    const r = await pool.query<{ symbol: string; coingecko_id: string }>(
      `SELECT symbol, coingecko_id
       FROM coin_metadata
       WHERE details_fetched = false AND coingecko_id IS NOT NULL
       ORDER BY market_cap_rank NULLS LAST
       LIMIT 1`,
    );
    if (r.rows.length === 0) break;
    const { symbol, coingecko_id } = r.rows[0];

    const url = `${apiBase(apiKey)}/coins/${encodeURIComponent(coingecko_id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
    try {
      const detail = await fetchJson<CoinDetailResponse>(url, apiKey);
      const desc = (detail.description?.en ?? "").trim() || null;
      const homepage = detail.links?.homepage?.find((u) => u && u.length > 0) ?? null;
      const whitepaper = detail.links?.whitepaper || null;
      const twitter = detail.links?.twitter_screen_name
        ? `https://twitter.com/${detail.links.twitter_screen_name}`
        : null;
      const reddit = detail.links?.subreddit_url || null;
      const github = detail.links?.repos_url?.github?.[0] || null;
      const image = detail.image?.large || detail.image?.small || detail.image?.thumb || null;

      await pool.query(
        `UPDATE coin_metadata SET
            name = COALESCE($2, name),
            description = $3,
            website = $4,
            whitepaper = $5,
            twitter = $6,
            reddit = $7,
            github = $8,
            categories = $9::jsonb,
            image_url = COALESCE($10, image_url),
            market_cap_rank = COALESCE($11, market_cap_rank),
            genesis_date = $12,
            hashing_algo = $13,
            country_origin = $14,
            details_fetched = true,
            updated_at = NOW()
         WHERE symbol = $1`,
        [
          symbol,
          detail.name ?? null,
          desc,
          homepage,
          whitepaper,
          twitter,
          reddit,
          github,
          detail.categories ? JSON.stringify(detail.categories) : null,
          image,
          detail.market_cap_rank ?? null,
          detail.genesis_date ?? null,
          detail.hashing_algorithm ?? null,
          detail.country_origin ?? null,
        ],
      );
      importerProgress.detailsFetched++;
    } catch (err) {
      // If a single coin fails (rate-limit, 404, malformed id), mark as fetched
      // anyway so we don't loop on it forever. We still keep the basic row.
      logger.warn({ err, symbol, coingecko_id }, "coinGecko: detail fetch failed");
      await pool.query(
        `UPDATE coin_metadata SET details_fetched = true, updated_at = NOW() WHERE symbol = $1`,
        [symbol],
      );
    }
    processed++;
    await sleep(apiKey && !apiKey.startsWith("CG-") ? 1200 : 2500);
  }
  return processed;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Master entry point. Idempotent. Safe to call repeatedly. Resumes from where
 * it left off (uses `details_fetched` flag).
 *
 * @param opts.maxBulkPages   number of /coins/markets pages to walk (default 8 = top 2000)
 * @param opts.maxDetailCoins number of /coins/{id} calls to make in this run (default 0 = all)
 */
export async function runCoinGeckoImport(opts: {
  maxBulkPages?: number;
  maxDetailCoins?: number;
} = {}): Promise<{ matched: number; detailsFetched: number; durationMs: number }> {
  if (importerRunning) {
    throw new Error("CoinGecko importer is already running");
  }
  importerRunning = true;
  importerProgress = {
    phase: "list",
    totalSymbols: 0,
    matched: 0,
    detailsFetched: 0,
    detailsRemaining: 0,
    lastError: null,
    startedAt: new Date(),
    finishedAt: null,
  };
  const t0 = Date.now();

  try {
    await ensureCoinMetadataTable();
    const apiKey = await getCoinGeckoApiKey();
    if (apiKey) {
      logger.info({ keyType: apiKey.startsWith("CG-") ? "demo" : "pro" }, "coinGecko: using API key");
    } else {
      logger.info("coinGecko: no API key — using free public tier (slow)");
    }

    const ourSymbols = await getDistinctSymbols();
    importerProgress.totalSymbols = ourSymbols.size;
    logger.info({ count: ourSymbols.size }, "coinGecko: distinct symbols in markets");

    importerProgress.phase = "bulk";
    const bulkPages = opts.maxBulkPages ?? 8; // 8 * 250 = top 2000 coins by market cap
    const bulkInserted = await bulkImportTopMarkets(ourSymbols, apiKey, bulkPages);
    logger.info({ matched: bulkInserted }, "coinGecko: bulk phase complete");

    importerProgress.phase = "list";
    const listInserted = await backfillIdsFromList(ourSymbols, apiKey);
    logger.info({ inserted: listInserted }, "coinGecko: list backfill complete");

    importerProgress.matched = (await pool.query(
      `SELECT COUNT(*)::int AS n FROM coin_metadata`,
    )).rows[0].n;

    importerProgress.phase = "details";
    const remainingRow = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM coin_metadata WHERE details_fetched = false AND coingecko_id IS NOT NULL`,
    );
    importerProgress.detailsRemaining = remainingRow.rows[0].n;

    const detailLimit = opts.maxDetailCoins ?? Number.MAX_SAFE_INTEGER;
    const detailed = await fetchDetailsForRows(apiKey, detailLimit);
    logger.info({ detailed }, "coinGecko: details phase complete");

    importerProgress.phase = "done";
    importerProgress.finishedAt = new Date();
    return {
      matched: importerProgress.matched,
      detailsFetched: importerProgress.detailsFetched,
      durationMs: Date.now() - t0,
    };
  } catch (err: any) {
    importerProgress.phase = "error";
    importerProgress.lastError = err?.message ?? String(err);
    importerProgress.finishedAt = new Date();
    throw err;
  } finally {
    importerRunning = false;
  }
}
