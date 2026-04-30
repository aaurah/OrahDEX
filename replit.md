# Overview

This project is a pnpm workspace monorepo using TypeScript, designed to be a full-featured BSV (Bitcoin SV) DEX (Decentralized Exchange) platform. Its ambition is to rival established platforms like Binance, Poloniex, and Bitfinex by offering on-chain BSV settlement, advanced trading features, and multi-chain support. The platform aims to provide a robust and user-friendly experience for spot and futures trading, liquidity provision, and innovative features like on-chain copy trading and a native multi-chain HD wallet. Key capabilities include a native HD Wallet, CopyVault for on-chain copy trading, a comprehensive AMM Liquidity System, a sophisticated Trade Engine, multi-chain support (including TRON and various EVM networks), and an Admin AI Intelligence panel.

# User Preferences

I want iterative development and detailed explanations. Ask before making major changes. Do not make changes to the folder `lib/api-spec`. Do not make changes to the file `artifacts/bsv-dex/src/lib/seedPhrase.ts`. I prefer clear and concise communication.

# System Architecture

## Monorepo Structure

The project is structured as a pnpm monorepo using TypeScript, comprising `artifacts/` for deployable applications, `lib/` for shared libraries, and `scripts/` for utilities.

## UI/UX Decisions

The platform incorporates specific coin color schemes, a WalletConnectModal with real wallet connections only, dedicated AMM simulators for desktop and mobile, a Zustand and localStorage-based LP Position Store, TradingView integration using `lightweight-charts v5`, and a full-screen quote currency selector. An Admin AI Intelligence Panel is provided for managing AI features.

## Technical Implementations

- **OrahDEX Native HD Wallet**: Supports BIP39 and BIP44/SLIP-0010 for multiple chains (EVM, BTC/BSV/BCH, SOL) using `@scure/bip32`, `@scure/bip39`, `@noble/curves`, `@noble/hashes`. BTC, BSV, and BCH all derive from the same BIP44 path (`m/44'/0'/0'/0/0`) producing identical legacy P2PKH addresses ("1...") across all three Bitcoin forks. For Phantom wallet users, the hook detects Phantom's Bitcoin provider (`window.phantom.bitcoin`) and uses the user's real BTC address from Phantom for all three forks — ensuring the address displayed in OrahDEX matches what users see in their Phantom wallet. For other external EVM wallets (MetaMask, etc.), a server-generated custodial sub-account is created via `/api/user/bsv-wallet`. Allows import via BIP39 seed phrase or EVM private key.
- **Non-Custodial Balance Architecture**: External wallets (EVM/MetaMask, BSV, SOL) use on-chain RPC balance reads exclusively (`useEvmBalances` via `eth_getBalance`/`balanceOf`, `useBsvBalance` via WhatsOnChain polling every 30s). `useWalletStore.balance` is persisted only for non-EVM chains; EVM wallets always fall back to 0 before the RPC hook resolves. `useExchangeBalanceStore` (internal ledger + `applyFill`) is used solely for the Orah internal wallet path (`isOrahWallet = provider === "orah-wallet"`). Fills settle directly to the user's external wallet address — no internal crediting. `DepositModal.tsx` and `WithdrawModal.tsx` component files have been deleted; `ReceiveModal.tsx` replaced them with a pure wallet-address QR viewer.
- **Unified API Ledger Trading** (Orah wallet only): The Orah internal wallet uses the API ledger for balance tracking and order funding. Limit orders lock funds via `lockForOrder` (available → locked in `user_balances`). Balance auto-seeds on first trade. After each trade, balances are refreshed from the API.
- **CopyVault**: Implements ERC4626-style vault accounting where `copyOrchestrator.ts` mirrors leader trades.
- **TRON Chain Support**: Extends `WalletNetwork` with TRON, integrates with `WalletConnectModal`, uses `useTronBalances` hook, and displays TRON assets in UI.
- **AMM Liquidity System**: Utilizes a standard `Δy = (Δx × (1−fee) × y) / (x + Δx × (1−fee))` formula with a defined `LP_FEE_RATIO` and `PROTOCOL_FEE_RATIO`. LP positions are managed via `useLiquidityStore` (Zustand). OrahDEX native AMM contracts (`OrahPair.sol` ERC-20 LP token, `OrahFactory.sol` CREATE2 pair registry, `OrahRouter02.sol` liquidity router) are compiled via Hardhat in `artifacts/orahdex-contracts/` and **deployed on Sepolia testnet (2026-04-16)**:
  - Factory:  `0x8c6bdD68078Eb20b99dd8E644fF347013415220c`
  - Router:   `0x03EdB4b914A0D05E6Aee0a8389A90eE33c8f664a`
  - WETH:     `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`
  - Deployer: `0x67C7f23eE49B6417661748F23F743C0B274039e2`
  Frontend hooks: `useLpBalance.ts` reads on-chain LP token balance via raw `eth_call` (no deps). `orahAmmAddresses.ts` is the central registry of deployed addresses + inline ABI fragments. `OnChainLpBadge` in `Liquidity.tsx` shows real-time on-chain LP balance in the "My Positions" tab. `PositionEntry` extended with `lpTokenAddress` field. To add a new chain: run `pnpm --filter @workspace/orahdex-contracts deploy:<network>` and paste addresses into `orahAmmAddresses.ts`.
