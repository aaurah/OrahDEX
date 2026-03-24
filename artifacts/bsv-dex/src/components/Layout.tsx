import { ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Wallet, LayoutDashboard, LineChart, ArrowRightLeft, Menu, X, Sun, Moon, Monitor, Smartphone, Layers, Users, CreditCard } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { WalletConnectModal } from "./WalletConnectModal";
import { WalletOptionsDropdown } from "./WalletOptionsDropdown";
import { ReownConnectButton } from "./ReownConnectButton";
import { BrandLogo } from "./BrandLogo";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BsvStatus = { online: boolean; blockHeight: number; bestBlockHash: string };

function useBsvStatus() {
  return useQuery<BsvStatus>({
    queryKey: ["bsv-status"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/bsv-status`);
      return r.ok ? r.json() : { online: false, blockHeight: 0, bestBlockHash: "" };
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}

const THEME_ICONS = { dark: Moon, light: Sun, amoled: Smartphone, system: Monitor };
const THEME_CYCLE = ["dark", "light", "amoled", "system"] as const;
const THEME_LABELS = { dark: "Dark", light: "Light", amoled: "Amoled", system: "System" };

const NAV_LINKS = [
  { href: "/", label: "Markets", icon: Activity },
  { href: "/trade/BSV-USDT", label: "Spot", icon: ArrowRightLeft },
  { href: "/futures/BSV-USDT-PERP", label: "Futures", icon: LineChart },
  { href: "/dex", label: "Market Hub", icon: Layers },
  { href: "/p2p", label: "P2P", icon: Users },
  { href: "/portfolio", label: "Portfolio", icon: LayoutDashboard },
];

const CHAIN_LABELS: Record<number, { short: string; color: string }> = {
  1:     { short: "ETH",   color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  56:    { short: "BNB",   color: "bg-green-500/20 text-green-400 border-green-500/30" },
  137:   { short: "MATIC", color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  42161: { short: "ARB",   color: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  10:    { short: "OP",    color: "bg-red-500/20 text-red-400 border-red-500/30" },
  8453:  { short: "BASE",  color: "bg-blue-600/20 text-blue-300 border-blue-600/30" },
  324:   { short: "ZK",    color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  43114: { short: "AVAX",  color: "bg-red-500/20 text-red-400 border-red-500/30" },
  250:   { short: "FTM",   color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
};

/** Shows the current connected chain */
function ChainBadge({ chainId }: { chainId: number | null }) {
  const meta = chainId ? CHAIN_LABELS[chainId] : null;
  const label = meta?.short ?? (chainId ? `#${chainId}` : "EVM");
  const color = meta?.color ?? "bg-blue-500/20 text-blue-400 border-blue-500/30";

  return (
    <span
      title="Current network"
      className={cn(
        "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider",
        color
      )}
    >
      {label}
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { address } = useWalletStore();
  const { theme, setTheme } = useThemeStore();
  const { isOpen: isWalletModalOpen, open: openWalletModal, close: closeWalletModal } = useWalletModalStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { data: bsvStatus } = useBsvStatus();
  const bsvOnline = bsvStatus?.online ?? false;
  const bsvBlock  = bsvStatus?.blockHeight ?? 0;

  const safeTheme = (THEME_CYCLE as readonly string[]).includes(theme) ? (theme as typeof THEME_CYCLE[number]) : "dark";
  const ThemeIcon = THEME_ICONS[safeTheme];
  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(safeTheme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      {/* BSV Chain Status Bar */}
      <div className="sticky top-0 z-50 h-7 bg-gradient-to-r from-green-950/90 via-green-900/80 to-green-950/90 border-b border-green-500/30 backdrop-blur-sm flex items-center justify-between overflow-hidden px-3">
        {/* Scrolling ticker */}
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-0 animate-[bsv-ticker_40s_linear_infinite] whitespace-nowrap">
            {[0,1,2].map(i => (
              <span key={i} className="flex items-center gap-6 px-6 text-[11px] font-semibold text-green-300">
                <span className="flex items-center gap-1.5"><span className="animate-pulse text-green-400">⚡</span> BSV — World&apos;s Fastest Settlement Chain</span>
                <span className="text-green-500">·</span>
                <span>Instant On-Chain Settlement · No Bridges · No L2s</span>
                <span className="text-green-500">·</span>
                <span>Every trade settled on BSV in seconds</span>
                <span className="text-green-500">·</span>
                <span className="text-green-400 font-bold">OrahDEX — Trade means DEX</span>
                <span className="text-green-500">·</span>
              </span>
            ))}
          </div>
        </div>
        {/* Live chain status badge — always visible on right */}
        <a
          href={bsvBlock > 0 ? `https://whatsonchain.com/block-height/${bsvBlock}` : "https://whatsonchain.com"}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 flex items-center gap-1.5 ml-3 px-2 py-0.5 rounded bg-black/30 border border-green-500/30 text-[10px] font-bold uppercase tracking-wider hover:bg-black/50 transition-colors"
        >
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            bsvOnline ? "bg-green-400 animate-pulse" : "bg-red-400"
          )} />
          <span className={bsvOnline ? "text-green-400" : "text-red-400"}>
            BSV {bsvOnline ? "LIVE" : "—"}
          </span>
          {bsvBlock > 0 && (
            <span className="text-green-400/80">#{bsvBlock.toLocaleString()}</span>
          )}
        </a>
      </div>
      <header className="sticky top-7 h-20 border-b border-border bg-card/95 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6 shrink-0 z-40">
        <div className="flex items-center gap-8">
          {/* Brand */}
          <Link href="/" className="flex items-center group">
            <BrandLogo textSize="text-xl" />
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

        <div className="flex items-center gap-0">
          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-colors text-xs font-medium"
            title={`Switch theme — currently ${THEME_LABELS[safeTheme]}`}
          >
            <ThemeIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{THEME_LABELS[safeTheme]}</span>
          </button>

          {address ? (
            <div className="flex items-center gap-2">
              <ReownConnectButton size="sm" />
              <WalletOptionsDropdown />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ReownConnectButton size="sm" className="hidden sm:flex" />
              <button
                onClick={() => openWalletModal()}
                className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30 active:scale-95 transition-all"
              >
                <Wallet className="w-4 h-4" />
                <span className="hidden sm:inline">Connect Wallet</span>
                <span className="sm:hidden">Connect</span>
              </button>
            </div>
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

      <main className="flex-1 relative z-0">
        {children}
      </main>

      <WalletConnectModal
        isOpen={isWalletModalOpen}
        onClose={closeWalletModal}
      />
    </div>
  );
}
