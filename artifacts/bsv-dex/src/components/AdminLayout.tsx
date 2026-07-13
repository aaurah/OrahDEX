import { ReactNode, useState, useEffect, useRef, KeyboardEvent } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, ShieldCheck, ArrowRightLeft,
  Key, Cpu, Palette, LogOut, Menu, X, ChevronRight, Activity,
  Wallet, Bot, Globe, Home, ToggleLeft, Shield, DollarSign,
  Megaphone, ChevronDown, Layers, Copy, Check, ExternalLink, Rocket, Mail, Brain,
  HeartPulse, TrendingUp, Terminal, Headphones, Inbox, Search, ArrowDownToLine,
  Landmark, Plug2, Printer, Database, Link2, Shuffle,
  PanelLeftClose, PanelLeftOpen, Bell, Zap, Settings,
  Stethoscope, Signal, BarChart3, BookOpen, Server,
} from "lucide-react";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { useTicketReadStore } from "@/store/useTicketReadStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";
import { SupportChatToaster } from "./SupportChatToaster";

const CHAIN_NAMES: Record<number, { name: string; color: string; short: string }> = {
  1:      { name: "Ethereum",  color: "text-blue-400 bg-blue-400/10 border-blue-400/20",    short: "ETH"   },
  56:     { name: "BNB Chain", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", short: "BNB"  },
  137:    { name: "Polygon",   color: "text-violet-400 bg-violet-400/10 border-violet-400/20", short: "MATIC"},
  42161:  { name: "Arbitrum", color: "text-blue-300 bg-blue-300/10 border-blue-300/20",    short: "ARB"  },
  10:     { name: "Optimism", color: "text-red-400 bg-red-400/10 border-red-400/20",       short: "OP"   },
  8453:   { name: "Base",     color: "text-blue-400 bg-blue-400/10 border-blue-400/20",    short: "BASE" },
  43114:  { name: "Avalanche",color: "text-red-400 bg-red-400/10 border-red-400/20",       short: "AVAX" },
};

const NETWORK_STYLES: Record<string, { color: string; label: string }> = {
  bsv: { color: "text-green-400 bg-green-400/10 border-green-400/20",   label: "BSV" },
  sol: { color: "text-purple-400 bg-purple-400/10 border-purple-400/20", label: "SOL" },
  btc: { color: "text-orange-400 bg-orange-400/10 border-orange-400/20", label: "BTC" },
};

interface NavItem  { href: string; label: string; icon: any; exact?: boolean; badge?: string; badgeColor?: string; }
interface NavGroup { title: string; icon: any; color: string; items: NavItem[]; }

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview", icon: LayoutDashboard, color: "text-primary",
    items: [
      { href: "/admin",              label: "Dashboard",       icon: LayoutDashboard, exact: true },
      { href: "/admin/users",        label: "User Management", icon: Users },
      { href: "/admin/setup",        label: "Setup Guide",     icon: Rocket },
      { href: "/admin/mail",         label: "Email Inbox",     icon: Mail },
      { href: "/admin/integrations", label: "Integrations",    icon: Plug2 },
    ],
  },
  {
    title: "Customization", icon: Palette, color: "text-pink-400",
    items: [
      { href: "/admin/site",          label: "Site Settings",    icon: Globe },
      { href: "/admin/home",          label: "Homepage Builder", icon: Home },
      { href: "/admin/themes",        label: "Themes",           icon: Palette },
      { href: "/admin/announcements", label: "Announcements",    icon: Megaphone },
    ],
  },
  {
    title: "Platform", icon: Settings, color: "text-blue-400",
    items: [
      { href: "/admin/features",       label: "Feature Flags",    icon: ToggleLeft },
      { href: "/admin/pairs",          label: "Trade Pairs",      icon: ArrowRightLeft },
      { href: "/admin/trade-analytics",label: "Trade Analytics",  icon: BarChart3 },
      { href: "/admin/fees",           label: "Fee Config",       icon: DollarSign },
      { href: "/admin/contracts",      label: "Contracts & Coins",icon: Cpu },
      { href: "/admin/copy-vaults",    label: "CopyVault",        icon: Copy },
      { href: "/admin/prediction",     label: "Prediction",       icon: Zap },
      { href: "/admin/tradingview",    label: "TradingView Feed", icon: TrendingUp },
      { href: "/admin/cex-connections",label: "CEX Connections",  icon: Link2 },
    ],
  },
  {
    title: "AI Intelligence", icon: Brain, color: "text-violet-400",
    items: [
      { href: "/admin/ai",    label: "Ora AI Settings", icon: Brain },
      { href: "/admin/devai", label: "DevAI Settings",  icon: Bot },
    ],
  },
  {
    title: "Support", icon: Headphones, color: "text-cyan-400",
    items: [
      { href: "/admin/support",       label: "Support & Contact", icon: Headphones },
      { href: "/admin/support/inbox", label: "Support Inbox",     icon: Inbox },
    ],
  },
  {
    title: "System", icon: Activity, color: "text-green-400",
    items: [
      { href: "/admin/health",         label: "System Health",    icon: HeartPulse },
      { href: "/admin/diagnostics",    label: "Diagnostics",      icon: Stethoscope },
      { href: "/admin/server-control", label: "Server Control",   icon: Server, badge: "NEW", badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
      { href: "/admin/api-monitor",    label: "API Monitor",      icon: Signal },
      { href: "/admin/liquidity",      label: "Liquidity Bot",    icon: Activity },
      { href: "/admin/bsv-intents",    label: "BSV Intents",      icon: Shuffle },
      { href: "/admin/logs",           label: "System Logs",      icon: Terminal },
    ],
  },
  {
    title: "Security", icon: Shield, color: "text-amber-400",
    items: [
      { href: "/admin/security", label: "Security Settings", icon: Shield },
      { href: "/admin/api",      label: "API Settings",      icon: Key },
      { href: "/admin/admins",   label: "Admin Users",       icon: ShieldCheck },
    ],
  },
  {
    title: "Finance", icon: Landmark, color: "text-orange-400",
    items: [
      { href: "/admin/profits",      label: "All Profits",    icon: TrendingUp },
      { href: "/admin/transactions", label: "On-Chain Txns",  icon: Layers },
      { href: "/admin/ledger",       label: "Ledger Manager", icon: BookOpen },
      { href: "/admin/withdrawals",  label: "Withdrawals",    icon: ArrowDownToLine },
      { href: "/admin/treasury",     label: "Treasury",       icon: Landmark },
      { href: "/admin/mint-burn",    label: "Mint & Burn",    icon: Printer },
      { href: "/admin/fee-wallet",   label: "Fee Wallet",     icon: Wallet },
      { href: "/admin/bot-profit",   label: "Bot Profit",     icon: BarChart3 },
      { href: "/admin/arb-bot",      label: "Arb Bot",        icon: Zap },
      { href: "/admin/seeded-pool",  label: "Seeded Pool",    icon: Database },
      { href: "/admin/db-sync",      label: "DB Sync",        icon: ShieldCheck },
      { href: "/admin/le-income",    label: "Swap Income",    icon: DollarSign },
    ],
  },
];

