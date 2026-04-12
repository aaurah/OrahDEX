import { useState, useEffect, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { BarChart2, Briefcase, Settings, ArrowRightLeft, Layers, Users2, Sun, Moon, MonitorSmartphone, Circle, MessageCircle, QrCode, Cable, Image, FlaskConical, Target, MoreHorizontal, X, TrendingUp, Copy, Repeat } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useWalletStore } from "@/store/useWalletStore";
import { WalletOptionsDropdown } from "@/components/WalletOptionsDropdown";
import { useThemeStore, type Theme } from "@/store/useThemeStore";
import { ChatWidget } from "@/components/ChatWidget";

const WalletConnectModal = lazy(() => import("@/components/WalletConnectModal").then(m => ({ default: m.WalletConnectModal })));

const MAIN_TABS = [
  { path: "/markets", label: "Markets", Icon: BarChart2, exact: true },
  { path: "/trade/BSV-USDT", label: "Trade", Icon: ArrowRightLeft },
  { path: "/futures/BSV-USDT", label: "Futures", Icon: TrendingUp },
  { path: "/dex", label: "Mkt Hub", Icon: Layers },
];

const MORE_TABS = [
  { path: "/prediction", label: "Prediction", Icon: Target },
  { path: "/nft", label: "NFT", Icon: Image },
  { path: "/bridge", label: "Bridge", Icon: Cable },
  { path: "/copy-trading", label: "Copy Trade", Icon: Copy },
  { path: "/p2p", label: "P2P", Icon: Repeat },
  { path: "/portfolio", label: "Portfolio", Icon: Briefcase },
  { path: "/settings", label: "Settings", Icon: Settings },
];

const ALL_TABS = [...MAIN_TABS, ...MORE_TABS];

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
  const { address, isDemo } = useWalletStore();
  const { theme, setTheme } = useThemeStore();
  const [chatOpen, setChatOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const handler = () => setChatOpen(true);
    window.addEventListener("mobile:openChat", handler);
    return () => window.removeEventListener("mobile:openChat", handler);
  }, []);

  const isActive = (tab: { path: string; exact?: boolean }) => {
    if (tab.exact) return location === tab.path;
    return location.startsWith(tab.path);
  };

  const isMoreActive = MORE_TABS.some(t => isActive(t));

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  const { icon: ThemeIcon, label: themeLabel } = THEME_META[theme];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      <div className="shrink-0 border-b border-border/40 bg-card">
        <div className="flex items-center h-12">
          <button
            onClick={() => navigate("/")}
            className="flex items-center h-full px-2 active:opacity-70 transition-opacity shrink-0"
          >
            <BrandLogo textSize="text-2xl" />
          </button>

          <div className="flex-1" />

          <button
            onClick={cycleTheme}
            title={`Theme: ${themeLabel}`}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground active:bg-secondary transition-colors shrink-0 mr-2"
          >
            <ThemeIcon size={18} className="text-foreground/80" />
          </button>

          <button
            onClick={() => navigate("/qr-scan")}
            title="QR Scanner"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground active:bg-secondary transition-colors shrink-0 mr-1.5"
          >
            <QrCode size={17} className="text-foreground/80" />
          </button>

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

      {isDemo && (
        <div className="shrink-0 flex items-center justify-center gap-2 px-3 py-[5px] text-[10px] font-bold tracking-wide overflow-hidden"
          style={{ background: "rgba(234,179,8,0.18)", borderBottom: "1px solid rgba(234,179,8,0.4)", color: "#facc15" }}>
          <FlaskConical size={10} className="shrink-0" />
          <span className="truncate">DEMO MODE — Trades are simulated · No real funds</span>
          <FlaskConical size={10} className="shrink-0" />
        </div>
      )}

      <div className="flex-1 overflow-y-auto overscroll-contain relative">
        {children}
      </div>

      <div className="shrink-0 flex items-stretch border-t border-border bg-background"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {MAIN_TABS.map(tab => {
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
        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors active:bg-white/5"
        >
          <MoreHorizontal
            size={18}
            className={isMoreActive ? "text-primary" : "text-muted-foreground"}
            strokeWidth={isMoreActive ? 2.5 : 1.5}
          />
          <span className={`text-[10px] font-medium ${isMoreActive ? "text-primary font-bold" : "text-muted-foreground"}`}>
            More
          </span>
        </button>
      </div>

      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[91] bg-card border-t border-border rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-sm font-bold text-foreground">More</h3>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-muted-foreground"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-3 pb-4 grid grid-cols-4 gap-1">
              {MORE_TABS.map(tab => {
                const active = isActive(tab);
                return (
                  <button
                    key={tab.path}
                    onClick={() => { setMoreOpen(false); navigate(tab.path); }}
                    className={`flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-xl transition-colors ${active ? "bg-primary/10" : "hover:bg-white/5 active:bg-white/5"}`}
                  >
                    <tab.Icon
                      size={20}
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
          </div>
        </>
      )}

      <Suspense fallback={null}>
        <WalletConnectModal isOpen={walletOpen} onClose={() => closeWallet()} />
      </Suspense>
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
