import { useState } from "react";
import { ChevronDown, CheckCircle2, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "@/hooks/use-toast";
import { switchReownChain, fetchEvmBalance, CHAIN_RPC_URLS } from "@/lib/reown";

interface ChainDef {
  id: number;
  key: string;
  name: string;
  symbol: string;
  badge: "L1" | "L2" | "L3";
  icon: string;
  color: string;
  rpcUrl: string;
  blockExplorerUrl: string;
  nativeName: string;
  nativeDecimals: number;
}

const EVM_CHAINS: ChainDef[] = [
  /* ─── L1 — Base Chains ─────────────────────────────────────── */
  {
    id: 1,
    key: "eth",
    name: "Ethereum",
    symbol: "ETH",
    badge: "L1",
    icon: "⟠",
    color: "text-blue-300",
    rpcUrl: "https://ethereum.publicnode.com",
    blockExplorerUrl: "https://etherscan.io",
    nativeName: "Ether",
    nativeDecimals: 18,
  },
  {
    id: 56,
    key: "bsc",
    name: "BNB Chain",
    symbol: "BNB",
    badge: "L1",
    icon: "🟡",
    color: "text-yellow-400",
    rpcUrl: "https://bsc-dataseed.binance.org",
    blockExplorerUrl: "https://bscscan.com",
    nativeName: "BNB",
    nativeDecimals: 18,
  },
  {
    id: 43114,
    key: "avax",
    name: "Avalanche",
    symbol: "AVAX",
    badge: "L1",
    icon: "🔺",
    color: "text-red-400",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    blockExplorerUrl: "https://snowtrace.io",
    nativeName: "Avalanche",
    nativeDecimals: 18,
  },
  {
    id: 250,
    key: "ftm",
    name: "Fantom",
    symbol: "FTM",
    badge: "L1",
    icon: "👻",
    color: "text-blue-300",
    rpcUrl: "https://rpc.ftm.tools",
    blockExplorerUrl: "https://ftmscan.com",
    nativeName: "Fantom",
    nativeDecimals: 18,
  },
  {
    id: 25,
    key: "cro",
    name: "Cronos",
    symbol: "CRO",
    badge: "L1",
    icon: "⬡",
    color: "text-indigo-400",
    rpcUrl: "https://evm.cronos.org",
    blockExplorerUrl: "https://cronoscan.com",
    nativeName: "Cronos",
    nativeDecimals: 18,
  },
  /* ─── L2 — Rollups & Sidechains ────────────────────────────── */
  {
    id: 137,
    key: "poly",
    name: "Polygon",
    symbol: "MATIC",
    badge: "L2",
    icon: "🟣",
    color: "text-purple-400",
    rpcUrl: "https://polygon-rpc.com",
    blockExplorerUrl: "https://polygonscan.com",
    nativeName: "MATIC",
    nativeDecimals: 18,
  },
  {
    id: 42161,
    key: "arb",
    name: "Arbitrum One",
    symbol: "ETH",
    badge: "L2",
    icon: "🔷",
    color: "text-sky-400",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    blockExplorerUrl: "https://arbiscan.io",
    nativeName: "Ether",
    nativeDecimals: 18,
  },
  {
    id: 10,
    key: "op",
    name: "Optimism",
    symbol: "ETH",
    badge: "L2",
    icon: "🔴",
    color: "text-red-400",
    rpcUrl: "https://mainnet.optimism.io",
    blockExplorerUrl: "https://optimistic.etherscan.io",
    nativeName: "Ether",
    nativeDecimals: 18,
  },
  {
    id: 8453,
    key: "base",
    name: "Base",
    symbol: "ETH",
    badge: "L2",
    icon: "🔵",
    color: "text-blue-500",
    rpcUrl: "https://mainnet.base.org",
    blockExplorerUrl: "https://basescan.org",
    nativeName: "Ether",
    nativeDecimals: 18,
  },
  {
    id: 59144,
    key: "linea",
    name: "Linea",
    symbol: "ETH",
    badge: "L2",
    icon: "⬛",
    color: "text-gray-300",
    rpcUrl: "https://rpc.linea.build",
    blockExplorerUrl: "https://lineascan.build",
    nativeName: "Ether",
    nativeDecimals: 18,
  },
  /* ─── L3 — App Chains ──────────────────────────────────────── */
  {
    id: 324,
    key: "zk",
    name: "zkSync Era",
    symbol: "ETH",
    badge: "L3",
    icon: "⚡",
    color: "text-green-300",
    rpcUrl: "https://mainnet.era.zksync.io",
    blockExplorerUrl: "https://explorer.zksync.io",
    nativeName: "Ether",
    nativeDecimals: 18,
  },
  {
    id: 534352,
    key: "scroll",
    name: "Scroll",
    symbol: "ETH",
    badge: "L3",
    icon: "📜",
    color: "text-orange-300",
    rpcUrl: "https://rpc.scroll.io",
    blockExplorerUrl: "https://scrollscan.com",
    nativeName: "Ether",
    nativeDecimals: 18,
  },
  {
    id: 5000,
    key: "mantle",
    name: "Mantle",
    symbol: "MNT",
    badge: "L3",
    icon: "🟢",
    color: "text-green-400",
    rpcUrl: "https://rpc.mantle.xyz",
    blockExplorerUrl: "https://explorer.mantle.xyz",
    nativeName: "Mantle",
    nativeDecimals: 18,
  },
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
  inline?: boolean;
}

export function ChainSwitcherDropdown({ inline = false }: Props) {
  const { chainId, network, address, connect, provider } = useWalletStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<number | null>(null);

  const currentEvmChain = EVM_CHAINS.find(c => c.id === chainId);
  const currentOther    = OTHER_CHAINS.find(c => c.network === network);

  const switchEvmChain = async (chain: ChainDef) => {
    if (chain.id === chainId) { setOpen(false); return; }

    setSwitching(chain.id);

    /* ── Reown / WalletConnect path ─────────────────────────────────────── */
    if (provider === "reown") {
      try {
        await switchReownChain(chain.id);
        connect({ address: address!, provider: "reown", network: "evm", chainId: chain.id });
        const bal = await fetchEvmBalance(address!, chain.id);
        if (bal !== null) useWalletStore.getState().setBalance(bal);
        toast({ title: `Switched to ${chain.name}`, description: `${chain.badge} · ${chain.symbol}` });
        setOpen(false);
      } catch (err: any) {
        if (err?.code === 4001 || err?.message?.toLowerCase().includes("reject")) {
          toast({ title: "Cancelled", description: "You rejected the chain switch.", variant: "destructive" });
        } else {
          toast({
            title: "Switch failed",
            description: err?.message || "Could not switch chain via WalletConnect.",
            variant: "destructive",
          });
        }
      } finally {
        setSwitching(null);
      }
      return;
    }

    /* ── OrahDEX software wallet (seed phrase / passkey) ─────────────────
       No browser extension needed — we own the key, so just update the
       store with the new chainId and fetch the balance via the target
       chain's public RPC (bypasses window.ethereum entirely). */
    if (provider === "aura-wallet") {
      try {
        connect({ address: address!, provider: "aura-wallet", network: "evm", chainId: chain.id });
        // Fetch balance directly from the target chain's public RPC
        const rpcUrl = CHAIN_RPC_URLS[chain.id] ?? chain.rpcUrl;
        let bal: string | null = null;
        try {
          const res = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address!, "latest"] }),
          });
          const json = await res.json();
          if (json?.result) bal = (Number(BigInt(json.result)) / 1e18).toFixed(6);
        } catch { /* balance unavailable — non-fatal */ }
        if (bal !== null) useWalletStore.getState().setBalance(bal);
        toast({ title: `Switched to ${chain.name}`, description: `${chain.badge} · ${chain.symbol}` });
        setOpen(false);
      } catch (err: any) {
        toast({ title: "Switch failed", description: err?.message || "Could not switch chain.", variant: "destructive" });
      } finally {
        setSwitching(null);
      }
      return;
    }

    /* ── Injected wallet path (MetaMask, Coinbase Wallet, etc.) ─────────── */
    const eth = (window as any).ethereum;
    if (!eth) {
      setSwitching(null);
      toast({
        title: "No EVM wallet found",
        description: "Install MetaMask or connect via WalletConnect to switch chains.",
        variant: "destructive",
      });
      return;
    }

    const hexId = `0x${chain.id.toString(16)}`;

    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
      connect({ address: address!, provider: provider!, network: "evm", chainId: chain.id });
      const bal = await fetchEvmBalance(address!, chain.id);
      if (bal !== null) useWalletStore.getState().setBalance(bal);
      toast({ title: `Switched to ${chain.name}`, description: `${chain.badge} · ${chain.symbol}` });
      setOpen(false);
    } catch (err: any) {
      if (err?.code === 4902 || err?.code === -32603) {
        /* Chain not in wallet — add it first */
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: hexId,
              chainName: chain.name,
              nativeCurrency: { name: chain.nativeName, symbol: chain.symbol, decimals: chain.nativeDecimals },
              rpcUrls: [chain.rpcUrl],
              blockExplorerUrls: [chain.blockExplorerUrl],
            }],
          });
          await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
          connect({ address: address!, provider: provider!, network: "evm", chainId: chain.id });
          const bal = await fetchEvmBalance(address!, chain.id);
          if (bal !== null) useWalletStore.getState().setBalance(bal);
          toast({ title: `${chain.name} added & connected`, description: `${chain.badge} · ${chain.symbol} · Added to your wallet` });
          setOpen(false);
        } catch (addErr: any) {
          if (addErr?.code !== 4001) {
            toast({ title: `Failed to add ${chain.name}`, description: addErr?.message || "Could not add network.", variant: "destructive" });
          }
        }
      } else if (err?.code === 4001) {
        toast({ title: "Cancelled", description: "You rejected the chain switch request.", variant: "destructive" });
      } else {
        toast({ title: "Switch failed", description: err?.message || "Could not switch chain.", variant: "destructive" });
      }
    } finally {
      setSwitching(null);
    }
  };

  const label = currentEvmChain
    ? `${currentEvmChain.icon} ${currentEvmChain.name}`
    : currentOther
      ? `${currentOther.icon} ${currentOther.name}`
      : "Switch Chain";

  /* ── Grouped by layer ─────────────────────────────────────────────────── */
  const chainsByLayer: Record<string, ChainDef[]> = {
    "L1 — Base Chains": EVM_CHAINS.filter(c => c.badge === "L1"),
    "L2 — Rollups & Sidechains": EVM_CHAINS.filter(c => c.badge === "L2"),
    "L3 — App Chains": EVM_CHAINS.filter(c => c.badge === "L3"),
  };

  function ChainRow({ chain, compact = false }: { chain: ChainDef; compact?: boolean }) {
    const active = network === "evm" && chainId === chain.id;
    const busy   = switching === chain.id;
    return (
      <button
        onClick={() => switchEvmChain(chain)}
        disabled={active || !!switching}
        className={cn(
          "w-full flex items-center gap-2.5 rounded-xl text-left transition-all",
          compact ? "px-2.5 py-2 text-xs" : "px-3 py-2.5 text-sm",
          active
            ? "bg-primary/10 text-foreground cursor-default"
            : busy
              ? "opacity-60 cursor-wait"
              : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
        )}
      >
        {/* Icon */}
        <span className={cn("leading-none text-center shrink-0 font-bold", compact ? "text-sm w-5" : "text-base w-6", chain.id === 8453 ? "text-blue-500" : chain.color)}>
          {chain.icon}
        </span>

        {/* Name */}
        <span className="flex-1 font-medium truncate">{chain.name}</span>

        {/* Base "NEW" pill — make it stand out */}
        {chain.id === 8453 && !active && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0 mr-1">
            BASE
          </span>
        )}

        {/* Badge */}
        <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0", BADGE_COLORS[chain.badge])}>
          {chain.badge}
        </span>

        {/* Status */}
        {busy && (
          <span className="w-3.5 h-3.5 border-2 border-primary/40 border-t-primary rounded-full animate-spin shrink-0" />
        )}
        {active && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
        {!active && !busy && chain.id !== chainId && (
          <PlusCircle className="w-3 h-3 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100" />
        )}
      </button>
    );
  }

  /* ── Inline accordion (inside WalletOptionsDropdown) ─────────────────── */
  if (inline) {
    return (
      <div>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-xl border border-border bg-secondary/60 hover:bg-secondary transition-colors text-sm font-semibold text-foreground"
        >
          <span className="flex-1 text-left">{label}</span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
        </button>

        {open && (
          <div className="mt-2 rounded-xl border border-border bg-background/60 overflow-hidden">
            {Object.entries(chainsByLayer).map(([groupLabel, chains]) => (
              <div key={groupLabel}>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold px-3 pt-2.5 pb-1">
                  {groupLabel.split(" — ")[0]}
                </p>
                <div className="px-1.5 pb-1.5 space-y-0.5">
                  {chains.map(chain => (
                    <ChainRow key={chain.id} chain={chain} compact />
                  ))}
                </div>
              </div>
            ))}

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
                        active ? "bg-primary/10 text-foreground" : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
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

  /* ── Standalone floating dropdown ─────────────────────────────────────── */
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
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Switch Network</p>
              <span className="text-[10px] text-muted-foreground">{EVM_CHAINS.length} EVM chains</span>
            </div>

            <div className="p-2 max-h-[440px] overflow-y-auto">
              {Object.entries(chainsByLayer).map(([groupLabel, chains]) => (
                <div key={groupLabel} className="mb-3">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold px-2 py-1.5">
                    {groupLabel}
                  </p>
                  <div className="space-y-0.5">
                    {chains.map(chain => (
                      <ChainRow key={chain.id} chain={chain} />
                    ))}
                  </div>
                </div>
              ))}

              <div className="border-t border-border pt-2 mt-1">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-bold px-2 py-1.5">
                  Other Networks
                </p>
                <div className="space-y-0.5">
                  {OTHER_CHAINS.map(chain => {
                    const active = network === chain.network;
                    return (
                      <button
                        key={chain.key}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left",
                          active ? "bg-primary/10 text-foreground" : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <span className={cn("text-base leading-none font-bold w-6", chain.color)}>{chain.icon}</span>
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
        </>
      )}
    </div>
  );
}
