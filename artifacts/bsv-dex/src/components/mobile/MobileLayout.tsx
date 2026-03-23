import { useState } from "react";
import { useLocation } from "wouter";
import { BarChart2, Briefcase, Settings, ArrowRightLeft, Layers, Users2, CreditCard } from "lucide-react";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useWalletStore } from "@/store/useWalletStore";
import { WalletConnectModal } from "@/components/WalletConnectModal";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";
import { shortenAddress } from "@/lib/utils";

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
  const { address, balance, disconnect } = useWalletStore();
  const [buyOpen, setBuyOpen] = useState(false);

  const isActive = (tab: typeof TABS[0]) => {
    if (tab.exact) return location === "/";
    return location.startsWith(tab.path);
  };

  return (
    <div className="flex flex-col h-svh bg-background overflow-hidden">
      {/* ── Global brand header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 h-11 border-b border-border/40 bg-card/95 backdrop-blur-sm z-50"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* Logo — tapping goes to home */}
        <button onClick={() => navigate("/")} className="flex items-center gap-2 active:opacity-70 transition-opacity">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 via-primary to-orange-400 flex items-center justify-center shadow-md shadow-primary/20">
            <span className="text-white font-black text-[11px] leading-none select-none">O</span>
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-extrabold text-sm tracking-tight text-foreground">
              Orah<span className="text-primary">DEX</span>
            </span>
            <span className="text-[8px] text-muted-foreground tracking-widest uppercase font-medium">Trade means DEX</span>
          </div>
        </button>

        {/* Right side: Buy + Wallet */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBuyOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500 text-white text-[11px] font-bold shadow-sm shadow-green-500/30 active:scale-95 transition-transform"
          >
            <CreditCard size={11} /> Buy
          </button>

          {address ? (
            <button
              onClick={() => openWallet()}
              className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2 py-1 rounded-lg active:opacity-70 transition-opacity"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
              <div className="flex flex-col items-start">
                <span className="text-[11px] font-mono text-foreground leading-tight">{shortenAddress(address)}</span>
                {balance && (
                  <span className="text-[9px] text-green-400 font-semibold leading-tight">{balance} ETH</span>
                )}
              </div>
            </button>
          ) : (
            <button
              onClick={() => openWallet()}
              className="flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-primary text-white px-3 py-1.5 rounded-lg text-[11px] font-semibold shadow-md shadow-primary/20"
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
      <BuyCryptoModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </div>
  );
}
