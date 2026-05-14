# OrahDEX — Trade Means DEX

OrahDEX is a sovereign, permissionless, multi-chain trading protocol for non-custodial exchange of digital assets. It uses **Bitcoin SV (BSV)** as its immutable settlement layer while supporting **Ethereum, 12+ EVM chains, and TRON** through a unified interface covering 36,000+ trading pairs.

Live at **[orahdex.org](https://orahdex.org)**

---

## Features

### Spot & Futures Trading
- 36,000+ trading pairs across EVM, TRON, and BSV networks
- Limit, market, and stop orders with an on-chain orderbook
- Perpetual futures with up to 100x leverage, mark price, funding rate, and liquidation logic

### Genesis Liquidity Engine (Virtual AMM)
- Proprietary linear bonding curve that makes every asset instantly tradeable
- No initial liquidity provider participation required
- Automated market-making without impermanent loss exposure

### Hybrid Router
Routes each trade through the best available source in order:
1. Internal Genesis VAMM
2. Standard AMM liquidity pools
3. External aggregators — LetsExchange, Changelly, ChangeNOW, SimpleSwap, StealthEX

### Cross-Chain Bridge (HTLC)
- Trustless atomic swaps via Hash Time-Locked Contracts
- Supports BTC / BSV / BCH / EVM chains
- `/api/v1/bridge/lock`, `/reveal`, `/redeem`, `/relay` endpoints
- Funds are never custodied by OrahDEX at any point

### CopyVault
- On-chain copy trading protocol
- Followers mirror Leader trades with configurable allocation
- Every execution recorded as a BSV `OP_RETURN` proof — fully auditable on-chain

### P2P Market
- Peer-to-peer fiat ↔ crypto trading
- Escrow-based settlement with dispute resolution

### OrahNFT
- Social NFT marketplace inspired by Zora / Instagram
- Posts are BSV inscriptions — permanently anchored on-chain
- Tradeable creator coins for each profile

### Ora AI
- Integrated AI intelligence layer powered by GPT-4
- Market analysis, trade signals, and portfolio coaching
- DALL-E image generation for OrahNFT content

### Multichain Wallet
- EVM multichain wallet via Viem/Wagmi + Reown (WalletConnect)
- TRON and BSV wallet support
- QR receive, balance fetch, transaction history
- Stripe fiat on-ramp integration

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS, Radix UI |
| Mobile | Expo (React Native), Expo Router, Reanimated |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL via Drizzle ORM |
| EVM | Viem, Wagmi, Reown (WalletConnect), Hardhat/Solidity |
| BSV | Custom script engine, bsvChainMonitor, OP_RETURN proofs |
| AI | OpenAI GPT-4 (analysis), DALL-E (image generation) |
| Charts | TradingView, DexScreener, GeckoTerminal |
| Payments | Stripe (fiat on-ramp) |

---

## Architecture

```
orahdex/
├── artifacts/
│   ├── api-server/          # Express API — trading, bridging, bots, price engine
│   │   └── src/lib/
│   │       ├── liquidityBot.ts       # Genesis market-making
│   │       ├── priceUpdater.ts       # Sovereign price engine (Binance + WhatsOnChain)
│   │       ├── futuresProfitEngine.ts # Mark price, funding, liquidations
│   │       ├── copyOrchestrator.ts   # CopyVault trade mirroring
│   │       ├── hybridRouter.ts       # Multi-source trade routing
│   │       ├── bsvChainMonitor.ts    # BSV settlement tracker
│   │       ├── htlcWatcher.ts        # Cross-chain HTLC monitor
│   │       └── arbBot.ts             # On-chain arbitrage engine
│   ├── bsv-dex/             # React/Vite frontend
│   ├── aura-dex-mobile/     # Expo React Native mobile app
│   └── orahdex-contracts/   # Solidity smart contracts (Hardhat)
└── lib/
    ├── db/                  # Drizzle schema + migrations
    └── */                   # Shared utilities
```

### Settlement Flow
Every trade generates a BSV `OP_RETURN` inscription as an immutable on-chain proof. Cross-chain swaps are coordinated through HTLC scripts — ensuring atomic execution with no custodial risk.

### Self-Healing Engine
The API server includes an `exchangeApiRepairEngine` and multiple reconcilers that automatically detect and correct inconsistencies between chain state and the database — keeping the system consistent without manual intervention.

---

## API Reference

### Spot Trading
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/trade/exchange` | Place a spot swap |
| POST | `/api/order/place` | Place limit/stop order |
| POST | `/api/order/cancel` | Cancel an order |
| GET | `/api/orderbook/:pair` | Get orderbook depth |
| GET | `/api/markets` | List all markets |
| GET | `/api/markets/:symbol` | Single market data |

### Futures
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/futures/position/open` | Open a perpetual position |
| POST | `/api/futures/position/close` | Close a position |
| GET | `/api/futures/positions` | List open positions |
| GET | `/api/futures/funding-rate` | Current funding rate |

### Genesis VAMM
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/genesis/swap` | Execute VAMM swap |
| GET | `/api/genesis/quote` | Get VAMM quote |
| GET | `/api/genesis/pools` | List Genesis pools |

### Bridge (HTLC)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/bridge/lock` | Initiate HTLC lock |
| POST | `/api/v1/bridge/reveal` | Reveal preimage |
| POST | `/api/v1/bridge/redeem` | Redeem locked funds |
| GET | `/api/v1/bridge/status/:id` | Check swap status |

### Swap Aggregator
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/swap/quote` | Get aggregated quote |
| POST | `/api/swap/execute` | Execute aggregated swap |
| GET | `/api/swap/status/:id` | Track swap status |

### Wallet
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/wallet/balance` | Fetch multichain balances |
| GET | `/api/wallet/transactions` | Transaction history |

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

### Environment Variables
Copy `.env.example` and fill in the required values:

```bash
cp .env.example .env
```

Key variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `STEALTHEX_API_KEY` | StealthEX swap aggregator key |
| `OPENAI_API_KEY` | GPT-4 / DALL-E for Ora AI and OrahNFT |
| `STRIPE_SECRET_KEY` | Fiat on-ramp via Stripe |
| `GITHUB_TOKEN` | CI/CD git operations |

### Run (Development)
```bash
# API server (port 8080)
PORT=8080 pnpm --filter @workspace/api-server run dev

# Frontend (port 20180)
PORT=20180 pnpm --filter @workspace/bsv-dex run dev

# Mobile (Expo)
pnpm --filter @workspace/aura-dex-mobile run start
```

---

## Security

- **Zero PII** — no names, emails, or government IDs collected; identity is purely cryptographic (wallet addresses)
- **Non-custodial** — users retain private keys at all times; HTLC scripts ensure funds are never held by OrahDEX
- **Immutable rules** — no admin keys can redirect or pause protocol contracts
- **Audited dependencies** — all transitive dependencies pinned via `pnpm.overrides` to patched versions (axios, fast-uri, elliptic, undici, and 15+ others)
- **SSRF protection** — all outbound HTTP calls validated against a private-IP blocklist
- **XSS protection** — all user-generated HTML sanitized via DOMPurify before rendering

---

## Module Status

| Module | Status |
|---|---|
| Spot Orderbook | ✅ Stable |
| Genesis VAMM | ✅ Stable |
| Hybrid Router | ✅ Stable |
| Price Engine | ✅ Stable |
| Perpetual Futures | ✅ Complete |
| Cross-Chain Bridge (HTLC) | ✅ Complete |
| CopyVault | ✅ Complete |
| P2P Market | ✅ Complete |
| Multichain Wallet (EVM) | ✅ Complete |
| Ora AI | ✅ Complete |
| OrahNFT | 🚧 In Progress |
| Mobile App | 🚧 In Progress |
| Fiat On-Ramp (Stripe) | ⚠️ Partial |
| TRON Wallet | ⚠️ Partial |

---

## Roadmap

- Full OrahNFT social marketplace with BSV inscription minting
- Mobile app (Expo) for iOS and Android
- Expanded TRON wallet support
- Fiat on-ramp via Stripe (full KYC-free flow)
- Governance token and protocol fee distribution
- Additional EVM chain support (Arbitrum, Optimism, Base)

---

## Changelog

### 2026-05-14
- **Security — SSRF guards** applied across all outbound HTTP clients (StealthEX, ChangeNOW, SimpleSwap, LetsExchange price cache, ERC-8004, notifier) — private-IP blocklist blocks internal network access
- **Security — XSS fixes** applied to AiAssistant, AiTradeAnalysis (DOMPurify.sanitize), ReceiveModal (innerHTML → React state), and chart style injection stripping
- **Dependencies** — axios bumped to 1.16.1, fast-uri pinned to ≥3.1.2, tmp 0.2.5 added; all via `pnpm.overrides` to cover transitive dependencies
- **Performance — liquidityBot** O(n²) `active.find()` loop replaced with O(1) Map lookup; 4003-element intermediate array removed
- **Performance — priceUpdater** sequential `await db.update()` per market replaced with batched parallel writes (50 at a time via `Promise.all`) — eliminates the primary API server OOM source
- **API server** dev script fixed: port kill corrected 8090 → 8080; memory limit raised 2048 → 3072 MB
- **SEO** — `sitemap.xml` all 18 URLs corrected from `orahdex.replit.app` → `orahdex.org`; `robots.txt` sitemap declaration updated; production server now sends `X-Robots-Tag: index, follow`
- **README** fully rewritten with complete feature list, tech stack table, architecture diagram, full API reference, security section, and module status

---

## License

MIT License — see [LICENSE](LICENSE) for details.
