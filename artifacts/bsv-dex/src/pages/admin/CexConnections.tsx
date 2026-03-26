import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Eye, EyeOff, X, CheckCircle2, AlertCircle, Clock,
  Activity, RefreshCw, ToggleLeft, ToggleRight, Link2, Info,
  TrendingUp, ArrowLeftRight, Shield, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── API helpers ────────────────────────────────────────────────────────────
const api = {
  list:   () => fetch(`${BASE}/api/admin/cex-accounts`).then(r => r.json()),
  add:    (d: any) => fetch(`${BASE}/api/admin/cex-accounts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
  update: (id: number, d: any) => fetch(`${BASE}/api/admin/cex-accounts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
  remove: (id: number) => fetch(`${BASE}/api/admin/cex-accounts/${id}`, { method: "DELETE" }).then(r => r.json()),
  test:   (id: number) => fetch(`${BASE}/api/admin/cex-accounts/${id}/test`, { method: "POST" }).then(r => r.json()),
  quote:  (symbol: string) => fetch(`${BASE}/api/admin/cex-accounts/quote?symbol=${symbol}`).then(r => r.json()),
};

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { icon: any; cls: string; label: string }> = {
    active:   { icon: CheckCircle2, cls: "text-green-400 bg-green-400/10 border-green-400/25", label: "Active" },
    error:    { icon: AlertCircle,  cls: "text-red-400 bg-red-400/10 border-red-400/25",       label: "Error" },
    untested: { icon: Clock,        cls: "text-yellow-400 bg-yellow-400/10 border-yellow-400/25", label: "Untested" },
    disabled: { icon: ToggleLeft,   cls: "text-muted-foreground bg-muted/10 border-border",    label: "Disabled" },
  };
  const c = cfg[status] ?? cfg.untested;
  const Icon = c.icon;
  return (
    <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", c.cls)}>
      <Icon size={10} /> {c.label}
    </span>
  );
}

