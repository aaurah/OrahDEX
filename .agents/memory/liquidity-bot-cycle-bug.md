---
name: LiquidityBot concurrent cycle bug + query timeout
description: Two layered bugs: unguarded first runCycle() causes concurrent stacking; bulk DELETE of 48k rows exceeds query_timeout and cascades.
---

## Bug 1 — Concurrent cycle stacking (pool exhaustion)
`startLiquidityBot()` must never call `runCycle()` directly outside of `guardedInterval`. All cycles — including the first — must flow through `guardedInterval` so its `busy` lock prevents concurrent execution.

**Why:** The old pattern was:
```typescript
seedMarketsIfNeeded().then(() => runCycle())          // no busy flag set
guardedInterval("liquidity-bot", runCycle, 120_000)   // busy flag only covers its own calls
```
When a cycle ran long (many small DB chunks × pool-wait time), `guardedInterval` fired a second cycle at T+120s seeing `busy=false` (the first run never set it). Cycles stacked → pool exhaustion → `timeout exceeded when trying to connect` cascade.

**Fix:** Use `initialDelayMs` so `guardedInterval` owns the first run:
```typescript
seedMarketsIfNeeded()
  .catch(err => logger.warn({ err }, "seed failed (non-fatal)"));
guardedInterval("liquidity-bot", runCycle, 120_000, {
  timeoutMs: 110_000,
  initialDelayMs: 500,
});
```

## Bug 2 — Bulk DELETE query timeout cascade
The bot places ~48,036 orders per cycle (4003 markets × 12 orders). The single `DELETE FROM orders WHERE wallet_address='BOT_LIQUIDITY_ENGINE' AND status='open'` deletes all 48k rows in one shot. On the production DB (large table + 4 indexes to maintain + WAL) this exceeds the `query_timeout`, triggering a rollback that stresses the DB and causes `Connection terminated unexpectedly` across every other service.

**Fix 1:** `query_timeout: 8_000 → 30_000` in `lib/db/src/index.ts`.  
**Fix 2:** Chunked DELETE in `liquidityBot.ts` (replaces single drizzle delete):
```typescript
const DELETE_CHUNK = 5_000;
let deletedCount: number;
do {
  const result = await pool.query(
    `DELETE FROM orders WHERE id IN (
       SELECT id FROM orders WHERE wallet_address=$1 AND status=$2 LIMIT $3
     )`,
    [BOT_ADDRESS, "open", DELETE_CHUNK],
  );
  deletedCount = result.rowCount ?? 0;
} while (deletedCount >= DELETE_CHUNK);
```
Each chunk completes in < 500ms; no single large transaction to roll back.

## Chunk sizes
- orders table: 27 columns. PG max params 65,535. Safe INSERT_CHUNK = 2,000.
- Cross-price update: 2 params/row. BULK_CHUNK = 10,000.
- Full cycle with pool max=20: completes in ~4s, well inside 110s timeout.

## Deployment note
`fetch_deployment_logs` always queries production. Dev `restart_workflow` does NOT affect production. All fixes must be published.
