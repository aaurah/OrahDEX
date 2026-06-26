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
  // Setting the initial delay to 0 means the kernel sends the first probe as
  // soon as the socket is idle rather than waiting 10+ seconds — this prevents
  // Replit's managed Postgres (which drops idle sockets after ~5–8 s) from
  // killing connections that are still in the pool but not yet evicted.
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,
  // Evict idle connections after 8 s — well below the network's idle-drop
  // window — so stale sockets are recycled before the server closes them.
  idleTimeoutMillis: 8_000,
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

// Catch errors on idle clients in the pool (e.g. a connection dropped by the
// server while sitting unused). Without this handler Node.js would emit an
// unhandled 'error' event and potentially crash the process.
pool.on("error", (err, _client) => {
  console.error("[pg-pool] idle client error — connection will be discarded:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
