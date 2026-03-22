import { useState, useEffect } from "react";
import {
  X, Search, ChevronRight, ExternalLink, CheckCircle,
  Wallet, CreditCard, Building2, Zap, Star, Shield, RefreshCw,
  AlertTriangle, ArrowLeftRight, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultCoin?: string;
}

// ── EVM chains user can switch to ─────────────────────────────────────────────
interface EvmChain {
  chainId: number;
  name: string;
  symbol: string;
  badge: string;
  color: string;
  rpcUrl: string;
  blockExplorer: string;
}
const EVM_CHAINS: EvmChain[] = [
  { chainId: 1,     name: "Ethereum",        symbol: "ETH",  badge: "L1", color: "text-blue-400",   rpcUrl: "https://mainnet.infura.io/v3/", blockExplorer: "https://etherscan.io" },
  { chainId: 56,    name: "BNB Chain",        symbol: "BNB",  badge: "L1", color: "text-yellow-400", rpcUrl: "https://bsc-dataseed.binance.org/", blockExplorer: "https://bscscan.com" },
  { chainId: 137,   name: "Polygon",          symbol: "MATIC",badge: "L2", color: "text-violet-400", rpcUrl: "https://polygon-rpc.com/", blockExplorer: "https://polygonscan.com" },
  { chainId: 43114, name: "Avalanche C-Chain",symbol: "AVAX", badge: "L1", color: "text-red-400",    rpcUrl: "https://api.avax.network/ext/bc/C/rpc", blockExplorer: "https://snowtrace.io" },
  { chainId: 42161, name: "Arbitrum One",     symbol: "ETH",  badge: "L2", color: "text-blue-300",  rpcUrl: "https://arb1.arbitrum.io/rpc", blockExplorer: "https://arbiscan.io" },
  { chainId: 10,    name: "Optimism",         symbol: "ETH",  badge: "L2", color: "text-red-400",   rpcUrl: "https://mainnet.optimism.io", blockExplorer: "https://optimistic.etherscan.io" },
  { chainId: 8453,  name: "Base",             symbol: "ETH",  badge: "L2", color: "text-blue-400",  rpcUrl: "https://mainnet.base.org", blockExplorer: "https://basescan.org" },
  { chainId: 250,   name: "Fantom Opera",     symbol: "FTM",  badge: "L1", color: "text-cyan-400",  rpcUrl: "https://rpc.ftm.tools/", blockExplorer: "https://ftmscan.com" },
];

// ── Per-coin network definition ────────────────────────────────────────────────
interface CoinNet {
  type: "evm" | "native";
  name: string;
  nativeSymbol: string;
  defaultChainId?: number;       // for EVM — which chain this token lives on by default
  addressHint: string;           // placeholder for address input
  addressPrefix?: string;        // regex-like prefix hint
}
const COIN_NETWORKS: Record<string, CoinNet> = {
  BTC:  { type:"native", name:"Bitcoin",           nativeSymbol:"BTC",  addressHint:"bc1q… or 1A… or 3A… (Bitcoin address)" },
  ETH:  { type:"evm",    name:"Ethereum",           nativeSymbol:"ETH",  defaultChainId:1,     addressHint:"0x… EVM address" },
  BSV:  { type:"native", name:"Bitcoin SV",         nativeSymbol:"BSV",  addressHint:"1… (BSV address)" },
  SOL:  { type:"native", name:"Solana",             nativeSymbol:"SOL",  addressHint:"Base58 Solana address (44 chars)" },
  XRP:  { type:"native", name:"XRP Ledger",         nativeSymbol:"XRP",  addressHint:"r… (XRP Ledger address)" },
  BNB:  { type:"evm",    name:"BNB Chain",          nativeSymbol:"BNB",  defaultChainId:56,    addressHint:"0x… EVM address (BNB Chain)" },
  ADA:  { type:"native", name:"Cardano",            nativeSymbol:"ADA",  addressHint:"addr1… (Cardano address)" },
  DOGE: { type:"native", name:"Dogecoin",           nativeSymbol:"DOGE", addressHint:"D… (Dogecoin address, 34 chars)" },
  AVAX: { type:"evm",    name:"Avalanche C-Chain",  nativeSymbol:"AVAX", defaultChainId:43114, addressHint:"0x… EVM address (Avalanche C-Chain)" },
  MATIC:{ type:"evm",    name:"Polygon",            nativeSymbol:"MATIC",defaultChainId:137,   addressHint:"0x… EVM address (Polygon)" },
  LINK: { type:"evm",    name:"Ethereum",           nativeSymbol:"LINK", defaultChainId:1,     addressHint:"0x… EVM address (Ethereum)" },
  DOT:  { type:"native", name:"Polkadot",           nativeSymbol:"DOT",  addressHint:"1… (Polkadot SS58 address)" },
  UNI:  { type:"evm",    name:"Ethereum",           nativeSymbol:"UNI",  defaultChainId:1,     addressHint:"0x… EVM address (Ethereum)" },
  ATOM: { type:"native", name:"Cosmos Hub",         nativeSymbol:"ATOM", addressHint:"cosmos1… (Cosmos address)" },
  LTC:  { type:"native", name:"Litecoin",           nativeSymbol:"LTC",  addressHint:"L… or ltc1… (Litecoin address)" },
  BCH:  { type:"native", name:"Bitcoin Cash",       nativeSymbol:"BCH",  addressHint:"q… or 1… (Bitcoin Cash address)" },
  NEAR: { type:"native", name:"NEAR Protocol",      nativeSymbol:"NEAR", addressHint:"account.near or 64-char hex" },
  APT:  { type:"native", name:"Aptos",              nativeSymbol:"APT",  addressHint:"0x… (Aptos address, 64 hex chars)" },
  ARB:  { type:"evm",    name:"Arbitrum One",       nativeSymbol:"ARB",  defaultChainId:42161, addressHint:"0x… EVM address (Arbitrum)" },
  OP:   { type:"evm",    name:"Optimism",           nativeSymbol:"OP",   defaultChainId:10,    addressHint:"0x… EVM address (Optimism)" },
  SUI:  { type:"native", name:"Sui",                nativeSymbol:"SUI",  addressHint:"0x… (Sui address, 64 hex chars)" },
  INJ:  { type:"native", name:"Injective",          nativeSymbol:"INJ",  addressHint:"inj1… (Injective address)" },
};

