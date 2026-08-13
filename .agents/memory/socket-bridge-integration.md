---
name: Socket bridge integration
description: Real bridge quotes via Socket.tech v2 (server-side); tx-building via LiFi client-side from browser. IP blocking pattern documented.
---

## Interface change
`IBridgeProvider.getQuote()` was renamed to `getQuotes()` returning `BridgeQuote[]` (array). `quoteAggregator` fans out and flattens all arrays. This lets one provider return multiple routes.

## SocketBridgeProvider — quotes only (server-side)
- API: `https://api.socket.tech/v2`
- Auth: `API-KEY` header; env var `SOCKET_API_KEY`, fallback to public demo key `72a5b4b0-e727-48be-8aa1-5da9d62fe635`
- `/quote` params: `fromChainId`, `toChainId`, `fromTokenAddress`, `toTokenAddress`, `fromAmount`, `userAddress`, `sort=output`, `uniqueRoutesPerBridge=true`
- Provider IDs are `socket:<bridge-slug>:<routeId[:8]>` (dynamic per route)
- **Socket demo key BLOCKS /build-tx (403)** — only quotes work with the demo key

## Server-side bridge API blocking (critical)
Most bridge APIs (Socket build-tx, LiFi) block requests from Replit's shared server IP range.
- Socket `/v2/build-tx` → 403 with demo key (auth restriction)
- LiFi `li.quest/v1/quote` → 403 from server (IP block)
- LiFi works fine from user browsers (their IP)
- Hop Protocol API works from server but only returns fee params, not calldata

**Why:** Bridge aggregators rate-limit or block shared hosting IPs to prevent abuse.

## buildTx pattern — client-side browser call
`buildTx()` in `BridgeAggPanel.tsx` calls `https://li.quest/v1/quote` **directly from the browser** (not through our server). This works because the user's IP is not blocked.
- LiFi returns `transactionRequest: { to, data, value, chainId }` inline in the quote
- `value` is hex — convert with `BigInt(hexVal).toString()`
- `bridgeName` read from `toolDetails.name` or `tool`
- Small amounts (< ~$5 equiv) may return no route — show "Amount too small" error
- Server's `/build-tx` endpoint still exists but is unused by the frontend

## Provider lookup
`getProvider(id)` does exact match first, then prefix match on `id.split(":")[0]`. This resolves `socket:across-v2:abc12345` → `SocketBridgeProvider` (id = "socket").

## Frontend display
`providerMeta(id, routeMeta)` reads `routeMeta.bridgeName` set by `mapRoute()`. Falls back to slug-splitting the provider ID. Bridge colors keyed by substring match (across→green, stargate→yellow, etc.). Tags (Fastest/Cheapest) computed dynamically from the quotes array at render time via `computeTags()`.

## bsv-dex rebuild required
`artifacts/bsv-dex` is served as static files from `dist/public` (no HMR dev server). Any frontend change requires running `pnpm run build` in that directory. The API server restarts pick up server-side changes immediately.
