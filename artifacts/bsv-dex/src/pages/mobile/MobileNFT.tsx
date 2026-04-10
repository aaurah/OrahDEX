import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Search, TrendingUp, Grid3X3, List, Star, ShoppingCart, Tag, Gavel, ChevronRight, ArrowLeft, ExternalLink, Filter, Zap, Shield, Image as ImageIcon } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { toast } from "@/hooks/use-toast";

const API = "/api/nft";

const CHAIN_COLORS: Record<string, string> = {
  ETH:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  BSV:  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  BNB:  "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  MATIC:"bg-purple-500/20 text-purple-400 border-purple-500/30",
  SOL:  "bg-green-500/20 text-green-400 border-green-500/30",
  ARB:  "bg-sky-500/20 text-sky-400 border-sky-500/30",
};

const RARITY_COLORS: Record<string, string> = {
  Legendary: "text-yellow-400 bg-yellow-400/10",
  Epic:      "text-purple-400 bg-purple-400/10",
  Rare:      "text-blue-400 bg-blue-400/10",
  Uncommon:  "text-green-400 bg-green-400/10",
  Common:    "text-muted-foreground bg-white/5",
};

const ACTIVITY_ICONS: Record<string, { icon: typeof Tag; color: string }> = {
  sale:     { icon: ShoppingCart, color: "text-green-400" },
  listing:  { icon: Tag,          color: "text-blue-400"  },
  bid:      { icon: Gavel,        color: "text-purple-400" },
  transfer: { icon: Zap,          color: "text-yellow-400" },
};

function ChainBadge({ chain }: { chain: string }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${CHAIN_COLORS[chain] ?? "bg-white/10 text-white/60 border-white/10"}`}>
      {chain}
    </span>
  );
}

function NftImage({ src, alt, className = "" }: { src?: string | null; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (err || !src) {
    return (
      <div className={`flex items-center justify-center bg-white/5 ${className}`}>
        <ImageIcon size={24} className="text-white/20" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={`object-cover ${className}`} onError={() => setErr(true)} />;
}

function shortAddr(addr?: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/* ── Collection Card ──────────────────────────────────────────────────────── */
function CollectionCard({ col, onClick }: { col: any; onClick: () => void }) {
  return (
    <div onClick={onClick} className="bg-[#111] border border-white/8 rounded-2xl overflow-hidden active:scale-95 transition-transform cursor-pointer">
      <div className="relative h-28">
        <NftImage src={col.bannerUrl ?? col.imageUrl} alt={col.name} className="w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-background">
            <NftImage src={col.imageUrl} alt={col.name} className="w-full h-full" />
          </div>
          <div>
            <p className="text-xs font-bold text-white leading-tight flex items-center gap-1">
              {col.name}
              {col.isVerified && <Shield size={10} className="text-green-400" />}
            </p>
            <ChainBadge chain={col.chain} />
          </div>
        </div>
      </div>
      <div className="p-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">Floor</p>
          <p className="text-xs font-bold text-foreground">{parseFloat(col.floorPrice).toFixed(3)} {col.floorCurrency}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">24h Vol</p>
          <p className="text-xs font-bold text-green-400">{parseFloat(col.volume24h).toFixed(1)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Items</p>
          <p className="text-xs font-bold text-foreground">{(col.totalSupply ?? 0).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

/* ── NFT Card ─────────────────────────────────────────────────────────────── */
function NftCard({ nft, listing, onClick }: { nft: any; listing?: any; onClick: () => void }) {
  const rarity = nft.rarity ?? "Common";
  return (
    <div onClick={onClick} className="bg-[#111] border border-white/8 rounded-xl overflow-hidden active:scale-95 transition-transform cursor-pointer">
      <div className="relative aspect-square">
        <NftImage src={nft.imageUrl} alt={nft.name} className="w-full h-full" />
        {nft.rarityRank && (
          <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm rounded-lg px-1.5 py-0.5">
            <p className="text-[9px] font-bold text-yellow-400">#{nft.rarityRank}</p>
          </div>
        )}
        <div className="absolute bottom-1.5 left-1.5">
          <ChainBadge chain={nft.chain} />
        </div>
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-foreground truncate">{nft.name}</p>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${RARITY_COLORS[rarity] ?? RARITY_COLORS.Common}`}>
          {rarity}
        </span>
        {listing ? (
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-xs font-bold text-green-400">{parseFloat(listing.price).toFixed(3)} {listing.currency}</p>
            <button className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-bold">
              Buy
            </button>
          </div>
        ) : nft.lastSalePrice ? (
          <p className="text-[10px] text-muted-foreground mt-1">Last: {parseFloat(nft.lastSalePrice).toFixed(3)} {nft.lastSaleCurrency}</p>
        ) : null}
      </div>
    </div>
  );
}

