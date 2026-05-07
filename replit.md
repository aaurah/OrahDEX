# OrahDEX

Unified sovereign multi-chain wallet + non-custodial exchange — users hold their own keys; trades settle on-chain via HTLC and Escrow contracts.

## Run & Operate

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev   # API on port 8080
PORT=20180 pnpm --filter @workspace/bsv-dex run dev     # Frontend on port 20180
```

Workflows are configured: **"API Server"** (port 8080, console) and **"OrahDEX Frontend"** (port 20180, webview).

DB schema: Apply with `sed 's/--> statement-breakpoint/;/g' lib/db/drizzle/0000_noisy_wilson_fisk.sql | psql $DATABASE_URL` (drizzle-kit push requires TTY). Also create `internal_bsv_wallets` via raw SQL (see `lib/internalBsvWallet.ts`).

Required env vars:
- `EVM_WALLET_SECRET` — relayer private key
- `STRIPE_SECRET_KEY`, `SIMPLESWAP_API_KEY`, `LETSEXCHANGE_API_KEY`
- `COINBASE_API_KEY/SECRET/PROJECT_ID`

Optional RPC env vars (all fall back to public nodes if unset):
- `ETH_RPC_URL`, `ETH_WS_URL` — Ethereum mainnet
- `SEPOLIA_RPC_URL`, `BASE_RPC_URL`, `ARB_RPC_URL`, `OP_RPC_URL`
- `BSC_RPC_URL`, `POLYGON_RPC_URL`, `AVAX_RPC_URL`

Optional webhook env vars:
- `EVM_WEBHOOK_SECRET` — HMAC secret for `/api/webhooks/evm` payload verification
- `EVM_WATCHED_CONTRACTS` — comma-separated extra contract addresses to watch

AI image gen uses Replit AI Integration (auto-provisioned: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`).

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
      admin.ts              — Admin panel + EVM webhook/RPC config info endpoints
      evmSettlement.ts      — HTLC session routes
      evmWebhookRouter.ts   — POST /api/webhooks/evm (provider-agnostic EVM log receiver)
    lib/
      evmHtlc.ts            — EVM HTLC sessions, polling watcher, triggerEvmHtlcCheckByLockId
      escrowRelayer.ts      — OrahDEXEscrow contract relayer (release/cancel)
      evmWebhook.ts         — HMAC verification, event topic constants, log extraction
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
- **Provider-agnostic EVM webhook**: `POST /api/webhooks/evm` receives HTLC `Locked`/`Revealed`/`Refunded` and Escrow `OrderReleased` events in real time. Compatible with Alchemy Notify, Infura, Tenderly, self-hosted relays, or any provider posting the standard EVM log format. The legacy `/api/webhooks/quicknode` path is kept as an alias. Polling watchers remain as fallback (belt-and-suspenders). No QuickNode SDK or API key required.
- **Self-healing worker engine** (`lib/selfHealing.ts`): all background services run via `guardedInterval()` — force-releases stuck locks, tracks consecutive failures with exponential skip-backoff, reports per-service health to a central registry. `/api/health` returns structured status (healthy/degraded/stuck/dead) with 503 when dead. An order reconciler auto-cancels orders stuck open >30 min every 5 min. Services that have never run yet correctly show "healthy" (pending first run) rather than "dead".
- **Data-integrity reconcilers** (`lib/selfHealingReconcilers.ts`): five additional guardedInterval services — `le-status-sync` (re-checks non-terminal LE swaps every 10min), `ghost-order-detector` (flags processing/settlement_pending orders >2h), `stripe-le-reconciler` (flags LE swaps stuck in 'waiting' >30min), `db-watchdog` (pings DB every 2min, alerts on slow queries), `price-watchdog` (fires alerts if price engine is dead/stuck).
- **Alert bus** (`lib/alertBus.ts`): in-memory ring buffer (500 events) + DB persistence for critical/high alerts. `emit(severity, category, message)` with 5-min dedup. Categories: rpc/le/stripe/db/webhook/reconciler/admin/order/price/system. Hydrated from DB on startup. Exposed via `/api/admin/alerts` and `/api/admin/alerts/summary`.
- **Subsystem probe** (`lib/subsystemProbe.ts`): active external health probes — 8 EVM RPC chains, LetsExchange API, Stripe API, BSV/WoC, DB latency, price engine freshness, webhook HMAC config, LE pairs count. Used by `/api/admin/diagnostics` and `/api/admin/diagnostics/rpc`.
- **Webhook registered before express.json()**: Raw body buffer is required for HMAC-SHA256 signature verification (`x-webhook-signature` or `x-qn-signature` headers both accepted).
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

## Gotchas

- `triggerEvmHtlcCheckByLockId` is called from the webhook handler — it needs `notInArray` from drizzle-orm and `TERMINAL_STATUSES` const; both are in `evmHtlc.ts`.
- Admin EVM endpoints: `/api/admin/evm/topics`, `/api/admin/evm/rpc-config`, `/api/admin/evm/webhook-info`, `/api/admin/evm/filter-fn` (all protected by `requireAdminToken`). Legacy `/api/admin/quicknode/…` paths also work.
- esbuild bundles everything; TypeScript imports at the bottom of a file still work at runtime but tsc will reject them — keep all imports at file top.
- LetsExchange Partner ID: `1692`.
- EVM HTLC watcher polls every 30 s; webhook supplements it (not replaces).
- DB schema must be applied before first run: `pnpm --filter @workspace/db run push-force` (requires TTY) or run `node -e "..."` migration script — migration SQL is at `lib/db/drizzle/0000_noisy_wilson_fisk.sql`.
- LE/SimpleSwap/Stripe routes return errors gracefully when API keys are missing; native AMM path still works without them.
- Stripe apiVersion pinned to `"2025-03-31.basil"` in both `stripeClient.ts` and `webhookHandlers.ts` — keep in sync.
- `LE_COIN_NETWORK` map lives in `src/lib/leCoinNetwork.ts` (single source-of-truth); both `stripeCheckout.ts` and `webhookHandlers.ts` import from there.
- Fallback price self-call in `stripeCheckout.ts` uses `http://127.0.0.1:${PORT ?? 8080}` with a 5 s timeout — not `localhost`.
- `EVM_WEBHOOK_SECRET` is the new canonical env var; `QUICKNODE_WEBHOOK_SECRET` is still accepted as a fallback so existing deployments don't break.

## Pointers

- OrahDEX HTLC/Escrow contract: `0xeE234cEb85697b64800E696699b7841e00413B4f` (ETH mainnet)
- Sepolia Escrow: `0x4deb6023abD9E1C640aDa35201be8ff591d21cF2`
- WhatsOnChain BSV API: `https://api.whatsonchain.com/v1/bsv/main`
- EVM webhook docs: register `POST /api/webhooks/evm` with your provider; set `EVM_WEBHOOK_SECRET` to the shared HMAC secret
