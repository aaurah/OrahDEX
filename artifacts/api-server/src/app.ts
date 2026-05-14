import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import router from "./routes";
import v1Router from "./routes/v1.js";
import { logger } from "./lib/logger";
import { startPriceUpdater } from "./lib/priceUpdater.js";
import { startLiquidityBot } from "./lib/liquidityBot.js";
import { startArbBot } from "./lib/arbBot.js";
import { startFuturesProfitEngine } from "./lib/futuresProfitEngine.js";
import { startBsvChainMonitor, getBsvChainStatus } from "./lib/bsvChainMonitor.js";
import { startBsvDepositWatcher } from "./lib/bsvDepositWatcher.js";
import { startEvmDepositWatcher } from "./lib/evmDepositWatcher.js";
import { startRouteCache } from "./lib/routeCache.js";
import { startHtlcWatcher } from "./lib/htlcWatcher.js";
import { startEvmHtlcWatcher } from "./lib/evmHtlc.js";
import { warmCurrenciesCache } from "./routes/letsexchange.js";
import { hydrateAdminTokens } from "./middleware/adminAuth.js";
import { startCopyOrchestrator } from "./lib/copyOrchestrator.js";
import { apiKeyAuth, startApiKeyCounterFlusher } from "./middleware/apiKeyAuth.js";
import { WebhookHandlers } from "./webhookHandlers.js";
import evmWebhookRouter from "./routes/evmWebhookRouter.js";
import { getHealthReport, startOrderReconciler } from "./lib/selfHealing.js";
import { startAllReconcilers } from "./lib/selfHealingReconcilers.js";
import { hydrateAlertsFromDB } from "./lib/alertBus.js";
import { startExchangeApiRepairEngine } from "./lib/exchangeApiRepairEngine.js";

const app: Express = express();
const middlewareRegistrationOrder: string[] = [];

function assertWebhookMiddlewareOrder(order: string[]): void {
  const jsonIdx = order.indexOf("express.json");
  const evmIdx = order.indexOf("evm-webhook");
  const stripeIdx = order.indexOf("stripe-webhook");
  if (jsonIdx === -1 || evmIdx === -1 || stripeIdx === -1) {
    throw new Error("[FATAL] Missing middleware registration markers for webhook order assertion");
  }
  if (evmIdx > jsonIdx || stripeIdx > jsonIdx) {
    throw new Error("[FATAL] Webhook routes must be registered before express.json()");
  }
}

/* ── Trust proxy — required for correct IP detection behind Replit's reverse proxy
 * Enables accurate rate-limiting and X-Forwarded-For header parsing. ────────── */
app.set("trust proxy", 1);

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
// Build the allowed-origin list:
//   1. ALLOWED_ORIGINS env var (comma-separated, takes full precedence when set)
//   2. Hard-coded custom domains
//   3. All *.replit.app / *.replit.dev subdomains (covers all Replit deployments)
//   4. localhost variants (dev convenience)
const _allowedOrigins: (string | RegExp)[] = process.env["ALLOWED_ORIGINS"]
  ? process.env["ALLOWED_ORIGINS"].split(",").map(o => o.trim()).filter(Boolean)
  : [
      "https://orahdex.org",
      "https://www.orahdex.org",
      /^https?:\/\/[^.]+\.replit\.app$/,
      /^https?:\/\/[^.]+\.replit\.dev$/,
      /^https?:\/\/localhost(:\d+)?$/,
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    ];

app.use(cors({
  origin: _allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "x-admin-token"],
  credentials: true,
}));

/* ── EVM webhook — registered BEFORE express.json() ──────────────────────────
   HMAC-SHA256 signature verification requires the raw request body (Buffer).
   Any body-parsing middleware applied before this route would break verification.
   Receives EVM log events from any compatible provider (Alchemy, Infura, etc.).
   Env: EVM_WEBHOOK_SECRET — shared HMAC secret for payload verification.
   Paths: POST /api/webhooks/evm  (primary)
          POST /api/webhooks/quicknode  (legacy, for existing registrations)
── */
app.use(
  "/api/webhooks",
  express.raw({ type: "*/*" }),
  evmWebhookRouter,
);
middlewareRegistrationOrder.push("evm-webhook");

