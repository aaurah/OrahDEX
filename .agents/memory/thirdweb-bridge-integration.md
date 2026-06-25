---
name: ThirdWeb Universal Bridge Integration
description: How ThirdWeb Bridge.Buy.prepare is wired into OrahDEX OrderForm to fund trades from any EVM chain/token.
---

## The Rule
Use `Bridge.Buy.prepare({ client, originChainId, originTokenAddress, destinationChainId, destinationTokenAddress, amount, sender, receiver })` to get multi-step bridge transactions, then execute each `tx` in `prepared.steps.flatMap(s => s.transactions)` in order.

**Why:** ThirdWeb Universal Bridge enables trading from any EVM token/chain. Without it, users must already have the exact token on the exact escrow chain. With it, USDC on Polygon → ETH on Ethereum → OrahDEX trade, all in one flow.

**How to apply:**
- `ThirdwebBridgePanel` at `src/components/trading/ThirdwebBridgePanel.tsx` — self-contained bridge widget
- Rendered in `OrderForm.tsx` when `isEvm && availableAmt <= 0`
- Destination token address: `NATIVE_SYMBOLS_EVM.has(sym) ? TW_NATIVE_ADDR : CHAIN_TOKEN_ADDRESSES[chainId][sym]`
- USDT/USDC have 6 decimals — pass `destinationTokenDecimals` correctly

## Transaction execution priority
1. ThirdWeb account (`useActiveAccount`) → `sendTransaction({ transaction: tx, account })`
2. Injected wallet (`window.ethereum`) → `eth_sendTransaction` with `wallet_switchEthereumChain` for cross-chain steps

## Key API shape
```ts
const prepared = await Bridge.Buy.prepare({ ..., amount: BigInt (destination wei) });
// prepared.steps[].transactions[] — each has: to, data, value?, chainId, chain, client
```

## Token list
`Bridge.tokens({ client, chainId })` returns top tokens for a chain including native. Fallback to `NATIVE_TOKEN_ADDRESS` if API call fails.
