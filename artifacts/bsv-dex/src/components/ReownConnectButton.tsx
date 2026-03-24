import { useEffect, useState } from "react";
import { Wallet, ChevronDown, LogOut, Copy, Check, ExternalLink } from "lucide-react";
import { openReownModal, subscribeReownAccount, isReownReady, fetchEvmBalance, parseChainFromCaip } from "@/lib/reown";
import { useWalletStore } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "appkit-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        size?: "sm" | "md";
        label?: string;
        loadingLabel?: string;
        disabled?: boolean;
        balance?: "show" | "hide";
      };
      "appkit-account-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        balance?: "show" | "hide";
      };
      "appkit-network-button": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

interface ReownConnectButtonProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showBalance?: boolean;
  variant?: "default" | "compact" | "icon";
}

export function ReownConnectButton({
  className,
  size = "md",
  showBalance = false,
  variant = "default",
}: ReownConnectButtonProps) {
  const [ready, setReady] = useState(false);
  const [reownAddr, setReownAddr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const { disconnect } = useWalletStore();

  useEffect(() => {
    let tries = 0;
    const check = setInterval(() => {
      if (isReownReady()) {
        setReady(true);
        clearInterval(check);
      }
      if (++tries > 30) clearInterval(check);
    }, 200);
    return () => clearInterval(check);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const unsub = subscribeReownAccount(state => {
      setReownAddr(state.isConnected && state.address ? state.address : null);
    });
    return unsub;
  }, [ready]);

  const copyAddr = async () => {
    if (!reownAddr) return;
    await navigator.clipboard.writeText(reownAddr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  if (!ready) {
    return (
      <button
        disabled
        className={cn(
          "flex items-center gap-2 rounded-xl border border-border bg-card/60 text-muted-foreground opacity-50 cursor-not-allowed",
          size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
          className
        )}
      >
        <Wallet className="w-3.5 h-3.5" />
        <span>Connect</span>
      </button>
    );
  }

  if (reownAddr && variant !== "icon") {
    return (
      <div className="relative">
        <button
          onClick={() => setDropOpen(o => !o)}
          className={cn(
            "flex items-center gap-2 rounded-xl border transition-all",
            "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
            size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
            className
          )}
        >
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="font-mono font-semibold">{shortAddr(reownAddr)}</span>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", dropOpen && "rotate-180")} />
        </button>

        {dropOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="p-3 border-b border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">EVM Wallet Connected</p>
              <p className="text-xs font-mono text-foreground break-all">{reownAddr}</p>
            </div>
            <div className="p-1.5 space-y-0.5">
              <button onClick={copyAddr} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy address"}
              </button>
              <button onClick={() => { openReownModal("Account"); setDropOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
                <ExternalLink className="w-3.5 h-3.5" />
                View account
              </button>
              <button onClick={() => { openReownModal("Networks"); setDropOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
                <ExternalLink className="w-3.5 h-3.5" />
                Switch network
              </button>
              <div className="border-t border-border my-1" />
              <button
                onClick={() => {
                  disconnect();
                  setDropOpen(false);
                  openReownModal("Connect");
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-destructive/80 hover:text-destructive hover:bg-destructive/5 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          </div>
        )}
        {dropOpen && <div className="fixed inset-0 z-40" onClick={() => setDropOpen(false)} />}
      </div>
    );
  }

  return (
    <button
      onClick={() => openReownModal("Connect")}
      className={cn(
        "flex items-center gap-2 rounded-xl border transition-all font-semibold",
        "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:border-primary/60",
        size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-6 py-3 text-base" : "px-4 py-2 text-sm",
        className
      )}
    >
      <svg viewBox="0 0 32 32" className={cn("shrink-0", size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4")} fill="none">
        <path d="M9.58 12.26c3.54-3.46 9.28-3.46 12.82 0l.43.42a.44.44 0 0 1 0 .63l-1.45 1.42a.23.23 0 0 1-.32 0l-.59-.57c-2.47-2.41-6.48-2.41-8.95 0l-.63.61a.23.23 0 0 1-.32 0L9.14 13.35a.44.44 0 0 1 0-.63l.44-.46Zm15.84 2.96 1.3 1.27a.44.44 0 0 1 0 .63l-5.84 5.7a.46.46 0 0 1-.64 0l-4.14-4.05a.11.11 0 0 0-.16 0l-4.14 4.05a.46.46 0 0 1-.64 0l-5.84-5.7a.44.44 0 0 1 0-.63l1.3-1.27a.46.46 0 0 1 .64 0l4.14 4.05c.04.04.12.04.16 0l4.14-4.05a.46.46 0 0 1 .64 0l4.14 4.05c.04.04.12.04.16 0l4.14-4.05a.46.46 0 0 1 .64 0Z" fill="currentColor"/>
      </svg>
      {variant !== "icon" && <span>Connect Wallet</span>}
    </button>
  );
}

/**
 * Full-width Reown connect panel for use inside modals or dropdowns.
 */
export function ReownConnectPanel({ onConnected }: { onConnected?: (addr: string) => void }) {
  const [ready, setReady] = useState(false);
  const { connect, setBalance } = useWalletStore();

  useEffect(() => {
    let tries = 0;
    const check = setInterval(() => {
      if (isReownReady()) { setReady(true); clearInterval(check); }
      if (++tries > 30) clearInterval(check);
    }, 200);
    return () => clearInterval(check);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const unsub = subscribeReownAccount(async (state) => {
      if (state.isConnected && state.address) {
        const chainId = parseChainFromCaip(state.caipAddress) ?? undefined;
        connect({ address: state.address, provider: "reown", network: "evm", chainId });
        onConnected?.(state.address);
        // Fetch native ETH/EVM balance in background and push to store
        const bal = await fetchEvmBalance(state.address, chainId ?? null);
        if (bal !== null) setBalance(bal);
      }
    });
    return unsub;
  }, [ready, connect, setBalance, onConnected]);

  const chains = [
    "Ethereum", "Polygon", "Arbitrum", "Optimism", "Base",
    "BNB Chain", "Avalanche", "Linea", "zkSync", "Scroll",
  ];

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-8 h-8 text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="3" />
            <path d="M2 10h20" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">Connect EVM Wallet</h3>
          <p className="text-xs text-muted-foreground mt-1">
            MetaMask, Coinbase, Trust, Ledger, and 500+ wallets supported
          </p>
        </div>
      </div>

      {!ready ? (
        <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
          <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
          Initializing…
        </div>
      ) : (
        <button
          onClick={() => openReownModal("Connect")}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-primary/20 to-blue-500/10 border border-primary/30 text-primary font-bold text-sm hover:from-primary/25 hover:to-blue-500/15 transition-all"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="3" />
            <path d="M2 10h20" />
          </svg>
          Connect Wallet
        </button>
      )}

      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-2 px-1">Supported EVM Networks</p>
        <div className="flex flex-wrap gap-1.5">
          {chains.map(chain => (
            <span key={chain} className="px-2 py-1 rounded-lg bg-white/5 border border-border text-[10px] text-muted-foreground">{chain}</span>
          ))}
          <span className="px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[10px] text-primary font-semibold">+3 more</span>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-primary shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Scan QR with your mobile wallet, or connect directly from the browser extension.
        </p>
      </div>
    </div>
  );
}
