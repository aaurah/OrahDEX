# OrahDEX

Unified sovereign multi-chain wallet + non-custodial exchange — users hold their own keys; trades settle on-chain via HTLC and Escrow contracts.

## Run & Operate

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev   # API on port 8080
PORT=20180 pnpm --filter @workspace/bsv-dex run dev     # Frontend on port 20180
```

Workflows are configured: **"API Server"** (port 8080, console) and **"OrahDEX Frontend"** (port 20180, webview).

DB schema: Apply with `sed 's/--> statement-breakpoint/;/g' lib/db/drizzle/0000_noisy_wilson_fisk.sql | psql $DATABASE_URL` (drizzle-kit push requires TTY). Also create `internal_bsv_wallets` via raw SQL (see `lib/internalBsvWallet.ts`).

Required env vars: `ETH_RPC_URL`, `ETH_WS_URL`, `EVM_WALLET_SECRET` (relayer key), `STRIPE_SECRET_KEY`, `SIMPLESWAP_API_KEY`, `LETSEXCHANGE_API_KEY`, `COINBASE_API_KEY/SECRET/PROJECT_ID`. AI image gen uses Replit AI Integration (auto-provisioned: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`).

## Stack

- **Runtime**: Node.js 20, esbuild bundler
- **API**: Express 5, Drizzle ORM, PostgreSQL (Replit DB)
- **Frontend**: React 18, Vite 8, TailwindCSS, Zustand, TanStack Query, Wouter
- **Wallet**: wagmi v3 + Reown AppKit; @scure/bip32/bip39; @noble/hashes/curves
- **EVM**: viem ^2.47.6 (public + wallet clients)
- **Validation**: Zod + drizzle-zod

## Where things live

```
artifacts/
  api-server/src/
    app.ts                  — Express setup, middleware order, background service startup
    routes/
      index.ts              — Main router (all /api/* routes)
      admin.ts              — Admin panel endpoints
      evmSettlement.ts      — HTLC session routes
    lib/
      evmHtlc.ts            — EVM HTLC sessions, polling watcher
      escrowRelayer.ts      — OrahDEXEscrow contract relayer (release/cancel)
      evmDepositWatcher.ts  — Fallback 90 s polling for native-token deposits
      htlcWatcher.ts        — BSV HTLC adaptive polling watcher
  bsv-dex/src/
    pages/mobile/MobileTrade.tsx  — Main trade UI (non-custodial banners, order flow)
    components/trading/OrderForm.tsx
lib/
  db/src/schema/            — Drizzle schema files (source of truth); index.ts re-exports all
  db/src/schema/staking.ts  — staking_positions table
```

## Architecture decisions

- **Non-custodial first**: EVM self-custody wallets read on-chain balances via viem; internal Orah wallets use API ledger. `usesApiBalance = isOrahWallet && !isEvm`.
- **Polling-based event detection**: EVM HTLC polling watcher runs every 30 s to detect `Locked`/`Revealed`/`Refunded` and Escrow `OrderReleased` events on-chain.
- **Self-healing worker engine** (`lib/selfHealing.ts`): all background services (price-updater, liquidity-bot, futures-funding/liquidation, bsv/evm-deposit-watchers) run via `guardedInterval()` — a drop-in replacement for `setInterval+_busy` that force-releases stuck locks after a per-service timeout, tracks consecutive failures with exponential skip-backoff, and reports per-service health to a central registry. `/api/health` returns structured status (healthy/degraded/stuck/dead) with 503 when any service is dead. An order reconciler auto-cancels orders stuck open >30 min every 5 min.
- **Webhook registered before express.json()**: Stripe webhook at `/api/stripe/webhook` requires raw body buffer for HMAC-SHA256 signature verification.
- **HTLC + Escrow share one contract address** on ETH mainnet: `0xeE234cEb85697b64800E696699b7841e00413B4f`.
- **Order funding refs**: `evm-sig:` or `evm-balance:` prefix → skip internal ledger settlement; `bothEvmExternal` path emits `settlement_pending` instead.
- **Stripe webhook** also registered before express.json() (separate route at `/api/stripe/webhook`).

## Product

- Spot + perpetuals trading across 958 markets (10 EVM chains + BSV/BTC/SOL/TRON)
- EVM HTLC atomic swaps (seller + buyer lock → relayer reveals both)
- OrahDEXEscrow for open-order collateral locking
- BSV HTLC cross-chain settlement
- CopyVault ERC4626-style copy trading
- AMM liquidity pools (OrahPair/Factory/Router on Sepolia)
- Native HD wallet (BIP39/44: EVM, BTC, BSV, SOL, XRP, LTC, DOGE)
- Fiat on-ramp via Stripe → LetsExchange / SimpleSwap
- Social NFT marketplace (BSV inscriptions)
- **Staking Hub** (`/staking`): 43 PoS coins, 10 external providers (Lido, Everstake, Validatrium, Ankr, Chorus One, Rocket Pool, Marinade, Stakefish, Figment, P2P.org) with deep-link staking URLs; OrahDEX-native fixed-APY staking with lock periods (30/60/90/180d bonus rates) backed by `staking_positions` DB table
- Admin panel with AI intelligence, routing profiles, fee management

