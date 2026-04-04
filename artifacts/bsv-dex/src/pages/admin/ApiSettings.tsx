import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Eye, EyeOff, Copy, Check, X, Key, Activity,
  Shield, Zap, Clock, Database, Radio, Settings2, Webhook,
  RotateCcw, Save, AlertTriangle, ChevronRight, RefreshCw,
  Lock, Globe, ServerCrash, Gauge, ToggleLeft, ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const fetchConfig  = () => fetch(`${BASE}/api/admin/api-config`).then(r => r.json());
const fetchKeys    = () => fetch(`${BASE}/api/admin/api-keys`).then(r => r.json());

/* ── helpers ── */
function num(v: string | undefined, fallback = 0) {
  const n = parseFloat(v ?? "");
  return isNaN(n) ? fallback : n;
}
function bool(v: string | undefined) { return v === "true"; }

/* ── Toggle ── */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={cn(
      "relative w-11 h-6 rounded-full border transition-all duration-200 shrink-0",
      value ? "bg-primary border-primary" : "bg-secondary border-border"
    )}>
      <span className={cn(
        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200",
        value ? "translate-x-5" : "translate-x-0"
      )} />
    </button>
  );
}

/* ── Range slider with number readout ── */
function RangeField({ label, hint, value, min, max, step = 1, unit = "", onChange }: {
  label: string; hint?: string; value: number; min: number; max: number;
  step?: number; unit?: string; onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="number" value={value} min={min} max={max} step={step}
            onChange={e => onChange(Math.min(max, Math.max(min, parseFloat(e.target.value) || min)))}
            className="w-20 bg-secondary border border-border rounded-lg px-2 py-1 text-xs text-right font-mono focus:outline-none focus:border-primary"
          />
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
      </div>
      <div className="relative h-1.5 bg-secondary rounded-full">
        <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        <input
          type="range" value={value} min={min} max={max} step={step}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
      </div>
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

/* ── Text field ── */
function TextField({ label, hint, value, placeholder, mono, onChange, multiline }: {
  label: string; hint?: string; value: string; placeholder?: string;
  mono?: boolean; onChange: (v: string) => void; multiline?: boolean;
}) {
  const cls = cn(
    "w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors resize-none",
    mono && "font-mono text-xs"
  );
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={cls} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      }
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

/* ── Section card ── */
function Section({ icon: Icon, title, badge, children, color = "primary" }: {
  icon: any; title: string; badge?: string; children: React.ReactNode; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className={cn("flex items-center gap-3 px-5 py-4 border-b border-border bg-gradient-to-r",
        color === "primary" ? "from-primary/5 to-transparent" :
        color === "green"   ? "from-green-500/5 to-transparent" :
        color === "amber"   ? "from-amber-500/5 to-transparent" :
        color === "red"     ? "from-red-500/5 to-transparent" :
        color === "blue"    ? "from-blue-500/5 to-transparent" :
        color === "violet"  ? "from-violet-500/5 to-transparent" :
        "from-secondary/50 to-transparent"
      )}>
        <div className={cn("p-1.5 rounded-lg",
          color === "primary" ? "bg-primary/10 text-primary" :
          color === "green"   ? "bg-green-500/10 text-green-400" :
          color === "amber"   ? "bg-amber-500/10 text-amber-400" :
          color === "red"     ? "bg-red-500/10 text-red-400" :
          color === "blue"    ? "bg-blue-500/10 text-blue-400" :
          color === "violet"  ? "bg-violet-500/10 text-violet-400" :
          "bg-secondary text-muted-foreground"
        )}>
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="font-semibold text-sm">{title}</h3>
        {badge && (
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{badge}</span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/* ── Row layout for fields ── */
function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div className={cn("grid gap-5", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3", cols === 1 && "grid-cols-1")}>
      {children}
    </div>
  );
}

/* ── Toggle row ── */
function ToggleRow({ label, hint, value, onChange }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border/50 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

const TABS = [
  { id: "rate",     label: "Rate Limiting",  icon: Gauge },
  { id: "cors",     label: "CORS & Security",icon: Shield },
  { id: "request",  label: "Request Pipeline",icon: Zap },
  { id: "cache",    label: "Caching",         icon: Database },
  { id: "ws",       label: "WebSocket",       icon: Radio },
  { id: "services", label: "Services",        icon: Settings2 },
  { id: "webhook",  label: "Webhooks",        icon: Webhook },
  { id: "circuit",  label: "Circuit Breaker", icon: ServerCrash },
  { id: "keys",     label: "API Keys",        icon: Key },
];

export function AdminApiSettings() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("rate");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  /* config state */
  const [cfg, setCfg] = useState<Record<string, string>>({});

  const { data: rawConfig, isLoading: cfgLoading } = useQuery({ queryKey: ["admin-api-config"], queryFn: fetchConfig });
  const { data: keys = [], isLoading: keysLoading } = useQuery({ queryKey: ["admin-api-keys"], queryFn: fetchKeys });

  useEffect(() => { if (rawConfig) setCfg(rawConfig); }, [rawConfig]);

  const set = useCallback((key: string, value: string | number | boolean) => {
    setCfg(c => ({ ...c, [key]: String(value) }));
    setDirty(true);
  }, []);

  /* API key UI */
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", type: "private", rateLimit: "500" });
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const saveConfig = useMutation({
    mutationFn: () => fetch(`${BASE}/api/admin/api-config`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg),
    }).then(r => r.json()),
    onSuccess: () => {
      setSaved(true); setDirty(false);
      setTimeout(() => setSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ["admin-api-config"] });
    },
  });

  const resetConfig = useMutation({
    mutationFn: () => fetch(`${BASE}/api/admin/api-config/reset`, { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => { if (data.config) { setCfg(data.config); setDirty(false); } qc.invalidateQueries({ queryKey: ["admin-api-config"] }); },
  });

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
    setCopiedKey(id); setTimeout(() => setCopiedKey(null), 2000);
  };

  const maskKey = (key: string) => key.slice(0, 12) + "••••••••••••" + key.slice(-4);

  const [webhookSecretVisible, setWebhookSecretVisible] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const genWebhookSecret = () => {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    set("webhookSecret", Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join(""));
  };

  if (cfgLoading) return (
    <div className="space-y-4">
      {Array.from({length: 4}).map((_, i) => <div key={i} className="h-32 bg-card rounded-2xl border border-border animate-pulse" />)}
    </div>
  );

  const activeCount = Object.values(keys).filter((k: any) => k.status === "active").length;
  const totalCalls = Object.values(keys).reduce((s, k: any) => s + (k.calls24h || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">API Settings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Advanced configuration for rate limits, security, caching, webhooks, and more</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { if (confirm("Reset all settings to defaults?")) resetConfig.mutate(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            onClick={() => saveConfig.mutate()}
            disabled={!dirty || saveConfig.isPending}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              saved ? "bg-green-500 text-white" :
              dirty ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02]" :
              "bg-secondary text-muted-foreground cursor-not-allowed"
            )}
          >
            {saved ? <><Check className="w-3.5 h-3.5" /> Saved</> :
             saveConfig.isPending ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving…</> :
             <><Save className="w-3.5 h-3.5" /> Save Changes</>}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Global Rate Limit", value: `${cfg.rateLimitGlobal ?? 1000} req/min`, icon: Gauge, color: "text-primary" },
          { label: "Request Timeout", value: `${num(cfg.requestTimeoutGetMs, 30000) / 1000}s GET`, icon: Clock, color: "text-amber-400" },
          { label: "Active API Keys", value: `${activeCount} keys`, icon: Key, color: "text-green-400" },
          { label: "API Calls / 24h", value: totalCalls.toLocaleString(), icon: Activity, color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
            <s.icon className={cn("w-4 h-4 shrink-0", s.color)} />
            <div>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              <p className="text-sm font-bold font-mono">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + content */}
      <div className="flex gap-5">
        {/* Sidebar tabs */}
        <div className="hidden md:flex flex-col gap-0.5 w-44 shrink-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left",
              activeTab === t.id
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}>
              <t.icon className="w-3.5 h-3.5 shrink-0" />
              {t.label}
              {activeTab === t.id && <ChevronRight className="w-3 h-3 ml-auto" />}
            </button>
          ))}
        </div>
        {/* Mobile tabs */}
        <div className="md:hidden flex gap-2 overflow-x-auto pb-1 w-full">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all shrink-0",
              activeTab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            )}>
              <t.icon className="w-3 h-3" />{t.label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* ── RATE LIMITING ── */}
          {activeTab === "rate" && (
            <Section icon={Gauge} title="Rate Limiting" color="primary" badge="Active">
              <div className="space-y-6">
                <Grid>
                  <RangeField label="Global Rate Limit" hint="Max requests per minute for all clients combined"
                    value={num(cfg.rateLimitGlobal, 1000)} min={100} max={10000} step={100} unit="req/min"
                    onChange={v => set("rateLimitGlobal", v)} />
                  <RangeField label="Public Key Limit" hint="Per-minute limit for public API keys"
                    value={num(cfg.rateLimitPublicKey, 2000)} min={100} max={10000} step={100} unit="req/min"
                    onChange={v => set("rateLimitPublicKey", v)} />
                  <RangeField label="Private Key Limit" hint="Per-minute limit for private API keys"
                    value={num(cfg.rateLimitPrivateKey, 500)} min={50} max={5000} step={50} unit="req/min"
                    onChange={v => set("rateLimitPrivateKey", v)} />
                  <RangeField label="Burst Allowance" hint="Extra requests allowed in a short burst"
                    value={num(cfg.rateLimitBurst, 50)} min={0} max={500} step={10} unit="req"
                    onChange={v => set("rateLimitBurst", v)} />
                  <RangeField label="Rate Window" hint="Time window for the rate limit counter"
                    value={num(cfg.rateLimitWindowMs, 60000) / 1000} min={10} max={300} step={5} unit="sec"
                    onChange={v => set("rateLimitWindowMs", v * 1000)} />
                  <RangeField label="IP Max Requests" hint="Per-IP limit within the rate window"
                    value={num(cfg.rateLimitIpMax, 200)} min={10} max={2000} step={10} unit="req"
                    onChange={v => set("rateLimitIpMax", v)} />
                </Grid>
                <div className="pt-2 border-t border-border space-y-0">
                  <ToggleRow label="IP-Based Rate Limiting" hint="Enforce per-IP limits regardless of API key"
                    value={bool(cfg.rateLimitIpEnabled)} onChange={v => set("rateLimitIpEnabled", v)} />
                </div>
                <Grid cols={1}>
                  <TextField label="IP Whitelist" hint="IPs that bypass all rate limits (comma-separated)"
                    value={cfg.ipWhitelist ?? ""} placeholder="192.168.1.1, 10.0.0.0/8"
                    mono onChange={v => set("ipWhitelist", v)} />
                  <TextField label="IP Blacklist" hint="IPs that are always blocked (comma-separated)"
                    value={cfg.ipBlacklist ?? ""} placeholder="1.2.3.4, 5.6.7.8"
                    mono onChange={v => set("ipBlacklist", v)} />
                </Grid>
              </div>
            </Section>
          )}

          {/* ── CORS & SECURITY ── */}
          {activeTab === "cors" && (
            <Section icon={Shield} title="CORS & Security" color="green" badge="Active">
              <div className="space-y-5">
                <Grid cols={1}>
                  <TextField label="Allowed Origins" hint='Use * for all origins, or comma-separate specific ones. Example: https://app.orahdex.io, https://orahdex.com'
                    value={cfg.corsOrigins ?? "*"} placeholder="*, https://app.orahdex.io"
                    onChange={v => set("corsOrigins", v)} />
                  <TextField label="Allowed Methods"
                    value={cfg.corsMethods ?? "GET,POST,PUT,DELETE,OPTIONS"} placeholder="GET,POST,PUT,DELETE,OPTIONS"
                    onChange={v => set("corsMethods", v)} hint="Comma-separated HTTP methods" />
                  <TextField label="Allowed Headers"
                    value={cfg.corsAllowedHeaders ?? "Content-Type,Authorization,X-API-Key"} placeholder="Content-Type,Authorization,X-API-Key"
                    onChange={v => set("corsAllowedHeaders", v)} hint="Comma-separated headers the browser can send" />
                </Grid>
                <Grid>
                  <RangeField label="Preflight Cache (CORS Max Age)" hint="How long browsers cache the CORS preflight response"
                    value={num(cfg.corsMaxAgeSec, 86400)} min={0} max={86400} step={3600} unit="sec"
                    onChange={v => set("corsMaxAgeSec", v)} />
                </Grid>
                <div className="border-t border-border pt-2">
                  <ToggleRow label="Allow Credentials" hint="Allow cookies and authorization headers in cross-origin requests"
                    value={bool(cfg.corsCredentials)} onChange={v => set("corsCredentials", v)} />
                  <ToggleRow label="Maintenance Mode" hint="Return 503 for all non-health requests"
                    value={bool(cfg.maintenanceMode)} onChange={v => set("maintenanceMode", v)} />
                  <ToggleRow label="Debug Logging" hint="Log full request and response bodies (high volume — use only for debugging)"
                    value={bool(cfg.debugLogging)} onChange={v => set("debugLogging", v)} />
                </div>
                <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Changing CORS origins takes effect on the next server restart. Maintenance mode applies immediately to incoming requests.
                  </p>
                </div>
              </div>
            </Section>
          )}

          {/* ── REQUEST PIPELINE ── */}
          {activeTab === "request" && (
            <Section icon={Zap} title="Request Pipeline" color="amber">
              <div className="space-y-6">
                <Grid>
                  <RangeField label="GET Request Timeout" hint="Maximum time to wait for a GET response before returning 503"
                    value={num(cfg.requestTimeoutGetMs, 30000) / 1000} min={5} max={120} step={5} unit="sec"
                    onChange={v => set("requestTimeoutGetMs", v * 1000)} />
                  <RangeField label="POST/PUT Timeout" hint="Maximum time for write operations"
                    value={num(cfg.requestTimeoutPostMs, 60000) / 1000} min={5} max={300} step={5} unit="sec"
                    onChange={v => set("requestTimeoutPostMs", v * 1000)} />
                  <RangeField label="Max Body Size" hint="Maximum request body size — larger bodies return 413"
                    value={num(cfg.maxBodySizeMb, 2)} min={0.5} max={50} step={0.5} unit="MB"
                    onChange={v => set("maxBodySizeMb", v)} />
                  <RangeField label="JSON Depth Limit" hint="Maximum nesting depth for JSON request bodies"
                    value={num(cfg.jsonDepth, 10)} min={2} max={50} step={1} unit="levels"
                    onChange={v => set("jsonDepth", v)} />
                  <RangeField label="Query Param Limit" hint="Maximum number of query string parameters per request"
                    value={num(cfg.queryParamLimit, 100)} min={10} max={1000} step={10} unit="params"
                    onChange={v => set("queryParamLimit", v)} />
                  <RangeField label="Compression Level" hint="gzip compression level (1=fastest, 9=smallest)"
                    value={num(cfg.compressionLevel, 6)} min={1} max={9} step={1}
                    onChange={v => set("compressionLevel", v)} />
                  <RangeField label="Compression Threshold" hint="Minimum response size before gzip is applied"
                    value={num(cfg.compressionThresholdBytes, 512)} min={128} max={10240} step={128} unit="bytes"
                    onChange={v => set("compressionThresholdBytes", v)} />
                </Grid>
                <div className="border-t border-border pt-2">
                  <ToggleRow label="Response Compression (gzip)" hint="Compress all API responses — reduces bandwidth by ~70%"
                    value={bool(cfg.responseCompression)} onChange={v => set("responseCompression", v)} />
                </div>
              </div>
            </Section>
          )}

          {/* ── CACHING ── */}
          {activeTab === "cache" && (
            <Section icon={Database} title="Cache TTLs" color="blue">
              <div className="space-y-2 mb-5">
                <p className="text-xs text-muted-foreground">
                  Controls the <code className="text-primary">Cache-Control: max-age</code> header for each endpoint group. Clients and CDNs use this to decide how long to cache responses.
                </p>
              </div>
              <Grid>
                <RangeField label="Markets & Prices" hint="Ticker prices, market list — refreshed by the 60s price updater"
                  value={num(cfg.cacheTtlMarkets, 15)} min={1} max={120} step={1} unit="sec"
                  onChange={v => set("cacheTtlMarkets", v)} />
                <RangeField label="Order Book & Trades" hint="Near real-time — keep this short"
                  value={num(cfg.cacheTtlOrderbook, 5)} min={1} max={60} step={1} unit="sec"
                  onChange={v => set("cacheTtlOrderbook", v)} />
                <RangeField label="Candlestick Data" hint="OHLCV bars — safe to cache longer"
                  value={num(cfg.cacheTtlCandles, 30)} min={5} max={300} step={5} unit="sec"
                  onChange={v => set("cacheTtlCandles", v)} />
                <RangeField label="Health & Status" hint="Health check and BSV chain status endpoints"
                  value={num(cfg.cacheTtlHealth, 10)} min={1} max={60} step={1} unit="sec"
                  onChange={v => set("cacheTtlHealth", v)} />
                <RangeField label="Pairs & Chains" hint="Static reference data — can cache aggressively"
                  value={num(cfg.cacheTtlPairs, 120)} min={30} max={3600} step={30} unit="sec"
                  onChange={v => set("cacheTtlPairs", v)} />
                <RangeField label="AI Insights" hint="AI-generated insights and market signals"
                  value={num(cfg.cacheTtlAi, 60)} min={10} max={600} step={10} unit="sec"
                  onChange={v => set("cacheTtlAi", v)} />
              </Grid>
              <div className="mt-5 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-blue-400">stale-while-revalidate</span> is automatically set to 2× the TTL, so clients can serve stale data while the fresh response loads in the background.
                </p>
              </div>
            </Section>
          )}

          {/* ── WEBSOCKET ── */}
          {activeTab === "ws" && (
            <Section icon={Radio} title="WebSocket" color="violet">
              <Grid>
                <RangeField label="Max Concurrent Connections" hint="Global cap on simultaneous WebSocket connections"
                  value={num(cfg.wsMaxConnections, 500)} min={10} max={5000} step={10} unit="conns"
                  onChange={v => set("wsMaxConnections", v)} />
                <RangeField label="Heartbeat Interval" hint="How often the server sends a ping frame to keep connections alive"
                  value={num(cfg.wsHeartbeatIntervalMs, 30000) / 1000} min={5} max={120} step={5} unit="sec"
                  onChange={v => set("wsHeartbeatIntervalMs", v * 1000)} />
                <RangeField label="Max Message Size" hint="Maximum single WebSocket message — larger messages are rejected"
                  value={num(cfg.wsMaxMessageSizeKb, 64)} min={8} max={4096} step={8} unit="KB"
                  onChange={v => set("wsMaxMessageSizeKb", v)} />
              </Grid>
              <div className="border-t border-border mt-5 pt-2">
                <ToggleRow label="Require Auth for WS" hint="Only authenticated clients can open WebSocket connections"
                  value={bool(cfg.wsAuthRequired)} onChange={v => set("wsAuthRequired", v)} />
              </div>
            </Section>
          )}

          {/* ── BACKGROUND SERVICES ── */}
          {activeTab === "services" && (
            <Section icon={Settings2} title="Background Services" color="primary">
              <p className="text-xs text-muted-foreground mb-5">
                Interval settings control how frequently each background engine runs. Changes take effect on the next server restart.
              </p>
              <Grid>
                <RangeField label="Price Updater" hint="How often live prices are fetched and pushed to all markets"
                  value={num(cfg.svcPriceUpdaterMs, 60000) / 1000} min={10} max={300} step={5} unit="sec"
                  onChange={v => set("svcPriceUpdaterMs", v * 1000)} />
                <RangeField label="Liquidity Bot" hint="Order book seeding and spread maintenance cycle"
                  value={num(cfg.svcLiquidityBotMs, 120000) / 1000} min={10} max={600} step={10} unit="sec"
                  onChange={v => set("svcLiquidityBotMs", v * 1000)} />
                <RangeField label="BSV Chain Monitor" hint="BSV block height, mempool, and network status polling"
                  value={num(cfg.svcBsvChainMonitorMs, 60000) / 1000} min={10} max={300} step={5} unit="sec"
                  onChange={v => set("svcBsvChainMonitorMs", v * 1000)} />
                <RangeField label="Futures Engine" hint="Funding rate calculations and position P&L settlement"
                  value={num(cfg.svcFuturesEngineMs, 120000) / 1000} min={10} max={600} step={10} unit="sec"
                  onChange={v => set("svcFuturesEngineMs", v * 1000)} />
              </Grid>
              {/* Live service status */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                  { name: "Price Updater",    desc: `Every ${num(cfg.svcPriceUpdaterMs, 60000)/1000}s` },
                  { name: "Liquidity Bot",    desc: `Every ${num(cfg.svcLiquidityBotMs, 120000)/1000}s` },
                  { name: "BSV Chain Monitor",desc: `Every ${num(cfg.svcBsvChainMonitorMs, 60000)/1000}s` },
                  { name: "Futures Engine",   desc: `Every ${num(cfg.svcFuturesEngineMs, 120000)/1000}s` },
                ].map(s => (
                  <div key={s.name} className="flex items-center gap-3 p-3 bg-secondary/40 rounded-xl border border-border">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                    <div>
                      <p className="text-xs font-semibold">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── WEBHOOKS ── */}
          {activeTab === "webhook" && (
            <Section icon={Webhook} title="Webhooks" color="green">
              <div className="space-y-5">
                <TextField label="Webhook URL" hint="POST requests will be sent here for each event"
                  value={cfg.webhookUrl ?? ""} placeholder="https://your-server.com/api/orahdex-events"
                  onChange={v => set("webhookUrl", v)} />

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Webhook Secret</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={webhookSecretVisible ? "text" : "password"}
                        value={cfg.webhookSecret ?? ""}
                        onChange={e => set("webhookSecret", e.target.value)}
                        placeholder="HMAC-SHA256 secret for signature verification"
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary pr-10"
                      />
                      <button onClick={() => setWebhookSecretVisible(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {webhookSecretVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button onClick={genWebhookSecret}
                      className="px-3 py-2 rounded-xl border border-border text-xs font-medium hover:border-primary hover:text-primary transition-all whitespace-nowrap">
                      Generate
                    </button>
                    <button onClick={() => { navigator.clipboard.writeText(cfg.webhookSecret ?? ""); setCopiedWebhook(true); setTimeout(() => setCopiedWebhook(false), 2000); }}
                      className="p-2.5 rounded-xl border border-border text-muted-foreground hover:text-primary transition-all">
                      {copiedWebhook ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70">Sent as <code>X-OrahDEX-Signature: sha256=…</code> header on every webhook call</p>
                </div>

                <Grid>
                  <RangeField label="Retry Attempts" hint="How many times to retry a failed webhook delivery"
                    value={num(cfg.webhookRetries, 3)} min={0} max={10} step={1} unit="retries"
                    onChange={v => set("webhookRetries", v)} />
                  <RangeField label="Webhook Timeout" hint="Max time to wait for your server to respond"
                    value={num(cfg.webhookTimeoutMs, 5000) / 1000} min={1} max={30} step={1} unit="sec"
                    onChange={v => set("webhookTimeoutMs", v * 1000)} />
                </Grid>

                <div className="border-t border-border pt-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Trigger Events</p>
                  <ToggleRow label="Trade Executed" hint="Fire webhook on every filled trade"
                    value={bool(cfg.webhookOnTrade)} onChange={v => set("webhookOnTrade", v)} />
                  <ToggleRow label="Order Placed / Cancelled" hint="Fire webhook on new or cancelled orders"
                    value={bool(cfg.webhookOnOrder)} onChange={v => set("webhookOnOrder", v)} />
                  <ToggleRow label="Liquidation" hint="Fire webhook when a position is liquidated"
                    value={bool(cfg.webhookOnLiquidation)} onChange={v => set("webhookOnLiquidation", v)} />
                </div>
              </div>
            </Section>
          )}

          {/* ── CIRCUIT BREAKER ── */}
          {activeTab === "circuit" && (
            <Section icon={ServerCrash} title="Circuit Breaker" color="red">
              <div className="space-y-5">
                <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl flex gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    The circuit breaker automatically stops requests to failing upstream services (price feeds, BSV chain, external APIs) after a threshold of errors — preventing cascading failures. It resets after a cooling-off period.
                  </p>
                </div>
                <div className="border-t border-border pt-2">
                  <ToggleRow label="Enable Circuit Breaker" hint="Automatically trip when upstream services fail repeatedly"
                    value={bool(cfg.cbEnabled)} onChange={v => set("cbEnabled", v)} />
                </div>
                <Grid>
                  <RangeField label="Failure Threshold" hint="Number of consecutive failures before the breaker trips"
                    value={num(cfg.cbFailureThreshold, 5)} min={1} max={50} step={1} unit="errors"
                    onChange={v => set("cbFailureThreshold", v)} />
                  <RangeField label="Reset (Cooldown) Period" hint="Time before the breaker enters half-open state"
                    value={num(cfg.cbResetMs, 30000) / 1000} min={5} max={300} step={5} unit="sec"
                    onChange={v => set("cbResetMs", v * 1000)} />
                  <RangeField label="Half-Open Test Requests" hint="Requests allowed through in half-open state to test recovery"
                    value={num(cfg.cbHalfOpenRequests, 2)} min={1} max={20} step={1} unit="req"
                    onChange={v => set("cbHalfOpenRequests", v)} />
                </Grid>
                {/* State diagram */}
                <div className="flex items-center gap-3 justify-center pt-2">
                  {[
                    { label: "CLOSED", sub: "Normal", color: "bg-green-400" },
                    { label: "→", sub: `${cfg.cbFailureThreshold ?? 5} failures`, color: "" },
                    { label: "OPEN", sub: "Blocked", color: "bg-red-400" },
                    { label: "→", sub: `${(num(cfg.cbResetMs, 30000)/1000)}s`, color: "" },
                    { label: "HALF-OPEN", sub: "Testing", color: "bg-amber-400" },
                  ].map((s, i) => s.color ? (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <span className={cn("w-3 h-3 rounded-full", s.color)} />
                      <span className="text-[10px] font-bold">{s.label}</span>
                      <span className="text-[9px] text-muted-foreground">{s.sub}</span>
                    </div>
                  ) : (
                    <div key={i} className="flex flex-col items-center gap-1 opacity-40">
                      <span className="text-lg">→</span>
                      <span className="text-[9px] text-muted-foreground">{s.sub}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* ── API KEYS ── */}
          {activeTab === "keys" && (
            <Section icon={Key} title="API Keys" color="primary">
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                >
                  <Plus className="w-4 h-4" /> Generate Key
                </button>
              </div>

              {/* Generate modal */}
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

              <div className="space-y-3">
                {keysLoading
                  ? Array.from({length: 3}).map((_, i) => <div key={i} className="h-20 bg-secondary rounded-xl animate-pulse" />)
                  : keys.map((k: any) => (
                  <div key={k.id} className={cn(
                    "p-4 rounded-xl border transition-all",
                    k.status === "revoked" ? "border-border opacity-50" : "border-border hover:border-primary/30 bg-secondary/20"
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                        <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{k.calls24h.toLocaleString()} calls/24h</span>
                          <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />Limit: {k.rateLimit} req/min</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Created: {k.createdAt}</span>
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
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
