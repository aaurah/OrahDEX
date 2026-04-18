import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, TrendingUp, Clock, RotateCcw, Zap, Activity,
  CircleDollarSign, BarChart3, RefreshCw, ToggleLeft, ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/adminFetch";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ArbBotStatus {
  enabled:         boolean;
  totalProfitUSDT: number;
  totalTrades:     number;
  totalCycles:     number;
  lastRun:         string | null;
  startTime:       string | null;
  lastCycleProfit: number;
  lastOppsFound:   number;
}

function StatCard({
  icon: Icon, label, value, sub, accent = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-4 flex flex-col gap-2",
      accent ? "bg-primary/10 border-primary/25" : "bg-secondary/30 border-border",
    )}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={14} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold tabular-nums", accent && "text-primary")}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function AdminArbBot() {
  const qc = useQueryClient();
  const [resetConfirm, setResetConfirm] = useState(false);

  const { data: status, isLoading, isFetching } = useQuery<ArbBotStatus>({
    queryKey: ["admin-arb-bot"],
    queryFn:  () => adminFetch(`${BASE}/api/admin/arb-bot`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) =>
      adminFetch(`${BASE}/api/admin/arb-bot/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-arb-bot"] }),
  });

  const resetMut = useMutation({
    mutationFn: () =>
      adminFetch(`${BASE}/api/admin/arb-bot/reset-stats`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => {
      setResetConfirm(false);
      qc.invalidateQueries({ queryKey: ["admin-arb-bot"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center text-muted-foreground">
        Loading arb bot data…
      </div>
    );
  }

  const enabled         = status?.enabled ?? false;
  const totalProfit     = status?.totalProfitUSDT ?? 0;
  const totalTrades     = status?.totalTrades ?? 0;
  const totalCycles     = status?.totalCycles ?? 0;
  const lastCycleProfit = status?.lastCycleProfit ?? 0;
  const lastOppsFound   = status?.lastOppsFound ?? 0;
  const lastRun         = status?.lastRun ? new Date(status.lastRun).toLocaleString() : "Never";
  const startTime       = status?.startTime ? new Date(status.startTime).toLocaleDateString() : "—";
  const avgPerCycle     = totalCycles > 0 ? (totalProfit / totalCycles) : 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Bot size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Arbitrage Bot</h1>
            <p className="text-xs text-muted-foreground">Scans all markets every 60 s for triangular price discrepancies</p>
          </div>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["admin-arb-bot"] })}
          className="p-2 rounded-xl hover:bg-secondary/50 transition-colors"
        >
          <RefreshCw size={15} className={isFetching ? "animate-spin text-primary" : "text-muted-foreground"} />
        </button>
      </div>

      {/* Enable / Disable */}
      <div className={cn(
        "rounded-2xl border p-5 flex items-center justify-between gap-4",
        enabled ? "bg-green-500/10 border-green-500/25" : "bg-secondary/30 border-border",
      )}>
        <div className="flex items-center gap-3">
          <Activity size={18} className={enabled ? "text-green-400" : "text-muted-foreground"} />
          <div>
            <p className="font-semibold text-sm">{enabled ? "Bot is running" : "Bot is stopped"}</p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? `Running since ${startTime} · last cycle ${lastRun}`
                : "Enable to start scanning for arb opportunities automatically"}
            </p>
          </div>
        </div>
        <button
          onClick={() => toggleMut.mutate(!enabled)}
          disabled={toggleMut.isPending}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
            enabled
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
              : "bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30",
          )}
        >
          {enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          {toggleMut.isPending ? "Saving…" : enabled ? "Disable" : "Enable"}
        </button>
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How it works</p>
        <div className="grid grid-cols-1 gap-2 text-sm">
          {[
            { step: "1", text: "Every 60 seconds, scans ALL active trading pairs for price discrepancies" },
            { step: "2", text: "Finds triangular routes: e.g. USDT → ETH → BNB → USDT where the round-trip yields > 0.4%" },
            { step: "3", text: "Executes three fast fills — capturing the spread as pure profit" },
            { step: "4", text: "Net profit (after 3 × 0.1% trading fees) accumulates here as USDT" },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</span>
              <p className="text-muted-foreground text-xs leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={CircleDollarSign}
          label="Total Profit"
          value={`$${totalProfit.toFixed(2)}`}
          sub="accumulated USDT"
          accent
        />
        <StatCard
          icon={Zap}
          label="Last Cycle"
          value={`$${lastCycleProfit.toFixed(4)}`}
          sub={`${lastOppsFound} opps found`}
        />
        <StatCard
          icon={BarChart3}
          label="Total Trades"
          value={totalTrades.toLocaleString()}
          sub="arb legs executed"
        />
        <StatCard
          icon={TrendingUp}
          label="Avg / Cycle"
          value={`$${avgPerCycle.toFixed(4)}`}
          sub={`${totalCycles} cycles run`}
        />
      </div>

      {/* Last run info */}
      <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Activity</p>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Last run</span>
            <span className="font-mono text-xs">{lastRun}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Started tracking</span>
            <span className="font-mono text-xs">{startTime}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total cycles run</span>
            <span className="font-semibold">{totalCycles.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Reset stats */}
      <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Danger Zone</p>
        {resetConfirm ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-400">This will clear all profit stats. Are you sure?</p>
            <div className="flex gap-2">
              <button
                onClick={() => resetMut.mutate()}
                disabled={resetMut.isPending}
                className="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-semibold hover:bg-red-500/30 transition-colors"
              >
                {resetMut.isPending ? "Resetting…" : "Yes, reset"}
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                className="px-4 py-2 rounded-xl bg-secondary/50 text-muted-foreground text-sm hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setResetConfirm(true)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw size={14} />
            Reset profit stats to zero
          </button>
        )}
      </div>
    </div>
  );
}
