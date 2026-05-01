import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, RefreshCw, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const FEATURE_PREFIX = "feature_";

const fetchSiteSettings = (): Promise<Record<string, string>> =>
  fetch(`${BASE}/api/admin/site-settings`).then(r => r.json()).catch(() => ({}));

interface Flag { id: string; label: string; description: string; enabled?: boolean; beta?: boolean; danger?: boolean; }
interface Group { title: string; icon: string; flags: Flag[]; }

const DEFAULT_FLAGS: Record<string, boolean> = {
  spot_trading: true, futures_trading: true, p2p_trading: true, margin_trading: false,
  options_trading: false, copy_trading: true, amm_pools: true, dex_hub: true,
  yield_farming: false, staking: false, lending: false, borrowing: false, nft_trading: false,
  fiat_onramp: true, fiat_offramp: false, moonpay: true, transak: false, ramp_network: false,
  kyc_required_withdraw: true, kyc_required_spot: false, kyc_required_futures: true, kyc_required_p2p: true,
  kyc_level1: true, kyc_level2: true, kyc_level3: false,
  referral_program: true, affiliate_program: false, vip_tiers: true, airdrop_manager: false,
  launchpad: false, ido_platform: false,
  api_access: true, websocket_streaming: true, advanced_charts: true, tradingview: true,
  advanced_order_types: true, oco_orders: true, iceberg_orders: false, twap_orders: false,
  email_notifications: true, sms_notifications: false, push_notifications: false,
  telegram_bot: false, discord_bot: false,
  native_chat: true, global_chat_channel: true, pair_chat_channel: true, ai_chat_moderation: true, system_announcements: true,
  mobile_app_links: true, qr_code_login: false,
  leaderboard: false, trading_competitions: false,
  maintenance_mode: false,
  cross_chain_bridge: true, bsv_settlement: true,
  mobile_bridge_tab: true, pair_logos_in_header: true,
  portfolio_page: true, market_hub: true,
  deposit_page: true, withdraw_page: true,
  public_api: true, private_api: true,
};

