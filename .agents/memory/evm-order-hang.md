---
name: EVM order placement hang
description: fundingVerifier.ts on-chain RPC balance check stalls with no timeout, causing "Placing…" to hang
---

## The rule
`fundingVerifier.ts` calls `createPublicClient` → `getBalance`/`readContract` via public RPC (llamarpc, etc.) with no timeout. Public nodes stall for 30s+ → order POST never returns → UI stuck on "Placing…".

**Fix applied:** `http(rpcUrl, { timeout: 8_000 })` on the viem transport. On catch (timeout or failure), fall back to signature-based `evmSigFundingRef` — user already proved wallet ownership via `personal_sign`, and HTLC escrow handles actual fund lock at settlement.

**Why:** Rejecting the order on RPC failure was wrong — the user already signed and HTLC enforces actual funds. Accepting on sig-proof is safe.

**How to apply:** Any future RPC calls in server-side order flow must have an explicit timeout. Never use bare `http(rpcUrl)` without `{ timeout }`.

## Second issue found in same session
`OrderForm.tsx`: `signMessageAsync` was guarded by `if (evmConnected)` — wagmi's `isConnected` state lags Reown AppKit connection → signing skipped on fresh connect → fell through to `window.ethereum` which doesn't exist on WalletConnect mobile → silent failure.

**Fix:** Remove `evmConnected` guard; always try `signMessageAsync` first unconditionally.

## Third issue
`HTLCSettlementCard.tsx` LockPanel: used raw `eth_sendTransaction` via `window.ethereum` with `tryProvider` that swallowed all non-rejection errors → no wallet popup + silent "No wallet found". 

**Fix:** Use `useSendTransaction` from wagmi as primary sender in `LockPanel` (same pattern as `HtlcLockRecovery.tsx`), with `window.ethereum` and connector loop as fallbacks.
