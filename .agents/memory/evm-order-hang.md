---
name: EVM order placement hang
description: Root-cause analysis and fixes for "Placing…" spinner hanging indefinitely on EVM external wallet (WalletConnect/imToken) orders.
---

## Root cause (two layers)

### Layer 1 — WalletConnect signing promise never resolves (frontend)
When iOS Safari backgrounds the tab during the imToken signing handoff, WalletConnect can silently drop the signing response. `signMessageAsync()` then awaits indefinitely. `signingOrder` stays `true`. `isPending = placeOrder.isPending || signingOrder` is `true` forever — button shows "Placing…" and never clears.

**Fix:** Wrap `signMessageAsync()` and the `window.ethereum.request` fallback in `Promise.race([ signPromise, makeSignTimeout() ])` with a 90-second timeout in `OrderForm.tsx`. Timeout errors re-throw (not swallowed by the wagmi fallback path — guarded by `if (err.message.includes("timed out")) throw wagmiErr`).

**Why 90s:** Generous enough for a slow iOS app-switch + biometric unlock, but always finite so signingOrder clears.

### Layer 2 — fundingVerifier.ts RPC balance check stalls (server-side)
`verifyAndLockFunding` for EVM external wallets called `getBalance`/`readContract` via viem on public EVM RPC nodes with no reliable timeout. Public nodes frequently stall TCP indefinitely; Node.js `AbortSignal.timeout()` does NOT reliably abort open sockets.

**Fix:** Removed the RPC block entirely. EVM external wallets return `evm-sig:` immediately after 65-byte signature format validation. Balance enforcement happens on-chain at HTLC lock time.

**Why:** Balance check was redundant — HTLC contract reverts on insufficient funds. Wallet ownership (not balance) is the invariant at order-placement time.

## Other fixes in same session

- `spotSettlement.ts → settleSpotFill`: BSV broadcast moved to fire-and-forget `void (async () => {...})()`. Returns immediately with `broadcastAsync: true`.
- `orders.ts`: EVM external users match only against other EVM external wallet counterparties (bots excluded via `requiresDefiWalletToWallet`). `findEscrowChain` skipped when both orders have `evm-sig:`/`evm-balance:` refs.

## Diagnostic logs (can remove later)

- `req.log.info(...)` "POST /api/orders: HANDLER ENTERED" fires at handler entry before any async work — confirms request reached server.
- `console.log('[proxy] ...')` in `serve-static.mjs proxyToApi` for non-GET requests — confirms POST reached static proxy.

## Earlier issues in same project

- `OrderForm.tsx`: `signMessageAsync` guarded by `if (evmConnected)` — wagmi `isConnected` lags AppKit → signing skipped. Fix: remove guard.
- `HTLCSettlementCard.tsx` LockPanel: used raw `eth_sendTransaction` via `window.ethereum` with swallowed errors. Fix: use `useSendTransaction` from wagmi as primary.

## How to apply

Any future hang on EVM order placement: check (1) whether `signingOrder` is stuck (WalletConnect session drop), (2) whether fundingVerifier has new blocking async paths for EVM external wallets.
Any server RPC call in the order flow MUST have an explicit hard timeout. Never use bare `http(rpcUrl)` without `{ timeout }`.
