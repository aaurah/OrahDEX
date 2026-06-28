---
name: LiquidityBot concurrent cycle bug
description: Unguarded first runCycle() outside guardedInterval causes stacking concurrent cycles that exhaust the DB connection pool.
---

## The rule
`startLiquidityBot()` must never call `runCycle()` directly outside of `guardedInterval`. All cycles — including the first — must flow through `guardedInterval` so its `busy` lock prevents concurrent execution.

**Why:** The old pattern was:
```typescript
seedMarketsIfNeeded().then(() => runCycle())          // no busy flag set
guardedInterval("liquidity-bot", runCycle, 120_000)   // busy flag only covers its own calls
```
When a cycle ran long (many small DB chunks × pool-wait time), `guardedInterval` fired a second cycle at T+120s seeing `busy=false` (the first run never set it). Cycles stacked. Multiple concurrent cycles × 12+ other background services = pool exhaustion, causing `timeout exceeded when trying to connect` cascades across ALL services.

**How to apply:** Use `initialDelayMs` so `guardedInterval` owns the first run:
```typescript
seedMarketsIfNeeded()
  .catch(err => logger.warn({ err }, "seed failed (non-fatal)"));
guardedInterval("liquidity-bot", runCycle, 120_000, {
  timeoutMs: 110_000,
  initialDelayMs: 500,   // seed completes in this window
});
```

## Chunk size
orders table has 27 columns. PG max params = 65,535. Safe chunk = floor(65535/27) = 2,427.
Use INSERT_CHUNK = 2,000. For cross-price update (2 params/row): BULK_CHUNK = 10,000.

With pool max=20 and correct chunk sizes, a full cycle (~33k orders) completes in ~4s, well inside the 110s guardedInterval timeout — no more stacking.

## Deployment note
`fetch_deployment_logs` always queries the production deployment. Dev `restart_workflow` does NOT affect production. Pool/bot fixes must be published to take effect in production.
