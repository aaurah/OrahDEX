import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, RefreshCw, AlertTriangle, CheckCircle2, Search,
  TrendingUp, TrendingDown, ChevronDown, Info,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface GenesisMarket {
  symbol: string; quoteSymbol: string; price: number; supply: number;
  marketCap: number; treasury: number; volume24h: number; change24h: number; tradeCount: number;
}

interface GenesisQuote {
  symbol: string; side: "buy" | "sell"; price: number; priceAfter: number;
  priceImpactPct: number; fee: number; marketPrice: number;
  tokensOut?: number; usdtOut?: number;
}

const COIN_COLORS: Record<string, string> = {
  BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF", BSV: "#EAB308",
  BNB: "#F3BA2F", XRP: "#00AAE4", ADA: "#0033AD", DOGE: "#C2A633",
  DOT: "#E6007A", LINK: "#2A5ADA", AVAX: "#E84142", MATIC: "#8247E5",
  LTC: "#A6A9AA", BCH: "#8DC351", UNI: "#FF007A", AAVE: "#B6509E",
  TRX: "#EF4444", BTT: "#9333EA", WIN: "#F59E0B", JST: "#06B6D4",
  NEAR: "#00C08B", ATOM: "#2E3148", ARB: "#2D374B", OP: "#FF0420",
  SEI: "#8E2EE6", INJ: "#00A3FF", PEPE: "#37A900", SHIB: "#FFA409",
};

function fmt(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(6);
  return n.toPrecision(4);
}

function fmtUsd(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "$—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function CoinIcon({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const color = COIN_COLORS[symbol] ?? "#6B7280";
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.35 }}>
      {symbol.slice(0, 2)}
    </div>
  );
}

