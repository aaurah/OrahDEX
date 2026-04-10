import { useState, useEffect, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { BarChart2, Briefcase, Settings, ArrowRightLeft, Layers, Users2, Sun, Moon, MonitorSmartphone, Circle, CreditCard, MessageCircle, QrCode, Cable, Image, FlaskConical } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useWalletStore } from "@/store/useWalletStore";
import { WalletOptionsDropdown } from "@/components/WalletOptionsDropdown";
import { useThemeStore, type Theme } from "@/store/useThemeStore";
import { ChatWidget } from "@/components/ChatWidget";

const WalletConnectModal = lazy(() => import("@/components/WalletConnectModal").then(m => ({ default: m.WalletConnectModal })));
const BuyCryptoModal     = lazy(() => import("@/components/BuyCryptoModal").then(m => ({ default: m.BuyCryptoModal })));

const TABS = [
  { path: "/markets", label: "Markets", Icon: BarChart2, exact: true },
  { path: "/trade/BSV-USDT", label: "Trade", Icon: ArrowRightLeft },
  { path: "/dex", label: "Mkt Hub", Icon: Layers },
  { path: "/nft", label: "NFT", Icon: Image },
  { path: "/bridge", label: "Bridge", Icon: Cable },
  { path: "/portfolio", label: "Portfolio", Icon: Briefcase },
  { path: "/settings", label: "Settings", Icon: Settings },
];

const THEME_CYCLE: Theme[] = ["dark", "light", "amoled", "system"];

const THEME_META: Record<Theme, { icon: React.ComponentType<{ size: number; className?: string }>; label: string }> = {
  dark:   { icon: Moon,              label: "Dark"   },
  light:  { icon: Sun,               label: "Light"  },
  amoled: { icon: Circle,            label: "AMOLED" },
  system: { icon: MonitorSmartphone, label: "System" },
};

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { isOpen: walletOpen, open: openWallet, close: closeWallet } = useWalletModalStore();
  const { address } = useWalletStore();
  const { theme, setTheme } = useThemeStore();
  const [buyOpen, setBuyOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const handler = () => setChatOpen(true);
    window.addEventListener("mobile:openChat", handler);
    return () => window.removeEventListener("mobile:openChat", handler);
  }, []);

  const isActive = (tab: typeof TABS[0]) => {
    if (tab.exact) return location === tab.path;
    return location.startsWith(tab.path);
  };

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  const { icon: ThemeIcon, label: themeLabel } = THEME_META[theme];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Global brand header ── */}
      <div className="shrink-0 border-b border-border/40 bg-card">
        <div className="flex items-center h-12">

          {/* Brand — hard left corner, no left padding */}
          <button
            onClick={() => navigate("/")}
            className="flex items-center h-full px-2 active:opacity-70 transition-opacity shrink-0"
          >
            <BrandLogo textSize="text-2xl" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            title={`Theme: ${themeLabel}`}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground active:bg-secondary transition-colors shrink-0 mr-2"
          >
            <ThemeIcon size={18} className="text-foreground/80" />
          </button>

          {/* QR Scan button */}
          <button
            onClick={() => navigate("/qr-scan")}
            title="QR Scanner"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground active:bg-secondary transition-colors shrink-0 mr-1.5"
          >
            <QrCode size={17} className="text-foreground/80" />
          </button>

          {/* Buy button */}
          <button
            onClick={() => setBuyOpen(true)}
            className="flex items-center gap-1 px-3 py-[6px] rounded-lg bg-green-500 text-white text-[12px] font-bold shadow-sm shadow-green-500/30 active:scale-95 transition-transform shrink-0 mr-2"
          >
            <CreditCard size={12} />
            Buy
          </button>

          {/* Wallet button */}
          <div className="shrink-0 pr-3">
            {address ? (
              <WalletOptionsDropdown compact />
            ) : (
              <button
                onClick={() => openWallet()}
                className="flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-primary text-white px-3.5 py-[7px] rounded-lg text-[12px] font-semibold shadow-md shadow-primary/20 active:opacity-80 transition-opacity"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Under Construction ribbon ── */}
      <div
        className="shrink-0 flex items-center justify-center gap-2 px-3 py-[5px] text-[10px] font-bold tracking-wide overflow-hidden"
        style={{
          background: "repeating-linear-gradient(90deg,rgba(245,158,11,0.15) 0px,rgba(239,68,68,0.1) 60px,rgba(139,92,246,0.1) 120px,rgba(245,158,11,0.15) 180px)",
          borderBottom: "1px solid rgba(245,158,11,0.35)",
          color: "#fbbf24",
        }}
      >
        <FlaskConical size={10} className="shrink-0 opacity-80" />
        <span className="truncate">🚧 UNDER CONSTRUCTION · ACTIVE TESTING · NOT FOR PRODUCTION USE</span>
        <FlaskConical size={10} className="shrink-0 opacity-80" />
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto overscroll-contain relative">
        {children}
      </div>

      {/* Bottom tab bar — 7 tabs */}
      <div className="shrink-0 flex items-stretch border-t border-border bg-background"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {TABS.map(tab => {
          const active = isActive(tab);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors active:bg-white/5"
            >
              <tab.Icon
                size={18}
                className={active ? "text-primary" : "text-muted-foreground"}
                strokeWidth={active ? 2.5 : 1.5}
              />
              <span className={`text-[10px] font-medium ${active ? "text-primary font-bold" : "text-muted-foreground"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      <Suspense fallback={null}>
        <WalletConnectModal isOpen={walletOpen} onClose={() => closeWallet()} />
      </Suspense>
      <Suspense fallback={null}>
        <BuyCryptoModal open={buyOpen} onClose={() => setBuyOpen(false)} defaultCoin="BSV" />
      </Suspense>
      {/* Floating chat button — bottom right */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          title="Live Support"
          className="fixed bottom-20 right-4 z-50 w-13 h-13 rounded-full shadow-2xl bg-gradient-to-br from-primary/90 to-primary flex items-center justify-center active:scale-95 transition-transform"
          style={{ width: 52, height: 52 }}
        >
          <MessageCircle size={22} className="text-white" />
        </button>
      )}
      <ChatWidget open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
