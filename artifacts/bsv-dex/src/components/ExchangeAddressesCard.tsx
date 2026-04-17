/**
 * ExchangeAddressesCard
 *
 * Collapsible card that shows the user's personal exchange deposit addresses
 * for both EVM (Ethereum) and BSV — fetched from the backend, unique per wallet.
 * Used on the Portfolio pages (mobile and desktop).
 */

import { useState, useEffect } from "react";
import {
  Wallet, ChevronDown, ChevronUp, Copy, Check, ArrowDownToLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AddressRowProps {
  label:     string;
  sublabel:  string;
  color:     string;
  address:   string | null;
  copied:    boolean;
  onCopy:    () => void;
}

function AddressRow({ label, sublabel, color, address, copied, onCopy }: AddressRowProps) {
  return (
    <div className="rounded-xl bg-muted/40 border border-border/40 p-2.5 space-y-1">
      <div className="flex items-center justify-between">
        <span className={cn("text-[10px] font-bold uppercase tracking-wide", color)}>{label}</span>
        <span className="text-[10px] text-muted-foreground">{sublabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[11px] font-mono text-foreground truncate">
          {address ?? "—"}
        </code>
        {address && (
          <button
            onClick={onCopy}
            className="shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Copy address"
          >
            {copied
              ? <Check size={12} className="text-green-400" />
              : <Copy size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

interface Props {
  walletAddress: string;
  defaultOpen?:  boolean;
}

export function ExchangeAddressesCard({ walletAddress, defaultOpen = false }: Props) {
  const [expanded,  setExpanded]  = useState(defaultOpen);
  const [evmAddr,   setEvmAddr]   = useState<string | null>(null);
  const [bsvAddr,   setBsvAddr]   = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [copiedEvm, setCopiedEvm] = useState(false);
  const [copiedBsv, setCopiedBsv] = useState(false);

  useEffect(() => {
    if (!expanded || !walletAddress) return;
    if (evmAddr && bsvAddr) return;
    setLoading(true);
    Promise.all([
      fetch(`${BASE}/api/deposit/address?walletAddress=${encodeURIComponent(walletAddress)}&chainId=1`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d?.depositAddress ?? null)
        .catch(() => null),
      fetch(`${BASE}/api/user/bsv-wallet`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ evmAddress: walletAddress }),
      }).then(r => r.ok ? r.json() : null)
        .then(d => d?.bsvAddress ?? null)
        .catch(() => null),
    ]).then(([evm, bsv]) => {
      setEvmAddr(evm);
      setBsvAddr(bsv);
      setLoading(false);
    });
  }, [expanded, walletAddress, evmAddr, bsvAddr]);

  const copyEvm = () => {
    if (!evmAddr) return;
    navigator.clipboard?.writeText(evmAddr);
    setCopiedEvm(true);
    setTimeout(() => setCopiedEvm(false), 2000);
  };

  const copyBsv = () => {
    if (!bsvAddr) return;
    navigator.clipboard?.writeText(bsvAddr);
    setCopiedBsv(true);
    setTimeout(() => setCopiedBsv(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Wallet size={13} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">Exchange Addresses</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">EVM · BSV</span>
          {expanded
            ? <ChevronUp   size={13} className="text-muted-foreground" />
            : <ChevronDown size={13} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Your personal deposit addresses — send funds here to credit your OrahDEX exchange balance.
          </p>

          {loading ? (
            <div className="space-y-2">
              <div className="h-12 bg-muted/40 rounded-xl animate-pulse" />
              <div className="h-12 bg-muted/40 rounded-xl animate-pulse" />
            </div>
          ) : (
            <div className="space-y-2">
              <AddressRow
                label="EVM (Ethereum)"
                sublabel="Deposit ETH / ERC-20"
                color="text-blue-400"
                address={evmAddr}
                copied={copiedEvm}
                onCopy={copyEvm}
              />
              <AddressRow
                label="BSV"
                sublabel="Deposit Bitcoin SV"
                color="text-orange-400"
                address={bsvAddr}
                copied={copiedBsv}
                onCopy={copyBsv}
              />
              <a
                href="/bridge?tab=deposit"
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-semibold border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
              >
                <ArrowDownToLine size={12} />
                Deposit Funds
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
