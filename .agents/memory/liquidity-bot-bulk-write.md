---
name: LiquidityBot bulk write pattern
description: Why sequential chunked INSERTs saturate the production DB and how UNNEST fixes it
---

## The rule
Never use a sequential `for` loop of drizzle `db.insert()` calls to bulk-insert thousands of rows into the orders table.  Use a single `pool.query()` with UNNEST arrays instead.

**Why:**
The liquidity bot generates ~48k orders per cycle (4003 markets × 12 orders).  With `INSERT_CHUNK=2000`, that's 25 sequential INSERT calls.  On the production Replit PostgreSQL under load, each 2000-row INSERT with 4 index updates takes 3-5 s.  Total: 75-125 s of continuous DB write pressure.  During that window the DB server is so saturated that ALL 20 pool connections slow simultaneously — even unrelated simple SELECTs (arbBot, fundingRateEngine, health check) take > 15-30 s.  The pool fills up, new waiters hit `connectionTimeoutMillis` (15 s) and throw `"Connection terminated due to connection timeout: Connection terminated unexpectedly"`.

**How to apply:**
Use a single UNNEST bulk INSERT:
```sql
INSERT INTO orders (id, symbol, wallet_address, network_type, side, type, status,
                    price, stop_price, quantity, filled_quantity, remaining_quantity,
                    total, fee, fee_asset, time_in_force, is_bot, is_synthetic)
SELECT t.id, t.symbol, $8, 'bsv', t.side, 'limit', 'open',
       t.price, NULL, t.qty, 0, t.qty, t.total, 0, t.fee_asset, 'GTC', TRUE, FALSE
FROM unnest($1::text[], $2::text[], $3::text[],
            $4::numeric[], $5::numeric[], $6::numeric[], $7::text[])
     AS t(id, symbol, side, price, qty, total, fee_asset)
ON CONFLICT (id) DO NOTHING
```
Parameters: `[ids, symbols, sides, prices, qtys, totals, feeAssets, BOT_ADDRESS]`

Result: 1 round-trip instead of 25.  DB write time drops from ~100 s to ~3-5 s.  Pool stays free throughout.

## Error signatures that indicate this problem
- `Connection terminated due to connection timeout: Connection terminated unexpectedly` from pg-pool
- Multiple unrelated services (arbBot, evmHtlc, advancedOrderEngine, AlertBus) all failing simultaneously in the same ~30-60 s window
- Failures cluster at the same cadence as the liquidity bot cycle (every 120 s)
- `Query read timeout` on trivially simple SELECTs (`SELECT ... FROM markets WHERE status=$1`)

## Error signatures that are NOT this problem
- `Query read timeout` only on the DELETE query → that was the chunked DELETE fix (separate issue)
- `Connection terminated unexpectedly` on isolated connections with no burst pattern → stale idle connections (fix: `keepAlive: true`, already set)
