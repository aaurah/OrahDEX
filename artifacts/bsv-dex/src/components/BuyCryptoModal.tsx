import { useState, useEffect } from "react";
import {
  X, Search, ChevronRight, ExternalLink, CheckCircle,
  Wallet, CreditCard, Building2, Zap, Star, Shield, RefreshCw,
  AlertTriangle, ArrowLeftRight, Check, Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultCoin?: string;
}

interface EvmChain {
  chainId: number; name: string; symbol: string; badge: string; color: string; rpcUrl: string; blockExplorer: string;
}
const EVM_CHAINS: EvmChain[] = [
  { chainId:1,     name:"Ethereum",         symbol:"ETH",  badge:"L1", color:"text-blue-400",   rpcUrl:"https://mainnet.infura.io/v3/",             blockExplorer:"https://etherscan.io" },
  { chainId:56,    name:"BNB Chain",         symbol:"BNB",  badge:"L1", color:"text-yellow-400", rpcUrl:"https://bsc-dataseed.binance.org/",          blockExplorer:"https://bscscan.com" },
  { chainId:137,   name:"Polygon",           symbol:"MATIC",badge:"L2", color:"text-violet-400", rpcUrl:"https://polygon-rpc.com/",                   blockExplorer:"https://polygonscan.com" },
  { chainId:43114, name:"Avalanche C-Chain", symbol:"AVAX", badge:"L1", color:"text-red-400",    rpcUrl:"https://api.avax.network/ext/bc/C/rpc",     blockExplorer:"https://snowtrace.io" },
  { chainId:42161, name:"Arbitrum One",      symbol:"ETH",  badge:"L2", color:"text-blue-300",   rpcUrl:"https://arb1.arbitrum.io/rpc",               blockExplorer:"https://arbiscan.io" },
  { chainId:10,    name:"Optimism",          symbol:"ETH",  badge:"L2", color:"text-red-400",    rpcUrl:"https://mainnet.optimism.io",                blockExplorer:"https://optimistic.etherscan.io" },
  { chainId:8453,  name:"Base",              symbol:"ETH",  badge:"L2", color:"text-blue-400",   rpcUrl:"https://mainnet.base.org",                   blockExplorer:"https://basescan.org" },
  { chainId:250,   name:"Fantom Opera",      symbol:"FTM",  badge:"L1", color:"text-cyan-400",   rpcUrl:"https://rpc.ftm.tools/",                     blockExplorer:"https://ftmscan.com" },
];

interface CoinNet { type:"evm"|"native"; name:string; nativeSymbol:string; defaultChainId?:number; addressHint:string; }
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

