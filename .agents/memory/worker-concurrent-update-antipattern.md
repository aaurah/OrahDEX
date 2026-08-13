---
name: Worker concurrent-update anti-pattern
description: Calling updateMarketPrices() from a repair worker while the price-updater interval runs concurrently saturates the DB pool and kills both services.
---

## Rule
Never call `updateMarketPrices()` (or any heavy bulk-write function) from a repair/reconciler worker when that same function already runs on its own `guardedInterval`.

**Why:** The repair worker fires at T=0. The guardedInterval fires at T=60s. If the repair triggers `updateMarketPrices()` at T=5m (stale-market-repair interval), it runs concurrently with the 60s cycle. Both hold DB connections simultaneously → pool exhaustion → both tick-timeouts → both services marked DEAD/DEGRADED in a doom loop.

**How to apply:** Repair workers should only **detect and alert** stale conditions. They must defer the fix to the owning interval. Replace `await updateMarketPrices()` with a log + alertWarning call.

## Related timeouts rule
`guardedInterval` `timeoutMs` must include headroom for the slowest realistic DB path, not just the happy path:

- `bsv-mempool-watcher`: WoC API (header sync + address history + merkle proof) regularly takes > 12 s in production. Use `timeoutMs: 30_000` not `POLL_INTERVAL_MS - 3_000`.
- `price-updater`: bulk UPDATE with `withRetry({maxAttempts:2})` on a loaded DB can burn 60 s in retries alone. Use `maxAttempts:1` (fail fast, retry next cycle) and set `timeoutMs:120_000`.
