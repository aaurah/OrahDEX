---
name: LE markets full-table scan pattern
description: With 2M rows in markets, any ne(type,'letsexchange') scan causes DB pool exhaustion. ALL background services MUST use inArray(type,["spot","futures"]).
---

## The rule (updated — 2M row table)
Every `SELECT FROM markets` in a background service MUST use `inArray(type, ["spot","futures"])` — never a negative filter like `ne(type, 'letsexchange')` or `NOT IN`.

**Why:** The LE all-to-all sync populated ~1,995,341 rows as type='letsexchange'. Additionally simpleswap has 55,066 rows. A `ne(type,'letsexchange')` scan now returns ~59K rows per tick. With 12+ background services each firing every 60–120 s, the 40-connection pool saturates: connections stay busy for the full query duration, new services time out waiting for a slot, and the entire server appears to hang. This manifested as cascading "Query read timeout" / "Connection terminated unexpectedly" crashes in production.

**How to apply:**
- Background services needing prices for internal order-book pairs: `inArray(type, ["spot","futures"])`
- Services needing specific symbols: `inArray(symbol, list)` or `WHERE symbol = $1`
- HTTP endpoints that paginate: always add a type filter + LIMIT

## Confirmed fixed services (as of 2026-07-14)
- `liquidityBot` — `inArray(type, ["spot","futures"])` ✅
- `arbBot/runArbCycle` — was `ne(type,'letsexchange')`, now `inArray(type,["spot","futures"])` ✅
- `futuresProfitEngine/runLiquidationCycle` — was `ne(type,'letsexchange')`, now `inArray(type,["spot","futures"])` ✅
- `stopOrderEngine` — was `ne(type,'letsexchange')`, now `inArray(type,["spot","futures"])` ✅
- `fundingRateEngine` — `inArray(symbol, PERP_SYMBOLS)` (point lookup) ✅

## Already correct (no change needed)
- `routeCache.ts` — `inArray(symbol, HOT_PAIRS)`
- `hybridRouter.getOraclePrice` — `WHERE symbol = $1 OR symbol = $2 LIMIT 1`
- Point lookups (`WHERE symbol = $1`) — fine regardless

## universalMarkets catalog generation guard
`generateUniversalMarkets()` does 1,232 batch INSERTs (ON CONFLICT DO NOTHING).
Added guards:
1. Skip entirely if `SELECT COUNT(*) FROM markets WHERE type='catalog'` > 10,000 (LE already covers the universe)
2. 80ms yield between INSERT chunks, 200ms yield between outer batches

## Main /markets OOM guard
`bigExclude = and(ne(type,'letsexchange'), ne(type,'catalog'))` — still correct.
This is for the pagination endpoint that would OOM loading 2M rows. The *search* endpoint (`/markets/search`) is safe because it uses LIMIT.
