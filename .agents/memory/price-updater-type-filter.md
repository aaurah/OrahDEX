---
name: price-updater DB query timeout guards + bulk chunk fix
description: Full diagnosis of price-updater DEAD in production — two root causes: withDbRetry exhaustion (fixed with Promise.race guards) AND BULK_CHUNK=500 causing 8 chunks × 15s = 120s loop (fixed by increasing to 4000 + break on failure).
---

## Root Cause A: withDbRetry × connectionTimeoutMillis (fixed first)

`withDbRetry` retries up to 4 times (RETRY_MAX=3, attempts 0–3), each waiting
up to `connectionTimeoutMillis: 15_000` ms for a pool connection. Under DB
connection storm: each Drizzle query can take up to 4 × 15s + ~3.5s = 63.5s.

With two Drizzle calls in `updateMarketPrices()`: 63.5 + 63.5 = 127s > 120s timeout.

**Fix A:** Promise.race guards:
- 5s on own-trades overlay query (optional volume data — skip if pool congested)
- 12s on markets SELECT (fail fast and retry next cycle)

## Root Cause B: BULK_CHUNK = 500 (the definitive root cause — fixed second)

The bulk UPDATE loop used `BULK_CHUNK = 500`. With ~4000 spot/futures markets:
- 4000 / 500 = **8 chunks**
- Each chunk calls `pool.query()` via `withRetry({ maxAttempts: 1 })`
- Under pool exhaustion, each chunk waits `connectionTimeoutMillis: 15s` then throws
- The `.catch()` swallowed the error and the `for` loop **continued** to the next chunk
- Result: **8 × 15s = 120s** — exactly the guardedInterval timeout, every time

This is why the price-updater consistently timed out at EXACTLY 120,000ms.

**Fix B:**
1. `BULK_CHUNK 500 → 4_000` — ~4K markets fit in 1 chunk → max wait = 1 × 15s = 15s
2. `break` on first chunk failure — pool exhaustion hits every chunk equally;
   stopping immediately prevents burning 15s × (N-1) on doomed subsequent chunks

## Verification

Dev: two consecutive successful ticks at 03:38:55 and 03:39:46 (51s apart,
well under 120s timeout). No failures. BULK_CHUNK=4000 produces ~1 UPDATE
with 32K parameters (4K rows × 8 cols) — well within PostgreSQL's 65535 limit.

## Key Rule

Any `for` loop over DB writes inside a guardedInterval MUST:
1. Use the largest chunk size that fits within PostgreSQL's 65535 param limit
2. `break` on the first chunk failure (pool exhaustion is not transient within
   a single tick — all subsequent chunks will also fail)
3. Have the outer worker's timeout > (max_chunks × connectionTimeoutMillis)

**Why:** Pool exhaustion is all-or-nothing within a single tick. Continuing the
loop after one failure wastes `connectionTimeoutMillis × remaining_chunks`
seconds. With BULK_CHUNK=500 and 8 chunks, this exactly consumed the 120s budget.