const GROUPS: Group[] = [
  {
    title: "Trading Products", icon: "📈",
    flags: [
      { id: "spot_trading",     label: "Spot Trading",          description: "Enable the spot trading page and order book" },
      { id: "futures_trading",  label: "Futures / Perpetuals",  description: "Enable leveraged futures trading with funding rates" },
      { id: "margin_trading",   label: "Margin Trading",        description: "Enable margin borrowing for spot positions", beta: true },
      { id: "options_trading",  label: "Options Trading",       description: "Enable options contracts (calls/puts)", beta: true },
      { id: "p2p_trading",      label: "P2P Marketplace",       description: "Enable peer-to-peer fiat/crypto trading" },
      { id: "copy_trading",     label: "Copy Trading (CopyVault)", description: "On-chain copy trading — followers mirror leader trades proportionally via BSV OP_RETURN proofs" },
      { id: "amm_pools",        label: "AMM Liquidity Pools",   description: "Enable automated market maker pools" },
      { id: "dex_hub",          label: "DEX Hub",               description: "Show the DEX/DeFi hub page" },
      { id: "advanced_order_types", label: "Advanced Orders",   description: "Enable Stop-Limit, Take-Profit, Stop-Market" },
      { id: "oco_orders",       label: "OCO Orders",            description: "One-Cancels-Other order type" },
      { id: "iceberg_orders",   label: "Iceberg Orders",        description: "Hidden/iceberg order size", beta: true },
      { id: "twap_orders",      label: "TWAP Orders",           description: "Time-weighted average price execution", beta: true },
    ],
  },
  {
    title: "DeFi & Earn", icon: "🏦",
    flags: [
      { id: "yield_farming",    label: "Yield Farming",         description: "LP token staking for additional rewards", beta: true },
      { id: "staking",          label: "OrahToken Staking",     description: "Stake ORAH tokens for fee discounts and rewards", beta: true },
      { id: "lending",          label: "Lending Protocol",      description: "Deposit assets to earn lending interest", beta: true },
      { id: "borrowing",        label: "Borrowing Protocol",    description: "Borrow against collateral", beta: true },
      { id: "nft_trading",      label: "NFT Trading",           description: "NFT marketplace integration", beta: true },
      { id: "launchpad",        label: "Token Launchpad",       description: "IEO/IDO token launch platform", beta: true },
      { id: "ido_platform",     label: "IDO Platform",          description: "Decentralized token offerings", beta: true },
    ],
  },
  {
    title: "Fiat & On-Ramps", icon: "💳",
    flags: [
      { id: "fiat_onramp",      label: "Fiat On-Ramp",          description: "Enable buying crypto with fiat currency" },
      { id: "fiat_offramp",     label: "Fiat Off-Ramp",         description: "Enable selling crypto to bank account" },
      { id: "moonpay",          label: "MoonPay Integration",   description: "Use MoonPay as the fiat on-ramp provider" },
      { id: "transak",          label: "Transak Integration",   description: "Use Transak as an alternative fiat on-ramp", beta: true },
      { id: "ramp_network",     label: "Ramp Network",          description: "Ramp.Network fiat gateway", beta: true },
    ],
  },
  {
    title: "KYC & Compliance", icon: "🪪",
    flags: [
      { id: "kyc_required_withdraw", label: "KYC for Withdrawal",    description: "Require KYC verification before any withdrawal" },
      { id: "kyc_required_spot",     label: "KYC for Spot Trading",  description: "Require KYC before opening spot orders" },
      { id: "kyc_required_futures",  label: "KYC for Futures",       description: "Require KYC before accessing leverage products" },
      { id: "kyc_required_p2p",      label: "KYC for P2P",           description: "Require KYC before P2P marketplace access" },
      { id: "kyc_level1",            label: "KYC Level 1 (ID)",      description: "Government ID verification tier" },
      { id: "kyc_level2",            label: "KYC Level 2 (Address)", description: "Proof of address verification tier" },
      { id: "kyc_level3",            label: "KYC Level 3 (Enhanced)","description": "Video verification for high-limit accounts", beta: true },
    ],
  },
  {
    title: "Growth & Rewards", icon: "🎁",
    flags: [
      { id: "referral_program",    label: "Referral Program",     description: "Users earn commission for referring new traders" },
      { id: "affiliate_program",   label: "Affiliate Program",    description: "Tiered affiliate commission structure", beta: true },
      { id: "vip_tiers",           label: "VIP Tiers",            description: "Volume-based VIP levels with fee discounts" },
      { id: "airdrop_manager",     label: "Airdrop Manager",      description: "Admin tool to distribute token airdrops", beta: true },
      { id: "leaderboard",         label: "Trading Leaderboard",  description: "Public ranking of top traders by PnL", beta: true },
      { id: "trading_competitions","label": "Trading Competitions","description": "Time-limited trading competitions with prizes", beta: true },
    ],
  },
  {
    title: "Tech & Infrastructure", icon: "⚙️",
    flags: [
      { id: "api_access",          label: "Public API Access",     description: "Allow third-party applications to use the REST API" },
      { id: "private_api",         label: "Private API (Auth)",    description: "Enable authenticated trading API for bots" },
      { id: "websocket_streaming", label: "WebSocket Streaming",   description: "Real-time price and order updates via WebSocket" },
      { id: "advanced_charts",     label: "Advanced Charts",       description: "Enable the full TradingView chart widget" },
      { id: "tradingview",         label: "TradingView Integration","description": "Use TradingView as the charting library" },
      { id: "public_api",          label: "Public REST API",       description: "Public endpoints for market data (no auth)" },
      { id: "cross_chain_bridge",  label: "Cross-Chain Bridge",    description: "Enable cross-chain asset bridge via BSV settlement" },
      { id: "bsv_settlement",      label: "BSV Settlement Layer",  description: "Core BSV on-chain settlement (critical — disable with caution)", danger: true },
    ],
  },
  {
    title: "Notifications & Comms", icon: "📣",
    flags: [
      { id: "email_notifications",  label: "Email Notifications",   description: "Send transactional emails (trades, withdrawals, login)" },
      { id: "sms_notifications",    label: "SMS Notifications",     description: "Send SMS alerts for security and large transactions" },
      { id: "push_notifications",   label: "Push Notifications",    description: "Browser push notifications for price alerts" },
      { id: "telegram_bot",         label: "Telegram Bot Alerts",   description: "Alert users via Telegram bot", beta: true },
      { id: "discord_bot",          label: "Discord Bot Alerts",    description: "Post trade alerts to Discord channels", beta: true },
      { id: "native_chat",          label: "Native OrahDEX Chat",   description: "Enable the built-in multi-channel chat system (Global, Pair, Support, Ora AI)" },
      { id: "global_chat_channel",  label: "Global Chat Channel",   description: "Show the Global channel in the chat widget — open to all connected wallets" },
      { id: "pair_chat_channel",    label: "Pair Chat Channels",    description: "Create per-pair chat channels auto-detected from the trading URL (e.g. #BTC-USDT)" },
      { id: "ai_chat_moderation",   label: "AI Moderation",         description: "Block phishing patterns, PII, scam links and seed-phrase leaks before messages are stored" },
      { id: "system_announcements", label: "System Announcements",  description: "Allow admins to post platform-wide announcements to the System channel via POST /api/chat/system" },
    ],
  },
  {
    title: "UI & Pages", icon: "🖼",
    flags: [
      { id: "portfolio_page",      label: "Portfolio Page",        description: "Show the Portfolio tab in navigation" },
      { id: "market_hub",          label: "Market Hub Page",       description: "Show the Market Hub section" },
      { id: "deposit_page",        label: "Deposit Feature",       description: "Allow users to access deposit flows" },
      { id: "withdraw_page",       label: "Withdraw Feature",      description: "Allow users to access withdrawal flows" },
      { id: "mobile_app_links",    label: "Mobile App Links",      description: "Show App Store / Google Play download links" },
      { id: "qr_code_login",       label: "QR Code Login",         description: "Enable mobile QR code login", beta: true },
      { id: "mobile_bridge_tab",   label: "Mobile Bridge Tab",     description: "Show the Bridge tab in the mobile bottom navigation bar (7-tab layout)" },
      { id: "pair_logos_in_header",label: "Pair Logos in Header",  description: "Show overlapping base/quote coin logos next to the trading pair name in the spot header" },
    ],
  },
  {
    title: "System", icon: "🔧",
    flags: [
      { id: "maintenance_mode", label: "Maintenance Mode", description: "Take the exchange offline and show a maintenance page", danger: true },
    ],
  },
];

