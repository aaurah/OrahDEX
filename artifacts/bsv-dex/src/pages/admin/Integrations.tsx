import { adminFetch } from "@/lib/adminFetch";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Eye, EyeOff, Check, Save, RefreshCw,
  AlertTriangle, CheckCircle2, Cpu, Globe, Zap,
  Wallet, Bell, Shield, Mail, BarChart3, MessageSquare,
  ChevronDown, ChevronUp, Wifi, WifiOff, Loader2, ExternalLink,
  Link2, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface IntegrationSettings {
  reown_project_id: string;
  dexscreener_api_key: string;
  geckoterm_api_key: string;
  moonpay_api_key: string;
  transak_api_key: string;
  banxa_api_key: string;
  simplex_api_key: string;
  ramp_api_key: string;
  bsv_rpc_url: string;
  whatsonchain_api_key: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  recaptcha_site_key: string;
  recaptcha_secret_key: string;
  google_analytics_id: string;
  intercom_app_id: string;
  discord_webhook_url: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  letsexchange_api_key: string;
  sumsub_api_key: string;
}

const DEFAULTS: IntegrationSettings = {
  reown_project_id: "",
  dexscreener_api_key: "",
  geckoterm_api_key: "",
  moonpay_api_key: "",
  transak_api_key: "",
  banxa_api_key: "",
  simplex_api_key: "",
  ramp_api_key: "",
  bsv_rpc_url: "https://api.whatsonchain.com/v1/bsv/main",
  whatsonchain_api_key: "",
  smtp_host: "",
  smtp_port: "587",
  smtp_user: "",
  smtp_pass: "",
  smtp_from: "",
  recaptcha_site_key: "",
  recaptcha_secret_key: "",
  google_analytics_id: "",
  intercom_app_id: "",
  discord_webhook_url: "",
  telegram_bot_token: "",
  telegram_chat_id: "",
  letsexchange_api_key: "",
  sumsub_api_key: "",
};

const fetchIntegrations = (): Promise<IntegrationSettings> =>
  adminFetch(`/api/admin/integrations`).then(r => r.json());

