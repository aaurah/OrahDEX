---
name: Reown dual-subscription guard
description: Why only one subscribeReownAccount subscription must exist, and where it lives
---

## Rule

There must be **exactly one** `subscribeReownAccount` subscription in the app, and it must live in **`Layout.tsx`** (not `App.tsx`). That subscription contains a critical guard:

```typescript
const isIntentionalEvm = isEvmConnectRequested();
const isChainSwitch = currentProvider === "reown" && current === state.address && ...;
if (!current || isIntentionalEvm || isChainSwitch) {
  // only then: connect(), setBalance(), getWcMultiChainAddresses()
}
```

Any duplicate subscription without this guard will silently call `store.connect({provider:"reown"})` on every Reown auto-reconnect (e.g. MetaMask restoring from a previous session), overriding passkey/seed/orah-wallet state stored in Zustand persist.

**Why:** The Zustand wallet store IS persisted to localStorage, so `provider:"orah-wallet"` survives page reload. But Reown AppKit also restores its previous connection on load and fires all subscribers. Without the guard, the second subscriber overwrites the passkey state before the user does anything.

**How to apply:**
- If you need to add logic to the Reown connection event (e.g. WC multi-chain address extraction), add it INSIDE the existing guarded block in `Layout.tsx`, not in a new subscription.
- `getWcMultiChainAddresses()` belongs inside the `if (!current || isIntentionalEvm || isChainSwitch)` block so it only runs on deliberate EVM connects.
- The `isEvmConnectRequested` flag is a module-level boolean in `reown.ts`; `setEvmConnectRequested(true)` is called by `openEvm()` before the modal opens, and `setEvmConnectRequested(false)` is cleared inside the guard after the connect is accepted.