// ── Wallet options ─────────────────────────────────────────────────────────────
const EVM_WALLETS = [
  { id:"metamask", name:"MetaMask",       badge:"🦊", sub:"Most popular — Ethereum + all EVM chains", installUrl:"https://metamask.io/download/" },
  { id:"coinbase", name:"Coinbase Wallet",badge:"🔵", sub:"Self-custody by Coinbase · all EVM chains",  installUrl:"https://www.coinbase.com/wallet/downloads" },
  { id:"trust",    name:"Trust Wallet",   badge:"🛡️", sub:"Multi-chain mobile · EVM + 100+ coins",      installUrl:"https://trustwallet.com/download" },
  { id:"phantom",  name:"Phantom",        badge:"👻", sub:"Multichain — ETH, SOL, BTC",                 installUrl:"https://phantom.app/download" },
  { id:"rainbow",  name:"Rainbow",        badge:"🌈", sub:"Simple Ethereum wallet — L1 & L2",           installUrl:"https://rainbow.me/" },
  { id:"okx",      name:"OKX Wallet",     badge:"⭕", sub:"Web3 gateway by OKX — all EVM networks",     installUrl:"https://www.okx.com/web3" },
];
const BSV_WALLETS = [
  { id:"handcash", name:"HandCash",     badge:"✋", sub:"Social BSV wallet — simple & fast" },
  { id:"relayx",   name:"RelayX",       badge:"⚡", sub:"BSV DeFi wallet" },
  { id:"panda",    name:"Panda Wallet", badge:"🐼", sub:"Browser extension for BSV" },
  { id:"twetch",   name:"Twetch",       badge:"🐦", sub:"Social + wallet on BSV" },
];

function genBsvAddress(): string {
  const c = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return "1" + Array.from({length:33}, () => c[Math.floor(Math.random()*c.length)]).join("");
}

