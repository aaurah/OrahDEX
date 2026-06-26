---
name: Reown raw eth_sendTransaction
description: viem@2.47.x wagmiSendTransaction throws "this request method is not supported" on WalletConnect relays; must bypass viem and call eth_sendTransaction directly on the connector's EIP-1193 provider.
---

## Rule

Never use `wagmiSendTransaction` (or viem's `sendTransaction`) for WalletConnect/Reown signing paths. Always call `eth_sendTransaction` directly on the connector's raw EIP-1193 provider.

**Why:** viem@2.47.x's `sendTransaction` internally calls extra JSON-RPC methods for wallet-type detection and EIP-1559 fee estimation before issuing `eth_sendTransaction`. The WalletConnect relay doesn't proxy all of those internal methods, so viem throws EIP-1193 error 4200 "this request method is not supported" before the transaction is even attempted.

**How to apply:** In any function that signs via a wagmi connector (Reown AppKit):
1. Get the connector's provider: `const provider = await connector.getProvider()`
2. Switch chain with `wallet_switchEthereumChain` if needed (this works fine)
3. Pre-estimate gas with your own public RPC (`getPublicClient(chainId).estimateGas(...)`) and pad 30%
4. Build the tx object manually with hex-encoded `value`, `gas`
5. Call `provider.request({ method: "eth_sendTransaction", params: [txObj] })` directly
6. Wait for receipt with `getPublicClient(chainId).waitForTransactionReceipt({ hash })` — NOT wagmi's waitForReceipt (same viem wrapper issue)

`wagmiSwitchChain` (chain switching) is fine — the issue is specific to `sendTransaction`.

The pattern is implemented in `sendRawViaReown()` in `artifacts/bsv-dex/src/lib/escrow.ts`.
