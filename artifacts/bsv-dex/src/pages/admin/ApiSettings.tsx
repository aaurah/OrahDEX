import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Eye, EyeOff, Copy, Check, X, Key, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchKeys = () => fetch(`${BASE}/api/admin/api-keys`).then(r => r.json());

const API_SETTINGS = [
  { label: "Global Rate Limit", value: "1000 req/min", editable: true },
  { label: "WebSocket Connections", value: "500 concurrent", editable: true },
  { label: "Order Book Depth", value: "50 levels", editable: true },
  { label: "Candle History Limit", value: "1000 bars", editable: true },
  { label: "API Version", value: "v1.4.2", editable: false },
  { label: "CORS Origins", value: "*, app.orahdex.io", editable: true },
];

export function AdminApiSettings() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", type: "private", rateLimit: "500" });
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({ queryKey: ["admin-api-keys"], queryFn: fetchKeys });

  const addKey = useMutation({
    mutationFn: (data: any) =>
      fetch(`${BASE}/api/admin/api-keys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-api-keys"] }); setShowAdd(false); setForm({ name: "", type: "private", rateLimit: "500" }); },
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) =>
      fetch(`${BASE}/api/admin/api-keys/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-api-keys"] }),
  });

  const toggleVisible = (id: string) =>
    setVisibleKeys(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const copyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const maskKey = (key: string) => key.slice(0, 12) + "••••••••••••" + key.slice(-4);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">API Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Manage API keys, rate limits, and endpoint configuration</p>
      </div>

      {/* Global Settings */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Global Configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {API_SETTINGS.map(s => (
            <div key={s.label} className="flex items-center justify-between p-3 bg-secondary/40 rounded-xl border border-border">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                <p className="text-sm font-mono font-semibold mt-0.5">{s.value}</p>
              </div>
              {s.editable && (
                <button className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors text-xs font-medium">Edit</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-card border border-border rounded-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-semibold flex items-center gap-2"><Key className="w-4 h-4 text-primary" /> API Keys</h3>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
          >
            <Plus className="w-4 h-4" /> Generate Key
          </button>
        </div>

        {/* Add Key Modal */}
        {showAdd && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-lg">Generate API Key</h3>
                <button onClick={() => setShowAdd(false)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Key Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                    placeholder="My Bot Integration" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Type</label>
                  <div className="flex gap-2">
                    {["public", "private"].map(t => (
                      <button key={t} onClick={() => setForm(f => ({...f, type: t}))}
                        className={cn("flex-1 py-2 rounded-xl text-sm font-semibold border transition-all capitalize",
                          form.type === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                        )}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">Rate Limit (req/min)</label>
                  <input type="number" value={form.rateLimit} onChange={e => setForm(f => ({...f, rateLimit: e.target.value}))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                    min="10" max="10000" />
                </div>
                <button onClick={() => addKey.mutate(form)} disabled={!form.name || addKey.isPending}
                  className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
                  {addKey.isPending ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="p-5 space-y-3">
          {isLoading ? (
            Array.from({length: 3}).map((_, i) => <div key={i} className="h-16 bg-secondary rounded-xl animate-pulse" />)
          ) : keys.map((k: any) => (
            <div key={k.id} className={cn(
              "p-4 rounded-xl border transition-all",
              k.status === "revoked" ? "border-border opacity-50" : "border-border hover:border-primary/30"
            )}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{k.name}</span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                      k.type === "public" ? "bg-blue-400/10 text-blue-400" : "bg-violet-400/10 text-violet-400"
                    )}>{k.type}</span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                      k.status === "active" ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400"
                    )}>{k.status}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded">
                      {visibleKeys.has(k.id) ? k.key : maskKey(k.key)}
                    </code>
                    <button onClick={() => toggleVisible(k.id)} className="text-muted-foreground hover:text-foreground">
                      {visibleKeys.has(k.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => copyKey(k.key, k.id)} className="text-muted-foreground hover:text-primary">
                      {copiedKey === k.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{k.calls24h.toLocaleString()} calls / 24h</span>
                    <span>Limit: {k.rateLimit} req/min</span>
                    <span>Created: {k.createdAt}</span>
                  </div>
                </div>
                {k.status === "active" && (
                  <button onClick={() => revokeKey.mutate(k.id)} className="p-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-colors shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
