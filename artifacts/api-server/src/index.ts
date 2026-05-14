import app from "./app";
import { logger } from "./lib/logger";

import net from "node:net";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

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