export default function MobileGenesis() {
  const qc = useQueryClient();
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [txStatus, setTxStatus] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedAmount(amount), 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [amount]);

  const { data: markets = [], isLoading } = useQuery<GenesisMarket[]>({
    queryKey: ["genesis-markets"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/genesis/markets`);
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    refetchInterval: 20_000,
  });

  const { data: quote, isLoading: quoteLoading } = useQuery<GenesisQuote>({
    queryKey: ["genesis-quote", selectedSymbol, side, debouncedAmount],
    queryFn: async () => {
      if (!debouncedAmount || parseFloat(debouncedAmount) <= 0) throw new Error("no amount");
      const params = new URLSearchParams({ symbol: selectedSymbol, side });
      if (side === "buy") params.set("usdtAmount", debouncedAmount);
      else params.set("tokenAmount", debouncedAmount);
      const r = await fetch(`${BASE}/api/genesis/quote?${params}`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      return r.json();
    },
    enabled: !!debouncedAmount && parseFloat(debouncedAmount) > 0,
    retry: false,
  });

  const swap = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { symbol: selectedSymbol, side };
      if (side === "buy") body.usdtAmount = parseFloat(amount);
      else body.tokenAmount = parseFloat(amount);
      const r = await fetch(`${BASE}/api/genesis/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      return r.json();
    },
    onSuccess: (data) => {
      setTxStatus({ ok: true, message: data.side === "buy"
        ? `Bought ${fmt(data.tokensReceived)} ${selectedSymbol}`
        : `Sold for ${fmtUsd(data.usdtReceived)}` });
      setAmount(""); setDebouncedAmount("");
      qc.invalidateQueries({ queryKey: ["genesis-markets"] });
    },
    onError: (e: Error) => setTxStatus({ ok: false, message: e.message }),
  });

  const selected = markets.find(m => m.symbol === selectedSymbol);
  const filtered = markets.filter(m => m.symbol.toLowerCase().includes(search.toLowerCase()));
  const impactPct = quote?.priceImpactPct ?? 0;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5 bg-gradient-to-r from-yellow-500/5 via-transparent to-transparent">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="p-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <Zap className="w-4 h-4 text-yellow-400" />
          </div>
          <h1 className="text-base font-bold">Genesis DEX</h1>
          <span className="text-[9px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full font-semibold ml-auto">VIRTUAL AMM</span>
        </div>
        <p className="text-[11px] text-gray-500">Trade any asset · $8,500 virtual depth · No liquidity needed</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Token picker button */}
        <button
          onClick={() => setShowPicker(true)}
          className="w-full flex items-center gap-3 bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3"
        >
          {selected ? (
            <>
              <CoinIcon symbol={selected.symbol} size={32} />
              <div className="flex-1 text-left">
                <div className="font-bold text-white">{selected.symbol} / USDT</div>
                <div className="text-xs text-gray-500">{fmtUsd(selected.price)}</div>
              </div>
              <div className={`text-xs font-medium ${selected.change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                {selected.change24h >= 0 ? "+" : ""}{selected.change24h.toFixed(2)}%
              </div>
            </>
          ) : (
            <span className="text-gray-500 flex-1 text-sm">Select an asset…</span>
          )}
          <ChevronDown className="w-4 h-4 text-gray-500" />
        </button>

        {/* Buy / Sell toggle */}
        <div className="flex rounded-xl bg-white/[0.03] border border-white/8 p-1">
          {(["buy", "sell"] as const).map(s => (
            <button key={s} onClick={() => { setSide(s); setAmount(""); setTxStatus(null); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                side === s
                  ? s === "buy" ? "bg-green-500 text-white" : "bg-red-500 text-white"
                  : "text-gray-400"
              }`}>
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>

        {/* Amount input */}
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">
            {side === "buy" ? "USDT to spend" : `${selectedSymbol} to sell`}
          </label>
          <div className="flex items-center bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3.5 focus-within:border-yellow-500/40">
            <input
              value={amount}
              onChange={e => { setAmount(e.target.value); setTxStatus(null); }}
              placeholder="0.00"
              type="number"
              min="0"
              inputMode="decimal"
              className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder-gray-700"
            />
            <span className="text-sm text-gray-500">{side === "buy" ? "USDT" : selectedSymbol}</span>
          </div>
          {side === "buy" && (
            <div className="flex gap-2 mt-2">
              {[50, 200, 500, 1000].map(v => (
                <button key={v} onClick={() => setAmount(String(v))}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-white/[0.04] text-gray-400 hover:text-yellow-400 border border-white/5 transition-colors">
                  ${v}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quote */}
        {quoteLoading && debouncedAmount && (
          <div className="flex items-center gap-2 text-sm text-gray-500 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Getting quote…
          </div>
        )}
        {quote && !quoteLoading && (
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">You receive</span>
              <span className="font-bold text-white">
                {side === "buy" ? `${fmt(quote.tokensOut ?? 0)} ${selectedSymbol}` : fmtUsd(quote.usdtOut ?? 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Avg price</span>
              <span className="text-white">{fmtUsd(quote.price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Impact</span>
              <span className={`font-medium ${impactPct < 1 ? "text-green-400" : impactPct < 2 ? "text-yellow-400" : "text-red-400"}`}>
                {impactPct.toFixed(3)}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>Fee (0.30%)</span>
              <span>{fmtUsd(quote.fee)}</span>
            </div>
          </div>
        )}

        {/* TX status */}
        {txStatus && (
          <div className={`flex items-start gap-2 text-sm rounded-xl px-4 py-3 ${
            txStatus.ok ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}>
            {txStatus.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            {txStatus.message}
          </div>
        )}

        {/* Swap button */}
        <button
          onClick={() => swap.mutate()}
          disabled={!amount || parseFloat(amount) <= 0 || swap.isPending}
          className={`w-full py-4 rounded-xl font-bold text-base transition-all ${
            !amount || parseFloat(amount) <= 0
              ? "bg-white/5 text-gray-600 cursor-not-allowed"
              : side === "buy" ? "bg-green-500 hover:bg-green-400 text-white" : "bg-red-500 hover:bg-red-400 text-white"
          }`}
        >
          {swap.isPending
            ? <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Executing…</span>
            : `${side === "buy" ? "Buy" : "Sell"} ${selectedSymbol}`
          }
        </button>

        {/* Info */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <Info className="w-3 h-3" />
          Virtual AMM · No liquidity providers · Genesis Engine
        </div>

        {/* All markets mini list */}
        {!isLoading && markets.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-2 font-medium">All Markets</div>
            <div className="space-y-1">
              {markets.slice(0, 10).map(m => (
                <button key={m.symbol} onClick={() => setSelectedSymbol(m.symbol)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                    m.symbol === selectedSymbol ? "border-yellow-500/40 bg-yellow-500/5" : "border-white/5 bg-white/[0.02]"
                  }`}>
                  <CoinIcon symbol={m.symbol} size={22} />
                  <span className="text-sm font-medium text-white flex-1 text-left">{m.symbol}</span>
                  <span className="text-sm text-white">{fmtUsd(m.price)}</span>
                  <span className={`text-xs w-14 text-right ${m.change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {m.change24h >= 0 ? "+" : ""}{m.change24h.toFixed(2)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Token Picker Sheet */}
      {showPicker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end" onClick={() => setShowPicker(false)}>
          <div className="bg-[#131318] border-t border-white/10 rounded-t-2xl p-4 max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <div className="text-sm font-semibold text-white mb-3">Select Asset</div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white/[0.04] border border-white/8 rounded-xl text-white placeholder-gray-600 outline-none"
              />
            </div>
            <div className="overflow-y-auto flex-1 space-y-1 pb-2">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />
                ))
              ) : filtered.map(m => (
                <button key={m.symbol} onClick={() => { setSelectedSymbol(m.symbol); setShowPicker(false); setSearch(""); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                    m.symbol === selectedSymbol ? "border-yellow-500/40 bg-yellow-500/5" : "border-transparent hover:bg-white/[0.03]"
                  }`}>
                  <CoinIcon symbol={m.symbol} size={28} />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-white">{m.symbol}</div>
                    <div className="text-[10px] text-gray-500">Vol: {fmtUsd(m.volume24h)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-white">{fmtUsd(m.price)}</div>
                    <div className={`text-[10px] ${m.change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {m.change24h >= 0 ? "+" : ""}{m.change24h.toFixed(2)}%
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
