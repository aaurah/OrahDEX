import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, ShieldCheck, ArrowRightLeft,
  Key, Cpu, Palette, LogOut, Menu, X, ChevronRight, Activity,
  Wallet, Link2, Bot, Globe, Home, ToggleLeft, Shield, DollarSign,
  Megaphone, ChevronDown,
} from "lucide-react";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";

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
      { href: "/admin/fees",         label: "Fee Configuration",  icon: DollarSign },
      { href: "/admin/integrations", label: "Integrations",       icon: Link2 },
      { href: "/admin/contracts",    label: "Contracts & Coins",  icon: Cpu },
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
      { href: "/admin/fee-wallet",   label: "Fee Wallet",         icon: Wallet },
      { href: "/admin/bot-profit",   label: "Bot Profit",         icon: Bot },
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

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { email, logout } = useAdminAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const isActive = (item: NavItem) =>
    item.exact ? location === item.href : location.startsWith(item.href);

  const toggleGroup = (title: string) =>
    setCollapsed(c => ({ ...c, [title]: !c[title] }));

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
                          {item.badge && (
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
              <p className="text-xs text-muted-foreground">OrahDEX Platform Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-400 font-medium hidden sm:block">System Operational</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
