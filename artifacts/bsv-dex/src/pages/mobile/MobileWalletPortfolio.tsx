/**
 * MobileWalletPortfolio.tsx
 *
 * Combined "Wallet & Portfolio" page — a single nav tab that contains:
 *   • Portfolio segment → MobilePortfolio (exchange balances, orders, DeFi, history)
 *   • Wallet segment   → WalletPage       (sovereign wallet, chain addresses, backup)
 *
 * Both segments stay mounted (display:none when inactive) so their query-cache
 * and internal state survive tab switches without re-fetching.
 */

import { useState } from "react";
import { Briefcase, Wallet } from "lucide-react";
import { MobilePortfolio } from "./MobilePortfolio";
import WalletContent from "@/pages/Wallet";

type TopTab = "portfolio" | "wallet";

export function MobileWalletPortfolio({ defaultTab = "portfolio" }: { defaultTab?: TopTab }) {
  const [topTab, setTopTab] = useState<TopTab>(defaultTab);

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Segment control ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[hsl(var(--card))] border-b border-border px-3 pt-2 pb-2.5">
        <div className="flex bg-secondary/40 rounded-xl p-1 gap-1">
          <SegBtn
            active={topTab === "portfolio"}
            icon={<Briefcase size={13} />}
            label="Portfolio"
            onClick={() => setTopTab("portfolio")}
          />
          <SegBtn
            active={topTab === "wallet"}
            icon={<Wallet size={13} />}
            label="Wallet"
            onClick={() => setTopTab("wallet")}
          />
        </div>
      </div>

      {/* ── Portfolio segment — assets view only ─────────────────────────────── */}
      <div className={topTab === "portfolio" ? "flex-1" : "hidden"}>
        <MobilePortfolio visibleTabs={["assets"]} />
      </div>

      {/* ── Wallet segment — sovereign chains + DeFi / Orders / History ──────── */}
      <div className={topTab === "wallet" ? "flex-1" : "hidden"}>
        <WalletContent afterActions={
          <MobilePortfolio visibleTabs={["defi", "orders", "history"]} hidePreContent={true} />
        } />
      </div>

    </div>
  );
}

function SegBtn({
  active, icon, label, onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex-1 flex items-center justify-center gap-1.5 py-[9px] rounded-lg",
        "text-[12px] font-semibold transition-all active:scale-[0.97]",
        active
          ? "bg-card text-foreground shadow-sm border border-border/60"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}
