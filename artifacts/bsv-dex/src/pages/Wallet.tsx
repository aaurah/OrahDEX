import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import {
  Wallet as WalletIcon, Download, ArrowDownUp, Copy, Check,
  ShieldCheck, KeyRound, Plus, ChevronRight, AlertCircle, Sparkles,
  RefreshCw, Link2, Link2Off, Send, TrendingUp, ChevronDown, ChevronUp,
  Coins, Trash2, Loader2, ExternalLink, Cpu, Globe,
  ArrowUpRight, ArrowDownLeft, ScanSearch, History, Filter, Zap,
  QrCode, Search, Shield, BarChart2, Eye, EyeOff, Lock,
} from "lucide-react";
import { WalletAddresses } from "@/components/wallet/WalletAddresses";
import { WalletDApps } from "@/components/wallet/WalletDApps";
import { useLocation } from "wouter";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useEvmBalances, scanTokensFromExplorer } from "@/hooks/useEvmBalances";
import { useOnChainTxHistory, type OnChainTx } from "@/hooks/useOnChainTxHistory";
import { useIncomingTxWatcher } from "@/hooks/useIncomingTxWatcher";
import { useCustomTokenStore } from "@/store/useCustomTokenStore";
import { useNativeChainBalance } from "@/hooks/useNativeChainBalance";
import {
  getImportedWallet, getDerivedAddresses, saveDerivedAddresses,
  type DerivedAddresses,
} from "@/lib/walletPin";
import { listPasskeyWallets, loginWithPasskey, sendBsvWithPasskey } from "@/lib/passkeyWallet";
import { ReceiveModal } from "@/components/ReceiveModal";
import { RevealSecretSheet } from "@/components/wallet/RevealSecretSheet";
import { ChainReceiveSheet } from "@/components/wallet/ChainReceiveSheet";
import { ManualImportSheet, type ImportChain } from "@/components/wallet/ManualImportSheet";
import { WithdrawSheet } from "@/components/WithdrawSheet";
import { BrandLogo } from "@/components/BrandLogo";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";
import { useToast } from "@/hooks/use-toast";
import { useNotificationStore } from "@/store/useNotificationStore";
import { cn } from "@/lib/utils";
import { useSettingsStore, formatQuoteAmount } from "@/store/useSettingsStore";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ─── BSV Send Sheet ─────────────────────────────────────────────────────── */