/* ── Activity Row ─────────────────────────────────────────────────────────── */
function ActivityRow({ act, collections }: { act: any; collections: any[] }) {
  const meta = ACTIVITY_ICONS[act.type] ?? ACTIVITY_ICONS.listing;
  const Icon = meta.icon;
  const col = collections.find(c => c.id === act.collectionId);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
        <Icon size={14} className={meta.color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground capitalize">{act.type}</p>
        <p className="text-[10px] text-muted-foreground truncate">{col?.name ?? act.collectionId} · {shortAddr(act.fromAddress)}</p>
      </div>
      {act.price && (
        <div className="text-right">
          <p className="text-xs font-bold text-foreground">{parseFloat(act.price).toFixed(3)}</p>
          <p className="text-[10px] text-muted-foreground">{act.currency}</p>
        </div>
      )}
    </div>
  );
}

/* ── NFT Detail Sheet ─────────────────────────────────────────────────────── */
function NftDetail({ nftId, onBack }: { nftId: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"details"|"bids"|"activity">("details");
  const [bidAmount, setBidAmount] = useState("");
  const { address } = useWalletStore();

  useEffect(() => {
    fetch(`${API}/items/${nftId}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [nftId]);

  const handleBuy = async (listing: any) => {
    if (!address) { toast({ title: "Connect wallet first" }); return; }
    toast({ title: "Purchase submitted", description: `Buying ${data?.nft?.name} for ${listing.price} ${listing.currency}` });
  };

  const handleBid = async () => {
    if (!address) { toast({ title: "Connect wallet first" }); return; }
    if (!bidAmount || isNaN(parseFloat(bidAmount))) { toast({ title: "Enter a valid bid amount" }); return; }
    await fetch(`${API}/bids`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nftId, collectionId: data?.nft?.collectionId, bidder: address, chain: data?.nft?.chain, price: bidAmount, currency: data?.collection?.floorCurrency ?? "ETH" }),
    });
    toast({ title: "Bid placed", description: `${bidAmount} ${data?.collection?.floorCurrency ?? "ETH"}` });
    setBidAmount("");
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data?.nft) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <ImageIcon size={40} className="text-white/20" />
      <p className="text-sm text-muted-foreground">NFT not found</p>
      <button onClick={onBack} className="text-sm text-green-400">Go back</button>
    </div>
  );

  const { nft, collection, listings, bids, activity } = data;
  const traits = (() => { try { return JSON.parse(nft.traits ?? "[]"); } catch { return []; } })();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-3 p-4 pt-6">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{nft.name}</p>
          <p className="text-xs text-muted-foreground">{collection?.name}</p>
        </div>
        <ChainBadge chain={nft.chain} />
      </div>

      <div className="mx-4 rounded-2xl overflow-hidden aspect-square">
        <NftImage src={nft.imageUrl} alt={nft.name} className="w-full h-full" />
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xl font-bold">{nft.name}</p>
            {nft.rarity && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${RARITY_COLORS[nft.rarity] ?? RARITY_COLORS.Common}`}>
                {nft.rarity} {nft.rarityRank ? `· Rank #${nft.rarityRank}` : ""}
              </span>
            )}
          </div>
          {listings.length > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Price</p>
              <p className="text-lg font-bold text-green-400">{parseFloat(listings[0].price).toFixed(3)}</p>
              <p className="text-xs text-muted-foreground">{listings[0].currency}</p>
            </div>
          )}
        </div>

        {listings.length > 0 && (
          <button
            onClick={() => handleBuy(listings[0])}
            className="w-full py-3 bg-green-500 text-black font-bold rounded-xl text-sm active:scale-95 transition-transform"
          >
            Buy Now · {parseFloat(listings[0].price).toFixed(3)} {listings[0].currency}
          </button>
        )}

        <div className="bg-white/5 rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-2">Place a Bid</p>
          <div className="flex gap-2">
            <input
              type="number"
              value={bidAmount}
              onChange={e => setBidAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-white/20"
            />
            <span className="text-xs text-muted-foreground self-center">{collection?.floorCurrency ?? "ETH"}</span>
            <button onClick={handleBid} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-bold">
              Bid
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-white/10">
          {(["details","bids","activity"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-semibold capitalize transition-colors ${tab === t ? "text-green-400 border-b-2 border-green-400" : "text-muted-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "details" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {traits.map((tr: any, i: number) => (
                <div key={i} className="bg-white/5 rounded-xl p-2.5 text-center border border-white/5">
                  <p className="text-[10px] text-muted-foreground">{tr.trait_type}</p>
                  <p className="text-xs font-bold text-foreground">{tr.value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white/5 rounded-xl p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Owner</p>
              <p className="text-xs font-mono text-foreground">{shortAddr(nft.owner)}</p>
              {nft.description && <p className="text-xs text-muted-foreground leading-relaxed">{nft.description}</p>}
            </div>
          </div>
        )}

        {tab === "bids" && (
          <div className="space-y-2">
            {bids.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No bids yet</p>
            ) : bids.map((bid: any) => (
              <div key={bid.id} className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                <div>
                  <p className="text-xs font-semibold">{shortAddr(bid.bidder)}</p>
                  <p className="text-[10px] text-muted-foreground">Bidder</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-purple-400">{parseFloat(bid.price).toFixed(4)}</p>
                  <p className="text-[10px] text-muted-foreground">{bid.currency}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "activity" && (
          <div className="divide-y divide-white/5">
            {activity.map((act: any) => (
              <ActivityRow key={act.id} act={act} collections={collection ? [collection] : []} />
            ))}
            {activity.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No activity yet</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Collection Detail ────────────────────────────────────────────────────── */
function CollectionDetail({ slug, onBack, onNftClick }: { slug: string; onBack: () => void; onNftClick: (id: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"items"|"activity">("items");

  useEffect(() => {
    fetch(`${API}/collections/${slug}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data?.collection) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <p className="text-sm text-muted-foreground">Collection not found</p>
      <button onClick={onBack} className="text-sm text-green-400">Go back</button>
    </div>
  );

  const { collection: col, nfts, listings, activity } = data;
  const listingMap: Record<string, any> = {};
  listings.forEach((l: any) => { listingMap[l.nftId] = l; });

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="relative h-36">
        <NftImage src={col.bannerUrl ?? col.imageUrl} alt={col.name} className="w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <button onClick={onBack} className="absolute top-12 left-4 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <ArrowLeft size={16} />
        </button>
      </div>

      <div className="px-4 -mt-8 flex items-end gap-3 mb-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden border-4 border-background shadow-xl">
          <NftImage src={col.imageUrl} alt={col.name} className="w-full h-full" />
        </div>
        <div className="pb-1">
          <p className="text-lg font-bold flex items-center gap-1">
            {col.name}
            {col.isVerified && <Shield size={14} className="text-green-400" />}
          </p>
          <ChainBadge chain={col.chain} />
        </div>
      </div>

      <div className="px-4 grid grid-cols-4 gap-2 mb-4">
        {[
          { label: "Floor", val: `${parseFloat(col.floorPrice).toFixed(3)} ${col.floorCurrency}` },
          { label: "24h Vol", val: parseFloat(col.volume24h).toFixed(1) },
          { label: "Items", val: (col.totalSupply ?? 0).toLocaleString() },
          { label: "Owners", val: (col.holders ?? 0).toLocaleString() },
        ].map(s => (
          <div key={s.label} className="bg-white/5 rounded-xl p-2 text-center">
            <p className="text-[9px] text-muted-foreground">{s.label}</p>
            <p className="text-xs font-bold text-foreground">{s.val}</p>
          </div>
        ))}
      </div>

      {col.description && (
        <p className="px-4 text-xs text-muted-foreground mb-4 leading-relaxed">{col.description}</p>
      )}

      <div className="px-4 flex gap-1 border-b border-white/10 mb-4">
        {(["items","activity"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-semibold capitalize ${tab === t ? "text-green-400 border-b-2 border-green-400" : "text-muted-foreground"}`}>
            {t === "items" ? `Items (${nfts.length})` : "Activity"}
          </button>
        ))}
      </div>

      {tab === "items" && (
        <div className="px-4 grid grid-cols-2 gap-3 pb-8">
          {nfts.map((nft: any) => (
            <NftCard key={nft.id} nft={nft} listing={listingMap[nft.id]} onClick={() => onNftClick(nft.id)} />
          ))}
        </div>
      )}

      {tab === "activity" && (
        <div className="px-4 pb-8 divide-y divide-white/5">
          {activity.map((act: any) => (
            <ActivityRow key={act.id} act={act} collections={[col]} />
          ))}
          {activity.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No activity yet</p>}
        </div>
      )}
    </div>
  );
}

/* ── Main NFT Page ─────────────────────────────────────────────────────────── */
export function MobileNFT() {
  const [tab, setTab] = useState<"browse"|"trending"|"activity">("browse");
  const [search, setSearch] = useState("");
  const [chainFilter, setChainFilter] = useState<string>("");
  const [collections, setCollections] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<{ type: "collection"; slug: string } | { type: "nft"; id: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (chainFilter) params.set("chain", chainFilter);
    if (search)      params.set("q", search);

    Promise.all([
      fetch(`${API}/collections?${params}`).then(r => r.json()),
      fetch(`${API}/activity`).then(r => r.json()),
    ]).then(([colData, actData]) => {
      setCollections(colData.collections ?? []);
      setActivity(actData.activity ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [chainFilter, search]);

  if (view?.type === "nft") {
    return <NftDetail nftId={view.id} onBack={() => setView(null)} />;
  }

  if (view?.type === "collection") {
    return (
      <CollectionDetail
        slug={view.slug}
        onBack={() => setView(null)}
        onNftClick={(id) => setView({ type: "nft", id })}
      />
    );
  }

  const CHAINS = ["", "ETH", "BSV", "BNB", "MATIC", "SOL", "ARB"];

  const trending = [...collections].sort((a, b) => parseFloat(b.volume24h) - parseFloat(a.volume24h)).slice(0, 5);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">NFT Market</h1>
            <p className="text-xs text-muted-foreground">Multi-chain · {collections.length} collections</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <ImageIcon size={16} className="text-green-400" />
          </div>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search collections…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none placeholder:text-white/30 focus:border-green-500/40"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {CHAINS.map(ch => (
            <button
              key={ch || "all"}
              onClick={() => setChainFilter(ch)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                chainFilter === ch
                  ? "bg-green-500 text-black border-green-500"
                  : "bg-white/5 text-muted-foreground border-white/10"
              }`}
            >
              {ch || "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 flex gap-1 border-b border-white/10 mb-4">
        {(["browse","trending","activity"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-semibold capitalize ${tab === t ? "text-green-400 border-b-2 border-green-400" : "text-muted-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === "browse" ? (
          <>
            {collections.length === 0 ? (
              <div className="text-center py-16">
                <ImageIcon size={40} className="text-white/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No collections found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {collections.map(col => (
                  <CollectionCard key={col.id} col={col} onClick={() => setView({ type: "collection", slug: col.slug })} />
                ))}
              </div>
            )}
          </>
        ) : tab === "trending" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Top by 24h Volume</p>
            {trending.map((col, i) => (
              <div
                key={col.id}
                onClick={() => setView({ type: "collection", slug: col.slug })}
                className="flex items-center gap-3 bg-[#111] border border-white/8 rounded-xl p-3 active:scale-95 transition-transform cursor-pointer"
              >
                <span className="text-sm font-bold text-muted-foreground w-5">{i + 1}</span>
                <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                  <NftImage src={col.imageUrl} alt={col.name} className="w-full h-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate flex items-center gap-1">
                    {col.name}
                    {col.isVerified && <Shield size={10} className="text-green-400" />}
                  </p>
                  <div className="flex items-center gap-2">
                    <ChainBadge chain={col.chain} />
                    <span className="text-[10px] text-muted-foreground">Floor {parseFloat(col.floorPrice).toFixed(3)} {col.floorCurrency}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-400">{parseFloat(col.volume24h).toFixed(1)}</p>
                  <p className="text-[10px] text-muted-foreground">24h vol</p>
                </div>
                <ChevronRight size={14} className="text-white/20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">Recent Activity</p>
            {activity.map(act => (
              <ActivityRow key={act.id} act={act} collections={collections} />
            ))}
            {activity.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No activity yet</p>}
          </div>
        )}
      </div>
    </div>
  );
}
