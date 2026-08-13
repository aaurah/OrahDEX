---
name: EVM wallet connect architecture
description: Both Reown/WalletConnect and ThirdWeb completely removed; only OrahDEX-native wallet options remain.
---

## The rule
Neither Reown/AppKit nor ThirdWeb exists in the codebase. All wallet connection is through OrahDEX's own options only.

## Current wallet options (WalletChooserDialog)
1. OrahDEX Wallet — passkey / Face ID / PIN (orah-wallet provider)
2. Seed Phrase Wallet — create new 12-word wallet
3. Import Wallet — existing seed phrase
4. Hardware Wallet — Ledger, Trezor, Keystone, GridPlus
5. Mobile QR — link via OrahDEX mobile app

## What was removed
- @reown/appkit and @reown/appkit-adapter-wagmi (packages)
- thirdweb (package)
- ThirdwebSwapPanel, ThirdwebBridgePanel, ThirdwebSync, useThirdwebWalletSync
- thirdweb-client.ts, thirdweb-theme.ts
- ThirdWebStatusPanel in ContractBuilder
- Universal Swap / twswap tab in Bridge page
- Universal bridge provider option in Swap page

## What remains
- `reown.ts` still exists but only exports EVM utility functions (fetchEvmBalance,
  sendEvmTransfer, CHAIN_RPC_URLS, wagmiConfig with no connectors)
- WagmiProvider wraps app in main.tsx for wagmi hooks in admin pages
- Escrow routing: orah-wallet → lockEthViaOrah / lockErc20ViaOrah; all others → universal (window.ethereum)
- EVM signing in MobileTrade: wagmi signMessageAsync → window.ethereum personal_sign fallback

**Why:** User explicitly requested complete removal of both Reown and ThirdWeb.

**How to apply:** Never re-introduce thirdweb or @reown packages. If EVM wallet connect is needed in future, evaluate a new approach from scratch.
