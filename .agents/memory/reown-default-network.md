---
name: Reown AppKit defaultNetwork reset
description: AppKit fires subscribeAccount multiple times on WC session restore, always reporting the session's original chain (mainnet=1); isFirstFire guards fail on subsequent fires; only ChainSwitcherDropdown should write the stored chain key.
---

## Rule
The `orah-reown-chain` localStorage key must be written **only** by ChainSwitcherDropdown (explicit user switch). The `subscribeReownAccount` callback in App.tsx must **read** this key on every fire — never write back to it — so all AppKit reconnect fires (however many) use the stored preference.

## Why
AppKit's `subscribeAccount` fires MULTIPLE times during WC session restoration. Each fire reports the session's original negotiated chain (often mainnet=1), not what the user last switched to via `wallet_switchEthereumChain`. An `isFirstFire` guard only blocks the first fire; subsequent fires still reset chainId=1. Writing `saveReownChain(effectiveChainId)` inside the subscription corrupts the stored key to "1" on the second fire.

Two independent root causes compound each other:
1. `defaultNetwork: mainnet` hardcoded in `createAppKit` → AppKit always thinks it's on mainnet at init
2. WalletConnect v2 sessions do NOT update the session's stored chain when `wallet_switchEthereumChain` is called → caipAddress in the session still says `eip155:1:0x...`

## How to apply
- `reown-appkit.ts`: at module-load time read `orah-reown-chain` from localStorage, find the matching network, pass as `defaultNetwork` (initialisation-time hint only).
- `reown-appkit.ts`: export `saveReownChain(chainId)` that writes `localStorage.setItem("orah-reown-chain", String(chainId))`.
- `ChainSwitcherDropdown.tsx` (Reown path): call `saveReownChain(chain.id)` after every successful switch — this is the ONLY writer.
- `App.tsx subscribeReownAccount callback`: when `storedAddress === address && provider === "reown"`, read `orah-reown-chain` from localStorage and use it as `effectiveChainId` regardless of what AppKit reports. Do **not** write back to `orah-reown-chain` here.
- `subscribeReownAccount` in `reown-appkit.ts`: parse CAIP-2 chainId strings (`"eip155:N"`) since some AppKit versions emit strings not numbers.

## Pitfalls to avoid
- Do NOT call `saveReownChain` inside the subscription callback — this corrupts the key to "1" on every reconnect.
- Do NOT rely on `isFirstFire` alone — AppKit fires the callback multiple times.
- Do NOT rely solely on `defaultNetwork` — it only matters when there is no WC session; an existing session overrides it.
