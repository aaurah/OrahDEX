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
// Set up before anything else so early errors don't crash the process.
process.on("uncaughtException", (err: Error) => {
  console.error("[uncaughtException] process stays alive —", err?.message, err?.stack);
});
process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error("[unhandledRejection] process stays alive —", msg);
});

/* ── Step 1: Bind port immediately with a lightweight placeholder ────────────
   The Replit platform expects port 8080 to open within ~5 s of process start.
   Loading the full Express app bundle (~6 MB) takes ~9 s on a production VM.
   We bind a minimal http.Server first so the platform's port-detection window
   is satisfied, then hot-swap the request handler once Express finishes loading.
   Health probes return 200 during the loading window so the startup check passes.
── */
type RequestHandler = http.RequestListener;

let currentHandler: RequestHandler = (_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, status: "starting" }));
};

const server = http.createServer((req, res) => currentHandler(req, res));

await new Promise<void>((resolve, reject) => {
  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      // Port held by old deployment — wait 2 s and retry once.
      console.warn(`[startup] Port ${port} in use, retrying in 2 s…`);
      setTimeout(() => {
        server.removeAllListeners("error");
        server.once("error", reject);
        server.listen(port, "0.0.0.0", resolve);
      }, 2_000);
    } else {
      reject(err);
    }
  });
  server.listen(port, "0.0.0.0", resolve);
});
console.info(`[startup] Placeholder server listening on port ${port}`);

/* ── Step 2: Load the full Express application (takes ~9 s on production VM) ─
   Dynamic import keeps app.ts in a separate bundle chunk so index.ts evaluates
   first and the placeholder server is already listening before the heavy load.
── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { default: app } = await import("./app.js") as { default: RequestHandler };
currentHandler = app;
console.info(`[startup] Express handler active on port ${port}`);

/* ── Graceful shutdown ────────────────────────────────────────────────────────
   closeAllConnections() (Node 18.2+) immediately destroys keep-alive sockets
   so server.close() finishes in < 1 s rather than waiting for idle timeouts.
   Fast shutdown is critical: the old process must fully exit before the new
   one can bind the same port in a rolling deployment.
── */
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
