import { useEffect } from "react";
import { useLocation } from "wouter";

interface PageMeta {
  title: string;
  description: string;
}

const S = " | OrahDEX";

const STATIC: Record<string, PageMeta> = {
  "/": {
    title: "OrahDEX — Trade means DEX | Spot, Futures & P2P Crypto Exchange",
    description: "Multi-chain DEX: spot trading, perpetual futures, P2P markets, BSV on-chain settlement. 900+ markets across EVM, TRON and BSV networks.",
  },
  "/home": {
    title: "OrahDEX — Trade means DEX | Spot, Futures & P2P Crypto Exchange",
    description: "Multi-chain DEX: spot trading, perpetual futures, P2P markets, BSV on-chain settlement. 900+ markets across EVM, TRON and BSV networks.",
  },
  "/markets": {
    title: `Markets — Live Crypto Prices${S}`,
    description: "Browse 900+ live crypto markets. Real-time prices, 24h volume, and charts for spot and futures pairs on OrahDEX.",
  },
  "/dex": {
    title: `DEX Hub — Decentralized Exchange${S}`,
    description: "All OrahDEX tools in one place: spot, futures, P2P, copy trading, liquidity pools, and cross-chain bridge.",
  },
  "/swap": {
    title: `Swap & Bridge — Cross-Chain Tokens${S}`,
    description: "Swap and bridge tokens across EVM chains, TRON, and BSV on OrahDEX. Best routes, lowest slippage.",
  },
  "/bridge": {
    title: `Bridge — Cross-Chain Swap${S}`,
    description: "Bridge crypto across EVM, TRON, and BSV networks on OrahDEX. Fast, non-custodial cross-chain swaps.",
  },
  "/p2p": {
    title: `P2P — Peer-to-Peer Markets${S}`,
    description: "Buy and sell crypto peer-to-peer on OrahDEX. Fiat on-ramp and off-ramp with 100+ payment methods.",
  },
  "/liquidity": {
    title: `Liquidity — AMM Pools${S}`,
    description: "Provide liquidity to OrahDEX AMM pools and earn fees. Genesis Liquidity Engine with BSV on-chain settlement.",
  },
  "/genesis": {
    title: `Genesis Liquidity Engine${S}`,
    description: "Bootstrap AMM pools on OrahDEX with BSV-backed liquidity and earn protocol fees. Genesis Liquidity Engine.",
  },
  "/copy": {
    title: `Copy Trading — Follow Top Traders${S}`,
    description: "Copy the best OrahDEX traders automatically. Set allocation, risk level, and start earning passively.",
  },
  "/staking": {
    title: `Staking — Earn Passive Rewards${S}`,
    description: "Stake crypto on OrahDEX and earn rewards. Flexible and locked staking options available.",
  },
  "/nft": {
    title: `NFT Marketplace${S}`,
    description: "Discover, buy, and sell NFTs on OrahDEX. Multi-chain NFT marketplace supporting EVM and BSV.",
  },
  "/prediction": {
    title: `Prediction Markets${S}`,
    description: "Trade prediction markets on OrahDEX. Bet on crypto price outcomes and earn from market movements.",
  },
  "/keeper": {
    title: `Keeper Program — Fee Tiers & Rewards${S}`,
    description: "Join the OrahDEX Keeper Program. Earn reduced trading fees and protocol rewards as a liquidity keeper.",
  },
  "/sovereign": {
    title: `Sovereign Overview — OrahDEX Protocol${S}`,
    description: "OrahDEX Sovereign: self-custodial, BSV-settled DEX protocol. Full chain sovereignty for traders.",
  },
  "/ora-ai": {
    title: `Ora AI — Trading Assistant${S}`,
    description: "Chat with Ora, the OrahDEX AI assistant. Get market insights, portfolio analysis, and trade ideas.",
  },
  "/devai": {
    title: `DevAI — Developer AI Tools${S}`,
    description: "OrahDEX DevAI: AI-powered developer tools for building on the OrahDEX protocol.",
  },
  "/portfolio": {
    title: `Portfolio — My Holdings${S}`,
    description: "Track your crypto portfolio on OrahDEX. View balances, P&L, and full transaction history.",
  },
  "/wallet": {
    title: `Wallet — My Crypto Assets${S}`,
    description: "Manage your crypto wallet on OrahDEX. Deposit, withdraw, and view balances across EVM, TRON, and BSV.",
  },
  "/settings": {
    title: `Account Settings${S}`,
    description: "Manage your OrahDEX account: preferences, API keys, security, and notification settings.",
  },
  "/settings/api-keys": {
    title: `API Keys${S}`,
    description: "Manage your OrahDEX API keys for automated trading and third-party integrations.",
  },
  "/terms": {
    title: `Terms of Service${S}`,
    description: "OrahDEX Terms of Service. Read your rights and responsibilities when using the OrahDEX platform.",
  },
  "/privacy": {
    title: `Privacy Policy${S}`,
    description: "OrahDEX Privacy Policy: how we collect, use, and protect your personal data.",
  },
  "/whitepaper": {
    title: `White Paper — OrahDEX Protocol${S}`,
    description: "Read the OrahDEX technical white paper. Protocol design, BSV settlement, Genesis Liquidity Engine, and tokenomics.",
  },
  "/support": {
    title: `Support Center${S}`,
    description: "Get help with OrahDEX. Browse FAQs, submit a support ticket, or chat with the team.",
  },
  "/fees": {
    title: `Fee Schedule${S}`,
    description: "OrahDEX trading fees for spot, futures, and P2P. Keeper Program discounts and zero-fee tiers explained.",
  },
};

function setMetaTag(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function usePageMeta() {
  const [location] = useLocation();

  useEffect(() => {
    const tradeMatch = location.match(/^\/trade\/([^/?]+)/);
    const futuresMatch = location.match(/^\/futures\/([^/?]+)/);
    const portfolioCoinMatch = location.match(/^\/portfolio\/([^/?]+)/);

    let meta: PageMeta;

    if (tradeMatch) {
      const pair = tradeMatch[1].replace(/-/g, "/");
      meta = {
        title: `${pair} Spot Trading${S}`,
        description: `Trade ${pair} spot on OrahDEX. Live order book, depth chart, and instant BSV-settled execution.`,
      };
    } else if (futuresMatch) {
      const pair = futuresMatch[1].replace(/-PERP$/, "").replace(/-/g, "/");
      meta = {
        title: `${pair} Perpetual Futures${S}`,
        description: `Trade ${pair} perpetual futures on OrahDEX. Up to 100x leverage, real-time funding rates, deep liquidity.`,
      };
    } else if (portfolioCoinMatch) {
      const coin = portfolioCoinMatch[1].toUpperCase();
      meta = {
        title: `${coin} Wallet — Holdings${S}`,
        description: `View your ${coin} balance, deposits, withdrawals, and portfolio performance on OrahDEX.`,
      };
    } else {
      meta = STATIC[location] ?? STATIC["/"];
    }

    document.title = meta.title;
    setMetaTag("description", meta.description);
  }, [location]);
}
