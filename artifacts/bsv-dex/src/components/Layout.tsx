import { ReactNode, useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Wallet, LayoutDashboard, LineChart, ArrowRightLeft, Menu, X, Sun, Moon, Monitor, Smartphone, Layers, Users, CreditCard, Bell, BellOff, CheckCheck, Info, AlertTriangle, Megaphone, Link2, ShoppingCart, Zap, Trash2, Copy, ExternalLink, Cpu, Waves, Gauge, Shield, Settings, RotateCcw, LogIn, LogOut, ChevronRight, Sparkles, Target, Upload, Droplets, Headphones, MessageCircle, ArrowUpDown, TrendingUp, Search, Moon as MoonIcon, Filter } from "lucide-react";
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
import { usePriceAlertsWatcher } from "@/hooks/usePriceAlertsWatcher";
import { primeAudioContext } from "@/lib/notificationFx";
import { useSettingsStore } from "@/store/useSettingsStore";
import { CATEGORY_OF, ALL_CATEGORIES, CATEGORY_META, type NotifCategory } from "@/lib/notificationCategories";

/* ── Heavy modals — loaded only when first opened ── */
const WalletConnectModal = lazy(() => import("./WalletConnectModal").then(m => ({ default: m.WalletConnectModal })));
const AiAssistant        = lazy(() => import("./AiAssistant").then(m => ({ default: m.AiAssistant })));

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const THEME_ICONS = { dark: Moon, light: Sun, amoled: Smartphone, system: Monitor };
const THEME_CYCLE = ["dark", "light", "amoled", "system"] as const;
const THEME_LABELS = { dark: "Dark", light: "Light", amoled: "Amoled", system: "System" };

const NAV_LINKS = [
  { href: "/swap",                   label: "Exchange",   icon: Waves },
  { href: "/trade/BSV-USDT",         label: "Trade",      icon: ArrowRightLeft },
  { href: "/futures/BSV-USDT-PERP",  label: "Futures",    icon: LineChart },
  { href: "/markets",                label: "Markets",    icon: Activity },
  { href: "/dex",                    label: "Mkt Hub",    icon: Layers },
  { href: "/prediction",             label: "Predict",    icon: Target },
  { href: "/nft",                    label: "NFT",        icon: Sparkles },
  { href: "/wallet",                 label: "Wallet",     icon: Wallet },
  { href: "/portfolio",              label: "Portfolio",  icon: LayoutDashboard },
];

const NAV_MORE = [
  { href: "/p2p",       label: "P2P",       icon: Users },
  { href: "/copy",      label: "CopyVault", icon: Copy },
  { href: "/keeper",    label: "Keepers",   icon: Shield },
  { href: "/fees",      label: "Revenue",   icon: TrendingUp },
  { href: "/sovereign", label: "Sovereign", icon: Zap },
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
  order_placed:       ShoppingCart,
  order_filled:       CheckCheck,
  order_cancelled:    AlertTriangle,
  trade:              Zap,
  bridge:             Link2,
  price_alert:        Activity,
  wallet_connected:   LogIn,
  wallet_disconnected: LogOut,
  withdrawal:         Upload,
  liquidity:          Droplets,
  support:            Headphones,
  support_reply:      MessageCircle,
  info:               Info,
  warning:            AlertTriangle,
  success:            CheckCheck,
  error:              AlertTriangle,
};

const NOTIF_TYPE_COLOR: Record<string, string> = {
  order_placed:       "text-blue-400",
  order_filled:       "text-green-400",
  order_cancelled:    "text-amber-400",
  trade:              "text-violet-400",
  bridge:             "text-cyan-400",
  price_alert:        "text-orange-400",
  wallet_connected:   "text-green-400",
  wallet_disconnected: "text-amber-400",
  withdrawal:         "text-orange-400",
  liquidity:          "text-cyan-400",
  support:            "text-violet-400",
  support_reply:      "text-emerald-400",
  info:               "text-blue-400",
  warning:            "text-amber-400",
  success:            "text-green-400",
  error:              "text-red-400",
};

const SEEN_ANN_KEY = "orahdex_announcements_seen_v1";

function loadSeenAnnouncements(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_ANN_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch { return new Set(); }
}

