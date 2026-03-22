import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, ShieldCheck, ArrowRightLeft,
  Key, Cpu, Palette, LogOut, Menu, X, ChevronRight, Activity,
} from "lucide-react";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "User Management", icon: Users },
  { href: "/admin/admins", label: "Admin Users", icon: ShieldCheck },
  { href: "/admin/transactions", label: "On-Chain Transactions", icon: Activity },
  { href: "/admin/pairs", label: "Trade Pairs", icon: ArrowRightLeft },
  { href: "/admin/api", label: "API Settings", icon: Key },
  { href: "/admin/contracts", label: "Contracts & Coins", icon: Cpu },
  { href: "/admin/themes", label: "Theme Settings", icon: Palette },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { email, logout } = useAdminAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (nav: typeof NAV[0]) =>
    nav.exact ? location === nav.href : location.startsWith(nav.href);

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-200",
          "md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-border shrink-0">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <span className="text-white font-black text-sm leading-none select-none" style={{ fontFamily: "Inter, sans-serif" }}>O</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-extrabold text-sm tracking-tight">
                Orah<span className="text-primary">DEX</span>
              </span>
              <span className="text-[8px] text-muted-foreground uppercase tracking-widest">Admin Panel</span>
            </div>
          </Link>
          <button className="md:hidden text-muted-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 overflow-y-auto">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold px-3 pb-2 pt-1">Navigation</p>
          {NAV.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 rounded-xl mb-0.5 text-sm font-medium transition-all group",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </div>
                {active && <ChevronRight className="w-3 h-3" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border space-y-1">
          {email && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/3 border border-white/5 mb-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                A
              </div>
              <span className="text-xs text-muted-foreground truncate flex-1">{email}</span>
            </div>
          )}
          <Link href="/" className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/5 transition-all">
            <ArrowRightLeft className="w-4 h-4" />
            Back to Exchange
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-destructive rounded-xl hover:bg-destructive/5 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-2 text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-foreground">
                {NAV.find(isActive)?.label ?? "Admin Panel"}
              </h1>
              <p className="text-xs text-muted-foreground">Orah DEX Platform Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-muted-foreground hidden sm:block">System Operational</span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center text-xs font-bold text-white">O</div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