- **Trade Engine**: Features a 5-phase execution path (Precheck, Build, Sign, Broadcast, Confirm) with latency tracking, canonical error handling, client/server route caching, and telemetry via `tradeMetrics.ts`.
- **Prediction Trading**: Pool-based binary options (UP/DOWN) with 5-minute rounds, 1x–100x leverage, parimutuel payouts across 5 pairs (BSV/BTC/ETH/BNB/SOL). Full TradingView-style chart with 3-tab layout (Chart | Rounds | History). API at `/api/prediction/`. Admin management at `/admin/prediction`.
- **OrderIntent Settlement Layer (BSV Core DEX v2)**: Introduces a canonical `OrderIntent` type for shared contract between wallet and server. It defines `fundingRef` semantics for various funding sources and enforces balance bucket isolation (`user_balances` for spot, `futures_margin_accounts` for futures). `fundingVerifier.ts` ensures invariant enforcement. `spotSettlement.ts` and `futuresSettlement.ts` handle respective trade settlements. New API endpoints for futures margin are included, alongside frontend wallet utilities for `OrderIntent` management.
- **EVM HTLC Atomic Settlement**: Utilizes the `OrahDEXHTLC.sol` Solidity contract for atomic swaps on Ethereum, Polygon, and BSC, supporting native ETH and ERC-20 tokens. A `evm_htlc_sessions` DB table tracks swap details, and `evmHtlc.ts` service manages session initiation, lock confirmation, and on-chain watching. API endpoints and frontend hooks (`useEvmHtlcSession`, `HTLCSettlementCard`) facilitate the user experience. The design ensures non-custodial operation for external wallets with asymmetric timelocks for security.
- **BSV HTLC Atomic Settlement**: Leverages `htlc.ts` for P2SH HTLC script building, `htlcWatcher.ts` for adaptive polling, and `spotSettlement.ts` for the full settlement pipeline. `/api/bridge` handles HTLC operations.
- **BSV Testnet Support**: All BSV network parameters (version bytes, WoC API base URL, block explorer, address regex, fee policy) are centralized in `artifacts/api-server/src/lib/bsvNetworkConfig.ts`. Set `BSV_NETWORK=test` environment variable to switch the entire backend to BSV testnet (WoC `/v1/bsv/test/` endpoints, testnet version bytes `0x6f`/`0xc4`/`0xef`, `test.whatsonchain.com` explorer). A "Bitcoin SV Testnet" entry is available in the frontend chain switcher (yellow icon). The `GET /api/bsv/network-info` endpoint exposes the active network config to clients. No other files hardcode `/bsv/main/` URLs — they all import from `bsvNetworkConfig.ts`.
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
- **External APIs/Services**: TronGrid API, WhatsOnChain, Binance, Mailgun, SendGrid, Postmark, LetsExchange.

## LetsExchange Cross-Chain Integration
- **Partner ID / Affiliate ID**: `1692` (decoded from JWT `data.id` field at startup in `letsexchange.ts`)
- **API Key**: standard affiliate JWT key stored in `LETSEXCHANGE_API_KEY` secret
- **Working endpoints** (no enterprise upgrade needed):
  - `GET  /api/v2/coins` → coin list (1,055+ coins with networks, min/max amounts, extra_id flag)
  - `POST /api/v1/info` → live rate + min/max + `rate_id` + `rate_id_expired_at` (for fixed-rate flow)
  - `POST /api/v1/transaction` → create exchange order → returns `transaction_id`, `deposit` address, `deposit_extra_id`
  - `GET  /api/v1/transaction/{id}` → full order details + live status + tx hashes
- **Key field names** (v1 API, not what we had initially guessed):
  - Create request: `withdrawal` (not `withdrawal_address`), `withdrawal_extra_id` must always be sent (even `""`), `affiliate_id` required
  - Create response: `transaction_id` (not `id`), `deposit` (not `deposit_address`), `withdrawal` (not `withdrawal_address`)
  - Status values: `wait`, `confirmation`, `confirmed`, `exchanging`, `sending`, `finished`, `failed`, `overdue`, `refunded`
