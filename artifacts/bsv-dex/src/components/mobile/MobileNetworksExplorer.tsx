import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, ArrowLeft, Search, X, Flame, Clock, BarChart2,
  ChevronRight, Copy, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Network {
  id: string;
  attributes: { name: string; coingecko_asset_platform_id?: string };
}
interface Pool {
  id: string;
  attributes: {
    name: string; address: string;
    base_token_price_usd: string; quote_token_price_usd: string;
    price_change_percentage?: { h24?: number|string|null; h6?: number|string|null; h1?: number|string|null };
    volume_usd?: { h24?: number|string|null; h6?: number|string|null };
    reserve_in_usd?: string; pool_created_at?: string;
    transactions?: { h24?: { buys: number; sells: number } };
    market_cap_usd?: string; fdv_usd?: string;
  };
  relationships?: {
    base_token?: { data?: { id: string } }; quote_token?: { data?: { id: string } };
    network?: { data?: { id: string } }; dex?: { data?: { id: string } };
  };
}
interface Included {
  type: string; id: string;
  attributes: { name: string; symbol: string; address: string; image_url?: string };
}

/* ─── Layer config ───────────────────────────────────────────────────────── */
type LayerGroup = "trending"|"l2"|"l1evm"|"l1other"|"other";
const LAYERS: { id: LayerGroup; label: string; emoji: string }[] = [
  { id:"trending", label:"Trending",   emoji:"🔥" },
  { id:"l2",       label:"Layer 2",    emoji:"⚡" },
  { id:"l1evm",    label:"L1 · EVM",  emoji:"🔷" },
  { id:"l1other",  label:"L1 · Other",emoji:"🌐" },
  { id:"other",    label:"More Chains",emoji:"⬡" },
];
const L2  = new Set(["base","arbitrum","optimism","polygon_pos","zksync","linea","scroll","mantle","polygon-zkevm","starknet-alpha","manta-pacific","mode","opbnb","arbitrum_nova","metis","boba","aurora","rollux","neon-evm","shibarium","canto","merlin-chain","zkfair","defimetachain","lightlink-phoenix","beam","shimmerevm"]);
const EVM = new Set(["eth","bsc","avax","ftm","cro","one","kcc","iotx","celo","xdai","glmr","movr","evmos","cfx","bttc","xdc","kaia","kava","bitgert","tombchain","dogechain","thundercore","ethereum_classic","ethw","godwoken","tomochain","oasys","bitkub_chain","wemix","flare","core","filecoin","eos-evm","ultron","pulsechain","enuls","tenet","zetachain","oasis-sapphire","xai","hedera-hashgraph","humanode","alveychain","nrg","wan","ronin","kai","mtr","velas","sdn","tlos","astr","ela","dfk","fuse","step-network","exosama","platon_network","findora","sxn","multivac","loopnetwork","mxc-zkevm","elysium"]);
const ALT = new Set(["solana","aptos","sui-network","ton","sei-network","bch"]);
function layer(id: string): LayerGroup {
  if (L2.has(id))  return "l2";
  if (EVM.has(id)) return "l1evm";
  if (ALT.has(id)) return "l1other";
  return "other";
}

/* ─── Network badge colours ─────────────────────────────────────────────── */
const NET_LETTER: Record<string,string> = { eth:"Ξ",bsc:"B",solana:"◎",avax:"A",base:"⬡",arbitrum:"↗",optimism:"○",polygon_pos:"M",ftm:"F",cro:"C",zksync:"↗",linea:"L",scroll:"S",mantle:"M",ton:"T",aptos:"A","sui-network":"S","sei-network":"S" };
const NET_CLR: Record<string,string> = { eth:"bg-blue-600",bsc:"bg-yellow-500",solana:"bg-purple-600",avax:"bg-red-600",base:"bg-blue-500",arbitrum:"bg-blue-700",optimism:"bg-red-500",polygon_pos:"bg-purple-500",ftm:"bg-blue-400",cro:"bg-indigo-600",zksync:"bg-blue-600",linea:"bg-gray-700",scroll:"bg-amber-600",mantle:"bg-emerald-700",ton:"bg-sky-600",aptos:"bg-teal-600","sui-network":"bg-cyan-600","sei-network":"bg-red-700",one:"bg-cyan-700",bch:"bg-green-600" };
function NetBadge({ id, name }: { id: string; name: string }) {
  return <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0", NET_CLR[id]??"bg-gray-600")}>{NET_LETTER[id]??name.slice(0,2).toUpperCase()}</span>;
}

