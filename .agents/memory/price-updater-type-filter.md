---
name: price-updater DB query timeout guards
description: Full diagnosis of price-updater DEAD in production — root cause is withDbRetry × connectionTimeoutMillis exhaustion, fixed with Promise.race guards and a type filter on the bulk UPDATE.
---

## Full Root Cause (production)

`withDbRetry` retries up to 4 times (RETRY_MAX=3, attempts 0–3), each waiting up
to `connectionTimeoutMillis: 15_000` ms for a pool connection. Under DB connection
storm (thundering herd of workers all competing for connections):

- Each Drizzle query can take up to: 4 × 15s + ~3.5s backoff = **63.5 s**
- `updateMarketPrices()` makes TWO Drizzle calls:
  1. own-trades overlay in `fetchSovereignPrices()` — up to 63.5s
  2. markets SELECT in `updateMarketPrices()` — up to 63.5s
- Total worst-case: 63.5 + 63.5 = **127s > 120s guardedInterval timeout**
- Result: price-updater times out at exactly 120s on every run

## Fixes Applied

1. **Promise.race 5s guard** on own-trades overlay query — this is optional
   volume data; skip it gracefully if the pool is congested.

2. **Promise.race 12s guard** on markets SELECT — if the DB is unavailable,
   fail fast and let the next cycle retry rather than burning 120s.

3. **`AND m.type IN ('spot', 'futures')`** added to the bulk UPDATE WHERE
   clause — prevents full 2M-row sequential scan; restricts to ~4K rows using
   the existing `idx_markets_type` index. Without this filter, even when the
   pool is healthy, the UPDATE itself can take 90s+ on 2M rows.

4. **`idx_markets_symbol`** added to `app.ts` — additional index for future
   queries that join on symbol.

**Why:** The thundering herd (many workers starting simultaneously) exhausts
the connection pool. Each Drizzle call silently retries 4×15s instead of
failing fast. Adding Promise.race guards makes the price-updater bail out in
<20s instead of burning all 120s.

**How to apply:** Any Drizzle query inside a guardedInterval worker that is
optional or can be skipped if the DB is slow MUST be wrapped in Promise.race
with a timeout ≤ (worker_timeoutMs / num_db_calls). Required queries should
use the same pattern with a longer timeout and log on skip.

## Verification

Dev: full price-updater tick completes in <200ms after fix (was DEAD at 120s in prod).
