import { useLocation } from "wouter";
import { BarChart2, Briefcase, Settings, Zap, Layers, Users2 } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { WalletConnectModal } from "@/components/WalletConnectModal";
import { useState } from "react";

const TABS = [
  { path: "/", label: "Markets", Icon: BarChart2, exact: true },
  { path: "/futures/BSV-USDT", label: "Futures", Icon: Zap },
  { path: "/dex", label: "Mkt Hub", Icon: Layers },
  { path: "/p2p", label: "P2P", Icon: Users2 },
  { path: "/portfolio", label: "Portfolio", Icon: Briefcase },
  { path: "/settings", label: "Settings", Icon: Settings },
];

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { address } = useWalletStore();
  const [walletOpen, setWalletOpen] = useState(false);

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

      {/* Bottom tab bar */}
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
              <span
                className={`text-[10px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* Connect wallet button */}
        <button
          onClick={() => setWalletOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1"
        >
          {address ? (
            <>
              <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              </div>
              <span className="text-[10px] font-medium text-green-500">
                {address.slice(0, 4)}…{address.slice(-3)}
              </span>
            </>
          ) : (
            <>
              <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              </div>
              <span className="text-[10px] font-medium text-primary">Wallet</span>
            </>
          )}
        </button>
      </div>

      <WalletConnectModal isOpen={walletOpen} onClose={() => setWalletOpen(false)} />
    </div>
  );
}
