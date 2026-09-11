import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, QrCode } from "lucide-react";
import { useAccount } from "wagmi";
import { useWalletStore } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";
import { LetsExchangePanel } from "@/components/LetsExchangePanel";

// ─── Main page ─────────────────────────────────────────────────────────────────

export function MobileHandCashBridge() {
  const [, navigate]  = useLocation();
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");

  const { address: wagmiAddress } = useAccount();
  const { address: storeAddress } = useWalletStore();
  const walletAddress = wagmiAddress ?? storeAddress ?? null;

  const handleBack = () => window.history.back();

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <button
          onClick={handleBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 text-foreground active:bg-secondary"
        >
          <ArrowLeft size={18} />
        </button>
        <p className="flex-1 text-center font-bold text-base">
          {mode === "deposit" ? "Deposit to your wallet" : "Withdraw from BSV"}
        </p>
        <button
          onClick={() => navigate("/qr-scan")}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 text-foreground active:bg-secondary"
        >
          <QrCode size={17} />
        </button>
      </div>

      {/* Mode toggle */}
      <div className="shrink-0 flex gap-2 px-4 py-3 border-b border-border/40 bg-secondary/20">
        {(["deposit", "withdraw"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
              mode === m
                ? "bg-green-500 text-black shadow-lg shadow-green-500/20"
                : "bg-secondary/60 text-muted-foreground active:bg-secondary",
            )}
          >
            {m === "deposit" ? "⬇ Deposit" : "⬆ Withdraw"}
          </button>
        ))}
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {mode === "deposit" ? (
          <LetsExchangePanel
            key="deposit"
            initialTo="BSV"
            walletAddress={walletAddress}
          />
        ) : (
          <LetsExchangePanel
            key="withdraw"
            initialFrom="BSV"
            walletAddress={walletAddress}
          />
        )}
      </div>
    </div>
  );
}
