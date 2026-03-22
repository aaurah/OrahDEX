import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Wallet, LogOut, LayoutDashboard, LineChart, ArrowRightLeft, Menu } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { WalletConnectModal } from "./WalletConnectModal";
import { shortenAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Markets", icon: Activity },
  { href: "/trade/BSV-USDT", label: "Spot", icon: ArrowRightLeft },
  { href: "/futures/BSV-USDT", label: "Futures", icon: LineChart },
  { href: "/portfolio", label: "Portfolio", icon: LayoutDashboard },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { address, disconnect } = useWalletStore();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 shrink-0 z-40 relative">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
              B
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground hidden sm:block">
              BSV<span className="text-primary">DEX</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  location === link.href || (link.href !== '/' && location.startsWith(link.href.split('/')[1]))
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {address ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col items-end mr-2">
                <span className="text-xs text-muted-foreground font-medium">Connected</span>
                <span className="text-sm font-mono text-foreground bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                  {shortenAddress(address)}
                </span>
              </div>
              <button
                onClick={disconnect}
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                title="Disconnect Wallet"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30 active:scale-95 transition-all"
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
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-card border-b border-border z-30 shadow-xl">
          <nav className="flex flex-col p-4 gap-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-medium",
                  location === link.href || (link.href !== '/' && location.startsWith(link.href.split('/')[1]))
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <link.icon className="w-5 h-5" />
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <main className="flex-1 flex flex-col min-h-0 relative z-0">
        {children}
      </main>

      <WalletConnectModal 
        isOpen={isWalletModalOpen} 
        onClose={() => setIsWalletModalOpen(false)} 
      />
    </div>
  );
}