function BsvSendSheet({
  open, onClose, fromAddress, evmAddress,
}: {
  open: boolean;
  onClose: () => void;
  fromAddress: string;
  evmAddress: string | null;
}) {
  const { toast } = useToast();
  const { addNotification } = useNotificationStore();
  const { native: balance } = useNativeChainBalance("bsv", fromAddress || null);
  const [recipient, setRecipient] = useState("");
  const [amount,    setAmount]    = useState("");
  const [sending,   setSending]   = useState(false);
  const [txid,      setTxid]      = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  const reset = () => { setRecipient(""); setAmount(""); setTxid(null); setError(null); };
  const handleClose = () => { reset(); onClose(); };

  const parsedAmt = parseFloat(amount);
  const canSend   = recipient.trim().length > 20 && parsedAmt > 0 && parsedAmt <= balance && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const ref = evmAddress ?? "";
      const result = await sendBsvWithPasskey(ref, fromAddress, recipient.trim(), parsedAmt);
      setTxid(result.txid);
      toast({
        title:       "BSV sent",
        description: `${parsedAmt} BSV → ${recipient.slice(0, 12)}… · Fee: ${result.feeSat} sat`,
      });
      addNotification({
        type:  "withdrawal",
        title: "BSV Sent",
        body:  `${parsedAmt} BSV sent to ${recipient.slice(0, 12)}… (fee: ${result.feeSat} sat)`,
        txid:  result.txid,
        href:  `https://whatsonchain.com/tx/${result.txid}`,
      });
    } catch (err: any) {
      setError(err?.message ?? "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto pb-8">
        <SheetHeader className="mb-5">
          <SheetTitle className="flex items-center gap-2">
            <Send size={16} className="text-primary" /> Send BSV
          </SheetTitle>
          <SheetDescription className="font-mono text-xs truncate">
            From: {fromAddress}
          </SheetDescription>
        </SheetHeader>

        {txid ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Check size={24} className="text-emerald-400" />
              </div>
              <p className="font-semibold text-foreground">Sent!</p>
              <p className="text-xs text-muted-foreground font-mono break-all">{txid}</p>
            </div>
            <a
              href={`https://whatsonchain.com/tx/${txid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-xs text-primary hover:underline"
            >
              <ExternalLink size={12} /> View on WhatsOnChain
            </a>
            <Button className="w-full" variant="outline" onClick={handleClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Available</span>
              <span className="font-mono font-semibold text-foreground">
                {balance > 0 ? `${balance.toFixed(8)} BSV` : "0 BSV"}
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Recipient BSV address</label>
              <Input
                placeholder="1A1zP1eP5QGefi2DMPTf..."
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                className="font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Amount (BSV)</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="0.00010000"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="font-mono text-sm"
                  min={0}
                  step={0.00000001}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={() => setAmount(Math.max(0, balance - 0.00005).toFixed(8))}
                  disabled={balance <= 0}
                >
                  MAX
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Network fee (~5 000 sat) deducted from remaining balance</p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button
              className="w-full"
              disabled={!canSend}
              onClick={handleSend}
            >
              {sending
                ? <><Loader2 size={14} className="animate-spin mr-2" />Sending…</>
                : <><Send size={14} className="mr-2" />Send {parsedAmt > 0 ? `${parsedAmt} BSV` : "BSV"}</>}
            </Button>

            <p className="text-center text-[10px] text-muted-foreground">
              Requires your OrahDEX passkey to sign the transaction
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}


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
  chain, chainAddr, balanceSlot, onReceive, onImport, onSend,
  expandable, expanded, onToggleExpand, extra,
}: {
  chain: ChainRow;
  chainAddr: string | null;
  balanceSlot: ReactNode;
  onReceive: () => void;
  onImport: () => void;
  onSend?: () => void;
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

          {onSend && chainAddr && (
            <button
              onClick={e => { e.stopPropagation(); onSend(); }}
              className="w-8 h-8 rounded-lg bg-secondary/60 hover:bg-secondary flex items-center justify-center transition-colors shrink-0"
              title="Send BSV"
            >
              <ArrowUpRight size={14} />
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
  const { balances, loading, refresh } = useEvmBalances(evmAddress, chain.evmChainId ?? null);
  const { remove }            = useCustomTokenStore();
  const [expanded, setExpanded] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const { toast } = useToast();

  const handleScan = useCallback(async () => {
    if (!evmAddress || !chain.evmChainId || scanning) return;
    setScanning(true);
    try {
      const found = await scanTokensFromExplorer(evmAddress, chain.evmChainId);
      await refresh();
      if (found > 0) {
        toast({ title: `Found ${found} token${found === 1 ? "" : "s"}`, description: "Balances are loading now." });
      } else {
        toast({ title: "No new tokens found", description: "All your tokens are already listed." });
      }
    } catch {
      toast({ variant: "destructive", title: "Scan failed", description: "Could not reach the explorer. Try again." });
    } finally {
      setScanning(false);
    }
  }, [evmAddress, chain.evmChainId, scanning, refresh, toast]);

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
              {tok.price > 0 && (
                <p className={`text-[10px] font-medium tabular-nums ${tok.change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {tok.change24h >= 0 ? "+" : ""}{tok.change24h.toFixed(2)}%
                </p>
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

      {/* Add token + Scan buttons */}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onAddToken(chainId)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-primary/30 text-xs font-semibold text-primary/70 hover:text-primary hover:border-primary/60 hover:bg-primary/5 transition-colors"
        >
          <Plus size={12} /> Add token
        </button>
        <button
          onClick={handleScan}
          disabled={scanning || !evmAddress}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-amber-500/30 text-xs font-semibold text-amber-500/70 hover:text-amber-400 hover:border-amber-500/60 hover:bg-amber-500/5 transition-colors disabled:opacity-40"
          title="Scan blockchain for tokens you hold"
        >
          {scanning
            ? <Loader2 size={12} className="animate-spin" />
            : <ScanSearch size={12} />}
          {scanning ? "Scanning…" : "Scan tokens"}
        </button>
      </div>
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
  chain, chainAddr, quoteCurrency, onReceive, onImport, onSend,
}: {
  chain: ChainRow;
  chainAddr: string | null;
  quoteCurrency: string;
  onReceive: () => void;
  onImport: () => void;
  onSend?: () => void;
}) {
  const family = chain.family as any;
  const { native, usd, loading } = useNativeChainBalance(family, chainAddr);

  const balanceSlot = chainAddr ? (
    <div className="text-right shrink-0 min-w-[72px]">
      <p className="text-sm font-semibold text-foreground tabular-nums">
        {loading
          ? <span className="inline-block w-16 h-3.5 bg-muted/40 rounded animate-pulse" />
          : native > 0
            ? `${native < 0.001 ? native.toPrecision(4) : native < 1 ? native.toFixed(6) : native.toFixed(4)} ${chain.symbol}`
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
      onSend={onSend}
    />
  );
}

// ─── Chain row dispatcher ─────────────────────────────────────────────────────

function ChainBalanceRow({
  chain, address, evmAddress, network, derived, quoteCurrency,
  onReceive, onImport, onAddToken, onSendToken, onTokenReceive, onSendBsv, onSendChain,
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
  onSendBsv?: (addr: string) => void;
  onSendChain?: (chain: ChainRow, addr: string) => void;
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

  const handleSend = chainAddr && chain.live
    ? (chain.family === "bsv" && onSendBsv
        ? () => onSendBsv(chainAddr)
        : onSendChain
          ? () => onSendChain(chain, chainAddr)
          : undefined)
    : undefined;

  return (
    <NativeChainRow
      chain={chain}
      chainAddr={chainAddr}
      quoteCurrency={quoteCurrency}
      onReceive={handleReceive}
      onImport={handleImport}
      onSend={handleSend}
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
    // Server-provisioned internal addresses (storeAddrs) take priority over
    // HD-derived local derivations (storedDerived) so every view shows the
    // same address as the header. Only override where storeAddrs has a value.
    const storeNonNull = Object.fromEntries(
      Object.entries(storeAddrs).filter(([, v]) => v != null),
    ) as Partial<DerivedAddresses>;
    return { ...storedDerived, ...storeNonNull };
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
  const _qs2 = _qs?.get("tab");
  const _initialTab = (_qs2 === "dapps" ? "dapps" : _qs2 === "activity" ? "activity" : "portfolio") as "portfolio" | "addresses" | "dapps" | "activity";
  const _initialUri = _qs?.get("uri") ?? "";
  const [tab, setTab]                         = useState<"portfolio" | "addresses" | "dapps" | "activity">(_initialTab);

  // On-chain tx history — must come AFTER tab is declared (tab is read in the arg)
  const { data: onchainTxs = [], isLoading: txLoading } = useOnChainTxHistory(
    tab === "activity" ? (evmAddress ?? null) : null,
  );

  // Watch for new incoming EVM transactions and fire notifications automatically
  useIncomingTxWatcher(evmAddress ?? null);
  const [receiveOpen, setReceiveOpen]         = useState(false);
  const [sendOpen, setSendOpen]               = useState(false);
  const [buyCryptoOpen, setBuyCryptoOpen]     = useState(false);
  const [nonEvmSendChain, setNonEvmSendChain] = useState<string | null>(null);
  const [sendTokenConfig, setSendTokenConfig] = useState<{ chainId: number; symbol: string } | null>(null);
  const [tokenReceive, setTokenReceive]       = useState<{ symbol: string; chainName: string; address: string } | null>(null);
  const [chainReceive, setChainReceive]       = useState<{ open: boolean; chain?: ChainRow; address?: string | null }>({ open: false });
  const [revealOpen, setRevealOpen]           = useState(false);
  const [copied, setCopied]                   = useState(false);
  const [refreshing, setRefreshing]           = useState(false);
  const [importChain, setImportChain]         = useState<ChainRow | null>(null);
  const [addTokenChainId, setAddTokenChainId] = useState<number | null>(null);
  const [bsvSend, setBsvSend] = useState<{ open: boolean; addr: string }>({ open: false, addr: "" });

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

  const [assetSearch, setAssetSearch] = useState("");
  const [hideSmall, setHideSmall]     = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);

  const filteredChains = useMemo(() => {
    const q = assetSearch.toLowerCase();
    if (!q) return CHAINS;
    return CHAINS.filter(c =>
      c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
    );
  }, [assetSearch]);

  if (!address) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-16">
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 to-violet-500/10 flex items-center justify-center border border-primary/20">
            <WalletIcon size={36} className="text-primary" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <Shield size={14} className="text-emerald-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2 text-center">Your Sovereign Wallet</h2>
        <p className="text-sm text-muted-foreground text-center max-w-xs mb-8 leading-relaxed">
          One identity, all chains. Import a seed phrase, create a passkey wallet, or connect any external wallet.
        </p>
        <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-8">
          {[
            { icon: ShieldCheck, label: "Passkey secured", color: "text-violet-400", bg: "bg-violet-500/10" },
            { icon: Link2, label: "16 chains", color: "text-blue-400", bg: "bg-blue-500/10" },
            { icon: Coins, label: "1000s of tokens", color: "text-emerald-400", bg: "bg-emerald-500/10" },
          ].map(f => (
            <div key={f.label} className={cn("rounded-2xl border border-border p-3 flex flex-col items-center gap-1.5", f.bg)}>
              <f.icon size={18} className={f.color} />
              <span className="text-[10px] font-semibold text-muted-foreground text-center">{f.label}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => openWalletModal()}
          className="w-full max-w-xs px-6 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          <Plus size={16} /> Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full px-3 sm:px-6 py-4 sm:py-6 max-w-3xl mx-auto pb-32 sm:pb-10">

      {/* ══ Hero card ══════════════════════════════════════════════════════════ */}
      <div className="relative rounded-3xl bg-card border border-border/60 overflow-hidden mb-4 shadow-sm">
        {/* Decorative gradient blobs */}
        <div className="absolute top-0 left-0 w-64 h-40 bg-gradient-to-br from-violet-500/10 via-primary/5 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-40 h-32 bg-gradient-to-tl from-fuchsia-500/8 to-transparent pointer-events-none" />

        <div className="relative p-5">
          {/* Top bar: logo + security badge */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                <WalletIcon size={15} className="text-primary" />
              </div>
              <span className="text-sm font-bold text-foreground">OrahWallet</span>
            </div>
            <div className="flex items-center gap-2">
              {imported ? (
                <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck size={10} />
                  {imported.protectedBy === "passkey" ? "Passkey" : "PIN"}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-secondary text-muted-foreground border border-border">
                  <Globe size={10} /> External
                </span>
              )}
              <button
                onClick={() => setBalanceHidden(h => !h)}
                className="w-7 h-7 rounded-lg bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                {balanceHidden ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </div>

          {/* Balance */}
          <div className="mb-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Total Portfolio</p>
            <div className="flex items-baseline gap-3">
              <p className="text-4xl font-black text-foreground tracking-tight leading-none">
                {balanceHidden ? "••••••" : formatQuoteAmount(totalUsd, quoteCurrency)}
              </p>
            </div>
          </div>

          {/* Address pill */}
          <div className="flex items-center gap-2 bg-secondary/50 border border-border/40 rounded-xl px-3 py-2 mb-5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="flex-1 font-mono text-xs text-foreground truncate">
              {balanceHidden ? "••••••••••••••••" : shortAddr(address)}
            </span>
            <button
              onClick={copyAddress}
              className="text-muted-foreground hover:text-foreground transition-colors ml-1"
              title="Copy address"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
            <button
              onClick={() => setReceiveOpen(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Show QR code"
            >
              <QrCode size={12} />
            </button>
          </div>

          {/* Action buttons — circular Trust Wallet / imToken style */}
          <div className="grid grid-cols-5 gap-1">
            <ActionButton icon={Download}    label="Receive" onClick={() => setReceiveOpen(true)}    bg="bg-emerald-500/15" fg="text-emerald-400" />
            <ActionButton icon={Send}        label="Send"    onClick={() => setSendOpen(true)}        bg="bg-blue-500/15"    fg="text-blue-400"   />
            <ActionButton icon={ArrowDownUp} label="Swap"    onClick={() => navigate("/swap")}        bg="bg-primary/15"     fg="text-primary"    />
            <ActionButton icon={Sparkles}    label="Buy"     onClick={() => setBuyCryptoOpen(true)}   bg="bg-orange-500/15"  fg="text-orange-400" />
            <ActionButton icon={BarChart2}   label="History" onClick={() => setTab("activity")}       bg="bg-violet-500/15"  fg="text-violet-400" />
          </div>
        </div>
      </div>

      {/* ══ Tab strip ═══════════════════════════════════════════════════════════ */}
      <div className="flex bg-secondary/40 border border-border/50 rounded-2xl p-1 mb-4 gap-0.5">
        {(
          [
            { id: "portfolio", label: "Assets",    icon: Coins },
            { id: "activity",  label: "Activity",  icon: History },
            { id: "addresses", label: "Addresses", icon: Cpu },
            { id: "dapps",     label: "dApps",     icon: Globe },
          ] as const
        ).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all",
              tab === t.id
                ? "bg-card text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground/80"
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

      {/* ── Activity tab ── */}
      {tab === "activity" && (
        <ActivityTab txs={onchainTxs} loading={txLoading} evmAddress={evmAddress} />
      )}

      {/* ══ Assets tab ══════════════════════════════════════════════════════════ */}
      {tab === "portfolio" && (<>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Link2 size={11} className="text-blue-400" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Linked</span>
          </div>
          <p className="text-sm font-bold text-foreground">{linkedChains} <span className="text-muted-foreground font-normal text-xs">/ {totalNonEvm}</span></p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={11} className="text-violet-400" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">EVM</span>
          </div>
          <p className="text-sm font-bold text-foreground">8 <span className="text-muted-foreground font-normal text-xs">networks</span></p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Lock size={11} className={canBackup ? "text-emerald-400" : "text-amber-400"} />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Security</span>
          </div>
          <p className={cn("text-sm font-bold", canBackup ? "text-emerald-400" : "text-amber-400")}>
            {imported?.protectedBy === "passkey" ? "Passkey" : canBackup ? "PIN" : "External"}
          </p>
        </div>
      </div>

      {afterActions}

      {/* ── Security / backup card ── */}
      {canBackup && (
        <button
          onClick={() => setRevealOpen(true)}
          className="w-full mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 flex items-center gap-3 hover:bg-amber-500/12 transition-colors text-left group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
            <KeyRound size={18} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Back up your wallet</p>
            <p className="text-[11px] text-muted-foreground">Reveal recovery phrase or private key · Auth required</p>
          </div>
          <ChevronRight size={15} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {!canBackup && (
        <div className="mb-4 rounded-2xl border border-border bg-card/50 p-3.5 flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
            <Globe size={13} className="text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            External wallet connected. Backup is managed by your wallet app.
            Tap <strong className="text-foreground">Link</strong> on any chain to add addresses.
          </p>
        </div>
      )}

      {/* ── Search + filter bar ── */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={assetSearch}
            onChange={e => setAssetSearch(e.target.value)}
            placeholder="Search assets & chains…"
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
          {assetSearch && (
            <button
              onClick={() => setAssetSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <AlertCircle size={12} />
            </button>
          )}
        </div>
        {hasMissingChains && (
          <button
            onClick={refreshAddresses}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-primary px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/15 transition-colors disabled:opacity-50 shrink-0 border border-primary/20"
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Updating…" : "Refresh"}
          </button>
        )}
      </div>

      {/* ── Chain list ── */}
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Assets &amp; Chains
            {filteredChains.length < CHAINS.length && (
              <span className="ml-1.5 text-primary/70">{filteredChains.length} shown</span>
            )}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {filteredChains.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Search size={22} className="opacity-20" />
              <p className="text-sm">No chains match "{assetSearch}"</p>
            </div>
          ) : filteredChains.map(c => (
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
              onSendBsv={(addr) => setBsvSend({ open: true, addr })}
              onSendChain={(c, _addr) => { setNonEvmSendChain(c.id); setSendOpen(true); }}
            />
          ))}
        </div>

        {!assetSearch && (
          <p className="mt-3 text-center text-[10px] text-muted-foreground/50">
            Tap <Link2 size={9} className="inline mb-0.5" /> on any chain to link an address or import a private key
          </p>
        )}
      </div>


      </>)}
      {/* ── end portfolio tab ── */}

      {/* ── Modals & sheets (always mounted so state persists) ── */}
      <BuyCryptoModal open={buyCryptoOpen} onClose={() => setBuyCryptoOpen(false)} />
      <ReceiveModal isOpen={receiveOpen} onClose={() => setReceiveOpen(false)} />

      <WithdrawSheet
        key={nonEvmSendChain ?? "evm"}
        open={sendOpen || !!sendTokenConfig}
        onClose={() => { setSendOpen(false); setSendTokenConfig(null); setNonEvmSendChain(null); }}
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
        initialNonEvmChain={nonEvmSendChain ?? undefined}
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

      <BsvSendSheet
        open={bsvSend.open}
        onClose={() => setBsvSend({ open: false, addr: "" })}
        fromAddress={bsvSend.addr}
        evmAddress={evmAddress}
      />

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

// ── Helpers shared by ActivityTab ────────────────────────────────────────────

function activityShortAddr(addr: string) {
  if (!addr) return "";
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function activityFmtDate(ts: number) {
  const d = new Date(ts * 1000);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  const hr = String(d.getHours()).padStart(2, "0");
  const mn = String(d.getMinutes()).padStart(2, "0");
  return { date: `${mo}-${dy}`, time: `${hr}:${mn}` };
}

function activityLabel(tx: OnChainTx) {
  if (tx.isTokenTransfer) {
    return tx.isIncoming
      ? `Receive ${tx.tokenSymbol ?? "Token"}`
      : `Send ${tx.tokenSymbol ?? "Token"}`;
  }
  if (tx.functionName) {
    const raw = tx.functionName.split("(")[0];
    return raw.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).trim();
  }
  return tx.isIncoming ? `Receive ${tx.nativeSymbol}` : `Send ${tx.nativeSymbol}`;
}

function ActivityTxIcon({ tx }: { tx: OnChainTx }) {
  if (tx.isError)
    return (
      <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
        <AlertCircle size={18} className="text-red-400" />
      </div>
    );
  if (!tx.functionName && tx.isIncoming)
    return (
      <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
        <ArrowDownLeft size={18} className="text-green-400" />
      </div>
    );
  if (!tx.functionName && !tx.isIncoming)
    return (
      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
        <ArrowUpRight size={18} className="text-muted-foreground" />
      </div>
    );
  return (
    <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0" style={{ border: "2px solid #3B82F640" }}>
      <Zap size={16} className="text-blue-400" />
    </div>
  );
}

function ActivityTab({
  txs,
  loading,
  evmAddress,
}: {
  txs: OnChainTx[];
  loading: boolean;
  evmAddress?: string;
}) {
  const [chainFilter, setChainFilter] = useState<number | null>(null);

  const chains = [...new Set(txs.map(t => t.chainId))];
  const filtered = chainFilter ? txs.filter(t => t.chainId === chainFilter) : txs;

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <History size={15} className="text-primary" />
          Account activity
        </h3>
        {loading && <RefreshCw size={13} className="animate-spin text-muted-foreground" />}
      </div>

      {/* Chain filter pills */}
      {chains.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar mb-3">
          <button
            onClick={() => setChainFilter(null)}
            className={`shrink-0 px-3 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
              !chainFilter
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-card border-border text-muted-foreground"
            }`}
          >
            All
          </button>
          {chains.map(cid => {
            const sample = txs.find(t => t.chainId === cid)!;
            return (
              <button
                key={cid}
                onClick={() => setChainFilter(chainFilter === cid ? null : cid)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  chainFilter === cid
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-card border-border text-muted-foreground"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sample.chainColor }} />
                {sample.chainName}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty / loading */}
      {!evmAddress ? (
        <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center gap-2 text-muted-foreground">
          <History size={28} className="opacity-20 mb-1" />
          <p className="text-sm font-medium">Connect your wallet</p>
          <p className="text-xs opacity-60 text-center">Connect an EVM wallet to view on-chain activity</p>
        </div>
      ) : loading && filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center gap-2 text-muted-foreground">
          <RefreshCw size={24} className="animate-spin opacity-40 mb-1" />
          <p className="text-sm">Fetching on-chain activity…</p>
          <p className="text-xs opacity-50">Scanning 8 EVM chains</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center gap-2 text-muted-foreground">
          <History size={28} className="opacity-20 mb-1" />
          <p className="text-sm font-medium">No transactions found</p>
          <p className="text-xs opacity-60 text-center">On-chain activity will appear here</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {filtered.map((tx, i) => {
            const label = activityLabel(tx);
            const { date, time } = activityFmtDate(tx.timeStamp);
            const isContract = !!tx.functionName && !tx.isTokenTransfer;
            const counterpart = tx.isIncoming ? tx.from : tx.to;
            const prefix = isContract ? "On" : tx.isIncoming ? "From" : "To";

            const amtVal    = tx.isTokenTransfer ? tx.tokenValue : tx.valueEth;
            const amtSymbol = tx.isTokenTransfer ? (tx.tokenSymbol ?? "Token") : tx.nativeSymbol;
            const amtFmt    = amtVal != null && amtVal > 0
              ? `${amtVal < 0.0001 ? amtVal.toExponential(2) : amtVal < 1 ? amtVal.toFixed(5) : amtVal.toFixed(4)} ${amtSymbol}`
              : null;
            const amtColor  = tx.isError
              ? "text-red-400"
              : tx.isIncoming ? "text-emerald-400" : "text-foreground";

            return (
              <a
                key={`${tx.hash}-${i}`}
                href={tx.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/40 transition-colors group"
              >
                <ActivityTxIcon tx={tx} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className={`text-[13px] font-semibold truncate ${tx.isError ? "text-red-400" : "text-foreground"}`}>
                      {label}
                    </p>
                    {tx.isError && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold shrink-0">FAILED</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tx.chainColor }} />
                    <p className="text-[11px] text-muted-foreground truncate">
                      <span className="opacity-60">{prefix} </span>
                      <span className="font-mono">{activityShortAddr(counterpart)}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                  {amtFmt && (
                    <span className={`text-[12px] font-bold tabular-nums ${amtColor}`}>
                      {tx.isIncoming ? "+" : tx.isError ? "" : "−"}{amtFmt}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{date} {time}</span>
                  <ExternalLink size={10} className="text-muted-foreground/30 group-hover:text-muted-foreground/60 mt-0.5" />
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon, label, onClick,
  bg = "bg-primary/15", fg = "text-primary",
}: {
  icon: any; label: string; onClick: () => void;
  bg?: string; fg?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 active:scale-95 transition-all group"
    >
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all group-hover:scale-105 group-active:scale-95", bg)}>
        <Icon size={20} className={fg} />
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
    </button>
  );
}
