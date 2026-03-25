import { ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Wallet, LayoutDashboard, LineChart, ArrowRightLeft, Menu, X, Sun, Moon, Monitor, Smartphone, Layers, Users, CreditCard, Bell, CheckCheck, Info, AlertTriangle, Megaphone, Link2 } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { WalletConnectModal } from "./WalletConnectModal";
import { WalletOptionsDropdown } from "./WalletOptionsDropdown";
import { BrandLogo } from "./BrandLogo";
import { subscribeReownAccount, isReownReady, fetchEvmBalance, parseChainFromCaip } from "@/lib/reown";
import { TxStatusBar } from "./TxStatusBar";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
  { href: "/bridge", label: "Bridge", icon: Link2 },
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

interface PlatformNotif {
  id: string; title: string; body: string;
  type: "info" | "warning" | "success" | "error";
  audience: string; createdAt: string; active: boolean;
}

const NOTIF_ICONS = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCheck,
  error: AlertTriangle,
};

const NOTIF_COLORS = {
  info:    "text-blue-400",
  warning: "text-amber-400",
  success: "text-green-400",
  error:   "text-red-400",
};

function usePlatformNotifs() {
  const [notifs, setNotifs] = useState<PlatformNotif[]>([]);
  const [read, setRead] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("orahdex_notif_read") ?? "[]")); } catch { return new Set(); }
  });
  useEffect(() => {
    const load = () => {
      try {
        const raw: PlatformNotif[] = JSON.parse(localStorage.getItem("orahdex_notifications") ?? "[]");
        setNotifs(raw.filter(n => n.active));
      } catch { setNotifs([]); }
    };
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, []);
  const markAllRead = () => {
    const ids = notifs.map(n => n.id);
    const next = new Set([...read, ...ids]);
    setRead(next);
    localStorage.setItem("orahdex_notif_read", JSON.stringify([...next]));
  };
  const unread = notifs.filter(n => !read.has(n.id)).length;
  return { notifs, unread, markAllRead };
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { address, network, provider } = useWalletStore();
  const { theme, setTheme } = useThemeStore();
  const { isOpen: isWalletModalOpen, open: openWalletModal, close: closeWalletModal } = useWalletModalStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { data: bsvStatus } = useBsvStatus();
  const bsvOnline = bsvStatus?.online ?? false;
  const bsvBlock  = bsvStatus?.blockHeight ?? 0;
  const { notifs, unread, markAllRead } = usePlatformNotifs();
  const { toast } = useToast();

  const safeTheme = (THEME_CYCLE as readonly string[]).includes(theme) ? (theme as typeof THEME_CYCLE[number]) : "dark";
  const ThemeIcon = THEME_ICONS[safeTheme];
  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(safeTheme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  const prevAddressRef = useRef<string | null>(null);

  // Auto-sync Reown/EVM wallet into wallet store on page load (handles refresh reconnect)
  useEffect(() => {
    let ready = false;
    let tries = 0;
    const check = setInterval(() => {
      if (isReownReady()) { ready = true; clearInterval(check); startSync(); }
      if (++tries > 40) clearInterval(check);
    }, 200);
    function startSync() {
      subscribeReownAccount(async (state) => {
        if (state.isConnected && state.address) {
          const { address: current, connect, setBalance } = useWalletStore.getState();
          if (!current) {
            const chainId = parseChainFromCaip(state.caipAddress) ?? undefined;
            connect({ address: state.address, provider: "reown", network: "evm", chainId });
            const bal = await fetchEvmBalance(state.address, chainId ?? null);
            if (bal !== null) setBalance(bal);
          }
        }
      });
    }
    return () => clearInterval(check);
  }, []);
  useEffect(() => {
    const prev = prevAddressRef.current;
    if (!prev && address) {
      const shortAddr = address.length > 12
        ? `${address.slice(0, 6)}…${address.slice(-4)}`
        : address;
      const networkLabel = network === "bsv" ? "BSV" : network === "sol" ? "Solana" : network === "btc" ? "Bitcoin" : "EVM";
      toast({
        title: "Wallet Connected",
        description: `${provider ?? networkLabel} · ${shortAddr}`,
      });
    } else if (prev && !address) {
      toast({ title: "Wallet Disconnected", description: "You have been disconnected from your wallet." });
    }
    prevAddressRef.current = address;
  }, [address]);

  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <header className="sticky top-0 h-16 border-b border-border bg-card/95 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6 shrink-0 z-40">
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

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setNotifOpen(o => !o); if (!notifOpen) markAllRead(); }}
              className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-colors"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center leading-none">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-3.5 h-3.5 text-primary" />
                    <span className="font-semibold text-sm">Notifications</span>
                    {notifs.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">({notifs.length})</span>
                    )}
                  </div>
                </div>

                {/* Wallet status row (when connected) */}
                {address && (
                  <div className="px-4 py-2.5 border-b border-border/50 bg-green-500/5">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-green-400">Wallet Connected</p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                          {provider && <span className="capitalize">{provider} · </span>}
                          {address.slice(0, 8)}…{address.slice(-6)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Platform notifications */}
                <div className="max-h-72 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                      <Bell className="w-6 h-6 opacity-30" />
                      <p className="text-xs">No notifications right now</p>
                    </div>
                  ) : (
                    notifs.map(n => {
                      const Icon = NOTIF_ICONS[n.type as keyof typeof NOTIF_ICONS] ?? Info;
                      const color = NOTIF_COLORS[n.type as keyof typeof NOTIF_COLORS] ?? "text-blue-400";
                      return (
                        <div key={n.id} className="px-4 py-3 border-b border-border/40 hover:bg-white/3 transition-colors last:border-0">
                          <div className="flex items-start gap-2.5">
                            <Icon className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", color)} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground leading-snug">{n.title}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                              <p className="text-[10px] text-muted-foreground/50 mt-1">
                                {new Date(n.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* BSV LIVE badge */}
          <span className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/30 border border-green-500/30 text-[10px] font-bold uppercase tracking-wider select-none">
            <span className={cn("w-1.5 h-1.5 rounded-full", bsvOnline ? "bg-green-400 animate-pulse" : "bg-red-400")} />
            <span className={bsvOnline ? "text-green-400" : "text-red-400"}>BSV {bsvOnline ? "LIVE" : "—"}</span>
            {bsvBlock > 0 && <span className="text-green-400/80">#{bsvBlock.toLocaleString()}</span>}
          </span>

          {address ? (
            <WalletOptionsDropdown />
          ) : (
            <button
              onClick={() => openWalletModal()}
              className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-primary text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-primary/30 hover:brightness-110 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/40 active:scale-95 transition-all"
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
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-500 to-primary text-white px-5 py-3 rounded-xl font-bold shadow-lg shadow-primary/30"
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

      {/* Fixed tx status overlay — bottom right */}
      <TxStatusBar />
    </div>
  );
}
