import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, ArrowLeft, Search, X, Flame, Clock, BarChart2, ExternalLink, ChevronRight } from "lucide-react";
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
    name: string;
    address: string;
    base_token_price_usd: string;
    quote_token_price_usd: string;
    price_change_percentage?: { h24?: number | string | null; h6?: number | string | null; h1?: number | string | null };
    volume_usd?: { h24?: number | string | null; h6?: number | string | null; h1?: number | string | null };
    reserve_in_usd?: string;
    pool_created_at?: string;
    transactions?: { h24?: { buys: number; sells: number } };
    market_cap_usd?: string;
    fdv_usd?: string;
  };
  relationships?: {
    base_token?: { data?: { id: string } };
    quote_token?: { data?: { id: string } };
    network?: { data?: { id: string } };
    dex?: { data?: { id: string } };
  };
}

interface Included {
  type: string;
  id: string;
  attributes: { name: string; symbol: string; address: string; image_url?: string };
}

/* ─── Layer grouping ────────────────────────────────────────────────────── */
type LayerGroup = "trending" | "l2" | "l1evm" | "l1other" | "other";

const LAYER_GROUPS: { id: LayerGroup; label: string; emoji: string; color: string }[] = [
  { id: "trending", label: "Trending",   emoji: "🔥", color: "text-orange-400" },
  { id: "l2",       label: "Layer 2",    emoji: "⚡", color: "text-blue-400" },
  { id: "l1evm",    label: "L1 · EVM",  emoji: "🔷", color: "text-purple-400" },
  { id: "l1other",  label: "L1 · Other", emoji: "🌐", color: "text-green-400" },
  { id: "other",    label: "More Chains", emoji: "⬡", color: "text-gray-400" },
];

const L2_IDS = new Set([
  "base","arbitrum","optimism","polygon_pos","zksync","linea","scroll",
  "mantle","polygon-zkevm","starknet-alpha","manta-pacific","mode","opbnb",
  "arbitrum_nova","blast-sepolia-testnet","metis","boba","aurora","rollux",
  "neon-evm","shibarium","scroll","canto","merlin-chain","zkfair",
  "defimetachain","lightlink-phoenix","beam","shimmerevm",
]);

const L1_EVM_IDS = new Set([
  "eth","bsc","avax","ftm","cro","one","kcc","iotx","celo","xdai","glmr",
  "movr","evmos","cfx","bttc","xdc","kaia","kava","bitgert","tombchain",
  "dogechain","thundercore","ethereum_classic","ethw","godwoken","tomochain",
  "oasys","bitkub_chain","wemix","flare","core","filecoin","eos-evm",
  "ultron","pulsechain","enuls","tenet","zetachain","oasis-sapphire","xai",
  "hedera-hashgraph","humanode","alveychain","nrg","wan","ronin","kai",
  "mtr","velas","sdn","tlos","astr","ela","dfk","fuse","step-network",
  "exosama","platon_network","findora","kcc","sxn","multivac","loopnetwork",
  "mxc-zkevm","elysium","mode","zkfair",
]);

const L1_OTHER_IDS = new Set([
  "solana","aptos","sui-network","ton","sei-network","bch",
]);

function getLayer(networkId: string): LayerGroup {
  if (L2_IDS.has(networkId))     return "l2";
  if (L1_EVM_IDS.has(networkId)) return "l1evm";
  if (L1_OTHER_IDS.has(networkId)) return "l1other";
  return "other";
}

/* ─── Network emoji/icon map ─────────────────────────────────────────────── */
const NET_EMOJI: Record<string, string> = {
  eth: "Ξ", bsc: "B", solana: "◎", avax: "A", base: "⬡", arbitrum: "↗",
  optimism: "○", polygon_pos: "M", ftm: "F", cro: "C", zksync: "↗",
  linea: "L", scroll: "S", mantle: "M", ton: "T", aptos: "A", sui: "S",
  sei: "S", one: "H",
};

