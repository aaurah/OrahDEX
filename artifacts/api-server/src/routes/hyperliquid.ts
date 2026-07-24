/**
 * Hyperliquid market data proxy route.
 *
 * GET /api/hyperliquid/markets
 *   Returns all HL perpetual markets: mark price, funding rate, OI, volume.
 *   Results are cached 60 s in the lib layer — safe to call frequently.
 *
 * GET /api/hyperliquid/markets/:coin
 *   Returns a single market by coin ticker (e.g. "BTC").
 *
 * GET /api/hyperliquid/mids
 *   Returns a flat {coin: midPrice} map for all HL assets.
 */

import { Router } from "express";
import { fetchHlMarkets, fetchHlAllMids } from "../lib/hyperliquid.js";

const router = Router();

router.get("/hyperliquid/markets", async (_req, res) => {
  try {
    const markets = await fetchHlMarkets();
    res.json({ markets, count: markets.length, source: "hyperliquid" });
  } catch (err: any) {
    res.status(502).json({ error: "Hyperliquid API unavailable", detail: err?.message });
  }
});

router.get("/hyperliquid/markets/:coin", async (req, res) => {
  const coin = String(req.params.coin ?? "").toUpperCase();
  try {
    const markets = await fetchHlMarkets();
    const m = markets.find(x => x.coin === coin);
    if (!m) { res.status(404).json({ error: `No market found for ${coin}` }); return; }
    res.json(m);
  } catch (err: any) {
    res.status(502).json({ error: "Hyperliquid API unavailable", detail: err?.message });
  }
});

router.get("/hyperliquid/mids", async (_req, res) => {
  try {
    const mids = await fetchHlAllMids();
    res.json({ mids, source: "hyperliquid" });
  } catch (err: any) {
    res.status(502).json({ error: "Hyperliquid API unavailable", detail: err?.message });
  }
});

export default router;
