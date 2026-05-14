import { adminFetch } from "@/lib/adminFetch";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CheckCircle2, Circle, ChevronRight, Wallet, BarChart3,
  Cpu, Zap, Globe, Shield, Settings, Users, ArrowRightLeft,
  DollarSign, Megaphone, Palette, ToggleLeft, Bot, Activity,
  Key, ShieldCheck, Rocket, AlertTriangle, ChevronDown,
  Save, Eye, EyeOff, ExternalLink, Mail, Lock, BellRing,
  Layers, RefreshCw, Check, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const fetchIntegrations = () =>
  adminFetch(`/api/admin/integrations`).then(r => r.json()).catch(() => ({}));

const fetchSiteSettings = () =>
  adminFetch(`/api/admin/site-settings`).then(r => r.json()).catch(() => ({}));

function useApiField(
  key: string,
  integrations: Record<string, string>,
  siteSettings: Record<string, string>,
  checkIn: "integrations" | "site"
) {
  const val = checkIn === "integrations" ? integrations[key] : siteSettings[key];
  return val?.trim() ?? "";
}

// ─── STEP DEFINITIONS ─────────────────────────────────────────────────────────

type Priority = "required" | "recommended" | "optional";

interface Step {
  id: string;
  step: number;
  label: string;
  title: string;
  description: string;
  href: string;
  icon: any;
  priority: Priority;
  checkIntegrations?: string[];
  checkSite?: string[];
}

