// GET /api/letsexchange/estimate — compatibility shim.
// LetsExchange (POST route) is discontinued; frontend callers use GET.
// Proxies internally to the working multi-quote (SimpleSwap/ChangeNow).
import { Router } from "express";
const router = Router();
const cache = new Map<string, { at: number; data: any }>();
const PORT = process.env.PORT || 8080;

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
    const r = await fetch(`http://127.0.0.1:${PORT}/api/swap/multi-quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetIn: from, assetOut: to, amountIn: amount }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return res.status(502).json({ error: "quote backend failed" });
    const d = await r.json();
    const best = d?.best;
    if (!best) return res.status(404).json({ error: "no route" });
    const rate = (Number(best.expectedOutput) / amount).toPrecision(8);
    const payload = {
      from, to, amount,
      rate,
      minAmount: best.minAmount != null ? String(best.minAmount) : "0",
      maxAmount: best.maxAmount != null ? String(best.maxAmount) : null,
      venue: best.venue,
      usdPrice: d.outputUsdPrice ?? null,
    };
    cache.set(key, { at: Date.now(), data: payload });
    res.json(payload);
  } catch (e: any) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});
export default router;