/* ── Stripe webhook — MUST be registered BEFORE express.json() ───────────────
   Stripe requires the raw request body (Buffer) to verify the signature.
   Any body-parsing middleware applied before this route will break verification.
── */
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    if (!sig || typeof sig !== "string") {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.json({ received: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? "Webhook processing failed" });
    }
  }
);
middlewareRegistrationOrder.push("stripe-webhook");

// Image-bearing endpoints (camera/AI base64 data-URLs ≈ 3-6 MB) get a higher
// body-size cap; everything else stays at the safer 1 MB to limit DoS surface.
const LARGE_BODY_PATHS = new Set([
  "/api/social/ai/image",
  "/api/social/posts",
]);
const LARGE_BODY_RE = /^\/api\/social\/creators\/[^/]+\/update$/;
const largeJson = express.json({ limit: "12mb" });
const largeForm = express.urlencoded({ extended: true, limit: "12mb" });
app.use((req, res, next) => {
  if (LARGE_BODY_PATHS.has(req.path) || LARGE_BODY_RE.test(req.path)) {
    return largeJson(req, res, (err) => err ? next(err) : largeForm(req, res, next));
  }
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
middlewareRegistrationOrder.push("express.json");
assertWebhookMiddlewareOrder(middlewareRegistrationOrder);

/* ── Rate limiting ────────────────────────────────────────────────────────────
 * Layered approach:
 *  - Global:  200 req / 1 min per IP  (protects all endpoints)
 *  - Exchange mutations: 30 req / min  (orders, swap, p2p fill, LE exchange)
 *  - Estimate/quote:    60 req / min  (rate-check calls, slightly relaxed)
 * Skip counting for trusted health/ping endpoints to avoid alert noise.
 */
const globalLimiter = rateLimit({
  windowMs:          60_000,
  max:               200,
  standardHeaders:   "draft-7",
  legacyHeaders:     false,
  skip: (req) => req.path === "/api/ping" || req.path === "/api/health" || req.path === "/api/healthz",
  handler: (_req, res) => res.status(429).json({ error: "Too many requests — please slow down." }),
});
app.use(globalLimiter);

/* Stricter limit for financial write operations */
const exchangeLimiter = rateLimit({
  windowMs:        60_000,
  max:             30,
  standardHeaders: "draft-7",
  legacyHeaders:   false,
  handler: (_req, res) => res.status(429).json({ error: "Exchange rate limit reached — wait a moment before retrying." }),
});
const EXCHANGE_WRITE_PATHS = [
  "/api/swap",
  "/api/orders",
  "/api/p2p/intents",
  "/api/letsexchange/exchange",
  "/api/genesis/swap",
  "/api/settlement/evm/session",
  "/api/settlement/evm/confirm-lock",
];
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET" && EXCHANGE_WRITE_PATHS.some(p => req.path === p || req.path.startsWith(p + "/"))) {
    return exchangeLimiter(req, res, next);
  }
  return next();
});

/* Relaxed limit for estimate / quote endpoints (called on every keystroke) */
const estimateLimiter = rateLimit({
  windowMs:        60_000,
  max:             60,
  standardHeaders: "draft-7",
  legacyHeaders:   false,
  handler: (_req, res) => res.status(429).json({ error: "Quote rate limit reached — wait a moment." }),
});
app.use("/api/letsexchange/estimate", estimateLimiter);
app.use("/api/swap/quote",            estimateLimiter);

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

/* ── Request timeout — prevents hung external calls blocking a slot ────────── */
app.use((_req: Request, res: Response, next: NextFunction) => {
  // AI image generation (gpt-image-1) can take 90–120 s — give it extra headroom.
  const isAiImage = _req.path === "/social/ai/image" && _req.method === "POST";
  const ms = isAiImage ? 120_000 : (_req.method === "GET" ? 30_000 : 60_000);
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ error: "Request timeout" });
    }
  }, ms);
  const clear = () => clearTimeout(timer);
  res.on("finish", clear);
  res.on("close",  clear);
  next();
});

/* ── Connectivity ping — returns 204, registered before main router ──────── */
app.get("/api/ping", (_req, res) => {
  res.status(204).end();
});

