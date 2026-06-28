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
  // Evict idle connections after 10 s. Replit/Neon Postgres terminates idle
  // connections server-side in well under 2 minutes; holding them longer than
  // the server-side cutoff causes "Connection terminated due to connection
  // timeout" errors when the pool hands out a dead connection. 10 s is short
  // enough to evict stale connections before Neon kills them, while still
  // amortising the reconnect cost across same-tick multi-query bursts.
  idleTimeoutMillis: 10_000,
  // Allow up to 15 s for a slot to free up when all connections are busy.
  // With 12+ concurrent background services the old 5 s limit caused a cascade
  // of "timeout exceeded when trying to connect" across every engine.
  connectionTimeoutMillis: 15_000,
  // 20 connections: enough for 12+ background engines + HTTP handlers to run
  // concurrently without queuing. Replit's hosted PostgreSQL comfortably
  // supports this; the previous cap of 6 was the primary cause of pool
  // exhaustion under the current service load.
  max: 20,
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

export const db = drizzle(pool, { schema });

/** Return true for transient network-level Postgres errors that are safe to retry. */
function isTransientPgError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Connection terminated") ||
    msg.includes("connection timeout") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("read ETIMEDOUT")
  );
}

/**
 * Run `fn` and, if it throws a transient pg connection error, wait 250 ms and
 * try once more.  Use this around critical background-service writes that must
 * not silently drop data when Neon prunes an idle socket mid-query.
 *
 * @example
 *   await withDbRetry(() => db.insert(t).values(row).onConflictDoUpdate(...));
 */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientPgError(err)) throw err;
    await new Promise(r => setTimeout(r, 250));
    return fn(); // one retry — if this throws, let it propagate
  }
}

export * from "./schema";
