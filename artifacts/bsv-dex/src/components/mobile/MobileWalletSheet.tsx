import { useEffect, useRef, useState } from "react";
import {
  X, Copy, Check, LogOut, ArrowDownToLine, ArrowUpFromLine,
  ExternalLink, Wallet, TrendingUp, TrendingDown, RefreshCw,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletPrices } from "@/hooks/useWalletPrices";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { cn } from "@/lib/utils";

// BSV mock holdings (used when connected via BSV wallet)
const BSV_HOLDINGS = [
  { symbol: "BSV",  name: "Bitcoin SV",  amount: 18.4320,  color: "#EAB308", decimals: 4, priceKey: "BSV" },
  { symbol: "BTC",  name: "Bitcoin",     amount: 0.00412,  color: "#F97316", decimals: 5, priceKey: "BTC" },
  { symbol: "ETH",  name: "Ethereum",    amount: 0.3810,   color: "#8B5CF6", decimals: 4, priceKey: "ETH" },
  { symbol: "USDT", name: "Tether USD",  amount: 1250.00,  color: "#22C55E", decimals: 2, priceKey: "USDT" },
];

const NETWORK_LABEL: Record<string, { label: string; color: string }> = {
  bsv: { label: "BSV", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" },
  evm: { label: "EVM", color: "text-blue-400 bg-blue-400/10 border-blue-400/30" },
};

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtAmount(n: number, decimals: number) {
  if (n === 0) return "0";
  if (n < 0.000001) return n.toExponential(2);
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function fmtUsd(n: number) {
  if (n >= 1) return "$" + fmt(n, 2);
  if (n > 0)  return "$" + n.toFixed(4);
  return "$0.00";
}

export function MobileWalletSheet({ onClose }: { onClose: () => void }) {
  const { address, provider, network, chainId, disconnect } = useWalletStore();
  const { prices, loading: pricesLoading } = useWalletPrices(60_000);
  const { balances: evmBalances, loading: evmLoading, refresh: refreshEvm, lastFetch } = useEvmBalances(
    network === "evm" ? address : null,
    network === "evm" ? chainId : null
  );
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

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

  // Build asset list — real on-chain data for EVM, live-priced mock for BSV
  const assets = network === "evm"
    ? evmBalances
    : BSV_HOLDINGS.map((h) => {
        const p = prices[h.priceKey as keyof typeof prices];
        const price = p?.usd ?? 1;
        const change = p?.change24h ?? 0;
        return {
          symbol: h.symbol,
          name: h.name,
          amount: h.amount,
          usdValue: h.amount * price,
          price,
          change24h: change,
          color: h.color,
          decimals: h.decimals,
        };
      });

  const totalUsd = assets.reduce((s, a) => s + a.usdValue, 0);
  const isLoading = network === "evm" ? evmLoading : pricesLoading;
  const net = network ? NETWORK_LABEL[network] : null;

  // Format last-updated time
  const lastUpdatedStr = lastFetch
    ? new Date(lastFetch).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

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
          <div className="flex items-center gap-2">
            <button
              onClick={network === "evm" ? refreshEvm : undefined}
              disabled={isLoading}
              className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
              title="Refresh balances"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            </button>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Total balance */}
        <div className="px-5 py-5 text-center border-b border-border">
          <p className="text-xs text-muted-foreground mb-1">Total Balance</p>
          {isLoading && assets.length === 0 ? (
            <div className="h-9 w-36 bg-white/10 rounded-lg animate-pulse mx-auto" />
          ) : (
            <p className="text-3xl font-bold text-foreground">{fmtUsd(totalUsd)}</p>
          )}
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Assets</p>
            {lastUpdatedStr && (
              <p className="text-[9px] text-muted-foreground/60">Updated {lastUpdatedStr}</p>
            )}
          </div>

          {isLoading && assets.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
                  <div className="flex-1">
                    <div className="w-12 h-3 bg-white/10 rounded animate-pulse mb-1" />
                    <div className="w-20 h-2.5 bg-white/5 rounded animate-pulse" />
                  </div>
                  <div className="w-16 h-4 bg-white/10 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">No tokens found on this network</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">Deposit funds to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assets.map((a) => (
                <div key={a.symbol} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: a.color + "33", border: `1px solid ${a.color}55` }}
                    >
                      <span style={{ color: a.color }}>{a.symbol[0]}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{a.symbol}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtAmount(a.amount, a.decimals)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{fmtUsd(a.usdValue)}</p>
                    {a.change24h !== 0 && (
                      <p className={cn(
                        "text-[10px] flex items-center justify-end gap-0.5",
                        a.change24h >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {a.change24h >= 0
                          ? <TrendingUp className="w-2.5 h-2.5" />
                          : <TrendingDown className="w-2.5 h-2.5" />
                        }
                        {Math.abs(a.change24h).toFixed(2)}%
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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
