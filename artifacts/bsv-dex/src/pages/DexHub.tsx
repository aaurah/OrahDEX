import { useState, useMemo, Fragment, useEffect, useRef } from "react";
import { useSEO } from "@/hooks/useSEO";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, Globe, ArrowUpRight, Search, RefreshCw,
  BarChart2, ShieldCheck, Layers, ExternalLink, Coins,
  ArrowUpDown, ChevronDown, Droplets, Zap, X, ChevronUp,
  Shield, Link2, Copy, Check, FlaskConical, Receipt, AlertTriangle, CheckCircle2, Info,
  Cpu, Waves, Activity, Gauge,
} from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { BrandLogo, OrahInline, OrahO } from "@/components/BrandLogo";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useBsvChain, fmtHashrate, fmtDifficulty, fmtMempoolMb, fmtBlockAge } from "@/hooks/useBsvChain";
import { useSettingsStore, convertFromUsd, getCurrencySymbol, formatQuoteAmount } from "@/store/useSettingsStore";

/* ── Curated Base / Zora ecosystem tokens ── */
const ZORA_COINS = [
  { id: "zora-network",  symbol: "ZORA",   name: "Zora",          chain: "Base",  contract: "0x1111111111166B7FE7bd91CA18A7FE55b40B963", image: "https://assets.coingecko.com/coins/images/35552/small/zora.png" },
  { id: "degen-base",    symbol: "DEGEN",  name: "Degen",         chain: "Base",  contract: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", image: "https://assets.coingecko.com/coins/images/34515/small/android-chrome-512x512.png" },
  { id: "brett-base",    symbol: "BRETT",  name: "Brett",         chain: "Base",  contract: "0x532f27101965dd16442E59d40670FaF5eBB142E4", image: "https://assets.coingecko.com/coins/images/35529/small/1000048322.png" },
  { id: "higher-base",   symbol: "HIGHER", name: "Higher",        chain: "Base",  contract: "0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe", image: "" },
  { id: "enjoy-zora",    symbol: "ENJOY",  name: "Enjoy",         chain: "Zora",  contract: "0xa6B280B42CB0b7c4a4F789eC6cCC3a7609A1Bc39", image: "" },
  { id: "mochi-base",    symbol: "MOCHI",  name: "Mochi",         chain: "Base",  contract: "0xF6e932Ca12afa26665dC4dDE7e27be02A7c02e50", image: "" },
  { id: "toshi-base",    symbol: "TOSHI",  name: "Toshi",         chain: "Base",  contract: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4", image: "" },
  { id: "normie-base",   symbol: "NORMIE", name: "Normie",        chain: "Base",  contract: "0x7F12d13B34F5F4f0a9449c16Bcd42f0da47AF200", image: "" },
  { id: "doginme-base",  symbol: "DOGINME",name: "Doginme",       chain: "Base",  contract: "0x6921B130D297cc43754afba22e5EAc0FBf8Db75b", image: "" },
  { id: "mfer-base",     symbol: "MFER",   name: "mfer",          chain: "Base",  contract: "0xe3086852A4B125803C815a158249ae468A3254Ca", image: "" },
];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmtUsd(n: number) {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6)  return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3)  return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}
function fmtBtc(n: number) {
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K BTC";
  return n.toFixed(2) + " BTC";
}
function trustColor(score: number) {
  if (score >= 8) return "text-green-500";
  if (score >= 5) return "text-green-500";
  return "text-red-400";
}
function TrustDots({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className={cn("w-1.5 h-1.5 rounded-full",
          i < score
            ? score >= 8 ? "bg-green-500" : score >= 5 ? "bg-green-500" : "bg-red-400"
            : "bg-muted")} />
      ))}
    </div>
  );
}

// Chain colour map
const CHAIN_STYLE: Record<string, string> = {
  "Ethereum":      "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Ethereum L2":   "bg-blue-400/10 text-blue-300 border-blue-400/20",
  "BSC":           "bg-green-500/10 text-green-400 border-green-500/20",
  "Polygon":       "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "Arbitrum":      "bg-sky-500/10 text-sky-400 border-sky-500/20",
  "Base/Optimism": "bg-red-500/10 text-red-400 border-red-500/20",
  "Optimism":      "bg-red-500/10 text-red-400 border-red-500/20",
  "Base":          "bg-blue-600/10 text-blue-400 border-blue-600/20",
  "Avalanche":     "bg-red-600/10 text-red-400 border-red-600/20",
  "Solana":        "bg-green-500/10 text-green-400 border-green-500/20",
  "Cosmos":        "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  "THORChain":     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "Fantom":        "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "NEAR":          "bg-teal-500/10 text-teal-400 border-teal-500/20",
  "Multi-chain":   "bg-muted/60 text-muted-foreground border-border",
};
function ChainBadge({ chain }: { chain: string }) {
  const style = CHAIN_STYLE[chain] ?? "bg-muted/60 text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border", style)}>
      {chain}
    </span>
  );
}
function ExLogo({ src, name, type }: { src: string; name: string; type: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
        type === "dex" ? "bg-violet-500/20 text-violet-300" : "bg-blue-500/20 text-blue-300"
      )}>
        {name?.[0] ?? "?"}
      </div>
    );
  }
  return (
    <img src={src} alt={name}
      className="w-7 h-7 rounded-full object-cover bg-secondary shrink-0"
      onError={() => setErrored(true)} />
  );
}

function CexBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-blue-600/10 text-blue-300 border-blue-600/20">
      CEX
    </span>
  );
}

type View    = "exchanges" | "coins";
type ExType  = "all" | "cex" | "dex";
type SortKey = "rank" | "volume" | "marketcap" | "trust" | "name";
type CoinSort = "rank" | "base" | "price" | "chg" | "vol";