const STEPS: Step[] = [
  {
    id: "reown",        step: 1,  label: "A",
    title: "Wallet Connect — Reown Project ID",
    description: "Enable EVM wallet connections (MetaMask, WalletConnect, Coinbase) for all users. Without this no wallet can connect.",
    href: "/admin/integrations", icon: Wallet, priority: "required",
    checkIntegrations: ["reown_project_id"],
  },
  {
    id: "site",         step: 2,  label: "B",
    title: "Site Settings — Name, Domain & Emails",
    description: "Set platform name, domain, contact email, legal email, and privacy email. Used in browser title, SEO, and all outbound emails.",
    href: "/admin/site", icon: Globe, priority: "required",
    checkSite: ["site_name", "contact_email"],
  },
  {
    id: "price-apis",   step: 3,  label: "C",
    title: "Price Data — Sovereign Engine",
    description: "OrahDEX uses its own price engine (Binance public feed + WhatsOnChain + own order books). No API key required.",
    href: "/admin/integrations", icon: BarChart3, priority: "recommended",
    checkIntegrations: ["dexscreener_api_key", "geckoterm_api_key"],
  },
  {
    id: "fees",         step: 4,  label: "D",
    title: "Trading Fees",
    description: "Set maker/taker fees and withdrawal fees. Default: 0.1% maker / 0.1% taker.",
    href: "/admin/fees", icon: DollarSign, priority: "recommended",
    checkSite: ["maker_fee", "taker_fee"],
  },
  {
    id: "fee-wallet",   step: 5,  label: "E",
    title: "Fee Collection Wallet",
    description: "The BSV address that receives all platform fees (trading, withdrawal, spread).",
    href: "/admin/fee-wallet", icon: Wallet, priority: "recommended",
    checkSite: ["fee_collection_wallet"],
  },
  {
    id: "security",     step: 6,  label: "F",
    title: "Security Settings",
    description: "Enable 2FA enforcement, IP whitelist for admin access, withdrawal cooling periods, and anti-bot reCAPTCHA.",
    href: "/admin/security", icon: Shield, priority: "recommended",
    checkSite: ["admin_ip_whitelist"],
  },
  {
    id: "kyc",          step: 7,  label: "G",
    title: "KYC / AML Provider",
    description: "Connect Sumsub or Onfido for automated identity verification. Required for regulated regions.",
    href: "/admin/integrations", icon: ShieldCheck, priority: "recommended",
    checkIntegrations: ["sumsub_api_key"],
  },
  {
    id: "letsexchange",  step: 8, label: "H",
    title: "Bridge — LetsExchange API Key",
    description: "Powers the Bridge tab (cross-chain swaps). Users can exchange 340+ coins without holding the target asset. Add your LetsExchange API key in Integrations.",
    href: "/admin/integrations", icon: Link2, priority: "recommended",
    checkIntegrations: ["letsexchange_api_key"],
  },
  {
    id: "bsv-node",     step: 10, label: "J",
    title: "BSV Node / RPC Endpoint",
    description: "Dedicated BSV RPC endpoint for on-chain settlement and HTLC execution. Default WhatsOnChain is rate-limited.",
    href: "/admin/integrations", icon: Cpu, priority: "optional",
    checkIntegrations: ["whatsonchain_api_key"],
  },
  {
    id: "dexscreener",  step: 11, label: "K",
    title: "DexScreener & GeckoTerminal",
    description: "On-chain DEX pair data for Base, Ethereum, and BNB markets.",
    href: "/admin/integrations", icon: BarChart3, priority: "optional",
    checkIntegrations: ["dexscreener_api_key"],
  },
  {
    id: "themes",       step: 12, label: "L",
    title: "Themes & Branding",
    description: "Set platform colour scheme (dark/light/AMOLED), accent colours, and typography.",
    href: "/admin/themes", icon: Palette, priority: "optional",
  },
  {
    id: "notifications",step: 13, label: "M",
    title: "Notifications — Discord & Telegram",
    description: "Real-time alerts for large trades, liquidations, new users, and security events.",
    href: "/admin/integrations", icon: BellRing, priority: "optional",
    checkIntegrations: ["discord_webhook_url", "telegram_bot_token"],
  },
  {
    id: "announcements",step: 14, label: "N",
    title: "Platform Announcements",
    description: "Banner announcements for maintenance, new features, or important trading alerts.",
    href: "/admin/announcements", icon: Megaphone, priority: "optional",
  },
  {
    id: "features",     step: 15, label: "O",
    title: "Feature Flags",
    description: "Enable/disable P2P, futures, bridge, coin voting, fiat on-ramp — without code changes.",
    href: "/admin/features", icon: ToggleLeft, priority: "optional",
  },
  {
    id: "api-keys",     step: 16, label: "P",
    title: "Platform API Keys",
    description: "Generate API keys for bots, market makers, and third-party integrations.",
    href: "/admin/api", icon: Key, priority: "optional",
  },
  {
    id: "contracts",    step: 17, label: "Q",
    title: "Smart Contracts & Coins",
    description: "Register EVM smart contract addresses for AMM pools, HTLC bridge, and token listings.",
    href: "/admin/contracts", icon: Layers, priority: "optional",
  },
  {
    id: "analytics",    step: 18, label: "R",
    title: "Analytics & Tracking",
    description: "Connect Google Analytics GA4, Mixpanel, Hotjar, and Facebook Pixel.",
    href: "/admin/integrations", icon: Activity, priority: "optional",
    checkIntegrations: ["google_analytics_id"],
  },
  {
    id: "bot-profit",   step: 19, label: "S",
    title: "Bot Profit Config",
    description: "Configure the internal liquidity bot and spread profit settings.",
    href: "/admin/bot-profit", icon: Bot, priority: "optional",
  },
  {
    id: "trade-pairs",  step: 20, label: "T",
    title: "Trade Pairs",
    description: "Activate/deactivate spot and futures pairs, set minimum sizes.",
    href: "/admin/pairs", icon: ArrowRightLeft, priority: "optional",
  },
  {
    id: "admins",       step: 21, label: "U",
    title: "Additional Admin Users",
    description: "Create extra admin accounts with appropriate roles for your ops team.",
    href: "/admin/admins", icon: ShieldCheck, priority: "optional",
  },
  {
    id: "users",        step: 22, label: "V",
    title: "User Management",
    description: "Review registered users, manage KYC status, adjust limits.",
    href: "/admin/users", icon: Users, priority: "optional",
  },
  {
    id: "transactions", step: 23, label: "W",
    title: "On-Chain Transactions",
    description: "Monitor BSV settlement transactions and cross-chain bridge activity.",
    href: "/admin/transactions", icon: Activity, priority: "optional",
  },
];

const PRIORITY_STYLE: Record<Priority, { label: string; color: string }> = {
  required:    { label: "Required",    color: "bg-red-400/10 text-red-400 border-red-400/20" },
  recommended: { label: "Recommended", color: "bg-amber-400/10 text-amber-400 border-amber-400/20" },
  optional:    { label: "Optional",    color: "bg-secondary text-muted-foreground border-border" },
};

