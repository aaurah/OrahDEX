import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// pg-connection-string warns that 'require', 'prefer', and 'verify-ca' will
// change semantics in pg v9.  Explicitly upgrading to 'verify-full' adopts
// the current (stricter) behaviour and silences the deprecation warning.
function resolvedDatabaseUrl(raw: string): string {
  return raw
    .replace(/sslmode=prefer/g,    "sslmode=verify-full")
    .replace(/sslmode=require/g,   "sslmode=verify-full")
    .replace(/sslmode=verify-ca/g, "sslmode=verify-full");
}

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error(
    "[OrahDEX] WARNING: DATABASE_URL is not set. " +
    "The server will start but all database operations will fail. " +
    "Provision a PostgreSQL database and set DATABASE_URL to enable full functionality."
  );
}

// When DATABASE_URL is missing, use a placeholder URL. The pool will fail
// at connection time (not at import time), so the server can start and serve
// static files, health checks, and clearly-structured 503 responses.
const _connectionString = dbUrl
  ? resolvedDatabaseUrl(dbUrl)
  : "postgresql://nodb:nodb@localhost:5432/nodb";

export const pool = new Pool({
  connectionString: _connectionString,
  // Send TCP keepalive probes immediately when a connection becomes idle.
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,
  // Evict idle connections after 5 s. Neon kills idle sockets server-side
  // within ~60 s; 5 s gives us comfortable headroom to evict stale entries
  // before Neon beats us to it, which eliminates "Connection terminated
  // unexpectedly" errors when the pool hands out a dead connection.
  idleTimeoutMillis: 5_000,
  // Allow up to 15 s for a slot to free up when all connections are busy.
  // With 12+ concurrent background services the old 5 s limit caused a cascade
  // of "timeout exceeded when trying to connect" across every engine.
  connectionTimeoutMillis: 15_000,
  // DB_POOL_MAX lets the deployment environment tune the connection limit.
  // Default is 10 — safe for Neon's free/launch tier (max_connections=5 on
  // serverless cold-start, higher on paid).  Neon's connection pooler (pgbouncer)
  // endpoint removes this constraint if configured.  Set higher (e.g. 20–40) on
  // plans with a larger pg_max_connections budget.  Hard cap of 100 prevents
  // accidentally starving the Postgres server.
  max: Math.max(5, Math.min(100, parseInt(process.env.DB_POOL_MAX ?? "10", 10) || 10)),
  // Keep the pool alive between tick cycles.
  allowExitOnIdle: false,
  // Kill runaway queries after 30 s. The liquidity bot's bulk DELETE of 48 k
  // bot orders is a legitimate long operation that exceeds the old 8 s limit on
  // the production DB (large table + 4 indexes to update + WAL overhead).
  query_timeout: 30_000,
});

// Catch errors on idle clients in the pool (e.g. a connection dropped by the
// server while sitting unused). Without this handler Node.js would emit an
// unhandled 'error' event and potentially crash the process.
pool.on("error", (err, _client) => {
  console.error("[pg-pool] idle client error — connection will be discarded:", err.message);
});

// Attach an error handler to every client the moment it is created.
// This covers the gap where pg emits an 'error' event on the underlying
// socket of a CHECKED-OUT client (i.e. one actively running a query).
// That error is NOT caught by the pool's own 'error' event — it propagates
// to the EventEmitter as an uncaughtException, which our app.ts handler
// treats as fatal and calls process.exit(1).  By registering a listener
// here we silence it; the query's rejected Promise already surfaces the
// error to the caller, so no information is lost.
pool.on("connect", (client) => {
  client.on("error", (err) => {
    console.error("[pg-client] socket error on checked-out client (non-fatal):", err.message);
  });
});

export const db = drizzle(pool, { schema });

/** Return true for transient network-level Postgres errors that are safe to retry. */
function isTransientPgError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Connection terminated") ||
    msg.includes("connection timeout") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("read ETIMEDOUT") ||
    // Neon/Postgres kills the socket outright (compute suspend/resume, admin
    // maintenance) — the pg driver surfaces the server's raw error text
    // verbatim, so it never matches the "Connection terminated" wrapper above.
    msg.includes("administrator command")
  );
}

/**
 * Run `fn` with up to MAX_RETRIES retries on transient pg connection errors.
 * Uses exponential backoff with ±25 % jitter so simultaneous background
 * services don't all hammer the pool in lock-step after a Neon blip.
 *
 * Delays: ~500 ms, ~1 s, ~2 s  (base × 2^attempt  ± jitter)
 *
 * @example
 *   await withDbRetry(() => db.insert(t).values(row).onConflictDoUpdate(...));
 */
// 2 s base gives the pool time to re-establish fresh Neon connections after a
// mass termination event before we retry.  Retries fire at ~2 s, ~4 s, ~8 s.
const RETRY_BASE_MS  = 2_000;
const RETRY_MAX      = 3;

export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientPgError(err)) throw err;
      lastErr = err;
      if (attempt === RETRY_MAX) break;
      const base  = RETRY_BASE_MS * Math.pow(2, attempt);   // 500, 1000, 2000
      const jitter = base * 0.25 * (Math.random() * 2 - 1); // ±25 %
      await new Promise(r => setTimeout(r, Math.round(base + jitter)));
    }
  }
  throw lastErr;
}

export * from "./schema";
