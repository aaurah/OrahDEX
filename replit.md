# Overview

This project is a pnpm workspace monorepo using TypeScript, designed to be a full-featured BSV (Bitcoin SV) DEX (Decentralized Exchange) platform. Its ambition is to rival established platforms like Binance, Poloniex, and Bitfinex by offering on-chain BSV settlement, advanced trading features, and multi-chain support. The platform aims to provide a robust and user-friendly experience for spot and futures trading, liquidity provision, and innovative features like on-chain copy trading and a native multi-chain HD wallet. Key capabilities include a native HD Wallet, CopyVault for on-chain copy trading, a comprehensive AMM Liquidity System, a sophisticated Trade Engine, multi-chain support (including TRON and various EVM networks), a demo account feature, and an Admin AI Intelligence panel.

# User Preferences

I want iterative development and detailed explanations. Ask before making major changes. Do not make changes to the folder `lib/api-spec`. Do not make changes to the file `artifacts/bsv-dex/src/lib/seedPhrase.ts`. I prefer clear and concise communication.

# System Architecture

## Monorepo Structure

The project is structured as a pnpm monorepo using TypeScript, comprising `artifacts/` for deployable applications, `lib/` for shared libraries, and `scripts/` for utilities.

## UI/UX Decisions

The platform incorporates specific coin color schemes, a 3-tab WalletConnectModal, dedicated AMM simulators for desktop and mobile, a Zustand and localStorage-based LP Position Store, TradingView integration using `lightweight-charts v5`, a clear demo mode indicator, and a full-screen quote currency selector. An Admin AI Intelligence Panel is provided for managing AI features.

## Technical Implementations

- **OrahDEX Native HD Wallet**: Supports BIP39 and BIP44/SLIP-0010 for multiple chains (EVM, BTC, BCH, BSV, SOL) using `@scure/bip32`, `@scure/bip39`, `@noble/curves`, `@noble/hashes`. Allows import via BIP39 seed phrase or EVM private key.
- **CopyVault**: Implements ERC4626-style vault accounting where `copyOrchestrator.ts` mirrors leader trades.
- **TRON Chain Support**: Extends `WalletNetwork` with TRON, integrates with `WalletConnectModal`, uses `useTronBalances` hook, and displays TRON assets in UI.
- **AMM Liquidity System**: Utilizes a standard `Δy = (Δx × (1−fee) × y) / (x + Δx × (1−fee))` formula with a defined `LP_FEE_RATIO` and `PROTOCOL_FEE_RATIO`. LP positions are managed via `useLiquidityStore` (Zustand).
- **Trade Engine**: Features a 5-phase execution path (Precheck, Build, Sign, Broadcast, Confirm) with latency tracking, canonical error handling, client/server route caching, and telemetry via `tradeMetrics.ts`.
- **Demo Account**: Activated via `/api/demo/activate` to seed virtual funds. API rejects non-demo addresses for real trading, and the UI provides specific demo wallet options.
- **OrderIntent Settlement Layer (BSV Core DEX v2)**: Introduces a canonical `OrderIntent` type for shared contract between wallet and server. It defines `fundingRef` semantics for various funding sources and enforces balance bucket isolation (`user_balances` for spot, `futures_margin_accounts` for futures). `fundingVerifier.ts` ensures invariant enforcement. `spotSettlement.ts` and `futuresSettlement.ts` handle respective trade settlements. New API endpoints for futures margin are included, alongside frontend wallet utilities for `OrderIntent` management.
- **EVM HTLC Atomic Settlement**: Utilizes the `OrahDEXHTLC.sol` Solidity contract for atomic swaps on Ethereum, Polygon, and BSC, supporting native ETH and ERC-20 tokens. A `evm_htlc_sessions` DB table tracks swap details, and `evmHtlc.ts` service manages session initiation, lock confirmation, and on-chain watching. API endpoints and frontend hooks (`useEvmHtlcSession`, `HTLCSettlementCard`) facilitate the user experience. The design ensures non-custodial operation for external wallets with asymmetric timelocks for security.
- **BSV HTLC Atomic Settlement**: Leverages `htlc.ts` for P2SH HTLC script building, `htlcWatcher.ts` for adaptive polling, and `spotSettlement.ts` for the full settlement pipeline. `/api/bridge` handles HTLC operations.
- **P2P + Atomic Swap**: Dedicated features with HTLC forms and protocol visualizers.
- **Price Engine**: Prioritizes Binance prices, falls back to `FALLBACK_PRICES`, and uses own-trade prices for unlisted coins. Supports user-selected quote currencies.

## Feature Specifications

