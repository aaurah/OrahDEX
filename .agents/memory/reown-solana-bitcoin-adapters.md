---
name: Reown Solana + Bitcoin adapters
description: Deps required and wiring pattern for SolanaAdapter + BitcoinAdapter in reown-appkit.ts
---

## Solana adapter deps (must `pnpm add` to bsv-dex)
```
@solana/web3.js@1.98.4
@solana/wallet-adapter-base@0.9.27
@solana/wallet-standard-features@1.3.0
@solana/wallet-standard-util@1.1.2
@solana/spl-token@0.4.14
@wallet-standard/app@1.1.0
@wallet-standard/base@1.1.0
@wallet-standard/features@1.1.0
```
These install cleanly in ~45s (no SIGKILL risk — unlike Reown tarballs).

## Bitcoin adapter deps
```
bitcoinjs-lib@6.1.7
sats-connect@3.5.0
```
`@exodus/bitcoin-wallet-standard@0.0.0` is bundled inside the adapter dist — do NOT try to install it from npm (version 0.0.0 is a workspace-internal package).

## Wiring pattern in reown-appkit.ts
```ts
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import { solana, solanaTestnet, solanaDevnet, bitcoin, bitcoinTestnet } from "@reown/appkit/networks";

// WagmiAdapter must receive EVM-only networks — passing Solana/Bitcoin to it causes type errors
const evmNetworks = [mainnet, polygon, ...] as const;
export const wagmiAdapter  = new WagmiAdapter({ projectId, networks: evmNetworks });
export const solanaAdapter  = new SolanaAdapter();
export const bitcoinAdapter = new BitcoinAdapter();

// Full multi-chain networks list passed to createAppKit (not to WagmiAdapter)
const networks = [...evmNetworks, solana, solanaTestnet, solanaDevnet, bitcoin, bitcoinTestnet] as const;

createAppKit({ adapters: [wagmiAdapter, solanaAdapter, bitcoinAdapter], networks, ... });
```

**Why:** WagmiAdapter is EVM-only; `createAppKit` owns the full network list and dispatches
non-EVM connections to the appropriate adapter.

**How to apply:** Any time Solana or Bitcoin adapters are added or re-added after a clean install.
