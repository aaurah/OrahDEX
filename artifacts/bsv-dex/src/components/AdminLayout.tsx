import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, ShieldCheck, ArrowRightLeft,
  Key, Cpu, Palette, LogOut, Menu, X, ChevronRight, Activity,
  Wallet, Bot, Globe, Home, ToggleLeft, Shield, DollarSign,
  Megaphone, ChevronDown, Layers, Copy, Check, ExternalLink, Rocket, Mail, Brain,
  HeartPulse, TrendingUp, Terminal, Headphones, Inbox, HelpCircle, Search, ArrowDownToLine,
  Landmark, Plug2, Printer, Database,
} from "lucide-react";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { useTicketReadStore } from "@/store/useTicketReadStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { WalletConnectModal } from "@/components/WalletConnectModal";
import { useAccount, useChainId, useBalance, useDisconnect } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { cn } from "@/lib/utils";
import { BrandLogo, OrahDEXInline } from "./BrandLogo";

const CHAIN_NAMES: Record<number, { name: string; color: string; short: string }> = {
  1:      { name: "Ethereum",    color: "text-blue-400 bg-blue-400/10 border-blue-400/20",    short: "ETH" },
  56:     { name: "BNB Chain",   color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", short: "BNB" },
  137:    { name: "Polygon",     color: "text-violet-400 bg-violet-400/10 border-violet-400/20", short: "MATIC" },
  42161:  { name: "Arbitrum",   color: "text-blue-300 bg-blue-300/10 border-blue-300/20",    short: "ARB" },
  10:     { name: "Optimism",   color: "text-red-400 bg-red-400/10 border-red-400/20",       short: "OP" },
  8453:   { name: "Base",       color: "text-blue-400 bg-blue-400/10 border-blue-400/20",    short: "BASE" },
  43114:  { name: "Avalanche",  color: "text-red-400 bg-red-400/10 border-red-400/20",       short: "AVAX" },
  250:    { name: "Fantom",     color: "text-blue-400 bg-blue-400/10 border-blue-400/20",    short: "FTM" },
  324:    { name: "zkSync",     color: "text-blue-400 bg-blue-400/10 border-blue-400/20",    short: "ZK" },
  534352: { name: "Scroll",     color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", short: "SCR" },
  5000:   { name: "Mantle",     color: "text-teal-400 bg-teal-400/10 border-teal-400/20",    short: "MNT" },
  59144:  { name: "Linea",      color: "text-blue-300 bg-blue-300/10 border-blue-300/20",    short: "LINEA" },
  25:     { name: "Cronos",     color: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20", short: "CRO" },
};

const NETWORK_STYLES: Record<string, { color: string; label: string }> = {
  bsv: { color: "text-green-400 bg-green-400/10 border-green-400/20",   label: "BSV" },
  sol: { color: "text-purple-400 bg-purple-400/10 border-purple-400/20", label: "SOL" },
  btc: { color: "text-orange-400 bg-orange-400/10 border-orange-400/20", label: "BTC" },
};

interface NavItem {
  href: string;
  label: string;
  icon: any;
  exact?: boolean;
  badge?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin",              label: "Dashboard",          icon: LayoutDashboard, exact: true },
      { href: "/admin/setup",        label: "Setup",              icon: Rocket, badge: "A–Z" },
      { href: "/admin/mail",         label: "Email Inbox",        icon: Mail },
      { href: "/admin/integrations", label: "Integrations",       icon: Plug2 },
    ],
  },
  {
    title: "Customization",
    items: [
      { href: "/admin/site",         label: "Site Settings",      icon: Globe },
      { href: "/admin/home",         label: "Homepage Builder",   icon: Home },
      { href: "/admin/themes",       label: "Themes",             icon: Palette },
      { href: "/admin/announcements",label: "Announcements",      icon: Megaphone },
    ],
  },
  {
    title: "Platform",
    items: [
      { href: "/admin/features",     label: "Feature Flags",      icon: ToggleLeft },
      { href: "/admin/pairs",        label: "Trade Pairs",        icon: ArrowRightLeft },
      { href: "/admin/trade-analytics", label: "Trade Analytics", icon: TrendingUp, badge: "NEW" },
      { href: "/admin/fees",         label: "Fee Configuration",  icon: DollarSign },
      { href: "/admin/contracts",    label: "Contracts & Coins",  icon: Cpu },
      { href: "/admin/copy-vaults",  label: "CopyVault",          icon: Copy,    badge: "NEW" },
      { href: "/admin/prediction",  label: "Prediction",         icon: TrendingUp, badge: "NEW" },
    ],
  },
  {
    title: "AI Intelligence",
    items: [
      { href: "/admin/ai",           label: "Ora AI Settings",    icon: Brain,   badge: "AI" },
    ],
  },
  {
    title: "Support",
    items: [
      { href: "/admin/support",      label: "Support & Contact",  icon: Headphones },
      { href: "/admin/support/inbox", label: "Support Inbox",      icon: Inbox },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/health",       label: "System Health",      icon: HeartPulse, badge: "LIVE" },
      { href: "/admin/api-monitor",  label: "API Monitor",        icon: Activity,   badge: "NEW" },
      { href: "/admin/liquidity",    label: "Liquidity Bot",      icon: Bot },
      { href: "/admin/tradingview",  label: "TradingView Feed",   icon: TrendingUp },
      { href: "/admin/logs",         label: "System Logs",        icon: Terminal },
    ],
  },
  {
    title: "Security",
    items: [
      { href: "/admin/security",     label: "Security Settings",  icon: Shield },
      { href: "/admin/api",          label: "API Keys",           icon: Key },
      { href: "/admin/admins",       label: "Admin Users",        icon: ShieldCheck },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/admin/db-sync",      label: "DB Sync & Health",   icon: ShieldCheck,     badge: "NEW" },
      { href: "/admin/ledger",       label: "Ledger Manager",     icon: Database },
      { href: "/admin/withdrawals",  label: "Withdrawals",        icon: ArrowDownToLine },
      { href: "/admin/treasury",     label: "Treasury",           icon: Landmark },
      { href: "/admin/mint-burn",    label: "Mint & Burn",        icon: Printer },
      { href: "/admin/fee-wallet",   label: "Fee Wallet",         icon: Wallet },
      { href: "/admin/bot-profit",   label: "Bot Profit",         icon: Bot },
      { href: "/admin/arb-bot",      label: "Arb Bot",            icon: Bot },
      { href: "/admin/seeded-pool",  label: "Seeded Pool",        icon: Database },
      { href: "/admin/transactions", label: "On-Chain Txns",      icon: Activity },
    ],
  },
  {
    title: "Users",
    items: [
      { href: "/admin/users",        label: "User Management",    icon: Users },
    ],
  },
];

function AdminWalletWidget() {
  const { isOpen: walletOpen, open: openWallet, close: closeWallet } = useWalletModalStore();
  const walletStore = useWalletStore();
  const { address: evmAddress, isConnected: evmConnected } = useAccount();
  const chainId = useChainId();
  const { data: evmBalance, isLoading: balanceLoading } = useBalance({ address: evmAddress, query: { enabled: evmConnected } });
  const { disconnect: evmDisconnect } = useDisconnect();
  const appKit = useAppKit();
  const [copied, setCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isConnected = evmConnected || !!walletStore.address;
  const displayAddress = evmConnected && evmAddress
    ? evmAddress
    : walletStore.address ?? null;
  const network = evmConnected ? "evm" : walletStore.network;

  const chainInfo = evmConnected && chainId ? CHAIN_NAMES[chainId] : null;
  const networkStyle = network === "evm"
    ? (chainInfo ? { color: chainInfo.color, label: chainInfo.short } : { color: "text-blue-400 bg-blue-400/10 border-blue-400/20", label: "EVM" })
    : network ? NETWORK_STYLES[network] ?? { color: "text-muted-foreground bg-muted/10 border-border", label: network.toUpperCase() }
    : null;

  const evmBalanceNum = evmBalance
    ? Number(evmBalance.value) / 10 ** evmBalance.decimals
    : NaN;
  const balance = evmConnected && evmBalance
    ? `${isNaN(evmBalanceNum) ? "0.0000" : evmBalanceNum.toFixed(4)} ${evmBalance.symbol}`
    : walletStore.balance ?? null;

  const copyAddress = () => {
    if (!displayAddress) return;
    navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncate = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  if (!isConnected) {
    return (
      <>
        <button
          onClick={() => openWallet()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-all"
        >
          <Wallet className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Connect Wallet</span>
        </button>
        <WalletConnectModal isOpen={walletOpen} onClose={closeWallet} />
      </>
    );
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(d => !d)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border hover:border-primary/30 transition-all"
        >
          {networkStyle && (
            <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-md border", networkStyle.color)}>
              {networkStyle.label}
            </span>
          )}
          {displayAddress && (
            <span className="text-xs font-mono text-foreground hidden sm:block">
              {truncate(displayAddress)}
            </span>
          )}
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", dropdownOpen && "rotate-180")} />
        </button>

        {dropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Connected Wallet</span>
                  {networkStyle && (
                    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-md border", networkStyle.color)}>
                      {chainInfo?.name ?? networkStyle.label}
                    </span>
                  )}
                </div>
                {displayAddress && (
                  <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3 py-2">
                    <code className="text-xs font-mono text-foreground flex-1 truncate">{displayAddress}</code>
                    <button onClick={copyAddress} className="text-muted-foreground hover:text-green-400 transition-colors shrink-0">
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {evmConnected && chainId && (
                      <a
                        href={`https://etherscan.io/address/${displayAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-blue-400 transition-colors shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {(evmConnected || walletStore.balance) && (
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Balance</p>
                  {balanceLoading
                    ? <p className="text-sm font-mono text-muted-foreground animate-pulse">Fetching…</p>
                    : <p className="text-sm font-mono font-bold text-foreground">{balance ?? "—"}</p>
                  }
                </div>
              )}

              <div className="p-2 space-y-0.5">
                <button
                  onClick={() => { setDropdownOpen(false); appKit.open(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/5 transition-all"
                >
                  <Layers className="w-4 h-4 shrink-0" />
                  <span>Switch Network / Wallet</span>
                </button>
                <div className="mx-3 h-px bg-border/60" />
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    if (evmConnected) evmDisconnect();
                    walletStore.disconnect();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-red-400 rounded-xl hover:bg-red-400/5 transition-all"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <WalletConnectModal isOpen={walletOpen} onClose={closeWallet} />
    </>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { email, logout } = useAdminAuthStore();
  const { adminUnreadCount } = useTicketReadStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const isActive = (item: NavItem) =>
    item.exact ? location === item.href : location.startsWith(item.href);

  const toggleGroup = (title: string) =>
    setCollapsed(c => ({ ...c, [title]: !c[title] }));

  const allItems = NAV_GROUPS.flatMap(g => g.items.map(item => ({ ...item, group: g.title })));
  const searchResults = searchQuery.trim()
    ? allItems.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.group.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchResults.length > 0) {
      navigate(searchResults[0].href);
      setSearchQuery("");
      setSidebarOpen(false);
    }
    if (e.key === "Escape") setSearchQuery("");
  };

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-50 w-60 bg-card border-r border-border flex flex-col transition-transform duration-200",
          "md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Brand */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
          <Link href="/" className="flex items-center gap-2 group">
            <BrandLogo textSize="text-sm" />
            <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-md border border-primary/20">Admin</span>
          </Link>
          <button className="md:hidden text-muted-foreground p-1" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-1 shrink-0 relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Search admin…"
              className="w-full bg-background border border-border rounded-xl pl-8 pr-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
              {searchResults.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-muted-foreground">No results for "{searchQuery}"</div>
              ) : (
                searchResults.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => { setSearchQuery(""); setSidebarOpen(false); }}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-white/5 transition-colors group"
                  >
                    <item.icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{item.group}</p>
                    </div>
                    {item.badge && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/25">{item.badge}</span>
                    )}
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_GROUPS.map(group => {
            const isCollapsed = collapsed[group.title];
            const hasActive = group.items.some(isActive);
            return (
              <div key={group.title}>
                <button
                  onClick={() => toggleGroup(group.title)}
                  className="w-full flex items-center justify-between px-3 py-1 mb-1 group"
                >
                  <span className={cn("text-[10px] uppercase tracking-widest font-bold transition-colors", hasActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}>
                    {group.title}
                  </span>
                  <ChevronDown className={cn("w-3 h-3 text-muted-foreground transition-transform", isCollapsed ? "-rotate-90" : "")} />
                </button>
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {group.items.map(item => {
                      const active = isActive(item);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all group",
                            active
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <item.icon className={cn("w-3.5 h-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {active && <ChevronRight className="w-3 h-3 shrink-0" />}
                          {item.href === "/admin/support/inbox" && adminUnreadCount > 0 ? (
                            <span className="text-[9px] font-black min-w-[18px] text-center px-1.5 py-0.5 rounded-full bg-red-500 text-white tabular-nums">{adminUnreadCount > 99 ? "99+" : adminUnreadCount}</span>
                          ) : item.badge && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/25">{item.badge}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-border space-y-1">
          {email && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/3 border border-white/5 mb-1">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                A
              </div>
              <span className="text-xs text-muted-foreground truncate flex-1">{email}</span>
            </div>
          )}
          <Link href="/" className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/5 transition-all">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Back to Exchange
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-destructive rounded-xl hover:bg-destructive/5 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-2 text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-foreground">
                {NAV_GROUPS.flatMap(g => g.items).find(isActive)?.label ?? "Admin Panel"}
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><OrahDEXInline className="text-xs" /> Platform Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-400 font-medium hidden sm:block">System Operational</span>
            </div>
            <AdminWalletWidget />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
