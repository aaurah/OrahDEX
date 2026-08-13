---
name: Estimate endpoint OOM fix
description: Root cause and fix for the API server OOM crash from /letsexchange/estimate accumulating unbounded HTTP connections
---

## Rule
`/letsexchange/estimate` MUST have a result cache. Without it, each call
fires 5 parallel outbound HTTP requests; multiple users polling every 45s
causes heap to grow to OOM (observed: 316/336 MB used after 1.25 hours).

## Fix applied
In `artifacts/api-server/src/routes/letsexchange.ts`:
- `estimateCache` Map with 60s TTL keyed on `${from}:${to}:${amtBucket}:${forceVenue}`
- Amount bucketed to 2 significant figures to improve cache hit rate
- `force_venue` requests bypass cache (explicit comparison, infrequent)
- Lazy expiry sweep via `setInterval` every 5 min with `.unref()`

## Why
The estimate endpoint is the single most expensive endpoint (5 parallel
external HTTP calls). usePairPrices + useLetsExchangeRate both poll it every
45s per active session. N users × M pairs = N×M concurrent connection sets.
Caching collapses this to 1 real call per pair per 60s regardless of user count.

## Heap watchdog calibration (app.ts)
- HEAP_GC_PCT 0.75, HEAP_WARN_MB 280, HEAP_ALERT_MB 420
- Server legitimately uses ~200 MB idle; old 260 MB alert was always firing
- Container RSS limit appears to be ~700 MB

## How to apply
Any future endpoint that queries external APIs on a polling schedule needs
the same caching pattern. Check that new external-call routes are not
invoked by frontend hooks at sub-minute intervals without a server-side cache.
