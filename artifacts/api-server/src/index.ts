import app from "./app";
import { logger } from "./lib/logger";
import { seedDemoVaults } from "./lib/copyOrchestrator.js";

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

/* ── Start server ─────────────────────────────────────────────────────────── */
server = app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  seedDemoVaults().catch((e) => logger.error({ err: e?.message }, "seedDemoVaults failed"));
});

/* Keep the event loop alive so that even if all timers and pending callbacks
   clear, the process stays up and keeps the HTTP server accepting connections. */
setInterval(() => {}, 30_000);
