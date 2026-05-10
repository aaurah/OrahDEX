/**
 * TradingView UDF-compatible datafeed service
 * Mounted at /tv — implements TradingView's UDF protocol
 * Compatible with: new Datafeeds.UDFCompatibleDatafeed("/api/tv")
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { eq, ilike, or } from "drizzle-orm";

const router = Router();

/* ─── Resolution → our interval mapping ────────────────────────────────── */
const RESOLUTION_MAP: Record<string, string> = {
  "1":   "1m",
  "3":   "5m",
  "5":   "5m",
  "15":  "15m",
  "30":  "30m",
  "60":  "1h",
  "120": "1h",
  "240": "4h",
  "360": "4h",
  "720": "4h",
  "1D":  "1d",
  "1W":  "1w",
  "D":   "1d",
  "W":   "1w",
};

const SUPPORTED_RESOLUTIONS = ["1", "5", "15", "30", "60", "240", "1D", "1W"];

/* Track latency for admin monitoring */
export const tvMetrics = {
  lastHistoryLatencyMs: 0,
  lastSymbolsLatencyMs: 0,
  historyCallCount: 0,
  symbolsCallCount: 0,
  streamingActive: false,
  lastCallAt: 0 as number,
};

/* ─── /tv/config ─────────────────────────────────────────────────────────── */
router.get("/config", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.json({
    supports_search: true,
    supports_group_request: false,
    supports_marks: false,
    supports_timescale_marks: false,
    supports_time: true,
    exchanges: [
      { value: "Orah", name: "Orah", desc: "Orah Sovereign DEX" },
      { value: "BSV",     name: "BSV",     desc: "Bitcoin SV On-Chain" },
    ],
    symbols_types: [
      { name: "crypto", value: "crypto" },
    ],
    supported_resolutions: SUPPORTED_RESOLUTIONS,
    currency_codes: ["USDT", "USDC", "BSV", "BTC"],
  });
});

/* ─── /tv/time ───────────────────────────────────────────────────────────── */
router.get("/time", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.send(String(Math.floor(Date.now() / 1000)));
});

/* ─── /tv/symbols ────────────────────────────────────────────────────────── */
router.get("/symbols", async (req, res) => {
  const t0 = Date.now();
  res.set("Access-Control-Allow-Origin", "*");

  const rawSymbol = (req.query.symbol as string ?? "").toUpperCase().trim();
  if (!rawSymbol) { res.status(400).json({ s: "error", errmsg: "symbol required" }); return; }

  try {
    // Normalize: "BSVUSDT" → "BSV/USDT"
    const normalized = rawSymbol.includes("/") ? rawSymbol : rawSymbol.replace(/^([A-Z0-9]+?)(USDT|USDC|BTC|ETH|BSV|BNB|USD)$/, "$1/$2");

    const [market] = await db.select().from(marketsTable)
      .where(ilike(marketsTable.symbol, normalized))
      .limit(1);

    const sym = market?.symbol ?? normalized;
    const parts = sym.split("/");
    const base  = parts[0] ?? "BSV";
    const quote = parts[1] ?? "USDT";

    const pricescale = quote === "USDT" || quote === "USDC"
      ? (market?.tickSize ? Math.round(1 / Number(market.tickSize)) : 10000)
      : 100000000;

    tvMetrics.lastSymbolsLatencyMs = Date.now() - t0;
    tvMetrics.symbolsCallCount++;
    tvMetrics.lastCallAt = Date.now();

    res.json({
      name:          sym,
      ticker:        sym,
      description:   `${base} / ${quote}`,
      type:          "crypto",
      session:       "24x7",
      exchange:      "Orah",
      listed_exchange: "Orah",
      timezone:      "Etc/UTC",
      minmov:        1,
      pricescale,
      has_intraday:  true,
      has_daily:     true,
      has_weekly_and_monthly: true,
      supported_resolutions: SUPPORTED_RESOLUTIONS,
      has_empty_bars: false,
      volume_precision: 2,
      data_status:   "streaming",
    });
  } catch (err) {
    res.status(500).json({ s: "error", errmsg: "Internal error" });
  }
});