/* ── Health checks — MUST be registered BEFORE app.use("/api", router).
   The main router mounts futuresRouter at "/" without a prefix, and that
   router has a blanket middleware that returns 503 for all requests when
   FUTURES_ENABLED !== "true". Registering /health here (before the router)
   means Express matches these routes first and never reaches the futures
   middleware, so the health pulse stays green when futures are disabled. ── */
app.get("/api/health",  healthHandler);
app.get("/api/healthz", healthHandler);

app.use("/api", apiKeyAuth);
app.use("/v1", apiKeyAuth);
app.use("/api", router);
app.use("/v1", v1Router);
startApiKeyCounterFlusher();

/* ── Static frontend — served in production (Replit deployment) ──────────────
   The Vite build outputs to artifacts/bsv-dex/dist/public.
   From the compiled server at artifacts/api-server/dist/, that is two levels up.
   Serving from the same Express process eliminates the need for a separate
   preview server and the /api proxy problem it creates.
── */
if (process.env.NODE_ENV === "production") {
  const __serverDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.resolve(__serverDir, "../../bsv-dex/dist/public");
  if (fs.existsSync(frontendDist)) {
    logger.info({ frontendDist }, "Serving static frontend in production");
    // Static assets — long-lived cache for hashed filenames
    app.use(express.static(frontendDist, {
      maxAge: "1y",
      immutable: true,
      index: false,
    }));
    // SPA catch-all: any path not matched by /api or /v1 serves index.html
    app.get(/^(?!\/api|\/v1).*$/, (_req: Request, res: Response) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  } else {
    logger.warn({ frontendDist }, "Frontend dist not found — skipping static serving");
  }
}

/* ── Global Express error handler — catches any sync/async route throw ─────── */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const msg  = err instanceof Error ? err.message : String(err);
  const code = (err as any)?.status ?? (err as any)?.statusCode ?? 500;
  logger.error({ err: msg, url: _req.url }, "Unhandled route error");
  if (!res.headersSent) {
    res.status(typeof code === "number" ? code : 500).json({ error: "Internal server error" });
  }
});

/* ── Background services — each wrapped so one failure can't crash others ──── */
hydrateAdminTokens().catch(e => logger.warn({ err: e }, "hydrateAdminTokens failed (non-fatal)"));
startCopyOrchestrator();
// Delay the LE currencies warm-up by 60 s so it doesn't add to the boot-time
// memory spike caused by other concurrent startup tasks.
setTimeout(() => {
  warmCurrenciesCache().catch(e => logger.warn({ err: e }, "warmCurrenciesCache failed (non-fatal)"));
}, 60_000);

// syncAllLEPairs() is intentionally NOT called at startup.
// The DB already holds LE pairs from a previous run (36 K+ rows).
// Calling it here would build 109,230 pair objects in RAM before the first
// JSON.stringify completes, causing an out-of-memory crash on every boot.
// The /api/admin/sync-le-pairs endpoint triggers it on demand when needed.
try { startPriceUpdater();        } catch (e) { logger.error({ err: e }, "startPriceUpdater failed to init"); }
try { startLiquidityBot();        } catch (e) { logger.error({ err: e }, "startLiquidityBot failed to init"); }
try { startArbBot();              } catch (e) { logger.error({ err: e }, "startArbBot failed to init"); }
try { startFuturesProfitEngine(); } catch (e) { logger.error({ err: e }, "startFuturesProfitEngine failed to init"); }
try { startBsvChainMonitor();     } catch (e) { logger.error({ err: e }, "startBsvChainMonitor failed to init"); }
try { startBsvDepositWatcher();   } catch (e) { logger.error({ err: e }, "startBsvDepositWatcher failed to init"); }
try { startEvmDepositWatcher();   } catch (e) { logger.error({ err: e }, "startEvmDepositWatcher failed to init"); }
startHtlcWatcher().catch(e => logger.error({ err: e }, "startHtlcWatcher failed to init"));
startEvmHtlcWatcher().catch(e => logger.error({ err: e }, "startEvmHtlcWatcher failed to init"));
try { startRouteCache();          } catch (e) { logger.error({ err: e }, "startRouteCache failed to init"); }
try { startOrderReconciler();              } catch (e) { logger.error({ err: e }, "startOrderReconciler failed to init"); }
try { startAllReconcilers();               } catch (e) { logger.error({ err: e }, "startAllReconcilers failed to init"); }
try { startExchangeApiRepairEngine();      } catch (e) { logger.error({ err: e }, "startExchangeApiRepairEngine failed to init"); }
hydrateAlertsFromDB().catch(e => logger.warn({ err: e }, "hydrateAlertsFromDB failed (non-fatal)"));

