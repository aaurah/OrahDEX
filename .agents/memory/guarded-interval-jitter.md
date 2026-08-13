---
name: guardedInterval thundering herd
description: setInterval causes background services to LCM-align and simultaneously exhaust the DB pool; fix is ±20% jitter via self-rescheduling setTimeout.
---

## The Rule
Every call to `guardedInterval` must use self-rescheduling `setTimeout` with ±20% random jitter, not `setInterval`. This is already implemented in `selfHealing.ts`.

**Why:** With `setInterval`, services registered at startup offsets (6 s apart) have their startup stagger fade away. After ~6 minutes (LCM of 60 s, 90 s, 120 s intervals) all services fire simultaneously. With 12+ concurrent services each needing a DB connection, the pool (max 25) is exhausted and everything gets "timeout exceeded when trying to connect" errors in a cascade.

**How to apply:** The fix is already in `guardedInterval`. Do not revert to `setInterval`. The effective period is `intervalMs ± 20% + tick_duration` — this is fine for all background maintenance tasks. The `stopped` flag ensures the chain terminates cleanly when the returned stop function is called.

## Symptoms of regression
- Multiple services failing simultaneously with "timeout exceeded when trying to connect" at the ~5-6 minute mark after startup
- All errors appear within a 30-second window across futuresProfitEngine, evmHtlc, advancedOrderEngine (TWAP/iceberg/trailing-stop), fundingRateEngine, selfDiagnostic, AlertBus

## Pool sizing
Pool max is 25 (bumped from 20 alongside the jitter fix). Neon allows 100 concurrent connections so this is safe. 25 provides headroom for any remaining bursts.
