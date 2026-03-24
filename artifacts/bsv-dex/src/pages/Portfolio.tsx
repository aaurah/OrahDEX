import { useSEO } from "@/hooks/useSEO";
import { useWalletStore } from "@/store/useWalletStore";
import { formatPrice, formatPercent, cn } from "@/lib/utils";
import { Eye, EyeOff, ArrowDownToLine, ArrowUpFromLine, History, Copy, Check, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DepositModal } from "@/components/DepositModal";
import { WithdrawModal } from "@/components/WithdrawModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BalanceRow {
  asset: string;
  total: number;
  free: number;
  locked: number;
  valueUSD: number;
  price: number;
  change24hPercent: number;
  pnl24h: number;
  pnl24hPercent: number;
}

interface PortfolioData {
  walletAddress: string;
  totalValueUSD: number;
  totalPnlUSD: number;
  totalPnlPercent: number;
  balances: BalanceRow[];
  openOrdersCount: number;
  openPositionsCount: number;
}

function usePortfolioData(address: string | null) {
  return useQuery<PortfolioData>({
    queryKey: ["portfolio", address],
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/portfolio?walletAddress=${encodeURIComponent(address!)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to fetch portfolio");
      return res.json();
    },
    enabled: !!address,
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

  const { address, network, provider } = useWalletStore();
  const { data: portfolio, isLoading, refetch, isFetching } = usePortfolioData(address);

  const [hideBalances, setHideBalances] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAsset, setWithdrawAsset] = useState("USDT");
  const [copiedAddr, setCopiedAddr] = useState(false);

  const handleCopyAddr = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  if (!address) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <History className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-3">Portfolio Overview</h2>
        <p className="text-muted-foreground mb-8">Connect your wallet to view your balances, open orders, and transaction history on OrahDEX.</p>
      </div>
    );
  }

  const balances = portfolio?.balances ?? [];
  const totalValueUSD = portfolio?.totalValueUSD ?? 0;
  const totalPnlUSD = portfolio?.totalPnlUSD ?? 0;
  const totalPnlPercent = portfolio?.totalPnlPercent ?? 0;
  const openOrdersCount = portfolio?.openOrdersCount ?? 0;
  const openPositionsCount = portfolio?.openPositionsCount ?? 0;

  return (
    <>
      <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
      <WithdrawModal isOpen={withdrawOpen} onClose={() => setWithdrawOpen(false)} defaultAsset={withdrawAsset} />

      <div className="flex-1 p-6 lg:p-10 max-w-7xl mx-auto w-full">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Portfolio Overview</h1>
            {network && (
              <p className="text-xs text-muted-foreground mb-2 capitalize">
                {provider ?? network} · {network.toUpperCase()} network
              </p>
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
              onClick={() => refetch()}
              className="p-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              title="Refresh portfolio"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setDepositOpen(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground hover:opacity-90 px-5 py-2.5 rounded-xl transition-all font-semibold text-sm shadow-lg shadow-primary/20"
            >
              <ArrowDownToLine className="w-4 h-4" /> Deposit
            </button>
            <button
              onClick={() => { setWithdrawAsset("USDT"); setWithdrawOpen(true); }}
              className="flex items-center gap-2 bg-secondary hover:bg-white/10 px-5 py-2.5 rounded-xl transition-colors font-semibold text-sm border border-border"
            >
              <ArrowUpFromLine className="w-4 h-4" /> Withdraw
            </button>
          </div>
        </div>

        {/* Deposit quick CTA banner */}
        <div
          onClick={() => setDepositOpen(true)}
          className="mb-6 p-4 rounded-2xl border border-primary/20 bg-primary/5 flex items-center gap-4 cursor-pointer hover:border-primary/40 hover:bg-primary/8 transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors">
            <ArrowDownToLine className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Deposit Funds</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap to view your deposit QR code and wallet address — supports ETH, BNB, MATIC, BSV, and all EVM L1/L2/L3 networks
            </p>
          </div>
          <span className="text-primary text-sm font-medium shrink-0">View QR →</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {/* Balance card */}
          <div className="lg:col-span-2 bg-gradient-to-br from-card to-secondary p-8 rounded-3xl border border-border shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 text-muted-foreground mb-2">
                <span className="font-medium">Estimated Balance</span>
                <button onClick={() => setHideBalances(!hideBalances)} className="hover:text-foreground transition-colors">
                  {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-end gap-4 mb-6">
                {isLoading ? (
                  <div className="h-14 w-52 bg-muted/40 rounded-xl animate-pulse" />
                ) : (
                  <span className="text-5xl font-bold font-mono tracking-tight text-foreground">
                    {hideBalances ? "••••••" : `$${formatPrice(totalValueUSD)}`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-background/50 backdrop-blur px-4 py-2 rounded-xl border border-white/5">
                  <div className="text-xs text-muted-foreground mb-1">Today's PnL</div>
                  {isLoading ? (
                    <div className="h-5 w-32 bg-muted/40 rounded animate-pulse" />
                  ) : (
                    <div className={cn("font-mono font-bold", totalPnlUSD >= 0 ? "text-green-400" : "text-red-400")}>
                      {hideBalances ? "•••" : `${totalPnlUSD >= 0 ? "+" : ""}$${formatPrice(Math.abs(totalPnlUSD))} (${formatPercent(totalPnlPercent)})`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats card */}
          <div className="bg-card p-6 rounded-3xl border border-border shadow-xl flex flex-col justify-center gap-4">
            <div className="flex justify-between items-center p-4 bg-secondary/50 rounded-2xl">
              <span className="text-muted-foreground font-medium">Open Spot Orders</span>
              {isLoading
                ? <div className="h-8 w-8 bg-muted/40 rounded animate-pulse" />
                : <span className="text-2xl font-bold font-mono text-foreground">{openOrdersCount}</span>}
            </div>
            <div className="flex justify-between items-center p-4 bg-secondary/50 rounded-2xl">
              <span className="text-muted-foreground font-medium">Futures Positions</span>
              {isLoading
                ? <div className="h-8 w-8 bg-muted/40 rounded animate-pulse" />
                : <span className="text-2xl font-bold font-mono text-foreground">{openPositionsCount}</span>}
            </div>
            <button onClick={() => setDepositOpen(true)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors">
              <ArrowDownToLine className="w-4 h-4" /> Deposit
            </button>
          </div>
        </div>

        {/* Asset balances table */}
        <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
          <div className="p-6 border-b border-border bg-secondary/20 flex items-center justify-between">
            <h3 className="text-lg font-bold">Asset Balances</h3>
            <span className="text-xs text-muted-foreground">Live prices · refreshes every 30s</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-sm">
                  <th className="p-4 font-medium">Asset</th>
                  <th className="p-4 font-medium text-right">Price</th>
                  <th className="p-4 font-medium text-right">24h</th>
                  <th className="p-4 font-medium text-right">Total</th>
                  <th className="p-4 font-medium text-right">Available</th>
                  <th className="p-4 font-medium text-right">In Order</th>
                  <th className="p-4 font-medium text-right">Value (USD)</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="p-4">
                            <div className="h-4 bg-muted/40 rounded animate-pulse w-full" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : balances.map((bal) => (
                      <tr key={bal.asset} className="hover:bg-white/5 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">
                              {bal.asset[0]}
                            </div>
                            <span className="font-bold text-foreground">{bal.asset}</span>
                          </div>
                        </td>
                        <td className="p-4 text-right font-mono text-sm">
                          {bal.asset === "USDT" ? "$1.00" : `$${formatPrice(bal.price)}`}
                        </td>
                        <td className={`p-4 text-right text-sm font-semibold ${bal.change24hPercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {bal.change24hPercent >= 0 ? "+" : ""}{bal.change24hPercent.toFixed(2)}%
                        </td>
                        <td className="p-4 text-right font-mono">
                          {hideBalances ? "•••" : bal.total.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </td>
                        <td className="p-4 text-right font-mono">
                          {hideBalances ? "•••" : bal.free.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </td>
                        <td className="p-4 text-right font-mono text-muted-foreground">
                          {hideBalances ? "•••" : bal.locked.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                        </td>
                        <td className="p-4 text-right font-mono font-medium">
                          {hideBalances ? "•••" : `$${formatPrice(bal.valueUSD)}`}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setDepositOpen(true)}
                              className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
                              Deposit
                            </button>
                            <button
                              onClick={() => { setWithdrawAsset(bal.asset); setWithdrawOpen(true); }}
                              className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors">
                              Withdraw
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
