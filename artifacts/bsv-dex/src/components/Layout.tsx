import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Wallet, LogOut, LayoutDashboard, LineChart, ArrowRightLeft, Menu, X, Zap, Sun, Moon, Smartphone, Settings } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { WalletConnectModal } from "./WalletConnectModal";
import { shortenAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useState } from "react";

const THEME_ICONS = { dark: Moon, light: Sun, amoled: Smartphone };
const THEME_CYCLE = ["dark", "light", "amoled"] as const;

const NAV_LINKS = [
  { href: "/", label: "Markets", icon: Activity },
  { href: "/trade/BSV-USDT", label: "Spot", icon: ArrowRightLeft },
  { href: "/futures/BSV-USDT-PERP", label: "Futures", icon: LineChart },
  { href: "/portfolio", label: "Portfolio", icon: LayoutDashboard },
];

const NETWORK_BADGE: Record<string, { label: string; color: string }> = {
  evm: { label: "EVM", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  bsv: { label: "BSV", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
};

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { address, provider, network, disconnect } = useWalletStore();
  const { theme, setTheme } = useThemeStore();
  const { isOpen: isWalletModalOpen, open: openWalletModal, close: closeWalletModal } = useWalletModalStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const ThemeIcon = THEME_ICONS[theme ?? "dark"];
  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme as typeof THEME_CYCLE[number]);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  const networkBadge = network ? NETWORK_BADGE[network] : null;

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 shrink-0 z-40 relative">
        <div className="flex items-center gap-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 via-primary to-orange-400 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
              <Zap className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-extrabold text-lg tracking-tight text-foreground">
                Aura<span className="text-primary">DEX</span>
              </span>
              <span className="text-[9px] text-muted-foreground tracking-widest uppercase font-medium">Always comes to Aura</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = link.href === "/"
                ? location === "/"
                : location.startsWith("/" + link.href.split("/")[1]);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-colors"
            title={`Switch theme (${theme})`}
          >
            <ThemeIcon className="w-4 h-4" />
          </button>
          {/* Admin link */}
          <Link href="/admin"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-colors"
            title="Admin Panel"
          >
            <Settings className="w-4 h-4" />
          </Link>
          {address ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col items-end">
                <div className="flex items-center gap-1.5">
                  {networkBadge && (
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider", networkBadge.color)}>
                      {networkBadge.label}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{provider}</span>
                </div>
                <span className="text-sm font-mono text-foreground bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                  {shortenAddress(address)}
                </span>
              </div>
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Connected" />
              <button
                onClick={disconnect}
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                title="Disconnect Wallet"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => openWalletModal()}
              className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30 active:scale-95 transition-all"
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">Connect Wallet</span>
              <span className="sm:hidden">Connect</span>
            </button>
          )}

          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-card border-b border-border z-30 shadow-xl">
          <nav className="flex flex-col p-4 gap-2">
            {NAV_LINKS.map((link) => {
              const isActive = link.href === "/" ? location === "/" : location.startsWith("/" + link.href.split("/")[1]);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl font-medium",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <link.icon className="w-5 h-5" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {!address && (
            <div className="px-4 pb-4">
              <button
                onClick={() => { openWalletModal(); setIsMobileMenuOpen(false); }}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white px-5 py-3 rounded-xl font-semibold shadow-lg"
              >
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </button>
            </div>
          )}
        </div>
      )}

      <main className="flex-1 flex flex-col min-h-0 relative z-0">
        {children}
      </main>

      <WalletConnectModal
        isOpen={isWalletModalOpen}
        onClose={closeWalletModal}
      />
    </div>
  );
}
