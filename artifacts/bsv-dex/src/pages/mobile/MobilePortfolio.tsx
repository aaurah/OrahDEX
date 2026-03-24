import { Link2, TrendingUp, TrendingDown, ArrowDownToLine, ArrowUpFromLine, Copy, Check, RefreshCw } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DepositModal } from "@/components/DepositModal";
import { WithdrawModal } from "@/components/WithdrawModal";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Demo holdings — amounts only; values computed from live prices
const HOLDINGS = [
  { asset: "BSV",  amount: 142.5,  color: "#22C55E" },
  { asset: "USDT", amount: 4520.5, color: "#34D399" },
  { asset: "BTC",  amount: 0.0824, color: "#F97316" },
  { asset: "ETH",  amount: 1.25,   color: "#8B5CF6" },
];

const ORDERS = [
  { id: "1", symbol: "BSV/USDT",  side: "buy",  type: "limit",  price: 54.00,  qty: 10,   status: "open",      time: "09:15" },
  { id: "2", symbol: "BTC/USDT",  side: "sell", type: "market", price: 65400,  qty: 0.01, status: "filled",    time: "08:42" },
  { id: "3", symbol: "ETH/USDT",  side: "buy",  type: "limit",  price: 3150,   qty: 0.5,  status: "cancelled", time: "07:30" },
];

const STATUS_COLOR: Record<string, string> = {
  open: "#4ade80",
  filled: "#22c55e",
  cancelled: "#6b7280",
};

type Tab = "assets" | "orders";

interface MarketRow {
  baseAsset: string;
  lastPrice: number;
  priceChangePercent24h: number;
}

function usePortfolioPrices() {
  return useQuery<MarketRow[]>({
    queryKey: ["portfolio-prices"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/markets?quote=USDT&limit=500`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch prices");
      const all: MarketRow[] = await res.json();
      return all.filter(m => HOLDINGS.some(h => h.asset === m.baseAsset));
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function MobilePortfolio() {
  const { address } = useWalletStore();
  const [tab, setTab] = useState<Tab>("assets");
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: prices, isLoading, refetch } = usePortfolioPrices();

  // Merge live prices into holdings
  const balances = HOLDINGS.map(h => {
    if (h.asset === "USDT") {
      return { ...h, price: 1, value: h.amount, change: 0 };
    }
    const mkt = prices?.find(m => m.baseAsset === h.asset);
    const price  = mkt?.lastPrice ?? 0;
    const change = mkt?.priceChangePercent24h ?? 0;
    return { ...h, price, value: h.amount * price, change };
  });

  const total = balances.reduce((s, b) => s + b.value, 0);
  const totalChange = total > 0
    ? balances.reduce((s, b) => s + (b.value * b.change) / 100, 0) / total * 100
    : 0;

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!address) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="px-4 pt-safe-top pb-4 pt-6">
          <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-10 text-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <Link2 size={36} className="text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Connect Your Wallet</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Connect your BSV, EVM, or Solana wallet to view your portfolio and start trading.
          </p>
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
          <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-card border border-border rounded-full px-3 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
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
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button
              onClick={() => refetch()}
              className="p-2 rounded-full border border-border text-muted-foreground hover:text-foreground transition-all"
              title="Refresh prices"
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="px-4 space-y-4">
          {/* Total value card */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs text-muted-foreground mb-1">Total Portfolio Value</p>
            {isLoading && total === 0 ? (
              <div className="h-9 w-40 bg-muted/40 rounded-lg animate-pulse mb-2" />
            ) : (
              <p className="text-3xl font-bold text-foreground tracking-tight">
                ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-2">
              {totalChange >= 0
                ? <TrendingUp size={14} className="text-green-500" />
                : <TrendingDown size={14} className="text-red-500" />}
              <span className={`text-sm font-semibold ${totalChange >= 0 ? "text-green-500" : "text-red-500"}`}>
                {totalChange >= 0 ? "+" : ""}{totalChange.toFixed(2)}% today
              </span>
            </div>
            {/* Allocation bar */}
            <div className="flex h-1.5 rounded-full overflow-hidden mt-4 gap-0.5">
              {balances.map(b => (
                <div
                  key={b.asset}
                  className="h-full rounded-full transition-all duration-500"
                  style={{ flex: total > 0 ? b.value / total : 1 / balances.length, backgroundColor: b.color }}
                />
              ))}
            </div>
            <div className="flex gap-3 mt-2 flex-wrap">
              {balances.map(b => (
                <div key={b.asset} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                  <span className="text-[10px] text-muted-foreground">{b.asset}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Deposit / Withdraw */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setDepositOpen(true)}
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20 active:opacity-90"
            >
              <ArrowDownToLine size={16} /> Deposit
            </button>
            <button
              onClick={() => setWithdrawOpen(true)}
              className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-card border border-border text-foreground font-semibold text-sm active:opacity-80"
            >
              <ArrowUpFromLine size={16} /> Withdraw
            </button>
          </div>

          {/* Deposit QR hint */}
          <button
            onClick={() => setDepositOpen(true)}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/20 hover:border-primary/40 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <ArrowDownToLine size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Deposit via QR Code</p>
              <p className="text-xs text-muted-foreground truncate">ETH · BNB · MATIC · BSV · ARB · BASE · all EVM networks</p>
            </div>
            <span className="text-primary text-xs font-medium shrink-0">Scan →</span>
          </button>

          {/* Tabs */}
          <div className="flex gap-2">
            {(["assets", "orders"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  tab === t
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-card border-border text-muted-foreground"
                }`}
              >
                {t === "assets" ? "Assets" : "Orders"}
              </button>
            ))}
          </div>

          {/* Assets tab */}
          {tab === "assets" && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
              {balances.map((b, i) => (
                <div
                  key={b.asset}
                  className={`flex items-center gap-3 px-4 py-3.5 ${i < balances.length - 1 ? "border-b border-border" : ""}`}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 border"
                    style={{ backgroundColor: b.color + "22", borderColor: b.color + "44", color: b.color }}
                  >
                    {b.asset[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{b.asset}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {b.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </p>
                    {b.price > 0 && b.asset !== "USDT" && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        @ ${b.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: b.price < 1 ? 6 : 2 })}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {isLoading && b.value === 0 ? (
                      <div className="h-4 w-20 bg-muted/40 rounded animate-pulse mb-1" />
                    ) : (
                      <p className="text-sm font-bold text-foreground">
                        ${b.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                    <p className={`text-xs font-medium mt-0.5 ${b.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {b.change >= 0 ? "+" : ""}{b.change.toFixed(2)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Orders tab */}
          {tab === "orders" && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
              {ORDERS.map((o, i) => (
                <div
                  key={o.id}
                  className={`flex items-center gap-3 px-4 py-3.5 ${i < ORDERS.length - 1 ? "border-b border-border" : ""}`}
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
                      {o.type} · {o.qty} @ ${o.price.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold capitalize" style={{ color: STATUS_COLOR[o.status] }}>
                      {o.status}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{o.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
