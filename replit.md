# Overview

This project is a pnpm workspace monorepo using TypeScript, designed as a full-featured BSV (Bitcoin SV) DEX (Decentralized Exchange) platform. It aims to offer on-chain BSV settlement, advanced trading features, and multi-chain support. Key capabilities include a native HD Wallet, CopyVault for on-chain copy trading, a comprehensive AMM Liquidity System, a sophisticated Trade Engine, multi-chain support (TRON, EVM networks), and an Admin AI Intelligence panel. The platform targets robust and user-friendly spot and futures trading, liquidity provision, and innovative features.

# User Preferences

I want iterative development and detailed explanations. Ask before making major changes. Do not make changes to the folder `lib/api-spec`. The file `artifacts/bsv-dex/src/lib/seedPhrase.ts` has been significantly updated to add XRP, LTC, and DOGE derivation — it is now safe to modify. I prefer clear and concise communication.

# System Architecture

## Monorepo Structure

The project is a pnpm monorepo using TypeScript, organized into `artifacts/` for applications, `lib/` for shared libraries, and `scripts/` for utilities.

## UI/UX Decisions

The platform features specific coin color schemes, a WalletConnectModal for real wallet connections, dedicated AMM simulators, a Zustand and localStorage-based LP Position Store, TradingView integration with `lightweight-charts v5`, a full-screen quote currency selector, and an Admin AI Intelligence Panel.

## Technical Implementations

- **OrahDEX Native HD Wallet**: Supports BIP39 and BIP44/SLIP-0010 for multiple chains (EVM, BTC/BSV/BCH, SOL, XRP, LTC, DOGE) with server-generated custodial sub-accounts. XRP uses m/44'/144'/0'/0/0 with the XRP-specific Base58 alphabet (classic "r..." address). LTC uses m/44'/2'/0'/0/0 with P2PKH version 0x30 ("L..." address). DOGE uses m/44'/3'/0'/0/0 with version 0x1E ("D..." address). All 8 chain addresses are derived simultaneously on wallet create/import/login and persisted to localStorage via `saveDerivedAddresses`.
- **Non-Custodial Balance Architecture**: External wallets rely on on-chain RPC balance reads; `useExchangeBalanceStore` is for Orah internal wallet paths.
- **Unified API Ledger Trading**: Orah internal wallet uses an API ledger for balance tracking and order funding.
- **CopyVault**: Implements ERC4626-style vault accounting for mirroring leader trades.
- **TRON Chain Support**: Extends `WalletNetwork` and integrates with `WalletConnectModal`.
- **AMM Liquidity System**: Uses a standard AMM formula with `LP_FEE_RATIO` and `PROTOCOL_FEE_RATIO`. LP positions are managed via `useLiquidityStore` (Zustand). OrahDEX native AMM contracts (`OrahPair.sol`, `OrahFactory.sol`, `OrahRouter02.sol`) are deployed on Sepolia testnet.
- **On-Chain Escrow (OrahDEXEscrow)**: Solidity contract for locking ETH/ERC-20 in escrow when placing open orders, deployed on Sepolia.
- **Trade Engine**: Features a 5-phase execution path (Precheck, Build, Sign, Broadcast, Confirm) with latency tracking, error handling, caching, and telemetry.
- **Prediction Trading**: Pool-based binary options with 5-minute rounds and leverage across 5 pairs, including a full TradingView-style chart.
- **OrderIntent Settlement Layer (BSV Core DEX v2)**: Introduces a canonical `OrderIntent` for shared contract between wallet and server, defining `fundingRef` semantics and enforcing balance isolation.
- **EVM HTLC Atomic Settlement**: Utilizes the `OrahDEXHTLC.sol` Solidity contract for atomic swaps on Ethereum, Polygon, and BSC.
- **BSV HTLC Atomic Settlement**: Leverages `htlc.ts` for P2SH HTLC script building and `htlcWatcher.ts` for adaptive polling.
- **BSV Testnet Support**: BSV network parameters are centralized in `artifacts/api-server/src/lib/bsvNetworkConfig.ts`.
- **P2P + Atomic Swap**: Dedicated features with HTLC forms and protocol visualizers.
- **Price Engine**: Prioritizes Binance prices, falls back to `FALLBACK_PRICES`, and uses own-trade prices for unlisted coins, supporting user-selected quote currencies.
- **Stable Markets List**: A `markets` table serves as the single source of truth for all pair listings. A hybrid swap router (`hybridRouter.ts`) handles internal, external, and split routing.
- **Spot Trading**: Orders go through verification, locking, matching, and settlement. Uses `user_balances` table with row locks.
- **Futures Trading**: Orders involve opening positions, locking margin, and managing liquidation prices.
- **Liquidity Provider-Awareness**: `getLiquidityMode()` accounts for internal wallet providers, defaulting them to "simulated" mode for liquidity operations.
- **Liquidity Balance Source**: `useBackendBalances` fetches balances from `/api/portfolio` for internal wallets; external EVM wallets use on-chain balances.
- **Mobile Navigation**: Features main tabs (Markets, Trade, Futures, Mkt Hub, More) and a "More" drawer.
- **Exchange Revenue & Fee System**: Centralized fee accumulation in `feeCollector.ts` records platform fees into the `keeper_earnings` table.
- **White-label Buy-Crypto Flow**: Single Stripe checkout with server-side provider routing. Orders ≥ $122 USD fulfill via LetsExchange; orders $10–$121 fulfill via SimpleSwap (per-coin range checked at quote time before charging). Both backends are operator-funded — only OrahDEX branding shown to the user. Provider stored on `crypto_orders.provider`; webhook + status sync branch accordingly.
- **Admin Panel**: Features an updated Dashboard with Quick Actions, dynamic system alerts, an "API Settings" page, and improved integrations management. Feature flags and API keys are database-persisted. API key hardening includes hash storage, one-time reveal, and rate limiting.

