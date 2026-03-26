/**
 * ContractAddressBadge
 *
 * Shows a token's contract address across chains — styled like Binance's
 * "Contract Address: 0x2170...f933f8 ▾" with a dropdown listing every chain.
 */
import { useState, useRef, useEffect } from "react";
import { Copy, Check, ExternalLink, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getContractAddresses, shortAddr, explorerUrl } from "@/lib/contracts";

interface ContractAddressBadgeProps {
  baseAsset: string;
  dbAddresses?: Record<string, string> | null;
  /** If "compact", shows only the inline chip (no full text label). */
  variant?: "full" | "compact" | "inline";
  className?: string;
}

export function ContractAddressBadge({
  baseAsset,
  dbAddresses,
  variant = "full",
  className,
}: ContractAddressBadgeProps) {
  const addresses = getContractAddresses(baseAsset, dbAddresses);
  const entries   = Object.entries(addresses);

  const [open,    setOpen]    = useState(false);
  const [copied,  setCopied]  = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (entries.length === 0) return null;

  // Primary entry — first one
  const [primaryChain, primaryAddr] = entries[0];
  const primaryShort = shortAddr(primaryAddr, 4);
  const primaryUrl   = explorerUrl(primaryChain, primaryAddr);

  const copyAddr = (addr: string, key: string) => {
    if (addr === "native") return;
    navigator.clipboard.writeText(addr);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (variant === "inline") {
    // Minimal single-line — "0x1234...5678"
    return (
      <div className={cn("relative inline-flex", className)} ref={dropRef}>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>{primaryShort}</span>
          {entries.length > 1 && <ChevronDown size={9} className={cn("transition-transform", open && "rotate-180")} />}
        </button>
        {open && entries.length > 1 && <ChainDropdown entries={entries} copied={copied} onCopy={copyAddr} onClose={() => setOpen(false)} />}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("relative inline-flex", className)} ref={dropRef}>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-secondary/50 border border-border hover:border-primary/30 transition-colors group"
        >
          <span className="text-[9px] text-muted-foreground font-medium">{primaryChain.split(" ")[0]}</span>
          <span className="text-[9px] font-mono text-muted-foreground group-hover:text-foreground">{primaryShort}</span>
          {entries.length > 1 && <ChevronDown size={8} className={cn("text-muted-foreground/60 transition-transform", open && "rotate-180")} />}
        </button>
        {open && <ChainDropdown entries={entries} copied={copied} onCopy={copyAddr} onClose={() => setOpen(false)} />}
      </div>
    );
  }

  // "full" variant — like Binance's row: "Contract Address: 0x2170...f933f8 ▾"
  return (
    <div className={cn("relative", className)} ref={dropRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 group"
      >
        <span className="text-[11px] text-muted-foreground">Contract:</span>
        <span className="text-[11px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
          {primaryShort}
        </span>
        {/* Copy button for primary */}
        <span
          role="button"
          tabIndex={0}
          onClick={e => { e.stopPropagation(); copyAddr(primaryAddr, "primary"); }}
          onKeyDown={e => e.key === "Enter" && copyAddr(primaryAddr, "primary")}
          className="text-muted-foreground hover:text-primary transition-colors"
        >
          {copied === "primary" ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
        </span>
        {/* Explore icon for primary */}
        {primaryUrl && (
          <a href={primaryUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
            className="text-muted-foreground hover:text-primary transition-colors">
            <ExternalLink size={9} />
          </a>
        )}
        {entries.length > 1 && (
          <ChevronDown size={10} className={cn("text-muted-foreground/60 transition-transform", open && "rotate-180")} />
        )}
      </button>

      {open && (
        <ChainDropdown entries={entries} copied={copied} onCopy={copyAddr} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

// ── Shared dropdown ────────────────────────────────────────────────────────
function ChainDropdown({
  entries,
  copied,
  onCopy,
  onClose,
}: {
  entries: [string, string][];
  copied: string | null;
  onCopy: (addr: string, key: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-0 top-full mt-1.5 z-50 w-[300px] bg-card border border-border rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Contract Addresses</p>
      </div>
      <div className="divide-y divide-border/50 max-h-56 overflow-y-auto">
        {entries.map(([chain, addr]) => {
          const url = explorerUrl(chain, addr);
          const isNative = addr === "native";
          const key = chain;
          return (
            <div key={chain} className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/4 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-foreground truncate">{chain}</div>
                <div className={cn("text-[10px] font-mono truncate", isNative ? "text-primary" : "text-muted-foreground")}>
                  {isNative ? "Native Asset" : addr}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!isNative && (
                  <button onClick={() => onCopy(addr, key)}
                    className="p-1 text-muted-foreground hover:text-primary rounded transition-colors">
                    {copied === key ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                  </button>
                )}
                {url && (
                  <a href={url} target="_blank" rel="noreferrer"
                    className="p-1 text-muted-foreground hover:text-primary rounded transition-colors">
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
