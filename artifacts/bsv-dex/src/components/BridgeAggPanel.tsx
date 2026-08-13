import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronDown, ArrowRight, ArrowUpDown, RefreshCw, Zap, Clock, AlertCircle, CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { useWalletStore } from "@/store/useWalletStore";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Chain {
  id: number;
  name: string;
  nativeSymbol: string;
  color: string;
}

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  isNative?: boolean;
}

interface BridgeQuote {
  providerId: string;
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  amountIn: string;
  amountOut: string;
  fee: string;
  estimatedTimeSeconds: number;
  slippageBps: number;
  score: number;
  amountInHuman: string;
  amountOutHuman: string;
  feeHuman: string;
  routeMeta?: Record<string, unknown>;
}

interface BuiltTx {
  to: string;
  data: string;
  value: string;
  chainId: number;
}

// ── Provider display helpers ──────────────────────────────────────────────────

const BRIDGE_COLORS: Record<string, string> = {
  "across":   "#4ade80",
  "stargate": "#facc15",
  "hop":      "#f97316",
  "connext":  "#a78bfa",
  "cbridge":  "#38bdf8",
  "synapse":  "#e879f9",
  "socket":   "#60a5fa",
};

function bridgeColor(name: string): string {
  const slug = name.toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "");
  for (const [key, color] of Object.entries(BRIDGE_COLORS)) {
    if (slug.includes(key)) return color;
  }
  const h = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue},70%,60%)`;
}

function providerMeta(id: string, routeMeta?: Record<string, unknown>) {
  const bridgeName = (routeMeta?.["bridgeName"] as string | undefined)
    ?? id.split(":")[1]?.split("-").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ")
    ?? id;
  return { label: bridgeName, color: bridgeColor(bridgeName), tag: "" };
}

function computeTags(quotes: BridgeQuote[]): Map<string, string> {
  const tags = new Map<string, string>();
  if (quotes.length < 2) return tags;
  const fastest  = quotes.reduce((a, b) => a.estimatedTimeSeconds < b.estimatedTimeSeconds ? a : b);
  tags.set(fastest.providerId, "Fastest");
  const byFee    = [...quotes].sort((a, b) => (BigInt(a.fee) < BigInt(b.fee) ? -1 : 1));
  const cheapest = byFee[0];
  if (cheapest && !tags.has(cheapest.providerId)) tags.set(cheapest.providerId, "Cheapest");
  return tags;
}

function fmtTime(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  return `~${Math.round(seconds / 60)}m`;
}

function fmtScore(score: number): string {
  return `${Math.round(score * 100)}`;
}

function trimAmount(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

// ── Chain badge ───────────────────────────────────────────────────────────────

const CHAIN_COLORS: Record<number, string> = {
  1: "#627EEA", 8453: "#0052FF", 42161: "#28A0F0",
  10: "#FF0420", 137: "#8247E5", 56: "#F0B90B", 43114: "#E84142",
};

const EXPLORER_TX: Record<number, string> = {
  1:     "https://etherscan.io/tx/",
  8453:  "https://basescan.org/tx/",
  42161: "https://arbiscan.io/tx/",
  10:    "https://optimistic.etherscan.io/tx/",
  137:   "https://polygonscan.com/tx/",
  56:    "https://bscscan.com/tx/",
  43114: "https://snowtrace.io/tx/",
};

function ChainBadge({ chain }: { chain: Chain }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: CHAIN_COLORS[chain.id] + "22", color: CHAIN_COLORS[chain.id] ?? "#9ca3af" }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: CHAIN_COLORS[chain.id] ?? "#9ca3af" }}
      />
      {chain.name}
    </span>
  );
}

// ── Dropdown components ───────────────────────────────────────────────────────

function ChainDropdown({
  chains,
  selected,
  onSelect,
  label,
  excludeId,
}: {
  chains: Chain[];
  selected: Chain | null;
  onSelect: (c: Chain) => void;
  label: string;
  excludeId?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-secondary/60 border border-border/50 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:border-primary/40 transition-colors w-full"
      >
        {selected ? (
          <>
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: CHAIN_COLORS[selected.id] ?? "#9ca3af" }}
            />
            <span>{selected.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{label}</span>
        )}
        <ChevronDown size={14} className="ml-auto text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden">
          {chains
            .filter(c => c.id !== excludeId)
            .map(c => (
              <button
                key={c.id}
                onClick={() => { onSelect(c); setOpen(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-foreground hover:bg-secondary/60 transition-colors text-left"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: CHAIN_COLORS[c.id] ?? "#9ca3af" }}
                />
                {c.name}
                <span className="ml-auto text-xs text-muted-foreground">{c.nativeSymbol}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function TokenDropdown({
  tokens,
  selected,
  onSelect,
  label,
}: {
  tokens: Token[];
  selected: Token | null;
  onSelect: (t: Token) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-secondary border border-border/50 rounded-xl px-3 py-2 text-sm font-semibold text-foreground hover:border-primary/40 transition-colors min-w-[110px]"
      >
        {selected ? (
          <>
            <span className="text-primary font-bold">{selected.symbol}</span>
          </>
        ) : (
          <span className="text-muted-foreground font-normal">{label}</span>
        )}
        <ChevronDown size={14} className="ml-auto text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 min-w-[160px] bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden">
          {tokens.map(t => (
            <button
              key={t.address}
              onClick={() => { onSelect(t); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-foreground hover:bg-secondary/60 transition-colors text-left"
            >
              <span className="font-semibold text-primary">{t.symbol}</span>
              <span className="text-xs text-muted-foreground ml-auto">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quote row ─────────────────────────────────────────────────────────────────

function QuoteRow({
  quote,
  isBest,
  isSelected,
  onSelect,
  toToken,
  tag,
}: {
  quote: BridgeQuote;
  isBest: boolean;
  isSelected: boolean;
  onSelect: () => void;
  toToken: Token | null;
  tag?: string;
}) {
  const meta = providerMeta(quote.providerId, quote.routeMeta);

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
        isSelected
          ? "border-primary/60 bg-primary/5"
          : "border-border/50 bg-card hover:border-primary/30"
      }`}
    >
      {/* Provider */}
      <div className="flex flex-col min-w-[90px]">
        <span className="text-sm font-semibold text-foreground">{meta.label}</span>
        {tag && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full w-fit mt-0.5"
            style={{ background: meta.color + "22", color: meta.color }}
          >
            {tag}
          </span>
        )}
      </div>

      {/* Amount out */}
      <div className="flex-1 text-right">
        <div className="text-sm font-bold text-foreground">
          {trimAmount(quote.amountOutHuman)}
          <span className="text-muted-foreground font-normal ml-1">{toToken?.symbol}</span>
        </div>
        <div className="text-[11px] text-muted-foreground/60 mt-0.5">
          Fee: {trimAmount(quote.feeHuman)} · {fmtTime(quote.estimatedTimeSeconds)}
        </div>
      </div>

      {/* Score */}
      <div className="flex flex-col items-center min-w-[44px]">
        <span
          className="text-[11px] font-bold"
          style={{ color: meta.color }}
        >
          {fmtScore(quote.score)}
        </span>
        <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">score</span>
      </div>

      {/* Best / selected indicator */}
      <div className="w-4 flex-shrink-0">
        {isSelected && <CheckCircle2 size={16} className="text-primary" />}
        {isBest && !isSelected && (
          <Zap size={14} className="text-yellow-400" />
        )}
      </div>
    </button>
  );
}

