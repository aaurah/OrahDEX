import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Vote, Plus, TrendingUp, ChevronUp, X, Search, CheckCircle2, Clock, Trophy, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Coin {
  id: number; symbol: string; name: string; chain?: string|null;
  logoUrl?: string|null; contractAddress?: string|null;
  website?: string|null; description?: string|null;
  votes: number; status: string; createdAt: string;
}

const CHAINS = ["Ethereum","Base","BSC","Solana","Arbitrum","Optimism","Polygon","Avalanche","BSV","Other"];
const CHAIN_CLR: Record<string,string> = { Ethereum:"bg-blue-600",Base:"bg-blue-500",BSC:"bg-yellow-500",Solana:"bg-purple-600",Arbitrum:"bg-blue-700",Optimism:"bg-red-500",Polygon:"bg-purple-500",Avalanche:"bg-red-600",BSV:"bg-green-600",Other:"bg-gray-600" };
const TOKEN_COLORS = ["bg-blue-500","bg-purple-500","bg-green-500","bg-red-500","bg-yellow-500","bg-orange-500","bg-pink-500","bg-teal-500","bg-indigo-500","bg-cyan-500"];

function CoinAvatar({ sym, size="md" }: { sym: string; size?: "sm"|"md"|"lg" }) {
  const clr = TOKEN_COLORS[sym.charCodeAt(0)%TOKEN_COLORS.length];
  const sz  = size==="sm"?"w-8 h-8 text-[11px]":size==="lg"?"w-14 h-14 text-lg":"w-10 h-10 text-sm";
  return <div className={cn("rounded-full flex items-center justify-center text-white font-bold shrink-0",clr,sz)}>{sym.slice(0,2).toUpperCase()}</div>;
}

function VoteBar({ coin, rank, hasVoted, onVote }: { coin: Coin; rank: number; hasVoted: boolean; onVote: (id:number)=>void }) {
  const rankColors = ["text-yellow-400","text-gray-300","text-amber-600"];
  const rankIcon   = ["🥇","🥈","🥉"];
  const isTop3 = rank <= 3;
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors",isTop3?"bg-gradient-to-r from-primary/5 to-transparent":"")}>
      <div className="w-7 text-center shrink-0">
        {rank<=3
          ? <span className="text-base">{rankIcon[rank-1]}</span>
          : <span className="text-[11px] text-muted-foreground/60 font-bold">#{rank}</span>}
      </div>
      <CoinAvatar sym={coin.symbol} size="md"/>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn("font-bold text-sm",isTop3?rankColors[rank-1]:"text-foreground")}>{coin.symbol}</span>
          {coin.chain&&<span className={cn("text-[9px] px-1.5 py-0.5 rounded-full text-white font-bold",CHAIN_CLR[coin.chain]??"bg-gray-600")}>{coin.chain}</span>}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{coin.name}</p>
      </div>
      <div className="text-right shrink-0 mr-3">
        <div className={cn("text-sm font-bold tabular-nums",isTop3?"text-primary":"text-foreground")}>{coin.votes.toLocaleString()}</div>
        <div className="text-[10px] text-muted-foreground/60">votes</div>
      </div>
      <button
        onClick={()=>!hasVoted&&onVote(coin.id)}
        disabled={hasVoted}
        className={cn("flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-all shrink-0",
          hasVoted
            ? "bg-primary/20 text-primary cursor-default"
            : "bg-secondary hover:bg-primary/20 hover:text-primary active:scale-95 text-muted-foreground"
        )}>
        {hasVoted?<CheckCircle2 className="w-4 h-4"/>:<ChevronUp className="w-4 h-4"/>}
        <span className="text-[9px] font-bold">{hasVoted?"Voted":"Vote"}</span>
      </button>
    </div>
  );
}

