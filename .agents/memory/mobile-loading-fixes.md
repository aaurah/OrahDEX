---
name: Mobile loading fixes
description: Static file server (server.mjs) must have gzip; large JS bundles kill load times. Reown/WalletConnect must be in try-catch at module level.
---

# Mobile / Production Loading Fixes

## Rule: server.mjs MUST have gzip compression

**Why:** The production static file server for bsv-dex is `artifacts/bsv-dex/server.mjs`. Without gzip, it streams raw JS files to the browser. The vendor-misc chunk is 5.3MB raw → 1.4MB with gzip (74% savings). Without gzip, initial JS download is ~8MB and the page shows "Loading OrahDEX..." for 15+ seconds. This issue recurred twice — once as "serve-static.mjs" and again as "server.mjs".

**How to apply:** Any time `server.mjs` is created or modified, verify it uses `zlib.createGzip()` on compressible file types (.js, .css, .html, .json, .svg). Set `Content-Encoding: gzip` and `Vary: Accept-Encoding` headers. The current implementation (June 2026) is correct.

## Rule: Reown/WalletConnect must be in try-catch at module level

**Why:** If `@reown/appkit` or `@walletconnect/*` throws at module import time, the entire React bundle fails to mount and the splash screen sticks forever.

**How to apply:** In `artifacts/bsv-dex/src/lib/reown.ts`, the `createAppKit()` and `WagmiAdapter` instantiation are already wrapped in a top-level `try { } catch { }` block. Do not move them outside the try-catch.

## Production DB: markets table requires (enabled, type) index

**Why:** The markets table has 1.1M+ rows. The main public query (`WHERE enabled=true AND type!='letsexchange'`) does a full sequential scan without an index → 20s+ Query read timeout → 25 DB connections exhausted → every API request times out.

**How to apply:** The index `markets_enabled_type_idx ON markets(enabled, type)` is added to:
1. `lib/db/src/schema/markets.ts` via Drizzle `index()`
2. `artifacts/api-server/src/app.ts` startup migration: `CREATE INDEX CONCURRENTLY IF NOT EXISTS markets_enabled_type_idx ON markets(enabled, type)`

## Pool timeouts — critical split

**Why:** On cold-start, 20+ background jobs fire simultaneously and all request DB connections. If `connectionTimeoutMillis` is too short (6s was tried), jobs that can't acquire a connection within that window die immediately with "Connection terminated due to connection timeout", causing a cascade that starves `/api/markets` too. `query_timeout` (how long a query can RUN) is separate from `connectionTimeoutMillis` (how long to WAIT for a free slot in the pool).

**How to apply:**
- `query_timeout: 6_000` — kill runaway queries fast (keeps background jobs from holding connections forever)
- `connectionTimeoutMillis: 15_000` — allow enough time to acquire a connection during busy startup; 6s caused cascade failures

## Background job indexes also needed

**Why:** `arbBot` does `SELECT ... WHERE status='active'` and `priceUpdater.seedMarketsIfNeeded` does `SELECT symbol FROM markets` — both full scans on 1.1M rows with the 6s `query_timeout` causing constant failures. Fix: add `markets_status_idx ON markets(status) WHERE enabled=true` partial index.

**How to apply:** Added to `artifacts/api-server/src/app.ts` startup migration alongside `markets_enabled_type_idx`.
