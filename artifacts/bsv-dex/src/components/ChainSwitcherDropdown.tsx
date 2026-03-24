import { useState } from "react";
import { ChevronDown, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "@/hooks/use-toast";

const EVM_CHAINS = [
  { id: 1,      key: "eth",    name: "Ethereum",   symbol: "ETH",   badge: "L1", icon: "⟠",  color: "text-blue-400" },
  { id: 56,     key: "bsc",   name: "BNB Chain",  symbol: "BNB",   badge: "L1", icon: "🟡", color: "text-yellow-400" },
  { id: 43114,  key: "avax",  name: "Avalanche",  symbol: "AVAX",  badge: "L1", icon: "🔺", color: "text-red-400" },
  { id: 250,    key: "ftm",   name: "Fantom",     symbol: "FTM",   badge: "L1", icon: "👻", color: "text-blue-300" },
  { id: 25,     key: "cro",   name: "Cronos",     symbol: "CRO",   badge: "L1", icon: "🔵", color: "text-blue-400" },
  { id: 137,    key: "poly",  name: "Polygon",    symbol: "MATIC", badge: "L2", icon: "🟣", color: "text-purple-400" },
  { id: 42161,  key: "arb",   name: "Arbitrum",   symbol: "ETH",   badge: "L2", icon: "🔷", color: "text-blue-400" },
  { id: 10,     key: "op",    name: "Optimism",   symbol: "ETH",   badge: "L2", icon: "🔴", color: "text-red-400" },
  { id: 8453,   key: "base",  name: "Base",       symbol: "ETH",   badge: "L2", icon: "🔵", color: "text-blue-400" },
  { id: 59144,  key: "linea", name: "Linea",      symbol: "ETH",   badge: "L2", icon: "⬛", color: "text-gray-300" },
  { id: 324,    key: "zk",    name: "zkSync Era", symbol: "ETH",   badge: "L3", icon: "⚡", color: "text-green-300" },
  { id: 534352, key: "scroll",name: "Scroll",     symbol: "ETH",   badge: "L3", icon: "📜", color: "text-orange-300" },
  { id: 5000,   key: "mantle",name: "Mantle",     symbol: "MNT",   badge: "L3", icon: "🟢", color: "text-green-400" },
];

const OTHER_CHAINS = [
  { key: "bsv", name: "Bitcoin SV", symbol: "BSV", icon: "₿",  color: "text-green-400",  network: "bsv" as const },
  { key: "sol", name: "Solana",     symbol: "SOL", icon: "◎",  color: "text-purple-400", network: "sol" as const },
  { key: "btc", name: "Bitcoin",    symbol: "BTC", icon: "₿",  color: "text-orange-400", network: "btc" as const },
];

const BADGE_COLORS: Record<string, string> = {
  L1: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  L2: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  L3: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

interface Props {
  /**
   * When true the chain list expands inline (no absolute positioning).
   * Use this when rendering inside another dropdown to avoid overflow.
   */
  inline?: boolean;
}

export function ChainSwitcherDropdown({ inline = false }: Props) {
  const { chainId, network, address, connect, provider } = useWalletStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const currentEvmChain = EVM_CHAINS.find(c => c.id === chainId);
  const currentOther    = OTHER_CHAINS.find(c => c.network === network);

  const switchEvmChain = async (chain: typeof EVM_CHAINS[0]) => {
    if (!(window as any).ethereum) {
      toast({ title: "No EVM wallet", description: "Install MetaMask or another EVM wallet.", variant: "destructive" });
      return;
    }
    try {
      await (window as any).ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${chain.id.toString(16)}` }],
      });
      connect({ address: address!, provider: provider!, network: "evm", chainId: chain.id });
      toast({ title: `Switched to ${chain.name}`, description: `${chain.badge} · ${chain.symbol}` });
    } catch (err: any) {
      if (err?.code === 4902) {
        toast({ title: "Add network first", description: `${chain.name} isn't in your wallet yet. Add it in your wallet settings.`, variant: "destructive" });
      } else {
        toast({ title: "Switch failed", description: err?.message || "Could not switch chain.", variant: "destructive" });
      }
    }
    setOpen(false);
  };

  const label = currentEvmChain
    ? `${currentEvmChain.icon} ${currentEvmChain.name}`
    : currentOther
      ? `${currentOther.icon} ${currentOther.name}`
      : "Switch Chain";

  // ── Inline accordion (used inside WalletOptionsDropdown) ──────────────────
  if (inline) {
    return (
      <div>
        {/* Trigger */}
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-border bg-secondary/60 hover:bg-secondary transition-colors text-sm font-semibold text-foreground"
        >
          <span className="flex-1 text-left">{label}</span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
        </button>

        {/* Inline expanded list */}
        {open && (
          <div className="mt-2 rounded-xl border border-border bg-background/60 overflow-hidden">
            {/* EVM header */}
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold px-3 pt-2.5 pb-1">
              EVM Chains
            </p>
            <div className="px-1.5 pb-1.5 max-h-52 overflow-y-auto space-y-0.5">
              {EVM_CHAINS.map(chain => {
                const active = network === "evm" && chainId === chain.id;
                return (
                  <button
                    key={chain.id}
                    onClick={() => switchEvmChain(chain)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left",
                      active
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="text-sm leading-none w-5 text-center">{chain.icon}</span>
                    <span className="flex-1">{chain.name}</span>
                    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0", BADGE_COLORS[chain.badge])}>
                      {chain.badge}
                    </span>
                    {active && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Other networks */}
            <div className="border-t border-border">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold px-3 pt-2 pb-1">
                Other Networks
              </p>
              <div className="px-1.5 pb-1.5 space-y-0.5">
                {OTHER_CHAINS.map(chain => {
                  const active = network === chain.network;
                  return (
                    <button
                      key={chain.key}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left",
                        active
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className={cn("text-sm leading-none font-bold w-5 text-center", chain.color)}>{chain.icon}</span>
                      <span className="flex-1">{chain.name}</span>
                      <span className="text-[10px] text-muted-foreground/50 shrink-0">{chain.symbol}</span>
                      {active && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Standalone floating dropdown (original behaviour) ─────────────────────
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-xs font-semibold text-foreground transition-all"
      >
        <span>{label}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="p-3 border-b border-border">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Switch Network</p>
          </div>
          <div className="p-2 max-h-[420px] overflow-y-auto space-y-3">
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold px-2 py-1">EVM Chains</p>
              <div className="space-y-0.5">
                {EVM_CHAINS.map(chain => {
                  const active = network === "evm" && chainId === chain.id;
                  return (
                    <button
                      key={chain.id}
                      onClick={() => switchEvmChain(chain)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left",
                        active ? "bg-primary/10 text-foreground" : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="text-base leading-none">{chain.icon}</span>
                      <span className="flex-1">{chain.name}</span>
                      <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border", BADGE_COLORS[chain.badge])}>
                        {chain.badge}
                      </span>
                      {active && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold px-2 py-1">Other Networks</p>
              <div className="space-y-0.5">
                {OTHER_CHAINS.map(chain => {
                  const active = network === chain.network;
                  return (
                    <button
                      key={chain.key}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left",
                        active ? "bg-primary/10 text-foreground" : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className={cn("text-base leading-none font-bold", chain.color)}>{chain.icon}</span>
                      <span className="flex-1">{chain.name}</span>
                      <span className="text-[10px] text-muted-foreground/50">{chain.symbol}</span>
                      {active && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