## User preferences

- Iterative development; ask before sweeping refactors.
- Do not modify `lib/api-spec` folder.
- `artifacts/bsv-dex/src/lib/seedPhrase.ts` is safe to modify (XRP/LTC/DOGE derivation added).
- Clear and concise communication.

## Recent Fixes (2026-05-06 — Admin/Portfolio/Wallet Audit)

- **Admin panel — orphaned `CexConnections` page** (`App.tsx`, `AdminLayout.tsx`): `pages/admin/CexConnections.tsx` (CEX API key management, 581 lines) exported `AdminCexConnections` but had no route and no nav item — completely unreachable. Added lazy import, `/admin/cex-connections` route, and "CEX Connections" nav entry in the AI Intelligence section. Also imported `Link2` icon into `AdminLayout.tsx`.
- **Portfolio — multi-address balance gap** (`Portfolio.tsx`): Portfolio only showed balances for the currently active network. Added `useEvmBalances` hook call for `internalEvmAddress` (non-EVM users' provisioned EVM sub-account on ETH mainnet) and `fetchBsvBalance` for `internalBsvAddress` (non-BSV users' BSV sub-account). All internal rows are merged after primary balances, de-duplicated by symbol (primary wins). Also wired refresh button to trigger `intEvmRefresh()` and `refreshIntBsvBalance()`.
- **Portfolio — WithdrawSheet wrong address**: `walletAddress` and `defaultRecipient` were always passed `address` (current active) regardless of asset chain. Added `addressForAssetNetwork(assetNetwork)` helper that resolves to `internalBsvAddress` for BSV assets, `internalEvmAddress` for EVM assets, `internalTronAddress` for TRON, falling back to connected address when internal is not yet provisioned.
- **Portfolio — hardcoded zero stats**: "Open Spot Orders" showed static `0`. Replaced with a live `useQuery` fetching `/api/orders?walletAddress=…&status=open` for all known addresses (primary + internal), de-duplicating by order ID. "Futures Positions" (also static 0) replaced with "Tracked Assets" showing `nonZero.length` — a meaningful live count.
- **Liquidity routing audit** (no change needed): Confirmed `hasRealOB` → order mode (internal DEX) / no OB → auto-switches to LE swap mode is correct. `hybridRouter.ts` properly simulates VWAP fills against real non-synthetic orders before routing to LE.
- **Double mutation handlers** (`OrderForm.tsx`): previously fixed — `placeOrder.mutate(...)` inline callbacks removed; consolidated into single `usePlaceOrder` handler.
- **Auth message symbol normalization** (`orders.ts`): previously fixed — `buildOrderAuthMessage` uses normalized `symbol` (slashes) not raw `body.symbol` (dashes).

## Gotchas

- esbuild bundles everything; TypeScript imports at the bottom of a file still work at runtime but tsc will reject them — keep all imports at file top.
- LetsExchange Partner ID: `1692`.
- EVM HTLC watcher polls every 30 s for on-chain events.
- DB schema must be applied before first run: `pnpm --filter @workspace/db run push-force` (requires TTY) or run `node -e "..."` migration script — migration SQL is at `lib/db/drizzle/0000_noisy_wilson_fisk.sql`.
- LE/SimpleSwap/Stripe routes return errors gracefully when API keys are missing; native AMM path still works without them.
- Stripe apiVersion pinned to `"2025-03-31.basil"` in both `stripeClient.ts` and `webhookHandlers.ts` — keep in sync.
- `LE_COIN_NETWORK` map lives in `src/lib/leCoinNetwork.ts` (single source-of-truth); both `stripeCheckout.ts` and `webhookHandlers.ts` import from there.
- Fallback price self-call in `stripeCheckout.ts` uses `http://127.0.0.1:${PORT ?? 8080}` with a 5 s timeout — not `localhost`.

## Pointers

- OrahDEX HTLC/Escrow contract: `0xeE234cEb85697b64800E696699b7841e00413B4f` (ETH mainnet)
- Sepolia Escrow: `0x4deb6023abD9E1C640aDa35201be8ff591d21cF2`
- WhatsOnChain BSV API: `https://api.whatsonchain.com/v1/bsv/main`
