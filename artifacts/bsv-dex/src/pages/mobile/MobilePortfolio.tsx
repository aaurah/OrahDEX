import {
  TrendingUp, TrendingDown,
  ArrowDownToLine,
  Copy, Check, RefreshCw, Info,
  LogOut, Zap, Droplets, ExternalLink, ArrowLeftRight, CreditCard,
} from "lucide-react";
import { ExchangeAddressesCard } from "@/components/ExchangeAddressesCard";
import { useWalletStore } from "@/store/useWalletStore";
import { disconnectReown } from "@/lib/reown";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ReceiveModal } from "@/components/ReceiveModal";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";
import { WithdrawSheet } from "@/components/WithdrawSheet";
import { cn, getProviderLabel } from "@/lib/utils";
import { useSettingsStore, formatQuoteAmount, getCurrencySymbol } from "@/store/useSettingsStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { useTronBalances } from "@/hooks/useTronBalances";
import { useLiquidityStore } from "@/store/useLiquidityStore";

import { EXPLORER_TX, CHAIN_NAMES } from "@/lib/onChainLiquidity";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Per-asset canonical withdrawal network (independent of connected wallet)
const ASSET_NETWORK_MAP: Record<string, { network: string; networkLabel: string; placeholder: string }> = {
  BTC:   { network: "btc",  networkLabel: "Bitcoin",            placeholder: "bc1... or 1... or 3..." },
  BSV:   { network: "bsv",  networkLabel: "Bitcoin SV",         placeholder: "1... (BSV P2PKH)" },
  BCH:   { network: "bch",  networkLabel: "Bitcoin Cash",       placeholder: "bitcoincash:q... or 1..." },
  ETH:   { network: "evm",  networkLabel: "Ethereum Mainnet",   placeholder: "0x... (ERC-20 address)" },
  USDT:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  USDC:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  DAI:   { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  AAVE:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  LINK:  { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  UNI:   { network: "evm",  networkLabel: "Ethereum (ERC-20)",  placeholder: "0x... (ERC-20 address)" },
  BNB:   { network: "evm",  networkLabel: "BNB Chain (BEP-20)", placeholder: "0x... (BEP-20 address)" },
  BUSD:  { network: "evm",  networkLabel: "BNB Chain (BEP-20)", placeholder: "0x... (BEP-20 address)" },
  MATIC: { network: "evm",  networkLabel: "Polygon",            placeholder: "0x... (Polygon address)" },
  AVAX:  { network: "evm",  networkLabel: "Avalanche C-Chain",  placeholder: "0x... (Avalanche address)" },
  FTM:   { network: "evm",  networkLabel: "Fantom",             placeholder: "0x... (Fantom address)" },
  SOL:   { network: "sol",  networkLabel: "Solana",             placeholder: "Solana wallet address" },
  TRX:   { network: "tron", networkLabel: "TRON Network",       placeholder: "T... (TRON address)" },
  BTT:   { network: "tron", networkLabel: "TRON (TRC-20)",      placeholder: "T... (TRON address)" },
  XRP:   { network: "xrp",  networkLabel: "XRP Ledger",         placeholder: "r... (XRP address)" },
  ADA:   { network: "ada",  networkLabel: "Cardano",            placeholder: "addr1... (Cardano address)" },
  DOGE:  { network: "doge", networkLabel: "Dogecoin",           placeholder: "D... (Dogecoin address)" },
  DOT:   { network: "dot",  networkLabel: "Polkadot",           placeholder: "1... (Polkadot address)" },
  LTC:   { network: "ltc",  networkLabel: "Litecoin",           placeholder: "L... or ltc1..." },
  XLM:   { network: "xlm",  networkLabel: "Stellar",            placeholder: "G... (Stellar address)" },
};

function getAssetNetworkInfo(asset: string, connectedNetwork: string | null):
  { network: string; networkLabel: string; placeholder: string } {
  if (ASSET_NETWORK_MAP[asset]) return ASSET_NETWORK_MAP[asset];
  const net = connectedNetwork ?? "evm";
  return { network: net, networkLabel: net.toUpperCase(), placeholder: "Destination address" };
}

// Map EVM chainId → portfolio native symbol
const EVM_NATIVE: Record<number, string> = {
  1: "ETH", 10: "ETH", 42161: "ETH", 8453: "ETH",
  59144: "ETH", 324: "ETH", 534352: "ETH", 5000: "MNT",
  56: "BNB", 137: "MATIC", 43114: "AVAX", 250: "FTM", 25: "CRO",
};

function getNativeAsset(network: string | null, chainId: number | null): string {
  if (network === "bsv")  return "BSV";
  if (network === "sol")  return "SOL";
  if (network === "btc")  return "BTC";
  if (network === "tron") return "TRX";
  if (network === "evm" && chainId) return EVM_NATIVE[chainId] ?? "ETH";
  return "ETH";
}

const ASSET_COLORS: Record<string, string> = {
  ETH: "#8B5CF6", BNB: "#EAB308", MATIC: "#7C3AED", POL: "#7C3AED",
  USDT: "#22C55E", USDC: "#3B82F6", DAI: "#EAB308", WBTC: "#F97316",
  LINK: "#3B82F6", BSV: "#22C55E", BTC: "#F97316", SOL: "#9945FF",
  AVAX: "#E84142", FTM: "#1969FF", MNT: "#6B7280",
  TRX: "#EF4444", BTT: "#9333EA", WIN: "#F59E0B", JST: "#06B6D4",
};

const TRON_POOL_IDS = new Set(["trx-usdt","btt-usdt","btt-trx","win-trx","jst-usdt","trx-btc"]);

const POOL_LABELS_MOBILE: Record<string, string> = {
  "btc-usdt":  "BTC / USDT",  "eth-usdt":  "ETH / USDT",
  "sol-usdt":  "SOL / USDT",  "bsv-usdt":  "BSV / USDT",
  "bnb-usdt":  "BNB / USDT",  "xrp-usdt":  "XRP / USDT",
  "ada-usdt":  "ADA / USDT",  "doge-usdt": "DOGE / USDT",
  "dot-usdt":  "DOT / USDT",  "link-usdt": "LINK / USDT",
  "bsv-btc":   "BSV / BTC",   "eth-btc":   "ETH / BTC",
  "trx-usdt":  "TRX / USDT",  "btt-usdt":  "BTT / USDT",
  "btt-trx":   "BTT / TRX",   "win-trx":   "WIN / TRX",
  "jst-usdt":  "JST / USDT",  "trx-btc":   "TRX / BTC",
};

interface MarketRow { symbol: string; baseAsset: string; lastPrice: number; priceChangePercent24h: number; }

function useLivePrices() {
  return useQuery<Record<string, MarketRow>>({
    queryKey: ["portfolio-mobile-prices"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/markets?quote=USDT&limit=500`, { cache: "no-store" });
      if (!res.ok) throw new Error("price fetch failed");
      const rows: MarketRow[] = await res.json();
      return Object.fromEntries(rows.map(r => [r.baseAsset, r]));
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

const STATUS_COLOR: Record<string, string> = { open: "#4ade80", filled: "#22c55e", cancelled: "#6b7280" };

type Tab = "assets" | "defi" | "orders";

export function MobilePortfolio() {
  const { address, network, provider, chainId, balance, disconnect } = useWalletStore();
  const { quoteCurrency } = useSettingsStore();
  const { getUserPositions, removePosition, clearWalletPositions } = useLiquidityStore();
  const lpPositions = address ? Object.entries(getUserPositions(address)) : [];
  const { open: openWallet } = useWalletModalStore();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("assets");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [buyCryptoOpen, setBuyCryptoOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAsset, setWithdrawAsset] = useState<{ asset: string; available: number; network: string; networkLabel: string; color: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: exchangeBalances = [] } = useQuery<{ asset: string; available: string; locked: string }[]>({
    queryKey: ["mobile-exchange-balances", address],
    queryFn: async () => {
      if (!address) return [];
      const r = await fetch(`${BASE}/api/balances?walletAddress=${encodeURIComponent(address)}`);
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : (data.balances ?? []);
    },
    enabled: !!address,
    refetchInterval: 10_000,
    staleTime: 0,
    refetchOnMount: true,
  });

  const exchBalancesWithValue = exchangeBalances
    .map(b => ({ ...b, free: parseFloat(b.available), locked: parseFloat(b.locked) }))
    .filter(b => b.free > 0 || b.locked > 0);

  const { data: prices, isLoading: pricesLoading, refetch } = useLivePrices();
  const { balances: evmBalances, refresh: evmRefresh } = useEvmBalances(
    network === "evm" ? address : null,
    chainId,
  );
  const { balances: tronBalances, refresh: tronRefresh } = useTronBalances(
    network === "tron" ? address : null,
  );

  const nativeAsset = getNativeAsset(network, chainId);
  const nativeBalance = balance ? parseFloat(balance) : 0;

  const { data: ordersData } = useQuery({
    queryKey: ["portfolio-orders", address],
    queryFn: () => fetch(`${BASE}/api/orders?walletAddress=${encodeURIComponent(address || "")}`).then(r => r.json()),
    enabled: !!address,
    refetchInterval: 2000,
  });
  const myOrders: any[] = Array.isArray(ordersData) ? ordersData : [];

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`${BASE}/api/orders/${orderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!res.ok) throw new Error("Failed to cancel");
      return res.json();
    },
    onMutate: async (orderId) => {
      setCancellingId(orderId);
      await queryClient.cancelQueries({ queryKey: ["portfolio-orders", address] });
      const prev = queryClient.getQueryData(["portfolio-orders", address]);
      queryClient.setQueryData(["portfolio-orders", address], (old: any) =>
        Array.isArray(old)
          ? old.map((o: any) => String(o.id) === orderId ? { ...o, status: "cancelled", updatedAt: new Date().toISOString() } : o)
          : old
      );
      return { prev };
    },
    onError: (_err, _id, context: any) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(["portfolio-orders", address], context.prev);
      }
    },
    onSettled: () => {
      setCancellingId(null);
      queryClient.invalidateQueries({ queryKey: ["portfolio-orders", address] });
      queryClient.invalidateQueries({ queryKey: ["orders", address] });
    },
  });

  // Build rows from real on-chain data where available
  const rows = (() => {
    // EVM: use all tokens returned by useEvmBalances (includes native + ERC-20)
    if (network === "evm" && evmBalances.length > 0) {
      return evmBalances.map(b => {
        const stableSymbols = ["USDT", "USDC", "DAI", "BUSD", "TUSD"];
        const isStable = stableSymbols.includes(b.symbol.toUpperCase());
        const mkt = prices?.[b.symbol];
        const price = b.price > 0 ? b.price : isStable ? 1 : (mkt?.lastPrice ?? 0);
        const change = b.change24h !== 0 ? b.change24h : isStable ? 0 : (mkt?.priceChangePercent24h ?? 0);
        const usdValue = b.usdValue > 0 ? b.usdValue : b.amount * price;
        const color = ASSET_COLORS[b.symbol] ?? "#6B7280";
        return { asset: b.symbol, color, amount: b.amount, price, change, value: usdValue, isNative: b.isNative };
      });
    }
    // TRON: use real balances from useTronBalances hook
    if (network === "tron" && tronBalances.length > 0) {
      return tronBalances.map(b => {
        const isStable = ["USDT","USDC"].includes(b.symbol);
        const mkt = prices?.[b.symbol];
        const price = b.price ?? (isStable ? 1 : (mkt?.lastPrice ?? 0));
        const change = isStable ? 0 : (mkt?.priceChangePercent24h ?? 0);
        const usdValue = b.usdValue ?? (b.amount * price);
        const color = ASSET_COLORS[b.symbol] ?? "#EF4444";
        return { asset: b.symbol, color, amount: b.amount, price, change, value: usdValue, isNative: b.isNative };
      });
    }
    // Non-EVM wallets: show native asset with stored balance
    const nativeColor = ASSET_COLORS[nativeAsset] ?? "#6B7280";
    return [{ asset: nativeAsset, color: nativeColor, amount: nativeBalance, price: 0, change: 0, value: 0, isNative: true }];
  })();

  // eslint-disable-next-line prefer-const
  let tokensTotal = rows.reduce((s, r) => s + r.value, 0);
  const lpTotalValue = lpPositions.reduce((s, [, pos]) => s + (pos.depositedValueUsd ?? 0), 0);

  // Non-custodial: wallet rows are shown as-is — no OrahDEX ledger adjustments.
  // Trades settle directly wallet-to-wallet; no internal balance tracking needed.

  // ── BUCKET 2: Busy in Trade — assets locked in open limit/stop orders ─────
  // For SELL orders: base asset is reserved (e.g. 0.003 ETH locked for a sell)
  // For BUY  orders: quote asset is reserved (price × qty USDT)
  const openOrders = myOrders.filter(o => o.status === "open" || o.status === "pending");
  const lockedByAsset: Record<string, { amount: number; orders: { id: string; symbol: string; side: string; qty: number; price: number; type: string }[] }> = {};
  for (const order of openOrders) {
    const parts = (order.symbol ?? "").split("/");
    const base  = parts[0] ?? "";
    const quote = parts[1] ?? "USDT";
    if (order.side === "sell") {
      const qty = parseFloat(order.quantity) || parseFloat(order.qty) || 0;
      if (qty > 0 && base) {
        if (!lockedByAsset[base]) lockedByAsset[base] = { amount: 0, orders: [] };
        lockedByAsset[base].amount += qty;
        lockedByAsset[base].orders.push({ id: order.id, symbol: order.symbol, side: "sell", qty, price: parseFloat(order.price) || 0, type: order.type ?? "limit" });
      }
    } else {
      const qty   = parseFloat(order.quantity) || parseFloat(order.qty) || 0;
      const price = parseFloat(order.price) || 0;
      const cost  = price > 0 ? price * qty : 0;
      if (cost > 0 && quote) {
        if (!lockedByAsset[quote]) lockedByAsset[quote] = { amount: 0, orders: [] };
        lockedByAsset[quote].amount += cost;
        lockedByAsset[quote].orders.push({ id: order.id, symbol: order.symbol, side: "buy", qty, price, type: order.type ?? "limit" });
      }
    }
  }
  const lockedEntries = Object.entries(lockedByAsset).filter(([, v]) => v.amount > 0);
  const lockedTotalUsd = lockedEntries.reduce((s, [token, v]) => {
    const isStable = ["USDT", "USDC", "DAI", "BUSD"].includes(token);
    const p = isStable ? 1 : (prices?.[token]?.lastPrice ?? 0);
    return s + v.amount * p;
  }, 0);

  // ── BUCKET 1: Wallet balance (real on-chain, minus OrahDEX-consumed amounts) ──
  const total = tokensTotal;
  const nonZero = rows.filter(r => r.amount > 0);
  const totalChange = tokensTotal > 0 && nonZero.length > 0
    ? nonZero.reduce((s, r) => s + (r.value * r.change) / 100, 0) / tokensTotal * 100
    : 0;

  // ── Orah Wallet: exchange balance is the primary trading balance ───────────
  const isOrahWallet = provider === "orah-wallet";

  const exchTotalUsd = exchBalancesWithValue.reduce((sum, b) => {
    const isStable = ["USDT","USDC","DAI","BUSD","oUSD"].includes(b.asset);
    const p = isStable ? 1 : (prices?.[b.asset]?.lastPrice ?? 0);
    return sum + (b.free + b.locked) * p;
  }, 0);

  const exchNonZero = exchBalancesWithValue.map(b => {
    const isStable = ["USDT","USDC","DAI","BUSD","oUSD"].includes(b.asset);
    const p = isStable ? 1 : (prices?.[b.asset]?.lastPrice ?? 0);
    const change = isStable ? 0 : (prices?.[b.asset]?.priceChangePercent24h ?? 0);
    return { ...b, price: p, value: (b.free + b.locked) * p, change };
  }).filter(b => b.free > 0 || b.locked > 0);

  // Show Trading Balance card if Orah/Reown wallet OR if the address has any
  // exchange ledger balances (covers edge cases where provider string differs).
  const showTradingBalance = isOrahWallet || exchNonZero.length > 0;

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!address) {
    return (
      <div className="flex flex-col h-full bg-background overflow-y-auto pb-24">
        <div className="px-4 pt-6 pb-4">
          <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
        </div>

        {/* Hero card */}
        <div className="mx-4 mt-2 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-6 text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-3">
            <Zap size={28} className="text-primary" />
          </div>
          <h2 className="text-2xl font-black text-foreground tracking-tight">Login to Trade</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            Connect your wallet to view live balances, track P&amp;L, receive funds, and start trading instantly.
          </p>
        </div>

        {/* Wallet options */}
        <div className="mx-4 mt-5 space-y-3">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground px-1">Choose your wallet type</p>

          {/* EVM */}
          <button
            onClick={() => openWallet()}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-blue-500/40 hover:bg-blue-500/5 active:opacity-80 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
              🦊
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">EVM Wallets</p>
              <p className="text-xs text-muted-foreground mt-0.5">MetaMask · Coinbase · Trust · Ledger + all L2s</p>
              <div className="flex gap-1 mt-1.5">
                {["ETH","BNB","MATIC","ARB","BASE","AVAX","MNT"].map(s => (
                  <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{s}</span>
                ))}
              </div>
            </div>
            <span className="text-blue-400 text-xs font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
          </button>

          {/* TRON */}
          <button
            onClick={() => openWallet()}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-red-500/40 hover:bg-red-500/5 active:opacity-80 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
              🔴
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">TRON Wallet</p>
              <p className="text-xs text-muted-foreground mt-0.5">TronLink · imToken · Trust · TokenPocket · OKX</p>
              <div className="flex gap-1 mt-1.5">
                {["TRX","USDT","BTT","WIN","JST"].map(s => (
                  <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{s}</span>
                ))}
              </div>
            </div>
            <span className="text-red-400 text-xs font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
          </button>

          {/* BSV */}
          <button
            onClick={() => openWallet()}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 active:opacity-80 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
              ⚡
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Bitcoin SV Wallet</p>
              <p className="text-xs text-muted-foreground mt-0.5">HandCash · RelayX · Panda · Sensilet · manual</p>
              <div className="flex gap-1 mt-1.5">
                {["BSV","FAST","LOW FEE"].map(s => (
                  <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{s}</span>
                ))}
              </div>
            </div>
            <span className="text-primary text-xs font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
          </button>

          {/* SOL / BTC */}
          <button
            onClick={() => openWallet()}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-violet-500/40 hover:bg-violet-500/5 active:opacity-80 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 text-xl group-hover:scale-105 transition-transform">
              🌐
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Other Wallets</p>
              <p className="text-xs text-muted-foreground mt-0.5">Phantom (SOL) · UniSat · Xverse (BTC) · more</p>
              <div className="flex gap-1 mt-1.5">
                {["SOL","BTC","ORDINALS"].map(s => (
                  <span key={s} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">{s}</span>
                ))}
              </div>
            </div>
            <span className="text-violet-400 text-xs font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        </div>

        {/* Features list */}
        <div className="mx-4 mt-5 p-4 rounded-2xl bg-secondary/40 border border-border">
          <p className="text-xs font-semibold text-muted-foreground mb-3">After connecting you can:</p>
          <div className="space-y-2">
            {[
              { icon: "📊", text: "View live portfolio balance & P&L" },
              { icon: "💳", text: "Buy crypto with fiat (Apple Pay, Card, Bank)" },
              { icon: "💸", text: "Receive funds directly to your wallet" },
              { icon: "⚡", text: "Trade spot & futures markets" },
              { icon: "🔗", text: "Cross-chain BSV settlements via HTLC" },
            ].map(f => (
              <div key={f.text} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                <span className="text-base leading-none">{f.icon}</span>
                {f.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <ReceiveModal isOpen={receiveOpen} onClose={() => setReceiveOpen(false)} />
      <BuyCryptoModal open={buyCryptoOpen} onClose={() => setBuyCryptoOpen(false)} />
      {withdrawAsset && (() => {
        const assetNet = getAssetNetworkInfo(withdrawAsset.asset, network);
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

      <div className="flex flex-col h-full overflow-y-auto pb-24 bg-background">
        {/* Header */}
        <div className="px-4 pt-safe-top pb-3 pt-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
            {network && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {provider ? getProviderLabel(provider) : network.toUpperCase()} · {network.toUpperCase()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 bg-card border border-border rounded-full px-3 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-muted-foreground font-mono font-medium">
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className={cn(
                "p-2 rounded-full border transition-all",
                copied
                  ? "border-green-500/40 text-green-400 bg-green-500/10"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
              title="Copy address"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button
              onClick={() => { refetch(); if (network === "evm") evmRefresh?.(); if (network === "tron") tronRefresh?.(); }}
              className="p-2 rounded-full border border-border text-muted-foreground hover:text-foreground transition-all"
              title="Refresh"
            >
              <RefreshCw size={13} className={pricesLoading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={async () => {
                if (provider === "reown") await disconnectReown();
                disconnect();
              }}
              className="p-2 rounded-full border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30 transition-all"
              title="Disconnect wallet"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>

        <div className="px-4 space-y-4">
          {/* ── Exchange Addresses ───────────────────────────────────────────────── */}
          <ExchangeAddressesCard walletAddress={address} />

          {/* ── BUCKET 1: Balance card ───────────────────────────────────────────── */}
          {showTradingBalance ? (
            /* ── Orah Wallet / any user with exchange balances: Trading Balance is primary ── */
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Zap size={12} className="text-primary" />
                  <p className="text-xs text-muted-foreground font-medium">Trading Balance</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/25">
                  Orah Wallet
                </span>
              </div>

              {pricesLoading && exchTotalUsd === 0 ? (
                <div className="h-9 w-44 bg-muted/40 rounded-lg animate-pulse mb-2" />
              ) : (
                <p className="text-3xl font-bold text-foreground tracking-tight">
                  {formatQuoteAmount(exchTotalUsd, quoteCurrency)}
                </p>
              )}

              <p className="text-[10px] text-muted-foreground mt-1 mb-4">
                Live balance — updates immediately after every trade
              </p>

              {/* Exchange token rows */}
              {exchNonZero.length > 0 && (
                <div className="space-y-2.5">
                  {exchNonZero.map(b => {
                    const color = ASSET_COLORS[b.asset] ?? "#6B7280";
                    const assetNet = getAssetNetworkInfo(b.asset, network);
                    return (
                      <div key={b.asset} className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 border"
                          style={{ backgroundColor: color + "22", borderColor: color + "44", color }}
                        >
                          {b.asset[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{b.asset}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {b.free.toLocaleString(undefined, { maximumFractionDigits: b.free < 0.001 ? 8 : 4 })}
                            {b.locked > 0 && (
                              <span className="text-orange-400/70"> · {b.locked.toLocaleString(undefined, { maximumFractionDigits: 4 })} locked</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm font-bold text-foreground">{formatQuoteAmount(b.value, quoteCurrency)}</p>
                            {b.change !== 0 && (
                              <p className={`text-xs mt-0.5 ${b.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                                {b.change >= 0 ? "+" : ""}{b.change.toFixed(2)}%
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => navigate(`/bridge?tab=deposit&asset=${b.asset}`)}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-green-500/10 border border-green-500/25 text-green-400 active:bg-green-500/20 shrink-0"
                          >
                            Deposit
                          </button>
                          <button
                            onClick={() => {
                              setWithdrawAsset({ asset: b.asset, available: b.free, network: assetNet.network, networkLabel: assetNet.networkLabel, color });
                              setWithdrawOpen(true);
                            }}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-primary/10 border border-primary/25 text-primary active:bg-primary/20 shrink-0"
                          >
                            Withdraw
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* On-chain balance — secondary */}
              {nativeBalance > 0 && (
                <div className="mt-4 pt-3 border-t border-border/40">
                  <p className="text-[10px] text-muted-foreground mb-1">On-chain ({nativeAsset})</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {nativeBalance.toFixed(6)} {nativeAsset}
                    <span className="ml-2 text-muted-foreground/50">(not tradable — withdraw/deposit to use)</span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* ── External wallet: on-chain balance is primary ── */
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground font-medium">Wallet Balance</p>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                  network === "bsv" ? "bg-green-500/10 text-green-400 border-green-500/25"
                    : network === "evm" ? "bg-blue-500/10 text-blue-400 border-blue-500/25"
                    : network === "sol" ? "bg-violet-500/10 text-violet-400 border-violet-500/25"
                    : "bg-secondary text-muted-foreground border-border"
                )}>
                  {provider ? getProviderLabel(provider) : (network ?? "").toUpperCase()}
                </span>
              </div>
              {pricesLoading && total === 0 ? (
                <div className="h-9 w-44 bg-muted/40 rounded-lg animate-pulse mb-2" />
              ) : (
                <p className="text-3xl font-bold text-foreground tracking-tight">
                  {formatQuoteAmount(total, quoteCurrency)}
                </p>
              )}

              {total > 0 && (() => {
                const pnlUsd = total * totalChange / 100;
                return (
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className={cn("flex items-center gap-1.5", totalChange >= 0 ? "text-green-500" : "text-red-500")}>
                      {totalChange >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      <span className="text-sm font-bold">{totalChange >= 0 ? "+" : ""}{totalChange.toFixed(2)}%</span>
                    </div>
                    <span className="text-muted-foreground/40 text-xs">·</span>
                    <span className={cn("text-sm font-semibold", totalChange >= 0 ? "text-green-400/80" : "text-red-400/80")}>
                      {pnlUsd >= 0 ? "+" : "−"}{formatQuoteAmount(Math.abs(pnlUsd), quoteCurrency)} today
                    </span>
                  </div>
                );
              })()}

              {/* Available vs Locked breakdown */}
              {lockedTotalUsd > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Available</p>
                    <p className="text-sm font-bold text-green-400">{formatQuoteAmount(Math.max(0, total - lockedTotalUsd), quoteCurrency)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">Busy in Trade</p>
                    <p className="text-sm font-bold text-orange-400">{formatQuoteAmount(lockedTotalUsd, quoteCurrency)}</p>
                  </div>
                </div>
              )}

              {/* Allocation bar */}
              {total > 0 && nonZero.length > 0 && (
                <>
                  <div className="flex h-1.5 rounded-full overflow-hidden mt-4 gap-0.5">
                    {nonZero.map(r => (
                      <div key={r.asset} className="h-full rounded-full" style={{ flex: r.value / total, backgroundColor: r.color }} />
                    ))}
                  </div>
                  <div className="flex gap-3 mt-2 flex-wrap">
                    {nonZero.map(r => (
                      <div key={r.asset} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                        <span className="text-[10px] text-muted-foreground">{r.asset}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── BUCKET 2: Busy in Trade (locked in open limit/stop orders) ───── */}
          {lockedEntries.length > 0 && (
            <div className="bg-orange-500/5 border border-orange-500/25 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span className="text-sm font-bold text-orange-300">Busy in Trade</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 uppercase tracking-wide">Reserved</span>
                </div>
                <span className="text-base font-bold text-orange-300">{formatQuoteAmount(lockedTotalUsd, quoteCurrency)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-3">
                Reserved for your open limit/stop orders. Released back when orders are filled or cancelled.
              </p>
              <div className="space-y-2">
                {lockedEntries.map(([token, v]) => {
                  const isStable = ["USDT","USDC","DAI","BUSD"].includes(token);
                  const p = isStable ? 1 : (prices?.[token]?.lastPrice ?? 0);
                  const usdVal = v.amount * p;
                  return (
                    <div key={token} className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-bold text-foreground">{token}</span>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {v.orders.map(o => (
                            <span key={o.id} className="mr-2">
                              {o.type.toUpperCase()} {o.side.toUpperCase()} {o.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })} {o.symbol?.split("/")[0]}
                              {o.price > 0 ? ` @ $${o.price.toLocaleString()}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-xs font-mono text-foreground">{v.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
                        {usdVal > 0 && <div className="text-[10px] text-muted-foreground">≈ {formatQuoteAmount(usdVal, quoteCurrency)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Buy / Deposit / Bridge */}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setBuyCryptoOpen(true)} className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-gradient-to-b from-green-600 to-emerald-600 text-white font-bold text-xs shadow-lg shadow-green-600/20 active:opacity-90">
              <CreditCard size={15} />
              Buy
            </button>
            <button onClick={() => setReceiveOpen(true)} className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-xs shadow-lg shadow-primary/20 active:opacity-90">
              <ArrowDownToLine size={15} />
              Receive
            </button>
            <button onClick={() => navigate("/deposit-bsv")} className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-green-500/10 border border-green-500/30 text-green-400 font-bold text-xs active:bg-green-500/20 transition-colors">
              <ArrowLeftRight size={15} />
              Bridge
            </button>
          </div>

          {/* Fund CTAs */}
          <button onClick={() => setBuyCryptoOpen(true)} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-green-500/5 border border-green-500/20 hover:border-green-500/40 transition-colors text-left">
            <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
              <CreditCard size={16} className="text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Buy Crypto with Fiat</p>
              <p className="text-xs text-muted-foreground truncate">Apple Pay · Google Pay · Card · Bank Transfer — instant</p>
            </div>
            <span className="text-green-400 text-xs font-medium shrink-0">Buy →</span>
          </button>
          <button onClick={() => setReceiveOpen(true)} className="w-full flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/20 hover:border-primary/40 transition-colors text-left">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <ArrowDownToLine size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Receive via QR Code</p>
              <p className="text-xs text-muted-foreground truncate">ETH · BNB · MATIC · ARB · BASE · AVAX · Linea · Scroll · Mantle · all EVM</p>
            </div>
            <span className="text-primary text-xs font-medium shrink-0">Scan →</span>
          </button>


          {/* ── BUCKET 4: DeFi / Liquidity (LP tokens, Uniswap, AMM) ─────────── */}
          {lpTotalValue > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Droplets size={14} className="text-primary" />
                  <span className="text-sm font-bold text-foreground">DeFi / Liquidity</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 uppercase tracking-wide">LP</span>
                </div>
                <span className="text-base font-bold text-primary">{formatQuoteAmount(lpTotalValue, quoteCurrency)}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Liquidity deposited into AMM pools (Uniswap, etc.). Underlying tokens stay in your wallet — value shown here is your LP position.
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2">
            {(["assets", "defi", "orders"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                  tab === t
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-card border-border text-muted-foreground"
                }`}
              >
                {t === "assets" ? "Token" : t === "defi" ? "DeFi" : "Orders"}
                {t === "defi" && lpPositions.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                    {lpPositions.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Assets tab */}
          {tab === "assets" && (
            <>
              {/* Note about single-chain view for EVM wallets */}
              {network === "evm" && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/15">
                  <Info size={14} className="text-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Showing on-chain balances for your connected network. Switch chains in your wallet to view other assets.
                  </p>
                </div>
              )}

              <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
                {rows.map((r, i) => (
                  <div
                    key={r.asset}
                    className={`flex items-center gap-3 px-4 py-3.5 ${i < rows.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 border"
                      style={{ backgroundColor: r.color + "22", borderColor: r.color + "44", color: r.color }}
                    >
                      {r.asset[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-foreground">{r.asset}</p>
                        {r.isNative && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 border border-green-500/25">
                            NATIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {r.amount > 0
                          ? r.amount.toLocaleString(undefined, { maximumFractionDigits: r.amount < 0.0001 ? 8 : 6 })
                          : "0.000000"}
                      </p>
                      {r.price > 0 && !["USDT","USDC","DAI"].includes(r.asset) && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          @ ${r.price.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: r.price < 1 ? 6 : 2,
                          })}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">
                        {formatQuoteAmount(r.value, quoteCurrency)}
                      </p>
                      {r.change !== 0 && (
                        <p className={`text-xs font-medium mt-0.5 ${r.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {r.change >= 0 ? "+" : ""}{r.change.toFixed(2)}%
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* OrahDEX Exchange Balances — hidden when Trading Balance card is shown above */}
              {!showTradingBalance && exchBalancesWithValue.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <Zap size={12} className="text-primary" />
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">OrahDEX Exchange</span>
                  </div>
                  <div className="bg-card border border-primary/20 rounded-2xl overflow-hidden">
                    {exchBalancesWithValue.map((b, i) => {
                      const color = b.asset === "ETH" ? "#627EEA"
                        : b.asset === "BTC" ? "#F7931A"
                        : b.asset === "USDT" ? "#26A17B"
                        : b.asset === "USDC" ? "#2775CA"
                        : b.asset === "BSV" ? "#EAB308"
                        : b.asset === "BNB" ? "#F0B90B"
                        : "#6B7280";
                      const assetNet = getAssetNetworkInfo(b.asset, network);
                      return (
                        <div
                          key={b.asset}
                          className={`flex items-center gap-3 px-4 py-3.5 ${i < exchBalancesWithValue.length - 1 ? "border-b border-border" : ""}`}
                        >
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 border"
                            style={{ backgroundColor: color + "22", borderColor: color + "44", color }}
                          >
                            {b.asset[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">{b.asset}</p>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                              {b.free.toLocaleString(undefined, { maximumFractionDigits: b.free < 0.0001 ? 8 : 6 })}
                              {b.locked > 0 && <span className="text-muted-foreground/50"> · {b.locked.toLocaleString(undefined, { maximumFractionDigits: 4 })} locked</span>}
                            </p>
                          </div>
                          <button
                            onClick={() => navigate(`/bridge?tab=deposit&asset=${b.asset}`)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-green-500/10 border border-green-500/25 text-green-400 hover:bg-green-500/20 transition-colors shrink-0"
                          >
                            Deposit
                          </button>
                          <button
                            onClick={() => {
                              setWithdrawAsset({ asset: b.asset, available: b.free, network: assetNet.network, networkLabel: assetNet.networkLabel, color });
                              setWithdrawOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-primary/10 border border-primary/25 text-primary hover:bg-primary/20 transition-colors shrink-0"
                          >
                            Withdraw
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground px-1 mt-1.5">
                    Post-trade balances credited to your OrahDEX account. Withdraw to your wallet anytime.
                  </p>
                </div>
              )}
            </>
          )}

          {/* DeFi tab */}
          {tab === "defi" && (
            lpPositions.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 mb-4 flex flex-col items-center gap-2 text-muted-foreground">
                <Droplets className="w-8 h-8 opacity-30 mb-1" />
                <p className="text-sm font-medium">No DeFi positions yet</p>
                <p className="text-xs opacity-60 text-center">Add liquidity to a pool to get started</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mb-4">

                {/* DeFi summary row — only when LP positions exist */}
                {lpPositions.length > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplets size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground">Total LP Value</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-primary">
                      ${lpTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {address && (
                      <button
                        onClick={() => { if (window.confirm("Remove all LP positions? This only clears the local record — no on-chain change.")) clearWalletPositions(address); }}
                        className="text-[10px] px-2 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 font-semibold"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>
                )}

                {lpPositions.map(([poolId, pos]) => {
                  const display = POOL_LABELS_MOBILE[poolId] ?? poolId.toUpperCase().replace("-", " / ");
                  const explorerBase = pos.chainId ? EXPLORER_TX[pos.chainId] : null;
                  const txUrl   = explorerBase && pos.txHash ? `${explorerBase}${pos.txHash}` : null;
                  const dateStr = new Date(pos.depositedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
                  const isTronPool = TRON_POOL_IDS.has(poolId);
                  const chainName = pos.chainId ? (CHAIN_NAMES[pos.chainId] ?? `Chain ${pos.chainId}`) : isTronPool ? "TRON" : null;
                  const chainColor = pos.chainId === 1 ? { bg: "bg-violet-500/15", text: "text-violet-400", border: "border-violet-500/25" }
                    : pos.chainId === 8453 ? { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/25" }
                    : isTronPool ? { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/25" }
                    : { bg: "bg-secondary/50", text: "text-muted-foreground", border: "border-border" };
                  return (
                    <div key={poolId} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm">{display}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-[10px] text-green-400 font-semibold">ACTIVE · EARNING FEES</span>
                          </div>
                        </div>
                        {chainName && (
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${chainColor.bg} ${chainColor.text} ${chainColor.border}`}>
                            {chainName}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-secondary/30 rounded-xl p-3">
                          <div className="text-[10px] text-muted-foreground mb-0.5">LP Tokens</div>
                          <div className="font-mono font-bold text-sm">{pos.lpTokens.toFixed(4)}</div>
                        </div>
                        <div className="bg-secondary/30 rounded-xl p-3">
                          <div className="text-[10px] text-muted-foreground mb-0.5">Est. Value</div>
                          <div className="font-mono font-bold text-sm">{formatQuoteAmount(pos.depositedValueUsd, quoteCurrency)}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{dateStr}</span>
                        <div className="flex items-center gap-2">
                          {txUrl ? (
                            <a
                              href={txUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold"
                            >
                              View Tx <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : pos.txHash ? (
                            <span className="font-mono text-[10px]">{pos.txHash.slice(0, 8)}…</span>
                          ) : null}
                          {address && (
                            <button
                              onClick={() => removePosition(address, poolId)}
                              className="text-[10px] px-2 py-1.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 font-semibold"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Orders tab */}
          {tab === "orders" && (
            myOrders.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 mb-4 flex flex-col items-center gap-2 text-muted-foreground">
                <p className="text-sm font-medium">No orders yet</p>
                <p className="text-xs opacity-60 text-center">Your open and past orders will appear here</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
                {myOrders.map((o: any, i: number) => (
                  <div
                    key={o.id}
                    className={`flex items-center gap-3 px-4 py-3.5 ${i < myOrders.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground">{o.symbol}</span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{
                            backgroundColor: o.side === "buy" ? "#22c55e18" : "#ef444418",
                            color: o.side === "buy" ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {o.side.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {o.type ?? "limit"} · {Number(o.quantity).toFixed(4)} @ ${Number(o.price).toLocaleString()}
                      </p>
                    </div>
                    {o.status === "open" ? (
                      <button
                        onClick={() => cancelMutation.mutate(String(o.id))}
                        disabled={cancellingId === String(o.id)}
                        className="shrink-0 px-3 py-1.5 rounded-xl border border-red-500/40 text-red-400 text-[11px] font-bold active:bg-red-500/10 disabled:opacity-40 transition-all"
                      >
                        {cancellingId === String(o.id) ? "…" : "Cancel"}
                      </button>
                    ) : (
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold capitalize" style={{ color: STATUS_COLOR[o.status] ?? "#6b7280" }}>
                          {o.status}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(o.updatedAt ?? o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>

      </div>
    </>
  );
}
