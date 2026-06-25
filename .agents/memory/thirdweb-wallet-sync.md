---
name: ThirdWeb Wallet Store Sync
description: ThirdwebMobilePanel must sync the connected address to OrahDEX's useWalletStore after wallet.connect() succeeds.
---

## The Rule
After `wallet.connect({ client: thirdwebClient })` resolves, extract `account.address` and call `useWalletStore.getState().connect(...)` to update OrahDEX's global wallet state.

**Why:** ThirdWeb v5's `useConnect` hook manages ThirdWeb's internal wallet state, but OrahDEX's own `useWalletStore` is the source of truth for the "connected" UI state, order signing, and balance display. Without this sync, the ThirdWeb connection succeeds silently but the UI still shows "Connect Wallet".

**How to apply:** In `ThirdwebMobilePanel.handleConnect` (WalletChooserDialog.tsx):
```js
const account = await wallet.connect({ client: thirdwebClient });
if (account?.address) {
  useWalletStore.getState().connect({
    address: account.address,
    provider: "thirdweb",
    network: "evm",
    chainId: 1,  // default mainnet; wallet can switch chain after connecting
  });
}
```

## Additional context
- `useWalletStore` is already imported in WalletChooserDialog.tsx.
- The `provider` string `"thirdweb"` is safe — the wallet store accepts any string for `provider` and no existing code path has special-case logic that would break on this value.
- Reown/EVM wallet connect uses `subscribeReownAccount` in Layout.tsx to sync its state; ThirdWeb has no equivalent subscription so the sync must happen at connect time.
