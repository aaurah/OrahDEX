import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, TrendingUp, TrendingDown, ChevronDown, ArrowUpDown,
  RefreshCw, AlertTriangle, CheckCircle2, Info, Search,
  BarChart3, Activity, DollarSign, Layers,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types ─────────────────────────────────────────────────────────────── */
interface GenesisMarket {
  symbol: string;
  quoteSymbol: string;
  price: number;
  supply: number;
  marketCap: number;
  treasury: number;
  volume24h: number;
  change24h: number;
  tradeCount: number;
  seedPrice: number;
}

interface GenesisQuote {
  symbol: string;
  side: "buy" | "sell";
  usdtIn?: number;
  tokensOut?: number;
  tokensIn?: number;
  usdtOut?: number;
  price: number;
  priceAfter: number;
  priceImpactPct: number;
  fee: number;
  feeLp: number;
  feeProtocol: number;
  marketPrice: number;
}

interface MarketDetail {
  symbol: string;
  quoteSymbol: string;
  price: number;
  supply: number;
  marketCap: number;
  treasury: number;
  volume24h: number;
  change24h: number;
  virtualDepthUsd: number;
  trades: Array<{ id: string; time: number; side: "buy" | "sell"; amount: number; price: number; total: number }>;
  priceHistory: Array<{ time: number; price: number }>;
  curve: { basePrice: number; slope: number };
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmt(n: number, decimals = 6): string {
  if (!isFinite(n) || isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(Math.min(decimals, 4));
  if (n >= 0.01) return n.toFixed(6);
  return n.toPrecision(4);
}

function fmtUsd(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "$—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

const COIN_COLORS: Record<string, string> = {
  BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF", BSV: "#EAB308",
  BNB: "#F3BA2F", XRP: "#00AAE4", ADA: "#0033AD", DOGE: "#C2A633",
  DOT: "#E6007A", LINK: "#2A5ADA", AVAX: "#E84142", MATIC: "#8247E5",
  LTC: "#A6A9AA", BCH: "#8DC351", UNI: "#FF007A", AAVE: "#B6509E",
  MKR: "#1AAB9B", TRX: "#EF4444", BTT: "#9333EA", WIN: "#F59E0B",
  JST: "#06B6D4", NEAR: "#00C08B", ATOM: "#2E3148", FTM: "#1969FF",
  ALGO: "#000000", ARB: "#2D374B", OP: "#FF0420", SUI: "#4DA2FF",
  SEI: "#8E2EE6", INJ: "#00A3FF", IMX: "#17B2E5", APT: "#2ECA7F",
  PEPE: "#37A900", SHIB: "#FFA409", FLOKI: "#F5A623", WIF: "#9B59B6",
  BONK: "#F7500F", ONE: "#00AEE9", ROSE: "#E75CA4", BAND: "#516AFF",
  SAND: "#04ADEF", MANA: "#FF2D55", AXS: "#0055D5", GALA: "#0B0B0B",
  CHZ: "#CD0124", FLOW: "#00EF8B",
};

function CoinIcon({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const color = COIN_COLORS[symbol] ?? "#6B7280";
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, background: color, fontSize: Math.max(8, size * 0.35) }}
    >
      {symbol.slice(0, 2)}
    </div>
  );
}

/* ── Tiny sparkline using SVG ───────────────────────────────────────────── */
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 80, H = 30;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(" ");
  const color = positive ? "#22c55e" : "#ef4444";
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── Market card ────────────────────────────────────────────────────────── */
function MarketCard({ m, selected, onClick }: { m: GenesisMarket; selected: boolean; onClick: () => void }) {
  const pos = m.change24h >= 0;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
        selected
          ? "border-yellow-500/60 bg-yellow-500/10"
          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10"
      }`}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <CoinIcon symbol={m.symbol} size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{m.symbol}</div>
          <div className="text-[10px] text-gray-500 uppercase">{m.quoteSymbol}</div>
        </div>
        <div className={`text-xs font-medium px-1.5 py-0.5 rounded ${pos ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
          {pos ? "+" : ""}{m.change24h.toFixed(2)}%
        </div>
      </div>
      <div className="text-sm font-bold text-white">{fmtUsd(m.price)}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">Vol: {fmtUsd(m.volume24h)}</div>
    </button>
  );
}

