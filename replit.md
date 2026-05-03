# Overview

This project is a pnpm workspace monorepo using TypeScript, designed as a full-featured BSV (Bitcoin SV) DEX (Decentralized Exchange) platform. It aims to offer on-chain BSV settlement, advanced trading features, and multi-chain support, rivaling established platforms. Key capabilities include a native HD Wallet, CopyVault for on-chain copy trading, a comprehensive AMM Liquidity System, a sophisticated Trade Engine, multi-chain support (TRON, EVM networks), and an Admin AI Intelligence panel. The platform targets robust and user-friendly spot and futures trading, liquidity provision, and innovative features.

# User Preferences

I want iterative development and detailed explanations. Ask before making major changes. Do not make changes to the folder `lib/api-spec`. Do not make changes to the file `artifacts/bsv-dex/src/lib/seedPhrase.ts`. I prefer clear and concise communication.

# System Architecture

## Monorepo Structure

The project is a pnpm monorepo using TypeScript, organized into `artifacts/` for applications, `lib/` for shared libraries, and `scripts/` for utilities.

## UI/UX Decisions

The platform features specific coin color schemes, a WalletConnectModal for real wallet connections, dedicated AMM simulators, a Zustand and localStorage-based LP Position Store, TradingView integration with `lightweight-charts v5`, a full-screen quote currency selector, and an Admin AI Intelligence Panel.

## Technical Implementations

