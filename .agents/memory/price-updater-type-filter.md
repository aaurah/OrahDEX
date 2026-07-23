---
name: price-updater bulk UPDATE type filter
description: Missing type filter on the markets bulk UPDATE caused a 2M-row sequential scan, making production ticks take 97s+ and consistently timeout.
---

## Rule
The `updateMarketPrices()` bulk UPDATE **must** include `AND m.type IN ('spot', 'futures')` in the WHERE clause.

```sql
WHERE m.symbol = v.sym
  AND m.type IN ('spot', 'futures')
```

**Why:** The markets table has ~2M rows (1.99M letsexchange + 55K simpleswap + 4K spot/futures). Without the type filter, Postgres does a sequential scan of all 2M rows on every 60s tick. The SELECT that builds `pendingUpdates` already filters to spot/futures only — the UPDATE must match. Production avg tick was 97.2s, consistently exceeding any reasonable timeout. With the filter, the query hits only ~4K rows via the `idx_markets_type` index and completes in <1s.

**How to apply:** Whenever writing any bulk UPDATE against the markets table, always include a type filter that matches the rows actually being updated. Never update "all rows matching symbol" globally.

## Companion fix
`app.ts` also adds `CREATE INDEX IF NOT EXISTS idx_markets_symbol ON markets (symbol)` for future query optimization. The type filter is the primary fix; the symbol index is secondary.
