import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CheckCircle2, Circle, ChevronRight, Wallet, BarChart3,
  Cpu, Zap, Globe, Shield, Settings, Users, ArrowRightLeft,
  DollarSign, Megaphone, Palette, ToggleLeft, Bot, Activity,
  Key, ShieldCheck, Rocket, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const fetchIntegrations = () =>
  fetch(`${BASE}/api/admin/integrations`).then(r => r.json()).catch(() => ({}));

const fetchSiteSettings = () =>
  fetch(`${BASE}/api/admin/site-settings`).then(r => r.json()).catch(() => ({}));

interface SetupStep {
  id: string;
  step: number;
  title: string;
  description: string;
  href: string;
  icon: any;
  priority: "required" | "recommended" | "optional";
  checkKeys?: string[];
  checkSiteKeys?: string[];
}

const STEPS: SetupStep[] = [
  {
    id: "wallet-connect",
    step: 1,
    title: "Connect Wallet (Reown Project ID)",
    description: "Add your Reown Project ID to enable EVM wallet connections (MetaMask, WalletConnect, Coinbase, etc.) for all users. Without this, no EVM wallet can connect.",
    href: "/admin/integrations",
    icon: Wallet,
    priority: "required",
    checkKeys: ["reown_project_id"],
  },
  {
    id: "site-settings",
    step: 2,
    title: "Configure Site Settings",
    description: "Set your platform name, domain, logo, and contact information. This appears in the browser tab, emails, and SEO metadata.",
    href: "/admin/site",
    icon: Globe,
    priority: "required",
    checkSiteKeys: ["site_name", "site_domain"],
  },
  {
    id: "price-apis",
    step: 3,
    title: "Add Price Data API Keys",
    description: "Configure CoinGecko, CoinMarketCap, DexScreener, and GeckoTerminal API keys for live prices across all 226 trading pairs and the Chains/Base markets.",
    href: "/admin/integrations",
    icon: BarChart3,
    priority: "recommended",
    checkKeys: ["coingecko_api_key", "cmc_api_key"],
  },
  {
    id: "trade-pairs",
    step: 4,
    title: "Set Up Trade Pairs",
    description: "Configure which spot and futures trading pairs are active, set minimum order sizes, and enable/disable individual pairs.",
    href: "/admin/pairs",
    icon: ArrowRightLeft,
    priority: "recommended",
  },
  {
    id: "fee-config",
    step: 5,
    title: "Configure Trading Fees",
    description: "Set maker/taker fees, withdrawal fees, and funding rates for perpetual futures. Default is 0.1% maker / 0.1% taker.",
    href: "/admin/fees",
    icon: DollarSign,
    priority: "recommended",
  },
  {
    id: "fee-wallet",
    step: 6,
    title: "Set Fee Collection Wallet",
    description: "Connect the wallet that will receive all platform fees (trading fees, withdrawal fees, spread profits).",
    href: "/admin/fee-wallet",
    icon: Wallet,
    priority: "recommended",
  },
  {
    id: "security",
    step: 7,
    title: "Review Security Settings",
    description: "Enable 2FA enforcement, IP whitelist for admin access, withdrawal cooling periods, and anti-bot reCAPTCHA.",
    href: "/admin/security",
    icon: Shield,
    priority: "recommended",
  },
  {
    id: "fiat-onramp",
    step: 8,
    title: "Enable Fiat On-Ramp",
    description: "Add API keys for MoonPay, Transak, Banxa, Simplex, or Ramp to let users buy crypto with their bank card.",
    href: "/admin/integrations",
    icon: Zap,
    priority: "optional",
    checkKeys: ["moonpay_api_key", "transak_api_key", "banxa_api_key"],
  },
  {
    id: "bsv-node",
    step: 9,
    title: "Configure BSV Node",
    description: "Set a dedicated BSV RPC endpoint for on-chain settlement and HTLC script execution. The default WhatsOnChain endpoint is rate-limited.",
    href: "/admin/integrations",
    icon: Cpu,
    priority: "optional",
    checkKeys: ["whatsonchain_api_key"],
  },
  {
    id: "themes",
    step: 10,
    title: "Customize Themes & Branding",
    description: "Set the platform colour scheme (dark/light/AMOLED), accent colours, and typography to match your brand.",
    href: "/admin/themes",
    icon: Palette,
    priority: "optional",
  },
  {
    id: "announcements",
    step: 11,
    title: "Add Platform Announcements",
    description: "Create banner announcements for maintenance windows, new features, or important trading alerts shown to all users.",
    href: "/admin/announcements",
    icon: Megaphone,
    priority: "optional",
  },
  {
    id: "feature-flags",
    step: 12,
    title: "Configure Feature Flags",
    description: "Enable or disable specific features — P2P trading, futures, bridge, coin voting, fiat on-ramp — without code changes.",
    href: "/admin/features",
    icon: ToggleLeft,
    priority: "optional",
  },
  {
    id: "api-keys",
    step: 13,
    title: "Generate Platform API Keys",
    description: "Create API keys for bots, market makers, and third-party integrations to connect to OrahDEX programmatically.",
    href: "/admin/api",
    icon: Key,
    priority: "optional",
  },
  {
    id: "contracts",
    step: 14,
    title: "Configure Smart Contracts",
    description: "Register EVM smart contract addresses for your AMM liquidity pools, HTLC bridge contracts, and token listings.",
    href: "/admin/contracts",
    icon: Cpu,
    priority: "optional",
  },
  {
    id: "admins",
    step: 15,
    title: "Add Admin Users",
    description: "Create additional admin accounts with appropriate access levels for your operations team.",
    href: "/admin/admins",
    icon: ShieldCheck,
    priority: "optional",
  },
  {
    id: "notifications",
    step: 16,
    title: "Set Up Notifications",
    description: "Configure Discord webhooks or Telegram bot alerts for large trades, liquidations, security events, and new user registrations.",
    href: "/admin/integrations",
    icon: Bot,
    priority: "optional",
    checkKeys: ["discord_webhook_url", "telegram_bot_token"],
  },
  {
    id: "analytics",
    step: 17,
    title: "Enable Analytics",
    description: "Connect Google Analytics (GA4) and Intercom live chat to track user behaviour and provide real-time support.",
    href: "/admin/integrations",
    icon: Activity,
    priority: "optional",
    checkKeys: ["google_analytics_id"],
  },
  {
    id: "users",
    step: 18,
    title: "Manage Users",
    description: "Review registered users, manage KYC status, adjust trading limits, and handle support tickets.",
    href: "/admin/users",
    icon: Users,
    priority: "optional",
  },
];

