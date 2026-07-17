---
name: Coin info pipeline
description: Architecture and failure modes for /coins/:symbol/full — CoinGecko rate limits, lazy priceCache, and AI enrichment guards.
---

## Architecture

`/coins/:symbol/full` and `/coins/:symbol/detail` share `fullCache` (30 min TTL).

**Data sources (in priority order):**
1. `fullCache` hit → return immediately; if `_partial:true` fire `enhanceCgWithAI` in background
2. `fetchCgFullData(symbol, cgId)` — CG `/coins/{id}` (rate-limited during burst testing; 429 common)
3. `internalPriceFallback(symbol)` — price from `priceCache`/`fetchKeyPrices()`/`FALLBACK_PRICES` + market cap from `cgMarketCapCache`
4. Both fallbacks store `_partial: true` so `enhanceCgWithAI` re-enriches asynchronously

**`enhanceCgWithAI`:**
- Fires for ALL coins regardless of `_source` (internal or coingecko)
- Tries `fetchCgFullData` for description/links (non-fatal if 429)
- Calls Anthropic claude-haiku-4-5 for: summary, useCase, strengths, risks, sentiment, outlook, traderNote
- Sets `_partial: false` + stores `aiAnalysis` in fullCache + cgCoinCache

**Prefetch (`prefetchCgMarkets`):**
- Fires at **T+3s** after server starts (before priceUpdater's CG call at T+40-100s)
- Calls CG `/coins/markets?per_page=250` — ONE request seeds 250 coins with full data
- Auto-retries on 429: 90s → 3min → 6min → 10min (exponential backoff, max 10min)
- Seeded coins get `_source:"coingecko"`, `_partial:true` until AI runs

## Known failure modes and fixes

### 1. `priceCache` null on cold start → `not_found`
**Cause:** `priceCache` in dex.ts is lazy — only populated when a browser calls `/api/dex/prices`. In API-only tests (no browser), always null.  
**Fix:** `internalPriceFallback` calls `fetchKeyPrices()` to warm `priceCache` on first use. FALLBACK_PRICES as final backstop for major coins.

### 2. AI blocked for internal-source coins
**Cause:** Old guard `if (_source === "internal") return` in `enhanceCgWithAI` — blocked AI when CG rate-limited.  
**Fix:** Guard removed. AI fires regardless of source with whatever data is available.

### 3. Fallback paths not firing AI
**Cause:** `if (fallback._source === "coingecko") enhanceCgWithAI(symbol)` — only CG-source coins got AI.  
**Fix:** Always call `enhanceCgWithAI(symbol)` and always store fallback with `_partial: true`.

### 4. CG rate limit exhausted before prefetch (T+20s old delay)
**Cause:** priceUpdater's CG simple/price call fired at T+40-100s, consuming quota; prefetch at T+20s would get 429 if priceUpdater ran first.  
**Fix:** Prefetch now fires at T+3s — always wins the rate limit race. priceUpdater's CG call is a fallback anyway.

### 5. Market cap missing from priceUpdater's CG call
**Cause:** `fetchCoinGeckoPrices` in priceUpdater hard-coded `usd_market_cap: 0`.  
**Fix:** Added `include_market_cap=true` to URL; results stored in exported `cgMarketCapCache` Map. `internalPriceFallback` uses `cgMarketCapCache.get(symbol)` for market cap.

## CoinGecko rate limit behavior
- Free tier (no key) from Replit server IPs: ~10-30 req/min, resets per minute
- `/coins/markets` (bulk) and `/coins/{id}` (individual) have separate quotas
- Rapid testing/restarts exhaust the budget quickly; normal production use is fine
- `/search` endpoint appears to have a looser rate limit (usually 200 when others are 429)
- CoinPaprika: completely dead as of mid-2026 (returns 402 on all endpoints, no free tier)
- CoinCap (coincap.io): blocked from Replit IPs (exit code 6, HTTP 000)

## COINGECKO_IDS coverage (~150 symbols)
Major coins covered: BTC, ETH, SOL, BNB, ADA, AVAX, NEAR, SUI, DOT, LINK, UNI, ATOM, PEPE, SHIB, FLOKI, ARB, OP, INJ, BONK, WIF, TAO, and many more.  
Not covered (need CG_ID_OVERRIDES or search): DOGS, RON, A8, and other small/gaming tokens.

**Why:** `COINGECKO_IDS` drives `fetchCoinGeckoPrices` (simple/price batch). `CG_ID_OVERRIDES` (~90 coins hardcoded in dex.ts) covers gaming/small tokens like DOGS="dogs-2", RON="ronin", A8="ancient8".