/* ─── Nominate form ──────────────────────────────────────────────────────── */
function NominateSheet({ onClose, onSuccess }: { onClose:()=>void; onSuccess:()=>void }) {
  const [form,setForm] = useState({ symbol:"", name:"", chain:"", contractAddress:"", website:"", description:"" });
  const [err, setErr]  = useState("");
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await fetch(`${API}/api/votes/coins`,{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data) });
      const j = await r.json();
      if(!r.ok) throw new Error(j.error??"Failed");
      return j;
    },
    onSuccess: ()=>{ qc.invalidateQueries({queryKey:["coin-votes"]}); onSuccess(); },
    onError:(e:any)=>setErr(e.message??"Unknown error"),
  });

  const submit = () => {
    if(!form.symbol.trim()||!form.name.trim()){ setErr("Symbol and name are required"); return; }
    setErr("");
    mut.mutate(form);
  };

  const Field = ({ label, field, placeholder, as="input" }: { label:string; field:keyof typeof form; placeholder:string; as?:"input"|"textarea" }) => (
    <div>
      <label className="text-[11px] text-muted-foreground/60 uppercase tracking-wide font-medium">{label}</label>
      {as==="textarea"?(
        <textarea value={form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}
          className="mt-1 w-full bg-secondary/60 border border-border/60 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/60 resize-none h-20"
          placeholder={placeholder}/>
      ):(
        <input value={form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}
          className="mt-1 w-full bg-secondary/60 border border-border/60 rounded-xl px-3 h-10 text-sm outline-none focus:border-primary/60"
          placeholder={placeholder}/>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>
      <div className="relative bg-card rounded-t-2xl border border-border/40 max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-border"/></div>
        <div className="flex items-center justify-between px-5 pb-3 pt-2">
          <div>
            <h2 className="text-base font-bold text-foreground">Nominate a Coin</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Suggest a coin to be listed on OrahDEX</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground p-1"><X className="w-5 h-5"/></button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Symbol *" field="symbol" placeholder="e.g. PEPE"/>
            <div>
              <label className="text-[11px] text-muted-foreground/60 uppercase tracking-wide font-medium">Chain</label>
              <select value={form.chain} onChange={e=>setForm(f=>({...f,chain:e.target.value}))}
                className="mt-1 w-full bg-secondary/60 border border-border/60 rounded-xl px-3 h-10 text-sm outline-none focus:border-primary/60">
                <option value="">Select chain</option>
                {CHAINS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <Field label="Coin Name *" field="name" placeholder="e.g. PepeCoin"/>
          <Field label="Contract Address" field="contractAddress" placeholder="0x… or token mint"/>
          <Field label="Website" field="website" placeholder="https://…"/>
          <Field label="Description" field="description" placeholder="Tell us why this coin should be listed on OrahDEX…" as="textarea"/>

          {err&&<div className="text-[12px] text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{err}</div>}

          <button onClick={submit} disabled={mut.isPending}
            className="w-full h-12 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {mut.isPending?<div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"/>:<><Plus className="w-4 h-4"/>Submit Nomination</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export function MobileCoinVote() {
  const [showNominate, setShowNominate] = useState(false);
  const [showSuccess,  setShowSuccess]  = useState(false);
  const [search, setSearch]   = useState("");
  const [votedIds, setVotedIds] = useState<Set<number>>(()=>{
    try { return new Set(JSON.parse(localStorage.getItem("orahdex_voted")??"[]") as number[]); } catch { return new Set(); }
  });

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey:["coin-votes"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/votes/coins`);
      return r.json() as Promise<{coins: Coin[]}>;
    },
    staleTime: 30_000, refetchInterval: 60_000,
  });

  const voteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/api/votes/coins/${id}/vote`,{ method:"POST", headers:{"Content-Type":"application/json"} });
      if(!r.ok){ const j=await r.json(); throw new Error(j.error??"Failed"); }
      return r.json();
    },
    onSuccess: (_,id)=>{
      const next = new Set(votedIds); next.add(id); setVotedIds(next);
      localStorage.setItem("orahdex_voted", JSON.stringify([...next]));
      qc.invalidateQueries({queryKey:["coin-votes"]});
    },
  });

  const coins: Coin[] = data?.coins ?? [];
  const filtered = search
    ? coins.filter(c => c.symbol.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()))
    : coins;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="mx-4 mt-2 mb-1 flex items-center gap-3 px-3 py-2.5 bg-primary/10 border border-primary/25 rounded-xl shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-green-600 flex items-center justify-center shrink-0">
          <Vote className="w-4 h-4 text-white"/>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-primary leading-tight">Coin Listing Votes</p>
          <p className="text-[10px] text-primary/60 leading-tight mt-0.5">
            {coins.length>0?`${coins.length} nominations · `:""} Vote to list a coin on OrahDEX
          </p>
        </div>
        <button onClick={()=>setShowNominate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-[12px] font-bold rounded-xl active:scale-95 transition-all shrink-0">
          <Plus className="w-3.5 h-3.5"/>Nominate
        </button>
      </div>

      {/* Stats strip */}
      {coins.length>0&&(
        <div className="flex items-center gap-2 px-4 py-2 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 bg-secondary/60 rounded-xl px-3 py-1.5 shrink-0">
            <Trophy className="w-3.5 h-3.5 text-yellow-400"/>
            <span className="text-[11px] font-bold text-foreground">#{1}</span>
            <span className="text-[11px] text-muted-foreground">{coins[0]?.symbol}</span>
            <span className="text-[11px] text-primary font-bold">{coins[0]?.votes} votes</span>
          </div>
          <div className="flex items-center gap-1.5 bg-secondary/60 rounded-xl px-3 py-1.5 shrink-0">
            <Flame className="w-3.5 h-3.5 text-orange-400"/>
            <span className="text-[11px] text-muted-foreground">{coins.length} nominated</span>
          </div>
          <div className="flex items-center gap-1.5 bg-secondary/60 rounded-xl px-3 py-1.5 shrink-0">
            <TrendingUp className="w-3.5 h-3.5 text-green-400"/>
            <span className="text-[11px] text-muted-foreground">{coins.reduce((a,c)=>a+c.votes,0)} total votes</span>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mx-4 mb-1 flex items-center gap-2 bg-secondary/60 border border-border/60 rounded-xl px-3 h-9 shrink-0">
        <Search size={13} className="text-muted-foreground shrink-0"/>
        <input className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 outline-none"
          placeholder="Search nominated coins…" value={search} onChange={e=>setSearch(e.target.value)}/>
        {search&&<button onClick={()=>setSearch("")}><X size={13} className="text-muted-foreground"/></button>}
      </div>

      {/* Column header */}
      <div className="flex items-center px-4 py-1.5 text-[10px] text-muted-foreground/60 font-medium border-b border-border/20 shrink-0">
        <div className="w-7 mr-3 shrink-0">#</div>
        <div className="w-10 mr-3 shrink-0"/>
        <div className="flex-1">COIN</div>
        <div className="text-right w-16 mr-2">VOTES</div>
        <div className="w-14 text-right">ACTION</div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading&&(
          <div>{Array.from({length:8}).map((_,i)=>(
            <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <div className="w-7 h-4 bg-secondary rounded shrink-0"/>
              <div className="w-10 h-10 rounded-full bg-secondary shrink-0"/>
              <div className="flex-1"><div className="h-3.5 bg-secondary rounded w-24 mb-1.5"/><div className="h-2.5 bg-secondary/60 rounded w-16"/></div>
              <div className="w-14 h-8 bg-secondary rounded-xl"/>
            </div>
          ))}</div>
        )}

        {!isLoading&&filtered.length===0&&(
          <div className="flex flex-col items-center py-16 gap-4 text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <Vote className="w-7 h-7 opacity-30"/>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">No nominations yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Be the first to nominate a coin for listing</p>
            </div>
            <button onClick={()=>setShowNominate(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl active:scale-95 transition-all">
              <Plus className="w-4 h-4"/>Nominate First Coin
            </button>
          </div>
        )}

        {!isLoading&&filtered.map((coin,i)=>(
          <VoteBar key={coin.id} coin={coin} rank={i+1} hasVoted={votedIds.has(coin.id)} onVote={id=>voteMut.mutate(id)}/>
        ))}

        {!isLoading&&filtered.length>0&&(
          <div className="flex items-center justify-center gap-2 py-5 text-[10px] text-muted-foreground/40">
            <Clock className="w-3 h-3"/>Top voted coins are reviewed for listing on OrahDEX
          </div>
        )}
      </div>

      {/* Success toast */}
      {showSuccess&&(
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl shadow-xl animate-in slide-in-from-bottom-4 text-[13px] font-bold">
          <CheckCircle2 className="w-4 h-4"/>Coin nominated! Cast your vote.
        </div>
      )}

      {/* Sheets */}
      {showNominate&&(
        <NominateSheet onClose={()=>setShowNominate(false)} onSuccess={()=>{ setShowNominate(false); setShowSuccess(true); setTimeout(()=>setShowSuccess(false),3000); }}/>
      )}
    </div>
  );
}
