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

## Pool timeout

**Why:** Default pool `query_timeout: 20_000ms` means background jobs hold connections for 20s before failing, starving user-facing API requests.

**How to apply:** Keep `query_timeout` and `connectionTimeoutMillis` at **6000ms** in `lib/db/src/index.ts`. Background jobs catch and retry; API routes get fast-fail behavior.
