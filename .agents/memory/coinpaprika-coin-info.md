---
name: CoinPaprika coin-info integration
description: CoinPaprika replaced CoinGecko as the coin-info data source in dex.ts; includes quirky IDs and architecture pattern.
---

## Why
CoinGecko free tier consistently blocks Replit shared server IPs with 429s — even single-coin batch calls fail. CoinPaprika's public API (no key, 2 req/s) is reliably accessible from server IPs.

## Architecture
- **Tier 1 (prefetch)**: `prefetchCoinMarkets()` calls `https://api.coinpaprika.com/v1/tickers?limit=500` once at T+20s (app.ts) → seeds `fullCache` for 500 coins + populates `cpSymbolMap` (symbol→cpId runtime map).
- **Tier 2 (enrichment)**: `enhanceWithDetail(symbol, cpId)` calls `/v1/coins/{cpId}` in background on first open → adds description, links, categories, AI analysis. Non-blocking.
- **Cache**: `fullCache` shared between `/coins/:symbol/full` and `/coins/:symbol/detail` (detail endpoint reuses fullCache).
- **Logo URLs**: predictable — `https://static.coinpaprika.com/coin/{cpId}/logo.png`. No extra API call needed.

## ID Resolution Priority
1. `CP_ID_OVERRIDES[symbol]` — hardcoded map in dex.ts
2. `cpSymbolMap.get(symbol)` — runtime map from prefetch
3. CoinPaprika search API `/v1/search?q={symbol}&c=currencies&limit=5`

## Quirky CoinPaprika IDs (verified)
- AAVE: `aave-new` (NOT `aave-aave` — "new" because it was rebranded from ETHLend/LEND)
- COMP: `comp-compoundd` (double 'd' — NOT `comp-compound`)
- All others in CP_ID_OVERRIDES were verified against live tickers endpoint.

## CoinPaprika vs CoinGecko field mapping
| Our field | CoinPaprika tickers | CoinGecko markets |
|-----------|-------------------|------------------|
| priceUsd | quotes.USD.price | current_price |
| priceChange24h | quotes.USD.percent_change_24h | price_change_percentage_24h |
| marketCap | quotes.USD.market_cap | market_cap |
| totalVolume | quotes.USD.volume_24h | total_volume |
| ath | quotes.USD.ath_price | ath |
| athChangePercent | quotes.USD.percent_from_price_ath | ath_change_percentage |
| atl | NOT AVAILABLE (null) | atl |
| priceChange1y | quotes.USD.percent_change_1y | price_change_percentage_1y_in_currency |

## CoinPaprika coin detail (/v1/coins/{id})
- description: plain text (not HTML unlike CoinGecko) — still run through stripHtml() for safety
- tags: array of `{id, name}` objects → use `.name` for categories
- links.website[]: array of URLs
- links_extended: array of `{url, type}` — type values: "twitter", "reddit", "source_code", "telegram", "whitepaper", "medium"
- links.source_code[]: GitHub URLs (also in links_extended as "source_code")
- `started_at`: equivalent of genesis_date
- `hash_algorithm`: hashing algorithm

**Why:** logger import was also missing in dex.ts (imported as `import { logger } from "../lib/logger.js"`), causing the old prefetch to crash silently in catch blocks.