The platform supports 958 markets (spot + perpetuals across 10 EVM chains + BSV/BTC/SOL/TRON) with 210 live price symbols. Trading features include various order types (Limit, Market, Stop-Limit, etc.), real-time order books, TradingView charts, and dynamic fee displays. Futures trading offers leverage, cross/isolated margin, live mark/index prices, and funding rates. EVM chain support for 10 chains is integrated throughout. Wallet Connect supports multiple BSV wallets and Reown AppKit for EVM. Balance guards prevent overdrafts. A push notification system is implemented. The Admin AI Intelligence panel offers model selection, prompt preview, insights, trade signals, and a chat tester. Ticker API provides comprehensive market data including `markPrice`, `indexPrice`, and `openInterest`. BSV price is live from a sovereign engine. OrahNFT is a social NFT marketplace (Instagram×Zora-style) where every post is a BSV inscription and a tradeable creator coin on bonding curves. Fiat on-ramp supports 6 providers (MoonPay, Transak, Banxa, Simplex, Ramp, Mercuryo) with Apple Pay, Google Pay, Card, and Bank Transfer.

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
- **External APIs/Services**: TronGrid API, WhatsOnChain, Binance, Mailgun, SendGrid, Postmark.

# Trade Logic Audit (2026-04-10)

## Spot Trading (Market + Limit)
- **Order flow**: `POST /orders` → `fundingVerifier.verifyAndLockFunding()` (locks balance) → insert order → matching loop (multi-fill, price-priority sorted) → `settleSpotFill()` per fill → ledger update → BSV broadcast (best-effort)
- **Balance bucket**: Spot orders use `user_balances` table (available/locked). FOR UPDATE row locks prevent double-spend.
- **Fee**: 0.1% (0.001) on both buyer and seller sides
- **Stop orders**: Trigger checked against current market price; converted to market order when triggered
- **Cross-chain**: HTLC generated for EVM↔BSV trades; EVM HTLC session for EVM↔EVM external wallets

## Futures Trading (Perpetuals)
- **Order flow**: `POST /futures/positions` → fundingVerifier (FUTURES kind → `futures_margin_accounts`) → `openFuturesPosition()` (locks margin, inserts position)
- **Margin**: `margin = (entryPrice × quantity) / leverage`. Isolated margin mode.
- **Liquidation price**: Long = `entry × (1 - 1/lev + 0.005)`, Short = `entry × (1 + 1/lev - 0.005)`. MMR = 0.5%
- **Close**: Atomic transaction — position locked FOR UPDATE, margin deducted from locked, returnedMargin (margin + PnL - fee) credited to available, position marked closed
- **Liquidation engine**: Runs every 60s, checks all open positions against live mark prices
- **Funding engine**: Runs every 8h, real positions only (no synthetic), platform retains 10% of funding payments

## Liquidity Provider-Awareness Fix
- Internal wallets (orah-wallet, demo, passkey, mobile-qr) don't have wagmi connectors and cannot sign via `@wagmi/core`
- `getLiquidityMode()` now accepts optional `provider` param — internal providers fall back to "simulated" mode instead of "live"/"on_chain"
- Both desktop `Liquidity.tsx` and mobile `MobileLiquidity.tsx` pass `walletProvider` to all `getLiquidityMode` calls
- External wallets (metamask, reown, trust, okx, coinbase, etc.) continue to use live/on-chain modes as before

## Prediction Trading (UP/DOWN)
- **Route**: `/prediction` (desktop and mobile)
- **API**: `GET /api/prediction/rounds/:symbol`, `POST /api/prediction/bet`, `POST /api/prediction/claim`, `GET /api/prediction/history/:wallet`
- **Mechanics**: 5-minute rounds, users predict if price goes UP or DOWN before lock (30s before close). Pool-based payout (total pool / winning side). Leverage 1x–100x.
- **Symbols**: BSV-USDT, BTC-USDT, ETH-USDT, BNB-USDT, SOL-USDT
- **Bet Amounts**: $5, $10, $25, $50, $100, $250, $500 (plus custom)
- **Demo**: Demo mode gated behind wallet connection — users must open wallet modal first, then choose Demo Account tab inside. No standalone demo buttons on any page.
- **State**: In-memory round management with historical seeding; rounds auto-advance on tick

## Mobile Navigation
- **Main tabs** (bottom bar): Markets, Trade, Futures, Mkt Hub, More
- **More drawer** (slide-up sheet): Prediction, NFT, Bridge, Copy Trade, P2P, Portfolio, Settings
- "More" tab highlights green when any sub-item is the active page

## Bug Fixed: Futures Close PnL Cap
- `closeFuturesPosition()` previously used `releaseFuturesMargin()` which capped credit at locked amount via `LEAST(locked, amount)` — profitable trades lost PnL above margin
- Fixed: now uses atomic transaction with raw SQL that deducts original margin from locked and credits full returnedMargin (including profit) to available
- Also fixed: position read + status check + margin update + position close all run on the same DB client inside one transaction (prevents double-close and ensures atomicity)