/* ─── Formatters ─────────────────────────────────────────────────────────── */
function fmtUsd(s: string|number|null|undefined): string {
  const n = typeof s==="string" ? parseFloat(s) : (s??NaN);
  if (!isFinite(n)||n===0) return "—";
  if (n>=1e9) return `$${(n/1e9).toFixed(1)}B`;
  if (n>=1e6) return `$${(n/1e6).toFixed(1)}M`;
  if (n>=1e3) return `$${(n/1e3).toFixed(1)}K`;
  if (n>=1)   return `$${n.toFixed(2)}`;
  if (n>=0.001) return `$${n.toFixed(5)}`;
  return `$${n.toExponential(2)}`;
}
function fmtChg(v: number|string|null|undefined): { text:string; up:boolean } {
  const n = v==null ? NaN : typeof v==="string" ? parseFloat(v) : v;
  if (!isFinite(n)) return { text:"—", up:true };
  return { text:`${n>=0?"+":""}${n.toFixed(2)}%`, up:n>=0 };
}
function ago(iso: string|undefined): string {
  if (!iso) return "";
  const h=Math.floor((Date.now()-new Date(iso).getTime())/3.6e6);
  return h<1?"<1h":h<24?`${h}h ago`:`${Math.floor(h/24)}d ago`;
}
function resolve(pool: Pool, side:"base"|"quote", inc: Included[]) {
  const rel = pool.relationships?.[side==="base"?"base_token":"quote_token"]?.data?.id;
  return inc.find(i=>i.id===rel);
}
const TOKEN_COLORS = ["bg-blue-500","bg-purple-500","bg-green-500","bg-red-500","bg-yellow-500","bg-orange-500","bg-pink-500","bg-teal-500"];

/* ─── Copy button ─────────────────────────────────────────────────────────── */
function CopyBtn({ text }: { text: string }) {
  const [done,setDone]=useState(false);
  return <button onClick={()=>{navigator.clipboard.writeText(text).catch(()=>{});setDone(true);setTimeout(()=>setDone(false),1500);}} className="ml-1 text-muted-foreground active:text-primary">{done?<Check className="w-3 h-3 text-green-400"/>:<Copy className="w-3 h-3"/>}</button>;
}

