---
name: OrahDEX audit key patterns
description: Durable rules that emerged from the 2026-07-17 full trading subsystem audit; apply whenever touching resolveRate, futures settlement, or oracle price logic.
---

## Rule 1 — resolveRate always needs LE type filter + freshness sort
Any `db.select().from(marketsTable)` that resolves a mid-market price MUST include:
```ts
ne(marketsTable.type, "letsexchange")
// AND
.orderBy(desc(marketsTable.updatedAt))
```
**Why:** 1.99M LE rows (84% with price=0) will satisfy a symbol match before live spot rows; without the filter you get 0-price trades or zero-rate divisions.
**How to apply:** Check every `resolveRate`, `toUsd`, `/v1/quote` price lookup in swap.ts, trade.ts, v1.ts, and any new route that touches marketsTable.

## Rule 2 — Mark price must never use Math.random()
Adding artificial noise to a mark price is an oracle manipulation surface. A bot making small spot trades can shift `lastPrice` and steer the random walk to trigger liquidations.
**Why:** Found in fundingRateEngine.ts — `markPrice = lastPrice * (1 + (Math.random()-0.5)*0.05)` made funding rates and liquidation thresholds gameable.
**How to apply:** Use external oracle (Pyth/Chainlink) for mark price. Until integrated, use `lastPrice` as both mark and index — less accurate but not manipulable.

## Rule 3 — Client-supplied prices are never used for settlement
Any endpoint that closes a position, fills an order, or converts an amount must use server-authoritative oracle prices, not values from `req.body`.
**Why:** Found in futures.ts `/close` — `body.markPrice` was used directly, allowing users to report a favorable price and extract margin funds.
**How to apply:** Always source prices from the DB (`marketsTable.lastPrice`) or an oracle; discard any price from the request body for settlement purposes.

## Rule 4 — Trailing stop / advanced order triggers must be atomic
INSERT new order + UPDATE trigger status must be a single `BEGIN/COMMIT`. A crash between them either orphans the order or re-triggers infinitely.
**Why:** Found in advancedOrderEngine.ts — both sell and buy trigger paths had non-atomic pairs.
**How to apply:** Wrap any "create artifact + update source status" pair in a transaction on the same `pg.PoolClient`.

## Rule 5 — 429 must not count as circuit breaker failure
HTTP 429 = rate limited, not unhealthy. Counting it as a CB failure cascades into blocking healthy APIs during traffic bursts.
**Why:** Found in exchangeApiRepairEngine.ts — `cb.recordFailure("429")` was called on rate limit responses.
**How to apply:** In any `fetch` wrapper: handle 429 separately (RateLimitGuard), do NOT call `cb.recordFailure`.

## Rule 6 — Funding receivers must get paid (bilateral model)
When `payment <= 0` (user is a receiver), credit their margin. Platform keeps its cut (10%) from the receiver's due, not 100%.
**Why:** futuresProfitEngine.ts previously skipped all receiver payments — "house always wins" that breaks perp fairness.
**How to apply:** `credit = Math.abs(payment) * (1 - PLATFORM_CUT)` → atomic update to both `futures_margin_accounts.locked` and `futures_positions.margin`.
