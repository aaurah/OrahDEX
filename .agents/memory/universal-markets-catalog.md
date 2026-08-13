---
name: Universal markets catalog design
description: Key decisions and constraints when adding the 1.24M pair catalog; symbol uniqueness conflict with letsexchange rows; search endpoint architecture.
---

## The symbol uniqueness conflict

The `markets` table has a UNIQUE constraint on `symbol` (format: `BASE/QUOTE`).
The LE all-to-all sync already populated **1,995,341** rows as `type='letsexchange'` with the same BASE/QUOTE format.

A `type='catalog'` INSERT for BTC/ETH conflicts with the existing `letsexchange` BTC/ETH row → ON CONFLICT DO NOTHING → 0 new rows for most pairs.

**Why:** The catalog's top 1,114 assets are dominated by LE coins (priority: internal → LE → SS). Virtually all 1,114×1,113 pairs already exist as letsexchange.

**How to apply:** universalMarkets.ts runs fine (idempotent via ON CONFLICT DO NOTHING); it DOES add catalog-type rows for SS-unique coins not present in LE. The real value is the search endpoint, not the catalog generation.

## The search endpoint architecture

`GET /api/markets/search?q=TICKER&limit=N` searches ALL types including letsexchange.
This is correct — the endpoint returns a paginated slice (max 500) so no OOM risk.

Priority ordering in ORDER BY:
1. Exact base match first (base_asset = query)
2. Exact quote match second
3. Prefix ILIKE match last
4. Within tier: spot/futures → simpleswap → letsexchange → catalog

Indexes added in app.ts (pool.query at startup):
- `idx_markets_base_asset ON markets(base_asset)` — supports exact + prefix ILIKE
- `idx_markets_quote_asset ON markets(quote_asset)` — same
- `idx_markets_type ON markets(type)` — supports type-based filtering

## Main /markets OOM guard

The main `GET /markets` endpoint MUST exclude BOTH:
- `type='letsexchange'` (1.99M rows)
- `type='catalog'` (1.24M rows once generated)

Both are served via their dedicated endpoints instead:
- LE pairs → `/api/letsexchange/pairs`
- Catalog + all types → `/api/markets/search`

Variable is named `bigExclude = and(ne(type,'letsexchange'), ne(type,'catalog'))`.

## Frontend search hook

`useMarketSearch(query, { debounceMs: 300, limit: 100 })` in `useStagedMarkets.ts`.

Called from both `Markets.tsx` (desktop) and `MobileMarketSelector.tsx` (mobile).
Results are merged with local in-memory filtered results (deduped by symbol).
Server results (letsexchange/catalog) appear after local spot/futures matches.

## guardedInterval parameters for universal-markets

```
interval: 24h
timeout: 30min
initialDelay: 20min (after LE + SS syncs run first)
```

Expected runtime: 2–5 min (mostly ON CONFLICT DO NOTHING since LE rows dominate).
