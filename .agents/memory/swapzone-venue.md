---
name: Swapzone venue integration
description: How Swapzone is wired into OrahDEX as the 6th swap venue (OrahPro)
---

## What Swapzone is
Meta-aggregator over 15+ exchanges (GoDex, Exolix, SideShift, CoiNCraddle, NExchange, AlfaCash, EasyBit, StealthEx, SimpleSwap, LetsExchange, ChangeNOW, Changelly, etc.). Single API key unlocks all of them.

- Base URL: `https://api.swapzone.io/v1`
- Auth: `x-api-key` header
- Partner sign-up: https://swapzone.io/partners/sign-up

## Key API quirk
`/exchange/create-transaction` requires a `rateId` from a prior `/exchange/get-rate` call. The rateId expires quickly (~60 s). Because `createVenueExchange()` in `leAutoRoute.ts` doesn't carry the rateId from the earlier quote, the swapzone case re-fetches a fresh quote immediately before creating the transaction (one extra round-trip, but ensures validity).

**Why:** Swapzone's rateId is a reservation token that locks the rate across their partner exchanges. Unlike ChangeNOW/StealthEx which accept floating-rate creates without a prior rateId, Swapzone always requires one.

**How to apply:** If refactoring `createVenueExchange()` to accept a rateId param, pass it through from `best.raw.rateId` and skip the re-fetch.

## File locations
- `artifacts/api-server/src/lib/swapzone.ts` — full API client
- `artifacts/api-server/src/lib/metaRouter.ts` — ExternalVenue union, VENUE_FEE_RATIOS (0.45%), quoteSwapzone(), getBestExternalQuote() parallel call
- `artifacts/api-server/src/lib/leAutoRoute.ts` — swapzone case in createVenueExchange()
- `artifacts/api-server/src/routes/admin.ts` — swapzone_api_key in INTEGRATION_KEYS, invalidateSzKeyCache() on PUT
- `artifacts/bsv-dex/src/lib/venues.ts` — swapzone → "OrahPro", text-yellow-400
- `artifacts/bsv-dex/src/pages/admin/Integrations.tsx` — UI section with masked key field

## API key resolution
Same pattern as ChangeNOW: env var `SWAPZONE_API_KEY` → platform_settings DB key `swapzone_api_key` → 60 s in-memory cache. Admin UI at `/admin/integrations` saves to DB; `invalidateSzKeyCache()` clears the cache immediately on save.