- **Fixed-rate flow**: `POST /v1/info` returns `rate_id` + expiry timestamp → pass `rate_id` to `POST /v1/transaction` for locked rate
- **Proxy routes**: `artifacts/api-server/src/routes/letsexchange.ts`
- **Frontend**: `artifacts/bsv-dex/src/components/LetsExchangePanel.tsx` — native 3-step UI (amount → address → deposit/QR/tracking), no external redirects. Accepts `initialFrom`/`initialTo` props to pre-select coins.
- **Orderbook fallback integration** (2026-04-30):
  - `artifacts/bsv-dex/src/hooks/useLetsExchangeCoins.ts` — singleton hook, fetches LE coins once, exposes `getCoin(sym)` / `isLECoin(sym)`
  - `artifacts/bsv-dex/src/hooks/useLetsExchangeRate.ts` — per-pair live rate hook polling every 10s from `/api/letsexchange/estimate`
  - `artifacts/bsv-dex/src/hooks/useLetsExchangePairs.ts` — fetches server-provided LE pairs (`GET /api/letsexchange/pairs`); supports `quote` filter or `all:true`
  - `OrderBook.tsx` — shows a yellow "Cross-chain rate ⚡LE →" card at the spread when LE rate available; clicking scrolls to LetsExchangePanel pre-filled with current pair
  - `Spot.tsx` — merges server-provided LE pairs (10,494 pairs; ~1,053 coins × 10 quotes: BSV/BTC/ETH/USDT/BNB/SOL/XRP/TRX/DOGE/LTC) into the pair selector with `⚡LE` badge; shows no-liquidity fallback banner above order form; `LetsExchangePanel` always pre-seeded with current pair's base/quote
  - **API endpoint** `GET /api/letsexchange/pairs` — builds all LE pairs server-side from coin list; supports `?quote=BSV` filter and `?all=true`; cached 10 min

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

## Liquidity Balance Source Fix (Non-EVM Wallets)
- **Bug**: `useEvmBalances` hook only fetches on-chain EVM balances; internal wallets (demo/BSV/orah-wallet/passkey/mobile-qr) returned empty balances causing "Insufficient balance" on every deposit
- **Fix**: Added `useBackendBalances` hook that fetches from `/api/portfolio` endpoint (returns `balances[]` with `asset`, `available`, `price` fields)
- Balance source selection uses `walletProvider` (not just `network`/address prefix): `INTERNAL_PROVIDERS = ["demo", "orah-wallet", "passkey", "mobile-qr"]` → use backend balances; external EVM wallets → use on-chain EVM balances
- Simulated deposit mode now calls `POST /api/liquidity` to properly deduct balances server-side (was previously local-only simulation)
- Backend returns 422 with specific error on insufficient funds; frontend shows proper toast

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

## Mobile Loading Fix (2026-04-18)
Three issues combined to prevent the app loading on mobile Safari (orahdex.org):
1. **manualChunks in vite.config.ts** forced Rolldown to statically import 4.4MB of JS (modals 2.8MB + pages-mobile 826KB + pages-admin 792KB) from the entry chunk — removed entirely, letting Rolldown auto-split.
2. **AdminLayout and MobileLayout** were statically imported in App.tsx, pulling in all admin navigation icons at startup — converted to `lazy()` imports with Suspense wrappers.
3. **`Buffer` global missing in mobile Safari** — crypto and wallet libraries (WalletConnect, secp256k1, bip39) assume Node.js `Buffer` exists. Fixed by adding `src/polyfills.ts` (using the `buffer` npm package) imported as the very first line of `main.tsx`. Also polyfills `global` and `process`.
Result: startup JS reduced from 4.4MB to ~570KB (87% smaller). App now loads correctly on mobile.

## Exchange Revenue & Fee System (2026-04-17)
- **`artifacts/api-server/src/lib/feeCollector.ts`** — Central fee accumulation library. `recordPlatformFee(source, amount, asset)` inserts into `keeper_earnings` table under wallet `EXCHANGE_TREASURY`. All routes call this after successful fee events.
- **Fee sources wired**: `swap.ts` (0.3% on output), `orders.ts` (0.1% on fill total), `copyTrading.ts` (10% of vault performance fee)
- **`GET /api/revenue`** — Aggregated platform revenue by source (swap, orderbook, copy_trade, lp_spread, p2p, withdrawal) across 24h / 7d / 30d / all-time periods
- **`GET /api/fee-schedule`** — Public fee tier table (Standard / Silver / Gold / Platinum based on 30d volume)
- **Frontend `/fees` page** (`artifacts/bsv-dex/src/pages/Revenue.tsx`) — Live revenue dashboard + full fee schedule. Accessible from nav sidebar ("Fees" link). Available on both desktop and mobile routes.