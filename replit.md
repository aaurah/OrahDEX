# OrahDEX

Unified sovereign multi-chain wallet + non-custodial exchange — users hold their own keys; trades settle on-chain via HTLC and Escrow contracts.

## Run & Operate

```bash
pnpm --filter @workspace/api-server run dev   # API on $PORT (default 8080)
pnpm --filter @workspace/bsv-dex run dev      # Frontend on $PORT (default 20180)
pnpm --filter @workspace/db run push          # Apply DB schema changes
pnpm --filter @workspace/db run migrate       # Run migrations
```

Required env vars: `ETH_RPC_URL`, `ETH_WS_URL`, `QUICKNODE_API_KEY`, `QUICKNODE_WEBHOOK_SECRET`, `EVM_WALLET_SECRET` (relayer key), `STRIPE_SECRET_KEY`, `SIMPLESWAP_API_KEY`, `LETSEXCHANGE_API_KEY`, `COINBASE_API_KEY/SECRET/PROJECT_ID`.

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
      admin.ts              — Admin panel + QuickNode Streams management endpoints
      evmSettlement.ts      — HTLC session routes
      quicknodeWebhook.ts   — POST /api/webhooks/quicknode (QN Streams receiver)
    lib/
      evmHtlc.ts            — EVM HTLC sessions, polling watcher, triggerEvmHtlcCheckByLockId
      escrowRelayer.ts      — OrahDEXEscrow contract relayer (release/cancel)
      quicknodeStreams.ts   — HMAC verification, QN REST API client, event topic constants
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
- **QuickNode Streams replaces polling**: `POST /api/webhooks/quicknode` receives HTLC `Locked`/`Revealed`/`Refunded` and Escrow `OrderReleased` events in real time. Polling watchers remain as fallback (belt-and-suspenders).
- **Self-healing worker engine** (`lib/selfHealing.ts`): all background services (price-updater, liquidity-bot, futures-funding/liquidation, bsv/evm-deposit-watchers) run via `guardedInterval()` — a drop-in replacement for `setInterval+_busy` that force-releases stuck locks after a per-service timeout, tracks consecutive failures with exponential skip-backoff, and reports per-service health to a central registry. `/api/health` returns structured status (healthy/degraded/stuck/dead) with 503 when any service is dead. An order reconciler auto-cancels orders stuck open >30 min every 5 min.
- **Webhook registered before express.json()**: Raw body buffer is required for HMAC-SHA256 signature verification (`x-qn-signature` header).
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

- **QuickNode Stream ID** (ETH mainnet, contract logs): `e9276e1b-f045-48be-a8dc-f8bc524d160d`
- Set `QUICKNODE_WEBHOOK_SECRET` to the secret used when the stream was created so HMAC verification passes.
- `triggerEvmHtlcCheckByLockId` is called from the webhook handler — it needs `notInArray` from drizzle-orm and `TERMINAL_STATUSES` const; both are in `evmHtlc.ts`.
- Admin QN stream endpoints live under `/api/admin/quicknode/…` (protected by `requireAdminToken`).
- esbuild bundles everything; TypeScript imports at the bottom of a file still work at runtime but tsc will reject them — keep all imports at file top.
- LetsExchange Partner ID: `1692`.
- EVM HTLC watcher polls every 30 s; QN Streams supplements it (not replaces).

## Pointers

- QuickNode Streams REST API: `https://api.quicknode.com/streams/rest/v1/streams` (auth: `x-api-key`)
- OrahDEX HTLC/Escrow contract: `0xeE234cEb85697b64800E696699b7841e00413B4f` (ETH mainnet)
- Sepolia Escrow: `0x4deb6023abD9E1C640aDa35201be8ff591d21cF2`
- WhatsOnChain BSV API: `https://api.whatsonchain.com/v1/bsv/main`