export function AdminFeatureFlags() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: siteSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["admin-site-settings"],
    queryFn: fetchSiteSettings,
  });

  const [flags, setFlags] = useState<Record<string, boolean>>(DEFAULT_FLAGS);
  const [maintenanceMsg, setMaintenanceMsg] = useState("OrahDEX is currently undergoing scheduled maintenance. We'll be back shortly.");

  // Sync flags from DB once loaded
  useEffect(() => {
    if (!siteSettings) return;
    const dbFlags: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(siteSettings)) {
      if (k.startsWith(FEATURE_PREFIX)) {
        dbFlags[k.slice(FEATURE_PREFIX.length)] = v === "true";
      }
    }
    if (siteSettings["maintenance_message"]) {
      setMaintenanceMsg(siteSettings["maintenance_message"]);
    }
    setFlags(f => ({ ...DEFAULT_FLAGS, ...f, ...dbFlags }));
  }, [siteSettings]);

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await fetch(`${BASE}/api/admin/site-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-site-settings"] });
      toast({ title: "Feature flags saved", description: `${Object.values(flags).filter(Boolean).length} features enabled — persisted to database.` });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not persist flags. Check API connectivity.", variant: "destructive" });
    },
  });

  const toggle = (id: string) => setFlags(f => ({ ...f, [id]: !f[id] }));

  const save = () => {
    const payload: Record<string, string> = { maintenance_message: maintenanceMsg };
    for (const [k, v] of Object.entries(flags)) {
      payload[`${FEATURE_PREFIX}${k}`] = String(v);
    }
    mutation.mutate(payload);
  };

  const saving = mutation.isPending;

  const enabledCount = Object.values(flags).filter(Boolean).length;
  const totalCount = Object.keys(DEFAULT_FLAGS).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Feature Flags</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {settingsLoading ? "Loading from database…" : `${enabledCount}/${totalCount} features enabled`}
            {" · "}
            <span className="text-green-400/80">Saved to database — shared across all sessions</span>
          </p>
        </div>
        <button onClick={save} disabled={saving || settingsLoading} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50">
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save Flags"}
        </button>
      </div>

      {flags.maintenance_mode && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-red-400">Maintenance Mode is ACTIVE — the exchange is offline for users</span>
          </div>
          <input
            type="text"
            value={maintenanceMsg}
            onChange={e => setMaintenanceMsg(e.target.value)}
            placeholder="Maintenance message shown to users"
            className="w-full bg-background border border-red-500/30 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
      )}

      <div className="space-y-4">
        {GROUPS.map(group => (
          <div key={group.title} className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-secondary/20 flex items-center gap-2">
              <span className="text-base">{group.icon}</span>
              <h3 className="text-sm font-bold text-foreground">{group.title}</h3>
              <span className="ml-auto text-xs text-muted-foreground">
                {group.flags.filter(f => flags[f.id]).length}/{group.flags.length} enabled
              </span>
            </div>
            <div className="divide-y divide-border">
              {group.flags.map(flag => {
                const enabled = flags[flag.id] ?? false;
                return (
                  <div key={flag.id} className={cn("flex items-center gap-4 pl-5 pr-6 py-3.5 transition-colors", enabled ? "" : "opacity-60")}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{flag.label}</span>
                        {flag.beta && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/25">BETA</span>
                        )}
                        {flag.danger && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/25">CRITICAL</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{flag.description}</p>
                    </div>
                    <button
                      onClick={() => toggle(flag.id)}
                      aria-checked={enabled}
                      role="switch"
                      className={cn(
                        "relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        enabled
                          ? flag.danger ? "bg-red-500" : "bg-primary"
                          : "bg-muted/50 border border-border"
                      )}
                    >
                      <span className={cn(
                        "absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-md transition-transform duration-200",
                        enabled ? "translate-x-6" : "translate-x-0"
                      )} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