- **OrahDEX Native HD Wallet**: Supports BIP39 and BIP44/SLIP-0010 for multiple chains (EVM, BTC/BSV/BCH, SOL). It integrates with Phantom wallet for BTC addresses and creates server-generated custodial sub-accounts for other external EVM wallets.
- **Non-Custodial Balance Architecture**: External wallets rely exclusively on on-chain RPC balance reads. The `useExchangeBalanceStore` is for Orah internal wallet paths, with fills settling directly to external wallet addresses. Deposit/Withdraw modals have been removed, replaced by `ReceiveModal.tsx` for QR viewing.
- **Unified API Ledger Trading**: The Orah internal wallet uses an API ledger for balance tracking and order funding, with funds locked for orders and balances refreshed post-trade.
- **CopyVault**: Implements ERC4626-style vault accounting for mirroring leader trades.
- **TRON Chain Support**: Extends `WalletNetwork` and integrates with `WalletConnectModal` for TRON asset display and balance handling.
- **AMM Liquidity System**: Uses a standard AMM formula with `LP_FEE_RATIO` and `PROTOCOL_FEE_RATIO`. LP positions are managed via `useLiquidityStore` (Zustand). OrahDEX native AMM contracts (`OrahPair.sol`, `OrahFactory.sol`, `OrahRouter02.sol`) are deployed on Sepolia testnet.
- **On-Chain Escrow (OrahDEXEscrow)**: Solidity contract `artifacts/orahdex-contracts/contracts/OrahDEXEscrow.sol` deployed on Sepolia at `0x4deb6023abD9E1C640aDa35201be8ff591d21cF2`. Allows users to lock ETH/ERC-20 in escrow when placing open orders, making their locked balance visible on-chain (Etherscan, wallet activity). Frontend integration: `useEscrow` hook + `escrow.ts` lib. After a non-matched order is placed, external EVM wallet users on Sepolia see a "Lock funds on Sepolia" button in the order result banner. Relayer address: `0x67C7f23eE49B6417661748F23F743C0B274039e2`. Deployment script: `artifacts/orahdex-contracts/scripts/deploy-escrow-standalone.mjs`.
- **Trade Engine**: Features a 5-phase execution path (Precheck, Build, Sign, Broadcast, Confirm) with latency tracking, error handling, caching, and telemetry.
- **Prediction Trading**: Pool-based binary options (UP/DOWN) with 5-minute rounds and leverage across 5 pairs, including a full TradingView-style chart.
- **OrderIntent Settlement Layer (BSV Core DEX v2)**: Introduces a canonical `OrderIntent` for shared contract between wallet and server, defining `fundingRef` semantics and enforcing balance isolation.
- **EVM HTLC Atomic Settlement**: Utilizes the `OrahDEXHTLC.sol` Solidity contract for atomic swaps on Ethereum, Polygon, and BSC, tracked via a `evm_htlc_sessions` DB table.
- **BSV HTLC Atomic Settlement**: Leverages `htlc.ts` for P2SH HTLC script building and `htlcWatcher.ts` for adaptive polling.
- **BSV Testnet Support**: BSV network parameters are centralized in `artifacts/api-server/src/lib/bsvNetworkConfig.ts`, allowing easy switching to BSV testnet.
- **P2P + Atomic Swap**: Dedicated features with HTLC forms and protocol visualizers.
- **Price Engine**: Prioritizes Binance prices, falls back to `FALLBACK_PRICES`, and uses own-trade prices for unlisted coins, supporting user-selected quote currencies.
- **Stable Markets List**: A `markets` table serves as the single source of truth for all pair listings, with `enabled` and `pinned` columns for management. A hybrid swap router (`hybridRouter.ts`) with DB-backed per-pair config handles internal, external, and split routing based on `enabled` flags, oracle status, and orderbook fills.
- **Spot Trading**: Orders go through a verification and locking process, matching loop, and settlement. Uses `user_balances` table for balance management with FOR UPDATE row locks.
- **Futures Trading**: Orders involve opening positions, locking margin, and managing liquidation prices. An engine runs every 60s for liquidation checks, and funding every 8h.
- **Liquidity Provider-Awareness**: `getLiquidityMode()` now accounts for internal wallet providers, defaulting them to "simulated" mode for liquidity operations.
- **Liquidity Balance Source**: `useBackendBalances` fetches balances from `/api/portfolio` for internal wallets, while external EVM wallets use on-chain balances. Simulated deposit mode now properly deducts balances server-side.
- **Mobile Navigation**: Features main tabs (Markets, Trade, Futures, Mkt Hub, More) and a "More" drawer for additional features.
- **Exchange Revenue & Fee System**: Centralized fee accumulation in `feeCollector.ts` records platform fees into the `keeper_earnings` table. An API endpoint `/api/revenue` provides aggregated platform revenue, and `/api/fee-schedule` details public fee tiers.
- **Hybrid Buy-Crypto Flow**: Two-tier fiat onramp. (1) Integrated Stripe → LetsExchange checkout (`DirectBuyModal` + `/api/stripe/create-payment-intent` in `stripeCheckout.ts`) enforces a $122 USD minimum because LetsExchange requires a $120 USDT *deposit* and our 1.5% platform fee is taken before the swap (`ceil(120/0.985)=122`). (2) For amounts below $122, `DirectBuyModal` displays an amber callout and a "Buy via partner provider" button that closes itself and opens `BuyCryptoModal`, which lists 8 deep-link onramps (Ramp $5, Alchemy Pay $10, Transak $15, MoonPay $30, Banxa, Simplex, Mercuryo, Paybis). Stripe Crypto Onramp was sunset by Stripe and is not used. The boundary is enforced both client-side (validation + disabled CTA) and server-side (HTTP 400 with `{minUsd:122, suggestPartnerProvider:true}`).
- **Admin Panel**: Features an updated Dashboard with Quick Actions, dynamic system alerts, an "API Settings" page, and improved integrations management. Feature flags are now database-persisted via `/api/admin/site-settings`. Admin list (`/api/admin/admins`) and API keys (`/api/admin/api-keys`) are now DB-backed (stored in `platform_settings`) so data persists across server restarts. Double-prefix route path bugs fixed for `/api/admin/le-income` and `/api/admin/routing-profiles`. All `console.log/warn/error` calls replaced with structured pino logger throughout `adminAuth.ts` and `admin.ts`.

## Feature Specifications

The platform supports 958 markets (spot + perpetuals across 10 EVM chains + BSV/BTC/SOL/TRON) with 210 live price symbols. Trading features include various order types, real-time order books, TradingView charts, and dynamic fee displays. Futures trading offers leverage, cross/isolated margin, live mark/index prices, and funding rates. Wallet Connect supports multiple BSV wallets and Reown AppKit for EVM. Balance guards prevent overdrafts, and a push notification system is implemented. The Admin AI Intelligence panel offers model selection, prompt preview, insights, trade signals, and a chat tester. The Ticker API provides comprehensive market data. OrahNFT is a social NFT marketplace on BSV inscriptions, with live social DB tables and a real-time Community Chat. Fiat on-ramp supports 6 providers.

