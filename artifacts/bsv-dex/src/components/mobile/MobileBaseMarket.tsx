import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, TrendingUp, Clock, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DexPair {
  chainId: string; dexId: string; url: string; pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  volume?: { h24?: number; h6?: number; h1?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number };
  liquidity?: { usd?: number };
  fdv?: number; pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

type SubTab = "top"|"new"|"search";

function fmt(n: number|undefined|null): string {
  if (n==null||isNaN(n)) return "—";
  if (n>=1e9) return `$${(n/1e9).toFixed(1)}B`;
  if (n>=1e6) return `$${(n/1e6).toFixed(1)}M`;
  if (n>=1e3) return `$${(n/1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtPrice(p: string|undefined): string {
  if (!p) return "—";
  const n=parseFloat(p);
  if (isNaN(n)) return "—";
  if (n>=1000) return `$${n.toLocaleString("en-US",{maximumFractionDigits:2})}`;
  if (n>=1)    return `$${n.toFixed(4)}`;
  if (n>=0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(8)}`;
}
function timeAgo(ms: number|undefined): string {
  if (!ms) return "—";
  const h=Math.floor((Date.now()-ms)/3.6e6);
  const d=Math.floor((Date.now()-ms)/86.4e6);
  if (h<1) return "<1h"; if (h<24) return `${h}h`; if (d<30) return `${d}d`;
  return `${Math.floor(d/30)}mo`;
}

const DEX_LABEL: Record<string,string> = { uniswap:"Uni",aerodrome:"Aero",sushiswap:"Sushi",pancakeswap:"Cake",baseswap:"Base",alienbase:"Alien",swapbased:"Swap" };
const DEX_CLR:   Record<string,string> = { uniswap:"bg-pink-500/20 text-pink-400",aerodrome:"bg-red-500/20 text-red-400",sushiswap:"bg-blue-500/20 text-blue-400",pancakeswap:"bg-yellow-500/20 text-yellow-400",baseswap:"bg-blue-400/20 text-blue-300",alienbase:"bg-purple-500/20 text-purple-400" };
const TOKEN_COLORS = ["bg-blue-500","bg-purple-500","bg-green-500","bg-red-500","bg-yellow-500","bg-orange-500","bg-pink-500","bg-teal-500"];

function TokenAvatar({ sym }: { sym: string }) {
  const clr = TOKEN_COLORS[sym.charCodeAt(0)%TOKEN_COLORS.length];
  return <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[12px] shrink-0",clr)}>{sym.slice(0,2).toUpperCase()}</div>;
}

function CopyBtn({ text }: { text: string }) {
  const [done,setDone]=useState(false);
  return <button onClick={()=>{navigator.clipboard.writeText(text).catch(()=>{});setDone(true);setTimeout(()=>setDone(false),1500);}} className="ml-1 text-muted-foreground active:text-primary shrink-0">{done?<Check className="w-3 h-3 text-green-400"/>:<Copy className="w-3 h-3"/>}</button>;
}

/* ─── In-app Pair Detail Sheet ────────────────────────────────────────────── */
function PairSheet({ pair, onClose }: { pair: DexPair; onClose: ()=>void }) {
  const bSym = pair.baseToken.symbol;
  const qSym = pair.quoteToken.symbol;
  const clr  = TOKEN_COLORS[bSym.charCodeAt(0)%TOKEN_COLORS.length];
  const c24  = pair.priceChange?.h24;
  const c6   = pair.priceChange?.h6;
  const c1   = pair.priceChange?.h1;
  const upColor = (v: number|undefined) => v==null?"text-muted-foreground":v>=0?"text-green-400":"text-red-400";
  const pct   = (v: number|undefined) => v==null?"—":`${v>=0?"+":""}${v.toFixed(2)}%`;
  const dex   = pair.dexId;
  const dexLabel = DEX_LABEL[dex]??dex;

  const Stat = ({ label, val }: { label:string; val:string }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold text-foreground">{val}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-card rounded-t-2xl border border-border/40 max-h-[82vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-border"/></div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pb-3 pt-1">
          <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0",clr)}>{bSym.slice(0,2)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold">{bSym}</span>
              <span className="text-base text-muted-foreground">/ {qSym}</span>
              <span className={cn("text-[9px] px-2 py-0.5 rounded font-medium",DEX_CLR[dex]??"bg-gray-500/20 text-gray-400")}>{dexLabel}</span>
              <span className="text-[9px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">BASE</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{pair.baseToken.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground p-1"><X className="w-5 h-5"/></button>
        </div>

        {/* Price */}
        <div className="px-5 pb-4">
          <div className="text-3xl font-bold tabular-nums">{fmtPrice(pair.priceUsd)}</div>
          <div className="flex gap-4 mt-1.5">
            <span className={cn("text-sm font-medium",upColor(c24))}>1D {pct(c24)}</span>
            <span className={cn("text-sm font-medium",upColor(c6))}>6H {pct(c6)}</span>
            <span className={cn("text-sm font-medium",upColor(c1))}>1H {pct(c1)}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 px-5 pb-4">
          <Stat label="24h Volume"  val={fmt(pair.volume?.h24)} />
          <Stat label="Liquidity"   val={fmt(pair.liquidity?.usd)} />
          <Stat label="FDV"         val={pair.fdv ? fmt(pair.fdv) : "—"} />
          <Stat label="Pair Age"    val={pair.pairCreatedAt ? `${timeAgo(pair.pairCreatedAt)} old` : "—"} />
        </div>

        {/* Addresses */}
        <div className="mx-5 mb-3 space-y-2">
          {pair.pairAddress && (
            <div className="px-3 py-2.5 bg-secondary/50 rounded-xl">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-1">Pair Contract</p>
              <div className="flex items-center gap-1">
                <code className="text-[11px] text-foreground/80 break-all flex-1 leading-tight">{pair.pairAddress}</code>
                <CopyBtn text={pair.pairAddress}/>
              </div>
            </div>
          )}
          {pair.baseToken.address && (
            <div className="px-3 py-2.5 bg-secondary/50 rounded-xl">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-1">{bSym} Contract</p>
              <div className="flex items-center gap-1">
                <code className="text-[11px] text-foreground/80 break-all flex-1 leading-tight">{pair.baseToken.address}</code>
                <CopyBtn text={pair.baseToken.address}/>
              </div>
            </div>
          )}
          {pair.quoteToken.address && (
            <div className="px-3 py-2.5 bg-secondary/50 rounded-xl">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-1">{qSym} Contract</p>
              <div className="flex items-center gap-1">
                <code className="text-[11px] text-foreground/80 break-all flex-1 leading-tight">{pair.quoteToken.address}</code>
                <CopyBtn text={pair.quoteToken.address}/>
              </div>
            </div>
          )}
        </div>
        <div className="h-6" />
      </div>
    </div>
  );
}

/* ─── Pair row ────────────────────────────────────────────────────────────── */
function PairRow({ pair, onClick }: { pair: DexPair; onClick: ()=>void }) {
  const chg=pair.priceChange?.h24;
  const isUp=(chg??0)>=0;
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 active:bg-secondary/60 transition-colors text-left">
      <TokenAvatar sym={pair.baseToken.symbol}/>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm text-foreground truncate">{pair.baseToken.symbol}</span>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="text-xs text-muted-foreground">{pair.quoteToken.symbol}</span>
          <span className={cn("text-[9px] px-1 py-0.5 rounded font-medium ml-0.5",DEX_CLR[pair.dexId]??"bg-gray-500/20 text-gray-400")}>
            {DEX_LABEL[pair.dexId]??pair.dexId}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {pair.baseToken.name}
          {pair.liquidity?.usd!=null&&<> · <span className="text-muted-foreground/70">Liq {fmt(pair.liquidity.usd)}</span></>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-foreground">{fmtPrice(pair.priceUsd)}</div>
        <div className={cn("text-[11px] font-medium mt-0.5",isUp?"text-green-400":"text-red-400")}>
          {chg!=null?`${isUp?"+":""}${chg.toFixed(2)}%`:"—"}
        </div>
      </div>
      <div className="text-right shrink-0 min-w-[52px]">
        <div className="text-[11px] text-muted-foreground">{fmt(pair.volume?.h24)}</div>
        <div className="text-[10px] text-muted-foreground/50 mt-0.5">24h vol</div>
      </div>
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center"><TrendingUp className="w-5 h-5"/></div>
      <p className="text-sm">{label}</p>
    </div>
  );
}

/* ─── Main ────────────────────────────────────────────────────────────────── */
export function MobileBaseMarket() {
  const [subTab, setSubTab] = useState<SubTab>("top");
  const [searchQ, setSearchQ]   = useState("");
  const [debouncedQ, setDebQ]   = useState("");
  const [detailPair, setDetail] = useState<DexPair|null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{ const t=setTimeout(()=>setDebQ(searchQ),400); return ()=>clearTimeout(t); },[searchQ]);

  const topQuery = useQuery({
    queryKey:["dexscreener","base","top"],
    queryFn:async()=>{ const r=await fetch(`${BASE_URL}/api/dexscreener/base/top`); if(!r.ok)throw new Error("Failed"); return r.json() as Promise<{pairs:DexPair[]}>; },
    staleTime:30_000, refetchInterval:60_000, enabled:subTab==="top",
  });
  const newQuery = useQuery({
    queryKey:["dexscreener","base","new"],
    queryFn:async()=>{ const r=await fetch(`${BASE_URL}/api/dexscreener/base/new`); if(!r.ok)throw new Error("Failed"); return r.json() as Promise<{pairs:DexPair[]}>; },
    staleTime:60_000, refetchInterval:120_000, enabled:subTab==="new",
  });
  const searchQuery = useQuery({
    queryKey:["dexscreener","base","search",debouncedQ],
    queryFn:async()=>{ if(!debouncedQ.trim())return{pairs:[]}; const r=await fetch(`${BASE_URL}/api/dexscreener/base/search?q=${encodeURIComponent(debouncedQ)}`); if(!r.ok)throw new Error("Failed"); return r.json() as Promise<{pairs:DexPair[]}>; },
    staleTime:30_000, enabled:subTab==="search"&&debouncedQ.length>0,
  });

  const activePairs: DexPair[] = subTab==="top"?(topQuery.data?.pairs??[]):subTab==="new"?(newQuery.data?.pairs??[]):subTab==="search"?(searchQuery.data?.pairs??[]):[];
  const isLoading = (subTab==="top"&&topQuery.isLoading)||(subTab==="new"&&newQuery.isLoading)||(subTab==="search"&&searchQuery.isFetching);

  return (
    <div className="flex flex-col h-full">

      {/* Banner — no third-party branding */}
      <div className="mx-4 mt-2 mb-1 flex items-center gap-3 px-3 py-2.5 bg-blue-500/10 border border-blue-500/25 rounded-xl">
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
          <span className="text-white font-extrabold text-[13px]">⬡</span>
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-blue-400 leading-tight">Base Chain · Live DEX Markets</p>
          <p className="text-[10px] text-blue-300/60 leading-tight mt-0.5">Real-time on-chain data</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-0 px-4 pt-1">
        {([
          { id:"top"    as SubTab, label:"Top Pairs", icon:<TrendingUp className="w-3 h-3"/> },
          { id:"new"    as SubTab, label:"New",       icon:<Clock className="w-3 h-3"/> },
          { id:"search" as SubTab, label:"Search",    icon:<Search className="w-3 h-3"/> },
        ] as const).map(t=>(
          <button key={t.id}
            onClick={()=>{ setSubTab(t.id); if(t.id==="search")setTimeout(()=>inputRef.current?.focus(),100); }}
            className={cn("flex items-center gap-1 px-3 py-2 text-[12px] font-medium rounded-lg mr-1 transition-colors",
              subTab===t.id?"bg-blue-500/20 text-blue-400":"text-muted-foreground hover:text-foreground hover:bg-secondary/50")}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Search input */}
      {subTab==="search"&&(
        <div className="mx-4 mt-2 mb-1 flex items-center gap-2 bg-secondary/60 border border-border/60 rounded-xl px-3 h-9">
          <Search size={13} className="text-muted-foreground shrink-0"/>
          <input ref={inputRef} className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 outline-none"
            placeholder="Token symbol or 0x address…" value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
          {searchQ&&<button onClick={()=>setSearchQ("")}><X size={13} className="text-muted-foreground"/></button>}
        </div>
      )}

      {/* Column headers */}
      <div className="flex items-center px-4 py-1.5 text-[10px] text-muted-foreground/60 font-medium border-b border-border/20">
        <div className="w-9 mr-3 shrink-0"/>
        <div className="flex-1">{subTab==="new"?<span>TOKEN <span className="text-muted-foreground/40 ml-1">age</span></span>:"TOKEN"}</div>
        <div className="text-right w-20 mr-3">PRICE</div>
        <div className="text-right w-14">VOLUME</div>
      </div>

      {/* Pair list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading&&(
          <div className="flex flex-col gap-0">
            {Array.from({length:12}).map((_,i)=>(
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-secondary shrink-0"/>
                <div className="flex-1"><div className="h-3.5 bg-secondary rounded w-28 mb-1.5"/><div className="h-2.5 bg-secondary/60 rounded w-20"/></div>
                <div className="text-right"><div className="h-3.5 bg-secondary rounded w-16 mb-1.5"/><div className="h-2.5 bg-secondary/60 rounded w-10 ml-auto"/></div>
              </div>
            ))}
          </div>
        )}
        {!isLoading&&subTab==="search"&&!debouncedQ&&<EmptyState label="Type a token name or paste a contract address"/>}
        {!isLoading&&activePairs.length===0&&(subTab!=="search"||debouncedQ)&&<EmptyState label="No pairs found"/>}
        {!isLoading&&activePairs.map(pair=>(
          <div key={pair.pairAddress}>
            {subTab==="new"&&(
              <div className="px-4 -mb-1"><span className="text-[9px] text-blue-400/70 bg-blue-500/10 px-1.5 py-0.5 rounded">{timeAgo(pair.pairCreatedAt)} ago</span></div>
            )}
            <PairRow pair={pair} onClick={()=>setDetail(pair)}/>
          </div>
        ))}
        {!isLoading&&activePairs.length>0&&<div className="h-4"/>}
      </div>

      {/* In-app pair detail sheet */}
      {detailPair&&<PairSheet pair={detailPair} onClose={()=>setDetail(null)}/>}
    </div>
  );
}
