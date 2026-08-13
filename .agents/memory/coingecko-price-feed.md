---
name: CoinGecko price feed
description: How OrahDEX fetches live prices when Binance is blocked — CoinGecko free tier, COINGECKO_IDS map, and common ID gotchas.
---

## Rule
Binance API is always blocked in Replit cloud environments. CoinGecko free tier (`api.coingecko.com/api/v3/simple/price`) is the primary live price source for 150+ coins.

## Architecture
- `fetchCoinGeckoPrices()` in `priceUpdater.ts` — batches all COINGECKO_IDS in one request, 55 s internal cache, exported so both `fetchKeyPrices()` (dex.ts) and `fetchSovereignPrices()` (priceUpdater.ts) share the same cached response.
- `fetchKeyPrices()` in `dex.ts` — step 1b: CoinGecko when Binance batch returns <6 results; step 5: `simulateDailyChange()` final pass for any non-stablecoin still at 0.
- `fetchSovereignPrices()` in `priceUpdater.ts` — step 1c: same CoinGecko call after LE key prices.
- Only stablecoins (USDT/DAI/BUSD/USDC/TUSD/USDD) legitimately stay at change24h=0.

## Known bad CoinGecko IDs (as of Jun 2026)
- `matic-network` → deprecated/returns `{}`; use `polygon-ecosystem-token` (POL rebrand)
- `dogs` → renamed; use `dogs-2`

## Why
- BSV's WhatsOnChain call runs after CoinGecko and overwrites `results["BSV"]`; preserve `change24h` with `results["BSV"]?.change24h ?? 0` pattern.
- FALLBACK_PRICES are last resort only; they drift fast — refresh whenever major market moves occur (BTC price sets the baseline for WBTC/CBBTC; ETH sets RETH/WSTETH/CBETH ≈ 1.07×/1.17×/1.0× ETH).
