import {
  TrendingUp, TrendingDown,
  ArrowDownToLine, ArrowUpFromLine,
  Copy, Check, RefreshCw, Info,
  LogOut, Zap, Droplets, ExternalLink, ArrowLeftRight,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { disconnectReown } from "@/lib/reown";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DepositModal } from "@/components/DepositModal";
import { WithdrawModal } from "@/components/WithdrawModal";
import { cn, getProviderLabel } from "@/lib/utils";
import { useSettingsStore, formatQuoteAmount } from "@/store/useSettingsStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { useTronBalances } from "@/hooks/useTronBalances";
import { useLiquidityStore } from "@/store/useLiquidityStore";
import { useExchangeBalanceStore } from "@/store/useExchangeBalanceStore";
import { EXPLORER_TX, CHAIN_NAMES } from "@/lib/onChainLiquidity";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  const { getBalances: getExchangeBalances } = useExchangeBalanceStore();
  const lpPositions = address ? Object.entries(getUserPositions(address)) : [];
  const { open: openWallet } = useWalletModalStore();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("assets");
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
    refetchInterval: 5000,
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
    onMutate: (id) => setCancellingId(id),
    onSettled: () => {
      setCancellingId(null);
      queryClient.invalidateQueries({ queryKey: ["portfolio-orders", address] });
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

  const tokensTotal = rows.reduce((s, r) => s + r.value, 0);
  const lpTotalValue = lpPositions.reduce((s, [, pos]) => s + (pos.depositedValueUsd ?? 0), 0);

  // OrahDEX exchange balance (accumulated from matched trades)
  const exchangeBalances = address ? getExchangeBalances(address) : {};
  const exchangeTokens = Object.entries(exchangeBalances).filter(([, amt]) => amt > 0);
  const exchangeTotalValue = exchangeTokens.reduce((s, [token, amt]) => {
    const stables = ["USDT", "USDC", "DAI", "BUSD"];
    if (stables.includes(token)) return s + amt;
    const p = prices?.[token]?.lastPrice ?? 0;
    return s + amt * p;
  }, 0);

  // LP positions are virtual (ETH stays on-chain) so their value is already
  // captured in tokensTotal via evmBalances. Only add exchangeTotalValue which
  // represents settled OrahDEX balances not reflected in the wallet.
  const total = tokensTotal + exchangeTotalValue;
  const nonZero = rows.filter(r => r.amount > 0);
  const totalChange = tokensTotal > 0 && nonZero.length > 0
    ? nonZero.reduce((s, r) => s + (r.value * r.change) / 100, 0) / tokensTotal * 100
    : 0;

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
            Connect your wallet to view balances, track P&amp;L, deposit, withdraw, and start trading instantly.
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
              { icon: "💸", text: "Deposit & withdraw instantly" },
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
      <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
      <WithdrawModal isOpen={withdrawOpen} onClose={() => setWithdrawOpen(false)} />

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
          {/* Total value card */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Total Balance</p>
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
                <div className="flex items-center gap-3 mt-2">
                  <div className={cn("flex items-center gap-1.5", totalChange >= 0 ? "text-green-500" : "text-red-500")}>
                    {totalChange >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    <span className="text-sm font-bold">
                      {totalChange >= 0 ? "+" : ""}{totalChange.toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-muted-foreground/40 text-xs">·</span>
                  <span className={cn("text-sm font-semibold", totalChange >= 0 ? "text-green-400/80" : "text-red-400/80")}>
                    {pnlUsd >= 0 ? "+" : "−"}${Math.abs(pnlUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} today
                  </span>
                </div>
              );
            })()}

            {/* LP value breakdown — informational only (assets stay on-chain, already in token total) */}
            {lpTotalValue > 0 && (
              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border/50">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Droplets size={11} className="text-primary" />
                  <span>DeFi (LP positions)</span>
                </div>
                <span className="text-[11px] font-semibold text-primary">
                  ${lpTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} allocated
                </span>
              </div>
            )}

            {/* OrahDEX Exchange Balance breakdown */}
            {exchangeTotalValue > 0 && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Zap size={11} className="text-amber-400" />
                  <span>OrahDEX Balance</span>
                </div>
                <span className="text-[11px] font-semibold text-amber-400">
                  +${exchangeTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Allocation bar — only show if there's a real balance */}
            {total > 0 && (
              <>
                <div className="flex h-1.5 rounded-full overflow-hidden mt-4 gap-0.5">
                  {nonZero.map(r => (
                    <div
                      key={r.asset}
                      className="h-full rounded-full"
                      style={{ flex: r.value / total, backgroundColor: r.color }}
                    />
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

          {/* Deposit / Withdraw / Bridge */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setDepositOpen(true)}
              className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-xs shadow-lg shadow-primary/20 active:opacity-90"
            >
              <ArrowDownToLine size={15} />
              Deposit
            </button>
            <button
              onClick={() => setWithdrawOpen(true)}
              className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-card border border-border text-foreground font-semibold text-xs active:opacity-80"
            >
              <ArrowUpFromLine size={15} />
              Withdraw
            </button>
            <button
              onClick={() => navigate("/deposit-bsv")}
              className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-green-500/10 border border-green-500/30 text-green-400 font-bold text-xs active:bg-green-500/20 transition-colors"
            >
              <ArrowLeftRight size={15} />
              Bridge
            </button>
          </div>

          {/* Deposit CTA */}
          <button
            onClick={() => setDepositOpen(true)}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/20 hover:border-primary/40 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <ArrowDownToLine size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Deposit via QR Code</p>
              <p className="text-xs text-muted-foreground truncate">ETH · BNB · MATIC · ARB · BASE · AVAX · Linea · Scroll · Mantle · all EVM</p>
            </div>
            <span className="text-primary text-xs font-medium shrink-0">Scan →</span>
          </button>

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
                {t === "defi" && (lpPositions.length + exchangeTokens.length) > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                    {lpPositions.length + exchangeTokens.length}
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
            </>
          )}

          {/* DeFi tab */}
          {tab === "defi" && (
            (lpPositions.length === 0 && exchangeTokens.length === 0) ? (
              <div className="bg-card border border-border rounded-2xl p-8 mb-4 flex flex-col items-center gap-2 text-muted-foreground">
                <Droplets className="w-8 h-8 opacity-30 mb-1" />
                <p className="text-sm font-medium">No DeFi positions yet</p>
                <p className="text-xs opacity-60 text-center">Trade or add liquidity to a pool to get started</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mb-4">

                {/* OrahDEX Exchange Balance — tokens received from matched trades */}
                {exchangeTokens.length > 0 && (
                  <div className="bg-card border border-amber-500/25 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap size={14} className="text-amber-400" />
                        <span className="text-sm font-bold">OrahDEX Balance</span>
                      </div>
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-bold border bg-amber-500/15 text-amber-400 border-amber-500/25">
                        EXCHANGE
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Tokens accumulated from matched order-book trades. Settled on BSV chain.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {exchangeTokens.map(([token, amt]) => {
                        const stables = ["USDT", "USDC", "DAI", "BUSD"];
                        const isStable = stables.includes(token);
                        const px = isStable ? 1 : (prices?.[token]?.lastPrice ?? 0);
                        const val = amt * px;
                        return (
                          <div key={token} className="bg-secondary/30 rounded-xl p-3">
                            <div className="text-[10px] text-muted-foreground mb-0.5">{token}</div>
                            <div className="font-mono font-bold text-sm">
                              {amt < 0.0001 ? amt.toExponential(2) : isStable ? amt.toFixed(2) : amt.toFixed(6)}
                            </div>
                            {px > 0 && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                ≈ ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-amber-400/70 text-right">
                      Total ≈ ${exchangeTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                )}

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
                          <div className="font-mono font-bold text-sm">${pos.depositedValueUsd.toFixed(2)}</div>
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
