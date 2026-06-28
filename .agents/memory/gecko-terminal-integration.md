---
name: GeckoTerminal live integration
description: How live GeckoTerminal pool data is fetched and merged into OrahDEX market lists.
---

## Architecture

- **lib**: `src/lib/gecko-terminal.ts` — raw fetch helpers (`fetchGeckoPools`, `fetchGeckoCategory`) + network/category maps.
- **hook**: `src/hooks/useGeckoTerminalPools.ts` — React Query wrapper, staleTime=90s, gcTime=5min, retry=1.
- **integration point**: `MobileMarketSelector.tsx` — hook called at component level; geckoRows merged into `rows` after `getRows()` returns.

## Network/category mappings

`CAT_GECKO_NETWORK` maps OrahDEX chain cat (e.g. `base`, `eth`, `arb`) → GeckoTerminal network slug.
`CAT_GECKO_CATEGORY` maps special tabs (e.g. `zora`) → category slug (`zora-content`).
Hook is disabled (enabled=false) for tabs with no mapping (All, Favorites, Meme, AI, etc.).

## Merge logic

1. `geckoByBase` map built from geckoRows (first occurrence per base ticker wins — highest volume).
2. Existing rows: price/chg updated if gecko price > 0.
3. New tokens: geckoRows not already in existingBases are appended as swapOnly NormRows.

## Rate limits

Free public API: ~30 req/min. Cached 90s per cat. Fetch on-demand (only selected tab), 3 pages max = 75 pools. No auth header needed.

**Why:** Static mock-data goes stale; GeckoTerminal gives real-time prices/chg for on-chain DEX pairs without requiring an API key.
**How to apply:** To add a new chain tab with live data, add its slug to `CAT_GECKO_NETWORK` in gecko-terminal.ts. To add a category tab, add to `CAT_GECKO_CATEGORY`.

## Zora Coins API (supplemental, zora tab only)

- **lib**: `src/lib/zora-coins-api.ts` — calls `https://api-sdk.zora.engineering/explore?listType=X` for 4 list types in parallel (TOP_VOLUME_24H, MOST_VALUABLE, TOP_GAINERS, NEW), dedupes by contract address, sorts by vol.
- **hook**: `src/hooks/useZoraCoins.ts` — enabled only when `cat === "zora"`, staleTime 60s.
- **ticker logic**: strip non-alphanumeric, uppercase, slice 12; fall back to `poolCurrencyToken.name` (creator handle) if cleaned symbol too short.
- Zora API responses: `exploreList.edges[].node` — fields: `symbol`, `tokenPrice.priceInUsdc`, `volume24h`, `marketCap`, `marketCapDelta24h` (% chg), `address`, `coinType`, `poolCurrencyToken.name`.
- No API key required for moderate use; key recommended for production (get from developer.zora.co).
