import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, RefreshCw, AlertTriangle, CheckCircle2, Info, Search,
  BarChart3, Activity, DollarSign, Layers, X, Copy, Clock,
  FlaskConical, Receipt, History,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types ─────────────────────────────────────────────────────────────── */
interface GenesisMarket {
  symbol: string; quoteSymbol: string; price: number; supply: number;
  marketCap: number; treasury: number; volume24h: number; change24h: number;
  tradeCount: number; seedPrice: number;
}
interface GenesisQuote {
  symbol: string; side: "buy" | "sell"; price: number; priceAfter: number;
  priceImpactPct: number; fee: number; marketPrice: number;
  usdtIn?: number; tokensOut?: number; tokensIn?: number; usdtOut?: number;
}
interface SwapResult {
  success: boolean; tradeId: string; side: "buy" | "sell";
  tokensReceived?: number; usdtSpent?: number;
  usdtReceived?: number; tokensSold?: number;
  fee: number; avgPrice: number; newPrice: number;
  trade: { id: string; time: number; side: string; amount: number; price: number; total: number };
}
interface MarketDetail {
  symbol: string; price: number; supply: number; marketCap: number;
  treasury: number; volume24h: number; virtualDepthUsd: number;
  trades: Array<{ id: string; time: number; side: "buy"|"sell"; amount: number; price: number; total: number }>;
  curve: { basePrice: number; slope: number };
}

/* ── Helpers ─────────────────────────────────────────────────────────────*/
function fmt(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.001) return n.toFixed(6);
  return n.toPrecision(4);
}
function fmtUsd(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "$—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function copyText(s: string) { navigator.clipboard?.writeText(s).catch(() => {}); }
function tsToTime(ts: number) {
  return new Date(ts).toLocaleString([], { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" });
}

const COIN_COLORS: Record<string, string> = {
  BTC:"#F7931A",ETH:"#627EEA",SOL:"#9945FF",BSV:"#EAB308",BNB:"#F3BA2F",
  XRP:"#00AAE4",ADA:"#0033AD",DOGE:"#C2A633",DOT:"#E6007A",LINK:"#2A5ADA",
  AVAX:"#E84142",MATIC:"#8247E5",LTC:"#A6A9AA",BCH:"#8DC351",UNI:"#FF007A",
  AAVE:"#B6509E",MKR:"#1AAB9B",TRX:"#EF4444",BTT:"#9333EA",WIN:"#F59E0B",
  JST:"#06B6D4",NEAR:"#00C08B",ATOM:"#2E3148",FTM:"#1969FF",ARB:"#2D374B",
  OP:"#FF0420",SUI:"#4DA2FF",SEI:"#8E2EE6",INJ:"#00A3FF",PEPE:"#37A900",
  SHIB:"#FFA409",FLOKI:"#F5A623",WIF:"#9B59B6",BONK:"#F7500F",
};
function CoinIcon({ symbol, size=32 }: { symbol:string; size?:number }) {
  const c = COIN_COLORS[symbol] ?? "#6B7280";
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ width:size, height:size, background:c, fontSize:Math.max(8,size*0.35) }}>
      {symbol.slice(0,2)}
    </div>
  );
}
function DepthBar({ impact }: { impact:number }) {
  const pct = Math.min(impact, 5);
  const color = pct < 0.5 ? "bg-green-500" : pct < 1.5 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width:`${(pct/5)*100}%` }}/>
    </div>
  );
}

