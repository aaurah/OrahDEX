import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import {
  Wallet as WalletIcon, Download, ArrowDownUp, Copy, Check,
  ShieldCheck, KeyRound, Plus, ChevronRight, AlertCircle, Sparkles,
  RefreshCw, Link2, Link2Off, Send, TrendingUp, ChevronDown, ChevronUp,
  Coins, Trash2, Loader2, ExternalLink, Cpu, Globe,
  ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import { WalletAddresses } from "@/components/wallet/WalletAddresses";
import { WalletDApps } from "@/components/wallet/WalletDApps";
import { SmartAccountPanel } from "@/components/wallet/SmartAccountPanel";
import { useLocation } from "wouter";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { useCustomTokenStore } from "@/store/useCustomTokenStore";
import { useNativeChainBalance } from "@/hooks/useNativeChainBalance";
import {
  getImportedWallet, getDerivedAddresses, saveDerivedAddresses,
  type DerivedAddresses,
} from "@/lib/walletPin";
import { listPasskeyWallets, loginWithPasskey } from "@/lib/passkeyWallet";
import { ReceiveModal } from "@/components/ReceiveModal";
import { RevealSecretSheet } from "@/components/wallet/RevealSecretSheet";
import { ChainReceiveSheet } from "@/components/wallet/ChainReceiveSheet";
import { ManualImportSheet, type ImportChain } from "@/components/wallet/ManualImportSheet";
import { WithdrawSheet } from "@/components/WithdrawSheet";
import { BrandLogo } from "@/components/BrandLogo";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSettingsStore, formatQuoteAmount } from "@/store/useSettingsStore";

/** Sums balances across all 8 live EVM chains for a given address. */
function useAllEvmBalances(address: string | null) {
  const c1     = useEvmBalances(address, 1);
  const c56    = useEvmBalances(address, 56);
  const c137   = useEvmBalances(address, 137);
  const c42161 = useEvmBalances(address, 42161);
  const c10    = useEvmBalances(address, 10);
  const c8453  = useEvmBalances(address, 8453);
  const c43114 = useEvmBalances(address, 43114);
  const c59144 = useEvmBalances(address, 59144);
  const all = [c1, c56, c137, c42161, c10, c8453, c43114, c59144];
  return all.reduce((sum, { balances }) =>
    sum + balances.reduce((s, b) => s + (b.usdValue ?? 0), 0), 0);
}

type ChainRow = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  family: "evm" | "bsv" | "btc" | "bch" | "tron" | "solana" | "xrp" | "ltc" | "doge";
  evmChainId?: number;
  live: boolean;
  badge?: string;
};

const CHAINS: ChainRow[] = [
  { id: "eth",     name: "Ethereum",     symbol: "ETH",  color: "#627EEA", family: "evm",    evmChainId: 1,     live: true },
  { id: "bnb",     name: "BNB Chain",    symbol: "BNB",  color: "#F3BA2F", family: "evm",    evmChainId: 56,    live: true },
  { id: "polygon", name: "Polygon",      symbol: "MATIC",color: "#8247E5", family: "evm",    evmChainId: 137,   live: true },
  { id: "arb",     name: "Arbitrum",     symbol: "ETH",  color: "#28A0F0", family: "evm",    evmChainId: 42161, live: true },
  { id: "op",      name: "Optimism",     symbol: "ETH",  color: "#FF0420", family: "evm",    evmChainId: 10,    live: true },
  { id: "base",    name: "Base",         symbol: "ETH",  color: "#0052FF", family: "evm",    evmChainId: 8453,  live: true },
  { id: "avax",    name: "Avalanche",    symbol: "AVAX", color: "#E84142", family: "evm",    evmChainId: 43114, live: true },
  { id: "linea",   name: "Linea",        symbol: "ETH",  color: "#121212", family: "evm",    evmChainId: 59144, live: true },
  { id: "bsv",     name: "Bitcoin SV",   symbol: "BSV",  color: "#EAB300", family: "bsv",                      live: true },
  { id: "btc",     name: "Bitcoin",      symbol: "BTC",  color: "#F7931A", family: "btc",                      live: true },
  { id: "bch",     name: "Bitcoin Cash", symbol: "BCH",  color: "#0AC18E", family: "bch",                      live: true },
  { id: "sol",     name: "Solana",       symbol: "SOL",  color: "#14F195", family: "solana",                   live: true },
  { id: "tron",    name: "Tron",         symbol: "TRX",  color: "#FF060A", family: "tron",                     live: true },
  { id: "xrp",     name: "XRP Ledger",   symbol: "XRP",  color: "#00AAE4", family: "xrp",                      live: true },
  { id: "ltc",     name: "Litecoin",     symbol: "LTC",  color: "#A6A9AA", family: "ltc",                      live: true },
  { id: "doge",    name: "Dogecoin",     symbol: "DOGE", color: "#C2A633", family: "doge",                     live: true },
];

