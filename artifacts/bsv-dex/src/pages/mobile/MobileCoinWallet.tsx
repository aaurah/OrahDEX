/**
 * MobileCoinWallet.tsx
 *
 * Individual coin wallet page — CoinSpot-style UI.
 * Shows balance, price history chart, receive/send flows.
 *
 * Route: /portfolio/:coin
 */

import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Bell, Star, ChevronRight, X, Copy, Check,
  TrendingUp, TrendingDown, Loader2, ArrowDownLeft, ArrowUpRight,
  Info, AlertCircle, CheckCircle2,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from "recharts";
import { QRCodeCanvas } from "qrcode.react";
import { useWalletStore } from "@/store/useWalletStore";
import { API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { validateAltChainAddress } from "@/lib/addressValidation";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Asset metadata ──────────────────────────────────────────────────────────

const ASSET_COLORS: Record<string, string> = {
  USDT: "#22C55E", USDC: "#3B82F6", DAI: "#EAB308",
  BTC: "#F97316", BSV: "#22C55E", BCH: "#8DC351", LTC: "#A0A0A0",
  DOGE: "#C8A300", DASH: "#008DE4", ZEC: "#F4B728", XMR: "#FF6600",
  ETH: "#8B5CF6", BNB: "#EAB308", SOL: "#9945FF", XRP: "#00A9E0",
  ADA: "#0033AD", TRX: "#EF4444", TON: "#0088CC", MATIC: "#7C3AED",
  AVAX: "#E84142", DOT: "#E6007A", ATOM: "#2E3148", NEAR: "#00C08B",
  FTM: "#1969FF", ALGO: "#00B4D8", XLM: "#7D00FF", HBAR: "#222C6E",
  ARB: "#2D374B", OP: "#FF0420", SUI: "#4DA2FF", APT: "#00B4D8",
  LINK: "#2563EB", UNI: "#FF007A", AAVE: "#B6509E",
  SHIB: "#FFA409", PEPE: "#00A86B", BONK: "#FF9900",
  FIL: "#0090FF", ICP: "#F15A24", VET: "#15BDFF", ETC: "#669073",
  KAS: "#70C7BA", STX: "#5546FF", EGLD: "#23F7DD", EOS: "#443F54",
};

const ASSET_NAMES: Record<string, string> = {
  BTC: "Bitcoin", BSV: "Bitcoin SV", BCH: "Bitcoin Cash",
  ETH: "Ethereum", BNB: "BNB", SOL: "Solana",
  XRP: "XRP", ADA: "Cardano", DOGE: "Dogecoin",
  LTC: "Litecoin", DOT: "Polkadot", MATIC: "Polygon",
  AVAX: "Avalanche", SHIB: "Shiba Inu", ATOM: "Cosmos",
  LINK: "Chainlink", UNI: "Uniswap", AAVE: "Aave",
  USDT: "Tether USD", USDC: "USD Coin", DAI: "Dai",
  TRX: "TRON", TON: "The Open Network", NEAR: "NEAR Protocol",
  XLM: "Stellar", ALGO: "Algorand", VET: "VeChain",
  FTM: "Fantom", ARB: "Arbitrum", OP: "Optimism",
  SUI: "Sui", APT: "Aptos", ICP: "Internet Computer",
  HBAR: "Hedera", FIL: "Filecoin", EOS: "EOS",
  DASH: "Dash", ZEC: "Zcash", XMR: "Monero",
  KAS: "Kaspa", STX: "Stacks", EGLD: "MultiversX",
  ETC: "Ethereum Classic", BONK: "Bonk", PEPE: "Pepe",
};

// ── Per-asset network config ─────────────────────────────────────────────────

interface AssetNet {
  network: string;
  networkLabel: string;
  placeholder: string;
}

const ASSET_NET_MAP: Record<string, AssetNet> = {
  BTC:  { network: "btc",  networkLabel: "Bitcoin",            placeholder: "bc1... or 1... or 3..." },
  BSV:  { network: "bsv",  networkLabel: "Bitcoin SV",         placeholder: "1... (BSV P2PKH)" },
  BCH:  { network: "bch",  networkLabel: "Bitcoin Cash",       placeholder: "1... (BCH address)" },
  LTC:  { network: "ltc",  networkLabel: "Litecoin",           placeholder: "L... or ltc1..." },
  DOGE: { network: "doge", networkLabel: "Dogecoin",           placeholder: "D... (DOGE address)" },
  DASH: { network: "dash", networkLabel: "Dash",               placeholder: "X... (Dash address)" },
  ZEC:  { network: "zec",  networkLabel: "Zcash",              placeholder: "t1... (Zcash address)" },
  XMR:  { network: "xmr",  networkLabel: "Monero",             placeholder: "4... (Monero address)" },
  ETH:  { network: "evm",  networkLabel: "Ethereum",           placeholder: "0x... (EVM address)" },
  BNB:  { network: "evm",  networkLabel: "BNB Smart Chain",    placeholder: "0x... (BEP-20 address)" },
  MATIC:{ network: "evm",  networkLabel: "Polygon",            placeholder: "0x... (Polygon address)" },
  AVAX: { network: "evm",  networkLabel: "Avalanche C-Chain",  placeholder: "0x... (Avalanche address)" },
  FTM:  { network: "evm",  networkLabel: "Fantom",             placeholder: "0x... (Fantom address)" },
  ARB:  { network: "evm",  networkLabel: "Arbitrum One",       placeholder: "0x... (Arbitrum address)" },
  OP:   { network: "evm",  networkLabel: "Optimism",           placeholder: "0x... (Optimism address)" },
  ETC:  { network: "evm",  networkLabel: "Ethereum Classic",   placeholder: "0x... (ETC address)" },
  SOL:  { network: "sol",  networkLabel: "Solana",             placeholder: "Solana wallet address" },
  TRX:  { network: "tron", networkLabel: "TRON Network",       placeholder: "T... (TRON address)" },
  XRP:  { network: "xrp",  networkLabel: "XRP Ledger",         placeholder: "r... (XRP address)" },
  ADA:  { network: "ada",  networkLabel: "Cardano",            placeholder: "addr1... (Cardano address)" },
  DOT:  { network: "dot",  networkLabel: "Polkadot",           placeholder: "1... (Polkadot address)" },
  ATOM: { network: "cosmos",networkLabel: "Cosmos Hub",        placeholder: "cosmos1... address" },
  TON:  { network: "ton",  networkLabel: "The Open Network",   placeholder: "EQ... or UQ... address" },
  NEAR: { network: "near", networkLabel: "NEAR Protocol",      placeholder: "account.near" },
  XLM:  { network: "xlm",  networkLabel: "Stellar",            placeholder: "G... (Stellar address)" },
  ALGO: { network: "algo", networkLabel: "Algorand",           placeholder: "A... (Algorand address)" },
  HBAR: { network: "hbar", networkLabel: "Hedera",             placeholder: "0.0.XXXXX (Hedera ID)" },
  SUI:  { network: "sui",  networkLabel: "Sui Network",        placeholder: "0x... (Sui address)" },
  APT:  { network: "apt",  networkLabel: "Aptos",              placeholder: "0x... (Aptos address)" },
  FIL:  { network: "fil",  networkLabel: "Filecoin",           placeholder: "f1... (Filecoin address)" },
  ICP:  { network: "icp",  networkLabel: "Internet Computer",  placeholder: "ICP principal or account" },
  VET:  { network: "vet",  networkLabel: "VeChain",            placeholder: "0x... (VeChain address)" },
  EOS:  { network: "eos",  networkLabel: "EOS Network",        placeholder: "accountname (EOS)" },
  KAS:  { network: "kas",  networkLabel: "Kaspa",              placeholder: "kaspa:... (Kaspa address)" },
  STX:  { network: "stx",  networkLabel: "Stacks",             placeholder: "SP... (Stacks address)" },
  EGLD: { network: "egld", networkLabel: "MultiversX",         placeholder: "erd1... (MultiversX address)" },
};

// EVM tokens default to EVM
function getAssetNet(coin: string): AssetNet {
  return ASSET_NET_MAP[coin] ?? { network: "evm", networkLabel: "Ethereum", placeholder: "0x... (EVM address)" };
}

// ── Receive networks per asset ───────────────────────────────────────────────

interface ReceiveNetwork { label: string; sublabel: string; network: string; }

const EVM_RECEIVE_OPTIONS: ReceiveNetwork[] = [
  { label: "Ethereum",      sublabel: "ERC-20",  network: "evm" },
  { label: "BNB Smart Chain",sublabel: "BEP-20", network: "evm" },
  { label: "Polygon",       sublabel: "Polygon", network: "evm" },
  { label: "Optimism",      sublabel: "EVM L2",  network: "evm" },
  { label: "Base",          sublabel: "EVM L2",  network: "evm" },
  { label: "Arbitrum One",  sublabel: "EVM L2",  network: "evm" },
  { label: "zkSync Era",    sublabel: "EVM L2",  network: "evm" },
  { label: "Avalanche",     sublabel: "C-Chain", network: "evm" },
];

function getReceiveNetworks(coin: string): ReceiveNetwork[] {
  const net = getAssetNet(coin).network;
  if (net === "evm")  return EVM_RECEIVE_OPTIONS;
  if (net === "bsv")  return [{ label: "Bitcoin SV", sublabel: "BSV", network: "bsv" }];
  if (net === "btc")  return [{ label: "Bitcoin", sublabel: "Native", network: "btc" }, { label: "BNB Smart Chain (BTCB)", sublabel: "BEP-20", network: "evm" }];
  if (net === "sol")  return [{ label: "Solana", sublabel: "SPL", network: "sol" }];
  if (net === "tron") return [{ label: "TRON Network", sublabel: "TRC-20", network: "tron" }];
  if (net === "xrp")  return [{ label: "XRP Ledger", sublabel: "Native", network: "xrp" }];
  if (net === "ada")  return [{ label: "Cardano", sublabel: "Native ADA", network: "ada" }];
  if (net === "dot")  return [{ label: "Polkadot", sublabel: "DOT", network: "dot" }];
  if (net === "ton")  return [{ label: "The Open Network", sublabel: "TON", network: "ton" }];
  const label = getAssetNet(coin).networkLabel;
  return [{ label, sublabel: "Native", network: net }];
}

// ── Send network options ──────────────────────────────────────────────────────

interface SendNet { label: string; fee: string; networkKey: string; }

function getSendNetworks(coin: string): SendNet[] {
  const net = getAssetNet(coin).network;
  if (net === "evm") return [
    { label: "Default: Ethereum",   fee: "~0.0001 ETH", networkKey: "evm" },
    { label: "Optimism",            fee: "~0.000005 ETH", networkKey: "evm" },
    { label: "Arbitrum One",        fee: "~0.00004 ETH", networkKey: "evm" },
    { label: "zkSync Era",          fee: "~0.00004 ETH", networkKey: "evm" },
    { label: "BSC (BEP-20)",        fee: "~0.0001 BNB",  networkKey: "evm" },
  ];
  if (net === "bsv")  return [{ label: "Default: Bitcoin SV", fee: "~0.0001 BSV", networkKey: "bsv" }];
  if (net === "btc")  return [{ label: "Default: Bitcoin", fee: "~0.0001 BTC", networkKey: "btc" }, { label: "BNB Smart Chain (BTCB)", fee: "~0.0001 BNB", networkKey: "evm" }];
  if (net === "sol")  return [{ label: "Default: Solana", fee: "~0.000005 SOL", networkKey: "sol" }];
  if (net === "tron") return [{ label: "Default: TRON", fee: "~1 TRX energy", networkKey: "tron" }];
  const label = getAssetNet(coin).networkLabel;
  return [{ label: `Default: ${label}`, fee: "Varies", networkKey: net }];
}

// ── Time range config ─────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: "1D", interval: "5m",  limit: 288 },
  { label: "1W", interval: "1h",  limit: 168 },
  { label: "1M", interval: "4h",  limit: 180 },
  { label: "3M", interval: "1d",  limit: 90  },
  { label: "6M", interval: "1d",  limit: 180 },
  { label: "1Y", interval: "1d",  limit: 365 },
];