const PRIORITY_LABELS = {
  required:    { label: "Required",    color: "bg-red-400/10 text-red-400 border-red-400/20" },
  recommended: { label: "Recommended", color: "bg-amber-400/10 text-amber-400 border-amber-400/20" },
  optional:    { label: "Optional",    color: "bg-secondary text-muted-foreground border-border" },
};

function StepCard({
  step,
  integrations,
  siteSettings,
}: {
  step: SetupStep;
  integrations: Record<string, string>;
  siteSettings: Record<string, string>;
}) {
  const intKeys = step.checkKeys ?? [];
  const siteKeys = step.checkSiteKeys ?? [];
  const allKeys = [...intKeys, ...siteKeys];

  const configuredCount = [
    ...intKeys.filter(k => integrations[k]?.trim()),
    ...siteKeys.filter(k => siteSettings[k]?.trim()),
  ].length;

  const isDone = allKeys.length === 0
    ? false
    : configuredCount >= allKeys.length;

  const hasPartial = allKeys.length > 0 && configuredCount > 0 && !isDone;

  const prio = PRIORITY_LABELS[step.priority];

  return (
    <Link href={step.href}>
      <div className={cn(
        "group flex items-start gap-4 p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-lg hover:shadow-black/10",
        isDone
          ? "border-green-400/20 bg-green-400/5 hover:border-green-400/40"
          : "border-border bg-card hover:border-primary/30",
      )}>
        {/* Step number / check */}
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 transition-all",
          isDone
            ? "bg-green-400/15 text-green-400"
            : "bg-secondary text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
        )}>
          {isDone ? <CheckCircle2 className="w-5 h-5" /> : step.step}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm leading-snug">{step.title}</span>
              <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border shrink-0", prio.color)}>
                {prio.label}
              </span>
              {hasPartial && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border bg-blue-400/10 text-blue-400 border-blue-400/20 shrink-0">
                  Partial
                </span>
              )}
            </div>
            <div className={cn(
              "flex items-center gap-1 shrink-0 text-xs font-medium transition-all",
              isDone ? "text-green-400" : "text-muted-foreground group-hover:text-primary",
            )}>
              {isDone ? "Done" : "Configure"}
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
          {allKeys.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              {[...intKeys, ...siteKeys].map(k => {
                const val = intKeys.includes(k) ? integrations[k] : siteSettings[k];
                const set = val?.trim().length > 0;
                return (
                  <span key={k} className={cn(
                    "flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-lg border",
                    set
                      ? "bg-green-400/10 text-green-400 border-green-400/20"
                      : "bg-secondary text-muted-foreground border-border",
                  )}>
                    {set ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
                    {k.replace(/_/g, " ").replace(/api key/i, "key").slice(0, 18)}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Icon */}
        <div className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all",
          isDone
            ? "bg-green-400/10 text-green-400"
            : "bg-secondary/60 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
        )}>
          <step.icon className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}

export function AdminSetupGuide() {
  const [filter, setFilter] = useState<"all" | "required" | "recommended" | "optional">("all");

  const { data: integrations = {} } = useQuery({
    queryKey: ["admin-integrations"],
    queryFn: fetchIntegrations,
  });

  const { data: siteSettings = {} } = useQuery({
    queryKey: ["admin-site-settings"],
    queryFn: fetchSiteSettings,
  });

  const isStepDone = (s: SetupStep) => {
    const intKeys = s.checkKeys ?? [];
    const siteKeys = s.checkSiteKeys ?? [];
    const allKeys = [...intKeys, ...siteKeys];
    if (allKeys.length === 0) return false;
    return allKeys.every(k => {
      const v = intKeys.includes(k) ? integrations[k] : siteSettings[k];
      return v?.trim().length > 0;
    });
  };

  const required   = STEPS.filter(s => s.priority === "required");
  const recommended = STEPS.filter(s => s.priority === "recommended");
  const optional   = STEPS.filter(s => s.priority === "optional");

  const requiredDone    = required.filter(isStepDone).length;
  const recommendedDone = recommended.filter(isStepDone).length;
  const allWithKeys     = STEPS.filter(s => (s.checkKeys?.length ?? 0) + (s.checkSiteKeys?.length ?? 0) > 0);
  const totalDone       = allWithKeys.filter(isStepDone).length;

  const filteredSteps = STEPS.filter(s => filter === "all" || s.priority === filter);

  const completionPct = allWithKeys.length ? Math.round((totalDone / allWithKeys.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Rocket className="w-6 h-6 text-primary" />
          Platform Setup Guide — A to Z
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Everything you need to configure OrahDEX from scratch. Follow the steps in order for the fastest launch.
        </p>
      </div>

      {/* Progress summary */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Overall Setup Progress</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalDone} of {allWithKeys.length} checkable steps complete
            </p>
          </div>
          <span className="text-3xl font-black text-primary">{completionPct}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700"
            style={{ width: `${completionPct}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div className={cn(
            "p-3 rounded-xl border text-center",
            requiredDone === required.length
              ? "bg-green-400/10 border-green-400/20"
              : "bg-red-400/5 border-red-400/20",
          )}>
            <p className="text-xl font-black">{requiredDone}/{required.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Required</p>
          </div>
          <div className={cn(
            "p-3 rounded-xl border text-center",
            recommendedDone === recommended.length
              ? "bg-green-400/10 border-green-400/20"
              : "bg-amber-400/5 border-amber-400/20",
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
          <div className="flex items-start gap-2 p-3 bg-red-400/5 border border-red-400/20 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">
              <span className="font-semibold">{required.length - requiredDone} required step{required.length - requiredDone !== 1 ? "s" : ""} incomplete.</span>{" "}
              Complete required steps first — your exchange may not work correctly without them.
            </p>
          </div>
        )}

        {requiredDone === required.length && recommendedDone === recommended.length && (
          <div className="flex items-center gap-2 p-3 bg-green-400/5 border border-green-400/20 rounded-xl">
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
              "px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all capitalize",
              filter === f
                ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30",
            )}
          >
            {f === "all" ? `All Steps (${STEPS.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${STEPS.filter(s => s.priority === f).length})`}
          </button>
        ))}
      </div>

      {/* Steps list */}
      <div className="space-y-3">
        {filteredSteps.map(step => (
          <StepCard
            key={step.id}
            step={step}
            integrations={integrations}
            siteSettings={siteSettings}
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
            { href: "/admin",              label: "Dashboard",       icon: BarChart3 },
            { href: "/admin/site",         label: "Site Settings",   icon: Globe },
            { href: "/admin/integrations", label: "Integrations",    icon: Settings },
            { href: "/admin/pairs",        label: "Trade Pairs",     icon: ArrowRightLeft },
            { href: "/admin/fees",         label: "Fees",            icon: DollarSign },
            { href: "/admin/fee-wallet",   label: "Fee Wallet",      icon: Wallet },
            { href: "/admin/security",     label: "Security",        icon: Shield },
            { href: "/admin/features",     label: "Feature Flags",   icon: ToggleLeft },
            { href: "/admin/themes",       label: "Themes",          icon: Palette },
            { href: "/admin/announcements",label: "Announcements",   icon: Megaphone },
            { href: "/admin/api",          label: "API Keys",        icon: Key },
            { href: "/admin/contracts",    label: "Contracts",       icon: Cpu },
            { href: "/admin/admins",       label: "Admins",          icon: ShieldCheck },
            { href: "/admin/users",        label: "Users",           icon: Users },
            { href: "/admin/bot-profit",   label: "Bot Profit",      icon: Bot },
            { href: "/admin/transactions", label: "Transactions",    icon: Activity },
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
