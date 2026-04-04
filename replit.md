# Overview

This project is a pnpm workspace monorepo using TypeScript, designed to be a full-featured BSV (Bitcoin SV) DEX (Decentralized Exchange) platform. Its ambition is to rival established platforms like Binance, Poloniex, and Bitfinex by offering on-chain BSV settlement, advanced trading features, and multi-chain support. The platform aims to provide a robust and user-friendly experience for spot and futures trading, liquidity provision, and innovative features like on-chain copy trading and a native multi-chain HD wallet.

Key capabilities include:
- A native HD Wallet supporting BIP39 and BIP44/SLIP-0010 for multiple chains (EVM, BTC, BCH, BSV, SOL).
- CopyVault, an on-chain copy trading system with ERC4626-style vault accounting.
- Comprehensive AMM Liquidity System with detailed fee splits and simulation tools.
- A sophisticated Trade Engine with a 5-phase "Golden Execution Path" for reliable transaction processing.
- Multi-chain support, including TRON and various EVM networks.
- A demo account feature for paper trading with virtual funds.
- A robust API infrastructure and an Admin AI Intelligence panel for managing AI features and insights.

# User Preferences

I want iterative development and detailed explanations. Ask before making major changes. Do not make changes to the folder `lib/api-spec`. Do not make changes to the file `artifacts/bsv-dex/src/lib/seedPhrase.ts`. I prefer clear and concise communication.

# System Architecture

## Monorepo Structure

The project is structured as a pnpm monorepo using TypeScript. It includes:
- `artifacts/`: Deployable applications (`api-server`, `bsv-dex` for web, `aura-dex-mobile` for mobile).
- `lib/`: Shared libraries (`api-spec`, `api-client-react`, `api-zod`, `db`).
- `scripts/`: Utility scripts, including a `seedDex.ts` for database initialization.

## UI/UX Decisions

- **Color Schemes**: Specific coin colors defined for better visual identification (e.g., TRX red, BTT purple).
- **WalletConnectModal**: Features a 3-tab layout for EVM Wallets, TRON, and Bitcoin SV.
- **AMM Simulators**: Dedicated desktop and mobile versions of the AMM swap calculator with detailed math breakdowns.
- **LP Position Store**: Uses Zustand and localStorage to track real user positions, enriching static pool data.
- **TradingView Integration**: Utilizes `lightweight-charts v5` for candlestick charts.
- **Demo Mode**: A yellow sticky banner visually indicates demo mode, and a dedicated dropdown in `WalletOptionsDropdown` for demo-specific actions.
- **Quote Currency Selector**: A full-screen picker overlay allows users to select fiat or crypto quote currencies, with conversions applied across the UI.
- **Admin AI Intelligence Panel**: Provides a comprehensive interface for managing AI models, insights, trade signals, and chat testing.

## Technical Implementations

### OrahDEX Native HD Wallet
- **Derivation Paths**: Supports BIP44 for EVM, BTC, BCH, BSV, and SLIP-0010 for SOL, leveraging `@scure/bip32`, `@scure/bip39`, `@noble/curves`, `@noble/hashes`.
- **Import Flow**: Allows import via BIP39 seed phrase (all 5 chains) or EVM private key (EVM only).

### CopyVault
- **Architecture**: ERC4626-style vault accounting where followers deposit USDT for shares.
- **Orchestrator**: `copyOrchestrator.ts` mirrors leader trades proportionally based on vault TVL.

### TRON Chain Support
- **Integration**: Extends `WalletNetwork` type, adds TRON tab in `WalletConnectModal`, `useTronBalances` hook for fetching token balances via TronGrid API.
- **UI Elements**: Integrates TRON pools, assets, and network labels into portfolio and liquidity views.

### AMM Liquidity System
- **Fee Split**: `LP_FEE_RATIO` (5/6) and `PROTOCOL_FEE_RATIO` (1/6) for trading fees.
- **Formula**: Standard `Δy = (Δx × (1−fee) × y) / (x + Δx × (1−fee))` with `k = x·y`.
- **LP Position Management**: `useLiquidityStore` (Zustand) tracks user LP tokens and updates UI components.

### Trade Engine
- **Phases**: Implements a 5-phase execution path: Precheck, Build, Sign, Broadcast, Confirm, with latency tracking.
- **Error Handling**: Canonical error taxonomy with `USER | PROTOCOL | INFRA` codes.
- **Route Caching**: Uses hot route caches on both client and server sides with TTL and price-move invalidation.
- **Telemetry**: `tradeMetrics.ts` collects aggregate latency and failure stats.

### Demo Account
- **Activation**: `/api/demo/activate` seeds a virtual wallet with fixed amounts of various assets.
- **Validation**: API rejects non-`DEMO_`-prefixed addresses for real trading.
- **UI**: Demo banner, specific wallet options for resetting balance, connecting real wallet, or exiting demo mode.

### P2P + Atomic Swap
- **Features**: Dedicated P2P and Atomic Swap tabs, with an HTLC form, protocol visualizer, and BSV settlement.

### Price Engine
- **Logic**: Prioritizes Binance prices, falls back to `FALLBACK_PRICES` if Binance is unavailable, and uses own-trade prices as a last resort for unlisted coins.
- **Quote Currency**: Allows users to select preferred fiat or crypto quote currencies, which are used for all price and market cap displays.

## Feature Specifications

- **Markets**: 10 spot markets (e.g., BSV/USDT, BTC/USDT) and 3 futures/perp markets (e.g., BSV/USDT-PERP).
- **Trading Features (Spot)**: Limit, Market, Stop-Limit, Take Profit, OCO order types; real-time order book, TradingView charts, market trades ticker.
- **Futures Features**: Leverage slider (1x-125x), cross/isolated margin, mark/index price, funding rate display, positions panel.
- **Wallet Connect**: Supports HandCash, RelayX, Twetch, Panda Wallet, Yours Wallet, Sensilet for BSV, and Reown AppKit for EVM and other chains.
- **Notifications**: System for push notifications on order placement and filling, including BSV settlement transaction IDs.
- **Admin AI Intelligence**: Model selection (gpt-5-mini/gpt-5/gpt-5.2), system prompt preview, live insights, trade signals, and a streaming chat tester.

# External Dependencies

- **Monorepo Tool**: pnpm workspaces
- **API Framework**: Express 5
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod, drizzle-zod
- **API Codegen**: Orval (from OpenAPI spec)
- **Build Tool**: esbuild
- **Frontend Framework**: React + Vite
- **Styling**: TailwindCSS
- **State Management**: Zustand
- **Data Fetching**: TanStack React Query
- **Routing**: Wouter
- **Charting**: lightweight-charts v5 (TradingView library)
- **Wallet Connectivity**:
    - `@scure/bip32`, `@scure/bip39`, `@noble/hashes`, `@noble/curves`, `@noble/secp256k1` for native HD wallet.
    - `@reown/appkit`, `@reown/appkit-adapter-wagmi` for WalletConnect v2 integration.
    - Nodemailer for email/SMTP.
- **External APIs/Services**:
    - TronGrid API for TRON balances.
    - WhatsOnChain for BSV block data and live BSV prices.
    - Binance for reference prices and volume augmentation.
    - Mailgun, SendGrid, Postmark for inbound email webhooks.