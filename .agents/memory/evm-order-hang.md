---
name: EVM order placement hang
description: Root-cause analysis and fixes for "Placing…" spinner hanging indefinitely on EVM external wallet (WalletConnect/imToken) orders, plus network mismatch guard.
---

## Root cause (three layers)

### Layer 1 — WalletConnect signing promise never resolves (frontend)
When iOS Safari backgrounds the tab during the imToken signing handoff, WalletConnect can silently drop the signing response. `signMessageAsync()` then awaits indefinitely. `signingOrder` stays `true`. `isPending = placeOrder.isPending || signingOrder` is `true` forever — button shows "Placing…" and never clears.

**Fix:** Wrap `signMessageAsync()` and the `window.ethereum.request` fallback in `Promise.race([ signPromise, makeSignTimeout() ])` with a 90-second timeout in `OrderForm.tsx`. Timeout errors re-throw (not swallowed by the wagmi fallback path — guarded by `if (err.message.includes("timed out")) throw wagmiErr`).

**Why 90s:** Generous enough for a slow iOS app-switch + biometric unlock, but always finite so signingOrder clears.

### Layer 2 — iOS Safari AbortController bug blocks fetch timeout (frontend)
After returning from background (imToken app-switch), iOS Safari puts `fetch()` into a zombie "connecting" state. `AbortController.abort()` — how `customFetch`'s timer worked — does NOT reliably cancel a fetch in this state (known WebKit bug). Promise hangs forever → `placeOrder.isPending` stays `true`.

**Fix:** Changed timeout in `customFetch.ts` from AbortController-only to `Promise.race([ fetchPromise, timeoutTimer ])`. The race fires independently of WebKit's network layer. AbortController signal is still passed to fetch() for cleanup, but the Promise.race is what actually rejects after `timeoutMs`.

**Why:** `setTimeout`-based Promise.race is immune to the iOS AbortController bug because it runs in the JS microtask queue, not the WebKit network layer.

### Layer 3 — fundingVerifier.ts RPC balance check blocks trades (server-side)

`fundingVerifier.ts` has its **own separate** `EVM_PUBLIC_RPCS` list (lines ~88-98) that is NOT shared with `subsystemProbe.ts` or `evmHtlc.ts`. When those two files were updated to use publicnode.com, `fundingVerifier.ts` kept the dead old URLs and silently timed out on every order.

**Three sub-issues, all in fundingVerifier.ts:**
1. `EVM_PUBLIC_RPCS` had dead fallbacks: `eth.llamarpc.com`, `cloudflare-eth.com`, `polygon-rpc.com`.
2. `ETH_RPC_URL` env var was a Replit **secret** (not env var) pointing to an expired QuickNode node. `deleteEnvVars()` does NOT delete secrets — user must update/delete from Replit Secrets panel. The first entry of `EVM_PUBLIC_RPCS[1]` now reads `process.env.ETH_RPC_URL` so a configured secret is always preferred over the fallback.
3. The `skipped` (RPC timeout) branch was **fail-closed** — blocking the trade with "all RPC endpoints timed out" — contradicting the comment that said fail-open. Balance enforcement happens on-chain at HTLC lock time, so fail-open is correct and safe.

**Fix:**
- Updated `EVM_PUBLIC_RPCS` to use publicnode.com (same as subsystemProbe + evmHtlc), added `eth.drpc.org` as ETH fallback #2.
- Chain 1 primary slot now reads `process.env.ETH_RPC_URL` first.
- Changed `skipped` branch from returning `{ valid: false, error: "..." }` to a `logger.warn` + fall-through, so the order proceeds on signature proof alone.

## Network mismatch guard (added in same session)

User was connected to Sepolia testnet (chainId 11155111) and placed a production order — it was accepted but would fail to settle. **Fix:** Added a network guard in `handleSubmit` (OrderForm.tsx) BEFORE signing, so the user gets instant feedback:

1. **Testnet block:** Any known testnet chain ID (11155111, 80001, 97, 421613, 84532, 11155420, 59141, 1442, 80002, 943) → hard error "Wrong Network — Testnet Detected".
2. **Quote mismatch block:** BNB pair on Ethereum, MATIC pair on BSC, etc. → error with expected network name. ETH pairs allow any ETH-native chain (mainnet + all L2s: 1, 42161, 10, 8453, 59144, 324, 534352…).

**Why early:** Stops the user BEFORE they switch to imToken to sign — no wasted round-trip.

## Other fixes in same session

- `spotSettlement.ts → settleSpotFill`: BSV broadcast moved to fire-and-forget `void (async () => {...})()`. Returns immediately with `broadcastAsync: true`.
- `orders.ts`: EVM external users match only against other EVM external wallet counterparties (bots excluded via `requiresDefiWalletToWallet`). `findEscrowChain` skipped when both orders have `evm-sig:`/`evm-balance:` refs.
- `onError` handler in OrderForm: added `err?.name === "TimeoutError"` check alongside `AbortError` to correctly surface timeout toasts.

## How to apply

- Any future hang on EVM order placement: check (1) whether `signingOrder` is stuck (WalletConnect session drop), (2) whether `placeOrder.isPending` is stuck (iOS fetch zombie), (3) whether fundingVerifier has new blocking async paths.
- Any `customFetch` timeout must use `Promise.race` — never rely solely on AbortController for iOS Safari compatibility.
- **RPC URLs exist in THREE places:** `subsystemProbe.ts`, `evmHtlc.ts`, AND `fundingVerifier.ts`. Always update all three together when changing RPC endpoints.
- `deleteEnvVars()` does NOT delete Replit secrets — use `requestEnvVar()` to ask the user to update the value.
- Network guard must run BEFORE signing in `handleSubmit` so testnet/mismatch errors surface before the user switches apps.