// ─── INLINE CONFIG FORMS ──────────────────────────────────────────────────────

function ApiKeyField({
  label, fieldKey, value, onChange, type = "text", placeholder, description, secret = true,
}: {
  label: string; fieldKey: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; description?: string; secret?: boolean;
}) {
  const [show, setShow] = useState(false);
  const inputType = secret ? (show ? "text" : "password") : type;
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{label}</label>
      {description && <p className="text-[10px] text-muted-foreground/70">{description}</p>}
      <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2.5 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary/50 transition-all">
        <input
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none font-mono"
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
        {value && <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />}
      </div>
    </div>
  );
}

function InlineForm({ children, onSave, loading }: { children: React.ReactNode; onSave: () => void; loading: boolean }) {
  return (
    <div className="mt-4 p-4 bg-background/60 border border-border/60 rounded-2xl space-y-3">
      {children}
      <button
        onClick={onSave}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-60 shadow-lg shadow-primary/20 mt-1"
      >
        {loading
          ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
          : <><Save className="w-3.5 h-3.5" />Save Configuration</>
        }
      </button>
    </div>
  );
}

// ─── STEP CARD ────────────────────────────────────────────────────────────────

function StepCard({
  step, integrations, siteSettings, onRefresh,
}: {
  step: Step;
  integrations: Record<string, string>;
  siteSettings: Record<string, string>;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const intKeys  = step.checkIntegrations ?? [];
  const siteKeys = step.checkSite ?? [];
  const allKeys  = [...intKeys, ...siteKeys];

  const isDone = allKeys.length === 0
    ? false
    : allKeys.every(k => {
        const v = intKeys.includes(k) ? integrations[k] : siteSettings[k];
        return v?.trim().length > 0;
      });

  const configuredCount = [
    ...intKeys.filter(k => integrations[k]?.trim()),
    ...siteKeys.filter(k => siteSettings[k]?.trim()),
  ].length;
  const hasPartial = allKeys.length > 0 && configuredCount > 0 && !isDone;

  const prio = PRIORITY_STYLE[step.priority];

  // Local draft state for form fields
  const [draft, setDraft] = useState<Record<string, string>>({});
  const setDraftKey = (k: string) => (v: string) => setDraft(d => ({ ...d, [k]: v }));
  const val = (k: string, source: "int" | "site") =>
    draft[k] ?? (source === "int" ? integrations[k] : siteSettings[k]) ?? "";

  const saveIntegrations = async (keys: string[]) => {
    const current = { ...integrations };
    for (const k of keys) {
      if (draft[k] !== undefined) current[k] = draft[k];
    }
    const res = await adminFetch(`/api/admin/integrations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(current),
    });
    if (!res.ok) throw new Error("Failed to save");
  };

  const saveSiteSettings = async (keys: string[]) => {
    const updates: Record<string, string> = {};
    for (const k of keys) {
      if (draft[k] !== undefined) updates[k] = draft[k];
    }
    const res = await adminFetch(`/api/admin/site-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to save");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (intKeys.length)  await saveIntegrations(intKeys);
      if (siteKeys.length) await saveSiteSettings(siteKeys);
      toast({ title: `Step ${step.label} saved`, description: `${step.title} configured` });
      setDraft({});
      onRefresh();
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Render the inline form for each step
  const renderForm = () => {
    switch (step.id) {
      case "reown":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField
              label="Reown / WalletConnect Project ID"
              fieldKey="reown_project_id"
              value={val("reown_project_id", "int")}
              onChange={setDraftKey("reown_project_id")}
              placeholder="Your Reown project ID from cloud.reown.com"
              description="Get your free Project ID at cloud.reown.com → New Project"
              secret={false}
            />
          </InlineForm>
        );
      case "site":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField label="Platform Name" fieldKey="site_name" value={val("site_name", "site")}
              onChange={setDraftKey("site_name")} placeholder="OrahDEX" secret={false} />
            <ApiKeyField label="Platform Domain" fieldKey="site_domain" value={val("site_domain", "site")}
              onChange={setDraftKey("site_domain")} placeholder="orahdex.org" secret={false} />
            <ApiKeyField label="Support Email" fieldKey="contact_email" value={val("contact_email", "site")}
              onChange={setDraftKey("contact_email")} placeholder="support@orahdex.org" secret={false} type="email" />
            <ApiKeyField label="Legal Email" fieldKey="legal_email" value={val("legal_email", "site")}
              onChange={setDraftKey("legal_email")} placeholder="legal@orahdex.org" secret={false} type="email" />
            <ApiKeyField label="Privacy Email" fieldKey="privacy_email" value={val("privacy_email", "site")}
              onChange={setDraftKey("privacy_email")} placeholder="privacy@orahdex.org" secret={false} type="email" />
            <ApiKeyField label="Company Name" fieldKey="company_name" value={val("company_name", "site")}
              onChange={setDraftKey("company_name")} placeholder="OrahDEX Ltd." secret={false} />
            <ApiKeyField label="Canonical URL" fieldKey="canonical_url" value={val("canonical_url", "site")}
              onChange={setDraftKey("canonical_url")} placeholder="https://orahdex.org" secret={false} />
          </InlineForm>
        );
      case "price-apis":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <div className="col-span-full rounded-xl bg-secondary/40 border border-border p-4 text-sm text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Sovereign Price Engine — Active</p>
              <p>OrahDEX sources all prices from its own engine: Binance public ticker + WhatsOnChain BSV rate + own order-book trades. No API key required for core price data.</p>
            </div>
            <ApiKeyField label="DexScreener API Key (optional)" fieldKey="dexscreener_api_key" value={val("dexscreener_api_key", "int")}
              onChange={setDraftKey("dexscreener_api_key")} placeholder="Leave empty for public tier" description="Enhances token discovery for Base chain and DEX pairs." />
            <ApiKeyField label="GeckoTerminal API Key (optional)" fieldKey="geckoterm_api_key" value={val("geckoterm_api_key", "int")}
              onChange={setDraftKey("geckoterm_api_key")} placeholder="Leave empty for public tier" description="Optional: 200+ network DEX pool discovery." />
          </InlineForm>
        );
      case "smtp":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField label="SMTP Host" fieldKey="smtp_host" value={val("smtp_host", "int")}
              onChange={setDraftKey("smtp_host")} placeholder="smtp.sendgrid.net" secret={false} />
            <ApiKeyField label="SMTP Port" fieldKey="smtp_port" value={val("smtp_port", "int")}
              onChange={setDraftKey("smtp_port")} placeholder="587" secret={false} />
            <ApiKeyField label="SMTP Username" fieldKey="smtp_user" value={val("smtp_user", "int")}
              onChange={setDraftKey("smtp_user")} placeholder="apikey or your email" secret={false} />
            <ApiKeyField label="SMTP Password / API Key" fieldKey="smtp_pass" value={val("smtp_pass", "int")}
              onChange={setDraftKey("smtp_pass")} placeholder="Your SMTP password or SendGrid API key" />
            <ApiKeyField label="From Address" fieldKey="smtp_from" value={val("smtp_from", "int")}
              onChange={setDraftKey("smtp_from")} placeholder="no-reply@orahdex.org" secret={false} type="email" />
          </InlineForm>
        );
      case "fees":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField label="Maker Fee (e.g. 0.001 = 0.1%)" fieldKey="maker_fee" value={val("maker_fee", "site")}
              onChange={setDraftKey("maker_fee")} placeholder="0.001" secret={false} type="number" />
            <ApiKeyField label="Taker Fee (e.g. 0.001 = 0.1%)" fieldKey="taker_fee" value={val("taker_fee", "site")}
              onChange={setDraftKey("taker_fee")} placeholder="0.001" secret={false} type="number" />
            <ApiKeyField label="Withdrawal Fee (BSV)" fieldKey="withdrawal_fee_bsv" value={val("withdrawal_fee_bsv", "site")}
              onChange={setDraftKey("withdrawal_fee_bsv")} placeholder="0.0001" secret={false} type="number" />
            <ApiKeyField label="Futures Funding Rate (8h, %)" fieldKey="funding_rate_8h" value={val("funding_rate_8h", "site")}
              onChange={setDraftKey("funding_rate_8h")} placeholder="0.01" secret={false} type="number" />
          </InlineForm>
        );
      case "fee-wallet":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField label="BSV Fee Collection Address" fieldKey="fee_collection_wallet" value={val("fee_collection_wallet", "site")}
              onChange={setDraftKey("fee_collection_wallet")} placeholder="1YourBSVAddress..."
              description="All platform fees are sent here" secret={false} />
          </InlineForm>
        );
      case "security":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField label="Admin IP Whitelist (comma-separated)" fieldKey="admin_ip_whitelist" value={val("admin_ip_whitelist", "site")}
              onChange={setDraftKey("admin_ip_whitelist")} placeholder="1.2.3.4, 5.6.7.8" secret={false}
              description="Leave empty to allow any IP (not recommended for production)" />
            <ApiKeyField label="reCAPTCHA Site Key" fieldKey="recaptcha_site_key" value={val("recaptcha_site_key", "int")}
              onChange={setDraftKey("recaptcha_site_key")} placeholder="6Le..." secret={false} />
            <ApiKeyField label="reCAPTCHA Secret Key" fieldKey="recaptcha_secret_key" value={val("recaptcha_secret_key", "int")}
              onChange={setDraftKey("recaptcha_secret_key")} placeholder="6Le..." />
            <ApiKeyField label="Withdrawal Cooling Period (minutes)" fieldKey="withdrawal_cooling_minutes" value={val("withdrawal_cooling_minutes", "site")}
              onChange={setDraftKey("withdrawal_cooling_minutes")} placeholder="30" secret={false} type="number" />
          </InlineForm>
        );
      case "kyc":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField label="Sumsub App Token" fieldKey="sumsub_api_key" value={val("sumsub_api_key", "int")}
              onChange={setDraftKey("sumsub_api_key")} placeholder="sbx:..." description="Get from app.sumsub.com → Developers" />
            <ApiKeyField label="Sumsub Secret Key" fieldKey="sumsub_secret_key" value={val("sumsub_secret_key", "int")}
              onChange={setDraftKey("sumsub_secret_key")} placeholder="Your Sumsub secret" />
            <ApiKeyField label="Onfido API Token (alternative)" fieldKey="onfido_api_token" value={val("onfido_api_token", "int")}
              onChange={setDraftKey("onfido_api_token")} placeholder="api_sandbox_..." />
          </InlineForm>
        );
      case "fiat":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField label="MoonPay API Key" fieldKey="moonpay_api_key" value={val("moonpay_api_key", "int")}
              onChange={setDraftKey("moonpay_api_key")} placeholder="pk_live_..." description="Get at moonpay.com/dashboard" />
            <ApiKeyField label="MoonPay Secret Key" fieldKey="moonpay_secret_key" value={val("moonpay_secret_key", "int")}
              onChange={setDraftKey("moonpay_secret_key")} placeholder="sk_live_..." />
            <ApiKeyField label="Transak API Key" fieldKey="transak_api_key" value={val("transak_api_key", "int")}
              onChange={setDraftKey("transak_api_key")} placeholder="Your Transak key" description="Get at transak.com" />
            <ApiKeyField label="Banxa API Key (optional)" fieldKey="banxa_api_key" value={val("banxa_api_key", "int")}
              onChange={setDraftKey("banxa_api_key")} placeholder="Your Banxa key" />
          </InlineForm>
        );
      case "bsv-node":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField label="WhatsOnChain API Key" fieldKey="whatsonchain_api_key" value={val("whatsonchain_api_key", "int")}
              onChange={setDraftKey("whatsonchain_api_key")} placeholder="mainnet_..." description="Get at whatsonchain.com/signup" />
            <ApiKeyField label="Custom BSV RPC URL (optional)" fieldKey="bsv_rpc_url" value={val("bsv_rpc_url", "int")}
              onChange={setDraftKey("bsv_rpc_url")} placeholder="https://your-bsv-node:8332" secret={false} />
            <ApiKeyField label="BSV RPC Username" fieldKey="bsv_rpc_user" value={val("bsv_rpc_user", "int")}
              onChange={setDraftKey("bsv_rpc_user")} placeholder="rpcuser" secret={false} />
            <ApiKeyField label="BSV RPC Password" fieldKey="bsv_rpc_pass" value={val("bsv_rpc_pass", "int")}
              onChange={setDraftKey("bsv_rpc_pass")} placeholder="rpcpassword" />
          </InlineForm>
        );
      case "dexscreener":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField label="DexScreener API Key" fieldKey="dexscreener_api_key" value={val("dexscreener_api_key", "int")}
              onChange={setDraftKey("dexscreener_api_key")} placeholder="Optional — public tier available" />
            <ApiKeyField label="GeckoTerminal API Key" fieldKey="geckoterminal_api_key" value={val("geckoterminal_api_key", "int")}
              onChange={setDraftKey("geckoterminal_api_key")} placeholder="Optional — public tier available" />
          </InlineForm>
        );
      case "notifications":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField label="Discord Webhook URL" fieldKey="discord_webhook_url" value={val("discord_webhook_url", "int")}
              onChange={setDraftKey("discord_webhook_url")} placeholder="https://discord.com/api/webhooks/..."
              description="Server → Edit Channel → Integrations → Webhooks" secret={false} />
            <ApiKeyField label="Telegram Bot Token" fieldKey="telegram_bot_token" value={val("telegram_bot_token", "int")}
              onChange={setDraftKey("telegram_bot_token")} placeholder="123456:ABC-..." description="Create via @BotFather on Telegram" />
            <ApiKeyField label="Telegram Chat ID" fieldKey="telegram_chat_id" value={val("telegram_chat_id", "int")}
              onChange={setDraftKey("telegram_chat_id")} placeholder="-1001234567890" secret={false} />
          </InlineForm>
        );
      case "analytics":
        return (
          <InlineForm onSave={handleSave} loading={saving}>
            <ApiKeyField label="Google Analytics 4 ID" fieldKey="google_analytics_id" value={val("google_analytics_id", "int")}
              onChange={setDraftKey("google_analytics_id")} placeholder="G-XXXXXXXXXX" secret={false} />
            <ApiKeyField label="Google Tag Manager ID" fieldKey="google_tag_manager_id" value={val("google_tag_manager_id", "int")}
              onChange={setDraftKey("google_tag_manager_id")} placeholder="GTM-XXXXXXX" secret={false} />
            <ApiKeyField label="Mixpanel Token" fieldKey="mixpanel_token" value={val("mixpanel_token", "int")}
              onChange={setDraftKey("mixpanel_token")} placeholder="Your Mixpanel project token" />
            <ApiKeyField label="Hotjar Site ID" fieldKey="hotjar_id" value={val("hotjar_id", "int")}
              onChange={setDraftKey("hotjar_id")} placeholder="1234567" secret={false} />
            <ApiKeyField label="Facebook Pixel ID" fieldKey="facebook_pixel_id" value={val("facebook_pixel_id", "int")}
              onChange={setDraftKey("facebook_pixel_id")} placeholder="123456789012345" secret={false} />
            <ApiKeyField label="Intercom App ID" fieldKey="intercom_app_id" value={val("intercom_app_id", "int")}
              onChange={setDraftKey("intercom_app_id")} placeholder="abc12345" secret={false} />
          </InlineForm>
        );
      default:
        return (
          <div className="mt-3 p-3 bg-background/60 border border-border/60 rounded-xl flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Configure this step in the dedicated settings page.</p>
            <Link href={step.href}>
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 text-primary rounded-xl text-xs font-semibold hover:bg-primary/20 transition-all">
                Open Page <ExternalLink className="w-3 h-3" />
              </button>
            </Link>
          </div>
        );
    }
  };

  return (
    <div className={cn(
      "border rounded-2xl transition-all overflow-hidden",
      isDone
        ? "border-green-400/20 bg-green-400/4"
        : open
        ? "border-primary/30 bg-primary/3 shadow-lg shadow-primary/5"
        : "border-border bg-card hover:border-primary/20",
    )}>
      <button
        className="w-full flex items-start gap-4 p-4 text-left"
        onClick={() => setOpen(o => !o)}
      >
        {/* Step badge */}
        <div className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 mt-0.5 transition-all",
          isDone
            ? "bg-green-400/15 text-green-400"
            : open
            ? "bg-primary/15 text-primary"
            : "bg-secondary text-muted-foreground",
        )}>
          {isDone ? <CheckCircle2 className="w-4 h-4" /> : step.label}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm leading-snug text-foreground">{step.title}</span>
              <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border shrink-0", prio.color)}>
                {prio.label}
              </span>
              {hasPartial && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border bg-blue-400/10 text-blue-400 border-blue-400/20 shrink-0">
                  Partial
                </span>
              )}
              {isDone && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border bg-green-400/10 text-green-400 border-green-400/20 shrink-0">
                  Done ✓
                </span>
              )}
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform mt-0.5", open && "rotate-180")} />
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.description}</p>

          {/* Key indicators */}
          {allKeys.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {allKeys.map(k => {
                const v = intKeys.includes(k) ? integrations[k] : siteSettings[k];
                const set = v?.trim().length > 0;
                return (
                  <span key={k} className={cn(
                    "flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-lg border",
                    set
                      ? "bg-green-400/10 text-green-400 border-green-400/20"
                      : "bg-secondary text-muted-foreground border-border",
                  )}>
                    {set ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
                    {k.replace(/_/g, " ").slice(0, 20)}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Step icon */}
        <div className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-all",
          isDone
            ? "bg-green-400/10 text-green-400"
            : "bg-secondary/60 text-muted-foreground",
        )}>
          <step.icon className="w-4 h-4" />
        </div>
      </button>

      {/* Expandable inline form */}
      {open && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Configure inline</p>
            <Link href={step.href}>
              <button className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary font-semibold transition-colors">
                Full page <ExternalLink className="w-2.5 h-2.5" />
              </button>
            </Link>
          </div>
          {renderForm()}
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function AdminSetupGuide() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | Priority>("all");
  const [autoFilling, setAutoFilling] = useState(false);

  const { data: integrations = {}, refetch: refetchInt } = useQuery({
    queryKey: ["admin-integrations"],
    queryFn: fetchIntegrations,
  });

  const { data: siteSettings = {}, refetch: refetchSite } = useQuery({
    queryKey: ["admin-site-settings"],
    queryFn: fetchSiteSettings,
  });

  const refresh = () => {
    refetchInt();
    refetchSite();
  };

  const handleAutoFill = async () => {
    setAutoFilling(true);
    try {
      const res = await adminFetch(`/api/admin/auto-setup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Auto-setup failed");
      refresh();
      toast({
        title: "Auto-fill complete!",
        description: `${data.applied?.length ?? 0} settings filled. Email test account created — check Integrations → Email for credentials.`,
      });
    } catch (e: any) {
      toast({ title: "Auto-fill failed", description: e.message, variant: "destructive" });
    } finally {
      setAutoFilling(false);
    }
  };

  const isStepDone = (s: Step) => {
    const iKeys = s.checkIntegrations ?? [];
    const sKeys = s.checkSite ?? [];
    const all = [...iKeys, ...sKeys];
    if (!all.length) return false;
    return all.every(k => {
      const v = iKeys.includes(k) ? integrations[k] : siteSettings[k];
      return v?.trim().length > 0;
    });
  };

  const required    = STEPS.filter(s => s.priority === "required");
  const recommended = STEPS.filter(s => s.priority === "recommended");
  const optional    = STEPS.filter(s => s.priority === "optional");

  const requiredDone    = required.filter(isStepDone).length;
  const recommendedDone = recommended.filter(isStepDone).length;
  const checkable       = STEPS.filter(s => (s.checkIntegrations?.length ?? 0) + (s.checkSite?.length ?? 0) > 0);
  const totalDone       = checkable.filter(isStepDone).length;
  const completionPct   = checkable.length ? Math.round((totalDone / checkable.length) * 100) : 0;

  const filteredSteps = STEPS.filter(s => filter === "all" || s.priority === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Rocket className="w-5 h-5 text-primary" />
            Platform Setup — A to Z
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure everything inline — click any step to expand its form and save without leaving this page.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleAutoFill}
            disabled={autoFilling}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-60 shadow-lg shadow-primary/20"
          >
            {autoFilling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {autoFilling ? "Setting up…" : "Auto Fill All"}
          </button>
          <button
            onClick={refresh}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
            title="Refresh status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Auto-fill banner */}
      <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl">
        <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">New here? Click "Auto Fill All" to set everything up instantly</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fills platform name, emails, fees, BSV node, and creates a free working email account automatically. You can customise any field afterwards.
          </p>
        </div>
        <button
          onClick={handleAutoFill}
          disabled={autoFilling}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 transition-all disabled:opacity-60 shrink-0"
        >
          {autoFilling ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          {autoFilling ? "Working…" : "Auto Fill All"}
        </button>
      </div>

      {/* Progress card */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Overall Setup Progress</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalDone} of {checkable.length} checkable steps complete
            </p>
          </div>
          <span className={cn(
            "text-3xl font-black",
            completionPct === 100 ? "text-green-400" : completionPct >= 50 ? "text-amber-400" : "text-primary"
          )}>
            {completionPct}%
          </span>
        </div>

        <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              completionPct === 100 ? "bg-green-400" : "bg-gradient-to-r from-primary to-green-400"
            )}
            style={{ width: `${completionPct}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className={cn(
            "p-3 rounded-xl border text-center",
            requiredDone === required.length ? "bg-green-400/8 border-green-400/20" : "bg-red-400/5 border-red-400/20"
          )}>
            <p className="text-xl font-black">{requiredDone}/{required.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Required</p>
          </div>
          <div className={cn(
            "p-3 rounded-xl border text-center",
            recommendedDone === recommended.length ? "bg-green-400/8 border-green-400/20" : "bg-amber-400/5 border-amber-400/20"
          )}>
            <p className="text-xl font-black">{recommendedDone}/{recommended.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Recommended</p>
          </div>
          <div className="p-3 rounded-xl border border-border text-center">
            <p className="text-xl font-black">{optional.filter(isStepDone).length}/{optional.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Optional</p>
          </div>
        </div>

        {requiredDone < required.length && (
          <div className="flex items-start gap-2.5 p-3 bg-red-400/5 border border-red-400/20 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">
              <span className="font-bold">{required.length - requiredDone} required step{required.length - requiredDone !== 1 ? "s" : ""} incomplete.</span>{" "}
              Click any Required step below to configure it right here.
            </p>
          </div>
        )}
        {requiredDone === required.length && recommendedDone === recommended.length && (
          <div className="flex items-center gap-2.5 p-3 bg-green-400/5 border border-green-400/20 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <p className="text-xs text-green-400 font-semibold">
              All required and recommended steps complete — your exchange is ready to launch!
            </p>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "required", "recommended", "optional"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
              filter === f
                ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30",
            )}
          >
            {f === "all"
              ? `All (${STEPS.length})`
              : `${f.charAt(0).toUpperCase() + f.slice(1)} (${STEPS.filter(s => s.priority === f).length})`
            }
          </button>
        ))}
      </div>

      {/* Steps */}
      <div className="space-y-2.5">
        {filteredSteps.map(step => (
          <StepCard
            key={step.id}
            step={step}
            integrations={integrations}
            siteSettings={siteSettings}
            onRefresh={refresh}
          />
        ))}
      </div>

      {/* Quick links */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" />
          Quick Access — All Admin Pages
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {[
            { href: "/admin",               label: "Dashboard",      icon: BarChart3 },
            { href: "/admin/site",          label: "Site Settings",  icon: Globe },
            { href: "/admin/integrations",  label: "Integrations",   icon: Settings },
            { href: "/admin/pairs",         label: "Trade Pairs",    icon: ArrowRightLeft },
            { href: "/admin/fees",          label: "Fees",           icon: DollarSign },
            { href: "/admin/fee-wallet",    label: "Fee Wallet",     icon: Wallet },
            { href: "/admin/security",      label: "Security",       icon: Shield },
            { href: "/admin/features",      label: "Feature Flags",  icon: ToggleLeft },
            { href: "/admin/themes",        label: "Themes",         icon: Palette },
            { href: "/admin/announcements", label: "Announcements",  icon: Megaphone },
            { href: "/admin/api",           label: "API Keys",       icon: Key },
            { href: "/admin/contracts",     label: "Contracts",      icon: Cpu },
            { href: "/admin/admins",        label: "Admins",         icon: ShieldCheck },
            { href: "/admin/users",         label: "Users",          icon: Users },
            { href: "/admin/bot-profit",    label: "Bot Profit",     icon: Bot },
            { href: "/admin/transactions",  label: "Transactions",   icon: Activity },
            { href: "/admin/mail",          label: "Email Inbox",    icon: Mail },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group">
                <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground truncate">{label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
