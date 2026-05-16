import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// pg-connection-string warns that 'require', 'prefer', and 'verify-ca' will
// change semantics in pg v9.  Explicitly upgrading to 'verify-full' adopts
// the current (stricter) behaviour and silences the deprecation warning.
function resolvedDatabaseUrl(raw: string): string {
  return raw
    .replace(/sslmode=prefer/g,    "sslmode=verify-full")
    .replace(/sslmode=require/g,   "sslmode=verify-full")
    .replace(/sslmode=verify-ca/g, "sslmode=verify-full");
}

export const pool = new Pool({
  connectionString: resolvedDatabaseUrl(process.env.DATABASE_URL),
  // Keep TCP connections alive so the managed Postgres server does not silently
  // drop idle sockets. Without this the pool reuses dead connections and gets
  // "Authentication timed out" across all background workers simultaneously.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  // Evict idle connections after 15 s — well below Replit Postgres's idle
  // timeout — so stale sockets are recycled before the server closes them.
  idleTimeoutMillis: 15_000,
  // Wait up to 20 s for a free connection before erroring — long enough to ride
  // out a burst from the liquidity bot cycle without cascading failures.
  connectionTimeoutMillis: 20_000,
  // 25 connections: liquidity bot (2 seq) + price updater (1 bulk) + watchers (4)
  // + futures engine (1 seq) + user-facing headroom (17).
  max: 25,
  // Kill any query that runs longer than 20 s on the client side so a single
  // runaway query cannot hold a connection and starve the rest of the pool.
  query_timeout: 20_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
