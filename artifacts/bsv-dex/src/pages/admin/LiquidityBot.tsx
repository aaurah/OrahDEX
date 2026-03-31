import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Settings, RefreshCw, Save, RotateCcw,
  CheckCircle, AlertTriangle, TrendingUp, Layers, Clock, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fetchConfig() {
  return fetch(`${BASE}/api/admin/liquidity/config`).then(r => r.json());
}
function saveConfig(body: any) {
  return fetch(`${BASE}/api/admin/liquidity/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(r => r.json());
}
function resetConfig() {
  return fetch(`${BASE}/api/admin/liquidity/reset`, { method: "POST" }).then(r => r.json());
}

function Field({
  label, type = "number", value, onChange, min, max, step, suffix, hint,
}: {
  label: string; type?: string; value: any; onChange: (v: any) => void;
  min?: number; max?: number; step?: number; suffix?: string; hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={value}
          min={min} max={max} step={step}
          onChange={e => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
          className="flex-1 bg-secondary/40 border border-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50 transition-colors"
        />
        {suffix && <span className="text-xs text-muted-foreground shrink-0">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export function AdminLiquidityBot() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ["admin-liquidity"],
    queryFn:  fetchConfig,
  });

  const [draft, setDraft] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  const current = draft ?? config ?? {};

  const set = (key: string, val: any) => setDraft((d: any) => ({ ...(d ?? config ?? {}), [key]: val }));

  const saveMut = useMutation({
    mutationFn: saveConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-liquidity"] });
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const resetMut = useMutation({
    mutationFn: resetConfig,
    onSuccess: (data) => {
      qc.setQueryData(["admin-liquidity"], data.config);
      setDraft(null);
    },
  });

  const isDirty = draft !== null;

  const handleSave = () => saveMut.mutate(current);
  const handleReset = () => resetMut.mutate({});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            Liquidity Bot
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure the market-making and liquidity provision engine
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-1 rounded-lg">
              Unsaved changes
            </span>
          )}
          {saved && (
            <span className="text-xs text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-1 rounded-lg flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Saved
            </span>
          )}
          <button
            onClick={handleReset}
            disabled={resetMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:border-orange-400/40 text-xs text-muted-foreground hover:text-orange-400 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={saveMut.isPending || !isDirty}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all",
              isDirty
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-white/5 text-muted-foreground cursor-not-allowed"
            )}
          >
            <Save className="w-3.5 h-3.5" />
            {saveMut.isPending ? "Saving…" : "Save Config"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Status toggle */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  current.enabled ? "bg-green-400/10 text-green-400" : "bg-muted/20 text-muted-foreground"
                )}>
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Market Making Engine</p>
                  <p className="text-xs text-muted-foreground">
                    {current.enabled ? "Actively providing liquidity" : "Currently paused"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => set("enabled", !current.enabled)}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-all border",
                  current.enabled
                    ? "bg-green-400/20 border-green-400/40"
                    : "bg-white/5 border-border"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full transition-transform",
                  current.enabled
                    ? "translate-x-5 bg-green-400"
                    : "translate-x-0.5 bg-muted-foreground"
                )} />
              </button>
            </div>
          </div>

          {/* Core settings */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Cycle Settings</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field
                label="Interval (seconds)" value={current.intervalSeconds ?? 120}
                onChange={v => set("intervalSeconds", v)}
                min={30} max={3600} step={30} suffix="s"
                hint="How often the bot refreshes orders"
              />
              <Field
                label="Batch Size" value={current.batchSize ?? 40}
                onChange={v => set("batchSize", v)}
                min={1} max={200} step={1}
                hint="Orders placed per cycle"
              />
              <Field
                label="Levels Per Side" value={current.levelsPerSide ?? 6}
                onChange={v => set("levelsPerSide", v)}
                min={1} max={20} step={1}
                hint="Bid/ask levels in orderbook"
              />
            </div>
          </div>

          {/* Pricing settings */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Pricing & Risk</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field
                label="Spread (bps)" value={current.spreadBps ?? 15}
                onChange={v => set("spreadBps", v)}
                min={1} max={500} step={1} suffix="bps"
                hint="1 bps = 0.01%"
              />
              <Field
                label="Max Position (USD)" value={current.maxPositionUsd ?? 10000}
                onChange={v => set("maxPositionUsd", v)}
                min={100} max={10000000} step={100} suffix="$"
                hint="Per-symbol position cap"
              />
              <Field
                label="Min Price Impact" value={current.minPriceImpact ?? 0.001}
                onChange={v => set("minPriceImpact", v)}
                min={0} max={0.1} step={0.0001}
                hint="Skip if impact below this"
              />
            </div>
          </div>

          {/* Symbol list */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Active Symbols</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {(current.symbols ?? []).map((sym: string) => (
                <span
                  key={sym}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-mono font-semibold border border-primary/20"
                >
                  <Zap className="w-2.5 h-2.5" />
                  {sym}
                  <button
                    onClick={() => set("symbols", current.symbols.filter((s: string) => s !== sym))}
                    className="ml-0.5 text-primary/60 hover:text-red-400 transition-colors"
                  >×</button>
                </span>
              ))}
            </div>
            <AddSymbolInput
              onAdd={sym => set("symbols", [...(current.symbols ?? []), sym])}
            />
          </div>

          {/* Stats */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-muted-foreground">Runtime Stats</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Total Cycles</p>
                <p className="font-mono font-bold">{(current.totalCycles ?? 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Cycle Duration</p>
                <p className="font-mono font-bold">{current.lastCycleMs ? `${current.lastCycleMs} ms` : "—"}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AddSymbolInput({ onAdd }: { onAdd: (s: string) => void }) {
  const [val, setVal] = useState("");
  const submit = () => {
    const trimmed = val.trim().toUpperCase();
    if (trimmed) { onAdd(trimmed); setVal(""); }
  };
  return (
    <div className="flex gap-2">
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="e.g. BSV/USDT"
        className="flex-1 bg-secondary/40 border border-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50 transition-colors"
      />
      <button
        onClick={submit}
        className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold border border-primary/20 hover:bg-primary/20 transition-all"
      >
        + Add
      </button>
    </div>
  );
}
