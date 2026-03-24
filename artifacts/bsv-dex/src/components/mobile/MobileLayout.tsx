import { useLocation } from "wouter";
import { BarChart2, Briefcase, Settings, ArrowRightLeft, Layers, Users2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useWalletStore } from "@/store/useWalletStore";
import { WalletConnectModal } from "@/components/WalletConnectModal";
import { WalletOptionsDropdown } from "@/components/WalletOptionsDropdown";

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
  const { isOpen: walletOpen, open: openWallet, close: closeWallet } = useWalletModalStore();
  const { address } = useWalletStore();
  const isActive = (tab: typeof TABS[0]) => {
    if (tab.exact) return location === "/";
    return location.startsWith(tab.path);
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Global brand header ── */}
      <div className="shrink-0 border-b border-border/40 z-50 flex items-center justify-between px-2 py-1 bg-card/95 backdrop-blur-sm">

        {/* Brand text */}
        <button
          onClick={() => navigate("/")}
          className="active:opacity-70 transition-opacity"
        >
          <BrandLogo textSize="text-xl" />
        </button>

        {/* Wallet button on right */}
        <div>
          {address ? (
            <WalletOptionsDropdown compact />
          ) : (
            <button
              onClick={() => openWallet()}
              className="flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-primary text-white px-3.5 py-[7px] rounded-lg text-[12px] font-semibold shadow-md shadow-primary/20 active:opacity-80 transition-opacity"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto overscroll-contain relative">
        {children}
      </div>

      {/* Bottom tab bar — 6 tabs */}
      <div className="shrink-0 flex items-stretch border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {TABS.map(tab => {
          const active = isActive(tab);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors active:bg-white/5"
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

      <WalletConnectModal isOpen={walletOpen} onClose={() => closeWallet()} />
    </div>
  );
}