/* ── Health check — both /health and /healthz (artifact.toml uses healthz) ── */
async function healthHandler(_req: any, res: any) {
  const services = getHealthReport();
  const anyDead  = services.some(s => s.status === "dead");
  const anyStuck = services.some(s => s.status === "stuck");

  let bsvChain: { online: boolean; blockHeight: number } | undefined;
  try { const bsv = await getBsvChainStatus(); bsvChain = { online: bsv.online, blockHeight: bsv.blockHeight }; }
  catch { /* non-fatal */ }

  // Only CRITICAL services failing should degrade the public health signal.
  // Non-critical reconcilers (le-status-sync, ghost-order-detector, etc.) being
  // stuck or dead should not cause the logo pulse to go red or load-balancers to
  // pull the instance — the core exchange still works fine without them.
  const CRITICAL_SERVICES = new Set([
    "price-updater",
    "db-watchdog",
    "liquidity-bot",
  ]);
  const anyCriticalDead = services.some(
    s => s.status === "dead" && CRITICAL_SERVICES.has(s.name),
  );

  const payload = {
    status:    anyCriticalDead ? "degraded" : "ok",
    uptime:    Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    bsvChain,
    services:  services.map(s => ({
      name:              s.name,
      status:            s.status,
      lastRunAt:         s.lastRunAt?.toISOString() ?? null,
      lastSuccessAt:     s.lastSuccessAt?.toISOString() ?? null,
      consecutiveFails:  s.consecutiveFails,
      avgDurationMs:     Math.round(s.avgDurationMs),
      staleSinceMs:      s.staleSinceMs,
    })),
    alerts: [
      ...services.filter(s => s.status === "dead").map(s => `DEAD: ${s.name}`),
      ...services.filter(s => s.status === "stuck").map(s => `STUCK: ${s.name}`),
      ...services.filter(s => s.status === "degraded").map(s => `DEGRADED: ${s.name}`),
    ],
  };

  if (anyDead || anyStuck) {
    logger.warn({ alerts: payload.alerts }, "Health check: degraded services detected");
  }

  res.status(anyCriticalDead ? 503 : 200).json(payload);
}
// NOTE: /api/health and /api/healthz are registered BEFORE app.use("/api", router)
// further up in this file. These duplicate registrations are intentionally removed
// to avoid shadowing the correctly-ordered registrations above.

/* ── BSV chain status ─────────────────────────────────────────────────────── */
app.get("/api/bsv-status", async (_req, res) => {
  try {
    res.json(await getBsvChainStatus());
  } catch {
    res.status(500).json({ online: false, blockHeight: 0 });
  }
});

/* ── Thunderbird / Mozilla autoconfig XML ─────────────────────────────────── */
const AUTOCONFIG_XML = `<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="orahdex.org">
    <domain>orahdex.org</domain>
    <domain>orahdex.com</domain>
    <displayName>OrahDEX Mail</displayName>
    <displayShortName>OrahDEX</displayShortName>

    <!-- Incoming: IMAP -->
    <incomingServer type="imap">
      <hostname>mail.orahdex.org</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </incomingServer>

    <!-- Outgoing: SMTP -->
    <outgoingServer type="smtp">
      <hostname>mail.orahdex.org</hostname>
      <port>465</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;

function serveAutoconfig(_req: any, res: any) {
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(AUTOCONFIG_XML);
}

/* Standard Mozilla autoconfig path */
app.get("/.well-known/autoconfig/mail/config-v1.1.xml", serveAutoconfig);
/* Alternate path served by some mail clients */
app.get("/mail/config-v1.1.xml", serveAutoconfig);
/* Via API prefix (used by the admin panel link) */
app.get("/api/.well-known/autoconfig/mail/config-v1.1.xml", serveAutoconfig);

export default app;
