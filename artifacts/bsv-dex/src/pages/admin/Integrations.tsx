import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Eye, EyeOff, Check, Save, RefreshCw,
  AlertTriangle, CheckCircle2, Cpu, Globe, Zap,
  Wallet, Bell, Shield, Mail, BarChart3, MessageSquare,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface IntegrationSettings {
  reown_project_id: string;
  coingecko_api_key: string;
  cmc_api_key: string;
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
}

const DEFAULTS: IntegrationSettings = {
  reown_project_id: "",
  coingecko_api_key: "",
  cmc_api_key: "",
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
};

const fetchIntegrations = (): Promise<IntegrationSettings> =>
  fetch(`${BASE}/api/admin/integrations`).then(r => r.json());

const saveIntegrations = (data: IntegrationSettings) =>
  fetch(`${BASE}/api/admin/integrations`, {
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
        title="Price Data APIs"
        description="Live price feeds for all trading pairs. CoinGecko and GeckoTerminal power the Markets, Chains, and token discovery screens."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
        configuredCount={countSet("coingecko_api_key", "cmc_api_key", "dexscreener_api_key", "geckoterm_api_key")}
        totalCount={4}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MaskedField
            label="CoinGecko API Key"
            value={form.coingecko_api_key}
            onChange={set("coingecko_api_key")}
            placeholder="CG-xxxxxxxxxxxxxxxxxxxx"
            hint="Free tier: no key needed (30 req/min). Demo key: 10k req/min free. Pro key: unlimited. Get at coingecko.com/en/api"
          />
          <MaskedField
            label="CoinMarketCap API Key"
            value={form.cmc_api_key}
            onChange={set("cmc_api_key")}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            hint="Free Basic tier: 10k credits/mo. Used for supplemental price + market cap data. Get at pro.coinmarketcap.com"
          />
          <MaskedField
            label="DexScreener API Key"
            value={form.dexscreener_api_key}
            onChange={set("dexscreener_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            hint="DexScreener API for DEX pair data, new pairs, and Base chain tokens. Free tier available at dexscreener.com/api"
          />
          <MaskedField
            label="GeckoTerminal API Key"
            value={form.geckoterm_api_key}
            onChange={set("geckoterm_api_key")}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            hint="GeckoTerminal for 200+ network DEX pools and trending tokens. Free public API; API key for higher limits. Get at geckoterminal.com"
          />
        </div>
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
        description="API keys for card/bank-to-crypto purchase widgets shown in the Buy Crypto flow. All providers work in sandbox mode without a key — add keys to go live."
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

      {/* ── 5. Email / SMTP ── */}
      <Section
        icon={<Mail className="w-4 h-4" />}
        title="Email / SMTP"
        description="Outbound email configuration for KYC alerts, trade confirmations, password resets, and security notifications."
        badge="Optional"
        badgeColor="bg-secondary text-muted-foreground border-border"
        defaultOpen={false}
        configuredCount={countSet("smtp_host", "smtp_user")}
        totalCount={2}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MaskedField
            label="SMTP Host"
            value={form.smtp_host}
            onChange={set("smtp_host")}
            placeholder="smtp.sendgrid.net"
            type="text"
            hint="SMTP server hostname. Works with SendGrid, Mailgun, AWS SES, Gmail, etc."
          />
          <MaskedField
            label="SMTP Port"
            value={form.smtp_port}
            onChange={set("smtp_port")}
            placeholder="587"
            type="number"
            hint="Common ports: 587 (STARTTLS), 465 (SSL), 25 (plain). Use 587 with TLS for best compatibility."
          />
          <MaskedField
            label="SMTP Username"
            value={form.smtp_user}
            onChange={set("smtp_user")}
            placeholder="apikey or your@email.com"
            type="text"
            hint="Your SMTP login. For SendGrid use 'apikey' as username."
          />
          <MaskedField
            label="SMTP Password / API Key"
            value={form.smtp_pass}
            onChange={set("smtp_pass")}
            placeholder="SG.xxxxxxxxxxxxxxxxxxxx"
            hint="SMTP password or API key. For SendGrid, this is your SG API key."
          />
          <MaskedField
            label="From Email Address"
            value={form.smtp_from}
            onChange={set("smtp_from")}
            placeholder="noreply@orahdex.io"
            type="email"
            hint="Sender address shown in all outgoing emails."
          />
        </div>
      </Section>

      {/* ── 6. Security & Anti-Spam ── */}
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
