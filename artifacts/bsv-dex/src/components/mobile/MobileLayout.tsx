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
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Global brand header — grid: left-spacer | centre-logo | right-buttons ── */}
      <div className="shrink-0 grid h-12 border-b border-border/40 bg-card/95 backdrop-blur-sm z-50"
        style={{ gridTemplateColumns: "1fr auto 1fr" }}>

        {/* Col 1: empty — equals Col 3 width so logo is truly centred */}
        <div />

        {/* Col 2: logo + slogan, horizontally centred in its auto column */}
        <button
          onClick={() => navigate("/")}
          className="flex flex-col items-center justify-center px-3 active:opacity-70 transition-opacity whitespace-nowrap"
        >
          <span className="font-extrabold text-[16px] tracking-tight text-foreground leading-none">
            Orah<span className="text-primary">DEX</span>
          </span>
          <span className="text-[7px] text-muted-foreground tracking-wide uppercase font-semibold leading-none mt-0.5">
            Trade means DEX
          </span>
        </button>

        {/* Col 3: Buy + Wallet, right-aligned */}
        <div className="flex items-center justify-end gap-2 pr-4">
          <button
            onClick={() => setBuyOpen(true)}
            className="flex items-center gap-1 px-3 py-[6px] rounded-lg bg-green-500 text-white text-[12px] font-bold shadow-sm shadow-green-500/30 active:scale-95 transition-transform"
          >
            <CreditCard size={12} /> Buy
          </button>

          {address ? (
            <button
              onClick={() => openWallet()}
              className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2.5 py-[5px] rounded-lg active:opacity-70 transition-opacity max-w-[140px]"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
              <div className="flex flex-col items-start min-w-0">
                <span className="text-[11px] font-mono text-foreground leading-tight truncate">{shortenAddress(address)}</span>
                {balance && (
                  <span className="text-[9px] text-green-400 font-semibold leading-tight">{balance} ETH</span>
                )}
              </div>
            </button>
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
      <BuyCryptoModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </div>
  );
}
