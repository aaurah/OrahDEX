# Workspace

## Overview

pnpm workspace monorepo using TypeScript. A full-featured BSV (Bitcoin SV) DEX (Decentralized Exchange) platform comparable to Binance, Poloniex, and Bitfinex with on-chain BSV settlement.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, TailwindCSS, TanStack React Query, Wouter
- **Charts**: lightweight-charts v5 (TradingView library)
- **State**: Zustand (wallet connection state)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (BSV DEX backend)
│   ├── bsv-dex/            # React + Vite frontend (DEX UI)
│   └── aura-dex-mobile/    # Expo React Native mobile app (iOS/Android)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seedDex.ts      # Seeds 13 BSV DEX markets into DB
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## BSV DEX Features

### Markets
- 10 spot markets: BSV/USDT, BTC/USDT, ETH/USDT, TOKEN/USDT, SOL/USDT, XRP/USDT, BNB/USDT, ADA/USDT, BSV/BTC, TOKEN/BSV
- 3 futures/perp markets: BSV/USDT-PERP, BTC/USDT-PERP, ETH/USDT-PERP

### Pages
- `/` — Markets overview with all trading pairs, prices, 24h change%, volume
- `/trade/:symbol` — Spot trading (chart + order book + order form + recent trades)
- `/futures/:symbol` — Futures trading with leverage (1x-125x), cross/isolated margin
- `/portfolio` — Asset balances, PnL, transaction history (requires wallet)

### Wallet Connect
- HandCash, RelayX, Twetch, Panda Wallet, Yours Wallet, Sensilet
- Connect Wallet modal in navbar
- BSV address display and disconnect

### Trading Features (Spot)
- Order types: Limit, Market, Stop-Limit, Take Profit, OCO
- Real-time order book (bids red, asks green, depth bars)
- TradingView-style candlestick charts with interval switcher
- Market trades ticker
- Open orders / order history / trade history panel

### Futures Features
- Leverage slider (1x to 125x)
- Cross / Isolated margin modes
- Mark price, index price, funding rate display
- Positions panel with unrealized PnL

## API Endpoints

All under `/api`:
- `GET /healthz` — health check
- `GET /markets` — all markets
- `GET /markets/:symbol` — single market
- `GET /markets/:symbol/ticker` — 24h ticker
- `GET /markets/:symbol/candles?interval=1h&limit=200` — OHLCV data
- `GET /markets/:symbol/orderbook?depth=50` — order book
- `GET /markets/:symbol/trades` — recent trades
- `POST /orders` — place order
- `GET /orders?walletAddress=xxx` — user orders
- `DELETE /orders/:id` — cancel order
- `GET /trades/history?walletAddress=xxx` — trade history
- `GET /portfolio?walletAddress=xxx` — portfolio
- `POST /wallet/connect` — connect wallet
- `GET /wallet/transactions?walletAddress=xxx` — on-chain txs
- `GET /futures/positions?walletAddress=xxx` — positions
- `POST /futures/positions` — open position
- `DELETE /futures/positions/:id` — close position
- `GET /futures/funding-rates` — funding rates

## Database Schema

Tables: `markets`, `orders`, `trades`, `futures_positions`, `candles`

Seed: `pnpm --filter @workspace/scripts run seedDex`

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all lib packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- `emitDeclarationOnly` — only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/bsv-dex` (`@workspace/bsv-dex`)
React + Vite DEX frontend. Routes via Wouter, API via `@workspace/api-client-react` hooks, state via Zustand.

**Wallet connectivity:**
- Custom multi-chain modal (BSV/EVM/SOL/BTC) — `WalletConnectModal.tsx`
- **Reown AppKit** (WalletConnect v2) — `@reown/appkit` + `@reown/appkit-adapter-wagmi` — initialized in `main.tsx` with `WagmiProvider`, project ID from `VITE_REOWN_PROJECT_ID` secret
- `ReownConnectButton.tsx` — standalone button shown in navbar and admin header
- Reown tab added to wallet connect modal (first tab, opens AppKit modal with 500+ wallets)
- Account sync: `App.tsx` polls until Reown is ready then subscribes to account changes → syncs to `useWalletStore`
- Supported EVM networks: Ethereum, Polygon, Arbitrum, Optimism, Base, BNB Chain, Avalanche, Linea, zkSync, Scroll, Mantle, Fantom, Cronos
- `pnpm --filter @workspace/bsv-dex run dev` — dev server

**EVM wallet flow (end-to-end):**
- `accountsChanged` / `chainChanged` event listeners in `App.tsx` — UI stays in sync when user switches MetaMask account or network
- `lib/reown.ts` exports: `checkAllowance(token, owner, spender, chainId)`, `approveToken(...)`, `pollTxReceipt(...)`, `getBlockNumber(...)`, `fetchErc20Balance(...)`
- `OrderForm.tsx` EVM sell flow: Step 1 = check ERC-20 allowance → Step 2 = `approve(router, maxUint256)` if insufficient → Step 3 = `personal_sign` order intent → Step 4 = submit
- `useWalletStore` extended with `pendingTxs: PendingTx[]` + `addPendingTx / updateTx / removeTx`
- `getTxExplorerUrl(hash, chainId)` maps to correct block explorer per chain
- `useTxTracker` hook (mounted at app root) polls `eth_getTransactionReceipt` for all pending txs every 4s; on confirmation: updates status + refreshes native balance
- `TxStatusBar` component (fixed bottom-right): shows in-flight/confirmed/failed txs with hash, explorer link, confirmation count; auto-renders from `pendingTxs` store

**P2P + Atomic Swap:**
- P2P page has top-level tab: "P2P Trades" | "Atomic Swap"
- Atomic Swap tab: HTLC form (from/to coin picker, amount input, live rate), 4-step protocol visualizer, animated HTLC execution, BSV settlement badge

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API server. Routes in `src/routes/`. Uses `@workspace/db` for DB and `@workspace/api-zod` for validation.
- Mock data generators in `src/lib/mockData.ts` for order books, candles, trades
- `pnpm --filter @workspace/api-server run dev` — dev server

**Email / SMTP System:**
- `src/lib/mailer.ts` — `sendMail()`, `testSmtpConnection()`, `getSmtpStatus()` via Nodemailer
- SMTP config read from `platform_settings` table: `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from`
- `GET  /api/admin/mail/smtp-status` — returns `{ configured, host, from }` (must be before `/:id` in route order)
- `POST /api/admin/mail/test-smtp` — verifies SMTP connection; returns `{ success, error? }`
- `POST /api/admin/mail` — saves email to DB; if `folder=sent` also attempts real SMTP delivery; returns `smtpSent`, `smtpError`
- `POST /api/webhook/email-inbound` — inbound webhook compatible with Mailgun, SendGrid, Postmark; normalises fields and inserts to `inbox` folder
- Admin email inbox UI (`/admin/mail`) shows SMTP status banner, "Test" button, copyable webhook URL in sidebar

### `lib/db` (`@workspace/db`)
Database layer using Drizzle ORM.
- `pnpm --filter @workspace/db run push` — push schema changes
- `pnpm --filter @workspace/db run push-force` — force push

### `lib/api-spec` (`@workspace/api-spec`)
OpenAPI 3.1 spec for the entire DEX API. Run codegen:
`pnpm --filter @workspace/api-spec run codegen`
