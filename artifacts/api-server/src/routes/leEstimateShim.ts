// GET /api/letsexchange/estimate — compatibility shim.
// LetsExchange (POST route) is discontinued; frontend callers use GET.
// Proxies internally to the working multi-quote (SimpleSwap/ChangeNow).
// Also warms venue connections on server start so first user request is fast.
import { Router } from "express";
const router = Router();
const cache = new Map<string, { at: number; data: any }>();
const PORT = process.env.PORT || 8080;

async function quotePair(from: string, to: string) {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/swap/multi-quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assetIn: from, assetOut: to, amountIn: 1 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d?.best ?? null;
}

router.get("/letsexchange/estimate", async (req, res) => {
  const from = String(req.query.from || "").toUpperCase();
  const to = String(req.query.to || "").toUpperCase();
  const amount = Number(req.query.amount || 1);
  if (!from || !to || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "from, to, amount required" });
  }
  const key = `${from}/${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5000) return res.json(hit.data);
  try {
    const best = await quotePair(from, to);
    if (!best) return res.status(404).json({ error: "no route" });
    const rate = (Number(best.expectedOutput) / amount).toPrecision(8);
    const payload = {
      from, to, amount, rate,
      minAmount: best.minAmount != null ? String(best.minAmount) : "0",
      maxAmount: best.maxAmount != null ? String(best.maxAmount) : null,
      venue: best.venue,
      usdPrice: 1,
    };
    cache.set(key, { at: Date.now(), data: payload });
    res.json(payload);
  } catch (e: any) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

// Warm-up: prime venue TLS + quote caches ~8s after boot
setTimeout(() => {
  const pairs = [["BTC","ETH"],["BTC","USDT"],["BTC","BSV"],["ETH","USDT"]];
  for (const [f, t] of pairs) quotePair(f, t).catch(() => {});
}, 8000);

export default router;
