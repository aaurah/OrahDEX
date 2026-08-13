---
name: Logo storm coin picker failure
description: Rapid coin logo requests exhausted the global rate limiter, causing LetsExchange currency fetch to 429 and show "Cross-chain swap unavailable".
---

## The rule
The global rate limiter (200 req/min per IP) must NEVER apply to cached read-only data endpoints. Logo requests can burst to 50-100/s when a coin list first renders, consuming the entire per-IP budget within seconds and causing any subsequent API call — including `/api/letsexchange/currencies` — to return 429.

**Why:** `fetchCoins()` in `LetsExchangePanel.tsx` treats any non-ok response as a terminal error (`coinsErr = true`) and shows "Cross-chain swap unavailable" with no automatic retry. One 429 = permanently broken panel until page reload.

## How to apply
Three-part fix (all in place):

1. **Dedicated `logoLimiter`** (`app.ts`): 600 req/min for `/api/tokens/logo` path — applied *before* globalLimiter, so logo requests never count against the global budget.

2. **GlobalLimiter skip list** (`app.ts`): added `/api/letsexchange/currencies`, `/api/letsexchange/pairs`, `/api/letsexchange/usd-prices`, and `/api/tokens/logo*` — all serve from in-memory cache and should never be user-rate-limited.

3. **Retry logic in `LetsExchangePanel.tsx`**: `load()` retries up to 4× with 3s backoff on error; also does a 5s follow-up retry when the server returns the cold-start fallback (< 400 coins), matching the pattern already in `useLetsExchangeCoins.ts`.

## Invariant
Any endpoint serving from an in-memory cache (O(1) response time) should be in the globalLimiter skip list. Logo endpoints need their own separate limiter — not shared with data endpoints.