/* ── Wallet widget ────────────────────────────────────────────────────── */
function AdminWalletWidget({ collapsed }: { collapsed: boolean }) {
  const { open: openWallet } = useWalletModalStore();
  const walletStore = useWalletStore();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayAddress = walletStore.address ?? null;
  const network        = walletStore.network;
  const chainId        = walletStore.chainId;
  const chainInfo      = network === "evm" && chainId ? CHAIN_NAMES[chainId] : null;
  const networkStyle   = network === "evm"
    ? (chainInfo ? { color: chainInfo.color, label: chainInfo.short } : { color: "text-blue-400 bg-blue-400/10 border-blue-400/20", label: "EVM" })
    : network ? NETWORK_STYLES[network] ?? { color: "text-muted-foreground bg-muted/10 border-border", label: network.toUpperCase() } : null;
  const balance        = walletStore.balance ?? null;
  const truncate       = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  if (!displayAddress) {
    return (
      <button onClick={() => openWallet()} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-all">
        <Wallet className="w-3.5 h-3.5" />
        {!collapsed && <span>Connect</span>}
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(d => !d)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border hover:border-primary/30 transition-all">
        {networkStyle && <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-md border", networkStyle.color)}>{networkStyle.label}</span>}
        {displayAddress && !collapsed && <span className="text-xs font-mono hidden sm:block">{truncate(displayAddress)}</span>}
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        {!collapsed && <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-180")} />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Connected Wallet</span>
              {networkStyle && <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-md border", networkStyle.color)}>{chainInfo?.name ?? networkStyle.label}</span>}
            </div>
            {displayAddress && (
              <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3 py-2">
                <code className="text-xs font-mono text-foreground flex-1 truncate">{displayAddress}</code>
                <button onClick={() => { navigator.clipboard.writeText(displayAddress); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-muted-foreground hover:text-green-400 transition-colors shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {network === "evm" && displayAddress && <a href={`https://etherscan.io/address/${displayAddress}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-blue-400 shrink-0"><ExternalLink className="w-3.5 h-3.5" /></a>}
              </div>
            )}
          </div>
          {balance && (
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Balance</p>
              <p className="text-sm font-mono font-bold">{balance}</p>
            </div>
          )}
          <div className="p-2 space-y-0.5">
            <button onClick={() => { setOpen(false); openWallet(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/5 transition-all">
              <Layers className="w-4 h-4 shrink-0" />
              <span>Switch Wallet</span>
            </button>
            <div className="mx-3 h-px bg-border/60" />
            <button onClick={() => { setOpen(false); walletStore.disconnect(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-red-400 rounded-xl hover:bg-red-400/5 transition-all">
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Disconnect</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main layout ────────────────────────────────────────────────────────── */
export function AdminLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { email, logout } = useAdminAuthStore();
  const { adminUnreadCount } = useTicketReadStore();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("admin_sidebar_collapsed") === "1"; } catch { return false; }
  });
  const [groupCollapsed, setGroupCollapsed] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    try { localStorage.setItem("admin_sidebar_collapsed", collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setCollapsed(false);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === "Escape") { setSearchQuery(""); setSearchOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isActive = (item: NavItem) =>
    item.exact ? location === item.href : location.startsWith(item.href);

  const toggleGroup = (title: string) =>
    setGroupCollapsed(c => ({ ...c, [title]: !c[title] }));

  const allItems = NAV_GROUPS.flatMap(g => g.items.map(item => ({ ...item, group: g.title })));
  const searchResults = searchQuery.trim()
    ? allItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.group.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const handleSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchResults.length > 0) {
      navigate(searchResults[0].href);
      setSearchQuery("");
      setSearchOpen(false);
      setMobileSidebarOpen(false);
    }
    if (e.key === "Escape") { setSearchQuery(""); setSearchOpen(false); }
  };

  const currentPage = allItems.find(isActive);
  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const sidebarW = collapsed ? "w-[68px]" : "w-[240px]";

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className={cn(
        "fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-200 shadow-2xl shadow-black/20 border-r border-border",
        "bg-gradient-to-b from-[#0e1117] via-card to-background",
        "md:relative md:translate-x-0",
        sidebarW,
        mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Brand header */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-border shrink-0 bg-gradient-to-r from-primary/8 to-transparent">
          {!collapsed ? (
            <Link href="/" className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                <span className="text-[10px] font-black text-black">O</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground leading-none">OrahDEX</p>
                <p className="text-[9px] uppercase tracking-[0.15em] font-black text-primary/80 leading-none mt-0.5">Admin</p>
              </div>
            </Link>
          ) : (
            <Link href="/admin" className="w-full flex items-center justify-center">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shadow-lg shadow-primary/20">
                <span className="text-[11px] font-black text-black">O</span>
              </div>
            </Link>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="hidden md:flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
          </button>
          {mobileSidebarOpen && (
            <button className="md:hidden text-muted-foreground p-1" onClick={() => setMobileSidebarOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-1 shrink-0 relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={handleSearchKey}
                placeholder="Search… (⌘K)"
                className="w-full bg-background/60 border border-border rounded-xl pl-8 pr-8 py-2 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 transition-colors"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setSearchOpen(false); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {searchOpen && searchQuery && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground text-center">No results for "{searchQuery}"</div>
                ) : (
                  searchResults.map(item => (
                    <Link key={item.href} href={item.href} onClick={() => { setSearchQuery(""); setSearchOpen(false); setMobileSidebarOpen(false); }}
                      className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors group">
                      <item.icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{item.group}</p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5">
          {collapsed ? (
            /* Icon-only mode */
            <div className="space-y-0.5">
              {allItems.map(item => {
                const active = isActive(item);
                const showUnread = item.href === "/admin/support/inbox" && adminUnreadCount > 0;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileSidebarOpen(false)}
                    title={item.label}
                    className={cn(
                      "relative flex items-center justify-center w-full py-2.5 rounded-lg transition-all duration-150",
                      active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                    )}>
                    <item.icon className="w-4 h-4 shrink-0" />
                    {showUnread && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
                    )}
                    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />}
                  </Link>
                );
              })}
            </div>
          ) : (
            /* Full mode with groups */
            NAV_GROUPS.map(group => {
              const isGroupCollapsed = groupCollapsed[group.title];
              const hasActive = group.items.some(isActive);
              return (
                <div key={group.title} className="mb-1">
                  <button
                    onClick={() => toggleGroup(group.title)}
                    className="w-full flex items-center justify-between px-2 py-1.5 mb-0.5 rounded-lg hover:bg-white/[0.02] group transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <group.icon className={cn("w-3 h-3 shrink-0 transition-colors", hasActive ? group.color : "text-muted-foreground/40 group-hover:text-muted-foreground")} />
                      <span className={cn(
                        "text-[10px] uppercase tracking-[0.12em] font-bold transition-colors",
                        hasActive ? group.color : "text-muted-foreground/60 group-hover:text-muted-foreground"
                      )}>{group.title}</span>
                    </div>
                    <ChevronDown className={cn(
                      "w-3 h-3 transition-all",
                      hasActive ? `${group.color} opacity-70` : "text-muted-foreground/30 group-hover:text-muted-foreground/50",
                      isGroupCollapsed ? "-rotate-90" : ""
                    )} />
                  </button>
                  {!isGroupCollapsed && (
                    <div className="space-y-0.5 ml-1">
                      {group.items.map(item => {
                        const active = isActive(item);
                        const showUnread = item.href === "/admin/support/inbox" && adminUnreadCount > 0;
                        return (
                          <Link key={item.href} href={item.href} onClick={() => setMobileSidebarOpen(false)}
                            className={cn(
                              "relative flex items-center justify-between pl-3 pr-2 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 group",
                              active
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                            )}>
                            {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-r-full" />}
                            <div className="flex items-center gap-2.5 min-w-0">
                              <item.icon className={cn("w-3.5 h-3.5 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground")} />
                              <span className="truncate text-[12px]">{item.label}</span>
                            </div>
                            {showUnread ? (
                              <span className="text-[9px] font-black min-w-[18px] text-center px-1.5 py-0.5 rounded-full bg-red-500 text-white tabular-nums shadow-lg shadow-red-500/30">
                                {adminUnreadCount > 99 ? "99+" : adminUnreadCount}
                              </span>
                            ) : item.badge ? (
                              <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-md border", item.badgeColor ?? "bg-primary/15 text-primary border-primary/25")}>{item.badge}</span>
                            ) : active ? (
                              <ChevronRight className="w-3 h-3 shrink-0 text-primary/60" />
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </nav>

        {/* Footer */}
        {!collapsed ? (
          <div className="p-2 border-t border-border bg-background/40 space-y-1 shrink-0">
            {email && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 mb-1">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 via-primary to-emerald-400 flex items-center justify-center text-[10px] font-black text-black shrink-0">
                  {email.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground/60 leading-tight">Admin</p>
                  <p className="text-[11px] text-foreground truncate font-medium leading-tight">{email}</p>
                </div>
              </div>
            )}
            <Link href="/" className="flex items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/[0.04] transition-all">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Back to Exchange
            </Link>
            <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-500/5 transition-all">
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        ) : (
          <div className="p-2 border-t border-border space-y-1 shrink-0">
            {email && (
              <div title={email} className="flex items-center justify-center py-1">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 via-primary to-emerald-400 flex items-center justify-center text-[10px] font-black text-black">
                  {email.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
            <button onClick={logout} title="Sign Out" className="w-full flex items-center justify-center py-2 text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-500/5 transition-all">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card/70 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button className="md:hidden p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5" onClick={() => setMobileSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              {currentPage ? (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <currentPage.icon className="w-3 h-3 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-sm font-bold leading-none">{currentPage.label}</h1>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold leading-none mt-0.5">{currentPage.group}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <LayoutDashboard className="w-3 h-3 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-sm font-bold leading-none">{greeting}, Admin</h1>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold leading-none mt-0.5">
                      {now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-500/8 border border-green-500/15">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-green-400 font-semibold">Operational</span>
            </div>
            {adminUnreadCount > 0 && (
              <Link href="/admin/support/inbox" className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-500/50" />
              </Link>
            )}
            <AdminWalletWidget collapsed={false} />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 pb-[calc(env(safe-area-inset-bottom)+5rem)] lg:pb-6 overflow-auto">
          {children}
        </main>
      </div>
      <SupportChatToaster />
    </div>
  );
}