// ── Exchange logo pill ─────────────────────────────────────────────────────
function ExchangeLogo({ exchange, meta, size = "md" }: { exchange: string; meta: any; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "w-12 h-12 text-lg" : size === "sm" ? "w-6 h-6 text-[10px]" : "w-9 h-9 text-sm";
  return (
    <div className={cn("rounded-xl flex items-center justify-center font-black shrink-0", sz)}
      style={{ backgroundColor: (meta?.color ?? "#888") + "22", color: meta?.color ?? "#888", border: `1px solid ${meta?.color ?? "#888"}44` }}>
      {meta?.logo ?? exchange[0].toUpperCase()}
    </div>
  );
}

// ── Add Account Modal ──────────────────────────────────────────────────────
function AddAccountModal({ exchanges, onClose, onSave }: {
  exchanges: Record<string, any>;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [step, setStep]    = useState<"pick" | "form">("pick");
  const [exch, setExch]    = useState("");
  const [form, setForm]    = useState({ label: "", apiKey: "", apiSecret: "", passphrase: "" });
  const [showSec, setShowSec] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const meta = exchanges[exch] as any;

  const handleSubmit = () => {
    if (!form.label || !form.apiKey || !form.apiSecret) return;
    onSave({ exchange: exch, ...form });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            {step === "form" && exch && (
              <ExchangeLogo exchange={exch} meta={meta} size="sm" />
            )}
            <div>
              <h3 className="font-bold text-base">
                {step === "pick" ? "Connect Exchange" : `Connect ${meta?.name ?? exch}`}
              </h3>
              {step === "form" && (
                <p className="text-xs text-muted-foreground">Enter your API credentials</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {step === "pick" ? (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(exchanges).map(([key, m]: [string, any]) => (
                <button key={key} onClick={() => { setExch(key); setForm(f => ({ ...f, label: m.name })); setStep("form"); }}
                  className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/40 bg-secondary/30 hover:bg-secondary/60 transition-all text-left group">
                  <ExchangeLogo exchange={key} meta={m} />
                  <div>
                    <div className="font-semibold text-sm">{m.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{m.features.slice(0, 2).join(" · ")}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Security notice */}
              <div className="flex gap-3 p-3 bg-blue-400/8 border border-blue-400/20 rounded-xl">
                <Shield size={14} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Keys are encrypted with AES-256-GCM before storage and never returned in plaintext.
                  Use <strong>read-only</strong> keys if you only need quotes. Enable trading permissions
                  only if you want the hybrid router to execute orders.
                </p>
              </div>

              {/* Label */}
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Connection Label</label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  placeholder={`e.g. ${meta?.name} Main Account`} />
              </div>

              {/* API Key */}
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">API Key</label>
                <input value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary"
                  placeholder="Paste your API key here" />
              </div>

              {/* API Secret */}
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">API Secret</label>
                <div className="relative">
                  <input type={showSec ? "text" : "password"} value={form.apiSecret}
                    onChange={e => setForm(f => ({ ...f, apiSecret: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-primary"
                    placeholder="Paste your API secret here" />
                  <button onClick={() => setShowSec(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showSec ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Passphrase (OKX, KuCoin) */}
              {meta?.needsPassphrase && (
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">
                    Passphrase <span className="text-primary text-[10px]">required for {meta.name}</span>
                  </label>
                  <div className="relative">
                    <input type={showPass ? "text" : "password"} value={form.passphrase}
                      onChange={e => setForm(f => ({ ...f, passphrase: e.target.value }))}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-primary"
                      placeholder="API passphrase" />
                    <button onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Features this exchange enables */}
              <div className="p-3 bg-secondary/40 rounded-xl">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                  {meta?.name} enables
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(meta?.features ?? []).map((f: string) => (
                    <span key={f} className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">{f}</span>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep("pick")}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  ← Back
                </button>
                <button onClick={handleSubmit}
                  disabled={!form.label || !form.apiKey || !form.apiSecret || (meta?.needsPassphrase && !form.passphrase)}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity">
                  Connect {meta?.name}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Quote comparison panel ─────────────────────────────────────────────────
function QuotePanel() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [query,  setQuery]  = useState("BTCUSDT");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["cex-quote", query],
    queryFn:  () => api.quote(query),
    enabled:  true,
    staleTime: 15_000,
  });

  const pairs = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BSVUSDT", "BNBUSDT"];
  const quotes = data?.quotes ?? {};

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <ArrowLeftRight size={15} className="text-primary shrink-0" />
        <div>
          <h3 className="font-semibold text-sm">Live CEX Quote Comparison</h3>
          <p className="text-xs text-muted-foreground">Hybrid router picks the best price across venues</p>
        </div>
        <button onClick={() => refetch()} className="ml-auto p-1.5 text-muted-foreground hover:text-primary transition-colors rounded-lg hover:bg-primary/10">
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Quick symbol pills */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {pairs.map(p => (
          <button key={p} onClick={() => { setSymbol(p); setQuery(p); }}
            className={cn("px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
              query === p ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            {p.replace("USDT", "/USDT")}
          </button>
        ))}
        <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && setQuery(symbol)}
          className="px-3 py-1 rounded-full text-xs font-mono border border-border bg-secondary focus:outline-none focus:border-primary w-28"
          placeholder="SYMBOL" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map(i => <div key={i} className="h-20 bg-secondary rounded-xl animate-pulse" />)}
        </div>
      ) : Object.keys(quotes).length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No live quotes — add exchange connections above or check network
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(quotes).map(([ex, q]: [string, any]) => (
            <div key={ex} className="bg-secondary/40 rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold">{q.exchange}</span>
                <span className="text-[10px] text-muted-foreground">CEX</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bid</span>
                  <span className="font-mono font-semibold text-green-400">${q.bid?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ask</span>
                  <span className="font-mono font-semibold text-red-400">${q.ask?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">Spread</span>
                  <span className="font-mono">{q.spread}%</span>
                </div>
              </div>
            </div>
          ))}

          {/* AMM placeholder */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold">OrahDEX AMM</span>
              <span className="text-[10px] text-primary">On-chain</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pool</span>
                <span className="font-mono font-semibold">x·y=k</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Settle</span>
                <span className="font-mono font-semibold text-primary">BSV</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-primary/20">
                <span className="text-muted-foreground">Route</span>
                <span className="font-mono text-primary">AMM</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
        <Info size={10} /> Hybrid router automatically selects best price. CEX trades execute via connected account API keys.
      </p>
    </div>
  );
}

// ── Account card ───────────────────────────────────────────────────────────
function AccountCard({ account, meta, onTest, onToggle, onRemove, isTesting }: {
  account: any; meta: any; onTest: () => void;
  onToggle: () => void; onRemove: () => void; isTesting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("border rounded-2xl transition-all", account.enabled ? "border-border bg-card" : "border-border/40 bg-card/50 opacity-60")}>
      {/* Main row */}
      <div className="flex items-center gap-4 p-4">
        <ExchangeLogo exchange={account.exchange} meta={meta} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{account.label}</span>
            <StatusBadge status={account.enabled ? account.status : "disabled"} />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <code className="text-[11px] font-mono text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded">
              {account.apiKeyMasked}
            </code>
            {account.hasPassphrase && (
              <span className="text-[10px] text-muted-foreground">+ passphrase</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Test */}
          <button onClick={onTest} disabled={isTesting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 transition-all disabled:opacity-50">
            {isTesting ? <RefreshCw size={11} className="animate-spin" /> : <Activity size={11} />}
            {isTesting ? "Testing…" : "Test"}
          </button>
          {/* Toggle */}
          <button onClick={onToggle}
            className={cn("p-2 rounded-xl transition-colors", account.enabled ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-white/5")}>
            {account.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          </button>
          {/* Expand */}
          <button onClick={() => setExpanded(e => !e)}
            className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/5 transition-colors text-xs">
            {expanded ? "▲" : "▼"}
          </button>
          {/* Remove */}
          <button onClick={onRemove}
            className="p-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
          {/* Permissions */}
          {account.permissions && (
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Permissions</p>
              <div className="flex gap-2">
                {Object.entries(account.permissions).map(([perm, enabled]: [string, any]) => (
                  <span key={perm} className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold border capitalize",
                    enabled ? "bg-green-400/10 text-green-400 border-green-400/25" : "bg-muted/10 text-muted-foreground border-border")}>
                    {enabled ? "✓" : "✗"} {perm}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Last test result */}
          {account.lastTestResult && (
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Last Test Result</p>
              <p className={cn("text-xs font-mono p-2 rounded-lg border",
                account.status === "active" ? "bg-green-400/8 border-green-400/20 text-green-400" : "bg-red-400/8 border-red-400/20 text-red-400")}>
                {account.lastTestResult}
              </p>
            </div>
          )}

          {/* Features / docs link */}
          {meta && (
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-1.5">
                {(meta.features ?? []).map((f: string) => (
                  <span key={f} className="text-[10px] px-2 py-0.5 bg-secondary/60 text-muted-foreground rounded-full">{f}</span>
                ))}
              </div>
              <a href={meta.docsUrl} target="_blank" rel="noreferrer"
                className="text-[11px] text-primary hover:underline flex items-center gap-1">
                API Docs ↗
              </a>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex gap-4 text-[10px] text-muted-foreground">
            <span>Added: {new Date(account.createdAt).toLocaleDateString()}</span>
            {account.lastTestedAt && <span>Last tested: {new Date(account.lastTestedAt).toLocaleString()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export function AdminCexConnections() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd]     = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["cex-accounts"], queryFn: api.list });

  const accounts:  any[]           = data?.accounts  ?? [];
  const exchanges: Record<string, any> = data?.exchanges ?? {};

  const addAccount = useMutation({
    mutationFn: api.add,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cex-accounts"] }); setShowAdd(false); },
  });

  const updateAccount = useMutation({
    mutationFn: ({ id, ...d }: any) => api.update(id, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cex-accounts"] }),
  });

  const removeAccount = useMutation({
    mutationFn: api.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cex-accounts"] }),
  });

  const testAccount = async (id: number) => {
    setTestingId(id);
    await api.test(id);
    await qc.invalidateQueries({ queryKey: ["cex-accounts"] });
    setTestingId(null);
  };

  const activeCount = accounts.filter(a => a.status === "active" && a.enabled).length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Link2 size={22} className="text-primary" />
            CEX Exchange Connections
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your CEX accounts to enable the hybrid router — automatically picks
            CEX orderbook vs AMM liquidity for best execution.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="shrink-0 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all">
          <Plus size={15} /> Connect Exchange
        </button>
      </div>

      {/* Stats row */}
      {(() => {
        const total    = accounts.length;
        const active   = accounts.filter(a => a.status === "active").length;
        const untested = accounts.filter(a => a.status === "untested").length;
        const errors   = accounts.filter(a => a.status === "error").length;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ["Connected Exchanges", total.toString(), "text-foreground", Link2],
              ["Active & Verified",   active.toString(), "text-green-500", CheckCircle2],
              ["Awaiting Test",       untested.toString(), "text-yellow-400", Clock],
              ["Auth Errors",         errors.toString(), "text-red-400", AlertCircle],
            ].map(([l, v, cls, Icon]: any) => (
              <div key={l} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                <Icon size={18} className={cls} />
                <div>
                  <div className="text-xs text-muted-foreground">{l}</div>
                  <div className={cn("text-xl font-bold", cls)}>{v}</div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Architecture callout */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={15} className="text-primary shrink-0" />
          <span className="font-semibold text-sm">Hybrid Router Architecture</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: TrendingUp, label: "1. Quote", text: "Router fetches orderbook from connected CEX accounts and simulates AMM x·y=k price simultaneously." },
            { icon: ArrowLeftRight, label: "2. Compare", text: "Best effective price is selected — factoring in fee, slippage, and gas cost across CEX, AMM, and bridge." },
            { icon: Zap, label: "3. Execute", text: "CEX trades fire via your API key. AMM trades go on-chain. BSV settlement records every trade." },
          ].map(({ icon: Icon, label, text }) => (
            <div key={label} className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Icon size={14} className="text-primary" />
              </div>
              <div>
                <div className="text-xs font-bold mb-0.5">{label}</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Accounts list */}
      <div className="bg-card border border-border rounded-2xl">
        <div className="flex items-center gap-3 p-5 border-b border-border">
          <Link2 size={15} className="text-primary" />
          <span className="font-semibold text-sm">Connected Accounts</span>
          {activeCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 bg-green-400/10 text-green-400 border border-green-400/25 rounded-full font-bold">
              {activeCount} live
            </span>
          )}
        </div>

        <div className="p-5 space-y-3">
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-20 bg-secondary rounded-2xl animate-pulse" />
            ))
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center">
                <Link2 size={28} className="text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-semibold text-sm">No exchanges connected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Connect a CEX account to enable hybrid routing and access deep CEX liquidity.
                </p>
              </div>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-sm font-semibold hover:bg-primary/20 transition-colors">
                <Plus size={14} /> Connect First Exchange
              </button>
            </div>
          ) : (
            accounts.map(account => (
              <AccountCard key={account.id}
                account={account}
                meta={exchanges[account.exchange]}
                isTesting={testingId === account.id}
                onTest={() => testAccount(account.id)}
                onToggle={() => updateAccount.mutate({ id: account.id, enabled: !account.enabled })}
                onRemove={() => removeAccount.mutate(account.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Live quote comparison */}
      <QuotePanel />

      {/* Add modal */}
      {showAdd && (
        <AddAccountModal
          exchanges={exchanges}
          onClose={() => setShowAdd(false)}
          onSave={data => addAccount.mutate(data)}
        />
      )}
    </div>
  );
}
