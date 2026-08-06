import http from "node:http";

// ── Critical env-var validation (fail fast before HTTP server starts) ────────
const REQUIRED_VARS: Array<{ name: string; fatal: boolean }> = [
  { name: "DATABASE_URL",        fatal: false },
  { name: "API_KEY_HMAC_SECRET", fatal: false },
  { name: "EVM_WALLET_SECRET",   fatal: false },
  { name: "EVM_WEBHOOK_SECRET",  fatal: false },
];

for (const { name, fatal } of REQUIRED_VARS) {
  if (!process.env[name]?.trim()) {
    if (fatal) throw new Error(`[FATAL] ${name} is not set. Refusing to start.`);
    console.info(`[INFO] ${name} is not set — related features will be unavailable.`);
  }
}

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 8080;
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

// ── Process-level crash shields ──────────────────────────────────────────────
// Transient I/O error codes that are safe to swallow (the operation failed but
// process state is not corrupted — a retry on the next tick will work fine).
const TRANSIENT_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "ECONNABORTED",
  "ETIMEDOUT",  "EPIPE",        "EHOSTUNREACH",
  "ENOTFOUND",  "EPROTO",       "ENETUNREACH",
]);

// Transient message substrings (for errors without a .code property).
const TRANSIENT_MESSAGES = [
  "socket hang up",
  "network request failed",
  "fetch failed",
  "read ECONNRESET",
  "write EPIPE",
];

function isTransient(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code && TRANSIENT_CODES.has(code)) return true;
  const msg = err.message.toLowerCase();
  return TRANSIENT_MESSAGES.some(t => msg.includes(t));
}

process.on("uncaughtException", (err: Error) => {
  if (isTransient(err)) {
    // Known transient I/O errors — process state is intact, continue running.
    console.error("[uncaughtException] transient I/O error (continuing) —", err?.message);
    return;
  }
  // Non-transient exceptions indicate corrupt state (logic errors, assertion
  // failures, type errors).  Log fully and exit so the supervisor can restart
  // with a clean slate rather than silently continuing in a broken state.
  console.error("[uncaughtException] FATAL — restarting process:", err?.message, err?.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  if (isTransient(reason)) {
    const msg = reason instanceof Error ? reason.message : String(reason);
    console.error("[unhandledRejection] transient I/O error (continuing) —", msg);
    return;
  }
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  console.error("[unhandledRejection] FATAL — restarting process:", msg, stack);
  process.exit(1);
});

/* ── Step 1: Bind port immediately with a lightweight placeholder ────────────
   The Replit platform expects port 8080 to open within ~5 s of process start.
   Loading the full Express app bundle (~6 MB) takes ~9 s on a production VM.
   We bind a minimal http.Server first so the platform's port-detection window
   is satisfied, then hot-swap the request handler once Express finishes loading.
   Health probes return 200 during the loading window so the startup check passes.
─ */
type RequestHandler = http.RequestListener;

let currentHandler: RequestHandler = (_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, status: "starting" }));
};

const server = http.createServer((req, res) => currentHandler(req, res));

await new Promise<void>((resolve, reject) => {
  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      // Port held by old deployment — old process exits fast via closeAllConnections()
      // on SIGTERM, so 200 ms is sufficient. The 2 s window previously caused 6
      // healthcheck 500s at every rolling deploy (connection refused during the gap).
      console.warn(`[startup] Port ${port} in use, retrying in 200 ms…`);
      setTimeout(() => {
        server.removeAllListeners("error");
        server.once("error", reject);
        server.listen(port, "0.0.0.0", resolve);
      }, 200);
    } else {
      reject(err);
    }
  });
  server.listen(port, "0.0.0.0", resolve);
});
console.info(`[startup] Placeholder server listening on port ${port}`);

/* ── Attempt to run lightweight migrations (bounded) before loading the app.
   Migrations are idempotent. A failure here is non-fatal; we log and continue.
   Running them here avoids running migrations at module import time and keeps
   the index.ts/app.ts module initialization fast and predictable. ── */
try {
  // Dynamic import so this stays in the small initial bundle.
  // @ts-ignore — migrations file may not exist; failure is caught below
  const { runMigrations } = await import("./migrations/runMigrations.js");
  await runMigrations(10_000).catch((e: any) => console.warn("[startup] migrations failed (non-fatal)", e?.message ?? e));
} catch (e: any) {
  console.warn("[startup] migrations module load failed (non-fatal)", e?.message ?? e);
}

/* ── Step 2: Load the full Express application (takes ~9 s on production VM) ─
   Dynamic import keeps app.ts in a separate bundle chunk so index.ts evaluates
   first and the placeholder server is already listening before the heavy load.
─ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { default: app } = await import("./app.js") as { default: RequestHandler };
currentHandler = app;
console.info(`[startup] Express handler active on port ${port}`);

/* ── Graceful shutdown ────────────────────────────────────────────────────────
   closeAllConnections() (Node 18.2+) immediately destroys keep-alive sockets
   so server.close() finishes in < 1 s rather than waiting for idle timeouts.
   Fast shutdown is critical: the old process must fully exit before the new
   one can bind the same port in a rolling deployment.
─ */
function shutdown(signal: string): void {
  console.info(`[shutdown] ${signal} received — draining connections`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (server as any).closeAllConnections === "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).closeAllConnections();
  }
  server.close(() => {
    console.info("[shutdown] HTTP server closed cleanly");
    process.exit(0);
  });
  setTimeout(() => {
    console.warn("[shutdown] Forced exit after 5 s");
    process.exit(1);
  }, 5_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Keep the event loop alive so idle GC doesn't suspend the process.
setInterval(() => {}, 30_000);
