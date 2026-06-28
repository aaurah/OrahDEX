---
name: Socket bridge integration
description: Real bridge quote/buildTx via Socket.tech v2 API; interface change from getQuote to getQuotes; route storage pattern for buildTx.
---

## Interface change
`IBridgeProvider.getQuote()` was renamed to `getQuotes()` returning `BridgeQuote[]` (array). `quoteAggregator` fans out and flattens all arrays. This lets one provider return multiple routes.

## SocketBridgeProvider pattern
- API: `https://api.socket.tech/v2`
- Auth: `API-KEY` header; env var `SOCKET_API_KEY`, fallback to public demo key `72a5b4b0-e727-48be-8aa1-5da9d62fe635`
- `/quote` params: `fromChainId`, `toChainId`, `fromTokenAddress`, `toTokenAddress`, `fromAmount`, `userAddress`, `sort=output`, `uniqueRoutesPerBridge=true`
- Provider IDs are `socket:<bridge-slug>:<routeId[:8]>` (dynamic per route)

## buildTx route storage
Full Socket route object is stored in `quote.routeMeta.socketRoute`. `buildTx` reads it back and POSTs to `/v2/build-tx`. Response `txData.value` may be hex — convert with `BigInt(hexVal).toString()`.

## Provider lookup
`getProvider(id)` does exact match first, then prefix match on `id.split(":")[0]`. This resolves `socket:across-v2:abc12345` → `SocketBridgeProvider` (id = "socket").

**Why:** Socket returns dynamic route IDs per quote but buildTx needs the provider class, not the specific route ID.

## Frontend display
`providerMeta(id, routeMeta)` reads `routeMeta.bridgeName` set by `mapRoute()`. Falls back to slug-splitting the provider ID. Bridge colors keyed by substring match (across→green, stargate→yellow, etc.). Tags (Fastest/Cheapest) computed dynamically from the quotes array at render time via `computeTags()`.

## bsv-dex rebuild required
`artifacts/bsv-dex` is served as static files from `dist/public` (no HMR dev server). Any frontend change requires running `pnpm run build` in that directory. The API server restarts pick up server-side changes immediately.
