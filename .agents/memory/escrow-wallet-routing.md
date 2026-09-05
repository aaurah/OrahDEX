---
name: Escrow wallet routing bugs
description: Three root causes that made OrahDEXEscrow only work with MetaMask; fixes documented here.
---

## Rule
OrahDEXEscrow is **deployed on Sepolia AND all 12 mainnets** (verified on-chain 2026-09-05). Sepolia: `0x4deb6023abD9E1C640aDa35201be8ff591d21cF2`. All 12 mainnets share one CREATE2 address: `0xeE234cEb85697b64800E696699b7841e00413B4f` — ETH(1), OP(10), BSC(56), Unichain(130), Polygon(137), zkSync(324), Sei(1329), Base(8453), Arbitrum(42161), Avalanche(43114), Linea(59144), Scroll(534352). All are listed in `ESCROW_ADDRESSES` (both `escrowConfig.ts` and `escrowRelayer.ts`) and in `DEPLOYED_ESCROW_CHAINS`. Never add a chain to `ESCROW_ADDRESSES` until the contract bytecode is verified on that chain — a listed-but-undeployed chain causes `escrowAvailable = true` which fires the lock dialog and then reverts on-chain.

**Operational blocker:** the relayer wallet `0x5A391a3A2d6d885C412FE24be624126694de08dA` needs native gas on every chain for release() txs. As of 2026-09-05: Polygon 10.63 POL OK, Avalanche 0.107 AVAX OK-ish, ETH/OP/BSC/Base/Linea/Scroll/zkSync/Sei/Unichain ≈ dust (0.0004–0.0006), Arbitrum 0. `EVM_WALLET_SECRET` (Cloudflare secret on orahdex-api) must derive to that relayer address.

**Why:** The contract was deployed at a different address on Sepolia vs the common CREATE2 mainnet address. Listing mainnet chains prematurely (before the 2026-09-05 mainnet deployment was verified) caused txns to revert for every wallet except MetaMask (which users had manually set to Sepolia).

## Reown / WalletConnect routing in useEscrow
`isReownConnected()` must check **`provider === "reown"` from the wallet store first**. Checking only `wagmiGetAccount().connector.id` misses wallets like MetaMask Mobile, Rainbow, Coinbase Mobile — they all connect through WalletConnect/Reown AppKit but report connector IDs like `"metaMaskSDK"` or `"coinbaseWalletSDK"`, not `"walletconnect"` or `"reown"`.

**How to apply:** When `provider === "reown"` is in the store, always route to `lockEthViaReown`. The store value is set by the Reown subscription in `App.tsx` and is the definitive signal. Connector.id check is a belt-and-suspenders fallback only.

## ThirdWeb mobile wallet chainId
`ThirdwebMobilePanel.handleConnect` in `WalletChooserDialog.tsx` must call `wallet.getChain()?.id` after `wallet.connect()` — never hardcode `chainId: 1`. Hardcoding mainnet caused the same problem as the ESCROW_ADDRESSES bug for all ThirdWeb mobile connections.
