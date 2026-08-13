---
name: LI.FI DEX aggregator integration
description: How LI.FI is wired into OrahDEX — endpoints, key quirks, API patterns
---

## Integration points
- `artifacts/api-server/src/lib/lifi.ts` — core client (chain registry, token registry, quote/routes/status)
- `artifacts/api-server/src/routes/lifi.ts` — 6 REST endpoints
- `artifacts/api-server/src/routes/externalSwap.ts` — /external-swap/quote now fires LI.FI in parallel, returns `onchainQuote` field

## Endpoints
- `GET /api/lifi/quote?from=ETH&to=USDC&amount=0.1&fromAddress=0x...` — single best route + signed tx
- `GET /api/lifi/routes?from=&to=&amount=&maxRoutes=6` — multiple routes for comparison
- `GET /api/lifi/chains` — all 69 chains (cached 24h)
- `GET /api/lifi/tokens?chain=arb` — tokens per chain (cached 1h)
- `GET /api/lifi/status?txHash=0x...&fromChainId=1` — tx status polling
- `GET /api/lifi/supported?from=WBTC&to=AVAX` — quick pair support check

## Critical API quirks
1. **Zero address rejected**: LI.FI /quote returns 400 "Zero address is provided" for `fromAddress=0x000...0`. Use `safeAddr()` helper that replaces zero/empty with Vitalik's well-known address as placeholder.
2. **Native token address**: LI.FI rejects `0x000...0` for native tokens in `fromToken`/`toToken` params too — must pass the symbol string (e.g. `"ETH"`) instead.
3. **Routes endpoint**: `/v1/routes` GET does NOT work. Use `POST /v1/advanced/routes` with JSON body `{fromChainId, toChainId, fromTokenAddress, toTokenAddress, fromAmount, fromAddress, options:{slippage, order, integrator}}`.
4. **Chain IDs**: Routes API needs numeric chain IDs, not string keys. Use `chainKeyToId()` helper.

## Design: non-custodial parallel venue
LI.FI is non-custodial (user signs tx), so it is returned as `onchainQuote` alongside custodial venues in `/external-swap/quote`. It does NOT go through the custodial execute/deposit-address flow.

**Why:** LI.FI returns a `transactionRequest` that the user's wallet signs directly. No deposit address, no waiting — instant DeFi settlement. The integrator param is `"orahdex"`.

## Performance observed (live)
- ETH→USDC 0.1 ETH: LI.FI 185.16 USDC vs StealthEx 183.13 — LI.FI wins by ~1.1%
- 6 routes for USDC→ETH: Nordstern, Fly, OKX, SushiSwap, 1inch, KyberSwap
- Cross-chain works: USDC(eth)→BNB(bsc) via Near bridge
- No API key needed. Integrator tag: `"orahdex"`.
