import { useSEO } from "@/hooks/useSEO";
import { CoinLogo } from "@/components/CoinLogo";
import { useWalletStore } from "@/store/useWalletStore";
import { useSettingsStore, formatQuoteAmount } from "@/store/useSettingsStore";
import { formatPrice, formatPercent, cn, getProviderLabel } from "@/lib/utils";
import { Eye, EyeOff, ArrowDownToLine, Upload, History, Copy, Check, RefreshCw, Info, AlertTriangle, Droplets, ExternalLink, TrendingUp, Cpu, Waves, Gauge, Layers, Zap, Activity, CreditCard } from "lucide-react";
import { useBsvChain, fmtHashrate, fmtDifficulty, fmtMempoolMb, fmtBlockAge } from "@/hooks/useBsvChain";
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReceiveModal } from "@/components/ReceiveModal";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";
import { DirectBuyModal } from "@/components/DirectBuyModal";
import { BuyHistory } from "@/components/BuyHistory";
import { BridgeHistory } from "@/components/BridgeHistory";
import { WithdrawSheet } from "@/components/WithdrawSheet";
import { fetchBsvBalance, type BsvBalanceResult } from "@/hooks/useBsvBalance";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { useTronBalances } from "@/hooks/useTronBalances";
import { useLiquidityStore } from "@/store/useLiquidityStore";
import { EXPLORER_TX } from "@/lib/onChainLiquidity";
import { useWalletModalStore } from "@/store/useWalletModalStore";


const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const POOL_LABELS: Record<string, { display: string; base: string; quote: string }> = {
  "btc-usdt":  { display: "BTC / USDT",  base: "BTC",  quote: "USDT" },
  "eth-usdt":  { display: "ETH / USDT",  base: "ETH",  quote: "USDT" },
  "sol-usdt":  { display: "SOL / USDT",  base: "SOL",  quote: "USDT" },
  "bsv-usdt":  { display: "BSV / USDT",  base: "BSV",  quote: "USDT" },
  "bnb-usdt":  { display: "BNB / USDT",  base: "BNB",  quote: "USDT" },
  "xrp-usdt":  { display: "XRP / USDT",  base: "XRP",  quote: "USDT" },
  "ada-usdt":  { display: "ADA / USDT",  base: "ADA",  quote: "USDT" },
  "doge-usdt": { display: "DOGE / USDT", base: "DOGE", quote: "USDT" },
  "dot-usdt":  { display: "DOT / USDT",  base: "DOT",  quote: "USDT" },
  "link-usdt": { display: "LINK / USDT", base: "LINK", quote: "USDT" },
  "bsv-btc":   { display: "BSV / BTC",   base: "BSV",  quote: "BTC"  },
  "eth-btc":   { display: "ETH / BTC",   base: "ETH",  quote: "BTC"  },
  "trx-usdt":  { display: "TRX / USDT",  base: "TRX",  quote: "USDT" },
  "btt-usdt":  { display: "BTT / USDT",  base: "BTT",  quote: "USDT" },
  "btt-trx":   { display: "BTT / TRX",   base: "BTT",  quote: "TRX"  },
  "win-trx":   { display: "WIN / TRX",   base: "WIN",  quote: "TRX"  },
  "jst-usdt":  { display: "JST / USDT",  base: "JST",  quote: "USDT" },
  "trx-btc":   { display: "TRX / BTC",   base: "TRX",  quote: "BTC"  },
};


interface ChainInfo {
  name: string;
  native: string;
  color: string;
  isL2?: boolean;
  layer?: number;
}

const CHAIN_INFO: Record<number, ChainInfo> = {
  1:       { name: "Ethereum Mainnet",  native: "ETH",  color: "#8B5CF6" },
  10:      { name: "Optimism",          native: "ETH",  color: "#FF0420", isL2: true, layer: 2 },
  56:      { name: "BNB Chain",         native: "BNB",  color: "#EAB308" },
  100:     { name: "Gnosis Chain",      native: "xDAI", color: "#04795B", isL2: true, layer: 2 },
  137:     { name: "Polygon",           native: "MATIC", color: "#8247E5", isL2: true, layer: 2 },
  250:     { name: "Fantom",            native: "FTM",  color: "#1969FF" },
  324:     { name: "zkSync Era",        native: "ETH",  color: "#8C8DFC", isL2: true, layer: 2 },
  1101:    { name: "Polygon zkEVM",     native: "ETH",  color: "#7B3FE4", isL2: true, layer: 2 },
  2020:    { name: "Ronin",             native: "RON",  color: "#1273EA" },
  5000:    { name: "Mantle",            native: "MNT",  color: "#000000", isL2: true, layer: 2 },
  8453:    { name: "Base",              native: "ETH",  color: "#0052FF", isL2: true, layer: 2 },
  25:      { name: "Cronos",            native: "CRO",  color: "#002D74" },
  43114:   { name: "Avalanche C-Chain", native: "AVAX", color: "#E84142" },
  42161:   { name: "Arbitrum One",      native: "ETH",  color: "#28A0F0", isL2: true, layer: 2 },
  42170:   { name: "Arbitrum Nova",     native: "ETH",  color: "#E57310", isL2: true, layer: 2 },
  59144:   { name: "Linea",             native: "ETH",  color: "#61DFFF", isL2: true, layer: 2 },
  534352:  { name: "Scroll",            native: "ETH",  color: "#FFDBB0", isL2: true, layer: 2 },
  7777777: { name: "Zora",             native: "ETH",  color: "#A4F542", isL2: true, layer: 2 },
  1088:    { name: "Metis",             native: "METIS", color: "#00DACC", isL2: true, layer: 2 },
  34443:   { name: "Mode",              native: "ETH",  color: "#DFFE00", isL2: true, layer: 2 },
  81457:   { name: "Blast",             native: "ETH",  color: "#FCFC03", isL2: true, layer: 2 },
};