function shortAddr(a: string | null) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function addressForChain(
  chain: ChainRow,
  evmAddress: string | null,
  bsvAddress: string | null,
  connectedNetwork: string | null,
  derived: DerivedAddresses | null,
): string | null {
  if (chain.family === "evm") return evmAddress;
  if (chain.family === "bsv") {
    if (derived?.bsv) return derived.bsv;
    if ((connectedNetwork === "bsv" || connectedNetwork === "bsv-test") && bsvAddress)
      return bsvAddress;
    return null;
  }
  if (chain.family === "btc")    return derived?.btc  ?? null;
  if (chain.family === "bch")    return derived?.bch  ?? null;
  if (chain.family === "solana") return derived?.sol  ?? null;
  if (chain.family === "tron")   return derived?.tron ?? null;
  if (chain.family === "xrp")    return derived?.xrp  ?? null;
  if (chain.family === "ltc")    return derived?.ltc  ?? null;
  if (chain.family === "doge")   return derived?.doge ?? null;
  return null;
}

// ─── Chain row shell (imToken / MetaMask hybrid style) ───────────────────────

function ChainRowShell({
  chain, chainAddr, balanceSlot, onReceive, onImport,
  expandable, expanded, onToggleExpand, extra,
}: {
  chain: ChainRow;
  chainAddr: string | null;
  balanceSlot: ReactNode;
  onReceive: () => void;
  onImport: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  extra?: ReactNode;
}) {
  const hasAddr   = !!chainAddr;
  const canReceive = hasAddr && chain.live;

  const addrLabel = hasAddr
    ? `${chainAddr.slice(0, 8)}…${chainAddr.slice(-5)}`
    : chain.live
      ? "No address linked"
      : "Coming soon";

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors group",
          expandable && "cursor-pointer"
        )}
        onClick={expandable ? onToggleExpand : undefined}
      >
        {/* Chain icon */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm"
          style={{ backgroundColor: chain.color }}
        >
          {chain.symbol.slice(0, 3)}
        </div>

        {/* Name + address */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground truncate">{chain.name}</p>
            {chain.badge && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary uppercase tracking-wider shrink-0">
                {chain.badge}
              </span>
            )}
            {hasAddr && chain.family !== "evm" && (
              <span className="hidden group-hover:inline-flex items-center gap-0.5 text-[9px] font-semibold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                <Link2 size={8} /> Linked
              </span>
            )}
          </div>

          {hasAddr ? (
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">{addrLabel}</p>
          ) : (
            chain.live ? (
              <button
                onClick={e => { e.stopPropagation(); onImport(); }}
                className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-primary/80 hover:text-primary transition-colors"
              >
                <Plus size={10} />
                Link address or import key
              </button>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-0.5">{addrLabel}</p>
            )
          )}
        </div>

        {/* Balance slot */}
        {balanceSlot}

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {chain.family !== "evm" && chain.live && (
            <button
              onClick={e => { e.stopPropagation(); onImport(); }}
              title={hasAddr ? "Manage linked address" : "Link address or import key"}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0",
                hasAddr
                  ? "bg-primary/10 hover:bg-primary/20 text-primary"
                  : "bg-secondary/60 hover:bg-primary/15 text-muted-foreground hover:text-primary",
              )}
            >
              {hasAddr ? <Link2 size={13} /> : <Link2Off size={13} />}
            </button>
          )}

          <button
            onClick={e => { e.stopPropagation(); onReceive(); }}
            disabled={!canReceive}
            className="w-8 h-8 rounded-lg bg-secondary/60 hover:bg-secondary disabled:opacity-30 flex items-center justify-center transition-colors shrink-0"
            title="Receive"
          >
            <Download size={14} />
          </button>

          {expandable && (
            <button
              onClick={e => { e.stopPropagation(); onToggleExpand?.(); }}
              className="w-8 h-8 rounded-lg bg-secondary/60 hover:bg-secondary flex items-center justify-center transition-colors shrink-0"
              title={expanded ? "Collapse" : "Show tokens"}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {extra}
    </div>
  );
}

// ─── Add Custom Token dialog ─────────────────────────────────────────────────

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum", 56: "BNB Chain", 137: "Polygon", 42161: "Arbitrum",
  10: "Optimism", 8453: "Base", 43114: "Avalanche", 59144: "Linea",
};

