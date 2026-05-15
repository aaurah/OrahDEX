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
  // Evict idle connections after 20 s — well below Replit Postgres's idle
  // timeout — so stale sockets are recycled before the server closes them.
  idleTimeoutMillis: 20_000,
  // Fail fast on new connection attempts rather than hanging indefinitely.
  connectionTimeoutMillis: 10_000,
  // Cap pool size to avoid overwhelming the managed database.
  // 20 connections gives background bots (liquidity, price, arb) enough headroom
  // to run bulk operations concurrently without timing out user-facing requests.
  max: 20,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
