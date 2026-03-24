import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import marketsRouter from "./markets.js";
import ordersRouter from "./orders.js";
import tradesRouter from "./trades.js";
import portfolioRouter from "./portfolio.js";
import futuresRouter from "./futures.js";
import adminRouter from "./admin.js";
import dexRouter from "./dex.js";
import globalMarketsRouter from "./globalMarkets.js";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// Public settings — only whitelisted keys exposed (Reown project ID is a public identifier)
const PUBLIC_SETTING_KEYS = ["reown_project_id"];
router.get("/settings/public", async (_req, res) => {
  try {
    const rows = await db.select().from(platformSettingsTable);
    const result: Record<string, string> = {};
    for (const key of PUBLIC_SETTING_KEYS) {
      const row = rows.find(r => r.key === key);
      if (row?.value) result[key] = row.value;
    }
    res.json(result);
  } catch {
    res.json({});
  }
});

router.use(healthRouter);
router.use(marketsRouter);
router.use(ordersRouter);
router.use(tradesRouter);
router.use(portfolioRouter);
router.use(futuresRouter);
router.use(dexRouter);
router.use("/admin", adminRouter);
router.use("/global-markets", globalMarketsRouter);

/* ── BSV HandCash handle resolution proxy ────────────────────────────────── */
router.get("/bsv/resolve-handle/:handle", async (req, res) => {
  const raw = req.params.handle ?? "";
  const handle = raw.replace(/^\$/, "").trim().toLowerCase();

  if (!handle || !/^[a-z0-9_.-]{1,50}$/.test(handle)) {
    res.status(400).json({ error: "Invalid handle format." });
    return;
  }

  // Paymail is the canonical BSV address format for HandCash: handle@handcash.io
  const paymailAddr = `${handle}@handcash.io`;

  // Strategy 1: Try HandCash Cloud API (server-side to avoid CORS)
  const tryUrls = [
    `https://cloud.handcash.io/v2/users/public-data?alias=${encodeURIComponent(handle)}`,
    `https://api.handcash.io/api/users/public-data?alias=${encodeURIComponent(handle)}`,
  ];

  for (const url of tryUrls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "OrahDEX/1.0" } });
      clearTimeout(timer);
      if (r.ok) {
        const data = await r.json() as any;
        const addr: string =
          data?.publicProfile?.receivingAddress ??
          data?.publicProfile?.paymail ??
          data?.receivingAddress ??
          data?.paymail ??
          paymailAddr;
        const displayName: string = data?.publicProfile?.displayName ?? `$${handle}`;
        const avatarUrl: string | null = data?.publicProfile?.avatarUrl ?? null;
        res.json({ handle: `$${handle}`, address: addr, paymail: paymailAddr, displayName, avatarUrl, resolved: true });
        return;
      }
    } catch {
      // continue to next strategy
    }
  }

  // Strategy 2: Try paymail resolution protocol (SRV/well-known)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`https://handcash.io/.well-known/bsvalias`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) {
      const cap = await r.json() as any;
      const profileUrl = cap?.capabilities?.["f12f968c92d6"]?.replace("{alias}", handle).replace("{domain.tld}", "handcash.io");
      if (profileUrl) {
        const pr = await fetch(profileUrl, { signal: new AbortController().signal });
        if (pr.ok) {
          const pd = await pr.json() as any;
          const addr = pd?.pubkey ? paymailAddr : paymailAddr;
          res.json({ handle: `$${handle}`, address: addr, paymail: paymailAddr, displayName: `$${handle}`, avatarUrl: null, resolved: true });
          return;
        }
      }
    }
  } catch {
    // continue to fallback
  }

  // Strategy 3: Fallback — paymail IS a valid BSV address (handle@handcash.io)
  logger.info({ handle }, "HandCash API unavailable — falling back to paymail format");
  res.json({
    handle: `$${handle}`,
    address: paymailAddr,
    paymail: paymailAddr,
    displayName: `$${handle}`,
    avatarUrl: null,
    resolved: false,
    fallback: true,
    message: "Resolved via paymail format — HandCash API unreachable",
  });
});

export default router;