function saveSeenAnnouncements(ids: Set<string>) {
  try { localStorage.setItem(SEEN_ANN_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

function usePlatformAnnouncements() {
  const [notifs, setNotifs] = useState<PlatformNotif[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => loadSeenAnnouncements());
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
  const unseenCount = notifs.filter(n => !seen.has(n.id)).length;
  const markAllSeen = () => {
    const next = new Set(seen);
    notifs.forEach(n => next.add(n.id));
    setSeen(next);
    saveSeenAnnouncements(next);
  };
  return { notifs, unseenCount, markAllSeen };
}

function getNotifPath(n: { type: string; pair?: string; href?: string }): string | null {
  if (n.href) return n.href;
  const { type, pair } = n;
  if (pair) {
    const urlPair = pair.replace("/", "-"); // "BSV/USDT" → "BSV-USDT"
    const isFutures = urlPair.includes("PERP");
    if (["order_placed", "order_filled", "order_cancelled", "trade", "price_alert", "error"].includes(type)) {
      return isFutures ? `/futures/${urlPair}` : `/trade/${urlPair}`;
    }
  }
  if (type === "bridge") return "/swap";
  if (type === "wallet_connected" || type === "wallet_disconnected") return "/portfolio";
  if (type === "withdrawal") return "/portfolio";
  if (type === "liquidity") return "/liquidity";
  if (type === "support") return "/admin/support/inbox";
  if (type === "order_placed" || type === "order_cancelled") return "/portfolio";
  return null;
}

export function Layout({ children }: { children: ReactNode }) {
  usePriceAlertsWatcher();

  // Most browsers suspend AudioContext until a user gesture. Prime it on the
  // first interaction (iOS Safari requires touchstart specifically + a silent
  // buffer play, which primeAudioContext does internally).
  useEffect(() => {
    const onGesture = () => {
      primeAudioContext();
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("touchstart", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("click", onGesture);
    };
    window.addEventListener("pointerdown", onGesture, { passive: true });
    window.addEventListener("touchstart", onGesture, { passive: true });
    window.addEventListener("keydown", onGesture);
    window.addEventListener("click", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("touchstart", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("click", onGesture);
    };
  }, []);

  const [location, navigate] = useLocation();
  const { address, network, provider, chainId } = useWalletStore();
  const { theme, setTheme } = useThemeStore();
  const { isOpen: isWalletModalOpen, open: openWalletModal, close: closeWalletModal } = useWalletModalStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showMoreNav, setShowMoreNav] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<"all" | "unread" | NotifCategory>("all");
  const [notifSearch, setNotifSearch] = useState("");
  const dndUntil = useSettingsStore((s) => s.dndUntil);
  const setDndUntil = useSettingsStore((s) => s.setDndUntil);
  // Re-render every minute so DND auto-expires visually without action.
  const [, _tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => _tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const dndActive = dndUntil !== null && Date.now() < dndUntil;
  const [bsvPopover, setBsvPopover] = useState(false);
  const bsvPopoverRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const { data: bsvChain } = useBsvChain();
  const bsvOnline = bsvChain?.online ?? false;
  const bsvBlock  = bsvChain?.blockHeight ?? 0;
  const { notifs: announcements, unseenCount: announcementsUnseen, markAllSeen: markAnnouncementsSeen } = usePlatformAnnouncements();
  const { notifications, addNotification, markRead, markAllRead, clearAll, unreadCount } = useNotificationStore();
  const unread = unreadCount() + announcementsUnseen;
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

  // Periodic EVM balance refresh for the compact header button (every 30s)
  useEffect(() => {
    if (!address || network !== "evm" || !chainId) return;
    const refresh = async () => {
      const reown = await import("@/lib/reown").catch(() => null);
      if (!reown) return;
      const bal = await reown.fetchEvmBalance(address, chainId);
      if (bal !== null) useWalletStore.getState().setBalance(bal);
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [address, network, chainId]);

  useEffect(() => {
    const prev = prevAddressRef.current;
    if (!prev && address) {
      const shortAddr = address.length > 12
        ? `${address.slice(0, 6)}…${address.slice(-4)}`
        : address;
      const networkLabel = network === "bsv" ? "BSV" : network === "sol" ? "Solana" : network === "btc" ? "Bitcoin" : network === "tron" ? "TRON" : "EVM";
      const providerLabel = (provider === 'reown' || provider === 'orah-wallet') ? 'Orah Wallet' : (provider ?? networkLabel);
      toast({
        title: "Wallet Connected",
        description: `${providerLabel} · ${shortAddr}`,
      });
      addNotification({
        type: "wallet_connected",
        title: "Wallet Connected",
        body: `${providerLabel} · ${shortAddr} · ready to trade`,
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
      toast({ title: "Wallet Disconnected", description: "Your wallet session has ended." });
      addNotification({
        type: "wallet_disconnected",
        title: "Wallet Disconnected",
        body: `${prev.slice(0, 6)}…${prev.slice(-4)} · session ended`,
      });
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

  const handleNotifClick = useCallback((n: { id: string; type: string; pair?: string; href?: string }) => {
    markRead(n.id);
    const dest = getNotifPath(n);
    if (!dest) return;
    setNotifOpen(false);
    if (dest.startsWith("http")) {
      window.open(dest, "_blank", "noopener,noreferrer");
    } else {
      navigate(dest);
    }
  }, [markRead, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <header className="sticky top-0 h-14 border-b border-border bg-card/95 backdrop-blur-sm flex items-center justify-between px-3 shrink-0 z-40">
        <div className="flex items-center gap-2">
          {/* Hamburger — left side */}
          <button
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors shrink-0"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle navigation"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {/* Brand */}
          <Link href="/swap" className="flex items-center group">
            <BrandLogo textSize="text-lg" />
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors text-xs font-medium"
            title={`Switch theme — currently ${THEME_LABELS[safeTheme]}`}
          >
            <ThemeIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{THEME_LABELS[safeTheme]}</span>
          </button>

          {/* Settings link */}
          <Link
            href="/settings"
            className={cn(
              "p-2 rounded-lg transition-colors",
              location.startsWith("/settings")
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => {
                setNotifOpen(o => !o);
                if (!notifOpen) {
                  markAllRead();
                  markAnnouncementsSeen();
                }
              }}
              className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
              title={dndActive ? "Notifications (Do Not Disturb on)" : "Notifications"}
            >
              {dndActive ? <BellOff className="w-4 h-4 text-amber-400" /> : <Bell className="w-4 h-4" />}
              {unread > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center leading-none">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col" style={{ maxHeight: "480px" }}>
                {/* Header */}
                <div className="px-4 py-2.5 border-b border-border bg-secondary/30 shrink-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Megaphone className="w-3.5 h-3.5 text-primary" />
                      <span className="font-semibold text-sm">Notifications</span>
                      {(notifications.length + announcements.length) > 0 && (
                        <span className="text-[10px] text-muted-foreground">({notifications.length + announcements.length})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* DND quick toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (dndActive) setDndUntil(null);
                          else setDndUntil(Date.now() + 60 * 60 * 1000); // 1h
                        }}
                        className={cn(
                          "flex items-center gap-1 text-[10px] transition-colors",
                          dndActive ? "text-amber-400" : "text-muted-foreground hover:text-amber-400",
                        )}
                        title={dndActive ? "Disable Do Not Disturb" : "Snooze for 1 hour"}
                      >
                        {dndActive ? <BellOff className="w-3 h-3" /> : <MoonIcon className="w-3 h-3" />}
                        {dndActive ? "DND" : "Snooze"}
                      </button>
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
                  </div>

                  {/* DND active banner with snooze options */}
                  {dndActive && (
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                      <span className="text-[10px] text-amber-400 font-medium">
                        Quiet until {dndUntil! >= Number.MAX_SAFE_INTEGER ? "off" : new Date(dndUntil!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDndUntil(null); }}
                        className="text-[10px] text-amber-400 hover:underline font-semibold"
                      >
                        Resume
                      </button>
                    </div>
                  )}
                  {!dndActive && (notifications.length + announcements.length) > 3 && (
                    <div className="flex items-center gap-1">
                      {[
                        { label: "15m", ms: 15 * 60 * 1000 },
                        { label: "1h",  ms: 60 * 60 * 1000 },
                        { label: "8h",  ms: 8 * 60 * 60 * 1000 },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          onClick={(e) => { e.stopPropagation(); setDndUntil(Date.now() + opt.ms); }}
                          className="px-2 py-0.5 text-[10px] rounded bg-muted/40 hover:bg-amber-500/10 hover:text-amber-400 text-muted-foreground transition-colors"
                          title={`Mute for ${opt.label}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Search + filter tabs (only show when there's content) */}
                  {(notifications.length + announcements.length) > 0 && (
                    <>
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/60" />
                        <input
                          type="text"
                          value={notifSearch}
                          onChange={(e) => setNotifSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Search notifications…"
                          className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-background/60 border border-border rounded-md focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
                        />
                      </div>
                      <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 scrollbar-none">
                        {([
                          { id: "all",    label: "All" },
                          { id: "unread", label: `Unread${unreadCount() > 0 ? ` (${unreadCount()})` : ""}` },
                          ...ALL_CATEGORIES.map((c) => ({ id: c, label: CATEGORY_META[c].label.split(" ")[0] })),
                        ] as const).map((tab) => (
                          <button
                            key={tab.id}
                            onClick={(e) => { e.stopPropagation(); setNotifFilter(tab.id as typeof notifFilter); }}
                            className={cn(
                              "px-2 py-0.5 text-[10px] rounded-md font-semibold whitespace-nowrap transition-colors shrink-0",
                              notifFilter === tab.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                            )}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </>
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
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3 px-4">
                      <Bell className="w-7 h-7 opacity-20" />
                      <p className="text-xs font-medium">No notifications yet</p>
                      {!address ? (
                        <>
                          <p className="text-[10px] text-center text-muted-foreground/70">Connect your wallet to receive order fills, trade confirmations, and price alerts.</p>
                          <button
                            onClick={() => { setNotifOpen(false); openWalletModal(); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition-colors"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            Connect Wallet
                          </button>
                        </>
                      ) : (
                        <p className="text-[10px] text-center text-muted-foreground/70">Place an order or make a trade to see activity here.</p>
                      )}
                    </div>
                  ) : (() => {
                    const q = notifSearch.trim().toLowerCase();
                    const matchesSearch = (title: string, body: string) =>
                      !q || title.toLowerCase().includes(q) || body.toLowerCase().includes(q);
                    const filteredNotifs = notifications.filter((n) => {
                      if (notifFilter === "unread") return !n.read && matchesSearch(n.title, n.body);
                      if (notifFilter !== "all" && CATEGORY_OF[n.type] !== notifFilter) return false;
                      return matchesSearch(n.title, n.body);
                    });
                    const filteredAnns = (notifFilter === "all" || notifFilter === "system")
                      ? announcements.filter((a) => matchesSearch(a.title, a.body))
                      : [];
                    if (filteredNotifs.length === 0 && filteredAnns.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2 px-4">
                          <Filter className="w-6 h-6 opacity-20" />
                          <p className="text-xs font-medium">No matches</p>
                          <p className="text-[10px] text-center text-muted-foreground/70">Try a different filter or clear your search.</p>
                        </div>
                      );
                    }
                    return (
                    <>
                      {/* Trade / order notifications from store */}
                      {filteredNotifs.map(n => {
                        const Icon = NOTIF_TYPE_ICON[n.type] ?? Info;
                        const color = NOTIF_TYPE_COLOR[n.type] ?? "text-blue-400";
                        const dest = getNotifPath(n);
                        const relTime = (() => {
                          const diff = Date.now() - n.timestamp;
                          if (diff < 60_000) return "just now";
                          if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
                          if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
                          return new Date(n.timestamp).toLocaleDateString();
                        })();
                        return (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => handleNotifClick(n)}
                            disabled={!dest}
                            className={cn(
                              "w-full text-left px-4 py-3 border-b border-border/40 transition-colors last:border-0 group",
                              !n.read && "bg-primary/5",
                              dest ? "cursor-pointer hover:bg-muted/50 active:bg-muted" : "cursor-default",
                            )}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                                n.type === "wallet_connected" ? "bg-green-500/10" :
                                n.type === "wallet_disconnected" ? "bg-amber-500/10" :
                                n.type === "order_filled" || n.type === "success" ? "bg-green-500/10" :
                                n.type === "order_cancelled" || n.type === "error" ? "bg-red-500/10" :
                                n.type === "warning" ? "bg-amber-500/10" :
                                "bg-primary/10",
                              )}>
                                <Icon className={cn("w-3.5 h-3.5", color)} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <p className="text-xs font-semibold text-foreground leading-snug">{n.title}</p>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                                    {dest && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors" />}
                                  </div>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                                {n.txid && !n.txid.startsWith("htlc-pending-") && (
                                  (() => {
                                    const txExplorerUrl = n.href
                                      ?? (n.txid.startsWith("0x")
                                        ? `https://etherscan.io/tx/${n.txid}`
                                        : `https://whatsonchain.com/tx/${n.txid}`);
                                    return (
                                  <a
                                    href={txExplorerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline font-mono mt-0.5"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {n.txid.slice(0, 12)}… <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                    );
                                  })()
                                )}
                                <p className="text-[10px] text-muted-foreground/40 mt-0.5">{relTime}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}

                      {/* Platform announcements (from admin panel) */}
                      {filteredAnns.map(n => {
                        const color = NOTIF_TYPE_COLOR[n.type] ?? "text-blue-400";
                        return (
                          <div key={n.id} className="px-4 py-3 border-b border-border/40 transition-colors last:border-0 bg-secondary/10">
                            <div className="flex items-start gap-2.5">
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-primary/10">
                                <Megaphone className={cn("w-3.5 h-3.5", color)} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Platform</span>
                                </div>
                                <p className="text-xs font-semibold text-foreground leading-snug">{n.title}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                                <p className="text-[10px] text-muted-foreground/40 mt-1">
                                  {new Date(n.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* BSV LIVE badge — clickable popover with full on-chain details */}
          {!address && (
            <div className="relative hidden sm:block" ref={bsvPopoverRef}>
              <button
                onClick={() => setBsvPopover(p => !p)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/30 border border-green-500/30 text-xs font-semibold uppercase tracking-wider select-none hover:bg-green-500/10 transition-colors"
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

          {address ? (
            <WalletOptionsDropdown />
          ) : (
            <button
              onClick={() => openWalletModal()}
              className="flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-primary text-white px-2.5 py-1.5 rounded-lg font-semibold text-xs shadow-md shadow-primary/20 hover:brightness-110 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/30 active:scale-95 transition-all"
            >
              <Wallet className="w-3 h-3" />
              <span className="hidden sm:inline">Connect Wallet</span>
              <span className="sm:hidden">Connect</span>
            </button>
          )}

        </div>
      </header>

      {/* ── Nav Drawer overlay (all screen sizes) ── */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Drawer panel */}
          <div
            className="relative w-64 bg-card border-r border-border flex flex-col shadow-2xl animate-in slide-in-from-left duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 h-16 border-b border-border shrink-0">
              <Link href="/swap" onClick={() => setIsMobileMenuOpen(false)}>
                <BrandLogo textSize="text-lg" />
              </Link>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
              {NAV_LINKS.map((link) => {
                const isActive = location.startsWith("/" + link.href.split("/")[1]);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <link.icon className="w-5 h-5 shrink-0" />
                    <span className="text-sm">{link.label}</span>
                    {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                  </Link>
                );
              })}

              {/* More section */}
              <button
                onClick={() => setShowMoreNav(v => !v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all"
              >
                <Gauge className="w-5 h-5 shrink-0" />
                <span className="text-sm">More</span>
                <ChevronRight className={cn("w-4 h-4 ml-auto transition-transform", showMoreNav && "rotate-90")} />
              </button>

              {showMoreNav && (
                <div className="pl-2 space-y-0.5 border-l border-border ml-4">
                  {NAV_MORE.map((link) => {
                    const isActive = location.startsWith("/" + link.href.split("/")[1]);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-xl font-medium transition-all text-sm",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        <link.icon className="w-4 h-4 shrink-0" />
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </nav>

            {/* Bottom: Settings + wallet CTA */}
            <div className="border-t border-border px-2 py-3 space-y-1">
              <Link
                href="/settings"
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all",
                  location.startsWith("/settings")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Settings className="w-5 h-5 shrink-0" />
                <span className="text-sm">Settings</span>
              </Link>
              {!address && (
                <button
                  onClick={() => { openWalletModal(); setIsMobileMenuOpen(false); }}
                  className="mt-1 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-500 to-primary text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/30 hover:brightness-110 transition-all"
                >
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main content (full width always) ── */}
      <main className="flex-1 min-w-0 relative z-0">
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

      {/* Ora — AI Trading Assistant — only shown on exchange/trading pages */}
      {(location.startsWith("/trade") || location.startsWith("/futures") || location.startsWith("/swap")) && (
        <Suspense fallback={null}><AiAssistant /></Suspense>
      )}

    </div>
  );
}
