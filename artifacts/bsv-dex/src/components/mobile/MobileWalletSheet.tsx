import { useEffect, useRef, useState } from "react";
import {
  X, Copy, Check, LogOut, ArrowDownToLine, ArrowUpFromLine,
  ExternalLink, ChevronDown, Wallet,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";

const MOCK_BALANCES = [
  { symbol: "USDT", amount: "1,250.00", usd: "1,250.00", color: "#22C55E" },
  { symbol: "BSV",  amount: "18.4320",  usd: "1,015.45", color: "#EAB308" },
  { symbol: "BTC",  amount: "0.00412",  usd: "283.56",   color: "#F97316" },
  { symbol: "ETH",  amount: "0.3810",   usd: "791.84",   color: "#8B5CF6" },
];

const NETWORK_LABEL: Record<string, { label: string; color: string }> = {
  bsv: { label: "BSV",      color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" },
  evm: { label: "EVM",      color: "text-blue-400 bg-blue-400/10 border-blue-400/30" },
};

export function MobileWalletSheet({ onClose }: { onClose: () => void }) {
  const { address, provider, network, disconnect } = useWalletStore();
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleDisconnect = () => {
    disconnect();
    handleClose();
  };

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortAddr = address
    ? `${address.slice(0, 6)}...${address.slice(-6)}`
    : "";

  const totalUsd = MOCK_BALANCES.reduce(
    (s, b) => s + parseFloat(b.usd.replace(",", "")),
    0
  ).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const net = network ? NETWORK_LABEL[network] : null;

  return (
    <div
      ref={overlayRef}
      className={cn(
        "fixed inset-0 z-50 transition-all duration-300",
        visible ? "bg-black/60 backdrop-blur-sm" : "bg-black/0 backdrop-blur-none"
      )}
      onClick={(e) => e.target === overlayRef.current && handleClose()}
    >
      {/* Sheet slides down from top */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 bg-card rounded-b-3xl shadow-2xl transition-transform duration-300 ease-out",
          visible ? "translate-y-0" : "-translate-y-full"
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">My Wallet</p>
              <p className="text-[10px] text-muted-foreground">{provider}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Total balance */}
        <div className="px-5 py-5 text-center border-b border-border">
          <p className="text-xs text-muted-foreground mb-1">Total Balance</p>
          <p className="text-3xl font-bold text-foreground">${totalUsd}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            {net && (
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider", net.color)}>
                {net.label}
              </span>
            )}
            <button
              onClick={copyAddress}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors font-mono"
            >
              {shortAddr}
              {copied
                ? <Check className="w-3 h-3 text-green-400 ml-0.5" />
                : <Copy className="w-3 h-3 ml-0.5" />
              }
            </button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-border">
          <button className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary font-semibold text-sm hover:bg-primary/15 transition-all">
            <ArrowDownToLine className="w-4 h-4" />
            Deposit
          </button>
          <button className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/5 border border-border text-foreground font-semibold text-sm hover:bg-white/8 transition-all">
            <ArrowUpFromLine className="w-4 h-4" />
            Withdraw
          </button>
        </div>

        {/* Token balances */}
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Assets</p>
          <div className="space-y-3">
            {MOCK_BALANCES.map((b) => (
              <div key={b.symbol} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: b.color + "33", border: `1px solid ${b.color}55` }}
                  >
                    <span style={{ color: b.color }}>{b.symbol[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{b.symbol}</p>
                    <p className="text-[10px] text-muted-foreground">{b.amount}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">${b.usd}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 flex gap-3">
          <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/5 border border-border text-muted-foreground text-sm font-medium hover:text-foreground transition-all">
            <ExternalLink className="w-4 h-4" />
            Explorer
          </button>
          <button
            onClick={handleDisconnect}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/15 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Disconnect
          </button>
        </div>

        {/* Bottom safe area */}
        <div style={{ paddingBottom: "env(safe-area-inset-bottom, 12px)" }} />
      </div>
    </div>
  );
}
