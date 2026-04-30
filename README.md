OrahDEX — Hybrid DEX + Swap Aggregator

OrahDEX is a sovereign, non‑custodial trading engine combining:

• Orderbook DEX (Spot / Limit / Stop)
• Swap Aggregator (LetsExchange fallback)
• Cross‑chain HTLC settlement
• Perpetual Futures (WIP)
• Multichain Wallet
• NFT Engine (WIP)
• Market Hub (CEX + DEX data)


The goal is to provide unified liquidity, transparent settlement, and global asset coverage.

---

Features

DEX Engine

• Spot trading
• Limit & stop orders
• Orderbook matching
• Depth, trades, candles
• Internal price engine


Swap Aggregator

• Internal liquidity → OrahDEX
• No liquidity → LetsExchange API
• Unified swap API
• Synthetic price feeds for unsupported pairs


Cross‑Chain Settlement

• BTC / BSV / BCH HTLC
• Time‑locked scripts
• Final settlement anchor


Wallet

• EVM multichain
• Balance fetch
• QR receive
• Fiat on‑ramp integration (planned)


Futures (WIP)

• Perpetual engine
• Mark price
• Funding rate
• Liquidation logic


NFT (WIP)

• Creator coins
• NFT feed
• NFT minting


Market Hub

• CEX + DEX aggregation
• Volume engine
• Market cap engine


---

Architecture

/src
 ├── orderbook/           # Matching engine, spot/limit/stop
 ├── swap/                # Hybrid router (internal + LetsExchange)
 ├── integrations/        # LetsExchange API integration
 ├── htlc/                # Cross-chain settlement scripts
 ├── price/               # Price engine + synthetic candles
 ├── wallet/              # Multichain wallet logic
 ├── markets/             # Market hub aggregation
 ├── nft/                 # NFT engine (WIP)
 └── utils/               # Shared utilities


---

Hybrid Routing Logic

if (orderbook.hasLiquidity(pair, amount)) {
    return executeInternalSwap(pair, amount)
} else {
    return executeLetsExchangeSwap(pair, amount)
}


This ensures all pairs work, even with zero internal liquidity.

---

LetsExchange Integration

OrahDEX uses LetsExchange as a fallback liquidity source.

Implemented endpoints:

• /api/v1/info/coins
• /api/v1/info/estimate
• /api/v1/transaction
• /api/v1/transaction/{id}


Module:

/src/integrations/letsexchange.ts


Handles:

• Quotes
• Swap creation
• Status tracking
• Error handling
• Retries


---

API Endpoints

Swap

• POST /swap/quote
• POST /swap/execute
• GET /swap/status/:id


Spot

• POST /order/place
• POST /order/cancel
• GET /orderbook/:pair


Wallet

• GET /wallet/balance
• POST /wallet/send


Markets

• GET /markets
• GET /markets/:pair


---

Installation

git clone https://github.com/<your-org>/OrahDEX.git
cd OrahDEX
npm install
npm run dev


Environment variables:

RPC_URL=<EVM RPC>
LE_API_KEY=<LetsExchange API key>
DATABASE_URL=<Postgres/Mongo>


---

Development Status

Module	Status	
Orderbook	✅ Stable	
Swap Router	✅ Complete	
LetsExchange Integration	✅ Complete	
Wallet	⚠️ Partial	
Price Engine	⚠️ Partial	
Markets Hub	⚠️ Partial	
Futures	🚧 In Progress	
NFT Engine	🚧 In Progress	


---

Roadmap

• Full synthetic price engine
• Perpetual futures engine
• NFT creator coins
• Fiat on‑ramp integration
• Mobile‑optimized UI
• Market hub data aggregation


---

License

MIT License.
