---
name: Full chart history pipeline
description: How OrahDEX loads A-to-Z OHLCV candle history for "All/5Y/10Y" chart intervals.
---

## Source priority for fetchFullHistoryCandles()

1. **Bitfinex** (`api-pub.bitfinex.com/v2/candles/trade:1D:t{PAIR}/hist?limit=10000&sort=1`)
   - Free, no API key required
   - Returns up to 10,000 daily candles sorted oldest-first (`sort=1`)
   - Format: `[MTS_ms, OPEN, CLOSE, HIGH, LOW, VOLUME]` (note: OPEN then CLOSE — not typical)
   - Coverage: BTC from 2013-03-31, ETH from 2016-03-09, XRP from 2017-05-19
   - ~50 major coins in BITFINEX_SYM map in candleFetcher.ts

2. **OKX extended pagination** — `fetchOkxCandles(base, "1d", 1500)` — up to ~4 years for unlisted coins

3. **Gate.io** — daily candles, up to 1000, for coins not on Bitfinex/OKX

4. **Synthetic fallback** — random walk anchored to lastPrice

## Why NOT CoinGecko or CryptoCompare
- CoinGecko `/coins/{id}/ohlc?days=max` → **HTTP 429** (Replit IP is rate-limited)
- CryptoCompare `/data/v2/histoday` → **HTTP 401** (acquired by CoinDesk; now requires API key)

## Cache
- 6-hour server-side in-memory cache (`historyCache` Map in candleFetcher.ts)
- Key: `history:${symbol}`

## Route
- `GET /api/markets/:symbol/history` — **3-level path** only
- **Why:** 4-level routes (`/markets/:symbol/candles/history`) return 404 in this Express setup.
  The exact cause is unclear (likely routing middleware or path-param depth issue), but 3-level
  routes always work. Keep history endpoint at 3 levels.

## Frontend
- `HISTORY_INTERVALS = new Set(['5Y', '10Y', 'All'])` — module-scope constant in Chart.tsx
- `fetchCandles` useCallback: when interval is in HISTORY_INTERVALS, calls `/api/markets/${symbol}/history`
  instead of the standard `/candles?interval=...` endpoint