/* ─── /tv/search ─────────────────────────────────────────────────────────── */
router.get("/search", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  const query    = ((req.query.query as string) ?? "").toUpperCase().trim();
  const limit    = Math.min(parseInt(req.query.limit as string ?? "30"), 100);

  try {
    const markets = await db.select().from(marketsTable)
      .where(
        query
          ? or(
              ilike(marketsTable.symbol,    `%${query}%`),
              ilike(marketsTable.baseAsset, `%${query}%`),
            )
          : undefined
      )
      .limit(limit);

    res.json(
      markets.map(m => ({
        symbol:      m.symbol,
        full_name:   `Orah:${m.symbol}`,
        description: `${m.baseAsset} / ${m.quoteAsset}`,
        exchange:    "Orah",
        type:        "crypto",
        ticker:      m.symbol,
      }))
    );
  } catch {
    res.json([]);
  }
});

/* ─── /tv/history ────────────────────────────────────────────────────────── */
router.get("/history", async (req, res) => {
  const t0 = Date.now();
  res.set("Access-Control-Allow-Origin", "*");

  const symbol     = (req.query.symbol as string ?? "").replace(/^Orah:/, "");
  const resolution = req.query.resolution as string ?? "60";
  const from       = parseInt(req.query.from as string ?? "0");
  const to         = parseInt(req.query.to   as string ?? String(Math.floor(Date.now() / 1000)));

  if (!symbol) { res.json({ s: "error", errmsg: "symbol required" }); return; }

  const interval = RESOLUTION_MAP[resolution] ?? "1h";

  try {
    // Fetch from our own candles endpoint
    const encodedSymbol = encodeURIComponent(symbol);
    const limit = Math.min(Math.ceil((to - from) / intervalToSeconds(interval)) + 10, 1000);

    const localPort = req.socket.localPort ?? Number(process.env.PORT ?? 8080);
    const candleUrl = new URL(`/api/markets/${encodedSymbol}/candles`, `http://127.0.0.1:${localPort}`);
    candleUrl.searchParams.set("interval", interval);
    candleUrl.searchParams.set("limit", String(limit));
    candleUrl.searchParams.set("from", String(from));
    candleUrl.searchParams.set("to", String(to));

    const resp = await fetch(candleUrl, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) {
      res.json({ s: "no_data" }); return;
    }

    const raw = await resp.json() as { candles?: any[] } | any[];
    const candles: any[] = Array.isArray(raw) ? raw : (raw as { candles?: any[] })?.candles ?? [];

    // Filter by time range
    const filtered = candles.filter(c => {
      const t = Number(c.time ?? c.t);
      return t >= from && t <= to;
    });

    if (filtered.length === 0) {
      res.json({ s: "no_data", nextTime: to }); return;
    }

    // Convert to UDF array format
    const t: number[] = [];
    const o: number[] = [];
    const h: number[] = [];
    const l: number[] = [];
    const c: number[] = [];
    const v: number[] = [];

    for (const candle of filtered) {
      t.push(Number(candle.time ?? candle.t));
      o.push(Number(candle.open  ?? candle.o));
      h.push(Number(candle.high  ?? candle.h));
      l.push(Number(candle.low   ?? candle.l));
      c.push(Number(candle.close ?? candle.c));
      v.push(Number(candle.volume ?? candle.v ?? 0));
    }

    tvMetrics.lastHistoryLatencyMs = Date.now() - t0;
    tvMetrics.historyCallCount++;
    tvMetrics.lastCallAt = Date.now();

    res.json({ s: "ok", t, o, h, l, c, v });
  } catch (err) {
    res.json({ s: "error", errmsg: "Fetch failed" });
  }
});

/* helper */
function intervalToSeconds(interval: string): number {
  const map: Record<string, number> = {
    "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800,
  };
  return map[interval] ?? 3600;
}

export default router;