// ── Provider registry ──────────────────────────────────────────────────────────
interface ProviderDef {
  id:string; name:string; badge:string; color:string; fee:string;
  minUSD:number; maxUSD:number; methods:string[]; coins:string[]; rating:number;
  baseUrl:string;
  params:(coin:string,fiat:string,amount:string,method:string,addr:string)=>Record<string,string>;
}
const PROVIDERS: ProviderDef[] = [
  { id:"moonpay", name:"MoonPay", badge:"🌙", color:"text-violet-400", fee:"1–4.5%", minUSD:30,  maxUSD:50000,  rating:4.8,
    methods:["card","apple","google","bank"],
    coins:["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","LINK","DOT","LTC","BCH","UNI","NEAR","ARB","OP","SUI","BSV"],
    baseUrl:"https://buy.moonpay.com",
    params:(coin,fiat,amt,m,addr)=>({ currencyCode:coin.toLowerCase(), baseCurrencyCode:fiat.toLowerCase(), baseCurrencyAmount:amt,
      paymentMethod:m==="card"?"credit_debit_card":m==="bank"?"sepa_bank_transfer":m, ...(addr?{walletAddress:addr}:{}) }),
  },
  { id:"transak", name:"Transak", badge:"⚡", color:"text-cyan-400", fee:"0.99–2.5%", minUSD:15, maxUSD:25000,  rating:4.6,
    methods:["card","apple","google","bank"],
    coins:["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","LINK","DOT","ATOM","LTC","UNI","NEAR","ARB","APT","INJ"],
    baseUrl:"https://global.transak.com",
    params:(coin,fiat,amt,_m,addr)=>({ cryptoCurrencyCode:coin, defaultFiatCurrency:fiat, fiatAmount:amt, network:"mainnet", ...(addr?{walletAddress:addr}:{}) }),
  },
  { id:"banxa",   name:"Banxa",   badge:"🏦", color:"text-emerald-400", fee:"1–3%",   minUSD:50,  maxUSD:100000, rating:4.4,
    methods:["card","bank"],
    coins:["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","LTC","BCH","DOT","LINK"],
    baseUrl:"https://checkout.banxa.com",
    params:(coin,fiat,amt,_m,addr)=>({ coinType:coin, fiatType:fiat, fiatAmount:amt, ...(addr?{walletAddress:addr}:{}) }),
  },
  { id:"simplex", name:"Simplex", badge:"💎", color:"text-blue-400",  fee:"3.5–5%", minUSD:50,  maxUSD:20000,  rating:4.2,
    methods:["card","apple","google"],
    coins:["BTC","ETH","XRP","BNB","ADA","DOGE","LTC","BCH","MATIC","LINK","DOT"],
    baseUrl:"https://checkout.simplexcc.com",
    params:(coin,fiat,amt)=>({ crypto_currency:coin, fiat_currency:fiat, requested_amount:amt, requested_currency:fiat }),
  },
  { id:"ramp",    name:"Ramp Network", badge:"🔵", color:"text-blue-300", fee:"0.49–2.9%", minUSD:5, maxUSD:10000, rating:4.7,
    methods:["card","apple","google","bank"],
    coins:["BTC","ETH","SOL","MATIC","AVAX","DOT","UNI","LINK","ARB","OP","APT","NEAR","DOGE"],
    baseUrl:"https://app.ramp.network",
    params:(coin,fiat,amt,_m,addr)=>({ swapAsset:coin, fiatCurrency:fiat, fiatValue:amt, ...(addr?{userAddress:addr}:{}) }),
  },
];

// ── Coin catalogue ─────────────────────────────────────────────────────────────
interface CoinDef { symbol:string; name:string; color:string }
const COINS: CoinDef[] = [
  {symbol:"BTC", name:"Bitcoin",        color:"#F97316"}, {symbol:"ETH", name:"Ethereum",       color:"#8B5CF6"},
  {symbol:"BSV", name:"Bitcoin SV",     color:"#EAB308"}, {symbol:"SOL", name:"Solana",          color:"#06B6D4"},
  {symbol:"XRP", name:"Ripple",         color:"#3B82F6"}, {symbol:"BNB", name:"BNB",             color:"#F59E0B"},
  {symbol:"ADA", name:"Cardano",        color:"#2563EB"}, {symbol:"DOGE",name:"Dogecoin",        color:"#EAB308"},
  {symbol:"AVAX",name:"Avalanche",      color:"#EF4444"}, {symbol:"MATIC",name:"Polygon",        color:"#7C3AED"},
  {symbol:"LINK",name:"Chainlink",      color:"#2563EB"}, {symbol:"DOT", name:"Polkadot",        color:"#E11D48"},
  {symbol:"UNI", name:"Uniswap",        color:"#EC4899"}, {symbol:"ATOM",name:"Cosmos",          color:"#6366F1"},
  {symbol:"LTC", name:"Litecoin",       color:"#6B7280"}, {symbol:"BCH", name:"Bitcoin Cash",    color:"#22C55E"},
  {symbol:"NEAR",name:"NEAR Protocol",  color:"#10B981"}, {symbol:"APT", name:"Aptos",           color:"#06B6D4"},
  {symbol:"ARB", name:"Arbitrum",       color:"#60A5FA"}, {symbol:"OP",  name:"Optimism",        color:"#EF4444"},
  {symbol:"SUI", name:"Sui",            color:"#3B82F6"}, {symbol:"INJ", name:"Injective",       color:"#2563EB"},
];

const FIATS = ["USD","EUR","GBP","AUD","CAD","SGD","JPY","AED","INR","BRL"];
const QUICK_AMOUNTS = ["50","100","250","500","1000","2500"];
const PRICES: Record<string,number> = {
  BTC:68000,ETH:3400,BSV:55,SOL:145,XRP:0.52,BNB:390,ADA:0.44,DOGE:0.12,
  AVAX:36,MATIC:0.72,LINK:14.5,DOT:6.8,UNI:9.8,ATOM:8.4,LTC:78,BCH:384,
  NEAR:6.5,APT:10.5,ARB:1.1,OP:2.4,SUI:1.2,INJ:28,
};
const M_ICONS: Record<string,React.ReactNode> = {
  card:<CreditCard className="w-3.5 h-3.5"/>, bank:<Building2 className="w-3.5 h-3.5"/>,
  apple:<span className="text-sm">🍎</span>,  google:<span className="text-sm font-black">G</span>,
};
const M_LABELS: Record<string,string> = { card:"Card",bank:"Bank",apple:"Apple Pay",google:"Google Pay" };

