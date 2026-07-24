# OrahDEX — The Universal Multi-Chain DEX

OrahDEX is a sovereign, permissionless, multi-chain trading protocol. Users hold their own keys at all times. Trades settle on-chain via HTLC atomic swaps and EVM escrow contracts — **OrahDEX never holds your funds**.

Live at **[orahdex.org](https://orahdex.org)**

---

## What OrahDEX Connects

| Layer | Coverage |
|---|---|
| **DEX Aggregators** | LI.FI → 36 aggregators (1inch, Uniswap, SushiSwap, KyberSwap, OKX, Paraswap, Aerodrome, …) |
| **Cross-Chain Bridges** | LI.FI → 34 bridges (Across, Stargate, Hop, Connext, Near, …) |
| **EVM Chains** | 69 chains via LI.FI + ETH, Base, Arbitrum, Optimism, BNB, Polygon, Avalanche natively |
| **Custodial Swap Venues** | LetsExchange, SimpleSwap, ChangeNOW, StealthEX, Changelly, Swapzone |
| **Futures** | Hyperliquid — 931 coins, real-time WebSocket feed (~150 ms), mark price, OI, funding |
| **Settlement Layer** | Bitcoin SV (BSV) — immutable OP_RETURN proofs for every trade |
| **Wallets** | EVM (Reown/WalletConnect), BSV, TRON, HandCash, Solana, Bitcoin |

---

## Core Features

### Universal Swap Router
Every swap quote fires custodial venues **and** LI.FI in parallel and returns both:
- **Custodial quote** — instant swap, deposit-address model (LetsExchange, SimpleSwap, StealthEX, ChangeNOW, Changelly, Swapzone)
- **Onchain quote** — non-custodial, user signs the transaction; settles directly via DeFi (powered by LI.FI — 69 chains, 34 bridges, 36 exchanges, no API key required)

In live testing LI.FI on-chain rates beat custodial rates by ~1% on ETH/USDC.

### Genesis Liquidity Engine (Virtual AMM)
Proprietary linear bonding curve that makes every listed asset instantly tradeable with no initial liquidity provider required and no impermanent loss.

### Perpetual Futures
- 931 perpetual markets via Hyperliquid
- Real-time WebSocket price feed at ~150 ms latency (REST fallback)
- Mark price, open interest (USD), funding rates, liquidation engine
- Up to 100× leverage

### Spot Orderbook
- 36,000+ trading pairs across EVM, TRON, and BSV
- Limit, market, stop, and advanced conditional orders
- On-chain orderbook with BSV OP_RETURN settlement proofs

### Cross-Chain Bridge (HTLC)
- Trustless atomic swaps via Hash Time-Locked Contracts
- BTC / BSV / BCH / EVM / TRON chains
- Funds never custodied — contract enforces atomic settlement

### LI.FI Integration
```
GET /api/lifi/quote?from=ETH&to=USDC&amount=1        — best route + wallet-signable tx
GET /api/lifi/routes?from=USDC&to=ETH&amount=100     — up to 10 ranked alternatives
GET /api/lifi/chains                                  — 69 supported chains
GET /api/lifi/tokens?chain=arb                        — 1,252+ tokens per chain
GET /api/lifi/status?txHash=0x...&fromChainId=1       — post-swap tx tracking
GET /api/lifi/supported?from=WBTC&to=AVAX             — quick pair coverage check
```

### CopyVault
On-chain copy trading — followers mirror leader positions with configurable allocation. Every execution recorded as a BSV OP_RETURN proof.

### P2P Market
Peer-to-peer fiat ↔ crypto trading with escrow-based settlement and dispute resolution.

### OrahNFT
Social NFT marketplace — posts are BSV inscriptions permanently anchored on-chain. Tradeable creator coins for each profile.

### Ora AI
Integrated intelligence layer — GPT-4 market analysis, real-time trade signals, portfolio coaching, and DALL-E image generation for OrahNFT content.

### Multichain Wallet
- EVM: Reown AppKit (WalletConnect v3), wagmi, viem — 69+ chains
- BSV: native bip32/bip39 key derivation
- TRON: BIP44 path `m/44'/195'/0'/0/0` + keccak256
- HandCash: OAuth flow for $handle-based BSV payments
- Solana & Bitcoin: via Reown adapter

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Radix UI, Zustand, TanStack Query |
| **Backend** | Node.js 20, Express 5, TypeScript, esbuild |
| **Database** | PostgreSQL via Drizzle ORM (Replit managed) |
| **EVM** | viem 2.x, wagmi v3, Reown AppKit (WalletConnect v3), Hardhat/Solidity |
| **Cross-chain** | LI.FI API (69 chains, 34 bridges, 36 DEXes — no API key) |
| **Futures Data** | Hyperliquid WebSocket SDK (931 coins, ~150 ms) |
| **BSV** | Custom script engine, OP_RETURN proofs, WhatsOnChain API |
| **AI** | OpenAI GPT-4 (analysis), DALL-E (image generation) |
| **Charts** | TradingView, DexScreener, GeckoTerminal |
| **Payments** | Stripe (fiat on-ramp) |
| **Price Feeds** | CoinGecko (free), LetsExchange USD prices, Hyperliquid mid prices |

---

## Architecture

```
orahdex/
├── artifacts/
│   ├── api-server/src/
│   │   ├── app.ts                    — Express setup + background service startup
│   │   ├── routes/
│   │   │   ├── index.ts              — All /api/* route registration
│   │   │   ├── lifi.ts               — LI.FI universal DEX aggregator
│   │   │   ├── externalSwap.ts       — Custodial venues + LI.FI parallel quotes
│   │   │   ├── futures.ts            — Hyperliquid perpetuals
│   │   │   ├── bridge.ts / bridgeAgg.ts
│   │   │   ├── evmSettlement.ts      — HTLC session management
│   │   │   └── ...30+ more routes
│   │   └── lib/
│   │       ├── lifi.ts               — LI.FI client (chain/token registry, quote, routes, status)
│   │       ├── hyperliquidWs.ts      — Hyperliquid WebSocket service (allMids, 931 coins)
│   │       ├── hyperliquid.ts        — REST + WS hybrid price resolution
│   │       ├── metaRouter.ts         — Multi-venue quote scoring engine
│   │       ├── leAutoRoute.ts        — Custodial venue cascade
│   │       ├── liquidityBot.ts       — Genesis market-making
│   │       ├── priceUpdater.ts       — Sovereign price engine
│   │       ├── futuresProfitEngine.ts — Mark price, funding, liquidations
│   │       ├── selfHealing.ts        — guardedInterval worker engine
│   │       ├── htlcWatcher.ts        — Cross-chain HTLC monitor
│   │       └── arbBot.ts             — Triangular arbitrage engine
│   └── bsv-dex/src/                  — React/Vite frontend
└── lib/
    └── db/src/schema/                — Drizzle schema (source of truth)
```

### Trade Routing Flow
```
User swap request
       │
       ├── Custodial venues (parallel)
       │     LetsExchange / SimpleSwap / StealthEX / ChangeNOW / Changelly / Swapzone
       │     → scored by net USD output (metaRouter)
       │
       └── LI.FI onchain (parallel)
             69 chains × 36 DEX aggregators × 34 bridges
             → returns wallet-signable transaction

Both quotes returned → user chooses custodial or onchain
```

### Self-Healing Engine
All background services run via `guardedInterval()` — automatic lock release, failure tracking with exponential backoff, per-service health registry. `/api/health` returns structured status (healthy/degraded/stuck/dead) with 503 on critical failure.

---

## API Reference

### Swap & Quotes
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/external-swap/quote` | Best custodial quote + LI.FI onchain quote in parallel |
| POST | `/api/external-swap/execute` | Execute custodial swap (deposit-address model) |
| GET | `/api/external-swap/:swapId` | Live swap status |
| GET | `/api/lifi/quote` | LI.FI best route + signed tx |
| GET | `/api/lifi/routes` | Up to 10 ranked routes |
| GET | `/api/lifi/chains` | 69 supported chains |
| GET | `/api/lifi/tokens` | Tokens by chain |
| GET | `/api/lifi/status` | Post-swap tx tracking |
| GET | `/api/lifi/supported` | Pair coverage check |

### Spot Trading
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/order/place` | Place limit/stop order |
| POST | `/api/order/cancel` | Cancel an order |
| GET | `/api/orderbook/:pair` | Orderbook depth |
| GET | `/api/markets` | All markets |
| GET | `/api/markets/:symbol` | Single market data |

### Futures (Hyperliquid)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/futures/position/open` | Open perpetual position |
| POST | `/api/futures/position/close` | Close a position |
| GET | `/api/futures/positions` | Open positions |
| GET | `/api/futures/funding-rate` | Current funding rate |
| GET | `/api/hyperliquid/ws-status` | WebSocket feed status (931 coins) |

### Bridge (HTLC)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/bridge/lock` | Initiate HTLC lock |
| POST | `/api/v1/bridge/reveal` | Reveal preimage |
| POST | `/api/v1/bridge/redeem` | Redeem locked funds |
| GET | `/api/v1/bridge/status/:id` | Check swap status |

### Wallet & Portfolio
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/wallet/balance` | Multichain balances |
| GET | `/api/portfolio` | Portfolio summary |
| GET | `/api/trades` | Trade history |

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm (`corepack enable`)
- PostgreSQL database

### Install
```bash
git clone https://github.com/aaurah/OrahDEX.git
cd OrahDEX
corepack pnpm install
```

### Run (Development)
```bash
# API server (port 8080)
PORT=8080 pnpm --filter @workspace/api-server run dev

# Frontend (port 20180)
PORT=20180 pnpm --filter @workspace/bsv-dex run dev
```

### Key Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `ALCHEMY_API_KEY` | EVM RPC (Alchemy) |
| `HANDCASH_APP_ID` / `HANDCASH_APP_SECRET` | HandCash BSV wallet OAuth |
| `SWAPZONE_API_KEY` | Swapzone swap venue |
| `THIRDWEB_SECRET_KEY` | ThirdWeb bridge/wallet |
| `OPENAI_API_KEY` | GPT-4 / DALL-E for Ora AI |
| `STRIPE_SECRET_KEY` | Fiat on-ramp |

> LI.FI requires no API key. Hyperliquid WebSocket requires no API key.

---

## Security

- **Zero PII** — no names, emails, or government IDs; identity is purely cryptographic
- **Non-custodial** — users retain private keys at all times; HTLC scripts ensure atomic settlement
- **SSRF protection** — all outbound HTTP calls validated against a private-IP blocklist
- **XSS protection** — all user-generated HTML sanitized via DOMPurify
- **Audited dependencies** — all transitive dependencies pinned via `pnpm.overrides`

---

## Module Status

| Module | Status |
|---|---|
| Spot Orderbook | ✅ Stable |
| Genesis VAMM | ✅ Stable |
| Hybrid Router (custodial + onchain) | ✅ Stable |
| LI.FI Universal Aggregator | ✅ Live — 69 chains, 34 bridges, 36 DEXes |
| Perpetual Futures (Hyperliquid) | ✅ Live — 931 markets, WS feed |
| Cross-Chain Bridge (HTLC) | ✅ Complete |
| Multichain Wallet (EVM + BSV + TRON) | ✅ Complete |
| CopyVault | ✅ Complete |
| P2P Market | ✅ Complete |
| Ora AI (GPT-4) | ✅ Complete |
| HandCash Wallet | ✅ Complete |
| OrahNFT | 🚧 In Progress |
| Fiat On-Ramp (Stripe) | ⚠️ Partial |

---

## Changelog

### 2026-07-24
- **LI.FI universal aggregator** integrated — single API giving access to 69 chains, 34 bridges, and 36 DEX aggregators (1inch, Uniswap, SushiSwap, KyberSwap, OKX, Nordstern, Fly, Paraswap, Aerodrome, …). No API key required.
- `/api/external-swap/quote` now fires LI.FI in parallel with custodial venues and returns both a custodial quote and an `onchainQuote` (non-custodial, wallet-signable tx).
- 6 new LI.FI endpoints added (`/api/lifi/quote`, `/routes`, `/chains`, `/tokens`, `/status`, `/supported`).
- **Hyperliquid WebSocket** — real-time `allMids` feed for 931 perpetual coins at ~150 ms via official Hyperliquid SDK. REST fallback for resilience.
- **Futures OI fix** — raw open interest now multiplied by mark price for correct USD values.
- **Futures data gate** — data routes (OI, funding, mark prices) always open; only trading routes gated by `FUTURES_ENABLED` flag.

### 2026-06-xx
- Swapzone added as 6th custodial swap venue
- HandCash OAuth wallet integration ($handle payments on BSV)
- TRON BIP44 derivation path corrected (`m/44'/195'/0'/0/0` + keccak256)
- Reown AppKit (WalletConnect v3) integrated — EVM + Solana + Bitcoin adapters
- Socket bridge aggregator added
- GeckoTerminal live pool data integrated
- CoinGecko free price feed integrated

---

## License

MIT License — see [LICENSE](LICENSE) for details.
