# OrahDEX — The Universal Multi-Chain DEX

OrahDEX combines user-signed on-chain routes with server-managed settlement, internal-ledger, and hot-wallet payout paths. Custody depends on the feature and route; do not assume every OrahDEX flow is non-custodial.

Live at **[orahdex.com](https://orahdex.com)**

---

## What OrahDEX Covers

| Layer | Coverage |
|---|---|
| **DEX Aggregation** | 36 exchange aggregators across 69 chains |
| **Cross-Chain Bridges** | 34 bridge protocols |
| **EVM Chains** | 69 chains — Ethereum, Base, Arbitrum, Optimism, BNB, Polygon, Avalanche, and more |
| **Instant Swap Venues** | 6 integrated custodial swap venues |
| **Perpetual Futures** | 931 markets, real-time feed (~150 ms), mark price, OI, funding |
| **Settlement Layer** | Bitcoin SV (BSV) — immutable OP_RETURN proofs for every trade |
| **Wallets** | EVM, BSV, TRON, Bitcoin, Solana |

---

## Trading Pairs

OrahDEX aggregates pairs from multiple sources into a single unified market catalog:

| Source | Pairs | Unique Coins | Live Price |
|---|---|---|---|
| **OrahDEX Swap Network** | 2,035,957 | 3,396 | 390,000+ |
| **OrahDEX Catalog** | 535,244 | 1,249 | 27,668 |
| **Extended Swap Routes** | 55,111 | 2,975 | 3,447 |
| **Spot Orderbook** | 3,985 | 205 | 3,985 (100%) |
| **Perpetual Futures** | 931 | 931 | 931 (100%, real-time) |
| **Onchain Routes** | Unlimited | 1,252+ per chain × 69 chains | Live per quote |
| **Total** | **~2.15M** | **3,396+** | — |

**Quote currencies:** USDT · BTC · BNB · BSV · ETH · USDC · DOGE · SOL · TRX · XRP

---

## Core Features

### Universal Swap Router
Every swap fires all available venues in parallel and returns the best rate:
- **Custodial route** — instant swap, deposit-address model, 6 venues competing for best rate
- **Onchain route** — the connected wallet signs the transaction and settles directly on-chain where that route is available; this does not describe internal-ledger or server-managed payout paths

In live testing, OrahDEX onchain routes consistently outperform custodial rates.

### Genesis Liquidity Engine (Virtual AMM)
Proprietary linear bonding curve that makes every listed asset instantly tradeable — no initial liquidity provider required and no impermanent loss.

### Perpetual Futures
- **931 perpetual markets** with real-time price feed at ~150 ms latency
- Mark price, open interest (USD), funding rates, and liquidation engine
- Up to 100× leverage

### Spot Orderbook
- **3,985 live trading pairs** with 100% price coverage
- **10 quote currencies** — USDT, BTC, BNB, BSV, ETH, USDC, DOGE, SOL, TRX, XRP
- Limit, market, stop, and advanced conditional orders
- On-chain settlement via BSV OP_RETURN proofs

### Cross-Chain Swaps
- **2M+ swap pairs** across 6 integrated venues
- Best rate auto-selected in parallel — if one route fails, the next is tried automatically
- 3,396 unique coins supported

### Cross-Chain Bridge
- Trustless atomic swaps via Hash Time-Locked Contracts (HTLC)
- BTC / BSV / BCH / EVM / TRON chains
- HTLC-based routes use on-chain locks; settlement still depends on the configured contracts and relayer, so check the route and order status before trading

### OrahDEX Onchain API
```
GET /api/lifi/quote?from=ETH&to=USDC&amount=1    — best onchain route + wallet-signable tx
GET /api/lifi/routes?from=USDC&to=ETH&amount=100 — up to 10 ranked route alternatives
GET /api/lifi/chains                              — 69 supported chains
GET /api/lifi/tokens?chain=arb                   — 1,252+ tokens per chain
GET /api/lifi/status?txHash=0x...&fromChainId=1  — post-swap tx tracking
GET /api/lifi/supported?from=WBTC&to=AVAX        — quick pair coverage check
```

### CopyVault
On-chain copy trading — followers mirror leader positions with configurable allocation. Every execution recorded as a BSV OP_RETURN proof.

### P2P Market
Peer-to-peer fiat ↔ crypto trading with escrow-based settlement and dispute resolution.

### OrahNFT
Social NFT marketplace — posts are BSV inscriptions permanently anchored on-chain. Tradeable creator coins for each profile.

### Ora AI
Integrated intelligence layer — GPT-4 market analysis, real-time trade signals, portfolio coaching, and AI image generation for OrahNFT content.

### Multichain Wallet
- EVM: 69+ chains, WalletConnect compatible
- BSV: native key derivation
- TRON: full address and transaction support
- Bitcoin: native wallet connectivity
- Solana: integrated

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Radix UI, Zustand, TanStack Query |
| **Backend** | Node.js 20, Express 5, TypeScript, esbuild |
| **Database** | PostgreSQL via Drizzle ORM |
| **EVM** | viem 2.x, wagmi v3, WalletConnect v3, Solidity smart contracts |
| **AI** | GPT-4 (analysis), DALL-E (image generation) |
| **Charts** | Real-time candlestick charts, DEX screener, live pool data |
| **Payments** | Stripe fiat on-ramp |

---

## Architecture

```
orahdex/
├── artifacts/
│   ├── api-server/src/
│   │   ├── app.ts                     — Express setup + background service startup
│   │   ├── routes/
│   │   │   ├── index.ts               — All /api/* route registration
│   │   │   ├── externalSwap.ts        — Parallel custodial + onchain quotes
│   │   │   ├── futures.ts             — Perpetual futures engine
│   │   │   ├── bridge.ts              — Cross-chain bridge
│   │   │   ├── evmSettlement.ts       — HTLC session management
│   │   │   └── ...30+ more routes
│   │   └── lib/
│   │       ├── metaRouter.ts          — Multi-venue quote scoring engine
│   │       ├── liquidityBot.ts        — Genesis market-making
│   │       ├── priceUpdater.ts        — Sovereign price engine
│   │       ├── futuresProfitEngine.ts — Mark price, funding, liquidations
│   │       ├── selfHealing.ts         — guardedInterval worker engine
│   │       ├── htlcWatcher.ts         — Cross-chain atomic swap monitor
│   │       └── arbBot.ts              — Triangular arbitrage engine
│   └── bsv-dex/src/                   — React/Vite frontend
└── lib/
    └── db/src/schema/                 — Drizzle schema (source of truth)
```

### Swap Routing Flow
```
User swap request
       │
       ├── Custodial venues (parallel, scored by net USD output)
       │     6 venues competing simultaneously → best rate wins
       │     2,000,000+ pairs across 3,396 coins
       │
       └── Wallet-signed on-chain routes (where supported)
             69 chains × 36 DEX aggregators × 34 bridge protocols
             → returns wallet-signable transaction

Both quotes returned simultaneously → user chooses custodial or onchain
```

### Self-Healing Engine
All background services run via `guardedInterval()` — automatic lock release, failure tracking with exponential backoff, per-service health registry. `/api/health` returns structured status (healthy/degraded/stuck/dead) with 503 on critical failure.

---

## API Reference

### Swap & Quotes
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/external-swap/quote` | Best custodial + onchain quote in parallel |
| POST | `/api/external-swap/execute` | Execute swap |
| GET | `/api/external-swap/:swapId` | Live swap status |
| GET | `/api/lifi/quote` | Best onchain route + signed tx |
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
| GET | `/api/markets` | All markets (3,985 spot + 2M+ swap pairs) |
| GET | `/api/markets/:symbol` | Single market data |

### Futures
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/futures/position/open` | Open perpetual position |
| POST | `/api/futures/position/close` | Close a position |
| GET | `/api/futures/positions` | Open positions |
| GET | `/api/futures/funding-rate` | Current funding rate |

### Bridge (HTLC)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/bridge/lock` | Initiate atomic lock |
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
| `ALCHEMY_API_KEY` | EVM RPC provider |
| `OPENAI_API_KEY` | AI analysis and image generation |
| `STRIPE_SECRET_KEY` | Fiat on-ramp |

### Local AI (Ollama)

Ora AI and DevAI run without a hosted model key when a local [Ollama](https://ollama.com) model is available. Everything below is optional and documented in `.env.example`.

```bash
# 1. Install Ollama and start the service on loopback
curl -fsSL https://ollama.com/install.sh | sh
OLLAMA_HOST=127.0.0.1:11434 ollama serve

# 2. Pull the model tag you want to use (must match the env var exactly)
ollama pull llama3.2:3b        # Ora AI chat
ollama pull qwen2.5-coder:1.5b # DevAI (coding model)
```

| Variable | Description |
|---|---|
| `DEVAI_OLLAMA_ENABLED` | `true` serves Ora AI and DevAI from local Ollama instead of a hosted AI key |
| `DEVAI_OLLAMA_BASE_URL` | Ollama OpenAI-compatible base URL; loopback by default |
| `DEVAI_OLLAMA_REMOTE` | Set `true` only for a protected remote Ollama host over HTTPS |
| `DEVAI_MODEL` | Tag DevAI uses (default `qwen2.5-coder:1.5b`) |
| `ORA_AI_MODEL` | Tag Ora AI uses (default: same as `DEVAI_MODEL`) |
| `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access Service Auth credentials for remote mode; store as secrets |

Notes:
- The API starts Ollama on loopback and retrieves missing configured tags in the background. AI endpoints remain `503` until the exact model tag is installed and passes the memory check.
- `/api/health` reports `ai-provider` as `healthy` once the local model is the provider.
- If neither a hosted AI key nor a local model is configured, AI endpoints return `503 AI_PROVIDER_NOT_CONFIGURED`.
- Ollama is started by the API runtime, not `start.mjs`. Downloads are held unless at least 6 GiB of measured memory headroom and 4 GiB of free model-disk space are available; memory uses the lower of cgroup headroom and host `MemAvailable`.
- For Replit publishing, set `DEVAI_OLLAMA_ENABLED`, `DEVAI_MODEL`, and `ORA_AI_MODEL` in the production environment. The selected tags are downloaded on a new VM when safe checks pass; model weights are not stored in Git.
- The existing 2 GiB / 0.5-vCPU published machine cannot host these models safely. Use Publishing → Adjust settings → Machine configuration to choose an 8 GiB-or-larger machine, verify its displayed hourly rate, and confirm the API still has 6 GiB free after startup. More CPU improves local inference speed. Ollama avoids hosted-model API calls, but published VM compute is still charged.

#### Remote Ollama through Cloudflare Access

Use this only when Ollama is hosted on a separate machine such as Termux. Keep Ollama bound to `127.0.0.1:11434`; point a named Cloudflare Tunnel hostname at that loopback service and protect the hostname with an Access **Service Auth** policy. Do not expose port `11434` directly or use an unauthenticated quick tunnel.

Set `DEVAI_OLLAMA_REMOTE=true` and `DEVAI_OLLAMA_BASE_URL=https://<protected-hostname>/v1` in Replit production. Store the Access service-token ID and secret as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` Replit Secrets. Remote mode sends those headers for model checks and inference, never starts or downloads models on Replit, and requires both exact model tags to already exist on the remote host.

Termux can stop the tunnel or model service when Android sleeps, changes networks, or reclaims background apps. It is suitable for testing, not dependable public hosting; a phone-hosted model may make public Ora AI unavailable whenever the phone disconnects.

---

## Security

- **Wallet and account data** — wallet addresses, order and withdrawal records, and administrative records may be stored or processed by the service
- **Custody varies by feature** — direct wallet-signed on-chain routes differ from internal-ledger and server-managed settlement or payout routes
- **Outbound requests** — paymail resolution validates and pins public HTTPS destinations; other integrations require their own review
- **Output rendering** — known AI portfolio output is sanitized before insertion; this is not a claim that every user-generated value is safe
- **Release checks** — run the project's security and dependency checks before each release

---

## Module Status

| Module | Status |
|---|---|
| Spot Orderbook (3,985 pairs) | ✅ Stable |
| Genesis VAMM | ✅ Stable |
| Universal Swap Router (custodial + onchain) | ✅ Live |
| Onchain Routing (69 chains, 34 bridges, 36 DEXes) | ✅ Live |
| Custodial Venues (2M+ pairs, 3,396 coins) | ✅ Live — 6 venues |
| Perpetual Futures (931 markets, real-time) | ✅ Live |
| Cross-Chain Bridge (HTLC) | ✅ Complete |
| Multichain Wallet (EVM + BSV + TRON) | ✅ Complete |
| CopyVault | ✅ Complete |
| P2P Market | ✅ Complete |
| Ora AI | ✅ Complete |
| OrahNFT | 🚧 In Progress |
| Fiat On-Ramp | ⚠️ Partial |

---

## License

MIT License — see [LICENSE](LICENSE) for details.
