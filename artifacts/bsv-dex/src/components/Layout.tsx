import { ReactNode, useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Wallet, LayoutDashboard, LineChart, ArrowRightLeft, Menu, X, Sun, Moon, Monitor, Smartphone, Layers, Users, CreditCard, Bell, CheckCheck, Info, AlertTriangle, Megaphone, Link2, ShoppingCart, Zap, Trash2, Copy, ExternalLink, Cpu, Waves, Gauge, Shield } from "lucide-react";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { WalletOptionsDropdown } from "./WalletOptionsDropdown";
import { BrandLogo } from "./BrandLogo";
import { TxStatusBar } from "./TxStatusBar";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useBsvChain, fmtHashrate, fmtDifficulty, fmtMempoolMb, fmtBlockAge } from "@/hooks/useBsvChain";

/* ── Heavy modals — loaded only when first opened ── */
const WalletConnectModal = lazy(() => import("./WalletConnectModal").then(m => ({ default: m.WalletConnectModal })));
const AiAssistant        = lazy(() => import("./AiAssistant").then(m => ({ default: m.AiAssistant })));
const BuyCryptoModal     = lazy(() => import("./BuyCryptoModal").then(m => ({ default: m.BuyCryptoModal })));

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const THEME_ICONS = { dark: Moon, light: Sun, amoled: Smartphone, system: Monitor };
const THEME_CYCLE = ["dark", "light", "amoled", "system"] as const;
const THEME_LABELS = { dark: "Dark", light: "Light", amoled: "Amoled", system: "System" };