// ── Helper: format numbers ────────────────────────────────────────────────────

function fmtBal(n: number, decimals = 6) {
  if (n === 0) return "0";
  if (n < 0.000001) return n.toExponential(4);
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function fmtUsd(n: number) {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPrice(n: number) {
  if (!n || n <= 0) return "$0.00";
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (n >= 1)    return `$${n.toFixed(4)}`;
  if (n >= 0.01) return `$${n.toFixed(6)}`;
  if (n >= 1e-8) return `$${n.toFixed(8)}`;
  // Sub-satoshi-priced tokens: show 4 sig figs without scientific notation
  const mag = -Math.floor(Math.log10(n));
  return `$${n.toFixed(Math.min(mag + 3, 18)).replace(/\.?0+$/, "")}`;
}

// ── Custom tooltip for chart ──────────────────────────────────────────────────

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { time: string } }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-white/50 mb-0.5">{payload[0].payload.time}</p>
      <p className="text-white font-bold">{fmtPrice(payload[0].value)}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { coin: string; }

export function MobileCoinWallet({ coin }: Props) {
  const [, setLocation] = useLocation();
  const { address, network: walletNetwork } = useWalletStore();
  const { toast } = useToast();

  const coinUpper = coin.toUpperCase();
  const color     = ASSET_COLORS[coinUpper] ?? "#6B7280";
  const assetNet  = getAssetNet(coinUpper);
  const assetName = ASSET_NAMES[coinUpper] ?? coinUpper;

  // ── tabs ────────────────────────────────────────────────────────────────────
  const [tab, setTab]           = useState<"chart" | "history" | "trade">("chart");
  const [timeRange, setTimeRange] = useState(3); // default 3M
  const [starred, setStarred]   = useState(false);
  const [copied, setCopied]     = useState(false);

  // ── receive flow ────────────────────────────────────────────────────────────
  const [receiveOpen, setReceiveOpen]           = useState(false);
  const [receiveNetwork, setReceiveNetwork]     = useState<ReceiveNetwork | null>(null);

  // ── send flow ───────────────────────────────────────────────────────────────
  const [sendOpen, setSendOpen]           = useState(false);
  const [sendStep, setSendStep]           = useState(1);
  const [sendNet, setSendNet]             = useState<SendNet | null>(null);
  const [sendNetOpen, setSendNetOpen]     = useState(false);
  const [sendAddress, setSendAddress]     = useState("");
  const [sendNickname, setSendNickname]   = useState("");
  const [saveToBook, setSaveToBook]       = useState(false);
  const [sendAmount, setSendAmount]       = useState("");
  const [sendSubmitting, setSendSubmitting] = useState(false);

  const sendNetworks = useMemo(() => getSendNetworks(coinUpper), [coinUpper]);
  const activeSendNet = sendNet ?? sendNetworks[0];

  // ── exchange balance ─────────────────────────────────────────────────────────
  const { data: balanceData } = useQuery<{ free: number; locked: number } | null>({
    queryKey: ["coin-balance", address, coinUpper],
    queryFn: async () => {
      if (!address) return null;
      const r = await fetch(`${API_BASE}/balances?walletAddress=${address}`);
      if (!r.ok) return null;
      const list = await r.json() as Array<{ asset: string; free: number; locked: number }>;
      return list.find(b => b.asset === coinUpper) ?? { free: 0, locked: 0 };
    },
    enabled: !!address,
    staleTime: 30_000,
  });

  const balance   = balanceData?.free   ?? 0;
  const locked    = balanceData?.locked ?? 0;
  const available = balance;

  // ── ticker (price + 24h change) ──────────────────────────────────────────────
  const symbol = `${coinUpper}_USDT`;
  const { data: ticker } = useQuery<{ last: number; change24h: number; high24h: number; low24h: number } | null>({
    queryKey: ["coin-ticker", coinUpper],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/markets/${symbol}/ticker`);
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const price     = ticker?.last     ?? 0;
  const change24h = ticker?.change24h ?? 0;
  const approxUsd = balance * price;

  // ── candles for chart ────────────────────────────────────────────────────────
  const { interval, limit } = TIME_RANGES[timeRange];
  const { data: candles = [], isLoading: candlesLoading } = useQuery<Array<{ time: number; close: number }>>({
    queryKey: ["coin-candles", coinUpper, interval, limit],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/markets/${symbol}/candles?interval=${interval}&limit=${limit}`);
      if (!r.ok) return [];
      const raw = await r.json() as Array<{ time: number; close: number }>;
      return raw;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const chartData = useMemo(() => {
    return candles.map(c => {
      const d = new Date(c.time * 1000);
      const label = interval === "5m" || interval === "1h"
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString([], { month: "short", day: "numeric" });
      return { time: label, price: c.close };
    });
  }, [candles, interval]);

  const chartMin   = useMemo(() => Math.min(...chartData.map(d => d.price)) * 0.998, [chartData]);
  const chartMax   = useMemo(() => Math.max(...chartData.map(d => d.price)) * 1.002, [chartData]);
  const chartColor = change24h >= 0 ? "#22C55E" : "#EF4444";

  // ── withdrawal history ────────────────────────────────────────────────────────
  const { data: history = [] } = useQuery<Array<{
    id: number; asset: string; amount: number; recipient: string;
    status: string; createdAt: string; network: string;
  }>>({
    queryKey: ["coin-history", address, coinUpper],
    queryFn: async () => {
      if (!address) return [];
      const r = await fetch(`${API_BASE}/withdrawals/history?walletAddress=${address}&asset=${coinUpper}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!address && tab === "history",
    staleTime: 30_000,
  });

  // ── deposit address queries ───────────────────────────────────────────────────
  const isEvmNet  = assetNet.network === "evm";
  const isBsvNet  = assetNet.network === "bsv";
  const isSolNet  = assetNet.network === "sol";
  const isAltNet  = !isEvmNet && !isBsvNet && !isSolNet;

  // EVM deposit address
  const { data: evmDepositData } = useQuery<{ address: string }>({
    queryKey: ["evm-deposit", address, 1],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/deposit/address?walletAddress=${address}&chainId=1`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!address && isEvmNet && receiveOpen,
    staleTime: 300_000,
  });

  // BSV deposit address
  const { data: bsvDepositData } = useQuery<{ supported: boolean; address?: string }>({
    queryKey: ["bsv-deposit", coinUpper],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/deposit/bitcoin-address?network=${assetNet.network}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: (isBsvNet || coinUpper === "BCH" || coinUpper === "BTC") && receiveOpen,
    staleTime: 300_000,
  });

  // Solana deposit address
  const { data: solDepositData } = useQuery<{ supported: boolean; address?: string }>({
    queryKey: ["sol-deposit"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/deposit/solana-address`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: isSolNet && receiveOpen,
    staleTime: 300_000,
  });

  // AltChain deposit address
  const { data: altDepositData } = useQuery<{ supported: boolean; address?: string; symbol?: string; minDeposit?: string }>({
    queryKey: ["altchain-deposit", assetNet.network],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/deposit/altchain-address?network=${assetNet.network}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: isAltNet && receiveOpen,
    staleTime: 300_000,
  });

  // Resolve the actual deposit address to show in QR
  const receiveAddress = useMemo(() => {
    if (receiveNetwork?.network === "evm" || isEvmNet) return evmDepositData?.address;
    if (isBsvNet) return bsvDepositData?.supported ? bsvDepositData.address : undefined;
    if (isSolNet) return solDepositData?.supported ? solDepositData.address : undefined;
    if (isAltNet) return altDepositData?.supported ? altDepositData.address : undefined;
    return undefined;
  }, [receiveNetwork, isEvmNet, isBsvNet, isSolNet, isAltNet, evmDepositData, bsvDepositData, solDepositData, altDepositData]);

  // ── address validation ────────────────────────────────────────────────────────
  const isValidSendAddress = useMemo(() => {
    const a = sendAddress.trim();
    if (!a) return false;
    const net = activeSendNet.networkKey;
    if (net === "evm") return /^0x[0-9a-fA-F]{40}$/.test(a);
    if (net === "bsv" || net === "btc" || net === "bch") return /^[13mn][a-km-zA-HJ-NP-Z1-9]{25,50}$/.test(a);
    if (net === "sol") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
    return validateAltChainAddress(net, a);
  }, [sendAddress, activeSendNet.networkKey]);

  // ── send submit ───────────────────────────────────────────────────────────────
  const handleSendConfirm = async () => {
    if (!address || sendSubmitting) return;
    setSendSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/withdrawals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          asset:   coinUpper,
          amount:  parseFloat(sendAmount),
          recipient: sendAddress.trim(),
          network: activeSendNet.networkKey,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed");
      }
      toast({ title: "Withdrawal submitted", description: `${sendAmount} ${coinUpper} withdrawal is being processed.` });
      setSendOpen(false);
      setSendStep(1);
      setSendAddress("");
      setSendAmount("");
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: (e as Error).message });
    } finally {
      setSendSubmitting(false);
    }
  };

  // ── copy helper ────────────────────────────────────────────────────────────────
  const copyAddress = useCallback((addr: string) => {
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  // ── receive networks for this coin ────────────────────────────────────────────
  const receiveNetworks = useMemo(() => getReceiveNetworks(coinUpper), [coinUpper]);
  const singleReceiveNetwork = receiveNetworks.length === 1;

  function openReceive() {
    setReceiveOpen(true);
    setReceiveNetwork(singleReceiveNetwork ? receiveNetworks[0] : null);
  }

  // ── Send amount validation ─────────────────────────────────────────────────
  const parsedSendAmount = parseFloat(sendAmount) || 0;
  const sendAmountValid  = parsedSendAmount > 0 && parsedSendAmount <= available;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col text-white relative">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
        <button onClick={() => setLocation(`${BASE}/portfolio`)} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: color + "33", color }}>
            {coinUpper[0]}
          </div>
          <span className="text-base font-bold">{assetName} Wallet</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10 transition-colors">
            <Bell className="w-5 h-5 text-white/60" />
          </button>
          <button onClick={() => setStarred(s => !s)} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10 transition-colors">
            <Star className={cn("w-5 h-5", starred ? "fill-yellow-400 text-yellow-400" : "text-white/60")} />
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-4 px-6 pt-1 pb-2 border-b border-white/8 shrink-0">
        {(["chart", "history", "trade"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex items-center gap-1.5 pb-2 text-sm font-semibold capitalize border-b-2 transition-colors",
              tab === t ? "border-[#4A9EF5] text-[#4A9EF5]" : "border-transparent text-white/40 hover:text-white/60",
            )}
          >
            {t === "chart"   && <span className="w-5 h-5 text-center text-xs">📈</span>}
            {t === "history" && <span className="w-5 h-5 text-center text-xs">📋</span>}
            {t === "trade"   && <span className="w-5 h-5 text-center text-xs">🔄</span>}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Tab content (scrollable) ── */}
      <div className="flex-1 overflow-y-auto pb-28">

        {/* CHART TAB */}
        {tab === "chart" && (
          <div className="p-4 space-y-4">

            {/* Balance cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#1a1a1a] rounded-2xl p-4">
                <p className="text-xs text-white/50 mb-1">Balance</p>
                <p className="text-lg font-bold">{fmtBal(balance)}</p>
                {locked > 0 && <p className="text-xs text-white/40 mt-0.5">{fmtBal(locked)} locked</p>}
              </div>
              <div className="bg-[#1a1a1a] rounded-2xl p-4">
                <p className="text-xs text-white/50 mb-0.5">Rate</p>
                <p className={cn("text-xs font-semibold mb-1", change24h >= 0 ? "text-green-400" : "text-red-400")}>
                  {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}% {change24h >= 0 ? "↗" : "↙"}
                </p>
                <p className="text-base font-bold">{fmtPrice(price)}</p>
              </div>
              <div className="bg-[#1a1a1a] rounded-2xl p-4">
                <p className="text-xs text-white/50 mb-1">Available Balance</p>
                <p className="text-lg font-bold">{fmtBal(available)}</p>
              </div>
              <div className="bg-[#1a1a1a] rounded-2xl p-4">
                <p className="text-xs text-white/50 mb-1">Approx.</p>
                <p className="text-lg font-bold">{fmtUsd(approxUsd)}</p>
              </div>
            </div>

            {/* Chart section */}
            <div className="bg-[#1a1a1a] rounded-2xl p-4">
              <p className="text-sm font-bold mb-3">{assetName} Price ({coinUpper}/USDT)</p>

              {/* Time selector */}
              <div className="flex gap-1 mb-4">
                {TIME_RANGES.map((r, i) => (
                  <button
                    key={r.label}
                    onClick={() => setTimeRange(i)}
                    className={cn(
                      "flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors",
                      timeRange === i ? "bg-[#4A9EF5] text-white" : "text-white/40 hover:text-white/70",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Chart */}
              <div className="h-[200px]">
                {candlesLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-white/30" />
                  </div>
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
                      <XAxis
                        dataKey="time"
                        tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={40}
                      />
                      <YAxis
                        domain={[chartMin, chartMax]}
                        tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={v => {
                          if (v >= 1000) return `${(v/1000).toFixed(0)}k`;
                          if (v >= 1)    return v.toFixed(2);
                          return v.toFixed(4);
                        }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke={chartColor}
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 3, fill: chartColor }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-white/30 text-sm">
                    No chart data
                  </div>
                )}
              </div>

              {/* Price summary row */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/8">
                <div className="text-center">
                  <p className="text-[10px] text-white/40">Current</p>
                  <p className="text-xs font-bold">{fmtPrice(price)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-white/40">24h High</p>
                  <p className="text-xs font-bold text-green-400">{fmtPrice(ticker?.high24h ?? 0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-white/40">24h Low</p>
                  <p className="text-xs font-bold text-red-400">{fmtPrice(ticker?.low24h ?? 0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-white/40">24h Change</p>
                  <p className={cn("text-xs font-bold", change24h >= 0 ? "text-green-400" : "text-red-400")}>
                    {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Market info card */}
            <div className="bg-[#1a1a1a] rounded-2xl p-4">
              <p className="text-sm font-bold mb-3">{coinUpper} on OrahDEX</p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Network</span>
                  <span className="font-medium">{assetNet.networkLabel}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Your Balance</span>
                  <span className="font-mono font-medium">{fmtBal(balance)} {coinUpper}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">USD Value</span>
                  <span className="font-medium">{fmtUsd(approxUsd)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === "history" && (
          <div className="p-4 space-y-3">
            {!address ? (
              <div className="text-center py-16 text-white/40">
                <p className="text-sm">Connect your wallet to see history</p>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-16 text-white/40">
                <p className="text-2xl mb-2">📭</p>
                <p className="text-sm font-medium">No {coinUpper} transactions yet</p>
                <p className="text-xs mt-1 opacity-60">Deposits and withdrawals appear here</p>
              </div>
            ) : (
              history.map(tx => (
                <div key={tx.id} className="bg-[#1a1a1a] rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                    <ArrowUpRight className="w-5 h-5 text-white/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Withdrawal</p>
                    <p className="text-xs text-white/40 truncate font-mono mt-0.5">{tx.recipient}</p>
                    <p className="text-xs text-white/40 mt-0.5">{new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-red-400">-{tx.amount} {coinUpper}</p>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-semibold",
                      tx.status === "completed" ? "bg-green-500/20 text-green-400" :
                      tx.status === "pending"   ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-red-500/20 text-red-400"
                    )}>
                      {tx.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TRADE TAB */}
        {tab === "trade" && (
          <div className="p-4 text-center py-16">
            <p className="text-4xl mb-4">🔄</p>
            <p className="text-base font-bold mb-2">Trade {coinUpper}</p>
            <p className="text-sm text-white/50 mb-6">Go to the markets to trade {assetName}</p>
            <button
              onClick={() => setLocation(`${BASE}/trade/${coinUpper}_BSV`)}
              className="px-6 py-3 rounded-2xl bg-[#4A9EF5] text-white font-bold text-sm active:opacity-80"
            >
              Open {coinUpper}/BSV Market
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom bar: Receive + Send ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0d0d0d] border-t border-white/8 px-4 py-3 flex gap-3 z-20 safe-area-pb">
        <button
          onClick={openReceive}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#1a3a5c] text-[#4A9EF5] font-bold text-sm active:opacity-80 transition-opacity"
        >
          <ArrowDownLeft className="w-4 h-4" />
          Receive
        </button>
        <button
          onClick={() => { setSendOpen(true); setSendStep(1); }}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#4A9EF5] text-white font-bold text-sm active:opacity-80 transition-opacity"
        >
          <ArrowUpRight className="w-4 h-4" />
          Send
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RECEIVE FLOW OVERLAY
         ══════════════════════════════════════════════════════════════════════ */}
      {receiveOpen && (
        <div className="fixed inset-0 bg-[#0d0d0d] z-50 flex flex-col">

          {/* Receive Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/8 shrink-0">
            <button
              onClick={() => { if (receiveNetwork && !singleReceiveNetwork) { setReceiveNetwork(null); } else { setReceiveOpen(false); } }}
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: color + "33", color }}>
                {coinUpper[0]}
              </div>
              <span className="text-base font-bold">Receive {coinUpper}</span>
            </div>
            <button onClick={() => { setReceiveOpen(false); setReceiveNetwork(null); }} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10">
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          {/* Network selector OR QR screen */}
          {!receiveNetwork ? (
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-white/60 mb-4">Select the network to receive via</p>
              <div className="bg-[#1a1a1a] rounded-2xl overflow-hidden divide-y divide-white/5">
                {receiveNetworks.map(rn => (
                  <button
                    key={rn.label}
                    onClick={() => setReceiveNetwork(rn)}
                    className="w-full flex items-center justify-between px-4 py-4 active:bg-white/5 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold">{rn.label}</p>
                      {rn.sublabel && <p className="text-xs text-white/40 mt-0.5">{rn.sublabel}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/40" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Network badge */}
              <div className="flex justify-center">
                <span className="text-xs px-3 py-1.5 rounded-full bg-[#4A9EF5]/20 text-[#4A9EF5] font-semibold">
                  {receiveNetwork.label}
                </span>
              </div>

              {!receiveAddress ? (
                /* Loading / coming soon */
                <div className="bg-[#1a1a1a] rounded-2xl p-8 flex flex-col items-center gap-4">
                  {(isEvmNet ? !evmDepositData : isAltNet ? altDepositData === undefined : !bsvDepositData && !solDepositData) ? (
                    <Loader2 className="w-8 h-8 animate-spin text-white/30" />
                  ) : (
                    <>
                      <AlertCircle className="w-12 h-12 text-yellow-400 opacity-60" />
                      <div className="text-center">
                        <p className="text-sm font-bold text-yellow-400 mb-1">{coinUpper} Deposits Coming Soon</p>
                        <p className="text-xs text-white/50 leading-relaxed">Exchange deposits for {assetName} are being configured. Please check back soon or contact support.</p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* QR + address display */
                <>
                  <div className="bg-[#1a1a1a] rounded-2xl p-5 flex flex-col items-center gap-4">
                    <p className="text-xs text-white/50 text-center">
                      Send only <strong className="text-white">{coinUpper}</strong> on <strong className="text-white">{receiveNetwork.label}</strong> to this address
                    </p>
                    {/* QR Code */}
                    <div className="p-4 bg-white rounded-2xl shadow-lg">
                      <QRCodeCanvas value={receiveAddress} size={180} level="M" includeMargin={false} />
                    </div>
                    {/* Address box */}
                    <div className="w-full bg-[#0d0d0d] rounded-xl px-4 py-3 flex items-center gap-3">
                      <span className="flex-1 font-mono text-xs text-white/80 break-all select-all leading-relaxed">
                        {receiveAddress}
                      </span>
                      <button onClick={() => copyAddress(receiveAddress)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 active:bg-white/10">
                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white/60" />}
                      </button>
                    </div>
                  </div>

                  {/* Processing notice */}
                  <div className="bg-[#1a3a5c] rounded-2xl p-4 flex gap-3">
                    <Info className="w-4 h-4 text-[#4A9EF5] shrink-0 mt-0.5" />
                    <p className="text-xs text-white/70 leading-relaxed">
                      {isBsvNet
                        ? "BSV deposits are typically credited within a few minutes after 1 block confirmation."
                        : isEvmNet
                          ? "EVM deposits are credited automatically after on-chain confirmation."
                          : "Your deposit will be credited within 24 hours after network confirmation."}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SEND FLOW OVERLAY (3 steps)
         ══════════════════════════════════════════════════════════════════════ */}
      {sendOpen && (
        <div className="fixed inset-0 bg-[#0d0d0d] z-50 flex flex-col">

          {/* Send Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/8 shrink-0">
            <button
              onClick={() => { if (sendStep > 1) { setSendStep(s => s - 1); } else { setSendOpen(false); } }}
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: color + "33", color }}>
                {coinUpper[0]}
              </div>
              <span className="text-base font-bold">Send {coinUpper}</span>
            </div>
            <button onClick={() => { setSendOpen(false); setSendStep(1); }} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10">
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-3 py-4 shrink-0">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors",
                  sendStep === s ? "bg-[#4A9EF5] border-[#4A9EF5] text-white" :
                  sendStep > s  ? "bg-green-500 border-green-500 text-white" :
                  "border-white/20 text-white/40"
                )}>
                  {sendStep > s ? <Check className="w-3 h-3" /> : s}
                </div>
                {s < 3 && <div className={cn("w-8 h-0.5", sendStep > s ? "bg-green-500" : "bg-white/10")} />}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* ── STEP 1: Network + Address ── */}
            {sendStep === 1 && (
              <>
                {/* Info banner */}
                <div className="bg-[#1a3a5c] rounded-2xl p-4 flex gap-3">
                  <Info className="w-4 h-4 text-[#4A9EF5] shrink-0 mt-0.5" />
                  <p className="text-xs text-white/70 leading-relaxed">
                    OrahDEX will never ask you to send funds off the platform. If you have received communication that you're unsure of, please contact support which is available 24/7.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-bold mb-4">Where are you sending to?</p>

                  {/* Network dropdown */}
                  <div className="mb-4">
                    <label className="text-xs text-white/50 mb-1.5 block">
                      Send network <span className="text-[#4A9EF5]">*</span>
                    </label>
                    <button
                      onClick={() => setSendNetOpen(o => !o)}
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3.5 flex items-center justify-between text-sm text-left active:bg-white/5"
                    >
                      <span>{activeSendNet.label}</span>
                      <ChevronRight className={cn("w-4 h-4 text-white/40 transition-transform", sendNetOpen && "rotate-90")} />
                    </button>

                    {sendNetOpen && (
                      <div className="mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden">
                        {sendNetworks.map(sn => (
                          <button
                            key={sn.label}
                            onClick={() => { setSendNet(sn); setSendNetOpen(false); }}
                            className={cn(
                              "w-full flex items-center justify-between px-4 py-3.5 text-sm active:bg-white/5 border-b border-white/5 last:border-0",
                              activeSendNet.label === sn.label && "text-[#4A9EF5]"
                            )}
                          >
                            <span>{sn.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-white/40">fee: {sn.fee}</span>
                              {activeSendNet.label === sn.label && <Check className="w-3.5 h-3.5 text-[#4A9EF5]" />}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Address field */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-white/50">
                        Payment address <span className="text-[#4A9EF5]">*</span>
                      </label>
                      <button
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            setSendAddress(text.trim());
                          } catch { /* permission denied */ }
                        }}
                        className="text-xs text-[#4A9EF5] font-semibold"
                      >
                        Paste address
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        value={sendAddress}
                        onChange={e => setSendAddress(e.target.value)}
                        placeholder={`Enter ${coinUpper} address`}
                        className={cn(
                          "w-full bg-[#1a1a1a] border rounded-xl px-4 py-3.5 text-sm font-mono pr-10 outline-none focus:border-[#4A9EF5]/50 transition-colors",
                          sendAddress && !isValidSendAddress ? "border-red-500/50" : "border-white/10"
                        )}
                      />
                    </div>
                    {sendAddress && !isValidSendAddress && (
                      <p className="text-xs text-red-400 mt-1.5">Invalid {assetNet.networkLabel} address format</p>
                    )}
                    {sendAddress && isValidSendAddress && (
                      <p className="text-xs text-green-400 mt-1.5 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Valid {assetNet.networkLabel} address
                      </p>
                    )}
                  </div>

                  {/* Save to address book */}
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={() => setSaveToBook(b => !b)}
                      className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        saveToBook ? "bg-[#4A9EF5] border-[#4A9EF5]" : "border-white/20"
                      )}
                    >
                      {saveToBook && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <span className="text-sm text-white/70">Save to address book</span>
                  </div>

                  {/* Nickname field */}
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block">Nickname</label>
                    <input
                      value={sendNickname}
                      onChange={e => setSendNickname(e.target.value)}
                      placeholder="Enter nickname (optional)"
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#4A9EF5]/50 transition-colors"
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── STEP 2: Amount ── */}
            {sendStep === 2 && (
              <>
                <div>
                  <p className="text-sm font-bold mb-4">How much are you sending?</p>

                  {/* Amount input */}
                  <div className="bg-[#1a1a1a] rounded-2xl p-5 space-y-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ backgroundColor: color + "33", color }}>
                        {coinUpper[0]}
                      </div>
                      <div className="flex-1">
                        <input
                          type="number"
                          value={sendAmount}
                          onChange={e => setSendAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-transparent text-2xl font-bold outline-none placeholder-white/20"
                        />
                        <p className="text-xs text-white/40 mt-0.5">{coinUpper}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{fmtUsd(parsedSendAmount * price)}</p>
                        <p className="text-[10px] text-white/40">USD value</p>
                      </div>
                    </div>

                    <div className="border-t border-white/8 pt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/50">Available</span>
                        <button onClick={() => setSendAmount(available.toString())} className="font-semibold text-[#4A9EF5]">
                          {fmtBal(available)} {coinUpper} (Max)
                        </button>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Network fee</span>
                        <span className="text-white/70">{activeSendNet.fee}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Send to</span>
                        <span className="font-mono text-white/70 truncate ml-4 max-w-[150px]">{sendAddress}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick amount buttons */}
                  <div className="grid grid-cols-4 gap-2">
                    {[25, 50, 75, 100].map(pct => (
                      <button
                        key={pct}
                        onClick={() => setSendAmount((available * pct / 100).toString())}
                        className="py-2 rounded-xl text-xs font-bold bg-[#1a1a1a] text-white/60 active:bg-[#4A9EF5]/20 active:text-[#4A9EF5] transition-colors"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>

                  {parsedSendAmount > available && (
                    <p className="text-xs text-red-400 mt-3 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Insufficient balance
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ── STEP 3: Confirm ── */}
            {sendStep === 3 && (
              <>
                <p className="text-sm font-bold mb-1">Review & Confirm</p>
                <p className="text-xs text-white/50 mb-4">Please review your withdrawal details before confirming</p>

                <div className="bg-[#1a1a1a] rounded-2xl overflow-hidden divide-y divide-white/5 mb-4">
                  <div className="px-4 py-3.5 flex justify-between text-sm">
                    <span className="text-white/50">Asset</span>
                    <span className="font-semibold">{coinUpper}</span>
                  </div>
                  <div className="px-4 py-3.5 flex justify-between text-sm">
                    <span className="text-white/50">Amount</span>
                    <span className="font-semibold">{parsedSendAmount} {coinUpper}</span>
                  </div>
                  <div className="px-4 py-3.5 flex justify-between text-sm">
                    <span className="text-white/50">USD Value</span>
                    <span className="font-semibold">{fmtUsd(parsedSendAmount * price)}</span>
                  </div>
                  <div className="px-4 py-3.5 flex flex-col gap-1 text-sm">
                    <span className="text-white/50">Recipient</span>
                    <span className="font-mono text-xs break-all text-white/80">{sendAddress}</span>
                    {sendNickname && <span className="text-xs text-white/40">"{sendNickname}"</span>}
                  </div>
                  <div className="px-4 py-3.5 flex justify-between text-sm">
                    <span className="text-white/50">Network</span>
                    <span className="font-semibold">{activeSendNet.label}</span>
                  </div>
                  <div className="px-4 py-3.5 flex justify-between text-sm">
                    <span className="text-white/50">Est. Fee</span>
                    <span className="font-semibold">{activeSendNet.fee}</span>
                  </div>
                </div>

                {/* Warning */}
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex gap-3 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-white/70 leading-relaxed">
                    Crypto withdrawals are <strong className="text-white">irreversible</strong>. Ensure the recipient address and network are correct before confirming.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Step navigation buttons */}
          <div className="shrink-0 p-4 flex gap-3 border-t border-white/8 safe-area-pb">
            <button
              onClick={() => { if (sendStep > 1) { setSendStep(s => s - 1); } else { setSendOpen(false); } }}
              className="flex-1 py-4 rounded-2xl border border-white/15 text-sm font-bold text-white/70 active:bg-white/5 transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={() => {
                if (sendStep === 1 && isValidSendAddress) { setSendStep(2); }
                else if (sendStep === 2 && sendAmountValid) { setSendStep(3); }
                else if (sendStep === 3) { handleSendConfirm(); }
              }}
              disabled={
                (sendStep === 1 && !isValidSendAddress) ||
                (sendStep === 2 && !sendAmountValid) ||
                (sendStep === 3 && sendSubmitting)
              }
              className="flex-1 py-4 rounded-2xl bg-[#4A9EF5] text-white text-sm font-bold active:opacity-80 transition-opacity disabled:opacity-40"
            >
              {sendStep === 3
                ? sendSubmitting ? "Confirming…" : "Confirm Send"
                : "Next"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MobileCoinWallet;
