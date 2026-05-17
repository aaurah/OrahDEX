import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ArrowRight, ArrowUpDown, RefreshCw, Zap, Clock, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { API_BASE } from "@/lib/api";

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

// ── Provider display map ──────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { label: string; color: string; tag: string }> = {
  "mock-cheap-slow":      { label: "Across V2",  color: "#4ade80", tag: "Cheapest"  },
  "mock-fast-expensive":  { label: "Stargate V2", color: "#facc15", tag: "Fastest"  },
  "mock-balanced":        { label: "Socket",      color: "#60a5fa", tag: "Balanced" },
};

function providerMeta(id: string) {
  return PROVIDER_META[id] ?? { label: id, color: "#9ca3af", tag: "" };
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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-[#1a1f2e] border border-[#2a3047] rounded-xl px-3 py-2 text-sm font-medium text-white hover:border-[#4ade80]/40 transition-colors w-full"
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
          <span className="text-gray-500">{label}</span>
        )}
        <ChevronDown size={14} className="ml-auto text-gray-500" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-[#1a1f2e] border border-[#2a3047] rounded-xl shadow-2xl overflow-hidden">
          {chains
            .filter(c => c.id !== excludeId)
            .map(c => (
              <button
                key={c.id}
                onClick={() => { onSelect(c); setOpen(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-white hover:bg-[#232a3d] transition-colors text-left"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: CHAIN_COLORS[c.id] ?? "#9ca3af" }}
                />
                {c.name}
                <span className="ml-auto text-xs text-gray-500">{c.nativeSymbol}</span>
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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-[#232a3d] border border-[#2a3047] rounded-xl px-3 py-2 text-sm font-semibold text-white hover:border-[#4ade80]/40 transition-colors min-w-[110px]"
      >
        {selected ? (
          <>
            <span className="text-[#4ade80] font-bold">{selected.symbol}</span>
          </>
        ) : (
          <span className="text-gray-500 font-normal">{label}</span>
        )}
        <ChevronDown size={14} className="ml-auto text-gray-500" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 right-0 min-w-[160px] bg-[#1a1f2e] border border-[#2a3047] rounded-xl shadow-2xl overflow-hidden">
          {tokens.map(t => (
            <button
              key={t.address}
              onClick={() => { onSelect(t); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-white hover:bg-[#232a3d] transition-colors text-left"
            >
              <span className="font-semibold text-[#4ade80]">{t.symbol}</span>
              <span className="text-xs text-gray-500 ml-auto">{t.name}</span>
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
}: {
  quote: BridgeQuote;
  isBest: boolean;
  isSelected: boolean;
  onSelect: () => void;
  toToken: Token | null;
}) {
  const meta = providerMeta(quote.providerId);

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
        isSelected
          ? "border-[#4ade80]/60 bg-[#4ade80]/5"
          : "border-[#2a3047] bg-[#1a1f2e] hover:border-[#4ade80]/30"
      }`}
    >
      {/* Provider */}
      <div className="flex flex-col min-w-[90px]">
        <span className="text-sm font-semibold text-white">{meta.label}</span>
        {meta.tag && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full w-fit mt-0.5"
            style={{ background: meta.color + "22", color: meta.color }}
          >
            {meta.tag}
          </span>
        )}
      </div>

      {/* Amount out */}
      <div className="flex-1 text-right">
        <div className="text-sm font-bold text-white">
          {trimAmount(quote.amountOutHuman)}
          <span className="text-gray-400 font-normal ml-1">{toToken?.symbol}</span>
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">
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
        <span className="text-[9px] text-gray-600 uppercase tracking-wide">score</span>
      </div>

      {/* Best / selected indicator */}
      <div className="w-4 flex-shrink-0">
        {isSelected && <CheckCircle2 size={16} className="text-[#4ade80]" />}
        {isBest && !isSelected && (
          <Zap size={14} className="text-yellow-400" />
        )}
      </div>
    </button>
  );
}

// ── Built-tx JSON viewer ──────────────────────────────────────────────────────

function TxViewer({ tx, warning }: { tx: BuiltTx; warning?: string }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(tx, null, 2);

  function copy() {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-[#0f1420] border border-[#2a3047] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a3047]">
        <span className="text-xs font-semibold text-[#4ade80] uppercase tracking-wide">Transaction Payload</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <Copy size={12} />
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {warning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border-b border-[#2a3047]">
          <AlertCircle size={13} className="text-yellow-400 flex-shrink-0" />
          <span className="text-[11px] text-yellow-300">{warning}</span>
        </div>
      )}
      <pre className="text-[11px] text-[#4ade80] font-mono px-4 py-3 overflow-x-auto leading-5">
        {json}
      </pre>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function BridgeAggPanel({ walletAddress }: { walletAddress?: string }) {
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
  const [builtTx, setBuiltTx]     = useState<{ tx: BuiltTx; warning?: string } | null>(null);
  const [buildingTx, setBuildingTx] = useState(false);

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

  // Build tx
  async function buildTx() {
    if (!selectedQuote || !fromChain || !toChain || !fromToken || !toToken) return;
    setBuildingTx(true);
    setBuiltTx(null);
    try {
      const res = await fetch(`${API_BASE}/bridge-agg/build-tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: selectedQuote.providerId,
          fromChainId: fromChain.id,
          toChainId: toChain.id,
          fromTokenAddress: fromToken.address,
          toTokenAddress: toToken.address,
          amountIn: amount,
          userAddress: walletAddress ?? "0x0000000000000000000000000000000000000001",
          quote: selectedQuote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Build tx failed");
      setBuiltTx({ tx: data.tx, warning: data.warning });
    } finally {
      setBuildingTx(false);
    }
  }

  // Swap chains
  function swapChains() {
    const fc = fromChain, tc = toChain;
    const ft = fromToken, tt = toToken;
    setFromChain(tc); setToChain(fc);
    setFromToken(tt); setToToken(ft);
    setQuotes([]); setSelectedQuote(null); setBuiltTx(null);
  }

  const bestQuote = quotes[0] ?? null;
  const canFetch = !!(fromChain && toChain && fromToken && toToken && parseFloat(amount) > 0);

  return (
    <div className="max-w-xl mx-auto space-y-4">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="text-center pb-1">
        <h2 className="text-lg font-semibold text-white">Bridge</h2>
        <p className="text-xs text-gray-500 mt-0.5">Best route across multiple providers</p>
      </div>

      {/* ── From card ───────────────────────────────────────────── */}
      <div className="bg-[#141824] border border-[#2a3047] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">From</span>
          {fromChain && <ChainBadge chain={fromChain} />}
        </div>

        <ChainDropdown
          chains={chains}
          selected={fromChain}
          onSelect={c => { setFromChain(c); setQuotes([]); setSelectedQuote(null); setBuiltTx(null); }}
          label="Select network"
          excludeId={toChain?.id}
        />

        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={e => { setAmount(e.target.value); setQuotes([]); setSelectedQuote(null); setBuiltTx(null); }}
              placeholder="0.0"
              className="w-full bg-[#1a1f2e] border border-[#2a3047] rounded-xl px-4 py-3 text-xl font-bold text-white placeholder-gray-600 focus:outline-none focus:border-[#4ade80]/50 transition-colors"
            />
          </div>
          <TokenDropdown
            tokens={fromTokens}
            selected={fromToken}
            onSelect={t => { setFromToken(t); setQuotes([]); setSelectedQuote(null); setBuiltTx(null); }}
            label="Token"
          />
        </div>
      </div>

      {/* ── Swap direction button ────────────────────────────────── */}
      <div className="flex items-center justify-center -my-1">
        <button
          onClick={swapChains}
          className="w-9 h-9 rounded-full bg-[#1a1f2e] border border-[#2a3047] flex items-center justify-center hover:border-[#4ade80]/40 hover:bg-[#232a3d] transition-all"
        >
          <ArrowUpDown size={16} className="text-gray-400" />
        </button>
      </div>

      {/* ── To card ─────────────────────────────────────────────── */}
      <div className="bg-[#141824] border border-[#2a3047] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">To</span>
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
            <div className="w-full bg-[#1a1f2e] border border-[#2a3047] rounded-xl px-4 py-3 text-xl font-bold text-white">
              {selectedQuote ? (
                <span className="text-[#4ade80]">
                  {trimAmount(selectedQuote.amountOutHuman)}
                </span>
              ) : (
                <span className="text-gray-600">—</span>
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
          <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
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
        className="w-full flex items-center justify-center gap-2.5 bg-[#4ade80] text-black font-bold rounded-xl py-3.5 text-sm hover:bg-[#22c55e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Routes</span>
            <span className="text-[11px] text-gray-600">
              {quotes.length} provider{quotes.length > 1 ? "s" : ""} · sorted by score
            </span>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-4 px-4 pb-1">
            <span className="text-[10px] text-gray-600 uppercase tracking-wide">Provider</span>
            <span className="text-[10px] text-gray-600 uppercase tracking-wide text-right col-span-2">You Get</span>
            <span className="text-[10px] text-gray-600 uppercase tracking-wide text-right">Score</span>
          </div>

          {quotes.map((q, i) => (
            <QuoteRow
              key={q.providerId}
              quote={q}
              isBest={i === 0}
              isSelected={selectedQuote?.providerId === q.providerId}
              onSelect={() => { setSelectedQuote(q); setBuiltTx(null); }}
              toToken={toToken}
            />
          ))}
        </div>
      )}

      {/* ── Build Transaction button ─────────────────────────────── */}
      {selectedQuote && !builtTx && (
        <button
          onClick={buildTx}
          disabled={buildingTx}
          className="w-full flex items-center justify-center gap-2.5 bg-[#1a1f2e] border border-[#4ade80]/40 text-[#4ade80] font-semibold rounded-xl py-3 text-sm hover:bg-[#4ade80]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

      {/* ── Built transaction viewer ─────────────────────────────── */}
      {builtTx && (
        <div className="space-y-2">
          <TxViewer tx={builtTx.tx} warning={builtTx.warning} />
          <button
            onClick={() => setBuiltTx(null)}
            className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors py-1"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Scoring legend ───────────────────────────────────────── */}
      {quotes.length > 0 && (
        <div className="bg-[#141824] border border-[#2a3047] rounded-xl px-4 py-3">
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Score = fees (50%) + time (30%) + slippage (20%), min-max normalised.
            Higher is better. Select any route to bridge with it.
          </p>
        </div>
      )}
    </div>
  );
}