# Pending Operational Tasks (resume later)

**Status as of 2026-05-03:** Two user withdrawals are queued and waiting on hot-wallet funding. The exchange code is fully fixed; only on-chain funds are missing. To resume, send the funds and reply with the txids — no further code changes needed.

## Owner action items

User wallet: `0x67C7f23eE49B6417661748F23F743C0B274039e2` (the only impacted user; total liability = the two amounts below).

### 1. Pending ETH withdrawal — 0.00936 ETH on Base
- Withdrawal record exists in `withdrawal_requests` (status=pending), debited from internal balance.
- New EVM hot wallet address: `0x5A391a3A2d6d885C412FE24be624126694de08dA` (currently 0 ETH).
- **To complete:** either
  - (A) Send 0.00937 ETH on Base → hot wallet `0x5A391a…08dA`, then admin clicks Retry, OR
  - (B) Send 0.00936 ETH on Base directly to user `0x67C7…39e2`, then admin clicks "Mark Completed" (route fixed: `PATCH /admin/withdrawals/:id/status`).

### 2. Pending BSV withdrawal — 0.01738667 BSV
- Withdrawal id: `346c4554-2744-4a9b-99a3-18a1d5d3fa5c`, status=pending, debited.
- BSV hot wallet: `1AwPYErieoPjPekmcFkGuTpx3VfyS5oAg6` (currently 0 BSV).
- Destination: `1H27XapmBqKA5zhKgZtp9dxkT9BxZgEAx6`.
- **To complete:** same A/B options as ETH above (fund hot wallet + Retry, or send direct + Mark Completed).

### 3. Permanent loss (already written off)
- Original EVM hot wallet `0xE81209…27704` holds 0.00936 ETH on Base but its private key was lost when the original `EVM_WALLET_SECRET` was lost. Funds are unrecoverable (~$30). No action possible.

### 4. Unbacked ADA balance
- User has 123.107 ADA in internal `user_balances` but OrahDEX has no Cardano integration. This balance has no on-chain backing and cannot be withdrawn. Decide whether to zero it out or build Cardano support.

## What was fixed in this session (already deployed)

- **Hot-wallet key/address mismatch**: `exchangeHotWallet.ts` now auto-detects when the operator pasted the private key into `EVM_WALLET_SECRET` instead of `EXCHANGE_HOT_WALLET_KEY` and uses it (with a warn log). Fix is permanent in code.
- **Admin "Mark Completed" route**: alias `PATCH /admin/withdrawals/:id/status` added in `routes/withdrawals.ts` (was 404'ing).
- **BSV deposit watcher** (`lib/bsvDepositWatcher.ts`): polls WhatsOnChain every 60 s, credits user BSV balance for new deposits to per-user custodial addresses. New table `bsv_deposits_credited` for dedup.
- **EVM deposit watcher** (`lib/evmDepositWatcher.ts`): polls Base/Eth/Arb/Op/BNB/Polygon every 90 s, credits user balance after 6 confirmations. Wei kept as bigint end-to-end (lossless precision). Reuses `evm_deposits_verified` with synthetic key `sweep:{chainId}:{addr}`.
- Both watchers wired into `app.ts` startup with `_busy` guards and insert-then-`SELECT FOR UPDATE` to prevent first-credit races.

## Known deferrals (not blocking)

- No auto-sweep from per-user deposit addresses → hot wallet (operator funds hot wallet manually for now).
- No multi-instance leader lock on watchers (single API instance today; add Postgres advisory lock if scaling horizontally).
- No ERC-20 deposit detection (native gas tokens only; ERC-20 still uses manual `POST /deposit/verify`).
- `mockup-sandbox` workflow fails on port collision (8081 in use) — unrelated to exchange functionality.

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
- **LetsExchange Cross-Chain Integration**: Uses LetsExchange API with Partner ID `1692` for coin lists, live rates, transaction creation, and status tracking. Integrates a fixed-rate flow and offers proxy routes and a native 3-step UI for cross-chain swaps. Provides orderbook fallback integration.