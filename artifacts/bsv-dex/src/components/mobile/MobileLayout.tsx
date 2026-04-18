import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { BarChart2, Briefcase, Settings, ArrowRightLeft, Layers, Sun, Moon, MonitorSmartphone, Circle, MessageCircle, QrCode, Cable, Image, Target, TrendingUp, Copy, Repeat, ArrowUpDown } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useWalletStore } from "@/store/useWalletStore";
import { WalletOptionsDropdown } from "@/components/WalletOptionsDropdown";
import { useThemeStore, type Theme } from "@/store/useThemeStore";
import { ChatWidget } from "@/components/ChatWidget";

const WalletConnectModal = lazy(() => import("@/components/WalletConnectModal").then(m => ({ default: m.WalletConnectModal })));

const NAV_TABS = [
  { path: "/swap",           matchPrefix: "/swap",       label: "Swap",      Icon: ArrowUpDown },
  { path: "/trade/BSV-USDT", matchPrefix: "/trade",      label: "Trade",     Icon: ArrowRightLeft },
  { path: "/markets",        matchPrefix: "/markets",    label: "Markets",   Icon: BarChart2 },
  { path: "/portfolio",      matchPrefix: "/portfolio",  label: "Portfolio", Icon: Briefcase },
  { path: "/settings",       matchPrefix: "/settings",   label: "Settings",  Icon: Settings },
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
  const [chatOpen, setChatOpen] = useState(false);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const handler = () => setChatOpen(true);
    window.addEventListener("mobile:openChat", handler);
    return () => window.removeEventListener("mobile:openChat", handler);
  }, []);

  const isActive = (tab: { matchPrefix: string }) => {
    if (location === "/" && tab.matchPrefix === "/markets") return true;
    return location.startsWith(tab.matchPrefix);
  };

  const activeIdx = NAV_TABS.findIndex(t => isActive(t));

  useEffect(() => {
    const el = tabRefs.current[activeIdx];
    if (el && navScrollRef.current) {
      const container = navScrollRef.current;
      const scrollLeft = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollLeft), behavior: "smooth" });
    }
  }, [activeIdx]);

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  const { icon: ThemeIcon, label: themeLabel } = THEME_META[theme];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      <div className="shrink-0 bg-card">
        <div className="flex items-center h-12">
          <button
            onClick={() => navigate("/swap")}
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

        <div className="relative">
          <div
            ref={navScrollRef}
            className="flex items-center gap-1 overflow-x-auto no-scrollbar px-2 pb-2"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {NAV_TABS.map((tab, i) => {
              const active = isActive(tab);
              return (
                <button
                  key={tab.path}
                  ref={el => { tabRefs.current[i] = el; }}
                  onClick={() => navigate(tab.path)}
                  className={`
                    flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5
                    text-[11px] font-semibold transition-all active:scale-95
                    ${active
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-secondary/40 text-muted-foreground border border-transparent hover:bg-secondary/60"
                    }
                  `}
                >
                  <tab.Icon size={13} strokeWidth={active ? 2.5 : 2} />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain relative">
        {children}
      </div>

      <Suspense fallback={null}>
        <WalletConnectModal isOpen={walletOpen} onClose={() => closeWallet()} />
      </Suspense>
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          title="Live Support"
          className="fixed bottom-6 right-4 z-50 rounded-full shadow-2xl bg-gradient-to-br from-primary/90 to-primary flex items-center justify-center active:scale-95 transition-transform"
          style={{ width: 48, height: 48, marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <MessageCircle size={20} className="text-white" />
        </button>
      )}
      <ChatWidget open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