const SORT_LABELS: Record<SortKey, string> = {
  rank:      "Rank",
  volume:    "24h Volume",
  marketcap: "Market Cap",
  trust:     "Trust Score",
  name:      "Name (A–Z)",
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * VAMM Instant-Swap Panel — powered by Genesis Liquidity Engine
 * Embeds directly inside Market Hub whenever a user wants to trade a coin
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
interface VammQuote {
  price: number; priceAfter: number; priceImpactPct: number; fee: number;
  tokensOut?: number; usdtOut?: number;
}
interface VammResult {
  success: boolean; tradeId: string; side: "buy"|"sell";
  tokensReceived?: number; usdtSpent?: number; usdtReceived?: number; tokensSold?: number;
  fee: number; avgPrice: number; newPrice: number;
  trade: { id: string; time: number };
}

function fmtV(n: number): string {
  if (!isFinite(n)||isNaN(n)) return "—";
  if (n>=1_000_000) return `${(n/1_000_000).toFixed(2)}M`;
  if (n>=1_000) return `${(n/1_000).toFixed(2)}K`;
  if (n>=1) return n.toFixed(4);
  if (n>=0.001) return n.toFixed(6);
  return n.toPrecision(4);
}
function fmtUsdV(n: number): string {
  if (!isFinite(n)||isNaN(n)) return "$—";
  if (n>=1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (n>=1_000) return `$${(n/1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function VammSwapPanel({ symbol, onClose }: { symbol: string; onClose?: () => void }) {
  const qc = useQueryClient();
  const [side, setSide] = useState<"buy"|"sell">("buy");
  const [amount, setAmount] = useState("");
  const [debounced, setDebounced] = useState("");
  const [receipt, setReceipt] = useState<VammResult|null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(amount), 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [amount]);

  /* Check if symbol is supported by VAMM */
  const { data: markets } = useQuery<{ symbol: string }[]>({
    queryKey: ["genesis-markets"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/genesis/markets`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    staleTime: 60_000,
  });
  const isSupported = !markets || markets.some(m => m.symbol === symbol);

  /* Quote */
  const { data: quote, isLoading: quoteLoading } = useQuery<VammQuote>({
    queryKey: ["vamm-quote", symbol, side, debounced],
    queryFn: async () => {
      if (!debounced || parseFloat(debounced) <= 0) throw new Error("no amount");
      const p = new URLSearchParams({ symbol, side });
      if (side === "buy") p.set("usdtAmount", debounced);
      else p.set("tokenAmount", debounced);
      const r = await fetch(`${BASE}/api/genesis/quote?${p}`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      return r.json();
    },
    enabled: !!debounced && parseFloat(debounced) > 0 && isSupported,
    retry: false,
  });

  /* Swap */
  const swap = useMutation<VammResult, Error>({
    mutationFn: async () => {
      const body: Record<string, unknown> = { symbol, side };
      if (side === "buy") body.usdtAmount = parseFloat(amount);
      else body.tokenAmount = parseFloat(amount);
      const r = await fetch(`${BASE}/api/genesis/swap`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      return r.json();
    },
    onSuccess: (data) => {
      setReceipt(data); setAmount(""); setDebounced("");
      qc.invalidateQueries({ queryKey: ["genesis-markets"] });
    },
  });

  /* ── Receipt view ── */
  if (receipt) {
    const isBuy = receipt.side === "buy";
    return (
      <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-bold text-white">Trade Receipt</span>
          </div>
          {onClose && (
            <button onClick={() => { setReceipt(null); onClose(); }} className="text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
          <FlaskConical className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
          <span className="text-[11px] text-orange-400">
            <strong>Simulated trade.</strong> No real {symbol} transferred. Virtual bonding curve only.
          </span>
        </div>
        <div className="text-center py-2">
          <div className={`text-2xl font-black mb-0.5 ${isBuy ? "text-green-400" : "text-blue-400"}`}>
            {isBuy ? `${fmtV(receipt.tokensReceived ?? 0)} ${symbol}` : fmtUsdV(receipt.usdtReceived ?? 0)}
          </div>
          <div className="text-xs text-gray-500">
            {isBuy ? `Spent ${fmtUsdV(receipt.usdtSpent ?? 0)} USDT (virtual)` : `Sold ${fmtV(receipt.tokensSold ?? 0)} ${symbol} (virtual)`}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { l: "Avg Price", v: fmtUsdV(receipt.avgPrice) },
            { l: "New Price", v: fmtUsdV(receipt.newPrice) },
            { l: "Fee (0.30%)", v: fmtUsdV(receipt.fee) },
            { l: "Type", v: "Virtual AMM" },
          ].map(r => (
            <div key={r.l} className="bg-white/[0.03] rounded-lg px-3 py-2">
              <div className="text-gray-500 text-[10px]">{r.l}</div>
              <div className="text-white font-medium">{r.v}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.02] border border-white/5 rounded-xl">
          <span className="text-[10px] text-gray-500 flex-1 font-mono truncate">ID: {receipt.tradeId}</span>
          <button onClick={() => { navigator.clipboard?.writeText(receipt.tradeId).catch(() => {}); setCopiedId(true); setTimeout(() => setCopiedId(false), 1500); }}
            className="text-gray-500 hover:text-yellow-400 transition-colors flex-shrink-0">
            {copiedId ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        <button onClick={() => setReceipt(null)}
          className="w-full py-2.5 rounded-xl bg-white/5 text-gray-400 text-sm hover:bg-white/10 transition-colors">
          New Trade
        </button>
      </div>
    );
  }

  /* ── Swap form ── */
  return (
    <div className="rounded-2xl border border-yellow-500/20 bg-[#0e0e14] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-bold text-white">VAMM Instant Swap</span>
          <span className="text-[9px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full font-semibold">VIRTUAL</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        )}
      </div>

      {/* Not supported notice */}
      {markets && !isSupported && (
        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/8 rounded-xl px-3 py-3 text-sm text-gray-400">
          <Info className="w-4 h-4 text-gray-500 flex-shrink-0" />
          {symbol} is not yet in the VAMM engine. Supported: BTC, ETH, SOL, BSV and 52 other major assets.
        </div>
      )}

      {isSupported && (
        <>
          {/* Notice */}
          <div className="flex items-center gap-1.5 text-[11px] text-orange-400">
            <FlaskConical className="w-3 h-3 flex-shrink-0" />
            <span>Simulated only — no real {symbol} changes hands. No wallet required.</span>
          </div>

          {/* Buy/Sell tabs */}
          <div className="flex rounded-xl bg-white/[0.03] border border-white/8 p-0.5">
            {(["buy", "sell"] as const).map(s => (
              <button key={s} onClick={() => { setSide(s); setAmount(""); }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  side === s ? s === "buy" ? "bg-green-500 text-white" : "bg-red-500 text-white" : "text-gray-400"
                }`}>
                {s === "buy" ? "Simulate Buy" : "Simulate Sell"}
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div className="flex items-center bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-yellow-500/40">
            <input value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" type="number" min="0"
              className="flex-1 bg-transparent text-lg font-bold text-white outline-none placeholder-gray-700" />
            <span className="text-xs text-gray-500">{side === "buy" ? "USDT" : symbol}</span>
          </div>

          {/* Quick amounts for buy */}
          {side === "buy" && (
            <div className="flex gap-1.5">
              {[100, 500, 1000].map(v => (
                <button key={v} onClick={() => setAmount(String(v))}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-white/[0.04] text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 border border-white/5 transition-colors">
                  ${v}
                </button>
              ))}
            </div>
          )}

          {/* Quote */}
          {quoteLoading && debounced && (
            <div className="flex items-center gap-2 text-xs text-gray-500 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" /> Calculating…
            </div>
          )}
          {quote && !quoteLoading && (
            <div className="bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Receive (virtual)</span>
                <span className="font-bold text-white">
                  {side === "buy" ? `${fmtV(quote.tokensOut ?? 0)} ${symbol}` : fmtUsdV(quote.usdtOut ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Price</span>
                <span className="text-white">{fmtUsdV(quote.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Impact</span>
                <span className={quote.priceImpactPct < 1 ? "text-green-400" : quote.priceImpactPct < 2 ? "text-yellow-400" : "text-red-400"}>
                  {quote.priceImpactPct.toFixed(3)}%
                </span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Fee (0.30%)</span><span>{fmtUsdV(quote.fee)}</span>
              </div>
            </div>
          )}

          {/* Error */}
          {swap.isError && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{(swap.error as Error).message}
            </div>
          )}

          {/* Swap button */}
          <button onClick={() => swap.mutate()}
            disabled={!amount || parseFloat(amount) <= 0 || swap.isPending}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
              !amount || parseFloat(amount) <= 0
                ? "bg-white/5 text-gray-600 cursor-not-allowed"
                : side === "buy" ? "bg-green-500 hover:bg-green-400 text-white" : "bg-red-500 hover:bg-red-400 text-white"
            }`}>
            {swap.isPending
              ? <span className="flex items-center justify-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Simulating…</span>
              : `${side === "buy" ? "Simulate Buy" : "Simulate Sell"} ${symbol}`
            }
          </button>
        </>
      )}
    </div>
  );
}

/* ── VAMM Swap Overlay Modal (full-screen on mobile, centered on desktop) ── */
function VammSwapModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 lg:inset-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:w-[420px] max-h-[90vh] overflow-y-auto rounded-t-2xl lg:rounded-2xl bg-[#0e0e14] border border-white/10 shadow-2xl p-4">
        <VammSwapPanel symbol={symbol} onClose={onClose} />
      </div>
    </>
  );
}

export function DexHub() {
  useSEO({
    title: "Market Hub — All CEX & DEX Exchanges",
    description: "Explore aggregated CEX and DEX data across all chains on OrahDEX Market Hub. Track volumes, liquidity, and top tokens with sovereign on-chain data.",
    keywords: "DEX hub, crypto market data, cross-chain DEX, CEX exchanges, liquidity data, on-chain trading, OrahDEX, BSV settlement",
    url: "/dex",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "OrahDEX Market Hub",
      "description": "Cross-chain DEX market data aggregator",
      "url": "https://orahdex.replit.app/dex"
    }
  });

  const [, navigate] = useLocation();
  const online = useOnlineStatus();
  const { data: bsvChain } = useBsvChain();
  const { quoteCurrency } = useSettingsStore();
  const qSym = getCurrencySymbol(quoteCurrency);
  const [view, setView]         = useState<View>("exchanges");
  const [search, setSearch]     = useState("");
  const [exType, setExType]     = useState<ExType>("all");
  const [sortBy, setSortBy]     = useState<SortKey>("rank");
  const [exSortDir, setExSortDir] = useState<"asc" | "desc">("asc");

  /* ── Coin sort / search state ── */
  const [coinSearch, setCoinSearch]       = useState("");
  const [contractSearch, setContractSearch] = useState("");
  const [coinSort, setCoinSort]           = useState<CoinSort>("rank");
  const [coinSortDir, setCoinSortDir]     = useState<"asc"|"desc">("asc");
  const [coinPage, setCoinPage]           = useState(0);
  const [copiedAddr, setCopiedAddr]       = useState<string | null>(null);
  const [vammCoin, setVammCoin]           = useState<any | null>(null);
  const [showZora, setShowZora]           = useState(false);
  const COIN_PAGE_SIZE = 50;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["exchanges-all"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/dex/exchanges`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const allExchanges: any[] = data?.exchanges ?? [];

  /* ── World coins ── */
  const { data: coinsRaw, isLoading: coinsLoading } = useQuery({
    queryKey: ["coins-markets-world"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/coins/markets?per_page=250`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  const allCoins: any[] = Array.isArray(coinsRaw) ? coinsRaw : [];

  /* Look up Zora contract for a given symbol */
  const zoraContractFor = (symbol: string) =>
    ZORA_COINS.find(z => z.symbol.toLowerCase() === symbol.toLowerCase())?.contract ?? null;

  const filteredCoins = useMemo(() => {
    let rows = allCoins;
    if (coinSearch) {
      const q = coinSearch.toLowerCase();
      rows = rows.filter(m =>
        m.symbol.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q)
      );
    }
    if (contractSearch.trim().length > 5) {
      const q = contractSearch.trim().toLowerCase();
      const matched = ZORA_COINS.filter(z => z.contract.toLowerCase().includes(q));
      const matchedSymbols = new Set(matched.map(z => z.symbol.toLowerCase()));
      rows = rows.filter(m => matchedSymbols.has(m.symbol.toLowerCase()));
    }
    return [...rows].sort((a, b) => {
      let v = 0;
      if (coinSort === "rank")  v = (a.rank ?? a.market_cap_rank ?? 9999) - (b.rank ?? b.market_cap_rank ?? 9999);
      if (coinSort === "base")  v = a.name.localeCompare(b.name);
      if (coinSort === "price") v = a.price - b.price;
      if (coinSort === "chg")   v = a.change24h - b.change24h;
      if (coinSort === "vol")   v = a.volume24h - b.volume24h;
      return coinSortDir === "asc" ? v : -v;
    });
  }, [allCoins, coinSearch, coinSort, coinSortDir]);

  const pagedCoins = filteredCoins.slice(0, (coinPage + 1) * COIN_PAGE_SIZE);

  /* ── Selected coin for exchange modal ── */
  const [selectedCoin, setSelectedCoin] = useState<any | null>(null);

  const { data: tickersData, isLoading: tickersLoading } = useQuery({
    queryKey: ["coin-tickers", selectedCoin?.id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/coins/${encodeURIComponent(selectedCoin!.id)}/tickers`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!selectedCoin,
    staleTime: 5 * 60 * 1000,
  });

  function toggleCoinSort(k: CoinSort) {
    if (coinSort === k) setCoinSortDir(d => d === "asc" ? "desc" : "asc");
    else { setCoinSort(k); setCoinSortDir(k === "rank" || k === "base" ? "asc" : "desc"); }
    setCoinPage(0);
  }

  function fmtPrice(p: number) {
    if (!p) return "—";
    const c = convertFromUsd(p, quoteCurrency);
    if (c >= 10000) return c.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (c >= 1)     return c.toFixed(2);
    if (c >= 0.01)  return c.toFixed(4);
    if (c >= 0.0001) return c.toFixed(6);
    return c.toFixed(8);
  }

  function fmtVol(v: number) {
    if (!v) return "—";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toFixed(2);
  }

  function toggleExSort(key: SortKey) {
    if (sortBy === key) {
      setExSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      // Rank sorts asc by default (1 = best); all others sort desc (highest = best)
      setExSortDir(key === "rank" || key === "name" ? "asc" : "desc");
    }
  }

  const sortFn = (a: any, b: any) => {
    let v = 0;
    if (sortBy === "rank")      v = (a.rank ?? 9999) - (b.rank ?? 9999);
    if (sortBy === "volume")    v = a.tradeVolume24hUsd - b.tradeVolume24hUsd;
    if (sortBy === "marketcap") v = a.marketCap - b.marketCap;
    if (sortBy === "trust")     v = a.trustScore - b.trustScore;
    if (sortBy === "name")      v = a.name.localeCompare(b.name);
    return exSortDir === "desc" ? -v : v;
  };

  const filtered = useMemo(() => {
    let rows = allExchanges;
    // Filter by type first
    if (exType !== "all") {
      rows = rows.filter(e => e.type === exType);
    }
    // Then filter by search
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.chain ?? "").toLowerCase().includes(q) ||
        (e.country ?? "").toLowerCase().includes(q)
      );
    }
    return [...rows].sort(sortFn);
  }, [allExchanges, exType, search, sortBy]);

  const btcPrice: number = data?.btcPrice ?? 0;

  // Stats that react to the selected tab — computed from type-filtered exchanges (no search)
  const typeFiltered: any[] = useMemo(() => {
    if (!allExchanges.length) return [];
    if (exType === "all") return allExchanges;
    return allExchanges.filter(e => e.type === exType);
  }, [allExchanges, exType]);

  const statVolumeBtc   = typeFiltered.reduce((s, e) => s + (e.tradeVolume24hBtc ?? 0), 0);
  const statVolumeUsd   = typeFiltered.reduce((s, e) => s + (e.tradeVolume24hUsd ?? 0), 0);
  const statCount       = typeFiltered.length;
  const statDexCount    = typeFiltered.filter(e => e.type === "dex").length;
  const statCexCount    = typeFiltered.filter(e => e.type === "cex").length;

  // Market cap: use global API totals — more accurate than per-exchange sum
  const apiDefiMc  = data?.defiMarketCap ?? 0;
  const apiCefiMc  = data?.cefiMarketCap ?? 0;
  const statMarketCap = exType === "dex" ? apiDefiMc : exType === "cex" ? apiCefiMc : (apiDefiMc + apiCefiMc);
  const statDefiMc    = exType === "cex" ? 0 : apiDefiMc;
  const statCefiMc    = exType === "dex" ? 0 : apiCefiMc;

  const TAB_STYLE = (active: boolean, type?: ExType) => cn(
    "px-4 py-2 rounded-xl text-sm font-semibold border transition-all",
    active
      ? type === "dex"
        ? "bg-violet-500/15 border-violet-500/40 text-violet-400"
        : type === "cex"
        ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
        : "bg-primary/15 border-primary/40 text-primary"
      : "bg-card border-border text-muted-foreground hover:text-foreground"
  );

  return (
    <div className="p-4 lg:p-10 max-w-[1500px] mx-auto w-full">

      {/* ── Hero ── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <BrandLogo textSize="text-4xl lg:text-5xl" tooltip={false} />
          <div className="h-8 w-px bg-border" />
          <div>
            <div className="text-[11px] text-primary font-bold uppercase tracking-widest leading-tight">Market Hub</div>
            <div className="text-xs text-muted-foreground leading-tight">Trade means DEX</div>
          </div>
        </div>
        <h1 className="text-2xl lg:text-4xl font-bold tracking-tight mb-2">
          All Exchanges — CEX &amp; DEX
        </h1>
        <p className="text-muted-foreground text-sm lg:text-base max-w-3xl">
          Every centralised and decentralised exchange ranked by volume &amp; market cap — sovereign data from the OrahDEX price engine. Trade any pair with on-chain BSV settlement.
        </p>
      </div>

      {/* ── L1 / L2 / L3 Architecture strip ── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          {
            layer: "L1", title: "Base Security", icon: Shield,
            color: "text-green-400", border: "border-green-500/20",
            bg: "from-green-500/5 to-transparent",
            items: ["BTC · BSV · ETH · SOL", "Final settlement anchor", "HTLC scripts & bridges"],
          },
          {
            layer: "L2", title: "Scaling Layer", icon: Zap,
            color: "text-sky-400", border: "border-sky-500/20",
            bg: "from-sky-500/5 to-transparent",
            items: ["Arbitrum · Optimism · Base", "Cheap AMM execution", "Rollup-secured trades"],
          },
          {
            layer: "L3", title: "OrahDEX Router", icon: Link2,
            color: "text-primary", border: "border-primary/20",
            bg: "from-primary/5 to-transparent",
            items: ["Smart cross-chain routing", "BSV settlement fabric", "Fee & rewards system"],
          },
        ].map(({ layer, title, icon: Icon, color, border, bg, items }) => (
          <div key={layer} className={cn(
            "rounded-2xl border bg-gradient-to-br p-4",
            border, bg
          )}>
            <div className="flex items-center gap-2 mb-3">
              <div className={cn("w-7 h-7 rounded-lg bg-background/60 flex items-center justify-center", color)}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className={cn("text-[10px] font-black uppercase tracking-wider", color)}>{layer}</div>
                <div className="text-xs font-semibold text-foreground">{title}</div>
              </div>
            </div>
            <ul className="space-y-1.5">
              {items.map(item => (
                <li key={item} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <span className={cn("w-1 h-1 rounded-full shrink-0 bg-current", color)} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* ── BSV On-Chain Network Stats strip ── */}
      <div className="rounded-2xl border border-green-500/20 bg-gradient-to-r from-green-500/5 to-transparent mb-6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", bsvChain?.online ? "bg-green-400 animate-pulse" : "bg-zinc-500")} />
            <span className="text-xs font-bold text-green-400 uppercase tracking-wider">BSV Mainnet</span>
            <span className="text-[10px] text-muted-foreground">· Settlement Layer · WhatsOnChain live data</span>
          </div>
          {bsvChain?.explorerUrl && (
            <a href={bsvChain.explorerUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-primary hover:underline">
              View block <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { icon: Layers,   label: "Block Height",  value: bsvChain?.blockHeight ? `#${bsvChain.blockHeight.toLocaleString()}` : "—", color: "text-green-400" },
            { icon: Cpu,      label: "Hashrate",      value: fmtHashrate(bsvChain?.hashrateEHs ?? 0),                                 color: "text-sky-400"   },
            { icon: Gauge,    label: "Difficulty",    value: fmtDifficulty(bsvChain?.difficulty ?? 0),                                color: "text-yellow-400"},
            { icon: Zap,      label: "Fee Rate",      value: `${bsvChain?.feeRateSatPerByte ?? 1} sat/B`,                            color: "text-orange-400"},
            { icon: Waves,    label: "Mempool",       value: fmtMempoolMb(bsvChain?.mempoolBytes ?? 0),                              color: "text-violet-400"},
            { icon: Activity, label: "Mempool TXs",   value: bsvChain?.mempoolTxCount ? bsvChain.mempoolTxCount.toLocaleString() : "—", color: "text-blue-400"},
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="text-center">
              <Icon className={cn("w-4 h-4 mx-auto mb-1", color)} />
              <div className={cn("text-sm font-bold font-mono", color)}>{value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        {bsvChain?.medianTime ? (
          <div className="mt-2 pt-2 border-t border-border/30 text-[10px] text-muted-foreground flex flex-wrap gap-4">
            <span>Median block: <span className="text-foreground">{fmtBlockAge(bsvChain.medianTime)}</span></span>
            <span>Avg block time: <span className="text-foreground">~10 min</span></span>
            {bsvChain.bsvUsd > 0 && <span>BSV/USD: <span className="text-green-400 font-bold">${bsvChain.bsvUsd.toFixed(2)}</span></span>}
            <span>Best block hash: <a href={bsvChain.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-primary font-mono hover:underline">{bsvChain.bestBlockHash.slice(0, 12)}…</a></span>
          </div>
        ) : null}
      </div>

      {/* ── Main view tabs ── */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setView("exchanges")}
          className={cn("px-5 py-2 rounded-xl text-sm font-semibold border transition-all",
            view === "exchanges"
              ? "bg-primary/15 border-primary/40 text-primary"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          )}
        >
          Exchanges
        </button>
        <button
          onClick={() => { setView("coins"); setCoinPage(0); }}
          className={cn("px-5 py-2 rounded-xl text-sm font-semibold border transition-all flex items-center gap-2",
            view === "coins"
              ? "bg-primary/15 border-primary/40 text-primary"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          )}
        >
          All Coins
          {allCoins.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
              {allCoins.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Liquidity Pools Banner ── */}
      <div
        onClick={() => navigate("/liquidity")}
        className="cursor-pointer mb-6 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-green-500/10 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:border-primary/60 transition-colors"
      >
        {/* Top / left: icon + text */}
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
            <Droplets size={22} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-bold text-base leading-tight">Liquidity Pools</span>
              <span className="whitespace-nowrap text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full font-bold">UP TO 78% APR</span>
            </div>
            <p className="text-sm text-muted-foreground leading-snug">Provide liquidity to earn trading fees + yield farming rewards. Both AMM pools and market-maker rebates available.</p>
          </div>
        </div>

        {/* Bottom / right: stats + button */}
        <div className="flex items-center gap-4 sm:gap-5 sm:shrink-0">
          <div className="hidden lg:flex gap-6">
            {[["$879M", "Total TVL"], ["12 Pools", "Active"], ["78% APR", "Best Rate"]].map(([v, l]) => (
              <div key={l} className="text-center">
                <div className="font-bold text-base">{v}</div>
                <div className="text-xs text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors sm:ml-auto whitespace-nowrap">
            <Zap size={14} /> Provide Liquidity
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-gradient-to-br from-card to-secondary p-4 lg:p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            {exType === "cex" ? "CEX" : exType === "dex" ? "DEX" : "Total"} Volume 24h
          </div>
          {isLoading ? <div className="h-8 w-32 bg-muted animate-pulse rounded" /> : (
            <>
              <div className="text-xl lg:text-2xl font-mono font-bold">{fmtUsd(statVolumeUsd)}</div>
              <div className="text-xs text-muted-foreground mt-1">{fmtBtc(statVolumeBtc)}</div>
            </>
          )}
        </div>

        <div className="bg-gradient-to-br from-card to-secondary p-4 lg:p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Coins className="w-4 h-4 text-violet-400" />
            {exType === "cex" ? "CEX" : exType === "dex" ? "DEX" : "Combined"} Market Cap
          </div>
          {isLoading ? <div className="h-8 w-28 bg-muted animate-pulse rounded" /> : (
            <>
              <div className="text-xl lg:text-2xl font-mono font-bold">{fmtUsd(statMarketCap)}</div>
              <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                {exType !== "dex"  && <span className="text-blue-400">CEX {fmtUsd(statCefiMc)}</span>}
                {exType !== "cex"  && <span className="text-violet-400">DEX {fmtUsd(statDefiMc)}</span>}
              </div>
            </>
          )}
        </div>

        <div className="bg-gradient-to-br from-card to-secondary p-4 lg:p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Globe className="w-4 h-4 text-blue-400" />
            {exType === "cex" ? "CEX" : exType === "dex" ? "DEX" : "Exchanges"} Tracked
          </div>
          {isLoading ? <div className="h-8 w-16 bg-muted animate-pulse rounded" /> : (
            <>
              <div className="text-xl lg:text-2xl font-mono font-bold">{statCount}</div>
              <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                {exType !== "dex"  && <span className="text-blue-400">{statCexCount} CEX</span>}
                {exType !== "cex"  && <span className="text-violet-400">{statDexCount} DEX</span>}
              </div>
            </>
          )}
        </div>

        <div className="bg-gradient-to-br from-card to-secondary p-4 lg:p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <ShieldCheck className="w-4 h-4 text-green-400" />
            BTC Price (live)
          </div>
          {isLoading ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : (
            <>
              <div className="text-xl lg:text-2xl font-mono font-bold">${btcPrice.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">via sovereign engine</div>
            </>
          )}
        </div>
      </div>

      {/* ══════════════ ALL COINS VIEW ══════════════ */}
      {view === "coins" && (
        <div>
          {/* ── Zora / Base section ── */}
          <div className="mb-5">
            <button
              onClick={() => setShowZora(v => !v)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left",
                showZora
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card hover:border-primary/30"
              )}
            >
              <div className="w-9 h-9 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                <span className="text-base font-black text-blue-400">⬡</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-foreground">Base & Zora Ecosystem</div>
                <div className="text-xs text-muted-foreground">Zora.co tokens · ZORA · DEGEN · BRETT · HIGHER + more</div>
              </div>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showZora && "rotate-180")} />
            </button>

            {showZora && (
              <div className="mt-2 bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-2 border-b border-border/60 bg-secondary/30">
                  <p className="text-[11px] text-muted-foreground font-medium">Tap any coin to copy its Base contract address for trading</p>
                </div>
                {ZORA_COINS.map(coin => (
                  <div key={coin.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0">
                    <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {coin.image
                        ? <img src={coin.image} alt={coin.symbol} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        : <span className="text-xs font-bold text-blue-400">{coin.symbol[0]}</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{coin.symbol}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">{coin.chain}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{coin.contract}</p>
                    </div>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(coin.contract).catch(() => {});
                        setCopiedAddr(coin.contract);
                        setTimeout(() => setCopiedAddr(null), 2000);
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      title="Copy contract address"
                    >
                      {copiedAddr === coin.contract ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                    <button
                      onClick={() => navigate(`/trade/${coin.symbol}-USDT`)}
                      className="px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/25 transition-colors shrink-0"
                    >
                      Trade
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search: name/symbol + contract address */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Name or symbol…"
                value={coinSearch}
                onChange={e => { setCoinSearch(e.target.value); setCoinPage(0); }}
                className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Contract address 0x…"
                value={contractSearch}
                onChange={e => {
                  setContractSearch(e.target.value);
                  if (e.target.value.length > 5) setShowZora(true);
                }}
                className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {coinsLoading ? "Loading…" : `${filteredCoins.length} coins · tap a row to see all exchanges`}
            </span>
          </div>

          {/* Table */}
          <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="px-3 py-3 font-medium w-10 cursor-pointer hover:text-foreground select-none" onClick={() => toggleCoinSort("rank")}>
                      # {coinSort === "rank" ? (coinSortDir === "asc" ? <ChevronUp className="inline w-3 h-3" /> : <ChevronDown className="inline w-3 h-3" />) : ""}
                    </th>
                    <th className="px-3 py-3 font-medium cursor-pointer hover:text-foreground select-none" onClick={() => toggleCoinSort("base")}>
                      Coin {coinSort === "base" ? (coinSortDir === "asc" ? <ChevronUp className="inline w-3 h-3" /> : <ChevronDown className="inline w-3 h-3" />) : ""}
                    </th>
                    <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleCoinSort("price")}>
                      Price ({quoteCurrency}) {coinSort === "price" ? (coinSortDir === "asc" ? <ChevronUp className="inline w-3 h-3" /> : <ChevronDown className="inline w-3 h-3" />) : ""}
                    </th>
                    <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleCoinSort("chg")}>
                      24h% {coinSort === "chg" ? (coinSortDir === "asc" ? <ChevronUp className="inline w-3 h-3" /> : <ChevronDown className="inline w-3 h-3" />) : ""}
                    </th>
                    <th className="px-3 py-3 font-medium text-right cursor-pointer hover:text-foreground select-none hidden md:table-cell" onClick={() => toggleCoinSort("vol")}>
                      Volume 24h {coinSort === "vol" ? (coinSortDir === "asc" ? <ChevronUp className="inline w-3 h-3" /> : <ChevronDown className="inline w-3 h-3" />) : ""}
                    </th>
                    <th className="px-3 py-3 font-medium text-right hidden lg:table-cell">Mkt Cap</th>
                    <th className="px-3 py-3 font-medium text-center">Trade / View</th>
                  </tr>
                </thead>
                <tbody>
                  {coinsLoading && Array.from({ length: 20 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {[1,2,3,4,5,6,7].map(j => (
                        <td key={j} className="px-3 py-3">
                          <div className="h-4 bg-muted animate-pulse rounded" />
                        </td>
                      ))}
                    </tr>
                  ))}

                  {!coinsLoading && pagedCoins.map((coin, idx) => {
                    const isUp = coin.change24h >= 0;
                    return (
                      <tr
                        key={coin.id}
                        className="border-b border-border/40 hover:bg-primary/5 transition-colors cursor-pointer group"
                        onClick={() => setSelectedCoin(coin)}
                      >
                        <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono">{coin.rank ?? idx + 1}</td>

                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            {coin.image
                              ? <img src={coin.image} alt={coin.symbol} className="w-7 h-7 rounded-full shrink-0 bg-secondary" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              : <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">{coin.symbol[0]}</div>
                            }
                            <div>
                              <p className="text-sm font-bold text-foreground leading-tight">{coin.name}</p>
                              <p className="text-[10px] text-muted-foreground font-semibold">{coin.symbol}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold tabular-nums">
                          {qSym}{fmtPrice(coin.price)}
                        </td>

                        <td className="px-3 py-2.5 text-right">
                          <span className={cn(
                            "inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold min-w-[60px]",
                            isUp ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                          )}>
                            {isUp ? "+" : ""}{coin.change24h.toFixed(2)}%
                          </span>
                        </td>

                        <td className="px-3 py-2.5 text-right text-sm text-muted-foreground tabular-nums font-mono hidden md:table-cell">
                          {qSym}{fmtVol(coin.volume24h)}
                        </td>

                        <td className="px-3 py-2.5 text-right text-sm text-muted-foreground tabular-nums font-mono hidden lg:table-cell">
                          {qSym}{fmtVol(coin.marketCap)}
                        </td>

                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={e => { e.stopPropagation(); setVammCoin(coin); }}
                              title="VAMM Instant Swap — trade instantly via virtual bonding curve"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 transition-colors"
                            >
                              <Zap className="w-3 h-3" /> VAMM
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setSelectedCoin(coin); }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-primary/10 hover:bg-primary/25 text-primary border border-primary/20 transition-colors group-hover:border-primary/40"
                            >
                              View <ArrowUpRight className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!coinsLoading && filteredCoins.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        No coins found for "{coinSearch}"
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer: count + Load More */}
            {!coinsLoading && filteredCoins.length > 0 && (
              <div className="px-4 py-3 border-t border-border bg-secondary/20 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Showing {pagedCoins.length} of {filteredCoins.length} coins</span>
                {pagedCoins.length < filteredCoins.length && (
                  <button
                    onClick={() => setCoinPage(p => p + 1)}
                    className="px-4 py-1.5 rounded-lg bg-card border border-border hover:border-primary/40 text-sm font-semibold text-foreground transition-colors"
                  >
                    Load more ({filteredCoins.length - pagedCoins.length} remaining)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Exchange listings modal ── */}
          {selectedCoin && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                onClick={() => setSelectedCoin(null)}
              />
              {/* Drawer */}
              <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] flex flex-col bg-background rounded-t-2xl border-t border-border shadow-2xl overflow-hidden lg:inset-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:w-[700px] lg:max-h-[80vh] lg:rounded-2xl lg:border">

                {/* Modal header */}
                <div className="flex items-center gap-3 px-4 py-4 border-b border-border shrink-0">
                  {selectedCoin.image && (
                    <img src={selectedCoin.image} alt={selectedCoin.symbol} className="w-9 h-9 rounded-full shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base leading-tight">{selectedCoin.name}
                      <span className="ml-2 text-xs font-semibold text-muted-foreground">{selectedCoin.symbol}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {qSym}{fmtPrice(selectedCoin.price)}
                      <span className={cn("ml-2 text-xs font-semibold", selectedCoin.change24h >= 0 ? "text-green-400" : "text-red-400")}>
                        {selectedCoin.change24h >= 0 ? "+" : ""}{selectedCoin.change24h.toFixed(2)}%
                      </span>
                    </p>
                  </div>
                  <button onClick={() => setSelectedCoin(null)} className="p-2 rounded-lg hover:bg-secondary transition-colors shrink-0">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Contract address row (if known) */}
                {(() => {
                  const ca = zoraContractFor(selectedCoin.symbol);
                  if (!ca) return null;
                  return (
                    <div className="px-4 py-2 border-b border-border/40 shrink-0 flex items-center gap-2 bg-blue-500/5">
                      <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wide shrink-0">Base</span>
                      <p className="text-[11px] text-muted-foreground font-mono truncate flex-1">{ca}</p>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(ca).catch(() => {});
                          setCopiedAddr(ca);
                          setTimeout(() => setCopiedAddr(null), 2000);
                        }}
                        className="shrink-0 flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {copiedAddr === ca ? <Check size={12} /> : <Copy size={12} />}
                        {copiedAddr === ca ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  );
                })()}

                <div className="px-4 py-2 border-b border-border/40 shrink-0">
                  <p className="text-xs text-muted-foreground">
                    {tickersLoading ? "Loading exchanges…" : `${tickersData?.tickers?.length ?? 0} exchanges list ${selectedCoin.symbol} · tap to trade`}
                  </p>
                </div>

                {/* Exchange list */}
                <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-border/40">
                  {tickersLoading && Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-muted animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 bg-muted animate-pulse rounded w-32" />
                        <div className="h-3 bg-muted animate-pulse rounded w-20" />
                      </div>
                      <div className="h-4 bg-muted animate-pulse rounded w-20" />
                    </div>
                  ))}

                  {!tickersLoading && (tickersData?.tickers ?? [])
                    .filter((t: any) => !t.isAnomaly && !t.isStale)
                    .map((t: any, i: number) => {
                      const tsColor = t.trustScore === "green" ? "bg-green-500" : t.trustScore === "yellow" ? "bg-green-500" : "bg-red-400";
                      return (
                        <a
                          key={i}
                          href={t.tradeUrl ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors"
                        >
                          {/* Exchange logo */}
                          {t.exchangeLogo
                            ? <img src={t.exchangeLogo} alt={t.exchangeName} className="w-8 h-8 rounded-full shrink-0 bg-secondary" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            : <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">{t.exchangeName?.[0] ?? "?"}</div>
                          }

                          {/* Exchange name + pair */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-foreground truncate">{t.exchangeName}</p>
                              {t.trustScore && (
                                <span className={cn("w-2 h-2 rounded-full shrink-0", tsColor)} title={`Trust: ${t.trustScore}`} />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{t.base}/{t.target}</p>
                          </div>

                          {/* Price + volume */}
                          <div className="text-right shrink-0">
                            <p className="text-sm font-mono font-semibold tabular-nums">{qSym}{fmtPrice(t.convertedLast || t.price)}</p>
                            <p className="text-[10px] text-muted-foreground tabular-nums">{qSym}{fmtVol(t.convertedVol)} vol</p>
                          </div>

                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 ml-1" />
                        </a>
                      );
                    })
                  }

                  {!tickersLoading && tickersData?.tickers?.length === 0 && (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                      No exchange listings found
                    </div>
                  )}
                </div>

                {/* VAMM Quick Swap inside modal */}
                <div className="shrink-0 border-t border-border px-4 pt-4 pb-2">
                  <VammSwapPanel symbol={selectedCoin.symbol} />
                </div>

                {/* Footer CTA */}
                <div className="shrink-0 border-t border-border px-4 py-3">
                  <button
                    onClick={() => { navigate(`/trade/${selectedCoin.symbol}-USDT`); setSelectedCoin(null); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors"
                  >
                    <Zap className="w-4 h-4" /> Trade {selectedCoin.symbol}/USDT on <OrahInline className="text-sm" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════ EXCHANGES VIEW ══════════════ */}
      {view === "exchanges" && <>

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Type tabs */}
        <div className="flex items-center gap-2">
          {(["all", "cex", "dex"] as ExType[]).map(t => (
            <button key={t} onClick={() => setExType(t)} className={TAB_STYLE(exType === t, t)}>
              {t === "all" ? "All" : t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search exchange, chain, country..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>

        {/* Refresh */}
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </button>

        <span className="text-xs text-muted-foreground hidden xl:block ml-auto">
          Sovereign price engine · refreshes every 5 min
        </span>
      </div>

      {/* ── Table ── */}
      <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-muted-foreground text-xs uppercase tracking-wider select-none">
                {/* # Rank column */}
                <th
                  className="px-4 py-3 font-medium w-12 cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => toggleExSort("rank")}
                >
                  <span className="flex items-center gap-1">
                    #
                    {sortBy === "rank"
                      ? exSortDir === "asc" ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />
                      : <ArrowUpDown className="w-3 h-3 shrink-0 opacity-40" />}
                  </span>
                </th>
                {/* Exchange — sortable by name */}
                <th
                  className="px-4 py-3 font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => toggleExSort("name")}
                >
                  <span className="flex items-center gap-1">
                    Exchange
                    {sortBy === "name"
                      ? exSortDir === "desc" ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronUp className="w-3 h-3 shrink-0" />
                      : <ArrowUpDown className="w-3 h-3 shrink-0 opacity-40" />}
                  </span>
                </th>
                {/* Type / Chain — not sortable */}
                <th className="px-4 py-3 font-medium">Type / Chain</th>
                {/* 24h Volume */}
                <th
                  className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => toggleExSort("volume")}
                >
                  <span className="flex items-center justify-end gap-1">
                    {sortBy === "volume"
                      ? exSortDir === "desc" ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronUp className="w-3 h-3 shrink-0" />
                      : <ArrowUpDown className="w-3 h-3 shrink-0 opacity-40" />}
                    24h Volume
                  </span>
                </th>
                {/* Market Cap */}
                <th
                  className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => toggleExSort("marketcap")}
                >
                  <span className="flex items-center justify-end gap-1">
                    {sortBy === "marketcap"
                      ? exSortDir === "desc" ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronUp className="w-3 h-3 shrink-0" />
                      : <ArrowUpDown className="w-3 h-3 shrink-0 opacity-40" />}
                    Market Cap
                  </span>
                </th>
                {/* Trust Score */}
                <th
                  className="px-4 py-3 font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => toggleExSort("trust")}
                >
                  <span className="flex items-center gap-1">
                    Trust Score
                    {sortBy === "trust"
                      ? exSortDir === "desc" ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronUp className="w-3 h-3 shrink-0" />
                      : <ArrowUpDown className="w-3 h-3 shrink-0 opacity-40" />}
                  </span>
                </th>
                <th className="px-4 py-3 font-medium text-right">Trade</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 14 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-muted animate-pulse rounded w-full" />
                    </td>
                  ))}
                </tr>
              ))}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No exchanges found matching your filters.
                  </td>
                </tr>
              )}

              {!isLoading && filtered.map((ex, idx) => {
                return (
                <Fragment key={ex.id}>
                <tr
                  className={cn(
                    "border-b border-border/50 transition-colors group",
                    ex.type === "dex"
                      ? "hover:bg-violet-500/5"
                      : "hover:bg-blue-500/5"
                  )}
                >
                  <td className="px-4 py-3 text-muted-foreground text-sm font-mono">{ex.rank ?? idx + 1}</td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {ex.id === "orahdex" ? (
                        /* OrahDEX brand O logo */
                        <span className="inline-flex items-center justify-center shrink-0" style={{ width: 28, height: 28, fontSize: 28 }}>
                          <OrahO online={online} />
                        </span>
                      ) : ex.image ? (
                        <ExLogo src={ex.image} name={ex.name} type={ex.type} />
                      ) : (
                        <div className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                          ex.type === "dex" ? "bg-violet-500/20 text-violet-300" : "bg-blue-500/20 text-blue-300"
                        )}>
                          {ex.name?.[0] ?? "?"}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-foreground leading-tight">{ex.name}</p>
                        {ex.yearEstablished && (
                          <p className="text-[10px] text-muted-foreground">Est. {ex.yearEstablished}</p>
                        )}
                      </div>
                      {ex.url && (
                        <a href={ex.url} target="_blank" rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                        </a>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {ex.type === "dex" && ex.chain
                      ? <ChainBadge chain={ex.chain} />
                      : <CexBadge />
                    }
                  </td>

                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                    {ex.tradeVolume24hUsd >= 1000 ? fmtUsd(ex.tradeVolume24hUsd) : ex.tradeVolume24hUsd > 0 ? "$" + ex.tradeVolume24hUsd.toFixed(0) : "—"}
                  </td>

                  <td className="px-4 py-3 text-right font-mono text-sm">
                    {ex.marketCap > 0
                      ? <span className={ex.type === "dex" ? "text-violet-400 font-semibold" : "text-blue-400 font-semibold"}>{fmtUsd(ex.marketCap)}</span>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <TrustDots score={ex.trustScore} />
                      <span className={cn("text-xs font-bold", trustColor(ex.trustScore))}>
                        {ex.trustScore || "—"}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <a
                      href={ex.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all",
                        ex.type === "dex"
                          ? "bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border-violet-500/20"
                          : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/20"
                      )}
                    >
                      Visit <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-secondary/20 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
            <span>
              Showing {filtered.length} of {statCount} exchanges
              {exType !== "all" && ` · ${exType.toUpperCase()} only`}
              {` · sorted by ${SORT_LABELS[sortBy]} (${exSortDir === "desc" ? "high → low" : "low → high"})`}
            </span>
          </div>
        )}
      </div>

      {/* close exchanges fragment */}
      </>}

      {/* VAMM Overlay Modal — triggered by ⚡ VAMM button on coin rows */}
      {vammCoin && (
        <VammSwapModal symbol={vammCoin.symbol} onClose={() => setVammCoin(null)} />
      )}

    </div>
  );
}
