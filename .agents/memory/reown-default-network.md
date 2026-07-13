---
name: Reown AppKit defaultNetwork reset
description: AppKit's defaultNetwork is consumed at module-load time; if hardcoded to mainnet, subscribeAccount always fires chainId=1 on page refresh, overwriting the user's persisted Sepolia/testnet selection.
---

## Rule
Never hardcode `defaultNetwork: mainnet` in `createAppKit`. Instead, read the user's last-chosen chainId from localStorage (`orah-reown-chain`) at module-load time and find the matching network object.

## Why
`createAppKit` is called when the ES module is first imported (lazy dynamic import from App.tsx's useEffect). Whatever `defaultNetwork` is passed becomes the chainId AppKit reports in `subscribeAccount` until the WalletConnect session is fully restored — which may be AFTER the first subscription fire. If this is `mainnet`, `subscribeAccount` fires `chainId=1` and any subscription handler that calls `walletStore.connect({ chainId })` overwrites the user's persisted Sepolia/testnet.

Additionally, `acc.chainId` in `subscribeAccount` may arrive as a CAIP-2 string `"eip155:11155111"` rather than a number — the previous code fell back to `1` for non-numbers, silently forcing mainnet.

## How to apply
- In `reown-appkit.ts`: `const storedChainId = parseInt(localStorage.getItem("orah-reown-chain") ?? "", 10) || 1;` before `createAppKit`, then `defaultNetwork: networks.find(n => n.id === storedChainId) ?? mainnet`.
- Export `saveReownChain(chainId: number)` that writes `localStorage.setItem("orah-reown-chain", String(chainId))`.
- Call `saveReownChain(chain.id)` in ChainSwitcherDropdown after every successful Reown switch.
- Call `saveReownChain(effectiveChainId)` in App.tsx's `subscribeReownAccount` callback to capture wallet-initiated chain changes.
- In `subscribeReownAccount`, parse CAIP-2 strings: `acc.chainId.includes(":") ? parseInt(acc.chainId.split(":")[1]) : acc.chainId`.
- Keep the `isFirstFire` guard in App.tsx as a second safety net (uses wallet store's persisted chainId if AppKit still fires wrong value on edge cases).
