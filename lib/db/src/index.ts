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
  // Evict idle connections after 6 s — well below Replit's idle-drop window.
  idleTimeoutMillis: 6_000,
  // Fail fast (5 s) when the pool is exhausted so the backlog clears quickly
  // rather than stacking up 20 s waits that overwhelm all available slots.
  connectionTimeoutMillis: 5_000,
  // 6 connections: tighter cap prevents background engines from exhausting the
  // pool. With 5-min liquidity bot bursts and 3 order engines running every
  // 30 s each, 6 slots is sufficient and leaves headroom for HTTP requests.
  max: 6,
  // Keep the pool alive between tick cycles.
  allowExitOnIdle: false,
  // Kill runaway queries after 8 s so a slow query releases its slot quickly.
  query_timeout: 8_000,
});

// Catch errors on idle clients in the pool (e.g. a connection dropped by the
// server while sitting unused). Without this handler Node.js would emit an
// unhandled 'error' event and potentially crash the process.
pool.on("error", (err, _client) => {
  console.error("[pg-pool] idle client error — connection will be discarded:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
