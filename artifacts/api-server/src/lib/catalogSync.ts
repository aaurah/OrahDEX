/**
 * catalogSync.ts — Coin catalog + full pair-matrix snapshot (LetsExchange).
 * Fetches the complete /v2/coins catalog (paginated), persists it to
 * coin_catalog, then materializes every ordered symbol pair into pair_matrix.
 * Runs at startup (+30 s grace) and every 6 h. Prices are NOT stored —
 * they are cross-rates computed at query time from the USD price cache.
 */
import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import { leRequest } from "./lePriceCache.js";

const MATRIX_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INSERT_CHUNK = 25000;

let syncRunning = false;
let lastSyncAt: number | null = null;
let lastSyncStats: { coins: number; pairs: number; ms: number } | null = null;

async function ensureTables(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS coin_catalog (
    symbol       TEXT NOT NULL,
    name         TEXT,
    network      TEXT,
    network_name TEXT,
    image        TEXT,
    has_extra_id BOOLEAN NOT NULL DEFAULT false,
    min_amount   TEXT,
    max_amount   TEXT,
    raw          JSONB,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (symbol, network)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS pair_matrix (
    base  TEXT NOT NULL,
    quote TEXT NOT NULL,
    PRIMARY KEY (base, quote)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pair_matrix_quote ON pair_matrix (quote)`);
}

function normCoin(c: any) {
  const symbol = String(c.code ?? c.symbol ?? c.ticker ?? "").toUpperCase();
  const net0 = Array.isArray(c.networks) ? c.networks[0] : null;
  return {
    symbol,
    name:         c.name ?? symbol,
    network:      String(c.default_network_code ?? net0?.network_code ?? c.network ?? "").toUpperCase() || symbol,
    network_name: c.default_network_name ?? net0?.network_name ?? null,
    image:        c.icon ?? c.image ?? c.image_url ?? c.logo ?? null,
    has_extra_id: !!(c.additional_info_get ?? c.additional_info_send ?? c.has_extra_id ?? false),
    min_amount:   c.min_amount != null ? String(c.min_amount) : null,
    max_amount:   c.max_amount != null ? String(c.max_amount) : null,
    raw:          JSON.stringify(c),
  };
}

async function fetchAllCoins(): Promise<any[]> {
  const all: any[] = [];
  const seen = new Set<string>();
  let offset = 0;
  const LIMIT = 1000;
  for (let page = 0; page < 20; page++) {
    const { ok, data, status } = await Promise.race([
      leRequest(`/v2/coins?limit=${LIMIT}&offset=${offset}`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("page timeout")), 20000)),
    ]) as any;
    if (!ok) throw new Error(`LE /v2/coins ${status} at offset ${offset}`);
    const batch = Array.isArray(data) ? data : [];
    const fresh = batch.filter((c: any) => {
      const k = String(c.code ?? c.symbol ?? c.ticker ?? "");
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    all.push(...fresh);
    logger.info({ offset, got: batch.length, fresh: fresh.length, unique: all.length }, "catalog sync: page fetched");
    if (batch.length < LIMIT || fresh.length === 0) break; // end of catalog OR offset not honoured
    offset += LIMIT;
    await new Promise(r => setTimeout(r, 300));
  }
  return all;
}

export async function triggerCatalogSync(): Promise<void> {
  if (syncRunning) return;
  syncRunning = true;
  const t0 = Date.now();
  try {
    await ensureTables();
    const raw = await fetchAllCoins();
    const coins = raw.filter(c => c.is_active !== false && c.disabled !== true).map(normCoin).filter(c => c.symbol.length > 0);

    // Replace catalog atomically: truncate + dedupe + plain chunked inserts
    const uniq = new Map<string, (typeof coins)[number]>();
    for (const c of coins) uniq.set(`${c.symbol}|${c.network ?? ""}`, c);
    const clean = [...uniq.values()];
    await pool.query(`TRUNCATE coin_catalog`);
    for (let i = 0; i < clean.length; i += 500) {
      const chunk = clean.slice(i, i + 500);
      const vals: unknown[] = [];
      const ph = chunk.map((c, j) => {
        const b = j * 9;
        vals.push(c.symbol, c.name, c.network, c.network_name, c.image, c.has_extra_id, c.min_amount, c.max_amount, c.raw);
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},now())`;
      }).join(",");
      try {
        await pool.query(
          `INSERT INTO coin_catalog (symbol,name,network,network_name,image,has_extra_id,min_amount,max_amount,raw,updated_at)
           VALUES ${ph}`, vals);
      } catch (err) {
        throw new Error(`coin insert chunk ${i / 500} failed: ${(err as Error)?.message ?? String(err)}`);
      }
    }

    // Unique symbols → full ordered pair matrix
    const symbols = [...new Set(coins.map(c => c.symbol))].sort();
    await pool.query(`TRUNCATE pair_matrix`);
    let pairs = 0;
    for (const b of symbols) {
      for (const q of symbols) {
        if (b === q) continue;
        // generated below in chunks — see insert loop
      }
    }
    // chunked generation
    const rows: string[] = [];
    let params: string[] = [];
    let args: unknown[] = [];
    let n = 0;
    for (const b of symbols) {
      for (const q of symbols) {
        if (b === q) continue;
        n++; args.push(b, q);
        params.push(`($${n*2-1},$${n*2})`);
        if (params.length >= INSERT_CHUNK) {
          await pool.query(`INSERT INTO pair_matrix (base, quote) VALUES ${params.join(",")} ON CONFLICT DO NOTHING`, args);
          pairs += params.length; params = []; args = []; n = 0;
          if (pairs % 500000 === 0) logger.info({ pairs }, "catalog sync: pair_matrix progress");
        }
      }
    }
    if (params.length) { await pool.query(`INSERT INTO pair_matrix (base, quote) VALUES ${params.join(",")} ON CONFLICT DO NOTHING`, args); pairs += params.length; }

    lastSyncAt = Date.now();
    lastSyncStats = { coins: coins.length, pairs, ms: Date.now() - t0 };
    logger.info(lastSyncStats, "catalog sync: complete");
  } catch (e) {
    logger.error({ err: e }, "catalog sync: failed");
  } finally {
    syncRunning = false;
  }
}

export function getCatalogStatus() {
  return { running: syncRunning, lastSyncAt, lastSyncStats };
}

// Boot: grace 30 s (let LE warm up), then sync; repeat every 6 h
setTimeout(() => { triggerCatalogSync().catch(() => {}); }, 30_000).unref?.();
setInterval(() => { triggerCatalogSync().catch(() => {}); }, MATRIX_SYNC_INTERVAL_MS).unref?.();