/* ── Depth bar ──────────────────────────────────────────────────────────── */
function DepthBar({ impact }: { impact: number }) {
  const pct = Math.min(impact, 5);
  const color = pct < 0.5 ? "bg-green-500" : pct < 1.5 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${(pct / 5) * 100}%` }} />
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function GenesisLiquidity() {
  const qc = useQueryClient();
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState("");
  const [txStatus, setTxStatus] = useState<{ ok?: boolean; message?: string; tradeId?: string } | null>(null);
  const amountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedAmount, setDebouncedAmount] = useState("");

  /* Debounce amount input */
  useEffect(() => {
    if (amountTimer.current) clearTimeout(amountTimer.current);
    amountTimer.current = setTimeout(() => setDebouncedAmount(amount), 400);
    return () => { if (amountTimer.current) clearTimeout(amountTimer.current); };
  }, [amount]);

  /* All markets */
  const { data: markets = [], isLoading: marketsLoading } = useQuery<GenesisMarket[]>({
    queryKey: ["genesis-markets"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/genesis/markets`);
      if (!r.ok) throw new Error("Failed to load markets");
      return r.json();
    },
    refetchInterval: 15_000,
  });

  /* Selected market detail */
  const { data: marketDetail, isLoading: detailLoading } = useQuery<MarketDetail>({
    queryKey: ["genesis-market", selectedSymbol],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/genesis/market/${selectedSymbol}`);
      if (!r.ok) throw new Error("Failed to load market");
      return r.json();
    },
    refetchInterval: 8_000,
    enabled: !!selectedSymbol,
  });

  /* Quote */
  const { data: quote, isLoading: quoteLoading } = useQuery<GenesisQuote>({
    queryKey: ["genesis-quote", selectedSymbol, side, debouncedAmount],
    queryFn: async () => {
      if (!debouncedAmount || parseFloat(debouncedAmount) <= 0) throw new Error("no amount");
      const params = new URLSearchParams({ symbol: selectedSymbol, side });
      if (side === "buy") params.set("usdtAmount", debouncedAmount);
      else params.set("tokenAmount", debouncedAmount);
      const r = await fetch(`${BASE}/api/genesis/quote?${params}`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Quote failed"); }
      return r.json();
    },
    enabled: !!debouncedAmount && parseFloat(debouncedAmount) > 0,
    retry: false,
  });

  /* Swap mutation */
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
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Swap failed"); }
      return r.json();
    },
    onSuccess: (data) => {
      setTxStatus({ ok: true, message: data.side === "buy"
        ? `Bought ${fmt(data.tokensReceived)} ${selectedSymbol} for ${fmtUsd(data.usdtSpent)}`
        : `Sold ${fmt(data.tokensSold)} ${selectedSymbol} → ${fmtUsd(data.usdtReceived)}`,
        tradeId: data.tradeId });
      setAmount("");
      setDebouncedAmount("");
      qc.invalidateQueries({ queryKey: ["genesis-markets"] });
      qc.invalidateQueries({ queryKey: ["genesis-market", selectedSymbol] });
    },
    onError: (e: Error) => setTxStatus({ ok: false, message: e.message }),
  });

  const filteredMarkets = markets.filter(m =>
    m.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const selectedMarket = markets.find(m => m.symbol === selectedSymbol);

  const canSwap = !!amount && parseFloat(amount) > 0 && !swap.isPending;
  const impactPct = quote?.priceImpactPct ?? 0;
  const highImpact = impactPct > 2;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* ── Header ── */}
      <div className="border-b border-white/5 bg-gradient-to-r from-yellow-500/5 via-transparent to-purple-500/5">
        <div className="max-w-[1400px] mx-auto px-6 py-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Genesis Liquidity Engine</h1>
            <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full font-semibold">VIRTUAL AMM</span>
          </div>
          <p className="text-sm text-gray-400 ml-11">
            Trade any asset instantly — {fmtUsd(8_500)} virtual depth per market, zero liquidity required.
          </p>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Markets Available", value: markets.length > 0 ? markets.length.toString() : "—", icon: Layers, color: "text-yellow-400" },
            { label: "Total Volume 24h", value: fmtUsd(markets.reduce((s, m) => s + m.volume24h, 0)), icon: BarChart3, color: "text-blue-400" },
            { label: "Virtual Depth / Market", value: "$8,500", icon: DollarSign, color: "text-green-400" },
            { label: "Total Trades", value: markets.reduce((s, m) => s + m.tradeCount, 0).toString(), icon: Activity, color: "text-purple-400" },
          ].map(stat => (
            <div key={stat.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                <span className="text-[11px] text-gray-500">{stat.label}</span>
              </div>
              <div className="text-lg font-bold text-white">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* ── Left: market selector ── */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search asset…"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white/[0.03] border border-white/8 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 overflow-y-auto max-h-[640px] pr-0.5">
              {marketsLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse" />
                  ))
                : filteredMarkets.map(m => (
                    <MarketCard key={m.symbol} m={m} selected={m.symbol === selectedSymbol} onClick={() => { setSelectedSymbol(m.symbol); setTxStatus(null); setAmount(""); }} />
                  ))
              }
            </div>
          </div>

          {/* ── Right: swap panel + detail ── */}
          <div className="flex flex-col gap-5">
            {/* Swap card */}
            <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
              {/* Token header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <CoinIcon symbol={selectedSymbol} size={40} />
                  <div>
                    <div className="text-lg font-bold text-white">{selectedSymbol} / USDT</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">{fmtUsd(selectedMarket?.price ?? 0)}</span>
                      {selectedMarket && (
                        <span className={`text-xs font-medium ${selectedMarket.change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {selectedMarket.change24h >= 0 ? "+" : ""}{selectedMarket.change24h.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => qc.invalidateQueries({ queryKey: ["genesis-market", selectedSymbol] })}
                  className="p-2 rounded-lg bg-white/[0.03] border border-white/8 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Buy / Sell toggle */}
              <div className="flex rounded-xl bg-white/[0.03] border border-white/8 p-1 mb-4">
                {(["buy", "sell"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => { setSide(s); setAmount(""); setTxStatus(null); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                      side === s
                        ? s === "buy"
                          ? "bg-green-500 text-white"
                          : "bg-red-500 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {s === "buy" ? "Buy" : "Sell"}
                  </button>
                ))}
              </div>

              {/* Amount input */}
              <div className="mb-3">
                <label className="text-xs text-gray-500 mb-1.5 block">
                  {side === "buy" ? "Amount (USDT)" : `Amount (${selectedSymbol})`}
                </label>
                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 focus-within:border-yellow-500/40">
                  <input
                    value={amount}
                    onChange={e => { setAmount(e.target.value); setTxStatus(null); }}
                    placeholder="0.00"
                    type="number"
                    min="0"
                    className="flex-1 bg-transparent text-xl font-bold text-white outline-none placeholder-gray-700"
                  />
                  <span className="text-sm text-gray-500 font-medium">{side === "buy" ? "USDT" : selectedSymbol}</span>
                </div>
                {/* Quick amounts */}
                {side === "buy" && (
                  <div className="flex gap-2 mt-2">
                    {[100, 500, 1000, 5000].map(v => (
                      <button key={v} onClick={() => setAmount(String(v))}
                        className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.04] text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 border border-white/5 transition-colors">
                        ${v}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quote display */}
              {quoteLoading && debouncedAmount && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-3 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Getting best price…
                </div>
              )}

              {quote && !quoteLoading && (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-4 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">You receive</span>
                    <span className="font-bold text-white">
                      {side === "buy"
                        ? `${fmt(quote.tokensOut ?? 0)} ${selectedSymbol}`
                        : `${fmtUsd(quote.usdtOut ?? 0)}`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Avg price</span>
                    <span className="text-white">{fmtUsd(quote.price)} / {selectedSymbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Price after</span>
                    <span className="text-white">{fmtUsd(quote.priceAfter)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Price impact</span>
                    <span className={`font-medium ${impactPct < 1 ? "text-green-400" : impactPct < 2 ? "text-yellow-400" : "text-red-400"}`}>
                      {impactPct.toFixed(3)}%
                    </span>
                  </div>
                  <div>
                    <DepthBar impact={impactPct} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Fee (0.30%)</span>
                    <span>{fmtUsd(quote.fee)}</span>
                  </div>
                  {highImpact && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      High price impact — consider a smaller amount
                    </div>
                  )}
                </div>
              )}

              {/* TX status */}
              {txStatus && (
                <div className={`flex items-start gap-2 text-sm rounded-xl px-4 py-3 mb-4 ${
                  txStatus.ok ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {txStatus.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  <div>
                    <div>{txStatus.message}</div>
                    {txStatus.tradeId && <div className="text-[10px] opacity-60 mt-0.5">Trade #{txStatus.tradeId}</div>}
                  </div>
                </div>
              )}

              {/* Swap button */}
              <button
                onClick={() => swap.mutate()}
                disabled={!canSwap || highImpact && !window.confirm("Price impact is high. Continue?")}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${
                  !canSwap
                    ? "bg-white/5 text-gray-600 cursor-not-allowed"
                    : side === "buy"
                    ? "bg-green-500 hover:bg-green-400 text-white"
                    : "bg-red-500 hover:bg-red-400 text-white"
                }`}
              >
                {swap.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Executing…
                  </span>
                ) : (
                  `${side === "buy" ? "Buy" : "Sell"} ${selectedSymbol}`
                )}
              </button>

              {/* Info footer */}
              <div className="flex items-center gap-1.5 mt-3 text-[11px] text-gray-600">
                <Info className="w-3 h-3" />
                Powered by the Genesis Liquidity Engine — no LP required
              </div>
            </div>

            {/* Market stats + chart area + trades */}
            {marketDetail && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Stats */}
                <div className="bg-white/[0.02] border border-white/8 rounded-xl p-4">
                  <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-yellow-400" />
                    Market Stats
                  </div>
                  <div className="space-y-2.5 text-sm">
                    {[
                      { label: "Market Price", value: fmtUsd(marketDetail.price) },
                      { label: "Virtual Supply", value: fmt(marketDetail.supply) + " " + selectedSymbol },
                      { label: "Market Cap", value: fmtUsd(marketDetail.marketCap) },
                      { label: "Volume 24h", value: fmtUsd(marketDetail.volume24h) },
                      { label: "Virtual Depth", value: fmtUsd(marketDetail.virtualDepthUsd) },
                      { label: "Treasury", value: fmtUsd(marketDetail.treasury) },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between">
                        <span className="text-gray-500">{row.label}</span>
                        <span className="text-white font-medium">{row.value}</span>
                      </div>
                    ))}
                  </div>
                  {/* Curve parameters */}
                  <div className="mt-3 pt-3 border-t border-white/5 text-[10px] text-gray-600">
                    <div>Base: {fmtUsd(marketDetail.curve.basePrice)} · Slope: {marketDetail.curve.slope.toExponential(3)}</div>
                  </div>
                </div>

                {/* Recent trades */}
                <div className="bg-white/[0.02] border border-white/8 rounded-xl p-4">
                  <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    Recent Trades
                  </div>
                  {marketDetail.trades.length === 0 ? (
                    <div className="text-center py-6 text-gray-600 text-sm">No trades yet — be the first!</div>
                  ) : (
                    <div className="space-y-1.5 overflow-y-auto max-h-[220px]">
                      {marketDetail.trades.slice(0, 15).map(t => (
                        <div key={t.id} className="flex items-center justify-between text-xs">
                          <span className={`font-medium w-8 ${t.side === "buy" ? "text-green-400" : "text-red-400"}`}>
                            {t.side === "buy" ? "BUY" : "SELL"}
                          </span>
                          <span className="text-gray-400 flex-1 px-2">{fmt(t.amount)} {selectedSymbol}</span>
                          <span className="text-white">{fmtUsd(t.total)}</span>
                          <span className="text-gray-600 w-16 text-right">
                            {new Date(t.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="bg-gradient-to-r from-yellow-500/5 to-purple-500/5 border border-yellow-500/10 rounded-xl p-5">
              <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                How the Genesis Liquidity Engine Works
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-400">
                <div>
                  <div className="text-yellow-400 font-semibold mb-1">Virtual AMM</div>
                  <div>Every asset is backed by a linear bonding curve — no liquidity providers needed. The curve guarantees a price for any trade size.</div>
                </div>
                <div>
                  <div className="text-blue-400 font-semibold mb-1">$8,500 Depth</div>
                  <div>Buying $8,500 USDT moves the price by only ~1%. This simulates deep liquidity for all assets simultaneously, from day one.</div>
                </div>
                <div>
                  <div className="text-green-400 font-semibold mb-1">Treasury Settlement</div>
                  <div>Buys fund the treasury. Sells are paid out from it. The curve ensures buys always exceed sells at any given price level.</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/5 text-[10px] text-gray-600 font-mono">
                price(s) = basePrice + slope × s &nbsp;|&nbsp; cost(n) = (p₀ + p₁) × n / 2
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
