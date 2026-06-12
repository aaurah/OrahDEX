import app from "./app";
import { logger } from "./lib/logger";

import net from "node:net";

// ── Critical env-var validation (fail fast before the HTTP server starts) ─────
// Variables that are not set here will cause silent runtime failures deep
// in the first request that exercises that code path.
const REQUIRED_VARS: Array<{ name: string; fatal: boolean }> = [
  { name: "DATABASE_URL",        fatal: true  }, // fatal — DB routes hard-fail without a connection string
  { name: "API_KEY_HMAC_SECRET", fatal: true  }, // fatal — API key auth cannot run without the HMAC pepper
  { name: "EVM_WALLET_SECRET",   fatal: false }, // warn only — relayer/deposit features degrade gracefully
  { name: "EVM_WEBHOOK_SECRET",  fatal: false }, // warn only — set this in production to secure webhook endpoint
];

for (const { name, fatal } of REQUIRED_VARS) {
  if (!process.env[name]?.trim()) {
    if (fatal) {
      throw new Error(`[FATAL] ${name} is not set. Refusing to start.`);
    }
    // Use console.warn here — logger may not be initialised yet
    console.warn(`[WARN] ${name} is not set — related features will be unavailable.`);
  }
}

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 8080;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/* ── Process-level crash shields ──────────────────────────────────────────────
   These prevent the process from dying on unhandled async errors or uncaught
   exceptions thrown deep in third-party libs or background tasks.
   We log the error and stay alive — all routes continue serving.
── */
process.on("uncaughtException", (err: Error) => {
  logger.error({ err: err?.message, stack: err?.stack }, "uncaughtException — process stays alive");
});

process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error({ reason: msg, stack }, "unhandledRejection — process stays alive");
});

/* ── Graceful shutdown on signals ─────────────────────────────────────────── */
let server: ReturnType<typeof app.listen>;

function shutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received — closing server");
  server.close(() => {
    logger.info("HTTP server closed cleanly");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("Forced shutdown after 10s timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

/* ── Wait until port is free, then start ─────────────────────────────────── */
function isPortFree(p: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once("error", () => resolve(false))
      .once("listening", () => { tester.close(); resolve(true); })
      .listen(p, "0.0.0.0");
  });
}

async function startWithRetry(maxAttempts = 20, delayMs = 1500): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const free = await isPortFree(port);
    if (free) break;
    logger.warn({ port, attempt, maxAttempts }, `Port in use — waiting ${delayMs}ms before retry…`);
    await new Promise(r => setTimeout(r, delayMs));
    if (attempt === maxAttempts) {
      logger.error({ port }, "Port still in use after all retries — exiting");
      process.exit(1);
    }
  }

  server = app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    logger.error({ err: err.message, code: err.code }, "Server error after start");
    process.exit(1);
  });
}

startWithRetry();

/* Keep the event loop alive so that even if all timers and pending callbacks
   clear, the process stays up and keeps the HTTP server accepting connections. */
setInterval(() => {}, 30_000);