const NET_COLOR: Record<string, string> = {
  eth: "bg-blue-600", bsc: "bg-yellow-500", solana: "bg-purple-600",
  avax: "bg-red-600", base: "bg-blue-500", arbitrum: "bg-blue-700",
  optimism: "bg-red-500", polygon_pos: "bg-purple-500", ftm: "bg-blue-400",
  cro: "bg-indigo-600", zksync: "bg-blue-600", linea: "bg-gray-700",
  scroll: "bg-amber-600", mantle: "bg-emerald-700", ton: "bg-sky-600",
  aptos: "bg-teal-600", "sui-network": "bg-cyan-600", "sei-network": "bg-red-700",
  one: "bg-cyan-700", bch: "bg-green-600",
};

function NetBadge({ id, name }: { id: string; name: string }) {
  const letter = NET_EMOJI[id] ?? name.slice(0, 2).toUpperCase();
  const color   = NET_COLOR[id]  ?? "bg-gray-600";
  return (
    <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0", color)}>
      {letter}
    </span>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtUsd(s: string | number | null | undefined, prefix = true): string {
  const n = typeof s === "string" ? parseFloat(s) : (s ?? NaN);
  if (!isFinite(n) || n === 0) return "—";
  const p = prefix ? "$" : "";
  if (n >= 1_000_000_000) return `${p}${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `${p}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${p}${(n / 1_000).toFixed(1)}K`;
  if (n >= 1)             return `${p}${n.toFixed(2)}`;
  if (n >= 0.001)         return `${p}${n.toFixed(5)}`;
  return `${p}${n.toExponential(2)}`;
}

function fmtChg(chg: number | string | null | undefined): { text: string; up: boolean } {
  const n = chg == null ? NaN : typeof chg === "string" ? parseFloat(chg) : chg;
  if (!isFinite(n)) return { text: "—", up: true };
  return { text: `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`, up: n >= 0 };
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (h < 1)  return "<1h";
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function resolveToken(pool: Pool, side: "base" | "quote", included: Included[]) {
  const rel = pool.relationships?.[side === "base" ? "base_token" : "quote_token"]?.data?.id;
  return included.find(i => i.id === rel);
}

/* ─── Pool row ───────────────────────────────────────────────────────────── */
function PoolRow({
  pool, included, showNetwork, networkId,
}: {
  pool: Pool;
  included: Included[];
  showNetwork?: boolean;
  networkId?: string;
}) {
  const base  = resolveToken(pool, "base", included);
  const quote = resolveToken(pool, "quote", included);
  const dexId = pool.relationships?.dex?.data?.id ?? "";
  const netId = pool.relationships?.network?.data?.id ?? networkId ?? "";

  const baseSym  = base?.attributes.symbol  ?? pool.attributes.name.split(" / ")[0] ?? "?";
  const quoteSym = quote?.attributes.symbol ?? pool.attributes.name.split(" / ")[1] ?? "?";

  const priceUsd = pool.attributes.base_token_price_usd;
  const vol24h   = pool.attributes.volume_usd?.h24;
  const chg24h   = pool.attributes.price_change_percentage?.h24;
  const liq      = pool.attributes.reserve_in_usd;
  const { text: chgText, up } = fmtChg(chg24h);

  const colors = ["bg-blue-500","bg-purple-500","bg-green-500","bg-red-500","bg-yellow-500","bg-orange-500","bg-pink-500","bg-teal-500"];
  const clr = colors[baseSym.charCodeAt(0) % colors.length];

  const netBadgeColor = NET_COLOR[netId] ?? "bg-gray-600";
  const netLabel = netId ? netId.slice(0, 3).toUpperCase() : "";

  const openPool = () => {
    const addr = pool.attributes.address;
    if (addr) window.open(`https://www.geckoterminal.com/${netId}/pools/${addr}`, "_blank", "noopener");
  };

  return (
    <button onClick={openPool} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40 active:bg-secondary/60 transition-colors text-left">
      {/* Token logo */}
      <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[12px] shrink-0", clr)}>
        {baseSym.slice(0, 2)}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-sm text-foreground">{baseSym}</span>
          <span className="text-xs text-muted-foreground">/{quoteSym}</span>
          {dexId && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
              {dexId.slice(0, 8)}
            </span>
          )}
          {showNetwork && netId && (
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded text-white font-bold", netBadgeColor)}>
              {netLabel}
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
          {liq ? `Liq ${fmtUsd(liq)}` : ""}
          {pool.attributes.pool_created_at && (
            <span className="ml-1.5 text-blue-400/70">{timeAgo(pool.attributes.pool_created_at)}</span>
          )}
        </div>
      </div>

      {/* Price + change */}
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-foreground">{fmtUsd(priceUsd)}</div>
        <div className={cn("text-[11px] font-medium mt-0.5", up ? "text-green-400" : "text-red-400")}>
          {chgText}
        </div>
      </div>

      {/* 24h volume */}
      <div className="text-right shrink-0 min-w-[52px]">
        <div className="text-[11px] text-muted-foreground">{fmtUsd(vol24h)}</div>
        <div className="text-[10px] text-muted-foreground/50 mt-0.5">vol</div>
      </div>
    </button>
  );
}

/* ─── Network card ───────────────────────────────────────────────────────── */
function NetworkCard({ net, onClick }: { net: Network; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-secondary/40 hover:bg-secondary active:bg-secondary/70 transition-colors min-w-[80px]"
    >
      <NetBadge id={net.id} name={net.attributes.name} />
      <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[72px] truncate">
        {net.attributes.name}
      </span>
    </button>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-secondary shrink-0" />
          <div className="flex-1">
            <div className="h-3.5 bg-secondary rounded w-28 mb-1.5" />
            <div className="h-2.5 bg-secondary/60 rounded w-20" />
          </div>
          <div className="text-right shrink-0">
            <div className="h-3.5 bg-secondary rounded w-16 mb-1.5" />
            <div className="h-2.5 bg-secondary/60 rounded w-10 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Pool sort tabs ────────────────────────────────────────────────────── */
type PoolSort = "volume" | "new";

/* ─── Main component ─────────────────────────────────────────────────────── */
export function MobileNetworksExplorer() {
  const [activeLayer, setActiveLayer] = useState<LayerGroup>("trending");
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null);
  const [poolSort, setPoolSort] = useState<PoolSort>("volume");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const debounce = useCallback((val: string) => {
    setSearch(val);
    clearTimeout((debounce as any)._t);
    (debounce as any)._t = setTimeout(() => setDebouncedSearch(val), 400);
  }, []);

  /* ── Data fetching ─────────────────────────────────────────────────────── */
  const { data: networksData, isLoading: loadingNets } = useQuery({
    queryKey: ["gt", "networks"],
    queryFn: () => fetch(`${API}/api/gt/networks`).then(r => r.json()) as Promise<{ networks: Network[] }>,
    staleTime: 600_000,
  });

  const { data: trendingData, isLoading: loadingTrending } = useQuery({
    queryKey: ["gt", "trending"],
    queryFn: () => fetch(`${API}/api/gt/trending`).then(r => r.json()),
    staleTime: 120_000,
    refetchInterval: 120_000,
    enabled: activeLayer === "trending" && !selectedNetwork,
  });

  const { data: networkVolData, isLoading: loadingNetVol } = useQuery({
    queryKey: ["gt", "net-pools", selectedNetwork?.id],
    queryFn: () => fetch(`${API}/api/gt/networks/${selectedNetwork!.id}/pools`).then(r => r.json()),
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: !!selectedNetwork && poolSort === "volume",
  });

  const { data: networkNewData, isLoading: loadingNetNew } = useQuery({
    queryKey: ["gt", "net-new", selectedNetwork?.id],
    queryFn: () => fetch(`${API}/api/gt/networks/${selectedNetwork!.id}/new-pools`).then(r => r.json()),
    staleTime: 90_000,
    enabled: !!selectedNetwork && poolSort === "new",
  });

  const { data: searchData, isLoading: loadingSearch } = useQuery({
    queryKey: ["gt", "search", debouncedSearch],
    queryFn: () => fetch(`${API}/api/gt/search?q=${encodeURIComponent(debouncedSearch)}`).then(r => r.json()),
    staleTime: 30_000,
    enabled: debouncedSearch.length > 1,
  });

  /* ── Derived data ─────────────────────────────────────────────────────── */
  const allNetworks: Network[] = networksData?.networks ?? [];
  const filteredNetworks = allNetworks.filter(n => getLayer(n.id) === activeLayer);

  const trendingPools: Pool[]   = trendingData?.data ?? [];
  const trendingIncl: Included[] = trendingData?.included ?? [];

  const netPools: Pool[] = (poolSort === "volume"
    ? networkVolData?.data : networkNewData?.data) ?? [];
  const netIncl: Included[] = (poolSort === "volume"
    ? networkVolData?.included : networkNewData?.included) ?? [];

  const searchPools: Pool[]   = searchData?.data ?? [];
  const searchIncl: Included[] = searchData?.included ?? [];

  const isSearching = search.length > 0;
  const netLoading = poolSort === "volume" ? loadingNetVol : loadingNetNew;

  /* ─── Network list by layer ─────────────────────────────────────────── */
  function NetworkGrid() {
    if (activeLayer === "trending") return null;
    if (loadingNets) return <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar"><Skeleton rows={1} /></div>;
    if (filteredNetworks.length === 0) return <div className="px-4 py-4 text-sm text-muted-foreground">No networks in this layer</div>;
    return (
      <div className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {filteredNetworks.map(net => (
            <NetworkCard key={net.id} net={net} onClick={() => setSelectedNetwork(net)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── GeckoTerminal banner ── */}
      <div className="mx-4 mt-2 mb-1 flex items-center gap-3 px-3 py-2.5 bg-green-500/10 border border-green-500/25 rounded-xl shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-green-400 leading-tight">All Chains · Live Pool Data</p>
          <p className="text-[10px] text-green-300/60 leading-tight mt-0.5">
            {allNetworks.length > 0 ? `${allNetworks.length} networks` : "100+ networks"} · Powered by GeckoTerminal
          </p>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="mx-4 mb-2 flex items-center gap-2 bg-secondary/60 border border-border/60 rounded-xl px-3 h-9 shrink-0">
        <Search size={13} className="text-muted-foreground shrink-0" />
        <input
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 outline-none"
          placeholder="Search token or pool address…"
          value={search}
          onChange={e => debounce(e.target.value)}
        />
        {search && <button onClick={() => { setSearch(""); setDebouncedSearch(""); }}><X size={13} className="text-muted-foreground" /></button>}
      </div>

      {isSearching ? (
        /* ── SEARCH RESULTS ── */
        <div className="flex-1 overflow-y-auto">
          {/* Column headers */}
          <div className="flex items-center px-4 py-1.5 text-[10px] text-muted-foreground/60 font-medium border-b border-border/20">
            <div className="w-9 mr-3 shrink-0" />
            <div className="flex-1">TOKEN</div>
            <div className="text-right w-20 mr-3">PRICE</div>
            <div className="text-right w-14">VOLUME</div>
          </div>
          {loadingSearch ? <Skeleton /> : searchPools.length === 0 && debouncedSearch ? (
            <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
              <Search className="w-8 h-8 opacity-30" />
              <p className="text-sm">No results for "{debouncedSearch}"</p>
            </div>
          ) : (
            searchPools.map(p => <PoolRow key={p.id} pool={p} included={searchIncl} showNetwork />)
          )}
        </div>
      ) : selectedNetwork ? (
        /* ── NETWORK DETAIL VIEW ── */
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Back + network name header */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border/30 shrink-0 bg-background">
            <button onClick={() => setSelectedNetwork(null)} className="text-muted-foreground active:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <NetBadge id={selectedNetwork.id} name={selectedNetwork.attributes.name} />
            <div>
              <p className="text-sm font-bold text-foreground">{selectedNetwork.attributes.name}</p>
              <p className="text-[10px] text-muted-foreground">{selectedNetwork.id}</p>
            </div>
            <a
              href={`https://www.geckoterminal.com/${selectedNetwork.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-muted-foreground active:text-foreground"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Sort tabs */}
          <div className="flex items-center gap-1 px-4 py-2 shrink-0">
            {([
              { id: "volume" as PoolSort, label: "Top Volume", icon: <BarChart2 className="w-3 h-3" /> },
              { id: "new"    as PoolSort, label: "Newest",     icon: <Clock className="w-3 h-3" /> },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setPoolSort(t.id)}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors",
                  poolSort === t.id
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Column headers */}
          <div className="flex items-center px-4 py-1.5 text-[10px] text-muted-foreground/60 font-medium border-b border-border/20 shrink-0">
            <div className="w-9 mr-3 shrink-0" />
            <div className="flex-1">TOKEN</div>
            <div className="text-right w-20 mr-3">PRICE</div>
            <div className="text-right w-14">VOLUME</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {netLoading ? <Skeleton /> : netPools.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
                <BarChart2 className="w-8 h-8 opacity-30" />
                <p className="text-sm">No pools found</p>
              </div>
            ) : (
              <>
                {netPools.map(p => <PoolRow key={p.id} pool={p} included={netIncl} networkId={selectedNetwork.id} />)}
                <div className="flex items-center justify-center gap-1.5 py-4 text-[10px] text-muted-foreground/40">
                  <ExternalLink className="w-3 h-3" />
                  Tap any pool to view on GeckoTerminal
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ── LAYER BROWSER VIEW ── */
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Layer group pills */}
          <div className="flex items-center gap-0 px-4 pt-1 shrink-0 overflow-x-auto no-scrollbar">
            {LAYER_GROUPS.map(g => (
              <button
                key={g.id}
                onClick={() => setActiveLayer(g.id)}
                className={cn(
                  "flex items-center gap-1 px-3 py-2 text-[12px] font-medium rounded-lg mr-1 whitespace-nowrap transition-colors shrink-0",
                  activeLayer === g.id
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
              >
                <span>{g.emoji}</span>
                {g.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeLayer === "trending" ? (
              /* ── TRENDING ACROSS ALL CHAINS ── */
              <>
                <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-bold text-foreground">Trending Pools</span>
                  <span className="text-[10px] text-muted-foreground/60 ml-1">· all networks</span>
                </div>
                {/* Column headers */}
                <div className="flex items-center px-4 py-1.5 text-[10px] text-muted-foreground/60 font-medium border-b border-border/20">
                  <div className="w-9 mr-3 shrink-0" />
                  <div className="flex-1">TOKEN</div>
                  <div className="text-right w-20 mr-3">PRICE</div>
                  <div className="text-right w-14">VOLUME</div>
                </div>
                {loadingTrending ? <Skeleton /> : trendingPools.length === 0 ? (
                  <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
                    <Flame className="w-8 h-8 opacity-30" />
                    <p className="text-sm">No trending data</p>
                  </div>
                ) : (
                  <>
                    {trendingPools.map(p => <PoolRow key={p.id} pool={p} included={trendingIncl} showNetwork />)}
                    <div className="flex items-center justify-center gap-1.5 py-4 text-[10px] text-muted-foreground/40">
                      <ExternalLink className="w-3 h-3" />
                      Data from GeckoTerminal
                    </div>
                  </>
                )}
              </>
            ) : (
              /* ── LAYER NETWORK GRID ── */
              <>
                <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                  <span className="text-sm font-bold text-foreground">
                    {LAYER_GROUPS.find(g => g.id === activeLayer)?.emoji}{" "}
                    {LAYER_GROUPS.find(g => g.id === activeLayer)?.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 ml-1">
                    — {filteredNetworks.length} network{filteredNetworks.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {loadingNets ? (
                  <div className="flex flex-wrap gap-2 px-4 py-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="w-[80px] h-[76px] rounded-xl bg-secondary animate-pulse" />
                    ))}
                  </div>
                ) : filteredNetworks.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-muted-foreground text-center">
                    No networks in this layer
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 px-4 py-3">
                    {filteredNetworks.map(net => (
                      <NetworkCard key={net.id} net={net} onClick={() => setSelectedNetwork(net)} />
                    ))}
                  </div>
                )}

                {/* Hint */}
                {filteredNetworks.length > 0 && (
                  <div className="flex items-center justify-center gap-1.5 pb-4 text-[10px] text-muted-foreground/40">
                    <ChevronRight className="w-3 h-3" />
                    Tap a network to see its live pools
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