// ── Built-tx JSON viewer ──────────────────────────────────────────────────────

function TxViewer({ tx, warning, bridgeName }: { tx: BuiltTx; warning?: string; bridgeName?: string }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(tx, null, 2);

  function copy() {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-background border border-border/50 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <span className="text-xs font-semibold text-primary uppercase tracking-wide">
          Transaction Payload{bridgeName ? ` · via ${bridgeName}` : ""}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Copy size={12} />
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {warning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border-b border-border/50">
          <AlertCircle size={13} className="text-yellow-400 flex-shrink-0" />
          <span className="text-[11px] text-yellow-300">{warning}</span>
        </div>
      )}
      <pre className="text-[11px] text-primary font-mono px-4 py-3 overflow-x-auto leading-5">
        {json}
      </pre>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function BridgeAggPanel({ walletAddress }: { walletAddress?: string }) {
  const storeAddress = useWalletStore(s => s.address);
  const effectiveWallet = walletAddress ?? storeAddress ?? undefined;

  const [chains, setChains] = useState<Chain[]>([]);
  const [fromChain, setFromChain] = useState<Chain | null>(null);
  const [toChain, setToChain]     = useState<Chain | null>(null);
  const [fromTokens, setFromTokens] = useState<Token[]>([]);
  const [toTokens, setToTokens]     = useState<Token[]>([]);
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken]     = useState<Token | null>(null);
  const [amount, setAmount]       = useState("");
  const [quotes, setQuotes]       = useState<BridgeQuote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<BridgeQuote | null>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quoteError, setQuoteError]       = useState<string | null>(null);
  const [builtTx, setBuiltTx]       = useState<{ tx: BuiltTx; warning?: string; bridgeName?: string } | null>(null);
  const [buildingTx, setBuildingTx] = useState(false);
  const [buildTxError, setBuildTxError] = useState<string | null>(null);

  // Execute state
  const [executing,      setExecuting]      = useState(false);
  const [executeTxHash,  setExecuteTxHash]  = useState<string | null>(null);
  const [executeError,   setExecuteError]   = useState<string | null>(null);
  const [executeDone,    setExecuteDone]    = useState(false);

  async function handleExecute() {
    if (!builtTx) return;
    setExecuting(true);
    setExecuteError(null);
    setExecuteTxHash(null);
    try {
      // Resolve EIP-1193 provider: window.ethereum injected wallet
      const eth = (window as any).ethereum;
      const provider = eth ?? null;
      if (!provider) throw new Error("No wallet connected. Please connect a browser wallet.");

      // Switch to the source chain the bridge tx needs to run on
      const targetHex = "0x" + builtTx.tx.chainId.toString(16);
      const currentChain: string = await provider.request({ method: "eth_chainId" });
      if (currentChain.toLowerCase() !== targetHex.toLowerCase()) {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetHex }],
        });
      }

      // Resolve from-address
      const accounts: string[] = await provider.request({ method: "eth_accounts" });
      const from = accounts[0] ?? effectiveWallet;
      if (!from) throw new Error("No account found — connect your wallet.");

      const txHash: string = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from,
          to:    builtTx.tx.to,
          data:  builtTx.tx.data,
          value: builtTx.tx.value && builtTx.tx.value !== "0"
                   ? "0x" + BigInt(builtTx.tx.value).toString(16)
                   : "0x0",
        }],
      });
      setExecuteTxHash(txHash);
      setExecuteDone(true);
    } catch (e: any) {
      const msg: string = e?.message ?? "Transaction failed";
      const isReject = /reject|cancel|denied|user refused/i.test(msg);
      if (!isReject) setExecuteError(msg.slice(0, 240));
    } finally {
      setExecuting(false);
    }
  }

  function resetExecute() {
    setExecuteDone(false);
    setExecuteTxHash(null);
    setExecuteError(null);
    setBuiltTx(null);
    setQuotes([]);
    setSelectedQuote(null);
    setBuildTxError(null);
  }

  // Wallet balance for the from-token
  const { balances: evmBals, loading: evmBalsLoading } = useEvmBalances(
    walletAddress ?? null,
    fromChain?.id ?? null,
  );
  const fromTokenBal = fromToken
    ? (evmBals.find(t => t.symbol.toUpperCase() === fromToken.symbol.toUpperCase())?.amount ?? 0)
    : 0;

  // Load chains on mount
  useEffect(() => {
    fetch(`${API_BASE}/bridge-agg/chains`)
      .then(r => r.json())
      .then(d => {
        setChains(d.chains ?? []);
        if (d.chains?.length >= 2) {
          setFromChain(d.chains[0]);
          setToChain(d.chains[2]); // Arbitrum
        }
      })
      .catch(() => {});
  }, []);

  // Load tokens when chains change
  useEffect(() => {
    if (!fromChain) return;
    fetch(`${API_BASE}/bridge-agg/tokens/${fromChain.id}`)
      .then(r => r.json())
      .then(d => {
        setFromTokens(d.tokens ?? []);
        setFromToken(d.tokens?.[0] ?? null);
      })
      .catch(() => {});
  }, [fromChain]);

  useEffect(() => {
    if (!toChain) return;
    fetch(`${API_BASE}/bridge-agg/tokens/${toChain.id}`)
      .then(r => r.json())
      .then(d => {
        setToTokens(d.tokens ?? []);
        setToToken(d.tokens?.[0] ?? null);
      })
      .catch(() => {});
  }, [toChain]);

  // Fetch quotes
  const fetchQuotes = useCallback(async () => {
    if (!fromChain || !toChain || !fromToken || !toToken || !amount || parseFloat(amount) <= 0) return;
    setLoadingQuotes(true);
    setQuoteError(null);
    setQuotes([]);
    setSelectedQuote(null);
    setBuiltTx(null);
    try {
      const res = await fetch(`${API_BASE}/bridge-agg/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromChainId: fromChain.id,
          toChainId: toChain.id,
          fromTokenAddress: fromToken.address,
          toTokenAddress: toToken.address,
          amountIn: amount,
          userAddress: walletAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch quotes");
      setQuotes(data.quotes ?? []);
      setSelectedQuote(data.bestQuote ?? data.quotes?.[0] ?? null);
    } catch (e: unknown) {
      setQuoteError(e instanceof Error ? e.message : "Failed to fetch quotes");
    } finally {
      setLoadingQuotes(false);
    }
  }, [fromChain, toChain, fromToken, toToken, amount]);

  // Client-side wei conversion (mirrors the server helper)
  function clientToWei(val: string, decimals: number): string {
    try {
      const parts = val.split(".");
      const whole = parts[0] || "0";
      const frac  = (parts[1] ?? "").padEnd(decimals, "0").slice(0, decimals);
      return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || "0")).toString();
    } catch { return "0"; }
  }

  // Build tx — calls LiFi directly from the browser so the user's IP is used,
  // avoiding the server-side IP blocks that most bridge APIs enforce on shared hosting.
  async function buildTx() {
    if (!selectedQuote || !fromChain || !toChain || !fromToken || !toToken) return;
    setBuildingTx(true);
    setBuiltTx(null);
    setBuildTxError(null);
    try {
      const amountWei = clientToWei(amount, fromToken.decimals);
      const url = new URL("https://li.quest/v1/quote");
      url.searchParams.set("fromChain",  String(fromChain.id));
      url.searchParams.set("toChain",    String(toChain.id));
      url.searchParams.set("fromToken",  fromToken.address);
      url.searchParams.set("toToken",    toToken.address);
      url.searchParams.set("fromAmount", amountWei);
      url.searchParams.set("order",      "RECOMMENDED");
      if (walletAddress) {
        url.searchParams.set("fromAddress", walletAddress);
        url.searchParams.set("toAddress",   walletAddress);
      }

      const res = await fetch(url.toString());
      const data = await res.json();

      if (!res.ok) {
        const msg: string = data.message ?? "No bridge route available";
        const isSmall = /amount|small|minimum|low/i.test(msg);
        throw new Error(isSmall
          ? "Amount too small — try a higher amount (most bridges require ≥ $5 equivalent)."
          : msg);
      }

      const txr = data.transactionRequest as {
        to?: string; data?: string; value?: string; chainId?: number
      } | undefined;
      if (!txr?.to || !txr?.data) {
        throw new Error("No transaction data in LiFi response — try a larger amount or different route.");
      }

      const bridgeName: string =
        (data.toolDetails as { name?: string } | undefined)?.name
        ?? (data.tool as string | undefined)
        ?? "Bridge";

      setBuiltTx({
        tx: {
          to:      txr.to,
          data:    txr.data,
          value:   txr.value ? BigInt(txr.value).toString() : "0",
          chainId: txr.chainId ?? fromChain.id,
        },
        bridgeName,
      });
    } catch (e: unknown) {
      setBuildTxError(e instanceof Error ? e.message : "Build transaction failed");
    } finally {
      setBuildingTx(false);
    }
  }

  // Swap chains — tokens are reset by the useEffect that fires on chain change
  function swapChains() {
    const fc = fromChain, tc = toChain;
    setFromChain(tc); setToChain(fc);
    setFromToken(null); setToToken(null);
    setQuotes([]); setSelectedQuote(null); setBuiltTx(null); setBuildTxError(null);
  }

  const bestQuote = quotes[0] ?? null;
  const canFetch = !!(fromChain && toChain && fromToken && toToken && parseFloat(amount) > 0);

  return (
    <div className="max-w-xl mx-auto space-y-4">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="text-center pb-1">
        <h2 className="text-lg font-semibold text-foreground">Bridge</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Best route across multiple providers</p>
      </div>

      {/* ── From card ───────────────────────────────────────────── */}
      <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">From</span>
          {fromChain && <ChainBadge chain={fromChain} />}
        </div>

        <ChainDropdown
          chains={chains}
          selected={fromChain}
          onSelect={c => { setFromChain(c); setQuotes([]); setSelectedQuote(null); setBuiltTx(null); }}
          label="Select network"
          excludeId={toChain?.id}
        />

        {/* Balance row */}
        {walletAddress && fromToken && (
          <div className="flex items-center justify-between text-[11px] px-0.5 -mb-1">
            <span className="text-muted-foreground">Available</span>
            {evmBalsLoading && evmBals.length === 0
              ? <span className="text-muted-foreground/50 animate-pulse">loading…</span>
              : <button
                  onClick={() => fromTokenBal > 0 ? setAmount(fromTokenBal.toFixed(6)) : undefined}
                  className={fromTokenBal > 0 ? "text-primary font-semibold" : "text-muted-foreground/60 pointer-events-none"}
                >
                  {fromTokenBal < 0.0001 && fromTokenBal > 0
                    ? fromTokenBal.toFixed(8)
                    : fromTokenBal < 1
                      ? fromTokenBal.toFixed(6)
                      : fromTokenBal.toFixed(4)} {fromToken.symbol}{fromTokenBal > 0 ? " MAX" : ""}
                </button>
            }
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={e => { setAmount(e.target.value); setQuotes([]); setSelectedQuote(null); setBuiltTx(null); }}
              placeholder="0.0"
              className="w-full bg-secondary/60 border border-border/50 rounded-xl px-4 py-3 text-xl font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <TokenDropdown
            tokens={fromTokens}
            selected={fromToken}
            onSelect={t => { setFromToken(t); setQuotes([]); setSelectedQuote(null); setBuiltTx(null); }}
            label="Token"
          />
        </div>

        {/* Min/Max from quotes */}
        {quotes.length > 0 && fromToken && (
          <div className="flex items-center justify-between text-[10px] px-1 -mt-1">
            <span className="text-muted-foreground/55">
              Min: {parseFloat(quotes[quotes.length - 1]?.amountInHuman ?? "0") > 0
                ? parseFloat(quotes[quotes.length - 1].amountInHuman).toFixed(4)
                : "—"} {fromToken.symbol}
            </span>
            <span className="text-muted-foreground/40">
              Max: {parseFloat(quotes[0]?.amountInHuman ?? "0") > 0
                ? parseFloat(quotes[0].amountInHuman).toFixed(4)
                : "—"} {fromToken.symbol}
            </span>
          </div>
        )}
      </div>

      {/* ── Swap direction button ────────────────────────────────── */}
      <div className="flex items-center justify-center -my-1">
        <button
          onClick={swapChains}
          className="w-9 h-9 rounded-full bg-secondary/60 border border-border/50 flex items-center justify-center hover:border-primary/40 hover:bg-secondary transition-all"
        >
          <ArrowUpDown size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* ── To card ─────────────────────────────────────────────── */}
      <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">To</span>
          {toChain && <ChainBadge chain={toChain} />}
        </div>

        <ChainDropdown
          chains={chains}
          selected={toChain}
          onSelect={c => { setToChain(c); setQuotes([]); setSelectedQuote(null); setBuiltTx(null); }}
          label="Select network"
          excludeId={fromChain?.id}
        />

        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <div className="w-full bg-secondary/60 border border-border/50 rounded-xl px-4 py-3 text-xl font-bold text-foreground">
              {selectedQuote ? (
                <span className="text-primary">
                  {trimAmount(selectedQuote.amountOutHuman)}
                </span>
              ) : (
                <span className="text-muted-foreground/40">—</span>
              )}
            </div>
          </div>
          <TokenDropdown
            tokens={toTokens}
            selected={toToken}
            onSelect={t => { setToToken(t); setQuotes([]); setSelectedQuote(null); setBuiltTx(null); }}
            label="Token"
          />
        </div>

        {selectedQuote && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {fmtTime(selectedQuote.estimatedTimeSeconds)}
            </span>
            <span>·</span>
            <span>Fee: {trimAmount(selectedQuote.feeHuman)} {fromToken?.symbol}</span>
            <span>·</span>
            <span>Slippage: {(selectedQuote.slippageBps / 100).toFixed(2)}%</span>
          </div>
        )}
      </div>

      {/* ── Get Quotes button ────────────────────────────────────── */}
      <button
        onClick={fetchQuotes}
        disabled={!canFetch || loadingQuotes}
        className="w-full flex items-center justify-center gap-2.5 bg-primary text-primary-foreground font-bold rounded-xl py-3.5 text-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loadingQuotes ? (
          <>
            <RefreshCw size={15} className="animate-spin" />
            Aggregating quotes...
          </>
        ) : (
          <>
            <RefreshCw size={15} />
            Get Quotes
          </>
        )}
      </button>

      {/* ── Quote error ──────────────────────────────────────────── */}
      {quoteError && (
        <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{quoteError}</span>
        </div>
      )}

      {/* ── Quotes table ─────────────────────────────────────────── */}
      {quotes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Routes</span>
            <span className="text-[11px] text-muted-foreground/60">
              {quotes.length} provider{quotes.length > 1 ? "s" : ""} · sorted by score
            </span>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-4 px-4 pb-1">
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Provider</span>
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide text-right col-span-2">You Get</span>
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide text-right">Score</span>
          </div>

          {(() => {
            const tags = computeTags(quotes);
            return quotes.map((q, i) => (
              <QuoteRow
                key={q.providerId}
                quote={q}
                isBest={i === 0}
                isSelected={selectedQuote?.providerId === q.providerId}
                onSelect={() => { setSelectedQuote(q); setBuiltTx(null); }}
                toToken={toToken}
                tag={tags.get(q.providerId)}
              />
            ));
          })()}
        </div>
      )}

      {/* ── Build Transaction button ─────────────────────────────── */}
      {selectedQuote && !builtTx && (
        <button
          onClick={buildTx}
          disabled={buildingTx}
          className="w-full flex items-center justify-center gap-2.5 bg-card border border-primary/40 text-primary font-semibold rounded-xl py-3 text-sm hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {buildingTx ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              Building transaction...
            </>
          ) : (
            <>
              <ArrowRight size={14} />
              Build Transaction via {providerMeta(selectedQuote.providerId).label}
            </>
          )}
        </button>
      )}

      {/* ── Build tx error ───────────────────────────────────────── */}
      {buildTxError && (
        <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{buildTxError}</span>
        </div>
      )}

      {/* ── Execute Bridge ────────────────────────────────────────── */}
      {builtTx && !executeDone && (
        <div className="space-y-2">
          {/* Execute button */}
          <button
            onClick={handleExecute}
            disabled={executing}
            className="w-full flex items-center justify-center gap-2.5 bg-primary text-primary-foreground font-bold rounded-xl py-3.5 text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {executing ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Sign in wallet…
              </>
            ) : (
              <>
                <ArrowRight size={15} />
                Execute Bridge via {builtTx.bridgeName ?? "LiFi"}
              </>
            )}
          </button>

          {/* Execute error */}
          {executeError && (
            <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-300">{executeError}</span>
            </div>
          )}

          {/* Collapsible tx details for power users */}
          <details className="group">
            <summary className="text-[11px] text-muted-foreground/60 cursor-pointer hover:text-muted-foreground select-none px-1">
              Show raw transaction ▸
            </summary>
            <div className="mt-2">
              <TxViewer tx={builtTx.tx} warning={builtTx.warning} bridgeName={builtTx.bridgeName} />
            </div>
          </details>

          <button
            onClick={() => { setBuiltTx(null); setExecuteError(null); }}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            ← Back to quotes
          </button>
        </div>
      )}

      {/* ── Bridge success ────────────────────────────────────────── */}
      {executeDone && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-4 space-y-3">
          <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
            <CheckCircle2 size={16} />
            Bridge submitted! Tokens are on their way.
          </div>
          {executeTxHash && (
            <a
              href={`${EXPLORER_TX[builtTx?.tx.chainId ?? fromChain?.id ?? 1] ?? "https://etherscan.io/tx/"}${executeTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 underline"
            >
              <ExternalLink size={11} />
              View on explorer
            </a>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Settlement time varies by bridge. Your balance will update once confirmed on the destination chain.
          </p>
          <button
            onClick={resetExecute}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Make another bridge
          </button>
        </div>
      )}

      {/* ── Scoring legend ───────────────────────────────────────── */}
      {quotes.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl px-4 py-3">
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            Score = fees (50%) + time (30%) + slippage (20%), min-max normalised.
            Higher is better. Select any route to bridge with it.
          </p>
        </div>
      )}
    </div>
  );
}