const NAV_LINKS = [
  { href: "/markets", label: "Markets", icon: Activity },
  { href: "/trade/BSV-USDT", label: "Spot", icon: ArrowRightLeft },
  { href: "/futures/BSV-USDT-PERP", label: "Futures", icon: LineChart },
  { href: "/dex", label: "Market Hub", icon: Layers },
  { href: "/p2p", label: "P2P", icon: Users },
  { href: "/bridge", label: "Bridge", icon: Link2 },
  { href: "/copy", label: "CopyVault", icon: Copy },
  { href: "/keeper", label: "Keepers", icon: Shield },
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

const NOTIF_TYPE_ICON: Record<string, typeof Info> = {
  order_placed:    ShoppingCart,
  order_filled:    CheckCheck,
  order_cancelled: AlertTriangle,
  trade:           Zap,
  bridge:          Link2,
  price_alert:     Activity,
  info:            Info,
  warning:         AlertTriangle,
  success:         CheckCheck,
  error:           AlertTriangle,
};

const NOTIF_TYPE_COLOR: Record<string, string> = {
  order_placed:    "text-blue-400",
  order_filled:    "text-green-400",
  order_cancelled: "text-amber-400",
  trade:           "text-violet-400",
  bridge:          "text-cyan-400",
  price_alert:     "text-orange-400",
  info:            "text-blue-400",
  warning:         "text-amber-400",
  success:         "text-green-400",
  error:           "text-red-400",
};

function usePlatformAnnouncements() {
  const [notifs, setNotifs] = useState<PlatformNotif[]>([]);
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
  return notifs;
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { address, network, provider, chainId } = useWalletStore();
  const { theme, setTheme } = useThemeStore();
  const { isOpen: isWalletModalOpen, open: openWalletModal, close: closeWalletModal } = useWalletModalStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [bsvPopover, setBsvPopover] = useState(false);
  const bsvPopoverRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const { data: bsvChain } = useBsvChain();
  const bsvOnline = bsvChain?.online ?? false;
  const bsvBlock  = bsvChain?.blockHeight ?? 0;
  const announcements = usePlatformAnnouncements();
  const { notifications, addNotification, markAllRead, clearAll, unreadCount } = useNotificationStore();
  const unread = unreadCount() + announcements.length;
  const lastPollRef = useRef<number>(0);

  /* Poll /api/notifications every 20 s when wallet is connected */
  const pollNotifications = useCallback(async (addr: string) => {
    try {
      const since = lastPollRef.current;
      const r = await fetch(`${BASE}/api/notifications?address=${encodeURIComponent(addr)}&since=${since}`);
      if (!r.ok) return;
      const { notifications: fresh } = await r.json() as { notifications: Array<{ id: string; type: string; title: string; body: string; timestamp: number; pair?: string; txid?: string; side?: string }> };
      if (fresh?.length) {
        lastPollRef.current = Date.now();
        fresh.forEach(n => addNotification({ type: n.type as any, title: n.title, body: n.body, pair: n.pair, txid: n.txid, side: n.side as any }));
      }
    } catch { /* network error — ignore */ }
  }, [addNotification]);

  useEffect(() => {
    if (!address) return;
    pollNotifications(address);
    const interval = setInterval(() => pollNotifications(address), 20_000);
    return () => clearInterval(interval);
  }, [address, pollNotifications]);
  const { toast } = useToast();

  const safeTheme = (THEME_CYCLE as readonly string[]).includes(theme) ? (theme as typeof THEME_CYCLE[number]) : "dark";
  const ThemeIcon = THEME_ICONS[safeTheme];
  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(safeTheme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  const prevAddressRef  = useRef<string | null>(null);
  const prevChainIdRef  = useRef<number | null>(null);

  // Auto-sync Reown/EVM wallet into wallet store on page load (handles refresh reconnect)
  useEffect(() => {
    let tries = 0;
    const check = setInterval(async () => {
      const reown = await import("@/lib/reown").catch(() => null);
      if (!reown) { clearInterval(check); return; }
      const { isReownReady, subscribeReownAccount, fetchEvmBalance, parseChainFromCaip } = reown;
      if (isReownReady()) {
        clearInterval(check);
        subscribeReownAccount(async (state) => {
          if (state.isConnected && state.address) {
            const { address: current, chainId: currentChainId, connect, setBalance } = useWalletStore.getState();
            const newChainId = parseChainFromCaip(state.caipAddress) ?? undefined;
            if (!current) {
              connect({ address: state.address, provider: "reown", network: "evm", chainId: newChainId });
              const bal = await fetchEvmBalance(state.address, newChainId ?? null);
              if (bal !== null) setBalance(bal);
            } else if (newChainId && newChainId !== currentChainId) {
              connect({ address: state.address, provider: "reown", network: "evm", chainId: newChainId });
              const bal = await fetchEvmBalance(state.address, newChainId ?? null);
              if (bal !== null) setBalance(bal);
            }
          }
        });
      }
      if (++tries > 100) clearInterval(check);
    }, 300);
    return () => clearInterval(check);
  }, []);
  useEffect(() => {
    const prev = prevAddressRef.current;
    if (!prev && address) {
      const shortAddr = address.length > 12
        ? `${address.slice(0, 6)}…${address.slice(-4)}`
        : address;
      const networkLabel = network === "bsv" ? "BSV" : network === "sol" ? "Solana" : network === "btc" ? "Bitcoin" : network === "tron" ? "TRON" : "EVM";
      toast({
        title: "Wallet Connected",
        description: `${provider ?? networkLabel} · ${shortAddr}`,
      });
      /* Register wallet in the DB so it shows in the admin user list */
      const { chainId: cid } = useWalletStore.getState();
      fetch(`${BASE}/api/users/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          network: network ?? "evm",
          provider: provider ?? "walletconnect",
          chainId: cid ?? undefined,
        }),
      }).catch(() => {});
    } else if (prev && !address) {
      toast({ title: "Wallet Disconnected", description: "You have been disconnected from your wallet." });
    }
    prevAddressRef.current = address;
  }, [address]);

  /* Detect chain switch while wallet already connected — toast + DB update */
  useEffect(() => {
    const prev = prevChainIdRef.current;
    prevChainIdRef.current = chainId;
    if (!address || !chainId || prev === null || prev === chainId) return;
    // User switched chains — find the human-readable name
    const chainName =
      chainId === 1       ? "Ethereum"   :
      chainId === 8453    ? "Base"        :
      chainId === 42161   ? "Arbitrum"   :
      chainId === 10      ? "Optimism"   :
      chainId === 137     ? "Polygon"    :
      chainId === 56      ? "BNB Chain"  :
      chainId === 43114   ? "Avalanche"  :
      chainId === 250     ? "Fantom"     :
      chainId === 25      ? "Cronos"     :
      chainId === 59144   ? "Linea"      :
      chainId === 324     ? "zkSync Era" :
      chainId === 534352  ? "Scroll"     :
      chainId === 5000    ? "Mantle"     :
      chainId === 7777777 ? "Zora"       :
      `Chain ${chainId}`;
    toast({ title: `Switched to ${chainName}`, description: "Markets updated for your new network." });
    /* Keep DB in sync with new chainId */
    fetch(`${BASE}/api/users/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, network: "evm", provider: provider ?? "walletconnect", chainId }),
    }).catch(() => {});
  }, [chainId]);

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

  const [bannerDismissed, setBannerDismissed] = useState(() => sessionStorage.getItem("maintenance_banner") === "1");
  const dismissBanner = () => { sessionStorage.setItem("maintenance_banner", "1"); setBannerDismissed(true); };

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      {/* ── Maintenance / testing ribbon ── */}
      {!bannerDismissed && (
        <div className="relative flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-400 text-xs font-medium z-50">
          <span className="text-amber-400">⚠</span>
          <span>OrahDEX is currently <strong>under active testing</strong> — some features may be incomplete or change without notice.</span>
          <button onClick={dismissBanner} aria-label="Dismiss" className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400/60 hover:text-amber-300 transition-colors text-base leading-none">✕</button>
        </div>
      )}
      <header className="sticky top-0 h-16 border-b border-border bg-card/95 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6 shrink-0 z-40">
        <div className="flex items-center gap-8">
          {/* Brand */}
          <Link href="/" className="flex items-center group">
            <BrandLogo textSize="text-xl" />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = location.startsWith("/" + link.href.split("/")[1]);
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
              onClick={() => {
                setNotifOpen(o => !o);
                if (!notifOpen) markAllRead();
              }}
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
              <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col" style={{ maxHeight: "480px" }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30 shrink-0">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-3.5 h-3.5 text-primary" />
                    <span className="font-semibold text-sm">Notifications</span>
                    {(notifications.length + announcements.length) > 0 && (
                      <span className="text-[10px] text-muted-foreground">({notifications.length + announcements.length})</span>
                    )}
                  </div>
                  {notifications.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); clearAll(); }}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
                      title="Clear all"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear
                    </button>
                  )}
                </div>

                {/* Wallet status row */}
                {address && (
                  <div className="px-4 py-2.5 border-b border-border/50 bg-green-500/5 shrink-0">
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

                {/* Unified notification feed */}
                <div className="overflow-y-auto flex-1">
                  {notifications.length === 0 && announcements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                      <Bell className="w-6 h-6 opacity-30" />
                      <p className="text-xs">No notifications yet</p>
                      {!address && (
                        <p className="text-[10px] text-center px-4">Connect your wallet to receive order and trade updates</p>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Trade / order notifications from store */}
                      {notifications.map(n => {
                        const Icon = NOTIF_TYPE_ICON[n.type] ?? Info;
                        const color = NOTIF_TYPE_COLOR[n.type] ?? "text-blue-400";
                        return (
                          <div key={n.id} className={cn("px-4 py-3 border-b border-border/40 hover:bg-white/3 transition-colors last:border-0", !n.read && "bg-primary/5")}>
                            <div className="flex items-start gap-2.5">
                              <Icon className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", color)} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <p className="text-xs font-semibold text-foreground leading-snug">{n.title}</p>
                                  {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                                {n.txid && (
                                  <a
                                    href={`https://whatsonchain.com/tx/${n.txid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-primary hover:underline font-mono"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {n.txid.slice(0, 12)}… ↗
                                  </a>
                                )}
                                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                                  {new Date(n.timestamp).toLocaleTimeString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Platform announcements (from admin panel) */}
                      {announcements.map(n => {
                        const Icon = NOTIF_TYPE_ICON[n.type] ?? Info;
                        const color = NOTIF_TYPE_COLOR[n.type] ?? "text-blue-400";
                        return (
                          <div key={n.id} className="px-4 py-3 border-b border-border/40 hover:bg-white/3 transition-colors last:border-0 bg-secondary/10">
                            <div className="flex items-start gap-2.5">
                              <Megaphone className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", color)} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Platform</span>
                                </div>
                                <p className="text-xs font-semibold text-foreground leading-snug">{n.title}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                                <p className="text-[10px] text-muted-foreground/50 mt-1">
                                  {new Date(n.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* BSV LIVE badge — clickable popover with full on-chain details */}
          {!address && (
            <div className="relative hidden sm:block" ref={bsvPopoverRef}>
              <button
                onClick={() => setBsvPopover(p => !p)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/30 border border-green-500/30 text-[10px] font-bold uppercase tracking-wider select-none hover:bg-green-500/10 transition-colors"
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", bsvOnline ? "bg-green-400 animate-pulse" : "bg-red-400")} />
                <span className={bsvOnline ? "text-green-400" : "text-red-400"}>BSV {bsvOnline ? "LIVE" : "—"}</span>
                {bsvBlock > 0 && <span className="text-green-400/80">#{bsvBlock.toLocaleString()}</span>}
              </button>

              {bsvPopover && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBsvPopover(false)} />
                  <div className="absolute right-0 top-8 z-50 w-72 bg-card border border-green-500/20 rounded-2xl shadow-2xl p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn("w-2 h-2 rounded-full", bsvOnline ? "bg-green-400 animate-pulse" : "bg-red-400")} />
                        <span className="text-xs font-bold text-foreground">BSV Mainnet</span>
                      </div>
                      <a href={bsvChain?.explorerUrl ?? "https://whatsonchain.com"} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                        Explorer <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { icon: Layers, label: "Block Height", value: bsvBlock > 0 ? `#${bsvBlock.toLocaleString()}` : "—", color: "text-green-400" },
                        { icon: Cpu, label: "Hashrate", value: fmtHashrate(bsvChain?.hashrateEHs ?? 0), color: "text-sky-400" },
                        { icon: Gauge, label: "Difficulty", value: fmtDifficulty(bsvChain?.difficulty ?? 0), color: "text-yellow-400" },
                        { icon: Zap, label: "Fee Rate", value: `${bsvChain?.feeRateSatPerByte ?? 1} sat/B`, color: "text-orange-400" },
                        { icon: Waves, label: "Mempool", value: fmtMempoolMb(bsvChain?.mempoolBytes ?? 0), color: "text-violet-400" },
                        { icon: Activity, label: "Mempool TXs", value: (bsvChain?.mempoolTxCount ?? 0) > 0 ? (bsvChain!.mempoolTxCount).toLocaleString() : "—", color: "text-blue-400" },
                      ].map(({ icon: Icon, label, value, color }) => (
                        <div key={label} className="bg-secondary/50 rounded-xl p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon className={cn("w-3 h-3", color)} />
                            <span className="text-[10px] text-muted-foreground">{label}</span>
                          </div>
                          <div className={cn("text-xs font-bold font-mono", color)}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Avg block time + last checked */}
                    <div className="border-t border-border/50 pt-2 space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Avg block time</span>
                        <span className="text-foreground font-mono">~10 min</span>
                      </div>
                      {bsvChain?.medianTime ? (
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>Median block</span>
                          <span className="text-foreground font-mono">{fmtBlockAge(bsvChain.medianTime)}</span>
                        </div>
                      ) : null}
                      {bsvChain?.bsvUsd && bsvChain.bsvUsd > 0 ? (
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>BSV/USD (WoC)</span>
                          <span className="text-green-400 font-bold font-mono">${bsvChain.bsvUsd.toFixed(2)}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="text-[10px] text-muted-foreground/60 text-center">
                      Data from WhatsOnChain · updates every 60s
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Buy Crypto — global header CTA */}
          <button
            onClick={() => setBuyOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 hover:border-primary/60 rounded-lg text-xs font-bold transition-all hidden sm:flex"
            title="Buy crypto instantly"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Buy
          </button>

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

      <Suspense fallback={null}>
        <WalletConnectModal
          isOpen={isWalletModalOpen}
          onClose={closeWalletModal}
        />
      </Suspense>

      {/* Fixed tx status overlay — bottom right */}
      <TxStatusBar />

      {/* Ora — AI Trading Assistant (site-wide floating chat) */}
      <Suspense fallback={null}><AiAssistant /></Suspense>

      {/* Global Buy Crypto modal */}
      <Suspense fallback={null}>
        <BuyCryptoModal open={buyOpen} onClose={() => setBuyOpen(false)} defaultCoin="BSV" />
      </Suspense>
    </div>
  );
}
