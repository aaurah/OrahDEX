---
name: GitHub token list integration
description: Trust Wallet + Uniswap token lists for logos, EVM addresses, decimals, and market auto-discovery in OrahDEX
---

## Architecture

- `services/githubTokenSeeder.ts` — fetches Trust Wallet tokenlist.json for 7 EVM chains (ethereum, smartchain, polygon, avalanchec, arbitrum, optimism, base) + Uniswap default list; runs 30s after boot then every 24h via setInterval
- `routes/tokens.ts` — GET /api/tokens/logo/:symbol (302, 24h Cache-Control), /metadata/:symbol, /tokens (paginated list)
- `github_tokens` table — PRIMARY KEY (chain_id, address); index on symbol; UPSERT via UNNEST bulk insert
- `CoinLogo.tsx` — /api/tokens/logo/${symbol} is now source[0] before CoinCap/JSDelivr/LiveCoinWatch

## Native coin logos (no DB needed)

`NATIVE_LOGOS` map in `githubTokenSeeder.ts` maps symbol → Trust Wallet chain slug.
Logo URL pattern: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/{chain}/info/logo.png`
`getCachedLogoUrl()` checks native map first, then DB cache.

## EVM token logos

Trust Wallet tokenlist.json provides `logoURI` as `https://assets-cdn.trustwallet.com/blockchains/{chain}/assets/{checksumAddress}/logo.png`.
Stored in `logo_url` column and served via 302 redirect with 24h browser cache.

## Auto-discovery

New symbols not in `markets` table (any type) → INSERT as `(symbol, 'USDT', 'symbol/USDT', 'catalog', 0, 'active')` with ON CONFLICT DO NOTHING. Capped at 300/run.

**Why:** Catalog pairs appear in search but not the main /markets list (which filters out 'catalog' + 'letsexchange'). Safe to auto-add unvetted tokens.

## Port 8080 watchdog issue

Restarting the API server workflow while a stale node process holds port 8080 causes the watchdog to loop. Fix: `lsof -i :8080 -sTCP:LISTEN | awk 'NR>1 {print $2}' | xargs -r kill -9` — but do NOT kill prematurely or you'll kill the newly-started server and trigger another loop cycle. Kill, wait, let watchdog's timed retry pick up the free port.