const saveIntegrations = (data: IntegrationSettings) =>
  adminFetch(`/api/admin/integrations`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(r => r.json());

function StatusDot({ value }: { value: string }) {
  const isSet = value.trim().length > 0;
  return isSet ? (
    <span className="flex items-center gap-1 text-[10px] text-green-400 font-semibold">
      <CheckCircle2 className="w-3 h-3" /> Configured
    </span>
  ) : (
    <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold">
      <AlertTriangle className="w-3 h-3" /> Not set
    </span>
  );
}

function MaskedField({
  label, value, onChange, placeholder, hint, required, type = "password",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; required?: boolean; type?: "password" | "text" | "url" | "email" | "number";
}) {
  const [visible, setVisible] = useState(false);
  const isSecret = type === "password";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          {label}
          {required && <span className="text-red-400">*</span>}
        </label>
        <StatusDot value={value} />
      </div>
      <div className="relative">
        <input
          type={isSecret && !visible ? "password" : type === "password" ? "text" : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-secondary/60 border border-border rounded-xl px-4 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
          autoComplete="off"
          spellCheck={false}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
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
  defaultOpen?: boolean;
  configuredCount?: number;
  totalCount?: number;
}

function Section({ icon, title, description, badge, badgeColor, children, defaultOpen = true, configuredCount, totalCount }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between p-5 border-b border-border hover:bg-white/2 transition-colors text-left"
      >
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
              {configuredCount !== undefined && totalCount !== undefined && (
                <span className={cn(
                  "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border",
                  configuredCount === totalCount
                    ? "bg-green-400/10 text-green-400 border-green-400/20"
                    : "bg-amber-400/10 text-amber-400 border-amber-400/20"
                )}>
                  {configuredCount}/{totalCount}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground mt-1 shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />}
      </button>
      {open && <div className="p-5 space-y-4">{children}</div>}
    </div>
  );
}

export function AdminIntegrations() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<IntegrationSettings>(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-integrations"],
    queryFn: fetchIntegrations,
  });

  useEffect(() => {
    if (data) setForm({ ...DEFAULTS, ...data });
  }, [data]);

  const set = (key: keyof IntegrationSettings) => (value: string) => {
    setSmtpTestResult(null); // Reset test result when credentials change
    setForm(f => ({ ...f, [key]: value }));
  };

  const mutation = useMutation({
    mutationFn: saveIntegrations,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-integrations"] });
      qc.invalidateQueries({ queryKey: ["smtp-status"] });
      setSaved(true);
      setSmtpTestResult(null);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: "Settings saved", description: "All integration settings have been saved." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save settings. Please try again.", variant: "destructive" });
    },
  });

  const testSmtpMutation = useMutation({
    mutationFn: async () => {
      await saveIntegrations(form);
      return adminFetch(`/api/admin/mail/test-smtp`, { method: "POST" }).then(r => r.json());
    },
    onSuccess: (data: { success: boolean; error?: string }) => {
      setSmtpTestResult(data);
      qc.invalidateQueries({ queryKey: ["smtp-status"] });
      if (data.success) {
        toast({ title: "SMTP connection OK", description: "Your mail server is reachable and credentials are valid." });
      } else {
        toast({ title: "SMTP test failed", description: data.error ?? "Connection failed", variant: "destructive" });
      }
    },
  });

  const autoEmailMutation = useMutation({
    mutationFn: () =>
      adminFetch(`/api/admin/auto-setup-email`, { method: "POST" }).then(r => r.json()),
    onSuccess: (data: { success: boolean; user?: string; pass?: string; host?: string; port?: number; from?: string; error?: string }) => {
      if (!data.success) {
        toast({ title: "Failed", description: data.error ?? "Could not create test account", variant: "destructive" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["admin-integrations"] });
      setForm(f => ({
        ...f,
        smtp_host: data.host ?? "smtp.ethereal.email",
        smtp_port: String(data.port ?? 587),
        smtp_user: data.user ?? "",
        smtp_pass: data.pass ?? "",
        smtp_from: data.from ?? data.user ?? "",
      }));
      setSmtpTestResult(null);
      toast({
        title: "Free test email account created!",
        description: `Credentials filled in. Click Save All, then Test Connection. View sent emails at ethereal.email/messages using these credentials.`,
      });
    },
    onError: () => toast({ title: "Failed to create test account", variant: "destructive" }),
  });

  const countSet = (...keys: (keyof IntegrationSettings)[]) =>
    keys.filter(k => form[k].trim().length > 0).length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Integrations & API Keys</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Loading settings…</p>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-40 bg-card border border-border rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const SaveBtn = ({ className }: { className?: string }) => (
    <button
      onClick={() => mutation.mutate(form)}
      disabled={mutation.isPending}
      className={cn(
        "flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg",
        saved
          ? "bg-green-500 text-white shadow-green-500/20"
          : "bg-primary text-primary-foreground shadow-primary/20 hover:opacity-90",
        mutation.isPending && "opacity-70 cursor-not-allowed",
        className,
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
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Integrations & API Keys</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            All third-party API keys and integration settings. Stored securely in the database — changes apply instantly without redeployment.
          </p>
        </div>
        <SaveBtn />
      </div>

      {mutation.isError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Failed to save settings. Check the API server is running and try again.
        </div>
      )}

      {/* ── 1. Wallet Connect (Reown) ── */}
      <Section
        icon={<Wallet className="w-4 h-4" />}
        title="Wallet Connect — Reown / AppKit"
        description="Required for EVM wallet connections (MetaMask, Coinbase, WalletConnect, etc.) across all chains."
        badge="Required"
        badgeColor="bg-red-400/10 text-red-400 border-red-400/20"
        configuredCount={countSet("reown_project_id")}
        totalCount={1}
      >
        <MaskedField
          label="Reown Project ID"
          value={form.reown_project_id}
          onChange={set("reown_project_id")}
          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          required
          hint="Get your free Project ID at cloud.reown.com → New Project → WalletKit. This is a public identifier — safe to expose in client code."
        />
        <div className="p-3 bg-blue-400/5 border border-blue-400/15 rounded-xl text-xs text-blue-300 space-y-1">
          <p className="font-semibold">How to get your Reown Project ID:</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-300/80">
            <li>Go to <span className="font-mono">cloud.reown.com</span> and sign up for free</li>
            <li>Click "New Project" → choose "WalletKit"</li>
            <li>Copy the Project ID from the dashboard</li>
            <li>Paste it above and click Save All</li>
          </ol>
        </div>
      </Section>

      {/* ── 2. Price Data APIs ── */}
      <Section
        icon={<BarChart3 className="w-4 h-4" />}
        title="Price Data — Sovereign Engine"
        description="OrahDEX runs its own price engine (Binance public feed + WhatsOnChain + own order books). No external API key needed for core price data. Optional keys below enhance token discovery."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
        configuredCount={countSet("dexscreener_api_key", "geckoterm_api_key")}
        totalCount={2}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MaskedField
            label="DexScreener API Key"
            value={form.dexscreener_api_key}
            onChange={set("dexscreener_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            hint="DexScreener API for DEX pair discovery and Base chain tokens. Free tier available at dexscreener.com/api"
          />
          <MaskedField
            label="GeckoTerminal API Key"
            value={form.geckoterm_api_key}
            onChange={set("geckoterm_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            hint="GeckoTerminal for 200+ network DEX pools and trending tokens. Free public API; API key for higher limits. Get at geckoterminal.com"
          />
        </div>
        <p className="text-xs text-muted-foreground/70 pt-1">
          Core price data is served from OrahDEX sovereign engine — Binance public ticker + WhatsOnChain BSV rate + own trades. Zero dependency on CoinGecko or CoinMarketCap.
        </p>
      </Section>

      {/* ── 3. BSV Node / RPC ── */}
      <Section
        icon={<Cpu className="w-4 h-4" />}
        title="Bitcoin SV Node / RPC"
        description="BSV endpoint for on-chain settlement, UTXO queries, HTLC scripts, and transaction broadcasting."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
        configuredCount={countSet("bsv_rpc_url")}
        totalCount={1}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Node RPC URL</label>
              <StatusDot value={form.bsv_rpc_url} />
            </div>
            <input
              type="url"
              value={form.bsv_rpc_url}
              onChange={e => set("bsv_rpc_url")(e.target.value)}
              placeholder="https://api.whatsonchain.com/v1/bsv/main"
              className="w-full bg-secondary/60 border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
            />
            <p className="text-[10px] text-muted-foreground/70">
              Default: WhatsOnChain public API (free, rate-limited). For production, run a dedicated BSV node or use Taal's MAPI.
            </p>
          </div>
          <MaskedField
            label="WhatsOnChain API Key"
            value={form.whatsonchain_api_key}
            onChange={set("whatsonchain_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            hint="Optional API key to bypass WhatsOnChain rate limits. Get at developers.whatsonchain.com"
          />
        </div>
      </Section>

      {/* ── 4. Fiat On-Ramp Providers ── */}
      <Section
        icon={<Zap className="w-4 h-4" />}
        title="Fiat On-Ramp Providers"
        description="API keys for fiat on-ramp provider widgets. All providers work in sandbox mode without a key — add keys to go live."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
        configuredCount={countSet("moonpay_api_key", "transak_api_key", "banxa_api_key", "simplex_api_key", "ramp_api_key")}
        totalCount={5}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MaskedField
            label="MoonPay API Key"
            value={form.moonpay_api_key}
            onChange={set("moonpay_api_key")}
            placeholder="pk_live_xxxxxxxxxxxx"
            hint="MoonPay publishable key (pk_live_...). Supports card, Apple Pay, bank. dashboard.moonpay.com"
          />
          <MaskedField
            label="Transak API Key"
            value={form.transak_api_key}
            onChange={set("transak_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            hint="Transak partner API key. Low fees (0.99–2.5%). 100+ countries. dashboard.transak.com"
          />
          <MaskedField
            label="Banxa API Key"
            value={form.banxa_api_key}
            onChange={set("banxa_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            hint="Banxa partner key. Best for high-volume purchases (min $50). banxa.com/for-businesses"
          />
          <MaskedField
            label="Simplex API Key"
            value={form.simplex_api_key}
            onChange={set("simplex_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            hint="Simplex partner key. Credit/debit card processing worldwide. partners.simplex.com"
          />
          <MaskedField
            label="Ramp Network API Key"
            value={form.ramp_api_key}
            onChange={set("ramp_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            hint="Ramp Network host API key. Lowest fees (0.49–2.9%). Bank + cards. docs.ramp.network"
          />
        </div>
      </Section>

      {/* ── Email / SMTP ── */}
      <Section
        icon={<Mail className="w-4 h-4" />}
        title="Email / SMTP"
        description="Send transactional emails from OrahDEX (password resets, trade confirmations, notifications)."
        badge={form.smtp_host ? "Configured" : "Not set"}
        badgeColor={form.smtp_host ? "bg-green-400/10 text-green-400 border-green-400/20" : "bg-amber-400/10 text-amber-400 border-amber-400/20"}
        defaultOpen={!form.smtp_host}
        configuredCount={countSet("smtp_host", "smtp_user", "smtp_pass")}
        totalCount={3}
      >
        {/* Instant free test account */}
        <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl mb-4">
          <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">No email provider? Generate a free test account instantly</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Creates a free Ethereal test inbox — no signup needed. Emails won't reach real inboxes but you can view them
              at <a href="https://ethereal.email/messages" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">ethereal.email/messages</a> using the generated credentials. Perfect for testing.
            </p>
          </div>
          <button
            onClick={() => autoEmailMutation.mutate()}
            disabled={autoEmailMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 transition-all disabled:opacity-60 shrink-0"
          >
            {autoEmailMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            {autoEmailMutation.isPending ? "Generating…" : "Generate Free Test Account"}
          </button>
        </div>

        {/* One-click provider presets */}
        <div className="space-y-3 mb-4">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-primary" />
            Or quick-fill with a real provider:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              {
                label: "SendGrid",
                color: "text-blue-400 border-blue-500/30 bg-blue-500/8 hover:bg-blue-500/15",
                fill: { smtp_host: "smtp.sendgrid.net", smtp_port: "587", smtp_user: "apikey", smtp_from: "support@orahdex.org" },
                note: "Username = apikey\nPassword = your SG API key\nFree: 100 emails/day",
              },
              {
                label: "Mailgun",
                color: "text-red-400 border-red-500/30 bg-red-500/8 hover:bg-red-500/15",
                fill: { smtp_host: "smtp.mailgun.org", smtp_port: "587", smtp_user: "", smtp_from: "support@orahdex.org" },
                note: "Username = your Mailgun SMTP login\nPassword = Mailgun SMTP password\nFree: 100 emails/day (sandbox)",
              },
              {
                label: "Gmail",
                color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/8 hover:bg-yellow-500/15",
                fill: { smtp_host: "smtp.gmail.com", smtp_port: "587", smtp_user: "", smtp_from: "" },
                note: "Username = your Gmail address\nPassword = App Password (not login password)\nEnable 2FA → myaccount.google.com/apppasswords",
              },
              {
                label: "Brevo",
                color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/8 hover:bg-emerald-500/15",
                fill: { smtp_host: "smtp-relay.brevo.com", smtp_port: "587", smtp_user: "", smtp_from: "" },
                note: "Username = your Brevo login email\nPassword = Brevo SMTP key (not login password)\nFree: 300 emails/day",
              },
            ] as const).map(({ label, color, fill, note }) => (
              <button
                key={label}
                type="button"
                title={note}
                onClick={() => {
                  setForm(f => ({ ...f, ...fill }));
                  setSmtpTestResult(null);
                  toast({ title: `${label} preset loaded`, description: "Fill in your password/API key then click Save All." });
                }}
                className={cn(
                  "flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all",
                  color
                )}
              >
                <span className="text-sm">{label}</span>
                <span className="text-[10px] font-normal opacity-70 text-left leading-tight">{note.split("\n")[2]}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/60 italic">Hover a card to see full instructions. Add your password and click Save All.</p>
        </div>

        {/* SMTP fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MaskedField
            label="SMTP Host"
            value={form.smtp_host}
            onChange={set("smtp_host")}
            placeholder="smtp.sendgrid.net"
            type="text"
            hint="SMTP server hostname."
          />
          <MaskedField
            label="SMTP Port"
            value={form.smtp_port}
            onChange={set("smtp_port")}
            placeholder="587"
            type="number"
            hint="587 (STARTTLS) or 465 (SSL)."
          />
          <MaskedField
            label="SMTP Username"
            value={form.smtp_user}
            onChange={set("smtp_user")}
            placeholder="apikey or your@email.com"
            type="text"
            hint="For SendGrid use 'apikey' as username."
          />
          <MaskedField
            label="SMTP Password / API Key"
            value={form.smtp_pass}
            onChange={set("smtp_pass")}
            placeholder="password or API key"
            hint="SMTP password or API key from your provider."
          />
          <MaskedField
            label="From Email Address"
            value={form.smtp_from}
            onChange={set("smtp_from")}
            placeholder="noreply@orahdex.org"
            type="email"
            hint="Sender address shown on all outgoing emails."
          />
        </div>

        {/* Test Connection */}
        <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <button
            onClick={() => testSmtpMutation.mutate()}
            disabled={testSmtpMutation.isPending || !form.smtp_host || !form.smtp_user || !form.smtp_pass}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm border transition-all",
              !form.smtp_host || !form.smtp_user || !form.smtp_pass
                ? "opacity-40 cursor-not-allowed border-border text-muted-foreground"
                : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            {testSmtpMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Wifi className="w-3.5 h-3.5" />}
            {testSmtpMutation.isPending ? "Testing…" : "Test Connection"}
          </button>

          {smtpTestResult && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold",
              smtpTestResult.success
                ? "bg-green-500/10 border-green-500/25 text-green-400"
                : "bg-red-500/10 border-red-500/25 text-red-400"
            )}>
              {smtpTestResult.success
                ? <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Connection successful — SMTP is working</>
                : <><WifiOff className="w-3.5 h-3.5 shrink-0" /> {smtpTestResult.error ?? "Connection failed"}</>}
            </div>
          )}

          {form.smtp_host === "smtp.ethereal.email" && (
            <a
              href="https://ethereal.email/messages"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-violet-500/30 bg-violet-500/8 text-violet-400 text-xs font-semibold hover:bg-violet-500/15 transition-all"
            >
              <ExternalLink className="w-3 h-3" />
              View sent emails at ethereal.email
            </a>
          )}
        </div>

        {form.smtp_host === "smtp.ethereal.email" && (
          <div className="mt-3 p-3 bg-violet-500/5 border border-violet-500/20 rounded-xl text-xs text-muted-foreground leading-relaxed">
            <span className="font-bold text-violet-400">Test mode active.</span> Emails are captured at Ethereal (not delivered to real inboxes).
            Log in to <a href="https://ethereal.email/messages" target="_blank" rel="noreferrer" className="text-violet-400 underline">ethereal.email/messages</a> with
            your SMTP Username and Password above to view sent messages.
            To switch to real delivery, paste your SendGrid/Mailgun/Gmail credentials above and click Save All.
          </div>
        )}
      </Section>

      {/* ── Bridge — LetsExchange ── */}
      <Section
        icon={<Link2 className="w-4 h-4" />}
        title="Bridge — LetsExchange"
        description="Powers the Bridge tab. Users can swap 340+ coins cross-chain without holding the target asset. Add your affiliate API key to earn commission on each swap."
        badge="Recommended"
        badgeColor="bg-amber-400/10 text-amber-400 border-amber-400/20"
        configuredCount={countSet("letsexchange_api_key")}
        totalCount={1}
      >
        <MaskedField
          label="LetsExchange API Key"
          value={form.letsexchange_api_key}
          onChange={set("letsexchange_api_key")}
          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          hint="Get your affiliate API key at letsexchange.io/affiliate. Used for all Bridge swaps and earns commission per conversion."
        />
        <div className="p-3 bg-cyan-400/5 border border-cyan-400/15 rounded-xl text-xs text-cyan-300 space-y-1">
          <p className="font-semibold">Bridge is the primary way users acquire new coins on OrahDEX.</p>
          <ol className="list-decimal list-inside space-y-0.5 text-cyan-300/80">
            <li>Go to <span className="font-mono">letsexchange.io</span> → Affiliate Program → Get API Key</li>
            <li>Use <span className="font-mono">float: true</span> swaps for best UX (no fixed-rate lock)</li>
            <li>Platform earns a percentage of every Bridge swap as affiliate commission</li>
          </ol>
        </div>
      </Section>

      {/* ── KYC / AML ── */}
      <Section
        icon={<ShieldCheck className="w-4 h-4" />}
        title="KYC / AML — Sumsub"
        description="Automated identity verification for withdrawals, spot, futures, and P2P. Required for regulated regions."
        badge="Recommended"
        badgeColor="bg-amber-400/10 text-amber-400 border-amber-400/20"
        configuredCount={countSet("sumsub_api_key")}
        totalCount={1}
      >
        <MaskedField
          label="Sumsub App Token"
          value={form.sumsub_api_key}
          onChange={set("sumsub_api_key")}
          placeholder="sbx:xxxxxxxx.xxxxxxxx"
          hint="Get your App Token from app.sumsub.com → Settings → API Keys. Prefix sbx: for sandbox, prd: for production."
        />
        <div className="p-3 bg-amber-400/5 border border-amber-400/15 rounded-xl text-xs text-amber-300 space-y-1">
          <p className="font-semibold">KYC is enforced at the feature-flag level:</p>
          <p className="text-amber-300/80">
            Go to <a href="/admin/features" className="underline underline-offset-2">Feature Flags</a> to configure which actions require KYC (withdrawals, spot, futures, P2P).
          </p>
        </div>
      </Section>

      {/* ── 5. Security & Anti-Spam ── */}
      <Section
        icon={<Shield className="w-4 h-4" />}
        title="Security & Anti-Spam"
        description="Google reCAPTCHA to protect sign-up, withdrawals, and sensitive actions from bots."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
        defaultOpen={false}
        configuredCount={countSet("recaptcha_site_key", "recaptcha_secret_key")}
        totalCount={2}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MaskedField
            label="reCAPTCHA Site Key (v3)"
            value={form.recaptcha_site_key}
            onChange={set("recaptcha_site_key")}
            placeholder="6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            type="text"
            hint="Public site key used in the browser. Get at google.com/recaptcha/admin"
          />
          <MaskedField
            label="reCAPTCHA Secret Key (v3)"
            value={form.recaptcha_secret_key}
            onChange={set("recaptcha_secret_key")}
            placeholder="6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            hint="Server-side secret key. Never expose this in client code."
          />
        </div>
      </Section>

      {/* ── 7. Analytics & Support ── */}
      <Section
        icon={<Globe className="w-4 h-4" />}
        title="Analytics & Live Support"
        description="Track user behaviour and enable live chat widgets to improve the trading experience."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
        defaultOpen={false}
        configuredCount={countSet("google_analytics_id", "intercom_app_id")}
        totalCount={2}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MaskedField
            label="Google Analytics ID (GA4)"
            value={form.google_analytics_id}
            onChange={set("google_analytics_id")}
            placeholder="G-XXXXXXXXXX"
            type="text"
            hint="GA4 Measurement ID (starts with G-). Get at analytics.google.com"
          />
          <MaskedField
            label="Intercom App ID"
            value={form.intercom_app_id}
            onChange={set("intercom_app_id")}
            placeholder="xxxxxxxx"
            type="text"
            hint="Intercom workspace App ID. Adds the live-chat bubble. app.intercom.com → Settings → Installation"
          />
        </div>
      </Section>

      {/* ── 8. Notifications (Discord / Telegram) ── */}
      <Section
        icon={<Bell className="w-4 h-4" />}
        title="Notifications — Discord & Telegram"
        description="Post real-time alerts (large trades, liquidations, new listings, security events) to your Discord channel or Telegram group."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
        defaultOpen={false}
        configuredCount={countSet("discord_webhook_url", "telegram_bot_token")}
        totalCount={2}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <MaskedField
              label="Discord Webhook URL"
              value={form.discord_webhook_url}
              onChange={set("discord_webhook_url")}
              placeholder="https://discord.com/api/webhooks/xxx/yyy"
              type="url"
              hint="Create in your Discord server: Server Settings → Integrations → Webhooks → New Webhook."
            />
          </div>
          <MaskedField
            label="Telegram Bot Token"
            value={form.telegram_bot_token}
            onChange={set("telegram_bot_token")}
            placeholder="xxxxxxxxxx:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            hint="Create a bot via @BotFather on Telegram. Token format: 1234567890:ABCdef..."
          />
          <MaskedField
            label="Telegram Chat ID"
            value={form.telegram_chat_id}
            onChange={set("telegram_chat_id")}
            placeholder="-1001234567890"
            type="text"
            hint="Target group or channel ID. Use @userinfobot or forward a message to get the chat ID."
          />
        </div>
      </Section>

      {/* ── Alerts row with chat widget ── */}
      <Section
        icon={<MessageSquare className="w-4 h-4" />}
        title="Community & Support Widgets"
        description="Embed live chat or community widgets directly into the exchange UI."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
        defaultOpen={false}
        configuredCount={countSet("intercom_app_id")}
        totalCount={1}
      >
        <div className="p-3 bg-secondary/40 border border-border rounded-xl text-xs text-muted-foreground space-y-2">
          <p>Currently supported chat providers:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><span className="text-foreground font-medium">Intercom</span> — set the App ID in the Analytics section above</li>
            <li><span className="text-foreground font-medium">Crisp, Tidio, Drift</span> — coming soon (request via admin feedback)</li>
          </ul>
        </div>
      </Section>

      {/* Bottom save bar */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground flex-1">
          All settings are stored securely in the database. Changes apply immediately without redeployment.
        </p>
        <SaveBtn />
      </div>
    </div>
  );
}