/* ── Trade Receipt Modal ─────────────────────────────────────────────────*/
function TradeReceiptModal({ result, symbol, onClose }: {
  result: SwapResult; symbol: string; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isBuy = result.side === "buy";

  function handleCopy() {
    copyText(result.tradeId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#131318] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-yellow-400"/>
            <span className="font-bold text-white text-sm">Trade Receipt</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* Virtual badge */}
        <div className="mx-5 mt-4 flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
          <FlaskConical className="w-4 h-4 text-orange-400 flex-shrink-0"/>
          <div>
            <div className="text-xs font-bold text-orange-300">SIMULATED TRADE — No real tokens transferred</div>
            <div className="text-[10px] text-orange-400/70 mt-0.5">
              This is a virtual AMM. No wallet, no blockchain, no gas. Your simulation record is below.
            </div>
          </div>
        </div>

        {/* Main result */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-center gap-4 py-4">
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1">{isBuy ? "You spent" : "You sold"}</div>
              <div className="text-xl font-bold text-white">
                {isBuy ? fmtUsd(result.usdtSpent ?? 0) : `${fmt(result.tokensSold ?? 0)} ${symbol}`}
              </div>
            </div>
            <div className="text-gray-600 text-xl">→</div>
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1">{isBuy ? "Simulated buy" : "Simulated receive"}</div>
              <div className={`text-xl font-bold ${isBuy ? "text-green-400" : "text-blue-400"}`}>
                {isBuy ? `${fmt(result.tokensReceived ?? 0)} ${symbol}` : fmtUsd(result.usdtReceived ?? 0)}
              </div>
            </div>
          </div>

          {/* Details grid */}
          <div className="bg-white/[0.02] rounded-xl border border-white/5 p-4 space-y-2.5 text-sm">
            {[
              { label:"Trade ID", value:result.tradeId, mono:true, copy:true },
              { label:"Timestamp", value:tsToTime(result.trade.time) },
              { label:"Asset", value:`${symbol} / USDT` },
              { label:"Side", value:isBuy ? "BUY (simulated)" : "SELL (simulated)" },
              { label:"Avg price", value:fmtUsd(result.avgPrice) },
              { label:"New market price", value:fmtUsd(result.newPrice) },
              { label:"Fee (0.30%)", value:fmtUsd(result.fee) },
              { label:"Type", value:"Virtual AMM — Bonding Curve" },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between gap-4">
                <span className="text-gray-500 flex-shrink-0">{row.label}</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-white text-right truncate ${row.mono ? "font-mono text-xs" : ""}`}>
                    {row.value}
                  </span>
                  {row.copy && (
                    <button onClick={handleCopy} className="flex-shrink-0 text-gray-500 hover:text-yellow-400 transition-colors">
                      {copied ? <CheckCircle2 className="w-3 h-3 text-green-400"/> : <Copy className="w-3 h-3"/>}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Where did tokens go */}
          <div className="mt-3 bg-yellow-500/5 border border-yellow-500/15 rounded-xl px-4 py-3">
            <div className="text-xs font-semibold text-yellow-400 mb-1 flex items-center gap-1.5">
              <Info className="w-3 h-3"/> Where did the {symbol} go?
            </div>
            <div className="text-[11px] text-gray-400 leading-relaxed">
              In the Genesis virtual AMM, no {symbol} actually moves — the bonding curve records your trade and updates the virtual supply. Think of it as <strong className="text-white">price discovery and paper trading</strong>. Real settlement would require on-chain execution via the bridge or spot markets.
            </div>
          </div>

          <button onClick={onClose}
            className="w-full mt-4 py-3 rounded-xl bg-white/[0.05] text-gray-300 hover:text-white hover:bg-white/10 text-sm font-medium transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Market card ─────────────────────────────────────────────────────────*/
function MarketCard({ m, selected, onClick }: { m:GenesisMarket; selected:boolean; onClick:()=>void }) {
  const pos = m.change24h >= 0;
  return (
    <button onClick={onClick} className={`w-full text-left p-3 rounded-xl border transition-all ${
      selected ? "border-yellow-500/60 bg-yellow-500/10" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <CoinIcon symbol={m.symbol} size={26}/>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">{m.symbol}</div>
          <div className="text-[9px] text-gray-500 uppercase">{m.quoteSymbol}</div>
        </div>
        <div className={`text-[10px] font-medium px-1 py-0.5 rounded ${pos?"bg-green-500/10 text-green-400":"bg-red-500/10 text-red-400"}`}>
          {pos?"+":""}{m.change24h.toFixed(2)}%
        </div>
      </div>
      <div className="text-sm font-bold text-white">{fmtUsd(m.price)}</div>
      <div className="text-[9px] text-gray-500 mt-0.5">Vol: {fmtUsd(m.volume24h)}</div>
    </button>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────*/
export default function GenesisLiquidity() {
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("BTC");
  const [side, setSide] = useState<"buy"|"sell">("buy");
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState("");
  const [receipt, setReceipt] = useState<SwapResult | null>(null);
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedAmount(amount), 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [amount]);

  const { data: markets=[], isLoading: mktLoading } = useQuery<GenesisMarket[]>({
    queryKey:["genesis-markets"],
    queryFn: async () => { const r=await fetch(`${BASE}/api/genesis/markets`); if(!r.ok) throw new Error("failed"); return r.json(); },
    refetchInterval:15_000,
  });

  const { data: detail } = useQuery<MarketDetail>({
    queryKey:["genesis-market",symbol],
    queryFn: async () => { const r=await fetch(`${BASE}/api/genesis/market/${symbol}`); if(!r.ok) throw new Error("failed"); return r.json(); },
    refetchInterval:8_000,
    enabled:!!symbol,
  });

  const { data: quote, isLoading: quoteLoading } = useQuery<GenesisQuote>({
    queryKey:["genesis-quote",symbol,side,debouncedAmount],
    queryFn: async () => {
      if (!debouncedAmount||parseFloat(debouncedAmount)<=0) throw new Error("no amount");
      const p=new URLSearchParams({symbol,side});
      if(side==="buy") p.set("usdtAmount",debouncedAmount); else p.set("tokenAmount",debouncedAmount);
      const r=await fetch(`${BASE}/api/genesis/quote?${p}`);
      if(!r.ok){const e=await r.json(); throw new Error(e.error);}
      return r.json();
    },
    enabled:!!debouncedAmount&&parseFloat(debouncedAmount)>0, retry:false,
  });

  const swap = useMutation<SwapResult,Error>({
    mutationFn: async () => {
      const body:Record<string,unknown>={symbol,side};
      if(side==="buy") body.usdtAmount=parseFloat(amount); else body.tokenAmount=parseFloat(amount);
      const r=await fetch(`${BASE}/api/genesis/swap`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!r.ok){const e=await r.json(); throw new Error(e.error);}
      return r.json();
    },
    onSuccess:(data)=>{
      setReceipt(data);
      setAmount(""); setDebouncedAmount("");
      qc.invalidateQueries({queryKey:["genesis-markets"]});
      qc.invalidateQueries({queryKey:["genesis-market",symbol]});
    },
  });

  const filtered = markets.filter(m=>m.symbol.toLowerCase().includes(search.toLowerCase()));
  const selected = markets.find(m=>m.symbol===symbol);
  const impactPct = quote?.priceImpactPct ?? 0;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* Header */}
      <div className="border-b border-white/5 bg-gradient-to-r from-yellow-500/5 via-transparent to-purple-500/5">
        <div className="max-w-[1400px] mx-auto px-6 py-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <Zap className="w-5 h-5 text-yellow-400"/>
            </div>
            <h1 className="text-xl font-bold text-white">Genesis Liquidity Engine</h1>
            <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full font-semibold">VIRTUAL AMM</span>
          </div>
          <p className="text-sm text-gray-400 ml-11">
            Trade any asset instantly — {fmtUsd(8_500)} virtual depth per market, zero liquidity required.
          </p>
          {/* Virtual disclaimer bar */}
          <div className="ml-11 mt-2 flex items-center gap-2 text-[11px] text-orange-400">
            <FlaskConical className="w-3 h-3 flex-shrink-0"/>
            <span>Simulated trading only — no real assets are transferred. No wallet or gas required.</span>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label:"Markets",value:markets.length||"—",icon:Layers,color:"text-yellow-400" },
            { label:"Total 24h Volume",value:fmtUsd(markets.reduce((s,m)=>s+m.volume24h,0)),icon:BarChart3,color:"text-blue-400" },
            { label:"Virtual Depth / Market",value:"$8,500",icon:DollarSign,color:"text-green-400" },
            { label:"Total Trades",value:markets.reduce((s,m)=>s+m.tradeCount,0),icon:Activity,color:"text-purple-400" },
          ].map(s=>(
            <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-3.5 h-3.5 ${s.color}`}/>
                <span className="text-[11px] text-gray-500">{s.label}</span>
              </div>
              <div className="text-lg font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          {/* Left: markets */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white/[0.03] border border-white/8 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/40"/>
            </div>
            <div className="grid grid-cols-2 gap-2 overflow-y-auto max-h-[600px]">
              {mktLoading
                ? Array.from({length:10}).map((_,i)=><div key={i} className="h-20 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse"/>)
                : filtered.map(m=><MarketCard key={m.symbol} m={m} selected={m.symbol===symbol} onClick={()=>{setSymbol(m.symbol);setAmount("");}}/>)
              }
            </div>
          </div>

          {/* Right: swap + detail */}
          <div className="flex flex-col gap-5">
            {/* Swap card */}
            <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
              {/* Virtual notice */}
              <div className="flex items-center gap-2 bg-orange-500/8 border border-orange-500/15 rounded-xl px-3 py-2 mb-4">
                <FlaskConical className="w-3.5 h-3.5 text-orange-400 flex-shrink-0"/>
                <span className="text-[11px] text-orange-400">
                  <strong>Simulated trading.</strong> No real {symbol} is sent to any wallet. No on-chain transaction occurs.
                </span>
              </div>

              {/* Token header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <CoinIcon symbol={symbol} size={40}/>
                  <div>
                    <div className="text-lg font-bold text-white">{symbol} / USDT</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">{fmtUsd(selected?.price??0)}</span>
                      {selected&&(
                        <span className={`text-xs font-medium ${selected.change24h>=0?"text-green-400":"text-red-400"}`}>
                          {selected.change24h>=0?"+":""}{selected.change24h.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={()=>qc.invalidateQueries({queryKey:["genesis-market",symbol]})}
                  className="p-2 rounded-lg bg-white/[0.03] border border-white/8 text-gray-400 hover:text-white transition-colors">
                  <RefreshCw className="w-4 h-4"/>
                </button>
              </div>

              {/* Buy/Sell */}
              <div className="flex rounded-xl bg-white/[0.03] border border-white/8 p-1 mb-4">
                {(["buy","sell"] as const).map(s=>(
                  <button key={s} onClick={()=>{setSide(s);setAmount("");}}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                      side===s ? s==="buy"?"bg-green-500 text-white":"bg-red-500 text-white" : "text-gray-400 hover:text-white"
                    }`}>
                    {s==="buy"?"Simulate Buy":"Simulate Sell"}
                  </button>
                ))}
              </div>

              {/* Amount input */}
              <div className="mb-3">
                <label className="text-xs text-gray-500 mb-1.5 block">
                  {side==="buy"?"USDT to spend (simulated)":`${symbol} to sell (simulated)`}
                </label>
                <div className="flex items-center bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 focus-within:border-yellow-500/40">
                  <input value={amount} onChange={e=>{setAmount(e.target.value);}} placeholder="0.00"
                    type="number" min="0"
                    className="flex-1 bg-transparent text-xl font-bold text-white outline-none placeholder-gray-700"/>
                  <span className="text-sm text-gray-500">{side==="buy"?"USDT":symbol}</span>
                </div>
                {side==="buy"&&(
                  <div className="flex gap-2 mt-2">
                    {[100,500,1000,5000].map(v=>(
                      <button key={v} onClick={()=>setAmount(String(v))}
                        className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.04] text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 border border-white/5 transition-colors">
                        ${v}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quote */}
              {quoteLoading&&debouncedAmount&&(
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-3 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin"/>Calculating…
                </div>
              )}
              {quote&&!quoteLoading&&(
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-4 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Simulated receive</span>
                    <span className="font-bold text-white">
                      {side==="buy"?`${fmt(quote.tokensOut??0)} ${symbol} (virtual)`:fmtUsd(quote.usdtOut??0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Avg price</span>
                    <span className="text-white">{fmtUsd(quote.price)} / {symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Price after</span>
                    <span className="text-white">{fmtUsd(quote.priceAfter)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Price impact</span>
                    <span className={`font-medium ${impactPct<1?"text-green-400":impactPct<2?"text-yellow-400":"text-red-400"}`}>
                      {impactPct.toFixed(3)}%
                    </span>
                  </div>
                  <DepthBar impact={impactPct}/>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Simulated fee (0.30%)</span><span>{fmtUsd(quote.fee)}</span>
                  </div>
                </div>
              )}

              {/* Swap button */}
              <button onClick={()=>swap.mutate()}
                disabled={!amount||parseFloat(amount)<=0||swap.isPending}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${
                  !amount||parseFloat(amount)<=0
                    ?"bg-white/5 text-gray-600 cursor-not-allowed"
                    :side==="buy"?"bg-green-500 hover:bg-green-400 text-white":"bg-red-500 hover:bg-red-400 text-white"
                }`}>
                {swap.isPending
                  ?<span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin"/>Executing simulation…</span>
                  :`${side==="buy"?"Simulate Buy":"Simulate Sell"} ${symbol}`
                }
              </button>
              {swap.isError&&(
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 mt-3">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0"/>{(swap.error as Error).message}
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-3 text-[11px] text-gray-600">
                <Info className="w-3 h-3"/>Virtual AMM — no wallet, no gas, no real asset transfer
              </div>
            </div>

            {/* Detail panels */}
            {detail&&(
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Stats */}
                <div className="bg-white/[0.02] border border-white/8 rounded-xl p-4">
                  <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-yellow-400"/>Market Stats
                  </div>
                  <div className="space-y-2.5 text-sm">
                    {[
                      {l:"Virtual Price",v:fmtUsd(detail.price)},
                      {l:"Virtual Supply",v:`${fmt(detail.supply)} ${symbol}`},
                      {l:"Market Cap",v:fmtUsd(detail.marketCap)},
                      {l:"Volume 24h",v:fmtUsd(detail.volume24h)},
                      {l:"Virtual Depth",v:fmtUsd(detail.virtualDepthUsd)},
                      {l:"Treasury",v:fmtUsd(detail.treasury)},
                    ].map(r=>(
                      <div key={r.l} className="flex justify-between">
                        <span className="text-gray-500">{r.l}</span>
                        <span className="text-white font-medium">{r.v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 text-[10px] text-gray-600 font-mono">
                    Base: {fmtUsd(detail.curve.basePrice)} · Slope: {detail.curve.slope.toExponential(3)}
                  </div>
                </div>

                {/* Trade history */}
                <div className="bg-white/[0.02] border border-white/8 rounded-xl p-4">
                  <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <History className="w-4 h-4 text-blue-400"/>Simulation History
                    <span className="text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded ml-auto">VIRTUAL</span>
                  </div>
                  {detail.trades.length===0?(
                    <div className="text-center py-6 text-gray-600 text-sm">No simulations yet</div>
                  ):(
                    <div className="space-y-1.5 overflow-y-auto max-h-[220px]">
                      {detail.trades.slice(0,15).map(t=>(
                        <div key={t.id} className="flex items-center gap-2 text-xs">
                          <span className={`font-semibold w-8 flex-shrink-0 ${t.side==="buy"?"text-green-400":"text-red-400"}`}>
                            {t.side==="buy"?"BUY":"SELL"}
                          </span>
                          <span className="text-gray-400 flex-1 truncate">{fmt(t.amount)} {symbol}</span>
                          <span className="text-white flex-shrink-0">{fmtUsd(t.total)}</span>
                          <span className="text-gray-600 flex-shrink-0 font-mono text-[10px]">#{t.id}</span>
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
                <Zap className="w-4 h-4 text-yellow-400"/>How the Genesis Liquidity Engine Works
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-400">
                <div><div className="text-yellow-400 font-semibold mb-1">Virtual AMM</div>
                  Every asset is backed by a linear bonding curve. No LPs needed. All trades are simulations that update the curve's virtual supply.</div>
                <div><div className="text-blue-400 font-semibold mb-1">$8,500 Depth</div>
                  Buying $8,500 moves price by only ~1%. This simulates deep liquidity for all assets from day one — no bootstrapping required.</div>
                <div><div className="text-green-400 font-semibold mb-1">Paper Trading</div>
                  Think of it as price discovery. Real settlement happens via the spot and bridge modules with a connected wallet.</div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/5 text-[10px] text-gray-600 font-mono">
                price(s) = basePrice + slope × s &nbsp;|&nbsp; cost(n) = (p₀ + p₁) × n / 2
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Receipt modal */}
      {receipt&&<TradeReceiptModal result={receipt} symbol={symbol} onClose={()=>setReceipt(null)}/>}
    </div>
  );
}
