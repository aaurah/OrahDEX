import { useState, useEffect, useRef } from "react";
import { CoinLogo } from "@/components/CoinLogo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, RefreshCw, AlertTriangle, CheckCircle2, Search,
  ChevronDown, Info, FlaskConical, X, Copy, Receipt, History,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface GenesisMarket {
  symbol: string; quoteSymbol: string; price: number; supply: number;
  marketCap: number; treasury: number; volume24h: number; change24h: number; tradeCount: number;
}
interface GenesisQuote {
  symbol: string; side: "buy"|"sell"; price: number; priceAfter: number;
  priceImpactPct: number; fee: number; marketPrice: number;
  tokensOut?: number; usdtOut?: number;
}
interface SwapResult {
  success: boolean; tradeId: string; side: "buy"|"sell";
  tokensReceived?: number; usdtSpent?: number;
  usdtReceived?: number; tokensSold?: number;
  fee: number; avgPrice: number; newPrice: number;
  trade: { id: string; time: number; side: string; amount: number; price: number; total: number };
}
interface MarketDetail {
  trades: Array<{ id: string; time: number; side: "buy"|"sell"; amount: number; price: number; total: number }>;
}

function fmt(n: number): string {
  if (!isFinite(n)||isNaN(n)) return "—";
  if (n>=1_000_000) return `${(n/1_000_000).toFixed(2)}M`;
  if (n>=1_000) return `${(n/1_000).toFixed(2)}K`;
  if (n>=1) return n.toFixed(4);
  if (n>=0.001) return n.toFixed(6);
  return n.toPrecision(4);
}
function fmtUsd(n: number): string {
  if (!isFinite(n)||isNaN(n)) return "$—";
  if (n>=1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (n>=1_000) return `$${(n/1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function CoinIcon({ symbol, size=28 }: { symbol:string; size?:number }) {
  return <CoinLogo symbol={symbol} size={size} />;
}

/* ── Full-screen receipt ─────────────────────────────────────────────────*/
function MobileReceipt({ result, symbol, onClose }: { result:SwapResult; symbol:string; onClose:()=>void }) {
  const [copied, setCopied] = useState(false);
  const isBuy = result.side==="buy";
  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0F] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-yellow-400"/>
          <span className="font-bold text-white text-sm">Trade Receipt</span>
        </div>
        <button onClick={onClose} className="p-2 rounded-full bg-white/5">
          <X className="w-4 h-4 text-gray-400"/>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {/* Virtual warning */}
        <div className="flex items-start gap-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl px-4 py-3.5">
          <FlaskConical className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5"/>
          <div>
            <div className="text-xs font-bold text-orange-300 mb-0.5">SIMULATED TRADE</div>
            <div className="text-[11px] text-orange-400/80 leading-relaxed">
              No real {symbol} was transferred to any wallet. This is a virtual bonding curve simulation — no blockchain transaction occurred.
            </div>
          </div>
        </div>

        {/* Result summary */}
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5 text-center">
          <div className={`text-4xl font-black mb-1 ${isBuy?"text-green-400":"text-blue-400"}`}>
            {isBuy ? `${fmt(result.tokensReceived??0)} ${symbol}` : fmtUsd(result.usdtReceived??0)}
          </div>
          <div className="text-sm text-gray-500 mb-3">
            {isBuy?"Simulated buy amount":"Simulated receive"}
          </div>
          <div className="text-xs text-gray-600">
            {isBuy?`Spent ${fmtUsd(result.usdtSpent??0)} USDT (virtual)`:`Sold ${fmt(result.tokensSold??0)} ${symbol} (virtual)`}
          </div>
        </div>

        {/* Where did it go box */}
        <div className="bg-yellow-500/5 border border-yellow-500/15 rounded-2xl px-4 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-3.5 h-3.5 text-yellow-400"/>
            <span className="text-xs font-bold text-yellow-400">Where did the {symbol} go?</span>
          </div>
          <div className="text-[11px] text-gray-400 leading-relaxed">
            Nowhere — and that's intentional. The Genesis Engine is a virtual price discovery tool. 
            The bonding curve registered your trade and updated its supply model. 
            No {symbol} exists in any wallet. For real asset trading, use <strong className="text-white">Spot</strong> or <strong className="text-white">DEX</strong> with a connected wallet.
          </div>
        </div>

        {/* Receipt details */}
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3 text-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Simulation Record</div>
          {[
            { label:"Trade ID", value:result.tradeId, mono:true },
            { label:"Time", value:new Date(result.trade.time).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}) },
            { label:"Asset", value:`${symbol} / USDT` },
            { label:"Side", value:isBuy?"BUY (simulated)":"SELL (simulated)" },
            { label:"Avg price", value:fmtUsd(result.avgPrice) },
            { label:"New curve price", value:fmtUsd(result.newPrice) },
            { label:"Simulated fee", value:fmtUsd(result.fee) },
            { label:"Type", value:"Virtual AMM" },
          ].map(row=>(
            <div key={row.label} className="flex items-center justify-between gap-3">
              <span className="text-gray-500 flex-shrink-0">{row.label}</span>
              <span className={`text-white text-right ${row.mono?"font-mono text-xs":"font-medium"} truncate`}>{row.value}</span>
            </div>
          ))}
          {/* Copy trade ID */}
          <button onClick={()=>{navigator.clipboard?.writeText(result.tradeId).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),1500);}}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.04] border border-white/8 text-xs text-gray-400 hover:text-yellow-400 transition-colors mt-1">
            {copied?<CheckCircle2 className="w-3.5 h-3.5 text-green-400"/>:<Copy className="w-3.5 h-3.5"/>}
            {copied?"Copied!":"Copy Trade ID"}
          </button>
        </div>

        <button onClick={onClose}
          className="w-full py-4 rounded-2xl bg-white/[0.05] text-gray-300 font-semibold text-sm">
          Close Receipt
        </button>
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────*/
export default function MobileGenesis() {
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("BTC");
  const [side, setSide] = useState<"buy"|"sell">("buy");
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [receipt, setReceipt] = useState<SwapResult|null>(null);
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(()=>{
    if(timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(()=>setDebouncedAmount(amount),400);
    return ()=>{if(timer.current) clearTimeout(timer.current);};
  },[amount]);

  const { data: markets=[], isLoading } = useQuery<GenesisMarket[]>({
    queryKey:["genesis-markets"],
    queryFn:async()=>{ const r=await fetch(`${BASE}/api/genesis/markets`); if(!r.ok) throw new Error("failed"); return r.json(); },
    refetchInterval:20_000,
  });

  const { data: detail } = useQuery<MarketDetail>({
    queryKey:["genesis-market",symbol],
    queryFn:async()=>{ const r=await fetch(`${BASE}/api/genesis/market/${symbol}`); if(!r.ok) throw new Error("failed"); return r.json(); },
    refetchInterval:10_000,
    enabled:!!symbol,
  });

  const { data: quote, isLoading: quoteLoading } = useQuery<GenesisQuote>({
    queryKey:["genesis-quote",symbol,side,debouncedAmount],
    queryFn:async()=>{
      if(!debouncedAmount||parseFloat(debouncedAmount)<=0) throw new Error("no amount");
      const p=new URLSearchParams({symbol,side});
      if(side==="buy") p.set("usdtAmount",debouncedAmount); else p.set("tokenAmount",debouncedAmount);
      const r=await fetch(`${BASE}/api/genesis/quote?${p}`);
      if(!r.ok){const e=await r.json(); throw new Error(e.error);}
      return r.json();
    },
    enabled:!!debouncedAmount&&parseFloat(debouncedAmount)>0, retry:false,
  });

  const swap = useMutation<SwapResult,Error>({
    mutationFn:async()=>{
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

  const selected = markets.find(m=>m.symbol===symbol);
  const filtered = markets.filter(m=>m.symbol.toLowerCase().includes(search.toLowerCase()));
  const impactPct = quote?.priceImpactPct??0;

  /* Show receipt if executed */
  if (receipt) return <MobileReceipt result={receipt} symbol={symbol} onClose={()=>setReceipt(null)}/>;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white pb-28">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <Zap className="w-4 h-4 text-yellow-400"/>
          </div>
          <h1 className="text-base font-bold">Genesis DEX</h1>
          <span className="text-[9px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full font-semibold ml-auto">VIRTUAL AMM</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-orange-400 mt-1">
          <FlaskConical className="w-3 h-3 flex-shrink-0"/>
          <span>Simulated only — no real assets transfer, no wallet needed</span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Virtual notice */}
        <div className="flex items-start gap-2.5 bg-orange-500/8 border border-orange-500/15 rounded-xl px-3 py-3">
          <FlaskConical className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5"/>
          <div className="text-[11px] text-orange-400 leading-relaxed">
            <strong>This is paper trading.</strong> Trades simulate the bonding curve only. No {symbol} goes to any wallet. A receipt with Trade ID is shown after each simulation.
          </div>
        </div>

        {/* Token picker button */}
        <button onClick={()=>setShowPicker(true)}
          className="w-full flex items-center gap-3 bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3">
          {selected?(
            <>
              <CoinIcon symbol={selected.symbol} size={32}/>
              <div className="flex-1 text-left">
                <div className="font-bold text-white">{selected.symbol} / USDT</div>
                <div className="text-xs text-gray-500">{fmtUsd(selected.price)}</div>
              </div>
              <div className={`text-xs font-medium ${selected.change24h>=0?"text-green-400":"text-red-400"}`}>
                {selected.change24h>=0?"+":""}{selected.change24h.toFixed(2)}%
              </div>
            </>
          ):(
            <span className="text-gray-500 flex-1 text-sm">Select an asset…</span>
          )}
          <ChevronDown className="w-4 h-4 text-gray-500"/>
        </button>

        {/* Buy / Sell */}
        <div className="flex rounded-xl bg-white/[0.03] border border-white/8 p-1">
          {(["buy","sell"] as const).map(s=>(
            <button key={s} onClick={()=>{setSide(s);setAmount("");}}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                side===s ? s==="buy"?"bg-green-500 text-white":"bg-red-500 text-white" : "text-gray-400"
              }`}>
              {s==="buy"?"Simulate Buy":"Simulate Sell"}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">
            {side==="buy"?"USDT to spend (simulated)":`${symbol} to sell (simulated)`}
          </label>
          <div className="flex items-center bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3.5 focus-within:border-yellow-500/40">
            <input value={amount} onChange={e=>setAmount(e.target.value)}
              placeholder="0.00" type="number" min="0" inputMode="decimal"
              className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder-gray-700"/>
            <span className="text-sm text-gray-500">{side==="buy"?"USDT":symbol}</span>
          </div>
          {side==="buy"&&(
            <div className="flex gap-2 mt-2">
              {[50,200,500,1000].map(v=>(
                <button key={v} onClick={()=>setAmount(String(v))}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-white/[0.04] text-gray-400 border border-white/5 transition-colors">
                  ${v}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quote */}
        {quoteLoading&&debouncedAmount&&(
          <div className="flex items-center gap-2 text-sm text-gray-500 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin"/>Calculating…
          </div>
        )}
        {quote&&!quoteLoading&&(
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Simulated receive</span>
              <span className="font-bold text-white">
                {side==="buy"?`${fmt(quote.tokensOut??0)} ${symbol} (virtual)`:fmtUsd(quote.usdtOut??0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Avg price</span>
              <span className="text-white">{fmtUsd(quote.price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Impact</span>
              <span className={`font-medium ${impactPct<1?"text-green-400":impactPct<2?"text-yellow-400":"text-red-400"}`}>
                {impactPct.toFixed(3)}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>Simulated fee (0.30%)</span><span>{fmtUsd(quote.fee)}</span>
            </div>
          </div>
        )}

        {/* Error */}
        {swap.isError&&(
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5"/>
            {(swap.error as Error).message}
          </div>
        )}

        {/* Swap button */}
        <button onClick={()=>swap.mutate()}
          disabled={!amount||parseFloat(amount)<=0||swap.isPending}
          className={`w-full py-4 rounded-xl font-bold text-base transition-all ${
            !amount||parseFloat(amount)<=0
              ?"bg-white/5 text-gray-600 cursor-not-allowed"
              :side==="buy"?"bg-green-500 hover:bg-green-400 text-white":"bg-red-500 hover:bg-red-400 text-white"
          }`}>
          {swap.isPending
            ?<span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin"/>Simulating…</span>
            :`${side==="buy"?"Simulate Buy":"Simulate Sell"} ${symbol} → Get Receipt`
          }
        </button>

        <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <Info className="w-3 h-3"/>A trade receipt with ID will appear after simulation
        </div>

        {/* History toggle */}
        {detail && detail.trades.length > 0 && (
          <div>
            <button onClick={()=>setShowHistory(h=>!h)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl text-sm text-gray-400 hover:text-white transition-colors">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4"/>
                <span>Simulation History ({detail.trades.length})</span>
                <span className="text-[9px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">VIRTUAL</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${showHistory?"rotate-180":""}`}/>
            </button>
            {showHistory&&(
              <div className="mt-2 bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-2">
                {detail.trades.slice(0,10).map(t=>(
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <span className={`font-semibold w-8 flex-shrink-0 ${t.side==="buy"?"text-green-400":"text-red-400"}`}>
                      {t.side==="buy"?"BUY":"SELL"}
                    </span>
                    <span className="text-gray-400 flex-1 truncate">{fmt(t.amount)} {symbol}</span>
                    <span className="text-white">{fmtUsd(t.total)}</span>
                    <span className="text-gray-600 font-mono text-[10px]">#{t.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* All markets */}
        <div>
          <div className="text-xs text-gray-500 mb-2 font-medium">All Markets (Virtual)</div>
          <div className="space-y-1">
            {markets.slice(0,12).map(m=>(
              <button key={m.symbol} onClick={()=>setSymbol(m.symbol)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                  m.symbol===symbol?"border-yellow-500/40 bg-yellow-500/5":"border-white/5 bg-white/[0.02]"
                }`}>
                <CoinIcon symbol={m.symbol} size={22}/>
                <span className="text-sm font-medium text-white flex-1 text-left">{m.symbol}</span>
                <span className="text-sm text-white">{fmtUsd(m.price)}</span>
                <span className={`text-xs w-14 text-right ${m.change24h>=0?"text-green-400":"text-red-400"}`}>
                  {m.change24h>=0?"+":""}{m.change24h.toFixed(2)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Token picker sheet */}
      {showPicker&&(
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end" onClick={()=>setShowPicker(false)}>
          <div className="bg-[#131318] border-t border-white/10 rounded-t-2xl p-4 max-h-[75vh] flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4"/>
            <div className="text-sm font-semibold text-white mb-3">Select Asset (Virtual)</div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white/[0.04] border border-white/8 rounded-xl text-white placeholder-gray-600 outline-none"/>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1 pb-2">
              {isLoading
                ?Array.from({length:8}).map((_,i)=><div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse"/>)
                :filtered.map(m=>(
                  <button key={m.symbol} onClick={()=>{setSymbol(m.symbol);setShowPicker(false);setSearch("");}}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                      m.symbol===symbol?"border-yellow-500/40 bg-yellow-500/5":"border-transparent hover:bg-white/[0.03]"
                    }`}>
                    <CoinIcon symbol={m.symbol} size={28}/>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-white">{m.symbol}</div>
                      <div className="text-[10px] text-gray-500">Vol: {fmtUsd(m.volume24h)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-white">{fmtUsd(m.price)}</div>
                      <div className={`text-[10px] ${m.change24h>=0?"text-green-400":"text-red-400"}`}>
                        {m.change24h>=0?"+":""}{m.change24h.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
