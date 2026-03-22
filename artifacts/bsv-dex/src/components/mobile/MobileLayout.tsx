import { useLocation } from "wouter";
import { BarChart2, Briefcase, Settings, ArrowRightLeft, Layers, Users2 } from "lucide-react";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { WalletConnectModal } from "@/components/WalletConnectModal";

const TABS = [
  { path: "/", label: "Markets", Icon: BarChart2, exact: true },
  { path: "/trade/BSV-USDT", label: "Trade", Icon: ArrowRightLeft },
  { path: "/dex", label: "Mkt Hub", Icon: Layers },
  { path: "/p2p", label: "P2P", Icon: Users2 },
  { path: "/portfolio", label: "Portfolio", Icon: Briefcase },
  { path: "/settings", label: "Settings", Icon: Settings },
];

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { isOpen: walletOpen, close: closeWallet } = useWalletModalStore();

  const isActive = (tab: typeof TABS[0]) => {
    if (tab.exact) return location === "/";
    return location.startsWith(tab.path);
  };

  return (
    <div className="flex flex-col h-svh bg-background overflow-hidden">
      {/* Page content */}
      <div className="flex-1 overflow-y-auto overscroll-contain relative">
        {children}
      </div>

      {/* Bottom tab bar — 6 tabs, no wallet tab */}
      <div
        className="shrink-0 flex items-stretch border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {TABS.map(tab => {
          const active = isActive(tab);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors"
            >
              <tab.Icon
                size={22}
                className={active ? "text-primary" : "text-muted-foreground"}
                strokeWidth={active ? 2.5 : 1.5}
              />
              <span className={`text-[10px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      <WalletConnectModal isOpen={walletOpen} onClose={() => closeWallet()} />
    </div>
  );
}
