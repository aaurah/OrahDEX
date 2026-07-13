---
name: EVM wallet connect architecture
description: Reown/WalletConnect removed; how EVM wallet connect now works end-to-end.
---

## The rule
Reown/AppKit is completely removed from the codebase. All EVM wallet connection goes through either OrahDEX's own passkey/seed wallet or ThirdWeb.

## Architecture
- **WalletChooserDialog** has an "EVM Wallet" tab (`tab === "evm"`) that renders ThirdWeb's `ConnectEmbed` with MetaMask, Coinbase, Rabby, Trust, and inAppWallet (email/google/apple/passkey).
- **ThirdwebSync** component in `App.tsx` watches `useActiveAccount()` from ThirdWeb. When it becomes non-null it calls `useWalletStore.getState().connect({ provider: "thirdweb", ... })`. This is the ONLY path from ThirdWeb → wallet store.
- **reown.ts** still exists but only exports EVM utility functions (fetchEvmBalance, sendEvmTransfer, CHAIN_RPC_URLS, etc.) and a minimal `wagmiConfig` with no connectors. WagmiProvider wraps the app in `main.tsx` for backward compat with some admin pages.
- `useThirdwebWalletSync` is now a no-op hook kept only for import compatibility.
- `isReownConnected()` in useEscrow.ts always returns false.

**Why:** User requested complete removal of Reown/WalletConnect. ThirdWeb ConnectEmbed covers MetaMask, Coinbase, injected wallets and adds in-app wallet (email/social) as a bonus.

**How to apply:** Never re-introduce @reown/appkit or @reown/appkit-adapter-wagmi. If a new EVM wallet connector is needed, add it to the `wallets` array in the `ConnectEmbed` in WalletChooserDialog.tsx. If the ThirdWeb session doesn't sync to the store, debug ThirdwebSync in App.tsx first.