## Feature Specifications

The platform supports 958 markets (spot + perpetuals across 10 EVM chains + BSV/BTC/SOL/TRON) with 210 live price symbols. Trading features include various order types, real-time order books, TradingView charts, and dynamic fee displays. Futures trading offers leverage, cross/isolated margin, live mark/index prices, and funding rates. Wallet Connect supports multiple BSV wallets and Reown AppKit for EVM. Balance guards prevent overdrafts, and a push notification system is implemented. The Admin AI Intelligence panel offers model selection, prompt preview, insights, trade signals, and a chat tester. The Ticker API provides comprehensive market data. OrahNFT is a social NFT marketplace on BSV inscriptions, with live social DB tables and a real-time Community Chat. Fiat on-ramp supports 6 providers.

# External Dependencies

- **Monorepo Tool**: pnpm workspaces
- **API Framework**: Express 5
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod, drizzle-zod
- **API Codegen**: Orval
- **Build Tool**: esbuild
- **Frontend Framework**: React + Vite
- **Styling**: TailwindCSS
- **State Management**: Zustand
- **Data Fetching**: TanStack React Query
- **Routing**: Wouter
- **Charting**: lightweight-charts v5
- **Wallet Connectivity**: `@scure/bip32`, `@scure/bip39`, `@noble/hashes`, `@noble/curves`, `@noble/secp256k1`, `@reown/appkit`, `@reown/appkit-adapter-wagmi`, Nodemailer.
- **External APIs/Services**: TronGrid API, WhatsOnChain, Binance, Mailgun, SendGrid, Postmark, LetsExchange.
- **LetsExchange Cross-Chain Integration**: Uses LetsExchange API with Partner ID `1692` for coin lists, live rates, transaction creation, and status tracking, offering fixed-rate flows, proxy routes, and a native 3-step UI for cross-chain swaps.