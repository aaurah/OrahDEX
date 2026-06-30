---
name: Escrow wallet routing bugs
description: Three root causes that made OrahDEXEscrow only work with MetaMask; fixes documented here.
---

## Rule
OrahDEXEscrow is **only deployed on Sepolia** (11155111, address `0x4deb6023abD9E1C640aDa35201be8ff591d21cF2`). All other chain entries in `ESCROW_ADDRESSES` are pending mainnet deployments. Never add a chain to `ESCROW_ADDRESSES` until the contract bytecode is verified on that chain — a listed-but-undeployed chain causes `escrowAvailable = true` which fires the lock dialog and then reverts on-chain.

**Why:** The contract was deployed at a different address on Sepolia vs a common CREATE2 address planned for mainnet. Listing mainnet chains prematurely caused txns to revert for every wallet except MetaMask (which users had manually set to Sepolia).

## Reown / WalletConnect routing in useEscrow
`isReownConnected()` must check **`provider === "reown"` from the wallet store first**. Checking only `wagmiGetAccount().connector.id` misses wallets like MetaMask Mobile, Rainbow, Coinbase Mobile — they all connect through WalletConnect/Reown AppKit but report connector IDs like `"metaMaskSDK"` or `"coinbaseWalletSDK"`, not `"walletconnect"` or `"reown"`.

**How to apply:** When `provider === "reown"` is in the store, always route to `lockEthViaReown`. The store value is set by the Reown subscription in `App.tsx` and is the definitive signal. Connector.id check is a belt-and-suspenders fallback only.

## ThirdWeb mobile wallet chainId
`ThirdwebMobilePanel.handleConnect` in `WalletChooserDialog.tsx` must call `wallet.getChain()?.id` after `wallet.connect()` — never hardcode `chainId: 1`. Hardcoding mainnet caused the same problem as the ESCROW_ADDRESSES bug for all ThirdWeb mobile connections.
