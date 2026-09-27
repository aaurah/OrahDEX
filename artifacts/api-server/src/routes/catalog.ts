/**
 * catalog.ts — Serves the persisted coin catalog + full pair matrix.
 * Prices are cross-rates computed at query time: usd(base) / usd(quote).
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { getCachedLEPrices, fetchLEKeyPricesIfNeeded } from "../lib/lePriceCache.js";
import { getCatalogStatus, triggerCatalogSync } from "../lib/catalogSync.js";

const router: IRouter = Router();

router.get("/catalog/stats", async (_req, res) => {
  try {
    const [c, p] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM coin_catalog`),
      pool.query(`SELECT COUNT(*)::int AS n FROM pair_matrix`),
    ]);
    res.json({ coins: c.rows[0].n, pairs: p.rows[0].n, ...getCatalogStatus() });
  } catch { res.status(500).json({ error: "stats failed" }); }
});

router.post("/catalog/sync", (_req, res) => {
  triggerCatalogSync().catch(() => {});
  res.json({ started: true, ...getCatalogStatus() });
});

router.get("/catalog/coins", async (req, res) => {
  const search = String(req.query.search ?? "").trim().toUpperCase();
  const limit  = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  try {
    const r = search
      ? await pool.query(`SELECT symbol, name, network, network_name, image, has_extra_id, min_amount, max_amount
                          FROM coin_catalog WHERE symbol LIKE $1 OR upper(name) LIKE $1 ORDER BY symbol LIMIT $2`, [`${search}%`, limit])
      : await pool.query(`SELECT symbol, name, network, network_name, image, has_extra_id, min_amount, max_amount
                          FROM coin_catalog ORDER BY symbol LIMIT $1`, [limit]);
    res.json(r.rows);
  } catch { res.status(500).json({ error: "coin search failed" }); }
});

router.get("/catalog/pairs", async (req, res) => {
  const base   = String(req.query.base ?? "").trim().toUpperCase();
  const quote  = String(req.query.quote ?? "").trim().toUpperCase();
  const search = String(req.query.search ?? "").trim().toUpperCase();
  const limit  = Math.min(parseInt(String(req.query.limit ?? "500"), 10) || 500, 5000);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
  if (!base && !quote && !search) return res.status(400).json({ error: "provide base=, quote=, or search=" });

  let usd = getCachedLEPrices();
  if (Object.keys(usd).length === 0) fetchLEKeyPricesIfNeeded().catch(() => {});

  try {
    let where = "", args: unknown[] = [];
    if (base)   { where = `WHERE base = $1`;  args = [base]; }
    else if (quote) { where = `WHERE quote = $1`; args = [quote]; }
    else        { where = `WHERE base LIKE $1 OR quote LIKE $1`; args = [search]; }
    const r = await pool.query(
      `SELECT base, quote FROM pair_matrix ${where} ORDER BY base, quote LIMIT ${limit} OFFSET ${offset}`, args);
    const rows = r.rows.map(({ base: b, quote: q }) => ({
      symbol: `${b}-${q}`, baseAsset: b, quoteAsset: q,
      lastPrice: usd[b] && usd[q] ? +(usd[b] / usd[q]) : 0,
      priceChangePercent24h: null, volume: null,
    }));
    res.json(rows);
  } catch { res.status(500).json({ error: "pair query failed" }); }
});

export default router;
