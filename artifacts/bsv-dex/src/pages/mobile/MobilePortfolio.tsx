import {
  Link2, TrendingUp, TrendingDown,
  ArrowDownToLine, ArrowUpFromLine,
  Copy, Check, RefreshCw, Info,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DepositModal } from "@/components/DepositModal";
import { WithdrawModal } from "@/components/WithdrawModal";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Map EVM chainId → portfolio native symbol
const EVM_NATIVE: Record<number, string> = {
  1: "ETH", 10: "ETH", 42161: "ETH", 8453: "ETH",
  59144: "ETH", 324: "ETH", 534352: "ETH", 5000: "MNT",
  56: "BNB", 137: "MATIC", 43114: "AVAX", 250: "FTM", 25: "CRO",
};

function getNativeAsset(network: string | null, chainId: number | null): string {
  if (network === "bsv") return "BSV";
  if (network === "sol") return "SOL";
  if (network === "btc") return "BTC";
  if (network === "evm" && chainId) return EVM_NATIVE[chainId] ?? "ETH";
  return "ETH";
}

// All DEX-traded assets shown in the portfolio
const PORTFOLIO_ASSETS = [
  { asset: "BSV",  marketSymbol: "BSV-USDT",  color: "#22C55E" },
  { asset: "USDT", marketSymbol: null,          color: "#34D399" },
  { asset: "BTC",  marketSymbol: "BTC-USDT",  color: "#F97316" },
  { asset: "ETH",  marketSymbol: "ETH-USDT",  color: "#8B5CF6" },
  { asset: "BNB",  marketSymbol: "BNB-USDT",  color: "#EAB308" },
];

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

const ORDERS = [
  { id: "1", symbol: "BSV/USDT", side: "buy",  type: "limit",  price: 54.00, qty: 10,   status: "open",      time: "09:15" },
  { id: "2", symbol: "BTC/USDT", side: "sell", type: "market", price: 65400, qty: 0.01, status: "filled",    time: "08:42" },
  { id: "3", symbol: "ETH/USDT", side: "buy",  type: "limit",  price: 3150,  qty: 0.5,  status: "cancelled", time: "07:30" },
];
const STATUS_COLOR: Record<string, string> = { open: "#4ade80", filled: "#22c55e", cancelled: "#6b7280" };

type Tab = "assets" | "orders";

export function MobilePortfolio() {
  const { address, network, provider, chainId, balance } = useWalletStore();
  const [tab, setTab] = useState<Tab>("assets");
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: prices, isLoading: pricesLoading, refetch } = useLivePrices();

  const nativeAsset = getNativeAsset(network, chainId);
  const nativeBalance = balance ? parseFloat(balance) : 0;

  // Build rows: native token gets the real wallet balance, everything else is 0
  const rows = PORTFOLIO_ASSETS.map(a => {
    const mkt = prices?.[a.asset];
    const price      = a.asset === "USDT" ? 1 : (mkt?.lastPrice ?? 0);
    const change     = a.asset === "USDT" ? 0 : (mkt?.priceChangePercent24h ?? 0);
    const amount     = a.asset === nativeAsset ? nativeBalance : 0;
    const value      = amount * price;
    return { ...a, amount, price, change, value };
  });

  const total = rows.reduce((s, r) => s + r.value, 0);
  const nonZero = rows.filter(r => r.amount > 0);
  const totalChange = total > 0 && nonZero.length > 0
    ? nonZero.reduce((s, r) => s + (r.value * r.change) / 100, 0) / total * 100
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
          <p className="text-sm text-muted-foreground leading-relaxed">
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
          <div>
            <h1 className="text-xl font-bold text-foreground">Portfolio</h1>
            {network && (
              <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                {provider ?? network} · {network.toUpperCase()}
              </p>
            )}
          </div>
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
              title="Refresh"
            >
              <RefreshCw size={13} className={pricesLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="px-4 space-y-4">
          {/* Total value card */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs text-muted-foreground mb-1">Wallet Balance</p>
            {pricesLoading && total === 0 ? (
              <div className="h-9 w-44 bg-muted/40 rounded-lg animate-pulse mb-2" />
            ) : (
              <p className="text-3xl font-bold text-foreground tracking-tight">
                ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}

            {nativeBalance > 0 && (
              <div className="flex items-center gap-1.5 mt-2">
                {totalChange >= 0
                  ? <TrendingUp size={14} className="text-green-500" />
                  : <TrendingDown size={14} className="text-red-500" />}
                <span className={`text-sm font-semibold ${totalChange >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {totalChange >= 0 ? "+" : ""}{totalChange.toFixed(2)}% today
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
            <>
              {/* Deposit hint when non-native assets are 0 */}
              {rows.filter(r => r.amount === 0).length > 0 && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/15">
                  <Info size={14} className="text-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Your wallet balance is shown above. Deposit assets into OrahDEX to start trading.
                  </p>
                </div>
              )}

              <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
                {rows.map((r, i) => (
                  <div
                    key={r.asset}
                    className={`flex items-center gap-3 px-4 py-3.5 ${i < rows.length - 1 ? "border-b border-border" : ""} ${r.amount === 0 ? "opacity-50" : ""}`}
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
                        {r.asset === nativeAsset && r.amount > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 border border-green-500/25">
                            WALLET
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.amount > 0
                          ? r.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })
                          : r.asset === nativeAsset
                            ? "0.000000"
                            : "— deposit to trade"}
                      </p>
                      {r.price > 0 && r.asset !== "USDT" && r.amount > 0 && (
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
                        ${r.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {r.amount > 0 && (
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
