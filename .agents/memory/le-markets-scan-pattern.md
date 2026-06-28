---
name: LE markets full-table scan pattern
description: After syncAllLEPairs populates 36K+ markets rows, any unfiltered SELECT FROM markets is a 36K-row scan that causes Query read timeout under DB load.
---

## The rule
Every `SELECT FROM markets` in a background service or hot HTTP endpoint MUST include a type filter. Unfiltered scans cause 30s `Query read timeout` under normal DB load once LE pairs are synced.

**Why:** syncAllLEPairs() upserts ~36K rows (all-to-all LE coin combinations) into `markets`. Background engines that do `db.select().from(marketsTable)` without a WHERE clause load all 36K rows on every tick, saturating the DB server.

**How to apply:**
- Background services that need prices for internal pairs: `WHERE type != 'letsexchange'`
- Services that only need specific symbols (e.g. PERP_SYMBOLS): `WHERE symbol = ANY($1::text[])` or `inArray(marketsTable.symbol, list)`
- HTTP endpoints that filter in JS (e.g. `.filter(m => m.type === 'spot')`): move the filter into SQL

## Fixed services (as of 2026-06-28)
- `fundingRateEngine` — `inArray(symbol, PERP_SYMBOLS)`, 2 cols only
- `futuresProfitEngine/runLiquidationCycle` — `ne(type, 'letsexchange')`, 2 cols only
- `arbBot/runArbCycle` — `and(status='active', ne(type, 'letsexchange'))`
- `dex.ts buildCgCoins()` — `eq(type, 'spot')` in SQL (was JS `.filter()`)
- `stopOrderEngine` — `ne(type, 'letsexchange')`

## Already correct (no change needed)
- `routeCache.ts` — `inArray(symbol, HOT_PAIRS)`
- `exchangeApiRepairEngine` — `WHERE type='spot' AND enabled=TRUE LIMIT 50`
- Point lookups (`WHERE symbol = $1`) — fine regardless

## Related
- syncAllLEPairs tombstone DELETE: after each sync, DELETE WHERE type='letsexchange' AND (base_asset != ALL($1) OR quote_asset != ALL($1)) to remove dropped coins.
- Promise.race dedup: if N concurrent cold-cache requests each create their own setTimeout wrapper, they all fire simultaneously. Store the race itself in a module-level variable and clear it in .finally().
