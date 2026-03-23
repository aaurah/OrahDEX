import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Eye, EyeOff, Check, Save, RefreshCw, ExternalLink,
  AlertTriangle, CheckCircle2, Cpu, Globe, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface IntegrationSettings {
  coingecko_api_key: string;
  moonpay_api_key: string;
  transak_api_key: string;
  banxa_api_key: string;
  simplex_api_key: string;
  ramp_api_key: string;
  bsv_rpc_url: string;
}

const DEFAULTS: IntegrationSettings = {
  coingecko_api_key: "",
  moonpay_api_key: "",
  transak_api_key: "",
  banxa_api_key: "",
  simplex_api_key: "",
  ramp_api_key: "",
  bsv_rpc_url: "https://api.whatsonchain.com/v1/bsv/main",
};

const fetchIntegrations = (): Promise<IntegrationSettings> =>
  fetch(`${BASE}/api/admin/integrations`).then(r => r.json());

const saveIntegrations = (data: IntegrationSettings) =>
  fetch(`${BASE}/api/admin/integrations`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(r => r.json());

function MaskedField({
  label, value, onChange, placeholder, hint, docsUrl, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; docsUrl?: string; required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const isSet = value.trim().length > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          {label}
          {required && <span className="text-red-400">*</span>}
        </label>
        <div className="flex items-center gap-2">
          {isSet ? (
            <span className="flex items-center gap-1 text-[10px] text-green-400 font-semibold">
              <CheckCircle2 className="w-3 h-3" /> Configured
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold">
              <AlertTriangle className="w-3 h-3" /> Not set
            </span>
          )}
          {docsUrl && (
            <a href={docsUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-primary hover:underline font-semibold">
              <ExternalLink className="w-3 h-3" /> Get Key
            </a>
          )}
        </div>
      </div>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-secondary/60 border border-border rounded-xl px-4 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{hint}</p>}
    </div>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}
function Section({ icon, title, description, badge, badgeColor, children }: SectionProps) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-start justify-between p-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm">{title}</h3>
              {badge && (
                <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border", badgeColor)}>
                  {badge}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

export function AdminIntegrations() {
  const qc = useQueryClient();
  const [form, setForm] = useState<IntegrationSettings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-integrations"],
    queryFn: fetchIntegrations,
  });

  useEffect(() => {
    if (data) setForm({ ...DEFAULTS, ...data });
  }, [data]);

  const set = (key: keyof IntegrationSettings) => (value: string) =>
    setForm(f => ({ ...f, [key]: value }));

  const mutation = useMutation({
    mutationFn: saveIntegrations,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-integrations"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Integrations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Loading settings…</p>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 bg-card border border-border rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">Integrations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage all third-party API keys and integration settings. Changes apply instantly — no rebuild needed.
          </p>
        </div>
        <button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg",
            saved
              ? "bg-green-500 text-white shadow-green-500/20"
              : "bg-primary text-primary-foreground shadow-primary/20 hover:opacity-90",
            mutation.isPending && "opacity-70 cursor-not-allowed"
          )}
        >
          {mutation.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {mutation.isPending ? "Saving…" : saved ? "Saved!" : "Save All"}
        </button>
      </div>

      {mutation.isError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Failed to save settings. Check the API server is running and try again.
        </div>
      )}

      {/* ── CoinGecko ── */}
      <Section
        icon={<Globe className="w-4 h-4" />}
        title="CoinGecko Price API"
        description="Live price feeds for all 226 trading pairs. Free tier works without a key (30 req/min). Pro key removes rate limits."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
      >
        <MaskedField
          label="API Key (Pro / Demo)"
          value={form.coingecko_api_key}
          onChange={set("coingecko_api_key")}
          placeholder="CG-xxxxxxxxxxxxxxxxxxxx"
          docsUrl="https://www.coingecko.com/en/api"
          hint="Free tier: no key needed, 30 calls/min. Demo key: 10,000 calls/min free. Pro key: unlimited."
        />
      </Section>

      {/* ── On-ramp Exchanges ── */}
      <Section
        icon={<Zap className="w-4 h-4" />}
        title="On-Ramp Exchange Partners"
        description="API keys for fiat-to-crypto purchase providers shown in the Buy Crypto flow. All providers work in sandbox mode without a key — add keys to go live."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MaskedField
            label="🌙 MoonPay API Key"
            value={form.moonpay_api_key}
            onChange={set("moonpay_api_key")}
            placeholder="pk_live_xxxxxxxxxxxx"
            docsUrl="https://dashboard.moonpay.com"
            hint="MoonPay publishable key (pk_live_...). Supports card, Apple Pay, bank."
          />
          <MaskedField
            label="⚡ Transak API Key"
            value={form.transak_api_key}
            onChange={set("transak_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            docsUrl="https://dashboard.transak.com"
            hint="Transak partner API key. Low fees (0.99–2.5%). 100+ countries."
          />
          <MaskedField
            label="🏦 Banxa API Key"
            value={form.banxa_api_key}
            onChange={set("banxa_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            docsUrl="https://banxa.com/for-businesses"
            hint="Banxa partner key. Best for high-volume purchases (min $50)."
          />
          <MaskedField
            label="💎 Simplex API Key"
            value={form.simplex_api_key}
            onChange={set("simplex_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            docsUrl="https://partners.simplex.com"
            hint="Simplex partner key. Credit/debit card processing worldwide."
          />
          <MaskedField
            label="🔵 Ramp Network API Key"
            value={form.ramp_api_key}
            onChange={set("ramp_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            docsUrl="https://docs.ramp.network"
            hint="Ramp Network host API key. Lowest fees (0.49–2.9%). Bank + cards."
          />
        </div>
      </Section>

      {/* ── BSV Node ── */}
      <Section
        icon={<Cpu className="w-4 h-4" />}
        title="Bitcoin SV Node / RPC"
        description="BSV node endpoint for on-chain settlement, UTXO queries, and transaction broadcasting."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
      >
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Node RPC URL</label>
            <span className={cn(
              "flex items-center gap-1 text-[10px] font-semibold",
              form.bsv_rpc_url ? "text-green-400" : "text-amber-400"
            )}>
              {form.bsv_rpc_url ? <><CheckCircle2 className="w-3 h-3" /> Configured</> : <><AlertTriangle className="w-3 h-3" /> Not set</>}
            </span>
          </div>
          <input
            type="url"
            value={form.bsv_rpc_url}
            onChange={e => set("bsv_rpc_url")(e.target.value)}
            placeholder="https://api.whatsonchain.com/v1/bsv/main"
            className="w-full bg-secondary/60 border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
          />
          <p className="text-[10px] text-muted-foreground/70">
            Default: WhatsOnChain public API (free, rate-limited). For production use a dedicated BSV node.
          </p>
        </div>
      </Section>

      {/* Bottom save bar */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground flex-1">
          All settings are stored securely in the database. Changes apply immediately without redeployment.
        </p>
        <button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg",
            saved
              ? "bg-green-500 text-white shadow-green-500/20"
              : "bg-primary text-primary-foreground shadow-primary/20 hover:opacity-90",
            mutation.isPending && "opacity-70 cursor-not-allowed"
          )}
        >
          {mutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {mutation.isPending ? "Saving…" : saved ? "Saved!" : "Save All"}
        </button>
      </div>
    </div>
  );
}
