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
  // Keep TCP connections alive so the managed Postgres server does not silently
  // drop idle sockets. Without this the pool reuses dead connections and gets
  // "Authentication timed out" across all background workers simultaneously.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  // Evict idle connections after 15 s — well below Replit Postgres's idle
  // timeout — so stale sockets are recycled before the server closes them.
  idleTimeoutMillis: 15_000,
  // Wait up to 15 s for a free connection.  On cold-start 20+ background jobs
  // fire at once; 6 s was too short and caused cascade "Connection terminated
  // due to connection timeout" failures before any connections were established.
  connectionTimeoutMillis: 15_000,
  // 25 connections: liquidity bot (2 seq) + price updater (1 bulk) + watchers (4)
  // + futures engine (1 seq) + user-facing headroom (17).
  max: 25,
  // Kill any query that runs longer than 6 s on the client side.  Background
  // jobs catch and retry; API routes respond with a graceful fallback instead
  // of hanging until the proxy aborts the request.
  query_timeout: 6_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
