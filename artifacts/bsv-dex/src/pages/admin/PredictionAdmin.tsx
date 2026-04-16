import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp, TrendingDown, RefreshCw, Clock, DollarSign,
  Activity, Users, BarChart2, ChevronDown, Play, Pause,
  AlertCircle, CheckCircle2, Loader2, Eye, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Round {
  id: number;
  symbol: string;
  status: "live" | "locked" | "closed";
  lockPrice: number | null;
  closePrice: number | null;
  bullPool: number;
  bearPool: number;
  totalPool: number;
  startTime: number;
  lockTime: number;
  closeTime: number;
  result?: "bull" | "bear" | null;
}

interface Bet {
  wallet: string;
  roundId: number;
  symbol: string;
  direction: "up" | "down";
  amount: number;
  leverage: number;
  effectiveStake: number;
  timestamp: number;
  payout?: number;
}

interface PredictionStats {
  totalRounds: number;
  activeRounds: number;
  totalBets: number;
  totalVolume: number;
  totalPayout: number;
  uniqueWallets: number;
}

const SYMBOLS = ["BSV/USDT", "BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT"];

function StatCard({ label, value, icon: Icon, sub, color = "text-primary" }: {
  label: string; value: string; icon: any; sub?: string; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{label}</span>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
      <p className={cn("text-xl font-bold tabular-nums", color)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function RoundCard({ round }: { round: Round }) {
  const now = Date.now();
  const remaining = round.status === "live"
    ? Math.max(0, round.lockTime - now)
    : round.status === "locked"
      ? Math.max(0, round.closeTime - now)
      : 0;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const bullPct = round.totalPool > 0 ? (round.bullPool / round.totalPool * 100) : 50;
  const bearPct = 100 - bullPct;
  const bullMulti = round.bullPool > 0 ? (round.totalPool / round.bullPool) : 0;
  const bearMulti = round.bearPool > 0 ? (round.totalPool / round.bearPool) : 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">{round.symbol}</span>
          <span className="text-xs font-mono text-muted-foreground">#{round.id}</span>
        </div>
        <span className={cn(
          "text-[9px] font-black uppercase px-2 py-0.5 rounded-full border",
          round.status === "live" ? "text-green-400 bg-green-400/10 border-green-400/20" :
          round.status === "locked" ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" :
          "text-muted-foreground bg-muted/10 border-border"
        )}>
          {round.status}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-green-400 font-medium">Bull {bullPct.toFixed(0)}%</span>
          <span className="text-red-400 font-medium">Bear {bearPct.toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden flex">
          <div className="bg-green-500 transition-all" style={{ width: `${bullPct}%` }} />
          <div className="bg-red-500 transition-all" style={{ width: `${bearPct}%` }} />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>${Number(round.bullPool ?? 0).toFixed(2)} ({Number(bullMulti ?? 0).toFixed(2)}x)</span>
          <span>${Number(round.bearPool ?? 0).toFixed(2)} ({Number(bearMulti ?? 0).toFixed(2)}x)</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">Total Pool</p>
          <p className="text-xs font-bold text-foreground">${Number(round.totalPool ?? 0).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Lock Price</p>
          <p className="text-xs font-bold text-foreground">{round.lockPrice ? `$${round.lockPrice.toFixed(2)}` : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">
            {round.status === "closed" ? "Result" : "Time Left"}
          </p>
          <p className={cn("text-xs font-bold", round.result === "bull" ? "text-green-400" : round.result === "bear" ? "text-red-400" : "text-foreground")}>
            {round.status === "closed"
              ? (round.result === "bull" ? "↑ BULL" : "↓ BEAR")
              : `${mins}:${secs.toString().padStart(2, "0")}`
            }
          </p>
        </div>
      </div>
    </div>
  );
}

function BetRow({ bet }: { bet: Bet }) {
  return (
    <tr className="border-b border-border/30 hover:bg-white/2">
      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">
        {bet.wallet.slice(0, 8)}…{bet.wallet.slice(-4)}
      </td>
      <td className="px-3 py-2.5 text-xs text-foreground">{bet.symbol}</td>
      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">#{bet.roundId}</td>
      <td className="px-3 py-2.5">
        <span className={cn(
          "text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md border",
          bet.direction === "up"
            ? "text-green-400 bg-green-400/10 border-green-400/20"
            : "text-red-400 bg-red-400/10 border-red-400/20"
        )}>
          {bet.direction}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs font-mono text-foreground">${Number(bet.amount ?? 0).toFixed(2)}</td>
      <td className="px-3 py-2.5 text-xs font-mono text-foreground">{bet.leverage}x</td>
      <td className="px-3 py-2.5 text-xs font-mono text-foreground">${Number(bet.effectiveStake ?? 0).toFixed(2)}</td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">
        {new Date(bet.timestamp).toLocaleTimeString()}
      </td>
    </tr>
  );
}

export default function PredictionAdmin() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [stats, setStats] = useState<PredictionStats>({
    totalRounds: 0, activeRounds: 0, totalBets: 0,
    totalVolume: 0, totalPayout: 0, uniqueWallets: 0,
  });
  const [selectedSymbol, setSelectedSymbol] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    try {
      const allRounds: Round[] = [];
      const allBets: Bet[] = [];
      const walletSet = new Set<string>();

      for (const sym of SYMBOLS) {
        try {
          const res = await fetch(`${BASE}/api/prediction/rounds/${encodeURIComponent(sym)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.rounds) {
              allRounds.push(...data.rounds.map((r: any) => ({ ...r, symbol: sym })));
            }
          }
        } catch {}
      }

      let totalVolume = 0;
      let totalPayout = 0;

      for (const round of allRounds) {
        totalVolume += Number(round.totalPool ?? 0);
      }

      const uniqueWallets = walletSet.size;

      setRounds(allRounds);
      setBets(allBets);
      setStats({
        totalRounds: allRounds.length,
        activeRounds: allRounds.filter(r => r.status === "live" || r.status === "locked").length,
        totalBets: allBets.length,
        totalVolume,
        totalPayout,
        uniqueWallets,
      });
      setLastRefresh(new Date());
      setError(null);
    } catch (err: any) {
      console.error("Failed to fetch prediction data:", err);
      setError(err?.message ?? "Failed to load prediction data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const filteredRounds = rounds.filter(r => {
    if (selectedSymbol !== "ALL" && r.symbol !== selectedSymbol) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error && rounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-10 h-10 text-red-400 opacity-60" />
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground mb-1">Failed to load prediction data</p>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary rounded-xl text-xs font-semibold hover:bg-primary/20 transition-all mx-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Prediction Trading</h2>
          <p className="text-xs text-muted-foreground">Monitor rounds, bets, and pool activity across all prediction pairs</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(a => !a)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
              autoRefresh
                ? "bg-green-500/10 border-green-500/20 text-green-400"
                : "bg-muted/30 border-border text-muted-foreground"
            )}
          >
            {autoRefresh ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            Auto-refresh {autoRefresh ? "ON" : "OFF"}
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <Activity className="w-3 h-3" />
        Last updated: {lastRefresh.toLocaleTimeString()}
        {autoRefresh && <span className="text-green-400 animate-pulse">● Live</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Rounds" value={stats.totalRounds.toString()} icon={BarChart2} />
        <StatCard label="Active Rounds" value={stats.activeRounds.toString()} icon={Activity} color="text-green-400" />
        <StatCard label="Total Bets" value={stats.totalBets.toString()} icon={Users} />
        <StatCard label="Total Volume" value={`$${Number(stats.totalVolume ?? 0).toFixed(2)}`} icon={DollarSign} color="text-amber-400" />
        <StatCard label="Total Payout" value={`$${Number(stats.totalPayout ?? 0).toFixed(2)}`} icon={TrendingUp} color="text-green-400" />
        <StatCard label="Unique Wallets" value={stats.uniqueWallets.toString()} icon={Users} color="text-violet-400" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Filter:</span>
        <div className="flex items-center gap-1">
          {["ALL", ...SYMBOLS].map(sym => (
            <button
              key={sym}
              onClick={() => setSelectedSymbol(sym)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all",
                selectedSymbol === sym
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-muted/20 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {sym === "ALL" ? "All Pairs" : sym.split("/")[0]}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-border mx-1" />
        <div className="flex items-center gap-1">
          {["all", "live", "locked", "closed"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all capitalize",
                statusFilter === s
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-muted/20 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "all" ? "All Status" : s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          Rounds ({filteredRounds.length})
        </h3>
        {filteredRounds.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No rounds found for the current filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredRounds.map(round => (
              <RoundCard key={`${round.symbol}-${round.id}`} round={round} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Recent Bets ({bets.length})
        </h3>
        {bets.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No bets recorded yet. Bets will appear here as users place predictions.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Wallet</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Pair</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Round</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Direction</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Amount</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Leverage</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Eff. Stake</th>
                    <th className="px-3 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {bets.map((bet, i) => (
                    <BetRow key={i} bet={bet} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" />
          Configuration
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-background border border-border rounded-xl p-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Round Duration</p>
            <p className="text-sm font-bold text-foreground">5 minutes</p>
            <p className="text-[10px] text-muted-foreground">4m 30s live + 30s lock</p>
          </div>
          <div className="bg-background border border-border rounded-xl p-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Max Leverage</p>
            <p className="text-sm font-bold text-foreground">100x</p>
            <p className="text-[10px] text-muted-foreground">1x — 100x range</p>
          </div>
          <div className="bg-background border border-border rounded-xl p-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Min Bet</p>
            <p className="text-sm font-bold text-foreground">$1.00 USDT</p>
            <p className="text-[10px] text-muted-foreground">Minimum per prediction</p>
          </div>
          <div className="bg-background border border-border rounded-xl p-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Payout Model</p>
            <p className="text-sm font-bold text-foreground">Parimutuel</p>
            <p className="text-[10px] text-muted-foreground">Pool-based winner-takes-all</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {SYMBOLS.map(sym => (
            <div key={sym} className="bg-background border border-border rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-bold text-foreground">{sym.split("/")[0]}</span>
              </div>
              <span className="text-[9px] font-black text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-md border border-green-400/20">ACTIVE</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