/* ─── Pool detail bottom sheet ──────────────────────────────────────────── */
function PoolSheet({ pool, inc, netId, onClose }: { pool:Pool; inc:Included[]; netId?:string; onClose:()=>void }) {
  const base  = resolve(pool,"base",inc);
  const quote = resolve(pool,"quote",inc);
  const dex   = pool.relationships?.dex?.data?.id??"";
  const net   = pool.relationships?.network?.data?.id??netId??"";
  const bSym  = base?.attributes.symbol ??pool.attributes.name.split(" / ")[0]??"?";
  const qSym  = quote?.attributes.symbol??pool.attributes.name.split(" / ")[1]??"?";
  const clr   = TOKEN_COLORS[bSym.charCodeAt(0)%TOKEN_COLORS.length];
  const { text:c24,up:u24 }=fmtChg(pool.attributes.price_change_percentage?.h24);
  const { text:c6, up:u6  }=fmtChg(pool.attributes.price_change_percentage?.h6);
  const { text:c1, up:u1  }=fmtChg(pool.attributes.price_change_percentage?.h1);

  const Row = ({ label, val }: { label:string; val:string }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold text-foreground">{val}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-card rounded-t-2xl border border-border/40 max-h-[80vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-border" /></div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pb-3 pt-1">
          <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0",clr)}>{bSym.slice(0,2)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold">{bSym}</span>
              <span className="text-base text-muted-foreground">/ {qSym}</span>
              {net && <span className={cn("text-[10px] px-2 py-0.5 rounded-full text-white font-bold",NET_CLR[net]??"bg-gray-600")}>{net.toUpperCase().slice(0,8)}</span>}
            </div>
            {dex && <p className="text-[11px] text-muted-foreground">{dex}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground p-1"><X className="w-5 h-5"/></button>
        </div>

        {/* Price */}
        <div className="px-5 pb-4">
          <div className="text-3xl font-bold tabular-nums">{fmtUsd(pool.attributes.base_token_price_usd)}</div>
          <div className="flex gap-4 mt-1.5">
            <span className={cn("text-sm font-medium",u24?"text-green-400":"text-red-400")}>1D {c24}</span>
            <span className={cn("text-sm font-medium",u6?"text-green-400":"text-red-400")}>6H {c6}</span>
            <span className={cn("text-sm font-medium",u1?"text-green-400":"text-red-400")}>1H {c1}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 px-5 pb-4">
          <Row label="24h Volume"  val={fmtUsd(pool.attributes.volume_usd?.h24)} />
          <Row label="Liquidity"   val={fmtUsd(pool.attributes.reserve_in_usd)} />
          <Row label="Market Cap"  val={fmtUsd(pool.attributes.market_cap_usd)} />
          <Row label="FDV"         val={fmtUsd(pool.attributes.fdv_usd)} />
          {pool.attributes.transactions?.h24 && <>
            <Row label="24h Buys"  val={String(pool.attributes.transactions.h24.buys)} />
            <Row label="24h Sells" val={String(pool.attributes.transactions.h24.sells)} />
          </>}
          {pool.attributes.pool_created_at && <Row label="Created" val={ago(pool.attributes.pool_created_at)} />}
        </div>

        {/* Addresses */}
        {pool.attributes.address && (
          <div className="mx-5 mb-3 px-3 py-2.5 bg-secondary/50 rounded-xl">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-1">Pool Address</p>
            <div className="flex items-center gap-1">
              <code className="text-[11px] text-foreground/80 break-all flex-1 leading-tight">{pool.attributes.address}</code>
              <CopyBtn text={pool.attributes.address} />
            </div>
          </div>
        )}
        {base?.attributes.address && (
          <div className="mx-5 mb-3 px-3 py-2.5 bg-secondary/50 rounded-xl">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-1">{bSym} Contract</p>
            <div className="flex items-center gap-1">
              <code className="text-[11px] text-foreground/80 break-all flex-1 leading-tight">{base.attributes.address}</code>
              <CopyBtn text={base.attributes.address} />
            </div>
          </div>
        )}
        {quote?.attributes.address && (
          <div className="mx-5 mb-6 px-3 py-2.5 bg-secondary/50 rounded-xl">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mb-1">{qSym} Contract</p>
            <div className="flex items-center gap-1">
              <code className="text-[11px] text-foreground/80 break-all flex-1 leading-tight">{quote.attributes.address}</code>
              <CopyBtn text={quote.attributes.address} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Pool row ───────────────────────────────────────────────────────────── */
function PoolRow({ pool, inc, showNet, netId, onClick }: { pool:Pool; inc:Included[]; showNet?:boolean; netId?:string; onClick:()=>void }) {
  const base  = resolve(pool,"base",inc);
  const quote = resolve(pool,"quote",inc);
  const dex   = pool.relationships?.dex?.data?.id??"";
  const net   = pool.relationships?.network?.data?.id??netId??"";
  const bSym  = base?.attributes.symbol ??pool.attributes.name.split(" / ")[0]??"?";
  const qSym  = quote?.attributes.symbol??pool.attributes.name.split(" / ")[1]??"?";
  const { text, up } = fmtChg(pool.attributes.price_change_percentage?.h24);
  const clr = TOKEN_COLORS[bSym.charCodeAt(0)%TOKEN_COLORS.length];
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 active:bg-secondary/60 transition-colors text-left">
      <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[12px] shrink-0",clr)}>{bSym.slice(0,2)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-sm text-foreground">{bSym}</span>
          <span className="text-xs text-muted-foreground">/{qSym}</span>
          {dex && <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground">{dex.slice(0,8)}</span>}
          {showNet && net && <span className={cn("text-[9px] px-1.5 py-0.5 rounded text-white font-bold",NET_CLR[net]??"bg-gray-600")}>{net.slice(0,3).toUpperCase()}</span>}
        </div>
        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
          {pool.attributes.reserve_in_usd ? `Liq ${fmtUsd(pool.attributes.reserve_in_usd)}` : ""}
          {pool.attributes.pool_created_at && <span className="ml-1.5 text-blue-400/70">{ago(pool.attributes.pool_created_at)}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-foreground">{fmtUsd(pool.attributes.base_token_price_usd)}</div>
        <div className={cn("text-[11px] font-medium mt-0.5",up?"text-green-400":"text-red-400")}>{text}</div>
      </div>
      <div className="text-right shrink-0 min-w-[52px]">
        <div className="text-[11px] text-muted-foreground">{fmtUsd(pool.attributes.volume_usd?.h24)}</div>
        <div className="text-[10px] text-muted-foreground/50 mt-0.5">vol</div>
      </div>
    </button>
  );
}

function NetworkCard({ net, onClick }: { net: Network; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-secondary/40 hover:bg-secondary active:bg-secondary/70 transition-colors min-w-[80px]">
      <NetBadge id={net.id} name={net.attributes.name} />
      <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[72px] truncate">{net.attributes.name}</span>
    </button>
  );
}

function Skeleton() {
  return (
    <div>{Array.from({length:8}).map((_,i)=>(
      <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
        <div className="w-9 h-9 rounded-full bg-secondary shrink-0" />
        <div className="flex-1"><div className="h-3.5 bg-secondary rounded w-28 mb-1.5"/><div className="h-2.5 bg-secondary/60 rounded w-20"/></div>
        <div className="text-right shrink-0"><div className="h-3.5 bg-secondary rounded w-16 mb-1.5"/><div className="h-2.5 bg-secondary/60 rounded w-10 ml-auto"/></div>
      </div>
    ))}</div>
  );
}

const ColHead = () => (
  <div className="flex items-center px-4 py-1.5 text-[10px] text-muted-foreground/60 font-medium border-b border-border/20 shrink-0">
    <div className="w-9 mr-3 shrink-0"/><div className="flex-1">TOKEN</div>
    <div className="text-right w-20 mr-3">PRICE</div><div className="text-right w-14">VOLUME</div>
  </div>
);

type PoolSort = "volume"|"new";

/* ─── Main ───────────────────────────────────────────────────────────────── */
export function MobileNetworksExplorer() {
  const [activeLayer, setActiveLayer] = useState<LayerGroup>("trending");
  const [selNet, setSelNet]  = useState<Network|null>(null);
  const [sort, setSort]      = useState<PoolSort>("volume");
  const [search, setSearch]  = useState("");
  const [dSearch, setDSearch]= useState("");
  const [detail, setDetail]  = useState<{pool:Pool;inc:Included[];netId?:string}|null>(null);

  const debounce = useCallback((v:string)=>{
    setSearch(v);
    clearTimeout((debounce as any)._t);
    (debounce as any)._t=setTimeout(()=>setDSearch(v),400);
  },[]);

  const { data: netsData, isLoading: netsLoading } = useQuery({
    queryKey:["gt","networks"],
    queryFn:()=>fetch(`${API}/api/gt/networks`).then(r=>r.json()) as Promise<{networks:Network[]}>,
    staleTime:600_000,
  });
  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey:["gt","trending"],
    queryFn:()=>fetch(`${API}/api/gt/trending`).then(r=>r.json()),
    staleTime:120_000, refetchInterval:120_000,
    enabled:activeLayer==="trending"&&!selNet,
  });
  const { data: volData, isLoading: volLoading } = useQuery({
    queryKey:["gt","netpools",selNet?.id],
    queryFn:()=>fetch(`${API}/api/gt/networks/${selNet!.id}/pools`).then(r=>r.json()),
    staleTime:60_000, refetchInterval:60_000,
    enabled:!!selNet&&sort==="volume",
  });
  const { data: newData, isLoading: newLoading } = useQuery({
    queryKey:["gt","netnew",selNet?.id],
    queryFn:()=>fetch(`${API}/api/gt/networks/${selNet!.id}/new-pools`).then(r=>r.json()),
    staleTime:90_000, enabled:!!selNet&&sort==="new",
  });
  const { data: srchData, isLoading: srchLoading } = useQuery({
    queryKey:["gt","search",dSearch],
    queryFn:()=>fetch(`${API}/api/gt/search?q=${encodeURIComponent(dSearch)}`).then(r=>r.json()),
    staleTime:30_000, enabled:dSearch.length>1,
  });

  const allNets: Network[]   = netsData?.networks??[];
  const filtNets             = allNets.filter(n=>layer(n.id)===activeLayer);
  const tPools: Pool[]       = trendData?.data??[];
  const tInc: Included[]     = trendData?.included??[];
  const nPools: Pool[]       = (sort==="volume"?volData?.data:newData?.data)??[];
  const nInc: Included[]     = (sort==="volume"?volData?.included:newData?.included)??[];
  const sPools: Pool[]       = srchData?.data??[];
  const sInc: Included[]     = srchData?.included??[];
  const netLoading           = sort==="volume"?volLoading:newLoading;
  const isSearching          = search.length>0;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Banner */}
      <div className="mx-4 mt-2 mb-1 flex items-center gap-3 px-3 py-2.5 bg-green-500/10 border border-green-500/25 rounded-xl shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-green-400 leading-tight">All Chains · Live Pool Data</p>
          <p className="text-[10px] text-green-300/60 leading-tight mt-0.5">
            {allNets.length>0?`${allNets.length} networks`:"200+ networks"} · On-chain market intelligence
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mx-4 mb-2 flex items-center gap-2 bg-secondary/60 border border-border/60 rounded-xl px-3 h-9 shrink-0">
        <Search size={13} className="text-muted-foreground shrink-0"/>
        <input className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 outline-none"
          placeholder="Search token or pool address…" value={search} onChange={e=>debounce(e.target.value)}/>
        {search&&<button onClick={()=>{setSearch("");setDSearch("");}}><X size={13} className="text-muted-foreground"/></button>}
      </div>

      {/* Body */}
      {isSearching ? (
        <div className="flex-1 overflow-y-auto flex flex-col">
          <ColHead/>
          {srchLoading?<Skeleton/>:sPools.length===0&&dSearch?(
            <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
              <Search className="w-8 h-8 opacity-30"/><p className="text-sm">No results for "{dSearch}"</p>
            </div>
          ):sPools.map(p=><PoolRow key={p.id} pool={p} inc={sInc} showNet onClick={()=>setDetail({pool:p,inc:sInc})}/>)}
        </div>
      ) : selNet ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Network header */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border/30 shrink-0 bg-background">
            <button onClick={()=>setSelNet(null)} className="text-muted-foreground active:text-foreground"><ArrowLeft className="w-5 h-5"/></button>
            <NetBadge id={selNet.id} name={selNet.attributes.name}/>
            <div>
              <p className="text-sm font-bold text-foreground">{selNet.attributes.name}</p>
              <p className="text-[10px] text-muted-foreground">{selNet.id}</p>
            </div>
          </div>
          {/* Sort tabs */}
          <div className="flex items-center gap-1 px-4 py-2 shrink-0">
            {([{id:"volume"as PoolSort,label:"Top Volume",icon:<BarChart2 className="w-3 h-3"/>},{id:"new"as PoolSort,label:"Newest",icon:<Clock className="w-3 h-3"/>}]).map(t=>(
              <button key={t.id} onClick={()=>setSort(t.id)}
                className={cn("flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors",sort===t.id?"bg-primary/20 text-primary":"text-muted-foreground hover:bg-secondary/50")}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          <ColHead/>
          <div className="flex-1 overflow-y-auto">
            {netLoading?<Skeleton/>:nPools.length===0?(
              <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground"><BarChart2 className="w-8 h-8 opacity-30"/><p className="text-sm">No pools found</p></div>
            ):nPools.map(p=><PoolRow key={p.id} pool={p} inc={nInc} netId={selNet.id} onClick={()=>setDetail({pool:p,inc:nInc,netId:selNet.id})}/>)}
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Layer pills */}
          <div className="flex items-center gap-0 px-4 pt-1 shrink-0 overflow-x-auto no-scrollbar">
            {LAYERS.map(g=>(
              <button key={g.id} onClick={()=>setActiveLayer(g.id)}
                className={cn("flex items-center gap-1 px-3 py-2 text-[12px] font-medium rounded-lg mr-1 whitespace-nowrap transition-colors shrink-0",
                  activeLayer===g.id?"bg-primary/20 text-primary":"text-muted-foreground hover:text-foreground hover:bg-secondary/50")}>
                <span>{g.emoji}</span>{g.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeLayer==="trending" ? (
              <>
                <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                  <Flame className="w-4 h-4 text-orange-400"/>
                  <span className="text-sm font-bold text-foreground">Trending Pools</span>
                  <span className="text-[10px] text-muted-foreground/60 ml-1">· all networks</span>
                </div>
                <ColHead/>
                {trendLoading?<Skeleton/>:tPools.length===0?(
                  <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground"><Flame className="w-8 h-8 opacity-30"/><p className="text-sm">No trending data</p></div>
                ):tPools.map(p=><PoolRow key={p.id} pool={p} inc={tInc} showNet onClick={()=>setDetail({pool:p,inc:tInc})}/>)}
              </>
            ):(
              <>
                <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                  <span className="text-sm font-bold text-foreground">{LAYERS.find(g=>g.id===activeLayer)?.emoji} {LAYERS.find(g=>g.id===activeLayer)?.label}</span>
                  <span className="text-[10px] text-muted-foreground/60 ml-1">— {filtNets.length} networks</span>
                </div>
                {netsLoading?(
                  <div className="flex flex-wrap gap-2 px-4 py-3">{Array.from({length:12}).map((_,i)=><div key={i} className="w-[80px] h-[76px] rounded-xl bg-secondary animate-pulse"/>)}</div>
                ):filtNets.length===0?(
                  <div className="px-4 py-8 text-sm text-muted-foreground text-center">No networks in this layer</div>
                ):(
                  <div className="flex flex-wrap gap-2 px-4 py-3">
                    {filtNets.map(n=><NetworkCard key={n.id} net={n} onClick={()=>setSelNet(n)}/>)}
                  </div>
                )}
                {filtNets.length>0&&<div className="flex items-center justify-center gap-1.5 pb-4 text-[10px] text-muted-foreground/40"><ChevronRight className="w-3 h-3"/>Tap a network to see its live pools</div>}
              </>
            )}
          </div>
        </div>
      )}

      {/* In-app detail sheet */}
      {detail&&<PoolSheet pool={detail.pool} inc={detail.inc} netId={detail.netId} onClose={()=>setDetail(null)}/>}
    </div>
  );
}
