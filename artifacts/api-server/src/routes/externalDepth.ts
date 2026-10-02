// External aggregated market depth (display-only, NOT executable).
// GET /api/external-depth?symbol=BSV/USDT
import { Router } from "express";

const router = Router();

const VENUES = [
  {
    name: "gate.io",
    mapSymbol: (s: string) => s.replace("/", "_"),
    url: (s: string) =>
      `https://api.gateio.ws/api/v4/spot/order_book?currency_pair=${s}&limit=20`,
    parse: (j: any) => ({
      bids: (j.bids || []).map((l: string[]) => ({ price: l[0], amount: l[1] })),
      asks: (j.asks || []).map((l: string[]) => ({ price: l[0], amount: l[1] })),
    }),
  },
  {
    name: "mexc",
    mapSymbol: (s: string) => s.replace("/", ""),
    url: (s: string) => `https://api.mexc.com/api/v3/depth?symbol=${s}&limit=20`,
    parse: (j: any) => ({
      bids: (j.bids || []).map((l: string[]) => ({ price: l[0], amount: l[1] })),
      asks: (j.asks || []).map((l: string[]) => ({ price: l[0], amount: l[1] })),
    }),
  },
];

const CACHE_TTL_MS = 3000;
const cache = new Map<string, { at: number; data: any }>();

async function fetchVenue(v: (typeof VENUES)[number], symbol: string) {
  const res = await fetch(v.url(v.mapSymbol(symbol)), {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`${v.name} HTTP ${res.status}`);
  return { venue: v.name, ...(v.parse(await res.json())) };
}

router.get("/external-depth", async (req, res) => {
  const symbol = String(req.query.symbol || "BSV/USDT").toUpperCase();
  if (!/^[A-Z0-9]+\/[A-Z0-9]+$/.test(symbol)) {
    return res.status(400).json({ error: "symbol must look like BSV/USDT" });
  }
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return res.json(hit.data);

  const results = await Promise.allSettled(VENUES.map((v) => fetchVenue(v, symbol)));
  const venues = results.filter((r) => r.status === "fulfilled").map((r: any) => r.value);
  const failed = results.filter((r) => r.status === "rejected").map((r: any) => String(r.reason));
  if (venues.length === 0) return res.status(502).json({ error: "all venues failed", failed });

  const merge = (side: "bids" | "asks") => {
    const m = new Map<number, number>();
    for (const v of venues)
      for (const l of (v as any)[side]) {
        const p = Number(l.price);
        const a = Number(l.amount);
        if (Number.isFinite(p) && Number.isFinite(a)) m.set(p, (m.get(p) || 0) + a);
      }
    const arr = [...m.entries()].map(([p, a]) => [p.toFixed(2), a.toFixed(3)]);
    return (side === "bids"
      ? arr.sort((x, y) => Number(y[0]) - Number(x[0]))
      : arr.sort((x, y) => Number(x[0]) - Number(y[0]))
    ).slice(0, 20);
  };

  const payload = {
    symbol,
    ts: Date.now(),
    venues: venues.map((v: any) => v.venue),
    bids: merge("bids"),
    asks: merge("asks"),
  };
  cache.set(symbol, { at: Date.now(), data: payload });
  res.json(payload);
});

export default router;
