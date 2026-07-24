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
import { getHlWsMids, isHlWsConnected, getHlWsStatus, getHlWsMid } from "../lib/hyperliquidWs.js";

const router = Router();

// GET /api/hyperliquid/ws-status — WebSocket feed health + builder code info
router.get("/hyperliquid/ws-status", (_req, res) => {
  res.json(getHlWsStatus());
});

// GET /api/hyperliquid/markets — all 232 perp markets with live mark/funding/OI
router.get("/hyperliquid/markets", async (_req, res) => {
  try {
    const markets = await fetchHlMarkets();
    const wsLive  = isHlWsConnected();
    // Overlay real-time WS mid prices onto REST mark prices where fresher
    const enriched = markets.map(m => {
      const wsMid = wsLive ? getHlWsMid(m.coin) : undefined;
      return wsMid && wsMid > 0
        ? { ...m, markPrice: wsMid, priceSource: "ws" }
        : { ...m, priceSource: "rest" };
    });
    res.json({ markets: enriched, count: enriched.length, source: "hyperliquid", wsLive });
  } catch (err: any) {
    res.status(502).json({ error: "Hyperliquid API unavailable", detail: err?.message });
  }
});

// GET /api/hyperliquid/markets/:coin — single market lookup
router.get("/hyperliquid/markets/:coin", async (req, res) => {
  const coin = String(req.params.coin ?? "").toUpperCase();
  try {
    const markets = await fetchHlMarkets();
    const m = markets.find(x => x.coin === coin);
    if (!m) { res.status(404).json({ error: `No market found for ${coin}` }); return; }
    const wsMid = isHlWsConnected() ? getHlWsMid(coin) : undefined;
    res.json(wsMid && wsMid > 0 ? { ...m, markPrice: wsMid, priceSource: "ws" } : { ...m, priceSource: "rest" });
  } catch (err: any) {
    res.status(502).json({ error: "Hyperliquid API unavailable", detail: err?.message });
  }
});

// GET /api/hyperliquid/mids — flat coin→price map
// Returns real-time WS prices when available (sub-second fresh), REST fallback
router.get("/hyperliquid/mids", async (_req, res) => {
  try {
    if (isHlWsConnected()) {
      const wsMids = getHlWsMids();
      if (wsMids.size > 100) {
        const mids: Record<string, number> = {};
        for (const [coin, px] of wsMids) mids[coin] = px;
        res.json({ mids, source: "hyperliquid-ws", coins: wsMids.size });
        return;
      }
    }
    const mids = await fetchHlAllMids();
    res.json({ mids, source: "hyperliquid-rest" });
  } catch (err: any) {
    res.status(502).json({ error: "Hyperliquid API unavailable", detail: err?.message });
  }
});

export default router;