const EVM_WALLETS = [
  { id:"metamask", name:"MetaMask",        badge:"🦊", sub:"Most popular · Ethereum + all EVM chains", installUrl:"https://metamask.io/download/" },
  { id:"coinbase", name:"Coinbase Wallet", badge:"🔵", sub:"Self-custody by Coinbase · all EVM chains",  installUrl:"https://www.coinbase.com/wallet/downloads" },
  { id:"trust",    name:"Trust Wallet",    badge:"🛡️", sub:"Multi-chain mobile · EVM + 100+ coins",      installUrl:"https://trustwallet.com/download" },
  { id:"phantom",  name:"Phantom",         badge:"👻", sub:"Multichain — ETH, SOL, BTC",                 installUrl:"https://phantom.app/download" },
  { id:"rainbow",  name:"Rainbow",         badge:"🌈", sub:"Simple Ethereum wallet — L1 & L2",           installUrl:"https://rainbow.me/" },
  { id:"okx",      name:"OKX Wallet",      badge:"⭕", sub:"Web3 gateway by OKX · all EVM networks",     installUrl:"https://www.okx.com/web3" },
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

// ── Payment methods ────────────────────────────────────────────────────────────
type PayMethod = "apple" | "google" | "card" | "bank" | "crypto";

interface PayMethodDef {
  id: PayMethod;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  bg: string;
  border: string;
  text: string;
  badge?: string;
}

const PAY_METHODS: PayMethodDef[] = [
  {
    id: "apple",
    label: "Apple Pay",
    sublabel: "Instant · Touch/Face ID",
    icon: <span className="text-2xl leading-none">🍎</span>,
    bg: "bg-black hover:bg-neutral-900",
    border: "border-neutral-700",
    text: "text-white",
    badge: "INSTANT",
  },
  {
    id: "google",
    label: "Google Pay",
    sublabel: "Instant · Google account",
    icon: (
      <span className="text-2xl leading-none font-black" style={{background:"linear-gradient(90deg,#4285F4,#EA4335,#FBBC04,#34A853)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>G</span>
    ),
    bg: "bg-white hover:bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-900",
    badge: "INSTANT",
  },
  {
    id: "card",
    label: "Credit / Debit Card",
    sublabel: "Visa · Mastercard · Amex",
    icon: <CreditCard className="w-7 h-7 text-blue-400" />,
    bg: "bg-gradient-to-br from-blue-950/60 to-blue-900/40 hover:from-blue-950/80",
    border: "border-blue-500/30",
    text: "text-white",
    badge: "POPULAR",
  },
  {
    id: "bank",
    label: "Bank Transfer",
    sublabel: "SEPA · ACH · Wire · SWIFT",
    icon: <Building2 className="w-7 h-7 text-emerald-400" />,
    bg: "bg-gradient-to-br from-emerald-950/60 to-emerald-900/40 hover:from-emerald-950/80",
    border: "border-emerald-500/30",
    text: "text-white",
  },
  {
    id: "crypto",
    label: "Pay with Crypto",
    sublabel: "BTC · ETH · USDT · stablecoins",
    icon: <span className="text-2xl leading-none">₿</span>,
    bg: "bg-gradient-to-br from-amber-950/60 to-amber-900/40 hover:from-amber-950/80",
    border: "border-amber-500/30",
    text: "text-white",
  },
];

// ── Provider registry ──────────────────────────────────────────────────────────
interface ProviderDef {
  id:string; name:string; badge:string; color:string; fee:string;
  minUSD:number; maxUSD:number; methods:PayMethod[]; coins:string[]; rating:number;
  kycLevel: "none"|"light"|"full";
  baseUrl:string;
  params:(coin:string,fiat:string,amount:string,method:PayMethod,addr:string)=>Record<string,string>;
}

const PROVIDERS: ProviderDef[] = [
  {
    id:"moonpay", name:"MoonPay", badge:"🌙", color:"text-violet-400", fee:"1–4.5%", minUSD:30, maxUSD:50000, rating:4.8, kycLevel:"light",
    methods:["card","apple","google","bank"],
    coins:["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","LINK","DOT","LTC","BCH","UNI","NEAR","ARB","OP","SUI","BSV"],
    baseUrl:"https://buy.moonpay.com",
    params:(coin,fiat,amt,m,addr)=>({ currencyCode:coin.toLowerCase(), baseCurrencyCode:fiat.toLowerCase(), baseCurrencyAmount:amt,
      paymentMethod:m==="card"?"credit_debit_card":m==="bank"?"sepa_bank_transfer":m, ...(addr?{walletAddress:addr}:{}) }),
  },
  {
    id:"transak", name:"Transak", badge:"⚡", color:"text-cyan-400", fee:"0.99–2.5%", minUSD:15, maxUSD:25000, rating:4.6, kycLevel:"light",
    methods:["card","apple","google","bank"],
    coins:["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","LINK","DOT","ATOM","LTC","UNI","NEAR","ARB","APT","INJ"],
    baseUrl:"https://global.transak.com",
    params:(coin,fiat,amt,_m,addr)=>({ cryptoCurrencyCode:coin, defaultFiatCurrency:fiat, fiatAmount:amt, network:"mainnet", ...(addr?{walletAddress:addr}:{}) }),
  },
  {
    id:"ramp", name:"Ramp Network", badge:"🔵", color:"text-blue-300", fee:"0.49–2.9%", minUSD:5, maxUSD:10000, rating:4.7, kycLevel:"light",
    methods:["card","apple","google","bank"],
    coins:["BTC","ETH","SOL","MATIC","AVAX","DOT","UNI","LINK","ARB","OP","APT","NEAR","DOGE"],
    baseUrl:"https://app.ramp.network",
    params:(coin,fiat,amt,_m,addr)=>({ swapAsset:coin, fiatCurrency:fiat, fiatValue:amt, ...(addr?{userAddress:addr}:{}) }),
  },
  {
    id:"banxa", name:"Banxa", badge:"🏦", color:"text-emerald-400", fee:"1–3%", minUSD:50, maxUSD:100000, rating:4.4, kycLevel:"full",
    methods:["card","bank"],
    coins:["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","LTC","BCH","DOT","LINK"],
    baseUrl:"https://checkout.banxa.com",
    params:(coin,fiat,amt,_m,addr)=>({ coinType:coin, fiatType:fiat, fiatAmount:amt, ...(addr?{walletAddress:addr}:{}) }),
  },
  {
    id:"simplex", name:"Simplex", badge:"💎", color:"text-blue-400", fee:"3.5–5%", minUSD:50, maxUSD:20000, rating:4.2, kycLevel:"light",
    methods:["card","apple","google"],
    coins:["BTC","ETH","XRP","BNB","ADA","DOGE","LTC","BCH","MATIC","LINK","DOT"],
    baseUrl:"https://checkout.simplexcc.com",
    params:(coin,fiat,amt)=>({ crypto_currency:coin, fiat_currency:fiat, requested_amount:amt, requested_currency:fiat }),
  },
  {
    id:"mercuryo", name:"Mercuryo", badge:"☿", color:"text-orange-400", fee:"2.5–3.9%", minUSD:30, maxUSD:15000, rating:4.3, kycLevel:"light",
    methods:["card","apple","google","bank"],
    coins:["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","DOT","ATOM","LTC","BCH"],
    baseUrl:"https://exchange.mercuryo.io",
    params:(coin,fiat,amt,_m,addr)=>({ currency:coin, fiat_currency:fiat, amount:amt, ...(addr?{address:addr}:{}) }),
  },
  {
    id:"alchemypay", name:"Alchemy Pay", badge:"⚗️", color:"text-purple-400", fee:"1.5–3%", minUSD:10, maxUSD:20000, rating:4.5, kycLevel:"light",
    methods:["card","apple","google","bank","crypto"],
    coins:["BTC","ETH","SOL","BNB","ADA","MATIC","AVAX","DOT","LINK","UNI","ARB","OP","APT","NEAR","INJ","SUI"],
    baseUrl:"https://ramp.alchemypay.org",
    params:(coin,fiat,amt,_m,addr)=>({ crypto:coin, fiat:fiat, amount:amt, ...(addr?{address:addr}:{}) }),
  },
  {
    id:"paybis", name:"Paybis", badge:"💳", color:"text-pink-400", fee:"1.5–4%", minUSD:50, maxUSD:20000, rating:4.1, kycLevel:"light",
    methods:["card","bank"],
    coins:["BTC","ETH","XRP","BNB","LTC","BCH","DOGE","MATIC","DOT"],
    baseUrl:"https://paybis.com/buy-cryptocurrency",
    params:(coin,fiat,amt)=>({ from:fiat, to:coin, amount:amt }),
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

const FIATS = ["USD","EUR","GBP","AUD","CAD","SGD","JPY","AED","INR","BRL","MXN","CHF"];
const QUICK_AMOUNTS = ["50","100","250","500","1000","2500"];
const PRICES: Record<string,number> = {
  BTC:68000,ETH:3400,BSV:55,SOL:145,XRP:0.52,BNB:390,ADA:0.44,DOGE:0.12,
  AVAX:36,MATIC:0.72,LINK:14.5,DOT:6.8,UNI:9.8,ATOM:8.4,LTC:78,BCH:384,
  NEAR:6.5,APT:10.5,ARB:1.1,OP:2.4,SUI:1.2,INJ:28,
};

const KYC_LABEL: Record<string,string> = { none:"No KYC", light:"Light KYC", full:"Full KYC" };
const KYC_COLOR: Record<string,string> = { none:"text-green-400", light:"text-amber-400", full:"text-red-400" };

type Step = "connect" | "coin" | "method" | "quote" | "checkout";
const STEPS: Step[] = ["connect","coin","method","quote","checkout"];
const STEP_LABELS = ["Connect","Select","Pay","Quote","Confirm"];

export function BuyCryptoModal({ open, onClose, defaultCoin = "BTC" }: Props) {
  const { address, provider: walletProvider, chainId: connectedChainId } = useWalletStore();
  const connectWallet = useWalletStore(s => s.connect);

  const [step, setStep]           = useState<Step>("connect");
  const [coin, setCoin]           = useState(defaultCoin);
  const [fiat, setFiat]           = useState("USD");
  const [amount, setAmount]       = useState("100");
  const [search, setSearch]       = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  const [providerId, setProviderId] = useState("");

  const [walletTab, setWalletTab]         = useState<"evm"|"bsv">("evm");
  const [connecting, setConnecting]       = useState<string|null>(null);
  const [connectErr, setConnectErr]       = useState<string|null>(null);

  const [nativeAddr, setNativeAddr]       = useState("");
  const [addrErr, setAddrErr]             = useState<string|null>(null);
  const [switchingChain, setSwitchingChain] = useState(false);
  const [switchErr, setSwitchErr]         = useState<string|null>(null);
  const [switchedChainId, setSwitchedChainId] = useState<number|null>(null);

  useEffect(() => {
    if (open) {
      setStep(address ? "coin" : "connect");
      setCoin(defaultCoin); setSearch(""); setAmount("100"); setPayMethod("card");
      setProviderId(""); setNativeAddr(""); setAddrErr(null); setSwitchErr(null); setSwitchedChainId(null);
    }
  }, [open, defaultCoin]);

  useEffect(() => { if (step === "connect" && address) setStep("coin"); }, [address, step]);
  useEffect(() => { setNativeAddr(""); setAddrErr(null); setSwitchErr(null); setSwitchedChainId(null); }, [coin]);

  if (!open) return null;

  const coinNet  = COIN_NETWORKS[coin] ?? { type:"native", name:coin, nativeSymbol:coin, addressHint:"Enter your address" };
  const coinDef  = COINS.find(c => c.symbol === coin);

  const supportedProviders = PROVIDERS.filter(p => p.coins.includes(coin) && p.methods.includes(payMethod));
  const allProvidersForCoin = PROVIDERS.filter(p => p.coins.includes(coin));
  const selectedProvider   = PROVIDERS.find(p => p.id === providerId) ?? supportedProviders[0];
  const filteredCoins = COINS.filter(c => !search || c.symbol.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()));

  const effectiveAddr = coinNet.type === "native" ? nativeAddr : (address ?? "");

  const numAmt    = parseFloat(amount) || 0;
  const fiatToUSD = fiat==="EUR"?1.08:fiat==="GBP"?1.27:fiat==="AUD"?0.65:fiat==="CAD"?0.74:1;
  const est       = (numAmt * fiatToUSD * 0.975) / (PRICES[coin] ?? 1);
  const fmtEst    = est >= 1 ? est.toFixed(6) : est >= 0.0001 ? est.toFixed(8) : est.toExponential(4);

  const activeChainId   = switchedChainId ?? connectedChainId ?? 1;
  const activeChain     = EVM_CHAINS.find(c => c.chainId === activeChainId) ?? EVM_CHAINS[0];
  const targetChainId   = coinNet.defaultChainId;
  const targetChain     = targetChainId ? EVM_CHAINS.find(c => c.chainId === targetChainId) : null;
  const isOnWrongChain  = coinNet.type === "evm" && targetChainId && activeChainId !== targetChainId;

  async function switchChain(chain: EvmChain) {
    const eth = (window as any).ethereum;
    if (!eth) { setSwitchErr("No EVM wallet found."); return; }
    setSwitchingChain(true); setSwitchErr(null);
    const hexId = "0x" + chain.chainId.toString(16);
    try {
      await eth.request({ method:"wallet_switchEthereumChain", params:[{ chainId:hexId }] });
    } catch(err: any) {
      if (err?.code === 4902) {
        try {
          await eth.request({ method:"wallet_addEthereumChain", params:[{ chainId:hexId, chainName:chain.name,
            nativeCurrency:{ name:chain.symbol, symbol:chain.symbol, decimals:18 },
            rpcUrls:[chain.rpcUrl], blockExplorerUrls:[chain.blockExplorer] }]});
        } catch(e2:any) { setSwitchErr(e2?.message ?? "Failed to add network."); setSwitchingChain(false); return; }
      } else { setSwitchErr(err?.message ?? "Network switch rejected."); setSwitchingChain(false); return; }
    }
    setSwitchedChainId(chain.chainId);
    connectWallet({ address:address!, provider:walletProvider??"evm", network:"evm", chainId:chain.chainId });
    setSwitchingChain(false);
  }

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
    setCoin(sym); setSearch(""); setNativeAddr(""); setAddrErr(null); setStep("method");
  }

  function selectMethod(m: PayMethod) {
    setPayMethod(m);
    const prov = PROVIDERS.find(p => p.coins.includes(coin) && p.methods.includes(m));
    setProviderId(prov?.id ?? "");
    setStep("quote");
  }

  function getProviderUrl(pId: string) {
    const p = PROVIDERS.find(x => x.id === pId);
    if (!p) return "#";
    return `${p.baseUrl}?${new URLSearchParams(p.params(coin,fiat,amount,payMethod,effectiveAddr))}`;
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
    else if (step==="quote") setStep("method");
    else if (step==="method") setStep("coin");
    else if (step==="coin" && !address) setStep("connect");
  }

  const curIdx = STEPS.indexOf(step);
  const payMethodDef = PAY_METHODS.find(m => m.id === payMethod)!;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-[500px] bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[93vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {step !== "connect" && (
              <button onClick={goBack} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">←</button>
            )}
            <div>
              <h2 className="text-base font-bold">Buy Crypto</h2>
              <p className="text-[11px] text-muted-foreground">
                {step==="connect" && "Step 1 — Connect your wallet"}
                {step==="coin"    && "Step 2 — Choose which coin to buy"}
                {step==="method"  && `Step 3 — How do you want to pay?`}
                {step==="quote"   && `Step 4 — Amount & provider · ${supportedProviders.length} available`}
                {step==="checkout"&& "Step 5 — Review & confirm"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><X className="w-4 h-4"/></button>
        </div>

        {/* Step bar */}
        <div className="flex border-b border-border shrink-0 bg-secondary/20">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex items-center justify-center py-2 gap-1">
              <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black",
                i<curIdx?"bg-green-500 text-white":i===curIdx?"bg-primary text-primary-foreground":"bg-secondary text-muted-foreground")}>
                {i<curIdx?"✓":i+1}
              </div>
              <span className={cn("text-[9px] font-semibold hidden sm:inline", i===curIdx?"text-foreground":"text-muted-foreground")}>{STEP_LABELS[i]}</span>
            </div>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">

          {/* ═══ STEP 1: Connect Wallet ═══ */}
          {step === "connect" && (
            <div className="p-4 space-y-4">
              {/* Skip option */}
              <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <Smartphone className="w-4 h-4 text-blue-400 shrink-0"/>
                <div className="flex-1 text-[11px] text-blue-300 leading-relaxed">
                  No wallet? You can still buy crypto — just enter your receiving address in the next steps.
                </div>
                <button onClick={() => setStep("coin")} className="shrink-0 text-[11px] font-bold text-blue-400 hover:underline">Skip →</button>
              </div>

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
              {connectErr && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5"/>
                  <p className="text-[11px] text-red-300">{connectErr}</p>
                </div>
              )}
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
                        <div className="font-bold text-sm">{w.name}</div>
                        <div className="text-[11px] text-muted-foreground">{(w as any).sub}</div>
                      </div>
                      {isConn && <span className="text-[10px] text-primary font-semibold animate-pulse">Connecting…</span>}
                      {!isConn && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0"/>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ STEP 2: Select Coin ═══ */}
          {step === "coin" && (
            <div className="p-4 space-y-4">
              {address && (
                <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/25 rounded-xl">
                  <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center shrink-0"><Wallet className="w-3.5 h-3.5 text-green-400"/></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-green-400">Wallet connected · {walletProvider}</div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate">{address}</div>
                  </div>
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search coin…" autoFocus
                  className="w-full bg-secondary/60 border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary"/>
              </div>
              {!search && <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1"><Star className="w-3 h-3 text-amber-400 fill-amber-400"/>Popular coins</p>}
              <div className="space-y-1.5">
                {filteredCoins.map(c => {
                  const net = COIN_NETWORKS[c.symbol];
                  const pCount = PROVIDERS.filter(p => p.coins.includes(c.symbol)).length;
                  return (
                    <button key={c.symbol} onClick={()=>selectCoin(c.symbol)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left group">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-black text-white shrink-0 shadow" style={{background:c.color}}>{c.symbol.slice(0,2)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{c.symbol}</span>
                          <span className="text-xs text-muted-foreground">{c.name}</span>
                          {net?.type==="native" && <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold">Native</span>}
                          {net?.type==="evm"    && <span className="text-[9px] bg-blue-500/15 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-bold">EVM</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">{net?.name ?? c.name} network</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-semibold">${(PRICES[c.symbol]??0).toLocaleString(undefined,{maximumFractionDigits:4})}</div>
                        <div className="text-[10px] text-muted-foreground">{pCount} providers</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0"/>
                    </button>
                  );
                })}
                {filteredCoins.length===0 && <p className="text-center text-muted-foreground text-sm py-8">No coins found for "{search}"</p>}
              </div>
            </div>
          )}

          {/* ═══ STEP 3: Payment Method ═══ */}
          {step === "method" && (
            <div className="p-4 space-y-4">
              {/* Selected coin */}
              <div className="flex items-center gap-3 p-3 bg-secondary/40 rounded-xl">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-black text-white shrink-0" style={{background:coinDef?.color??"#6B7280"}}>{coin.slice(0,2)}</div>
                <div className="flex-1">
                  <div className="font-bold text-sm">{coin} · {coinDef?.name}</div>
                  <div className="text-xs text-muted-foreground">{allProvidersForCoin.length} providers available</div>
                </div>
                <button onClick={()=>setStep("coin")} className="text-xs text-primary font-semibold hover:underline shrink-0">Change</button>
              </div>

              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">How would you like to pay?</p>

              {/* Big payment method cards */}
              <div className="grid grid-cols-1 gap-2.5">
                {PAY_METHODS.map(m => {
                  const provCount = PROVIDERS.filter(p => p.coins.includes(coin) && p.methods.includes(m.id)).length;
                  return (
                    <button key={m.id} onClick={()=>selectMethod(m.id)}
                      disabled={provCount === 0}
                      className={cn(
                        "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border text-left transition-all group",
                        m.bg, m.border, m.text,
                        provCount===0 && "opacity-30 cursor-not-allowed saturate-0"
                      )}>
                      <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                        {m.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-base">{m.label}</span>
                          {m.badge && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-green-500 text-white tracking-wider">{m.badge}</span>
                          )}
                        </div>
                        <div className={cn("text-[11px] mt-0.5 opacity-70")}>{m.sublabel}</div>
                        <div className="text-[10px] mt-1 opacity-50">{provCount} provider{provCount!==1?"s":""} · {PROVIDERS.filter(p=>p.coins.includes(coin)&&p.methods.includes(m.id)).map(p=>p.name).join(", ")}</div>
                      </div>
                      <ChevronRight className={cn("w-5 h-5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity", provCount===0?"hidden":"")}/>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 p-3 bg-secondary/40 border border-border rounded-xl">
                <Shield className="w-4 h-4 text-green-400 shrink-0"/>
                <p className="text-[11px] text-muted-foreground">All payment providers are regulated and use bank-grade encryption. OrahDEX never sees your payment details.</p>
              </div>
            </div>
          )}

          {/* ═══ STEP 4: Quote ═══ */}
          {step === "quote" && (
            <div className="p-4 space-y-4">
              {/* Summary pills */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/60 border border-border rounded-xl">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{background:coinDef?.color??"#6B7280"}}>{coin.slice(0,2)}</div>
                  <span className="text-xs font-bold">{coin}</span>
                </div>
                {payMethodDef && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/60 border border-border rounded-xl">
                    <span className="text-sm">{payMethodDef.id==="apple"?"🍎":payMethodDef.id==="google"?"G":payMethodDef.id==="card"?"💳":payMethodDef.id==="bank"?"🏦":"₿"}</span>
                    <span className="text-xs font-bold">{payMethodDef.label}</span>
                  </div>
                )}
                <button onClick={()=>setStep("method")} className="text-[10px] text-primary font-semibold hover:underline ml-auto">Change method</button>
              </div>

              {/* Network section */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/40 border-b border-border">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground"/>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Receiving Address</span>
                </div>
                <div className="p-4 space-y-3">
                  {coinNet.type === "evm" && (
                    <>
                      {isOnWrongChain && (
                        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"/>
                          <div>
                            <p className="text-[12px] text-amber-300 font-semibold">Wrong network detected</p>
                            <p className="text-[11px] text-amber-300/70 mt-0.5">You&apos;re on <strong>{activeChain.name}</strong> but {coin} lives on <strong>{targetChain?.name}</strong>.</p>
                          </div>
                        </div>
                      )}
                      {!isOnWrongChain && (
                        <div className="flex items-center gap-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <Check className="w-3.5 h-3.5 text-green-400 shrink-0"/>
                          <span className="text-[11px] text-green-400 font-semibold">Correct network: {activeChain.name}</span>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Select chain</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {EVM_CHAINS.map(ch => {
                            const isActive = activeChainId === ch.chainId;
                            const isTarget = targetChainId === ch.chainId;
                            return (
                              <button key={ch.chainId} onClick={() => switchChain(ch)} disabled={switchingChain || isActive}
                                className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left",
                                  isActive?"border-primary bg-primary/15 text-primary":
                                  isTarget?"border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15":
                                  "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                                <span className={cn("text-[9px] font-black px-1 py-0.5 rounded shrink-0",
                                  ch.badge==="L1"?"bg-blue-500/15 text-blue-400":"bg-violet-500/15 text-violet-400")}>{ch.badge}</span>
                                <span className="truncate">{ch.name}</span>
                                {isActive && <Check className="w-3 h-3 ml-auto shrink-0 text-primary"/>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {switchErr && <p className="text-[11px] text-red-400">⚠ {switchErr}</p>}
                      <div>
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5">Receiving address</p>
                        <div className="flex items-center gap-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <Wallet className="w-3.5 h-3.5 text-green-400 shrink-0"/>
                          <span className="font-mono text-[10px] text-muted-foreground truncate">{address}</span>
                        </div>
                      </div>
                    </>
                  )}
                  {coinNet.type === "native" && (
                    <>
                      <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"/>
                        <p className="text-[11px] text-amber-300/80 leading-relaxed">
                          {coin} requires a native <strong>{coinNet.name}</strong> address — your EVM address won&apos;t work here.
                        </p>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Your {coin} address</label>
                        <input type="text" value={nativeAddr} onChange={e=>{setNativeAddr(e.target.value);setAddrErr(null);}}
                          placeholder={coinNet.addressHint}
                          className={cn("w-full mt-1.5 bg-background border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none transition-colors",
                            addrErr?"border-red-500 focus:border-red-400":"border-border focus:border-primary")}/>
                        {addrErr && <p className="text-[11px] text-red-400 mt-1">⚠ {addrErr}</p>}
                        {nativeAddr.length>20 && !addrErr && (
                          <p className="text-[11px] text-green-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3"/>Address looks valid</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 mt-1.5">Double-check this — funds sent to a wrong address cannot be recovered.</p>
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

              {/* Provider selector */}
              {supportedProviders.length === 0 ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                  <p className="text-sm text-amber-300">No provider supports {coin} with {payMethodDef?.label}.</p>
                  <button onClick={()=>setStep("method")} className="text-xs text-primary font-semibold mt-1 hover:underline">Try another payment method →</button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Choose provider ({supportedProviders.length})</label>
                    <div className="space-y-2 mt-2">
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
                                <span className={cn("text-[9px] font-semibold",KYC_COLOR[p.kycLevel])}>{KYC_LABEL[p.kycLevel]}</span>
                              </div>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {p.methods.map(m=>{
                                  const md = PAY_METHODS.find(x=>x.id===m);
                                  return (
                                    <span key={m} className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                                      m===payMethod?"bg-primary/20 text-primary border border-primary/30":"bg-secondary/60 text-muted-foreground")}>
                                      {m==="apple"?"🍎 Apple":m==="google"?"G Pay":m==="card"?"💳 Card":m==="bank"?"🏦 Bank":"₿ Crypto"}
                                    </span>
                                  );
                                })}
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-1">Min ${p.minUSD} · Max ${p.maxUSD.toLocaleString()}</div>
                            </div>
                            <div className={cn("w-4 h-4 rounded-full border-2 shrink-0 mt-1 transition-all",sel?"border-primary bg-primary":"border-border")}/>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button onClick={validateAndContinue} disabled={numAmt<5}
                    className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
                    Continue → {selectedProvider?`Pay via ${selectedProvider.name}`:"Select provider"}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ═══ STEP 5: Checkout ═══ */}
          {step === "checkout" && selectedProvider && (
            <div className="p-4 space-y-4">

              {/* Order summary */}
              <div className="bg-secondary/40 border border-border rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Order Summary</p>
                <div className="space-y-2.5">
                  {[
                    ["You pay",    `${fiat} ${parseFloat(amount).toLocaleString()}`, ""],
                    ["You receive",`≈ ${fmtEst} ${coin}`,                             "text-green-400"],
                    ["Network",    coinNet.name,                                      "text-blue-400"],
                    ["Provider",   `${selectedProvider.badge} ${selectedProvider.name}`,""],
                    ["Fee",        selectedProvider.fee,                              ""],
                    ["KYC",        KYC_LABEL[selectedProvider.kycLevel],             KYC_COLOR[selectedProvider.kycLevel]],
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
                  <span className="text-sm font-bold text-green-400">Receiving — {coinNet.name}</span>
                </div>
                <div className="font-mono text-[11px] text-muted-foreground break-all bg-black/20 rounded-lg p-2">
                  {effectiveAddr || <span className="text-muted-foreground/50 italic">No address set</span>}
                </div>
              </div>

              {/* Payment method selector (compact, in checkout for last-minute switch) */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Payment method</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {selectedProvider.methods.map(m => {
                    const md = PAY_METHODS.find(x=>x.id===m)!;
                    return (
                      <button key={m} onClick={()=>setPayMethod(m)}
                        className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all",
                          payMethod===m?"border-primary bg-primary/10 text-foreground":"border-border text-muted-foreground hover:border-primary/40")}>
                        <span className="text-base leading-none">{m==="apple"?"🍎":m==="google"?"G":m==="card"?"💳":m==="bank"?"🏦":"₿"}</span>
                        <span className="text-xs">{md?.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Primary CTA */}
              <a href={getProviderUrl(selectedProvider.id)} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground py-4 rounded-xl font-black text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20">
                <span className="text-xl">{selectedProvider.badge}</span>
                Buy {coin} via {selectedProvider.name}
                <ExternalLink className="w-4 h-4"/>
              </a>

              {/* Other providers */}
              {supportedProviders.filter(p=>p.id!==selectedProvider.id).length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Other providers</p>
                  <div className="space-y-1.5">
                    {supportedProviders.filter(p=>p.id!==selectedProvider.id).map(p=>(
                      <a key={p.id} href={getProviderUrl(p.id)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 w-full bg-secondary/40 border border-border py-2.5 px-3.5 rounded-xl text-sm hover:border-primary/50 transition-colors">
                        <span className="text-lg">{p.badge}</span>
                        <span className="flex-1 font-medium">{p.name}</span>
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
                  {selectedProvider.name} sends {coin} to your {coinNet.name} address. Typically within 5–30 minutes of payment confirmation. OrahDEX never handles your funds.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
