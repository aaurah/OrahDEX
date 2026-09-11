import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Key, Plus, Eye, EyeOff, Copy, Check, Trash2, X,
  ArrowLeft, Code2, Globe, Lock, ShieldCheck, Zap,
  BookOpen, AlertTriangle, RefreshCw,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PERMISSIONS = [
  { id: "read",    label: "Read Only",   desc: "Market data, prices, order book", color: "#22c55e",  icon: Globe },
  { id: "trading", label: "Trading",     desc: "Place & cancel orders",           color: "#6366f1",  icon: Zap },
  { id: "full",    label: "Full Access", desc: "All permissions including account",color: "#f59e0b", icon: ShieldCheck },
] as const;
type Permission = "read" | "trading" | "full";

function maskKey(key: string) {
  return key.slice(0, 14) + "••••••••••••" + key.slice(-4);
}

export function UserApiKeys() {
  const { address } = useWalletStore();
  const { open: openWallet } = useWalletModalStore();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm]         = useState({ name: "", permission: "read" as Permission, rateLimit: "100" });
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [copied, setCopied]     = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["user-api-keys", address],
    queryFn: () => fetch(`${BASE}/api/user/api-keys?wallet=${address}`).then(r => r.json()),
    enabled: !!address,
  });

  const addKey = useMutation({
    mutationFn: (data: any) =>
      fetch(`${BASE}/api/user/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, wallet: address }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-api-keys", address] });
      setShowAdd(false);
      setForm({ name: "", permission: "read", rateLimit: "100" });
    },
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) =>
      fetch(`${BASE}/api/user/api-keys/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-api-keys", address] }),
  });

  const toggleVisible = (id: string) =>
    setVisibleKeys(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const copyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const apiBase = `${window.location.origin}${BASE}/api`;
  const activeKeys = (keys as any[]).filter(k => k.status === "active");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/settings")} className="p-2 rounded-xl hover:bg-secondary/50 text-muted-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-bold">API Access</h1>
          <p className="text-[11px] text-muted-foreground">Manage personal API keys for bots & integrations</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">

        {/* Not connected */}
        {!address && (
          <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <p className="font-semibold">Connect your wallet</p>
            <p className="text-sm text-muted-foreground">API keys are linked to your wallet address. Connect first to generate keys.</p>
            <button onClick={() => openWallet()}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm">
              Connect Wallet
            </button>
          </div>
        )}

        {/* API base URL info card */}
        {address && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">API Endpoint</p>
            </div>
            <div className="bg-secondary/60 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
              <code className="text-xs font-mono text-green-400 truncate">{apiBase}</code>
              <button onClick={() => { navigator.clipboard.writeText(apiBase); setCopied("base"); setTimeout(() => setCopied(null), 2000); }}
                className="text-muted-foreground hover:text-primary shrink-0">
                {copied === "base" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Markets",   path: "/markets" },
                { label: "Ticker",    path: "/markets/:symbol/ticker" },
                { label: "Order Book",path: "/markets/:symbol/orderbook" },
              ].map(e => (
                <div key={e.label} className="bg-secondary/40 rounded-xl p-2">
                  <p className="text-[10px] text-muted-foreground">{e.label}</p>
                  <code className="text-[9px] font-mono text-primary block mt-0.5 truncate">{e.path}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Keys section */}
        {address && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Your Keys ({activeKeys.length} active)
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-xl text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> New Key
              </button>
            </div>

            {isLoading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-24 bg-card border border-border rounded-2xl animate-pulse" />
              ))
            ) : (keys as any[]).length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-2">
                <Key className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium">No API keys yet</p>
                <p className="text-xs text-muted-foreground">Generate a key to connect trading bots or integrations.</p>
              </div>
            ) : (
              (keys as any[]).map((k: any) => {
                const perm = PERMISSIONS.find(p => p.id === k.permission) ?? PERMISSIONS[0];
                return (
                  <div key={k.id} className={cn(
                    "bg-card border border-border rounded-2xl p-4 space-y-3 transition-all",
                    k.status === "revoked" && "opacity-50"
                  )}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{k.name}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                            style={{ backgroundColor: perm.color + "20", color: perm.color }}>
                            {perm.label}
                          </span>
                          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase",
                            k.status === "active" ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400"
                          )}>{k.status}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{k.rateLimit} req/min · Created {k.createdAt}</p>
                      </div>
                      {k.status === "active" && (
                        <button onClick={() => { if (confirm("Revoke this API key?")) revokeKey.mutate(k.id); }}
                          className="p-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-colors shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3 py-2">
                      <code className="text-xs font-mono text-muted-foreground flex-1 truncate">
                        {visibleKeys.has(k.id) ? k.key : maskKey(k.key)}
                      </code>
                      <button onClick={() => toggleVisible(k.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                        {visibleKeys.has(k.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => copyKey(k.key, k.id)} className="text-muted-foreground hover:text-primary shrink-0">
                        {copied === k.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* How to use */}
        {address && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">How to use</p>
            </div>
            <p className="text-xs text-muted-foreground">Pass your API key in the request header:</p>
            <div className="bg-secondary/60 rounded-xl px-3 py-2.5">
              <code className="text-[11px] font-mono text-green-400">X-API-Key: your_key_here</code>
            </div>
            <p className="text-xs text-muted-foreground">Or as a query parameter:</p>
            <div className="bg-secondary/60 rounded-xl px-3 py-2.5">
              <code className="text-[11px] font-mono text-green-400">/api/markets?apiKey=your_key_here</code>
            </div>
          </div>
        )}

        {/* Security notice */}
        {address && (
          <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Keep your API keys secret. Never share them publicly or commit them to source code. Revoke any key you believe has been compromised immediately.
            </p>
          </div>
        )}
      </div>

      {/* Generate Key Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-base">New API Key</h3>
              <button onClick={() => setShowAdd(false)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Key Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="My Trading Bot"
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                />
              </div>

              {/* Permission */}
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Permission Level</label>
                <div className="space-y-2">
                  {PERMISSIONS.map(p => (
                    <button key={p.id} onClick={() => setForm(f => ({ ...f, permission: p.id }))}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                        form.permission === p.id ? "border-primary/60 bg-primary/5" : "border-border hover:border-border/80 hover:bg-secondary/30"
                      )}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: p.color + "20" }}>
                        <p.icon className="w-4 h-4" style={{ color: p.color }} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{p.label}</p>
                        <p className="text-[11px] text-muted-foreground">{p.desc}</p>
                      </div>
                      {form.permission === p.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rate limit */}
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Rate Limit</label>
                <div className="flex gap-2">
                  {["60", "100", "300", "500"].map(v => (
                    <button key={v} onClick={() => setForm(f => ({ ...f, rateLimit: v }))}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-sm font-semibold border transition-all",
                        form.rateLimit === v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                      )}>
                      {v}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Requests per minute</p>
              </div>

              <button
                onClick={() => addKey.mutate(form)}
                disabled={!form.name || addKey.isPending}
                className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addKey.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</> : <><Key className="w-4 h-4" /> Generate Key</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserApiKeys;