function AddCustomTokenDialog({
  open, chainId, onClose,
}: { open: boolean; chainId: number | null; onClose: () => void }) {
  const { add } = useCustomTokenStore();
  const { toast } = useToast();

  const [address,  setAddress]  = useState("");
  const [symbol,   setSymbol]   = useState("");
  const [name,     setName]     = useState("");
  const [decimals, setDecimals] = useState("18");
  const [color,    setColor]    = useState("#6B7280");
  const [fetching, setFetching] = useState(false);
  const [fetched,  setFetched]  = useState(false);

  const reset = () => {
    setAddress(""); setSymbol(""); setName(""); setDecimals("18");
    setColor("#6B7280"); setFetched(false);
  };
  const handleClose = () => { reset(); onClose(); };

  const handleAutoDetect = useCallback(async () => {
    if (!chainId || !address.match(/^0x[0-9a-fA-F]{40}$/)) {
      toast({ variant: "destructive", title: "Invalid address", description: "Enter a valid 0x contract address first." });
      return;
    }
    setFetching(true);
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const rpcUrls: Record<number, string> = {
        1: "https://eth.drpc.org", 56: "https://bsc.drpc.org",
        137: "https://polygon.drpc.org", 42161: "https://arbitrum.drpc.org",
        10: "https://optimism.drpc.org", 8453: "https://base.drpc.org",
        43114: "https://avalanche.drpc.org", 59144: "https://linea.drpc.org",
      };
      const rpc = rpcUrls[chainId] ?? `${BASE}/api/rpc/${chainId}`;

      async function callRpc(data: string) {
        const r = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: address, data }, "latest"] }),
        });
        const j = await r.json();
        return j.result as string;
      }

      function parseString(hex: string): string {
        if (!hex || hex.length <= 2) return "";
        const data = hex.slice(2);
        const len = parseInt(data.slice(64, 128), 16);
        const str = data.slice(128, 128 + len * 2);
        return str ? decodeURIComponent(str.replace(/../g, "%$&")) : "";
      }
      function parseUint(hex: string): number {
        if (!hex || hex.length <= 2) return 18;
        return parseInt(hex.slice(2), 16) || 18;
      }

      const [symHex, nameHex, decHex] = await Promise.all([
        callRpc("0x95d89b41"), // symbol()
        callRpc("0x06fdde03"), // name()
        callRpc("0x313ce567"), // decimals()
      ]);

      const sym  = parseString(symHex);
      const nm   = parseString(nameHex);
      const dec  = parseUint(decHex);

      if (!sym) throw new Error("Could not read token — is this an ERC-20 contract?");

      setSymbol(sym.slice(0, 12).toUpperCase());
      setName(nm || sym);
      setDecimals(String(dec));
      setFetched(true);
      toast({ title: "Token detected", description: `${sym} on ${CHAIN_NAMES[chainId] ?? "chain " + chainId}` });
    } catch (e) {
      toast({ variant: "destructive", title: "Detection failed", description: (e as Error).message });
    } finally {
      setFetching(false);
    }
  }, [chainId, address, toast]);

  const handleSave = () => {
    if (!chainId || !address.match(/^0x[0-9a-fA-F]{40}$/) || !symbol.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Address and symbol are required." });
      return;
    }
    const result = add({
      chainId,
      address: address.trim(),
      symbol:  symbol.trim().toUpperCase(),
      name:    name.trim() || symbol.trim(),
      decimals: parseInt(decimals) || 18,
      color,
    });
    if (!result) {
      toast({ variant: "destructive", title: "Already added", description: "This token is already in your list." });
      return;
    }
    toast({ title: "Token added", description: `${result.symbol} added to ${CHAIN_NAMES[chainId] ?? "chain"}` });
    handleClose();
  };

  if (!open || !chainId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-foreground">Add Custom Token</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{CHAIN_NAMES[chainId] ?? `Chain ${chainId}`}</p>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">✕</button>
        </div>

        {/* Contract address */}
        <div className="mb-3">
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Contract address</label>
          <div className="flex gap-2">
            <input
              value={address}
              onChange={e => { setAddress(e.target.value); setFetched(false); }}
              placeholder="0x…"
              className="flex-1 bg-secondary/30 border border-border rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-primary/50 transition-colors"
            />
            <button
              onClick={handleAutoDetect}
              disabled={fetching || !address}
              className="px-3 py-2.5 rounded-xl bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition-colors disabled:opacity-40 shrink-0 flex items-center gap-1.5"
            >
              {fetching ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
              {fetching ? "Detecting…" : "Auto-detect"}
            </button>
          </div>
        </div>

        {fetched && (
          <div className="mb-3 flex items-center gap-2 p-2.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <Check size={14} className="text-green-400 shrink-0" />
            <span className="text-xs text-green-400 font-semibold">Token detected — review fields below</span>
          </div>
        )}

        {/* Symbol + name */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Symbol</label>
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              placeholder="e.g. USDT"
              className="w-full bg-secondary/30 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Decimals</label>
            <input
              value={decimals}
              onChange={e => setDecimals(e.target.value)}
              type="number"
              min={0} max={18}
              className="w-full bg-secondary/30 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>
        <div className="mb-3">
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Token name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Tether USD"
            className="w-full bg-secondary/30 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        {/* Color picker */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-10 h-10 rounded-xl border border-border bg-transparent cursor-pointer p-0.5"
            />
            <div className="flex gap-1.5 flex-wrap">
              {["#22C55E","#3B82F6","#F97316","#EAB308","#8B5CF6","#EC4899","#14B8A6","#6B7280"].map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn("w-6 h-6 rounded-full border-2 transition-all", color === c ? "border-foreground scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!address || !symbol}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          Add Token
        </button>
      </div>
    </div>
  );
}

// ─── EVM row ─────────────────────────────────────────────────────────────────

function EvmChainRow({
  chain, evmAddress, quoteCurrency, onReceive, onImport, onAddToken, onSendToken, onTokenReceive,
}: {
  chain: ChainRow;
  evmAddress: string | null;
  quoteCurrency: string;
  onReceive: () => void;
  onImport: () => void;
  onAddToken: (chainId: number) => void;
  onSendToken: (chainId: number, symbol: string) => void;
  onTokenReceive: (symbol: string, chainName: string, address: string) => void;
}) {
  const { balances, loading } = useEvmBalances(evmAddress, chain.evmChainId ?? null);
  const { remove }            = useCustomTokenStore();
  const [expanded, setExpanded] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  const native     = balances.find(b => b.isNative);
  const nativeAmt  = native?.amount ?? 0;
  const tokens     = balances.filter(b => !b.isNative);
  const tokenCount = tokens.filter(b => b.amount > 0).length;
  const totalUsd   = balances.reduce((s, b) => s + (b.usdValue ?? 0), 0);

  const copyContract = async (addr: string) => {
    await navigator.clipboard.writeText(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 1500);
  };

  const balanceSlot = evmAddress ? (
    <div className="text-right shrink-0 min-w-[72px]">
      <p className="text-sm font-semibold text-foreground tabular-nums">
        {nativeAmt > 0 ? `${nativeAmt.toFixed(4)} ${chain.symbol}` : `0 ${chain.symbol}`}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {totalUsd > 0 ? formatQuoteAmount(totalUsd, quoteCurrency) : tokenCount > 0 ? `${tokenCount} tokens` : "—"}
      </p>
    </div>
  ) : null;

  const chainId = chain.evmChainId!;

  const expandedPanel = expanded ? (
    <div className="border-t border-border bg-secondary/10 px-4 py-3">
      {/* Token list */}
      {loading && tokens.length === 0 && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" /> Fetching balances…
        </div>
      )}

      {!loading && tokens.length === 0 && (
        <p className="text-xs text-muted-foreground py-1">No ERC-20 tokens found on this chain.</p>
      )}

      <div className="space-y-0.5">
        {tokens.map((tok, i) => (
          <div key={i} className="flex items-center gap-2.5 py-2">
            <div
              className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
              style={{ backgroundColor: tok.color }}
            >
              {tok.symbol.slice(0, 3)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">{tok.symbol}</span>
                {tok.isCustom && (
                  <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase tracking-wide shrink-0">
                    Custom
                  </span>
                )}
              </div>
              {tok.contractAddress && (
                <button
                  onClick={() => copyContract(tok.contractAddress!)}
                  className="flex items-center gap-1 mt-0.5 group/ca"
                  title="Copy contract address"
                >
                  <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px] group-hover/ca:text-foreground transition-colors">
                    {tok.contractAddress.slice(0, 6)}…{tok.contractAddress.slice(-4)}
                  </span>
                  {copiedAddr === tok.contractAddress
                    ? <Check size={9} className="text-green-400 shrink-0" />
                    : <Copy size={9} className="text-muted-foreground/60 shrink-0 group-hover/ca:text-primary transition-colors" />
                  }
                </button>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold text-foreground tabular-nums">
                {tok.amount > 0
                  ? `${tok.amount < 0.001 ? tok.amount.toExponential(2) : tok.amount.toFixed(tok.decimals)}`
                  : "0"}
              </p>
              {tok.usdValue > 0 && (
                <p className="text-[10px] text-muted-foreground">{formatQuoteAmount(tok.usdValue, quoteCurrency)}</p>
              )}
            </div>
            {/* Per-token Send / Receive actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => evmAddress && onTokenReceive(tok.symbol, chain.name, evmAddress)}
                disabled={!evmAddress}
                className="w-7 h-7 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-500 disabled:opacity-30 flex items-center justify-center transition-colors"
                title={`Receive ${tok.symbol}`}
              >
                <ArrowDownLeft size={12} />
              </button>
              <button
                onClick={() => onSendToken(chainId, tok.symbol)}
                disabled={!evmAddress}
                className="w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-30 flex items-center justify-center transition-colors"
                title={`Send ${tok.symbol}`}
              >
                <ArrowUpRight size={12} />
              </button>
            </div>
            {tok.isCustom && (
              <button
                onClick={() => remove(`${chainId}_${tok.contractAddress?.toLowerCase()}`)}
                className="w-6 h-6 rounded-lg hover:bg-red-500/15 text-muted-foreground hover:text-red-400 flex items-center justify-center transition-colors shrink-0"
                title="Remove token"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add token button */}
      <button
        onClick={() => onAddToken(chainId)}
        className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-primary/30 text-xs font-semibold text-primary/70 hover:text-primary hover:border-primary/60 hover:bg-primary/5 transition-colors"
      >
        <Plus size={12} /> Add custom token
      </button>
    </div>
  ) : null;

  return (
    <ChainRowShell
      chain={chain}
      chainAddr={evmAddress}
      balanceSlot={balanceSlot}
      onReceive={onReceive}
      onImport={onImport}
      expandable={!!evmAddress}
      expanded={expanded}
      onToggleExpand={() => setExpanded(e => !e)}
      extra={expandedPanel}
    />
  );
}

// ─── Native (non-EVM) row ─────────────────────────────────────────────────────

function NativeChainRow({
  chain, chainAddr, quoteCurrency, onReceive, onImport,
}: {
  chain: ChainRow;
  chainAddr: string | null;
  quoteCurrency: string;
  onReceive: () => void;
  onImport: () => void;
}) {
  const family = chain.family as any;
  const { native, usd, loading } = useNativeChainBalance(family, chainAddr);

  const balanceSlot = chainAddr ? (
    <div className="text-right shrink-0 min-w-[72px]">
      <p className="text-sm font-semibold text-foreground tabular-nums">
        {loading
          ? <span className="inline-block w-16 h-3.5 bg-muted/40 rounded animate-pulse" />
          : native > 0
            ? `${native < 0.0001 ? native.toExponential(2) : native.toFixed(4)} ${chain.symbol}`
            : `0 ${chain.symbol}`}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {loading ? "" : usd > 0 ? formatQuoteAmount(usd, quoteCurrency) : "—"}
      </p>
    </div>
  ) : null;

  return (
    <ChainRowShell
      chain={chain}
      chainAddr={chainAddr}
      balanceSlot={balanceSlot}
      onReceive={onReceive}
      onImport={onImport}
    />
  );
}

// ─── Chain row dispatcher ─────────────────────────────────────────────────────

function ChainBalanceRow({
  chain, address, evmAddress, network, derived, quoteCurrency,
  onReceive, onImport, onAddToken, onSendToken, onTokenReceive,
}: {
  chain: ChainRow;
  address: string | null;
  evmAddress: string | null;
  network: string | null;
  derived: DerivedAddresses | null;
  quoteCurrency: string;
  onReceive: (chain: ChainRow) => void;
  onImport:  (chain: ChainRow) => void;
  onAddToken: (chainId: number) => void;
  onSendToken: (chainId: number, symbol: string) => void;
  onTokenReceive: (symbol: string, chainName: string, address: string) => void;
}) {
  const chainAddr    = addressForChain(chain, evmAddress, address, network, derived);
  const handleReceive = () => onReceive(chain);
  const handleImport  = () => onImport(chain);

  if (chain.family === "evm") {
    return (
      <EvmChainRow
        chain={chain}
        evmAddress={evmAddress}
        quoteCurrency={quoteCurrency}
        onReceive={handleReceive}
        onImport={handleImport}
        onAddToken={onAddToken}
        onSendToken={onSendToken}
        onTokenReceive={onTokenReceive}
      />
    );
  }

  return (
    <NativeChainRow
      chain={chain}
      chainAddr={chainAddr}
      quoteCurrency={quoteCurrency}
      onReceive={handleReceive}
      onImport={handleImport}
    />
  );
}

// ─── Quick-stat pill ─────────────────────────────────────────────────────────

function StatPill({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent: string }) {
  return (
    <div className={cn("flex-1 rounded-2xl border p-3 flex flex-col gap-1", accent)}>
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="text-muted-foreground" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

// ─── Main Wallet page ────────────────────────────────────────────────────────

export default function Wallet({ afterActions }: { afterActions?: ReactNode } = {}) {
  const {
    address, network,
    internalEvmAddress,
    internalBsvAddress, internalBtcAddress, internalBchAddress,
    internalSolAddress, internalTronAddress, internalXrpAddress,
    internalLtcAddress, internalDogeAddress,
    setInternalBsvAddress, setInternalBtcAddress, setInternalBchAddress,
    setInternalSolAddress, setInternalTronAddress, setInternalXrpAddress,
    setInternalLtcAddress, setInternalDogeAddress,
  } = useWalletStore();
  const openWalletModal = useWalletModalStore(s => s.open);
  const [, navigate]   = useLocation();
  const { toast }      = useToast();

  const evmAddress = internalEvmAddress ?? (network === "evm" ? address : null);

  const imported     = useMemo(() => (address ? getImportedWallet(address) : null), [address]);
  const passkeyOwned = useMemo(
    () => (address ? listPasskeyWallets().some(w => w.address.toLowerCase() === address.toLowerCase()) : false),
    [address],
  );
  const canBackup = !!imported || passkeyOwned;

  const derivedKey = evmAddress ?? address;
  const [storedDerived, setStoredDerived] = useState<DerivedAddresses | null>(() => getDerivedAddresses(derivedKey));
  useEffect(() => { setStoredDerived(getDerivedAddresses(derivedKey)); }, [derivedKey]);

  const derived = useMemo<DerivedAddresses | null>(() => {
    const btcStore = internalBtcAddress?.startsWith("bc1")           ? internalBtcAddress : undefined;
    const bchStore = internalBchAddress?.startsWith("bitcoincash:q") ? internalBchAddress : undefined;
    const storeAddrs: DerivedAddresses = {
      evm:  evmAddress         ?? undefined,
      bsv:  internalBsvAddress ?? undefined,
      btc:  btcStore,
      bch:  bchStore,
      sol:  internalSolAddress  ?? undefined,
      tron: internalTronAddress ?? undefined,
      xrp:  internalXrpAddress  ?? undefined,
      ltc:  internalLtcAddress  ?? undefined,
      doge: internalDogeAddress ?? undefined,
    };
    const hasStore = Object.values(storeAddrs).some(Boolean);
    if (!storedDerived && !hasStore) return null;
    return { ...storeAddrs, ...storedDerived };
  }, [
    storedDerived, evmAddress,
    internalBsvAddress, internalBtcAddress, internalBchAddress,
    internalSolAddress, internalTronAddress, internalXrpAddress,
    internalLtcAddress, internalDogeAddress,
  ]);

  const { quoteCurrency } = useSettingsStore();
  const totalUsd = useAllEvmBalances(evmAddress);

  // Count linked non-EVM chains
  const linkedChains = CHAINS.filter(c => c.family !== "evm" && !!addressForChain(c, evmAddress, address, network, derived)).length;
  const totalNonEvm  = CHAINS.filter(c => c.family !== "evm").length;

  const _qs = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const _initialTab = (_qs?.get("tab") === "dapps" ? "dapps" : "portfolio") as "portfolio" | "addresses" | "dapps";
  const _initialUri = _qs?.get("uri") ?? "";
  const [tab, setTab]                         = useState<"portfolio" | "addresses" | "dapps">(_initialTab);
  const [receiveOpen, setReceiveOpen]         = useState(false);
  const [sendOpen, setSendOpen]               = useState(false);
  const [sendTokenConfig, setSendTokenConfig] = useState<{ chainId: number; symbol: string } | null>(null);
  const [tokenReceive, setTokenReceive]       = useState<{ symbol: string; chainName: string; address: string } | null>(null);
  const [chainReceive, setChainReceive]       = useState<{ open: boolean; chain?: ChainRow; address?: string | null }>({ open: false });
  const [revealOpen, setRevealOpen]           = useState(false);
  const [copied, setCopied]                   = useState(false);
  const [refreshing, setRefreshing]           = useState(false);
  const [importChain, setImportChain]         = useState<ChainRow | null>(null);
  const [addTokenChainId, setAddTokenChainId] = useState<number | null>(null);

  const hasMissingChains = canBackup && (!derived?.btc || !derived?.bch || !derived?.tron || !derived?.xrp || !derived?.ltc || !derived?.doge);

  // ── Passkey / sovereign refresh ──────────────────────────────────────────
  const refreshAddresses = async () => {
    setRefreshing(true);
    try {
      const result = await loginWithPasskey();
      if (result.chains) {
        const c = result.chains;
        if (c.bsv)  setInternalBsvAddress(c.bsv);
        if (c.btc)  setInternalBtcAddress(c.btc);
        if (c.bch)  setInternalBchAddress(c.bch);
        if (c.sol)  setInternalSolAddress(c.sol);
        if (c.tron) setInternalTronAddress(c.tron);
        if (c.xrp)  setInternalXrpAddress(c.xrp);
        if (c.ltc)  setInternalLtcAddress(c.ltc);
        if (c.doge) setInternalDogeAddress(c.doge);
        saveDerivedAddresses(c.evm!, c);
        setStoredDerived(getDerivedAddresses(c.evm!));
        toast({ title: "All chain addresses refreshed" });
      }
    } catch {
      openWalletModal();
    } finally {
      setRefreshing(false);
    }
  };

  // ── Manual import handlers ────────────────────────────────────────────────
  const familyToField: Record<string, keyof DerivedAddresses> = {
    bsv: "bsv", btc: "btc", bch: "bch", solana: "sol",
    tron: "tron", xrp: "xrp", ltc: "ltc", doge: "doge",
  };

  const handleImportSave = (chain: ImportChain, importedAddr: string) => {
    if (!derivedKey) return;
    const field = familyToField[chain.family];
    if (!field) return;

    // Persist to localStorage (source of truth for manually imported addresses)
    saveDerivedAddresses(derivedKey, { [field]: importedAddr });
    setStoredDerived(getDerivedAddresses(derivedKey));

    // Mirror to store so other parts of the app can read it immediately
    if (chain.family === "bsv")    setInternalBsvAddress(importedAddr);
    if (chain.family === "btc")    setInternalBtcAddress(importedAddr);
    if (chain.family === "bch")    setInternalBchAddress(importedAddr);
    if (chain.family === "solana") setInternalSolAddress(importedAddr);
    if (chain.family === "tron")   setInternalTronAddress(importedAddr);
    if (chain.family === "xrp")    setInternalXrpAddress(importedAddr);
    if (chain.family === "ltc")    setInternalLtcAddress(importedAddr);
    if (chain.family === "doge")   setInternalDogeAddress(importedAddr);

    setImportChain(null);
    toast({
      title: `${chain.name} address linked`,
      description: `${importedAddr.slice(0, 14)}…`,
    });
  };

  const handleImportRemove = (chain: ImportChain) => {
    if (!derivedKey) return;
    const field = familyToField[chain.family];
    if (!field) return;

    // Write undefined for this field to clear it
    const current = getDerivedAddresses(derivedKey) ?? {};
    delete current[field];
    const map: Record<string, DerivedAddresses> = {};
    try { Object.assign(map, JSON.parse(localStorage.getItem("orahdex_derived_addresses_v1") ?? "{}")); } catch {}
    map[derivedKey.toLowerCase()] = current;
    localStorage.setItem("orahdex_derived_addresses_v1", JSON.stringify(map));
    setStoredDerived(getDerivedAddresses(derivedKey));

    if (chain.family === "bsv")    setInternalBsvAddress(null);
    if (chain.family === "btc")    setInternalBtcAddress(null);
    if (chain.family === "bch")    setInternalBchAddress(null);
    if (chain.family === "solana") setInternalSolAddress(null);
    if (chain.family === "tron")   setInternalTronAddress(null);
    if (chain.family === "xrp")    setInternalXrpAddress(null);
    if (chain.family === "ltc")    setInternalLtcAddress(null);
    if (chain.family === "doge")   setInternalDogeAddress(null);

    setImportChain(null);
    toast({ title: `${chain.name} address unlinked` });
  };

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: "Address copied" });
  };

  if (!address) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-20">
        <div className="w-20 h-20 rounded-3xl bg-primary/15 flex items-center justify-center mb-5">
          <WalletIcon size={32} className="text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Your sovereign wallet</h2>
        <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
          Import a seed phrase, create a passkey wallet, or connect an external wallet —
          all chains, one identity.
        </p>
        <button
          onClick={() => openWalletModal()}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center gap-2"
        >
          <Plus size={16} /> Get started
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full px-3 sm:px-6 py-4 sm:py-6 max-w-3xl mx-auto pb-32 sm:pb-10">

      {/* ── Identity card ── */}
      <div className="rounded-3xl bg-gradient-to-br from-primary/15 via-card to-card border border-border p-5 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BrandLogo textSize="text-lg" suffix="Wallet" />
          </div>
          {imported && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-primary/15 text-primary uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck size={10} /> {imported.protectedBy === "passkey" ? "Passkey" : "PIN"} secured
            </span>
          )}
        </div>

        {/* Total balance */}
        <div className="mb-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Total EVM balance</p>
          <p className="text-3xl font-bold text-foreground tracking-tight">
            {formatQuoteAmount(totalUsd, quoteCurrency)}
          </p>
        </div>

        <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Your address</p>
        <button onClick={copyAddress} className="flex items-center gap-2 group w-full text-left mb-5">
          <span className="font-mono text-sm sm:text-base text-foreground truncate">{shortAddr(address)}</span>
          {copied
            ? <Check size={14} className="text-green-400" />
            : <Copy size={14} className="text-muted-foreground group-hover:text-foreground" />}
        </button>

        {/* Action buttons — imToken / MetaMask style */}
        <div className="grid grid-cols-4 gap-2">
          <ActionButton icon={Download}    label="Receive" onClick={() => setReceiveOpen(true)} />
          <ActionButton icon={Send}        label="Send"    onClick={() => setSendOpen(true)} />
          <ActionButton icon={ArrowDownUp} label="Swap"    onClick={() => navigate("/swap")} />
          <ActionButton icon={Sparkles}    label="Buy"     onClick={() => navigate("/swap")} />
        </div>
      </div>

      {/* ── Tab selector ── */}
      <div className="flex bg-card border border-border rounded-2xl p-1 mb-4 gap-1">
        {(
          [
            { id: "portfolio", label: "Portfolio",   icon: WalletIcon },
            { id: "addresses", label: "All Addresses", icon: Cpu },
            { id: "dapps",     label: "dApps",       icon: Globe },
          ] as const
        ).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all",
              tab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <t.icon size={13} />
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.label.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {/* ── Addresses tab ── */}
      {tab === "addresses" && (
        <WalletAddresses
          evmAddress={evmAddress}
          bsvAddress={address}
          network={network}
          derived={derived}
          onRefresh={refreshAddresses}
          refreshing={refreshing}
        />
      )}

      {/* ── dApps tab ── */}
      {tab === "dapps" && (
        <WalletDApps evmAddress={evmAddress} initialUri={_initialUri} />
      )}

      {/* ── Portfolio tab ── */}
      {tab === "portfolio" && (<>

      {/* ── Quick stats — Atomic Wallet style ── */}
      <div className="flex gap-2 mb-4">
        <StatPill
          label="Chains linked"
          value={`${linkedChains} / ${totalNonEvm}`}
          icon={Link2}
          accent="border-border bg-card"
        />
        <StatPill
          label="EVM networks"
          value="8 active"
          icon={TrendingUp}
          accent="border-border bg-card"
        />
      </div>

      {afterActions}

      {/* ── Backup CTA ── */}
      {canBackup && (
        <button
          onClick={() => setRevealOpen(true)}
          className="w-full mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3 hover:bg-amber-500/15 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
            <KeyRound size={18} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Back up your wallet</p>
            <p className="text-[11px] text-muted-foreground">Reveal recovery phrase or private key. Authentication required.</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
      )}

      {!canBackup && (
        <div className="mb-4 rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            You're connected via an external wallet. Backup is managed by that wallet's own app.
            Use the <strong>Link</strong> button on any chain below to add watch addresses or import keys.
          </p>
        </div>
      )}

      {/* ── Chain list — Guarda / Atomic / imToken style ── */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Assets &amp; Chains
          </p>
          {hasMissingChains && (
            <button
              onClick={refreshAddresses}
              disabled={refreshing}
              className="flex items-center gap-1 text-[10px] font-semibold text-primary px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Updating…" : "Refresh addresses"}
            </button>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {CHAINS.map(c => (
            <ChainBalanceRow
              key={c.id}
              chain={c}
              address={address}
              evmAddress={evmAddress}
              network={network}
              derived={derived}
              quoteCurrency={quoteCurrency}
              onReceive={(chain) => {
                if (chain.family === "evm") {
                  setReceiveOpen(true);
                } else {
                  setChainReceive({ open: true, chain, address: addressForChain(chain, evmAddress, address, network, derived) });
                }
              }}
              onImport={(chain) => setImportChain(chain)}
              onAddToken={(chainId) => setAddTokenChainId(chainId)}
              onSendToken={(chainId, symbol) => setSendTokenConfig({ chainId, symbol })}
              onTokenReceive={(symbol, chainName, addr) => setTokenReceive({ symbol, chainName, address: addr })}
            />
          ))}
        </div>

        {/* Import hint — MetaMask style tip */}
        <p className="mt-3 text-center text-[10px] text-muted-foreground/60">
          Tap <Link2 size={9} className="inline mb-0.5" /> on any chain to link an address or import a private key
        </p>
      </div>

      {/* ── Smart Account (EIP-4337) ── */}
      <div className="mt-5 bg-card border border-border rounded-2xl p-5">
        <SmartAccountPanel />
      </div>

      </>)}
      {/* ── end portfolio tab ── */}

      {/* ── Modals & sheets (always mounted so state persists) ── */}
      <ReceiveModal isOpen={receiveOpen} onClose={() => setReceiveOpen(false)} />

      <WithdrawSheet
        open={sendOpen || !!sendTokenConfig}
        onClose={() => { setSendOpen(false); setSendTokenConfig(null); }}
        walletAddress={evmAddress ?? address ?? ""}
        asset="ETH"
        available={0}
        network="evm"
        networkLabel="Ethereum"
        initialTab="withdraw"
        visibleTabs={["withdraw"]}
        isOrahWallet={canBackup}
        initialChainId={sendTokenConfig?.chainId}
        initialTokenSymbol={sendTokenConfig?.symbol}
        passkeyEvmAddress={
          passkeyOwned
            ? (address ?? undefined)
            : (canBackup ? (evmAddress ?? undefined) : undefined)
        }
        nonEvmAddresses={{
          bsv:  derived?.bsv  ?? undefined,
          btc:  derived?.btc  ?? undefined,
          bch:  derived?.bch  ?? undefined,
          sol:  derived?.sol  ?? undefined,
          trx:  derived?.tron ?? undefined,
          xrp:  derived?.xrp  ?? undefined,
          ltc:  derived?.ltc  ?? undefined,
          doge: derived?.doge ?? undefined,
        }}
      />

      {/* Per-token ERC-20 receive sheet */}
      <ChainReceiveSheet
        open={!!tokenReceive}
        onClose={() => setTokenReceive(null)}
        chainName={tokenReceive ? `${tokenReceive.symbol} on ${tokenReceive.chainName}` : ""}
        symbol={tokenReceive?.symbol ?? ""}
        address={tokenReceive?.address ?? null}
        hint="This is your EVM address. Send any ERC-20 token to this address on the correct network."
      />

      <ChainReceiveSheet
        open={chainReceive.open}
        onClose={() => setChainReceive({ open: false })}
        chainName={chainReceive.chain?.name ?? ""}
        symbol={chainReceive.chain?.symbol ?? ""}
        address={chainReceive.address ?? null}
        hint={canBackup ? undefined : "Tap the link icon on this chain to add your address."}
      />

      <RevealSecretSheet open={revealOpen} onClose={() => setRevealOpen(false)} address={address} />

      <ManualImportSheet
        open={!!importChain}
        chain={importChain}
        existingAddress={importChain ? addressForChain(importChain, evmAddress, address, network, derived) : null}
        onClose={() => setImportChain(null)}
        onSave={handleImportSave}
        onRemove={handleImportRemove}
      />

      <AddCustomTokenDialog
        open={addTokenChainId !== null}
        chainId={addTokenChainId}
        onClose={() => setAddTokenChainId(null)}
      />
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-card border border-border hover:bg-secondary/40 active:scale-95 transition-all"
    >
      <Icon size={18} className="text-primary" />
      <span className="text-[11px] font-semibold text-foreground">{label}</span>
    </button>
  );
}
