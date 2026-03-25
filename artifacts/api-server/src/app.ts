import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startPriceUpdater } from "./lib/priceUpdater.js";
import { startLiquidityBot } from "./lib/liquidityBot.js";
import { startFuturesProfitEngine } from "./lib/futuresProfitEngine.js";
import { startBsvChainMonitor, getBsvChainStatus } from "./lib/bsvChainMonitor.js";

const app: Express = express();

/* ── Compression — gzip all API responses (typically 60-80% smaller) ──── */
app.use(compression({
  level: 6,
  threshold: 512,
  filter: (req: Request, res: Response) => {
    if (req.headers["x-no-compression"]) return false;
    return compression.filter(req, res);
  },
}));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

/* ── Smart cache headers for common API routes ──────────────────────────── */
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const url = req.path;
  const method = req.method;

  if (method !== "GET") {
    /* No caching for mutations */
    res.setHeader("Cache-Control", "no-store");
    return next();
  }

  /* Price endpoints — short TTL (matches the 60s price updater interval) */
  if (url.startsWith("/markets") || url.startsWith("/prices") || url.startsWith("/ticker")) {
    res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=30");
    return next();
  }

  /* Order book — near real-time */
  if (url.startsWith("/orderbook") || url.startsWith("/trades")) {
    res.setHeader("Cache-Control", "public, max-age=5, stale-while-revalidate=10");
    return next();
  }

  /* GeckoTerminal / DexScreener proxy — these have their own TTL */
  if (url.startsWith("/gt/") || url.startsWith("/dexscreener/")) {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return next();
  }

  /* Static reference data — can cache longer */
  if (url.startsWith("/pairs") || url.startsWith("/chains")) {
    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
    return next();
  }

  /* Health and chain status */
  if (url === "/health" || url === "/ping" || url.startsWith("/bsv-status")) {
    res.setHeader("Cache-Control", "public, max-age=10, stale-while-revalidate=20");
    return next();
  }

  /* Admin endpoints — never cache */
  if (url.startsWith("/admin")) {
    res.setHeader("Cache-Control", "no-store, no-cache");
    return next();
  }

  /* Default — 30 s cache */
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  next();
});

app.use("/api", router);

startPriceUpdater();
startLiquidityBot();
startFuturesProfitEngine();
startBsvChainMonitor();

/* ── Connectivity ping — returns 204 ─────────────────────────────────────── */
app.get("/api/ping", (_req, res) => {
  res.status(204).end();
});

/* ── Health check — both /health and /healthz (artifact.toml uses healthz) ── */
async function healthHandler(_req: any, res: any) {
  try {
    const bsv = await getBsvChainStatus();
    res.json({
      status: "ok",
      uptime: Math.floor(process.uptime()),
      bsvChain: { online: bsv.online, blockHeight: bsv.blockHeight },
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.json({ status: "ok", uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
  }
}
app.get("/api/health", healthHandler);
app.get("/api/healthz", healthHandler);

/* ── BSV chain status ─────────────────────────────────────────────────────── */
app.get("/api/bsv-status", async (_req, res) => {
  try {
    res.json(await getBsvChainStatus());
  } catch {
    res.status(500).json({ online: false, blockHeight: 0 });
  }
});

export default app;