type Step = "connect" | "coin" | "quote" | "checkout";
const STEPS: Step[] = ["connect","coin","quote","checkout"];
const STEP_LABELS = ["Connect","Select","Quote","Pay"];

export function BuyCryptoModal({ open, onClose, defaultCoin = "BTC" }: Props) {
  const { address, provider: walletProvider, chainId: connectedChainId } = useWalletStore();
  const connectWallet = useWalletStore(s => s.connect);

  const [step, setStep]         = useState<Step>("connect");
  const [coin, setCoin]         = useState(defaultCoin);
  const [fiat, setFiat]         = useState("USD");
  const [amount, setAmount]     = useState("100");
  const [search, setSearch]     = useState("");
  const [method, setMethod]     = useState("card");
  const [providerId, setProviderId] = useState("");

  // Wallet connect step state
  const [walletTab, setWalletTab]     = useState<"evm"|"bsv">("evm");
  const [connecting, setConnecting]   = useState<string|null>(null);
  const [connectErr, setConnectErr]   = useState<string|null>(null);

  // Network / address state (quote step)
  const [nativeAddr, setNativeAddr]   = useState("");      // user-entered address for non-EVM coins
  const [addrErr, setAddrErr]         = useState<string|null>(null);
  const [switchingChain, setSwitchingChain] = useState(false);
  const [switchErr, setSwitchErr]     = useState<string|null>(null);
  const [switchedChainId, setSwitchedChainId] = useState<number|null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(address ? "coin" : "connect");
      setCoin(defaultCoin); setSearch(""); setAmount("100");
      setProviderId(""); setNativeAddr(""); setAddrErr(null); setSwitchErr(null); setSwitchedChainId(null);
    }
  }, [open, defaultCoin]);

  // Auto-advance when wallet connects
  useEffect(() => { if (step === "connect" && address) setStep("coin"); }, [address, step]);

  // Reset native address when coin changes
  useEffect(() => { setNativeAddr(""); setAddrErr(null); setSwitchErr(null); setSwitchedChainId(null); }, [coin]);

  if (!open) return null;

  const coinNet  = COIN_NETWORKS[coin] ?? { type:"native", name:coin, nativeSymbol:coin, addressHint:"Enter your address" };
  const coinDef  = COINS.find(c => c.symbol === coin);
  const supportedProviders = PROVIDERS.filter(p => p.coins.includes(coin));
  const selectedProvider   = PROVIDERS.find(p => p.id === providerId) ?? supportedProviders[0];
  const filteredCoins = COINS.filter(c => !search || c.symbol.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()));

  // The address that goes to the exchange — native override wins
  const effectiveAddr = coinNet.type === "native" ? nativeAddr : (address ?? "");

  // Quote maths
  const numAmt   = parseFloat(amount) || 0;
  const fiatToUSD = fiat==="EUR"?1.08:fiat==="GBP"?1.27:fiat==="AUD"?0.65:fiat==="CAD"?0.74:1;
  const est       = (numAmt * fiatToUSD * 0.975) / (PRICES[coin] ?? 1);
  const fmtEst    = est >= 1 ? est.toFixed(6) : est >= 0.0001 ? est.toFixed(8) : est.toExponential(4);

  // Current active EVM chain
  const activeChainId = switchedChainId ?? connectedChainId ?? 1;
  const activeChain   = EVM_CHAINS.find(c => c.chainId === activeChainId) ?? EVM_CHAINS[0];
  const targetChainId = coinNet.defaultChainId;
  const targetChain   = targetChainId ? EVM_CHAINS.find(c => c.chainId === targetChainId) : null;
  const isOnWrongChain = coinNet.type === "evm" && targetChainId && activeChainId !== targetChainId;

  // ── EVM chain switch via MetaMask ──
  async function switchChain(chain: EvmChain) {
    const eth = (window as any).ethereum;
    if (!eth) { setSwitchErr("No EVM wallet found."); return; }
    setSwitchingChain(true); setSwitchErr(null);
    const hexId = "0x" + chain.chainId.toString(16);
    try {
      await eth.request({ method:"wallet_switchEthereumChain", params:[{ chainId:hexId }] });
    } catch(err: any) {
      if (err?.code === 4902) {
        // Chain not added — add it
        try {
          await eth.request({ method:"wallet_addEthereumChain", params:[{
            chainId: hexId,
            chainName: chain.name,
            nativeCurrency: { name:chain.symbol, symbol:chain.symbol, decimals:18 },
            rpcUrls: [chain.rpcUrl],
            blockExplorerUrls: [chain.blockExplorer],
          }]});
        } catch(e2: any) { setSwitchErr(e2?.message ?? "Failed to add network."); setSwitchingChain(false); return; }
      } else {
        setSwitchErr(err?.message ?? "Network switch rejected."); setSwitchingChain(false); return;
      }
    }
    setSwitchedChainId(chain.chainId);
    // Update wallet store
    connectWallet({ address: address!, provider: walletProvider ?? "evm", network:"evm", chainId: chain.chainId });
    setSwitchingChain(false);
  }

  // ── EVM wallet connect ──
  async function connectEvm(walletId: string) {
    setConnectErr(null);
    let provider: any = walletId==="phantom" ? (window as any).phantom?.ethereum : walletId==="okx" ? (window as any).okxwallet : (window as any).ethereum;
    if (!provider) {
      const w = EVM_WALLETS.find(x => x.id === walletId);
      window.open(w?.installUrl ?? "https://metamask.io/download/", "_blank");
      setConnectErr(`${w?.name ?? "Wallet"} not found. Install it then try again.`); return;
    }
    setConnecting(walletId);
    try {
      const accounts: string[] = await provider.request({ method:"eth_requestAccounts" });
      if (!accounts?.length) throw new Error("No accounts returned.");
      const hexChain: string = await provider.request({ method:"eth_chainId" });
      connectWallet({ address:accounts[0], provider:walletId, network:"evm", chainId:parseInt(hexChain,16) });
      provider.on?.("accountsChanged", (a:string[]) => { if(!a.length) useWalletStore.getState().disconnect(); else useWalletStore.getState().connect({address:a[0],provider:walletId,network:"evm",chainId:parseInt(hexChain,16)}); });
      provider.on?.("chainChanged", (h:string) => { useWalletStore.getState().connect({address:accounts[0],provider:walletId,network:"evm",chainId:parseInt(h,16)}); });
    } catch(err:any) {
      const c = err?.code;
      setConnectErr(c===4001?"You rejected the connection — approve it in your wallet.":c===-32002?"Wallet is already waiting — open it and approve.":err?.message??"Connection failed.");
    } finally { setConnecting(null); }
  }

  function connectBsv(walletId: string) {
    setConnectErr(null); setConnecting(walletId);
    setTimeout(() => { connectWallet({ address:genBsvAddress(), provider:walletId, network:"bsv" }); setConnecting(null); }, 1200);
  }

  function selectCoin(sym: string) {
    setCoin(sym); setProviderId(PROVIDERS.find(p => p.coins.includes(sym))?.id ?? "");
    setSearch(""); setNativeAddr(""); setAddrErr(null); setStep("quote");
  }

  function getProviderUrl(pId: string) {
    const p = PROVIDERS.find(x => x.id === pId);
    if (!p) return "#";
    return `${p.baseUrl}?${new URLSearchParams(p.params(coin,fiat,amount,method,effectiveAddr))}`;
  }

  function validateAndContinue() {
    if (coinNet.type === "native") {
      if (!nativeAddr.trim()) { setAddrErr(`Enter your ${coin} address to continue.`); return; }
      if (nativeAddr.trim().length < 20) { setAddrErr("Address looks too short — double-check it."); return; }
    }
    setAddrErr(null);
    if (!providerId && supportedProviders.length > 0) setProviderId(supportedProviders[0].id);
    setStep("checkout");
  }

  function goBack() {
    if (step==="checkout") setStep("quote");
    else if (step==="quote") setStep("coin");
    else if (step==="coin" && !address) setStep("connect");
  }

  const curIdx = STEPS.indexOf(step);

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-[480px] bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {step !== "connect" && (
              <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">←</button>
            )}
            <div>
              <h2 className="text-base font-bold">Buy Crypto</h2>
              <p className="text-[11px] text-muted-foreground">
                {step==="connect" && "Step 1 — Connect your wallet first"}
                {step==="coin"    && "Step 2 — Choose which coin to buy"}
                {step==="quote"   && `Step 3 — Amount & network · ${supportedProviders.length} exchanges`}
                {step==="checkout"&& "Step 4 — Review & pay"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><X className="w-4 h-4"/></button>
        </div>

        {/* Step bar */}
        <div className="flex border-b border-border shrink-0 bg-secondary/20">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex items-center justify-center py-2 gap-1.5">
              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black",
                i<curIdx?"bg-green-500 text-white":i===curIdx?"bg-primary text-primary-foreground":"bg-secondary text-muted-foreground")}>
                {i<curIdx?"✓":i+1}
              </div>
              <span className={cn("text-[10px] font-semibold hidden sm:inline", i===curIdx?"text-foreground":"text-muted-foreground")}>{STEP_LABELS[i]}</span>
            </div>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">

          {/* ═══ STEP 1: Connect Wallet ═══ */}
          {step === "connect" && (
            <div className="p-4 space-y-4">
              <div className="flex rounded-xl border border-border overflow-hidden">
                {(["evm","bsv"] as const).map(tab => (
                  <button key={tab} onClick={() => { setWalletTab(tab); setConnectErr(null); }}
                    className={cn("flex-1 py-2.5 text-sm font-bold transition-colors",
                      walletTab===tab?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground")}>
                    {tab==="evm"?"🔗 EVM Wallets":"₿ BSV Wallets"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {walletTab==="evm"
                  ? "Click a wallet — your browser extension will open and ask for approval."
                  : "Click to connect your BSV wallet. BSV coins will arrive at your BSV address."}
              </p>
              <div className="space-y-2">
                {(walletTab==="evm"?EVM_WALLETS:BSV_WALLETS).map(w => {
                  const isConn = connecting===w.id;
                  return (
                    <button key={w.id} disabled={!!connecting}
                      onClick={() => walletTab==="evm"?connectEvm(w.id):connectBsv(w.id)}
                      className={cn("w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all",
                        isConn?"border-primary bg-primary/10":"border-border hover:border-primary/50 hover:bg-primary/5",
                        connecting&&!isConn&&"opacity-50 cursor-not-allowed")}>
                      <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center text-xl shrink-0">
                        {isConn?<RefreshCw className="w-5 h-5 text-primary animate-spin"/>:w.badge}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm flex items-center gap-2">
                          {w.name}{isConn&&<span className="text-[10px] text-primary">Connecting…</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{w.sub}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0"/>
                    </button>
                  );
                })}
              </div>
              {connectErr && <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-[12px] text-red-400">⚠ {connectErr}</div>}
              <div className="flex items-center gap-2 p-3 bg-secondary/30 rounded-xl text-[11px] text-muted-foreground">
                <Shield className="w-4 h-4 shrink-0 text-primary/60"/>
                OrahDEX never stores your private keys. You approve the connection in your own wallet.
              </div>
            </div>
          )}

          {/* ═══ STEP 2: Select Coin ═══ */}
          {step === "coin" && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/25 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0"><Wallet className="w-4 h-4 text-green-400"/></div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-green-400">Wallet connected · {walletProvider ?? ""}</div>
                  <div className="font-mono text-[11px] text-muted-foreground truncate">{address}</div>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search coin…" autoFocus
                  className="w-full bg-secondary/60 border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary"/>
              </div>
              {!search && <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1"><Star className="w-3 h-3 text-amber-400 fill-amber-400"/>Select a coin</p>}
              <div className="space-y-1.5">
                {filteredCoins.map(c => {
                  const net = COIN_NETWORKS[c.symbol];
                  const providers = PROVIDERS.filter(p => p.coins.includes(c.symbol));
                  return (
                    <button key={c.symbol} onClick={()=>selectCoin(c.symbol)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left group">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-black text-white shrink-0 shadow" style={{background:c.color}}>{c.symbol.slice(0,2)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{c.symbol}</span>
                          <span className="text-xs text-muted-foreground">{c.name}</span>
                          {net?.type === "native" && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold">Native</span>
                          )}
                          {net?.type === "evm" && (
                            <span className="text-[9px] bg-blue-500/15 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-bold">EVM</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">{net?.name ?? c.name} network</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-semibold">${(PRICES[c.symbol]??0).toLocaleString(undefined,{maximumFractionDigits:4})}</div>
                        <div className="text-[10px] text-muted-foreground">{providers.length} exchanges</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0"/>
                    </button>
                  );
                })}
                {filteredCoins.length===0 && <p className="text-center text-muted-foreground text-sm py-8">No coins found for "{search}"</p>}
              </div>
            </div>
          )}

          {/* ═══ STEP 3: Quote + Network ═══ */}
          {step === "quote" && (
            <div className="p-4 space-y-4">
              {/* Coin banner */}
              <div className="flex items-center gap-3 p-3 bg-secondary/40 rounded-xl">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-black text-white shrink-0 shadow" style={{background:coinDef?.color??"#6B7280"}}>{coin.slice(0,2)}</div>
                <div className="flex-1">
                  <div className="font-bold text-sm">{coin} · {coinDef?.name}</div>
                  <div className="text-xs text-muted-foreground">{coinNet.name} network · ≈ ${(PRICES[coin]??0).toLocaleString()} per coin</div>
                </div>
                <button onClick={()=>setStep("coin")} className="text-xs text-primary font-semibold hover:underline shrink-0">Change</button>
              </div>

              {/* ── NETWORK SECTION ── */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/40 border-b border-border">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground"/>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Receiving Network & Address</span>
                </div>

                <div className="p-4 space-y-3">
                  {/* ── EVM coin: show chain selector ── */}
                  {coinNet.type === "evm" && (
                    <>
                      {isOnWrongChain && (
                        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"/>
                          <div>
                            <p className="text-[12px] text-amber-300 font-semibold">Wrong network detected</p>
                            <p className="text-[11px] text-amber-300/70 mt-0.5">
                              You're on <strong>{activeChain.name}</strong> but {coin} lives on <strong>{targetChain?.name}</strong>.
                              Switch network so the exchange sends to the right chain.
                            </p>
                          </div>
                        </div>
                      )}
                      {!isOnWrongChain && (
                        <div className="flex items-center gap-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <Check className="w-3.5 h-3.5 text-green-400 shrink-0"/>
                          <span className="text-[11px] text-green-400 font-semibold">Correct network: {activeChain.name}</span>
                        </div>
                      )}

                      {/* Chain grid */}
                      <div>
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Select chain</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {EVM_CHAINS.map(ch => {
                            const isActive = activeChainId === ch.chainId;
                            const isTarget = targetChainId === ch.chainId;
                            return (
                              <button key={ch.chainId}
                                onClick={() => switchChain(ch)}
                                disabled={switchingChain || isActive}
                                className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left",
                                  isActive?"border-primary bg-primary/15 text-primary":
                                  isTarget?"border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15":
                                  "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                                <span className={cn("text-[9px] font-black px-1 py-0.5 rounded shrink-0",
                                  ch.badge==="L1"?"bg-blue-500/15 text-blue-400":ch.badge==="L2"?"bg-violet-500/15 text-violet-400":"bg-orange-500/15 text-orange-400")}>{ch.badge}</span>
                                <span className="truncate">{ch.name}</span>
                                {isActive && <Check className="w-3 h-3 ml-auto shrink-0 text-primary"/>}
                                {switchingChain && isTarget && <RefreshCw className="w-3 h-3 ml-auto shrink-0 animate-spin"/>}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {switchErr && <p className="text-[11px] text-red-400">⚠ {switchErr}</p>}

                      {/* EVM address display */}
                      <div>
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5">Receiving address ({activeChain.name})</p>
                        <div className="flex items-center gap-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <Wallet className="w-3.5 h-3.5 text-green-400 shrink-0"/>
                          <span className="font-mono text-[10px] text-muted-foreground truncate">{address}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">From your connected {walletProvider} wallet</p>
                      </div>
                    </>
                  )}

                  {/* ── Native chain coin: warn + address input ── */}
                  {coinNet.type === "native" && (
                    <>
                      <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"/>
                        <div>
                          <p className="text-[12px] text-amber-300 font-semibold">{coin} lives on the {coinNet.name} network</p>
                          <p className="text-[11px] text-amber-300/70 mt-1 leading-relaxed">
                            Your connected EVM address <strong>will not work</strong> for {coin}.
                            Enter your <strong>{coinNet.name} ({coin}) address</strong> below — this is where the exchange will send your {coin}.
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Your {coin} address</label>
                        <input
                          type="text"
                          value={nativeAddr}
                          onChange={e => { setNativeAddr(e.target.value); setAddrErr(null); }}
                          placeholder={coinNet.addressHint}
                          className={cn("w-full mt-1.5 bg-background border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none transition-colors",
                            addrErr?"border-red-500 focus:border-red-400":"border-border focus:border-primary")}
                        />
                        {addrErr && <p className="text-[11px] text-red-400 mt-1">⚠ {addrErr}</p>}
                        {nativeAddr.length > 20 && !addrErr && (
                          <p className="text-[11px] text-green-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3"/>Address looks valid</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                          Double-check this address — funds sent to a wrong address cannot be recovered.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">You pay</label>
                <div className="flex gap-2 mt-1.5">
                  <select value={fiat} onChange={e=>setFiat(e.target.value)}
                    className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-primary w-24 shrink-0">
                    {FIATS.map(f=><option key={f}>{f}</option>)}
                  </select>
                  <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} min="5"
                    className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-base font-bold focus:outline-none focus:border-primary tabular-nums"/>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {QUICK_AMOUNTS.map(v=>(
                    <button key={v} onClick={()=>setAmount(v)} className={cn("flex-1 py-1.5 text-[11px] rounded-lg border font-bold transition-colors",
                      amount===v?"bg-primary text-primary-foreground border-primary":"border-border text-muted-foreground hover:border-primary/50")}>{v}</button>
                  ))}
                </div>
              </div>

              {/* Live quote */}
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">You receive ≈</span>
                  <div className="text-right">
                    <div className="text-xl font-black text-green-400">{fmtEst} {coin}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">after ~2.5% avg fee · {fiat} {amount}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2 text-[10px] text-green-400/70">
                  <Zap className="w-3 h-3"/> Delivered to your {coinNet.name} address within 5–30 minutes
                </div>
              </div>

              {/* Exchange selector */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Choose exchange ({supportedProviders.length})</label>
                <div className="space-y-2 mt-2">
                  {supportedProviders.length === 0 && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                      <p className="text-sm text-amber-300">No exchange supports {coin} directly.</p>
                      <p className="text-xs text-muted-foreground mt-1">Use OrahDEX P2P to buy {coin}.</p>
                    </div>
                  )}
                  {supportedProviders.map(p => {
                    const sel = providerId===p.id || (!providerId && p.id===supportedProviders[0]?.id);
                    return (
                      <button key={p.id} onClick={()=>setProviderId(p.id)}
                        className={cn("w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all",
                          sel?"border-primary bg-primary/8 shadow-sm":"border-border hover:border-primary/40 hover:bg-white/5")}>
                        <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center text-xl shrink-0">{p.badge}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm">{p.name}</span>
                            <span className={cn("text-[10px] font-bold",p.color)}>★ {p.rating}</span>
                            <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{p.fee}</span>
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {p.methods.map(m=>(
                              <span key={m} className="flex items-center gap-1 text-[10px] bg-secondary/60 px-1.5 py-0.5 rounded text-muted-foreground">
                                {M_ICONS[m]}{M_LABELS[m]}
                              </span>
                            ))}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">Min ${p.minUSD} · Max ${p.maxUSD.toLocaleString()}</div>
                        </div>
                        <div className={cn("w-4 h-4 rounded-full border-2 shrink-0 mt-1 transition-all",sel?"border-primary bg-primary":"border-border")}/>
                      </button>
                    );
                  })}
                </div>
              </div>

              {supportedProviders.length > 0 && (
                <button onClick={validateAndContinue} disabled={numAmt<5}
                  className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
                  Continue → {selectedProvider?`Pay via ${selectedProvider.name}`:"Select exchange"}
                </button>
              )}
            </div>
          )}

          {/* ═══ STEP 4: Checkout ═══ */}
          {step === "checkout" && selectedProvider && (
            <div className="p-4 space-y-4">
              <div className="bg-secondary/40 border border-border rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Order Summary</p>
                <div className="space-y-2.5">
                  {[
                    ["You pay",    `${fiat} ${parseFloat(amount).toLocaleString()}`, ""],
                    ["You receive",`≈ ${fmtEst} ${coin}`,                             "text-green-400"],
                    ["Network",    coinNet.name,                                      "text-blue-400"],
                    ["Exchange",   `${selectedProvider.badge} ${selectedProvider.name}`,""],
                    ["Fee",        selectedProvider.fee,                              ""],
                  ].map(([l,v,c])=>(
                    <div key={l} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{l}</span>
                      <span className={cn("font-semibold text-right max-w-[60%]",c)}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Destination address */}
              <div className="p-4 bg-green-500/10 border border-green-500/25 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-green-400 shrink-0"/>
                  <span className="text-sm font-bold text-green-400">Destination — {coinNet.name} address</span>
                </div>
                <div className="font-mono text-[11px] text-muted-foreground break-all bg-black/20 rounded-lg p-2">
                  {effectiveAddr || <span className="text-muted-foreground/50 italic">No address set</span>}
                </div>
                <p className="text-[10px] text-green-400/70 mt-2">
                  {selectedProvider.name} will send {coin} here after payment is confirmed.
                </p>
              </div>

              {/* Payment method */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Payment method</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {selectedProvider.methods.map(m=>(
                    <button key={m} onClick={()=>setMethod(m)}
                      className={cn("flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all",
                        method===m?"border-primary bg-primary/10 text-foreground":"border-border text-muted-foreground hover:border-primary/40")}>
                      {M_ICONS[m]}<span className="text-xs">{M_LABELS[m]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Primary CTA */}
              <a href={getProviderUrl(selectedProvider.id)} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground py-4 rounded-xl font-black text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20">
                <span className="text-xl">{selectedProvider.badge}</span>
                Buy {coin} with {selectedProvider.name}
                <ExternalLink className="w-4 h-4"/>
              </a>

              {/* Alt providers */}
              {supportedProviders.filter(p=>p.id!==selectedProvider.id).length>0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Other exchanges</p>
                  <div className="space-y-1.5">
                    {supportedProviders.filter(p=>p.id!==selectedProvider.id).map(p=>(
                      <a key={p.id} href={getProviderUrl(p.id)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 w-full bg-secondary/40 border border-border py-2.5 px-3.5 rounded-xl text-sm hover:border-primary/50 transition-colors">
                        <span className="text-lg">{p.badge}</span>
                        <span className="flex-1">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.fee}</span>
                        <ExternalLink className="w-3 h-3 text-muted-foreground"/>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 bg-secondary/40 border border-border rounded-xl">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5"/>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {selectedProvider.name} sends {coin} on the <strong className="text-foreground">{coinNet.name}</strong> network to your address. Typically 5–30 minutes after payment.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
