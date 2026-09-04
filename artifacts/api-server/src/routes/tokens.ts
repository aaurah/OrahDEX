/**
 * tokens.ts — API routes for GitHub-sourced token metadata
 *
 * GET /api/tokens                     → list all known symbols (paginated)
 * GET /api/tokens/logo/:symbol        → 302 redirect to best logo URL
 * GET /api/tokens/metadata/:symbol    → JSON { symbol, logoUrl, chains }
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { getCachedLogoUrl, getCachedTokenMeta, getAllCachedSymbols, nativeLogoUrl } from "../services/githubTokenSeeder.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── GET /api/tokens/logo/:symbol ─────────────────────────────────────────── */
router.get("/tokens/logo/:symbol", (req, res) => {
  const sym = (req.params.symbol ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return void res.status(400).json({ error: "Invalid symbol" });

  const url = getCachedLogoUrl(sym);
  if (url) {
    res.set("Cache-Control", "public, max-age=86400"); // 24 h browser cache
    return void res.redirect(302, url);
  }
  res.status(404).json({ error: "Logo not found" });
});

/* ── GET /api/tokens/metadata/:symbol ────────────────────────────────────── */
router.get("/tokens/metadata/:symbol", async (req, res) => {
  const sym = (req.params.symbol ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return void res.status(400).json({ error: "Invalid symbol" });

  try {
    const { rows } = await pool.query<{
      chain_id: number; address: string; decimals: number; logo_url: string | null; name: string;
    }>(
      `SELECT chain_id, address, decimals, logo_url, name
       FROM github_tokens WHERE symbol = $1 ORDER BY chain_id`,
      [sym],
    );

    const logoUrl = getCachedLogoUrl(sym) ?? rows.find(r => r.logo_url)?.logo_url ?? null;
    const chains: Record<number, { address: string; decimals: number }> = {};
    for (const r of rows) chains[r.chain_id] = { address: r.address, decimals: r.decimals };

    res.json({
      symbol:  sym,
      name:    rows[0]?.name ?? sym,
      logoUrl,
      nativeLogo: nativeLogoUrl(sym),
      chains,
    });
  } catch (err) {
    logger.warn({ err, sym }, "Token metadata lookup failed");
    res.status(500).json({ error: "Lookup failed" });
  }
});

/* ── GET /api/tokens ─────────────────────────────────────────────────────── */
router.get("/tokens", async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limit = Math.min(200, parseInt(req.query.limit as string) || 100);
  const q     = (req.query.q as string ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  try {
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let where = "";
    if (q) { params.push(`${q}%`); where = `WHERE symbol LIKE $1`; }
    params.push(limit, offset);

    const { rows } = await pool.query<{
      symbol: string; name: string; logo_url: string | null;
      chain_id: number; address: string; decimals: number;
    }>(
      `SELECT DISTINCT ON (symbol) symbol, name, logo_url, chain_id, address, decimals
       FROM github_tokens ${where}
       ORDER BY symbol, chain_id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      page, limit,
      tokens: rows.map(r => ({
        symbol:   r.symbol,
        name:     r.name,
        logoUrl:  r.logo_url ?? nativeLogoUrl(r.symbol),
        chainId:  r.chain_id,
        address:  r.address,
        decimals: r.decimals,
      })),
    });
  } catch (err) {
    logger.warn({ err }, "Token list failed");
    res.status(500).json({ error: "Token list failed" });
  }
});

export default router;