function getChainInfo(chainId: number | null): ChainInfo | null {
  if (!chainId) return null;
  return CHAIN_INFO[chainId] ?? null;
}

// Maps each asset to its canonical withdrawal network + address placeholder
const ASSET_NETWORK_MAP: Record<string, { network: string; networkLabel: string; placeholder: string }> = {
  BTC:   { network: "btc",  networkLabel: "Bitcoin",            placeholder: "bc1... or 1... or 3..." },
  BSV:   { network: "bsv",  networkLabel: "Bitcoin SV",         placeholder: "1... (BSV P2PKH)" },
  BCH:   { network: "bch",  networkLabel: "Bitcoin Cash",       placeholder: "1... (P2PKH — same fork address as BTC/BSV)" },
  ETH:   { network: "evm",  networkLabel: "Ethereum Mainnet",   placeholder: "0x... (ERC-20 address)" },
  USDT:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  USDC:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  DAI:   { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  AAVE:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  LINK:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  UNI:   { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  BNB:   { network: "evm",  networkLabel: "BNB Chain (BEP-20)", placeholder: "0x... (BEP-20 address)" },
  BUSD:  { network: "evm",  networkLabel: "BNB Chain (BEP-20)", placeholder: "0x... (BEP-20 address)" },
  CAKE:  { network: "evm",  networkLabel: "BNB Chain (BEP-20)", placeholder: "0x... (BEP-20 address)" },
  MATIC: { network: "evm",  networkLabel: "Polygon",            placeholder: "0x... (Polygon address)" },
  AVAX:  { network: "evm",  networkLabel: "Avalanche C-Chain",  placeholder: "0x... (Avalanche address)" },
  FTM:   { network: "evm",  networkLabel: "Fantom",             placeholder: "0x... (Fantom address)" },
  SOL:   { network: "sol",  networkLabel: "Solana",             placeholder: "Solana wallet address" },
  TRX:   { network: "tron", networkLabel: "TRON Network",       placeholder: "T... (TRON address)" },
  BTT:   { network: "tron", networkLabel: "TRON (TRC-20)",      placeholder: "T... (TRON address)" },
  WIN:   { network: "tron", networkLabel: "TRON (TRC-20)",      placeholder: "T... (TRON address)" },
  JST:   { network: "tron", networkLabel: "TRON (TRC-20)",      placeholder: "T... (TRON address)" },
  XRP:   { network: "xrp",  networkLabel: "XRP Ledger",         placeholder: "r... (XRP address)" },
  ADA:   { network: "ada",  networkLabel: "Cardano",            placeholder: "addr1... (Cardano address)" },
  DOGE:  { network: "doge", networkLabel: "Dogecoin",           placeholder: "D... (Dogecoin address)" },
  DOT:   { network: "dot",  networkLabel: "Polkadot",           placeholder: "1... (Polkadot address)" },
  LTC:   { network: "ltc",  networkLabel: "Litecoin",           placeholder: "L... or ltc1..." },
  XLM:   { network: "xlm",  networkLabel: "Stellar",            placeholder: "G... (Stellar address)" },
  ATOM:  { network: "cosmos", networkLabel: "Cosmos Hub",       placeholder: "cosmos1... address" },
  NEAR:  { network: "near", networkLabel: "NEAR Protocol",      placeholder: "account.near" },
  ALGO:  { network: "algo", networkLabel: "Algorand",           placeholder: "Algorand address" },
  VET:   { network: "vet",  networkLabel: "VeChain",            placeholder: "0x... (VeChain address)" },
  ICP:   { network: "icp",  networkLabel: "Internet Computer",  placeholder: "ICP principal or account ID" },
  HBAR:  { network: "hbar", networkLabel: "Hedera",             placeholder: "0.0.XXXXX (Hedera ID)" },
  // Additional non-EVM chains
  TON:   { network: "ton",  networkLabel: "The Open Network",   placeholder: "EQ... or UQ... (TON address)" },
  NOT:   { network: "ton",  networkLabel: "TON (Jetton)",       placeholder: "EQ... or UQ... (TON address)" },
  SUI:   { network: "sui",  networkLabel: "Sui Network",        placeholder: "0x... (Sui address)" },
  APT:   { network: "apt",  networkLabel: "Aptos",              placeholder: "0x... (Aptos address)" },
  DASH:  { network: "dash", networkLabel: "Dash",               placeholder: "X... (Dash address)" },
  ZEC:   { network: "zec",  networkLabel: "Zcash",              placeholder: "t1... or t3... (Zcash address)" },
  XMR:   { network: "xmr",  networkLabel: "Monero",             placeholder: "4... (Monero address)" },
  ORDI:  { network: "btc",  networkLabel: "Bitcoin (Ordinals)", placeholder: "bc1... or 1... (Bitcoin address)" },
  FIL:   { network: "fil",  networkLabel: "Filecoin",           placeholder: "f1... or f3... (Filecoin address)" },
  KAS:   { network: "kas",  networkLabel: "Kaspa",              placeholder: "kaspa:... (Kaspa address)" },
  STX:   { network: "stx",  networkLabel: "Stacks",             placeholder: "SP... or SM... (Stacks address)" },
  EOS:   { network: "eos",  networkLabel: "EOS Network",        placeholder: "accountname (EOS account)" },
  EGLD:  { network: "egld", networkLabel: "MultiversX",         placeholder: "erd1... (MultiversX address)" },
  // Cosmos ecosystem
  OSMO:  { network: "cosmos", networkLabel: "Osmosis",          placeholder: "osmo1... address" },
  INJ:   { network: "cosmos", networkLabel: "Injective",        placeholder: "inj1... address" },
  SEI:   { network: "cosmos", networkLabel: "Sei Network",      placeholder: "sei1... address" },
  TIA:   { network: "cosmos", networkLabel: "Celestia",         placeholder: "celestia1... address" },
  DYDX:  { network: "cosmos", networkLabel: "dYdX Chain",       placeholder: "dydx1... address" },
  // EVM L2s
  ARB:   { network: "evm",  networkLabel: "Arbitrum One",       placeholder: "0x... (Arbitrum address)" },
  GMX:   { network: "evm",  networkLabel: "Arbitrum One",       placeholder: "0x... (Arbitrum address)" },
  RDNT:  { network: "evm",  networkLabel: "Arbitrum One",       placeholder: "0x... (Arbitrum address)" },
  OP:    { network: "evm",  networkLabel: "Optimism",           placeholder: "0x... (Optimism address)" },
  SNX_OP: { network: "evm", networkLabel: "Optimism",           placeholder: "0x... (Optimism address)" },
  STRK:  { network: "evm",  networkLabel: "Starknet",           placeholder: "0x... (Starknet address)" },
  ZK:    { network: "evm",  networkLabel: "zkSync Era",         placeholder: "0x... (zkSync address)" },
  ETC:   { network: "evm",  networkLabel: "Ethereum Classic",   placeholder: "0x... (ETC address)" },
  ONE:   { network: "evm",  networkLabel: "Harmony ONE",        placeholder: "0x... (Harmony address)" },
  METIS: { network: "evm",  networkLabel: "Metis Andromeda",    placeholder: "0x... (Metis address)" },
};

function getAssetNetworkInfo(asset: string, connectedNetwork: string | null, chainId: number | null):
  { network: string; networkLabel: string; placeholder: string } {
  if (ASSET_NETWORK_MAP[asset]) return ASSET_NETWORK_MAP[asset];
  // Fallback: use connected wallet's network
  const net = connectedNetwork ?? "evm";
  const label = getNetworkLabel(connectedNetwork, chainId, null);
  const placeholder = net === "evm" ? "0x... (wallet address)" : net === "bsv" ? "1... (BSV address)" : "Destination address";
  return { network: net, networkLabel: label, placeholder };
}

function getNativeAsset(network: string | null, chainId: number | null): string {
  if (network === "bsv")  return "BSV";
  if (network === "sol")  return "SOL";
  if (network === "btc")  return "BTC";
  if (network === "tron") return "TRX";
  if (network === "evm" && chainId) return CHAIN_INFO[chainId]?.native ?? "ETH";
  return "ETH";
}

function getNetworkLabel(network: string | null, chainId: number | null, provider: string | null): string {
  if (network === "bsv")  return "Bitcoin SV (BSV)";
  if (network === "sol")  return "Solana";
  if (network === "btc")  return "Bitcoin";
  if (network === "tron") return "TRON Network";
  if (network === "evm" && chainId) {
    const info = CHAIN_INFO[chainId];
    return info ? info.name : `Chain ID ${chainId}`;
  }
  return provider ?? "EVM";
}


const ASSET_COLORS: Record<string, string> = {
  BSV:  "#22C55E",
  USDT: "#34D399",
  USDC: "#2775CA",
  BTC:  "#F97316",
  ETH:  "#8B5CF6",
  BNB:  "#EAB308",
  MATIC:"#8247E5",
  AVAX: "#E84142",
  FTM:  "#1969FF",
  CRO:  "#002D74",
  SOL:  "#9945FF",
  MNT:  "#6B7280",
  xDAI: "#04795B",
  RON:  "#1273EA",
  METIS:"#00DACC",
  TRX:  "#EF4444",
  BTT:  "#9333EA",
  WIN:  "#F59E0B",
  JST:  "#06B6D4",
};

const BASE_ASSETS = [
  { asset: "BSV",  marketKey: "BSV"  },
  { asset: "USDT", marketKey: "USDT" },
  { asset: "USDC", marketKey: "USDC" },
  { asset: "BTC",  marketKey: "BTC"  },
  { asset: "ETH",  marketKey: "ETH"  },
  { asset: "BNB",  marketKey: "BNB"  },
  { asset: "MATIC",marketKey: "MATIC"},
  { asset: "AVAX", marketKey: "AVAX" },
  { asset: "SOL",  marketKey: "SOL"  },
  { asset: "TRX",  marketKey: "TRX"  },
];

function getPortfolioAssets(nativeAsset: string) {
  const hasnative = BASE_ASSETS.some(a => a.asset === nativeAsset);
  const list = hasnative ? BASE_ASSETS : [{ asset: nativeAsset, marketKey: nativeAsset }, ...BASE_ASSETS];
  return list.map(a => ({ ...a, color: ASSET_COLORS[a.asset] ?? "#6B7280" }));
}

interface MarketRow { baseAsset: string; quoteAsset: string; lastPrice: number; priceChangePercent24h: number; }

function useLivePrices() {
  return useQuery<Record<string, MarketRow>>({
    queryKey: ["portfolio-live-prices"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/markets`);
      if (!res.ok) throw new Error("price fetch failed");
      const rows: MarketRow[] = await res.json();
      // Only use USDT-quoted pairs so non-USDT cross rates don't corrupt prices
      const usdtRows = rows.filter(r => r.quoteAsset === "USDT");
      return Object.fromEntries(usdtRows.map(r => [r.baseAsset, r]));
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function Portfolio() {
  useSEO({
    title: "Portfolio — Track Your Crypto Assets",
    description: "View and manage your entire crypto portfolio on OrahDEX. Track balances, P&L, trade history, and asset allocation across all connected wallets.",
    keywords: "crypto portfolio, asset tracker, wallet balance, P&L tracker, trade history, OrahDEX portfolio",
    url: "/portfolio",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "OrahDEX Portfolio",
      "description": "Cryptocurrency portfolio tracker and asset manager",
      "url": "https://orahdex.replit.app/portfolio"
    }
  });

  const { address, network, provider, chainId, balance, setBalance } = useWalletStore();
  const openWallet = useWalletModalStore((s) => s.open);
  const { quoteCurrency } = useSettingsStore();
  const { getUserPositions } = useLiquidityStore();
  const lpPositions = address ? Object.entries(getUserPositions(address)) : [];
  const { data: prices, isLoading: pricesLoading, refetch, isFetching } = useLivePrices();
  const { balances: evmBalances, loading: evmLoading, refresh: evmRefresh } = useEvmBalances(
    network === "evm" ? address : null,
    network === "evm" ? (chainId ?? 1) : null,
  );
  const { balances: tronBalances, loading: tronLoading, refresh: tronRefresh } = useTronBalances(
    network === "tron" ? address : null,
  );

  const [hideBalances, setHideBalances] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [buyCryptoOpen, setBuyCryptoOpen] = useState(false);
  const [resumeBuy, setResumeBuy] = useState<{ coin: string; usd: string } | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAsset, setWithdrawAsset] = useState<{ asset: string; available: number; color: string } | null>(null);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [bsvBalResult, setBsvBalResult] = useState<BsvBalanceResult | null>(null);
  const [bsvBalFetching, setBsvBalFetching] = useState(false);

  const chainInfo  = getChainInfo(chainId);
  const networkLabel = getNetworkLabel(network, chainId, provider);
  const { data: bsvChain } = useBsvChain();

  const isPaymailAddr = network === "bsv" && address?.includes("@");

  const refreshBsvBalance = useCallback(async () => {
    if (!address || network !== "bsv") return;
    setBsvBalFetching(true);
    const result = await fetchBsvBalance(address);
    setBsvBalResult(result);
    if (result && result.error !== "paymail_unresolved" && result.balance !== undefined) {
      setBalance(result.balance.toFixed(8));
    }
    setBsvBalFetching(false);
  }, [address, network, setBalance]);

  useEffect(() => {
    if (network === "bsv" && address) {
      refreshBsvBalance();
    }
  }, [address, network, refreshBsvBalance]);

  const handleCopyAddr = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  if (!address) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-10 space-y-6">

          {/* Hero */}
          <div className="rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto">
              <Zap className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-black text-foreground tracking-tight">Login to Trade</h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Connect your wallet to view live balances, track P&amp;L, receive funds, and start trading instantly.
            </p>
          </div>

          {/* Wallet type cards */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground px-1">Choose your wallet type</p>

            {/* EVM */}
            <button
              onClick={() => openWallet()}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-blue-500/40 hover:bg-blue-500/5 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
                🦊
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">EVM Wallets</p>
                <p className="text-xs text-muted-foreground mt-0.5">MetaMask · Coinbase · Trust · Ledger + all L2s</p>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {["ETH","BNB","MATIC","ARB","BASE"].map(s => (
                    <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{s}</span>
                  ))}
                </div>
              </div>
              <span className="text-blue-400 text-sm font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
            </button>

            {/* TRON */}
            <button
              onClick={() => openWallet()}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-red-500/40 hover:bg-red-500/5 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
                🔴
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">TRON Wallet</p>
                <p className="text-xs text-muted-foreground mt-0.5">TronLink · imToken · Trust · TokenPocket · OKX</p>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {["TRX","USDT","BTT","WIN","JST"].map(s => (
                    <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{s}</span>
                  ))}
                </div>
              </div>
              <span className="text-red-400 text-sm font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
            </button>

            {/* BSV */}
            <button
              onClick={() => openWallet()}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
                ⚡
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Bitcoin SV Wallet</p>
                <p className="text-xs text-muted-foreground mt-0.5">HandCash · RelayX · Panda · Sensilet · manual</p>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {["BSV","FAST","LOW FEE"].map(s => (
                    <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{s}</span>
                  ))}
                </div>
              </div>
              <span className="text-primary text-sm font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
            </button>

            {/* Other (SOL / BTC) */}
            <button
              onClick={() => openWallet()}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-violet-500/40 hover:bg-violet-500/5 transition-all text-left group"
            >
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
                🌐
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Other Wallets</p>
                <p className="text-xs text-muted-foreground mt-0.5">Phantom (SOL) · UniSat · Xverse (BTC) · more</p>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {["SOL","BTC","ORDINALS"].map(s => (
                    <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">{s}</span>
                  ))}
                </div>
              </div>
              <span className="text-violet-400 text-sm font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
            </button>
          </div>

          {/* Features */}
          <div className="p-5 rounded-2xl bg-secondary/40 border border-border">
            <p className="text-xs font-semibold text-muted-foreground mb-3">After connecting you can:</p>
            <div className="space-y-2.5">
              {[
                { icon: "📊", text: "View live portfolio balance & P&L" },
                { icon: "💳", text: "Buy crypto with fiat (Apple Pay, Card, Bank)" },
                { icon: "💸", text: "Receive funds directly to your wallet" },
                { icon: "⚡", text: "Trade spot & futures markets" },
                { icon: "🔗", text: "Cross-chain BSV settlements via HTLC" },
              ].map(f => (
                <div key={f.text} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <span className="text-base leading-none">{f.icon}</span>
                  {f.text}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    );
  }

  const nativeAsset = getNativeAsset(network, chainId);
  const nativeBalance = balance ? parseFloat(balance) : 0;

  const stableSet = new Set(["USDT","USDC","DAI","BUSD","TUSD"]);

  // Build balance rows from on-chain data.
  const balances = (() => {
    if (network === "evm" && evmBalances.length > 0) {
      return evmBalances.map(b => {
        const isStable = stableSet.has(b.symbol);
        const mkt    = prices?.[b.symbol];
        const price  = b.price > 0 ? b.price : isStable ? 1 : (mkt?.lastPrice ?? 0);
        const change = b.change24h !== 0 ? b.change24h : isStable ? 0 : (mkt?.priceChangePercent24h ?? 0);
        const valueUSD = b.usdValue > 0 ? b.usdValue : b.amount * price;
        const pnl24h   = valueUSD * change / 100;
        const color = ASSET_COLORS[b.symbol] ?? "#6B7280";
        return { asset: b.symbol, color, marketKey: b.symbol,
                 total: b.amount, free: b.amount, locked: 0,
                 price, change24hPercent: change, valueUSD, pnl24h, isNative: b.isNative };
      });
    }
    if (network === "tron" && tronBalances.length > 0) {
      return tronBalances.map(b => {
        const isStable = stableSet.has(b.symbol);
        const mkt    = prices?.[b.symbol];
        const price  = b.price ?? (isStable ? 1 : (mkt?.lastPrice ?? 0));
        const change = isStable ? 0 : (mkt?.priceChangePercent24h ?? 0);
        const valueUSD = b.usdValue ?? (b.amount * price);
        const pnl24h   = valueUSD * change / 100;
        const color    = ASSET_COLORS[b.symbol] ?? "#EF4444";
        return { asset: b.symbol, color, marketKey: b.symbol,
                 total: b.amount, free: b.amount, locked: 0,
                 price, change24hPercent: change, valueUSD, pnl24h, isNative: b.isNative };
      });
    }
    // For EVM/Tron wallets whose chain balances haven't loaded yet, show only the
    // native-asset balance from the wallet store so that stablecoin rows such as
    // USDT and USDC don't appear with a misleading 0 balance.
    if (network === "evm" || network === "tron") {
      const isStable = stableSet.has(nativeAsset);
      const mkt    = prices?.[nativeAsset];
      const price  = isStable ? 1 : (mkt?.lastPrice ?? 0);
      const change = isStable ? 0 : (mkt?.priceChangePercent24h ?? 0);
      const valueUSD = nativeBalance * price;
      const pnl24h   = valueUSD * change / 100;
      const color    = ASSET_COLORS[nativeAsset] ?? "#6B7280";
      return [{ asset: nativeAsset, color, marketKey: nativeAsset,
                total: nativeBalance, free: nativeBalance, locked: 0,
                price, change24hPercent: change, valueUSD, pnl24h, isNative: true }];
    }
    // Non-EVM fallback (BSV, BTC, SOL…): list of known assets, only native has a real balance
    const PORTFOLIO_ASSETS = getPortfolioAssets(nativeAsset);
    return PORTFOLIO_ASSETS.map(a => {
      const isStable = stableSet.has(a.asset);
      const mkt    = prices?.[a.asset];
      const price  = isStable ? 1 : (mkt?.lastPrice ?? 0);
      const change = isStable ? 0 : (mkt?.priceChangePercent24h ?? 0);
      const total  = a.asset === nativeAsset ? nativeBalance : 0;
      const valueUSD = total * price;
      const pnl24h   = valueUSD * change / 100;
      return { ...a, total, free: total, locked: 0, price, change24hPercent: change, valueUSD, pnl24h, isNative: a.asset === nativeAsset };
    });
  })();

  const totalValueUSD  = balances.reduce((s, b) => s + b.valueUSD, 0);
  const totalPnlUSD    = balances.reduce((s, b) => s + b.pnl24h, 0);
  const totalPnlPercent = totalValueUSD > 0 ? (totalPnlUSD / totalValueUSD) * 100 : 0;
  const nonZero        = balances.filter(b => b.total > 0);

  // True while waiting for chain-specific token balances (EVM or Tron).
  const isLoadingChainBalances =
    (network === "evm"  && evmLoading) ||
    (network === "tron" && tronLoading);

  return (
    <>
      <ReceiveModal isOpen={receiveOpen} onClose={() => setReceiveOpen(false)} />
      <BuyCryptoModal open={buyCryptoOpen} onClose={() => setBuyCryptoOpen(false)} />
      <DirectBuyModal
        open={!!resumeBuy}
        onClose={() => setResumeBuy(null)}
        defaultCoin={resumeBuy?.coin ?? "BTC"}
        defaultFiatUsd={resumeBuy?.usd}
        defaultPayMethod="card"
        onSwitchToProviders={() => { setResumeBuy(null); setBuyCryptoOpen(true); }}
      />
      {withdrawAsset && (() => {
        const assetNet = getAssetNetworkInfo(withdrawAsset.asset, network, chainId);
        const sameNetwork = assetNet.network === (network ?? "evm");
        return (
          <WithdrawSheet
            open={withdrawOpen}
            onClose={() => { setWithdrawOpen(false); setWithdrawAsset(null); }}
            walletAddress={address ?? ""}
            defaultRecipient={sameNetwork ? (address ?? "") : ""}
            asset={withdrawAsset.asset}
            available={withdrawAsset.available}
            network={assetNet.network}
            networkLabel={assetNet.networkLabel}
            addressPlaceholder={assetNet.placeholder}
            color={withdrawAsset.color}
          />
        );
      })()}

      <div className="flex-1 p-6 lg:p-10 max-w-7xl mx-auto w-full">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Portfolio</h1>
            {network && (
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {/* Chain colour dot */}
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: chainInfo?.color ?? (network === "bsv" ? "#22C55E" : network === "sol" ? "#9945FF" : "#8B5CF6") }}
                />
                <span className="text-xs text-muted-foreground font-medium">{networkLabel}</span>
                {chainInfo?.isL2 && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/25">
                    L{chainInfo.layer ?? 2}
                  </span>
                )}
                {provider && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground border border-border">
                    {getProviderLabel(provider)}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground font-mono bg-white/5 inline-block px-3 py-1 rounded-lg border border-border text-sm truncate max-w-xs md:max-w-md">
                {address}
              </p>
              <button onClick={handleCopyAddr} className={cn(
                "p-1.5 rounded-lg border text-xs font-medium transition-all",
                copiedAddr
                  ? "border-green-500/40 text-green-400 bg-green-500/10"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
              )}>
                {copiedAddr ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={() => { refetch(); if (network === "bsv") refreshBsvBalance(); if (network === "evm") evmRefresh(); if (network === "tron") tronRefresh(); }}
              className="p-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              title="Refresh prices & balance"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching || bsvBalFetching ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setBuyCryptoOpen(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:opacity-90 px-5 py-2.5 rounded-xl transition-all font-semibold text-sm shadow-lg shadow-green-600/20"
            >
              <CreditCard className="w-4 h-4" /> Buy Crypto
            </button>
            <button
              onClick={() => setReceiveOpen(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground hover:opacity-90 px-5 py-2.5 rounded-xl transition-all font-semibold text-sm shadow-lg shadow-primary/20"
            >
              <ArrowDownToLine className="w-4 h-4" /> Receive
            </button>
          </div>
        </div>

        {/* BSV paymail unresolved notice */}
        {isPaymailAddr && bsvBalResult?.error === "paymail_unresolved" && (
          <div className="mb-4 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/8 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">Live balance unavailable for this paymail</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The HandCash PKI service is currently unreachable, so your on-chain balance could not be retrieved
                automatically. Your paymail address (<span className="font-mono text-amber-400/90">{address}</span>) is
                valid and can still receive BSV payments.
              </p>
              <button
                onClick={refreshBsvBalance}
                disabled={bsvBalFetching}
                className="mt-2 flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${bsvBalFetching ? "animate-spin" : ""}`} /> Retry balance fetch
              </button>
            </div>
          </div>
        )}

        {/* BSV balance resolved from paymail → show resolved address */}
        {isPaymailAddr && bsvBalResult?.bsvAddress && !bsvBalResult?.error && (
          <div className="mb-4 p-3 rounded-2xl border border-green-500/20 bg-green-500/5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-green-400 shrink-0 animate-pulse" />
            On-chain balance fetched via{" "}
            <span className="font-mono text-green-400 truncate max-w-xs">{bsvBalResult.bsvAddress}</span>
          </div>
        )}

        {/* BSV On-Chain Network Stats — shown when connected via BSV network */}
        {network === "bsv" && (
          <div className="mb-4 rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", bsvChain?.online ? "bg-green-400 animate-pulse" : "bg-zinc-500")} />
                <span className="text-xs font-bold text-green-400 uppercase tracking-wider">BSV Mainnet</span>
              </div>
              <a href={bsvChain?.explorerUrl ?? "https://whatsonchain.com"} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                WhatsOnChain <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                { icon: Layers,   label: "Block",      value: bsvChain?.blockHeight ? `#${bsvChain.blockHeight.toLocaleString()}` : "—", color: "text-green-400" },
                { icon: Zap,      label: "Fee Rate",   value: `${bsvChain?.feeRateSatPerByte ?? 1} sat/B`,                             color: "text-orange-400" },
                { icon: Cpu,      label: "Hashrate",   value: fmtHashrate(bsvChain?.hashrateEHs ?? 0),                                 color: "text-sky-400" },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="bg-background/40 rounded-xl px-2 py-2 text-center">
                  <Icon className={cn("w-3.5 h-3.5 mx-auto mb-1", color)} />
                  <div className={cn("text-xs font-bold font-mono", color)}>{value}</div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Gauge,    label: "Difficulty", value: fmtDifficulty(bsvChain?.difficulty ?? 0),          color: "text-yellow-400" },
                { icon: Waves,    label: "Mempool",    value: fmtMempoolMb(bsvChain?.mempoolBytes ?? 0),         color: "text-violet-400" },
                { icon: Activity, label: "Mempool TXs",value: bsvChain?.mempoolTxCount ? bsvChain.mempoolTxCount.toLocaleString() : "—", color: "text-blue-400" },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="bg-background/40 rounded-xl px-2 py-2 text-center">
                  <Icon className={cn("w-3.5 h-3.5 mx-auto mb-1", color)} />
                  <div className={cn("text-xs font-bold font-mono", color)}>{value}</div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            {(bsvChain?.medianTime || (bsvChain?.bsvUsd && bsvChain.bsvUsd > 0)) && (
              <div className="mt-2 pt-2 border-t border-border/30 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                {bsvChain?.medianTime ? (
                  <span>Last block: <span className="text-foreground font-semibold">{fmtBlockAge(bsvChain.medianTime)}</span></span>
                ) : null}
                {bsvChain?.bsvUsd && bsvChain.bsvUsd > 0 ? (
                  <span>BSV/USD: <span className="text-green-400 font-bold">${bsvChain.bsvUsd.toFixed(2)}</span></span>
                ) : null}
                <span>Avg block: <span className="text-foreground">~10 min</span></span>
              </div>
            )}
          </div>
        )}

        {/* Fund your account CTAs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <div
            onClick={() => setBuyCryptoOpen(true)}
            className="p-4 rounded-2xl border border-green-500/20 bg-green-500/5 flex items-center gap-4 cursor-pointer hover:border-green-500/40 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0 group-hover:bg-green-500/25 transition-colors">
              <CreditCard className="w-4.5 h-4.5 text-green-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Buy Crypto with Fiat</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Apple Pay, Google Pay, Card, or Bank Transfer — instant delivery
              </p>
            </div>
            <span className="text-green-400 text-sm font-medium shrink-0">Buy →</span>
          </div>
          <div
            onClick={() => setReceiveOpen(true)}
            className="p-4 rounded-2xl border border-primary/20 bg-primary/5 flex items-center gap-4 cursor-pointer hover:border-primary/40 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors">
              <ArrowDownToLine className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Receive Crypto</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your wallet address QR for ETH, BNB, MATIC, BSV, and all EVM chains
              </p>
            </div>
            <span className="text-primary text-sm font-medium shrink-0">View QR →</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {/* Balance card */}
          <div className="lg:col-span-2 bg-gradient-to-br from-card to-secondary p-8 rounded-3xl border border-border shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 text-muted-foreground mb-2">
                <span className="font-medium">Wallet Balance</span>
                <button onClick={() => setHideBalances(!hideBalances)} className="hover:text-foreground transition-colors ml-auto">
                  {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-end gap-4 mb-6">
                {(pricesLoading || isLoadingChainBalances) && totalValueUSD === 0 ? (
                  <div className="h-14 w-52 bg-muted/40 rounded-xl animate-pulse" />
                ) : (
                  <span className="text-5xl font-bold font-mono tracking-tight text-foreground">
                    {hideBalances ? "••••••" : formatQuoteAmount(totalValueUSD, quoteCurrency)}
                  </span>
                )}
              </div>
              {totalValueUSD > 0 && (
                <div className="flex items-center gap-4">
                  <div className="bg-background/50 backdrop-blur px-4 py-2 rounded-xl border border-white/5">
                    <div className="text-xs text-muted-foreground mb-1">Today's PnL</div>
                    <div className={cn("font-mono font-bold", totalPnlUSD >= 0 ? "text-green-400" : "text-red-400")}>
                      {hideBalances ? "•••" : `${totalPnlUSD >= 0 ? "+" : ""}$${formatPrice(Math.abs(totalPnlUSD))} (${formatPercent(totalPnlPercent)})`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats card */}
          <div className="bg-card p-6 rounded-3xl border border-border shadow-xl flex flex-col justify-center gap-4">
            <div className="flex justify-between items-center p-4 bg-secondary/50 rounded-2xl">
              <span className="text-muted-foreground font-medium">Open Spot Orders</span>
              <span className="text-2xl font-bold font-mono text-foreground">0</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-secondary/50 rounded-2xl">
              <span className="text-muted-foreground font-medium">Futures Positions</span>
              <span className="text-2xl font-bold font-mono text-foreground">0</span>
            </div>
            <button onClick={() => setReceiveOpen(true)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors">
              <ArrowDownToLine className="w-4 h-4" /> Receive Funds
            </button>
          </div>
        </div>

        {/* Asset balances table */}
        <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
          <div className="p-6 border-b border-border bg-secondary/20 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Asset Balances</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {network === "evm" ? "On-chain balances" : `${nativeAsset} balance`} from <span className="font-semibold">{networkLabel}</span>{network === "evm" ? " · switch chains to see other networks" : " · other assets live in separate wallets"}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">Live prices · 30s refresh</span>
          </div>

          {/* Notice about chain scope */}
          {network === "evm" && (
            <div className="mx-4 mt-4 flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/15">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Showing live on-chain token balances for your currently connected network. Switch chains in your wallet to view assets on other networks (BNB Chain, Polygon, etc.).
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-sm">
                  <th className="p-4 font-medium">Asset</th>
                  <th className="p-4 font-medium text-right">Live Price</th>
                  <th className="p-4 font-medium text-right">24h Change</th>
                  <th className="p-4 font-medium text-right">Balance</th>
                  <th className="p-4 font-medium text-right">Value (USD)</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(pricesLoading || isLoadingChainBalances) && totalValueUSD === 0
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} className="p-4">
                            <div className="h-4 bg-muted/40 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : balances.map(bal => (
                      <tr key={bal.asset} className={cn("transition-colors", bal.total > 0 ? "hover:bg-white/5" : "opacity-50")}>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border shrink-0"
                              style={{ backgroundColor: bal.color + "22", borderColor: bal.color + "44", color: bal.color }}
                            >
                              {bal.asset[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-foreground">{bal.asset}</span>
                                {bal.isNative && bal.total > 0 && (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/25 shrink-0">
                                    NATIVE
                                  </span>
                                )}
                                {bal.isNative && chainInfo?.isL2 && (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: chainInfo.color + "22", color: chainInfo.color, borderWidth: 1, borderColor: chainInfo.color + "44" }}>
                                    L{chainInfo.layer ?? 2}
                                  </span>
                                )}
                              </div>
                              {bal.isNative && chainInfo && (
                                <p className="text-[10px] text-muted-foreground truncate">{chainInfo.name}</p>
                              )}
                              {stableSet.has(bal.asset) && (
                                <p className="text-[10px] text-muted-foreground">Stablecoin</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-right font-mono text-sm">
                          {stableSet.has(bal.asset) ? formatQuoteAmount(1, quoteCurrency) : bal.price > 0 ? formatQuoteAmount(bal.price, quoteCurrency) : "—"}
                        </td>
                        <td className={`p-4 text-right text-sm font-semibold ${bal.change24hPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {stableSet.has(bal.asset) ? "0.00%" : `${bal.change24hPercent >= 0 ? "+" : ""}${bal.change24hPercent.toFixed(2)}%`}
                        </td>
                        <td className="p-4 text-right font-mono">
                          {hideBalances
                            ? "•••"
                            : bal.total > 0
                              ? bal.total.toLocaleString(undefined, { maximumFractionDigits: bal.total < 0.0001 ? 8 : 6 })
                              : <span className="text-muted-foreground/50 text-xs italic">—</span>}
                        </td>
                        <td className="p-4 text-right font-mono font-medium">
                          {hideBalances ? "•••" : formatQuoteAmount(bal.valueUSD, quoteCurrency)}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setReceiveOpen(true)}
                              className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                            >
                              Receive
                            </button>
                            {bal.free > 0 && (
                              <button
                                onClick={() => {
                                  setWithdrawAsset({ asset: bal.asset, available: bal.free, color: bal.color });
                                  setWithdrawOpen(true);
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold hover:bg-orange-500/20 transition-colors"
                              >
                                <Upload className="w-3 h-3" />
                                Withdraw
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Buy-Crypto Purchase History ──────────────────────────────────
           Pass BOTH the connected wallet AND the session identity so orders
           bought from any prior wallet/network still appear here. */}
        <div className="mt-8">
          <BuyHistory
            walletAddress={[address, sessionStorage.getItem("orahdex_session_addr")]
              .filter((s): s is string => !!s && s.length >= 6)
              .join(",") || null}
            onResume={(o) => setResumeBuy({
              coin: o.coin_symbol,
              usd: (o.fiat_amount_cents / 100).toFixed(2),
            })}
          />
        </div>

        {/* ── Bridge / Cross-Chain Swap History ───────────────────────── */}
        <div className="mt-6">
          <BridgeHistory />
        </div>

        {/* ── LP Positions ───────────────────────────────────────────────── */}
        {lpPositions.length > 0 && (
          <div className="mt-8 bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-border bg-secondary/20 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Droplets className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold">Liquidity Positions</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Active LP positions across all pools · earnings accrue continuously
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{lpPositions.length} position{lpPositions.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-sm">
                    <th className="p-4 font-medium">Pool</th>
                    <th className="p-4 font-medium text-right">LP Tokens</th>
                    <th className="p-4 font-medium text-right">Deposited Value</th>
                    <th className="p-4 font-medium text-right">Date</th>
                    <th className="p-4 font-medium text-right">Transaction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lpPositions.map(([poolId, pos]) => {
                    const label  = POOL_LABELS[poolId];
                    const _base  = label?.base  ?? "?";
                    const _quote = label?.quote ?? "?";
                    const display = label?.display ?? poolId.toUpperCase().replace("-", " / ");
                    const explorerBase = pos.chainId ? EXPLORER_TX[pos.chainId] : null;
                    const txUrl  = explorerBase && pos.txHash ? `${explorerBase}${pos.txHash}` : null;
                    const dateStr = new Date(pos.depositedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                    const timeStr = new Date(pos.depositedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

                    return (
                      <tr key={poolId} className="hover:bg-white/5 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex -space-x-2">
                              <CoinLogo symbol={_base}  size={32} ring />
                              <CoinLogo symbol={_quote} size={32} ring />
                            </div>
                            <div>
                              <div className="font-bold text-sm text-foreground">{display}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-[10px] text-green-400 font-semibold">ACTIVE</span>
                                {pos.chainId === 8453 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/25 font-bold ml-1">Base</span>
                                )}
                                {pos.chainId === 1 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/25 font-bold ml-1">Ethereum</span>
                                )}
                                {!pos.chainId && ["trx-usdt","btt-usdt","btt-trx","win-trx","jst-usdt","trx-btc"].includes(poolId) && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/25 font-bold ml-1">TRON</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-right font-mono text-sm">
                          {hideBalances ? "•••" : pos.lpTokens.toFixed(4)}
                        </td>
                        <td className="p-4 text-right font-mono font-medium text-sm">
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{hideBalances ? "•••" : formatQuoteAmount(pos.depositedValueUsd, quoteCurrency)}</span>
                            <span className="flex items-center gap-1 text-xs text-green-400 font-semibold">
                              <TrendingUp className="w-3 h-3" /> Earning fees
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-right text-sm text-muted-foreground">
                          <div>{dateStr}</div>
                          <div className="text-xs">{timeStr}</div>
                        </td>
                        <td className="p-4 text-right">
                          {txUrl ? (
                            <a
                              href={txUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                            >
                              View Tx <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            pos.txHash ? (
                              <span className="font-mono text-xs text-muted-foreground">
                                {pos.txHash.slice(0, 8)}…{pos.txHash.slice(-6)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50 italic">—</span>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
