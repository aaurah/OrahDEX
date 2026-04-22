import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Heart, MessageCircle, Share2, Zap, BadgeCheck, Search,
  TrendingUp, PlusSquare, User, ChevronLeft, X, Upload,
  Flame, Clock, Star, Lock, Layers, Copy, Send, Globe,
  AtSign, Camera, ArrowUpRight, ArrowDownRight,
  UserPlus, UserCheck, BarChart2, Grid3X3, Activity,
  ShoppingBag, Settings, ChevronRight, RefreshCw, Sparkles, ExternalLink, Edit3, Link, ImageIcon,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { useBsvBalance } from "@/hooks/useBsvBalance";
import { resolveNftSpendBalance } from "@/lib/nftBalance";
import { useLocation } from "wouter";

const API = "/api";

function Portal({ children }: { children: React.ReactNode }) {
  const target = typeof document !== "undefined"
    ? (document.getElementById("modal-root") ?? document.body)
    : null;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!target) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "auto", display: "flex", flexDirection: "column" }}>
      {children}
    </div>,
    target
  );
}

interface Post {
  id: string; creator: string; creator_name: string; creator_avatar: string;
  title: string; description: string; image_url: string; category: string;
  chain: string; mint_price: string; mint_currency: string; mint_price_usd: string;
  mint_count: number; max_supply: number | null; like_count: number;
  comment_count: number; is_verified: boolean; tags: string;
  inscription_id: string; created_at: string;
}
interface Comment {
  id: string; wallet_address: string; display_name: string;
  content: string; created_at: string;
}
interface Creator {
  address: string; username: string; bio: string; avatar_url: string;
  cover_url: string; website: string; twitter: string; instagram: string;
  is_verified: boolean; follower_count: number; following_count: number;
  post_count: number; symbol: string; coin_name: string;
  price_usd: number; market_cap_usd: number; ath_usd: number;
  volume_24h_usd: number; holder_count: number; circulating_supply: number;
  total_supply: number; virtual_bsv: number; virtual_tokens: number;
  price_bsv: number; trade_count: number;
}
interface Holding { coin_creator: string; holder: string; amount: number; username: string; symbol: string; price_usd: number; market_cap_usd: number; }

function shortAddr(a: string) { return a?.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : (a ?? "—"); }
function isAddressLike(value: string) {
  const v = value.trim();
  if (!v) return false;
  if (v.includes("…")) return true;
  if (v.startsWith("0x")) return true;
  return /^[A-Za-z0-9]{24,}$/.test(v);
}
function commentHandle(comment: Comment) {
  const displayName = comment.display_name?.trim();
  if (displayName && !isAddressLike(displayName)) return displayName;
  return "user";
}
function fmtNum(raw: unknown) {
  const n = Number(raw);
  if (!n || !isFinite(n)) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}
function fmtUsd(raw: unknown) {
  const n = Number(raw);
  if (!n || !isFinite(n)) return "$0";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n < 0.001) return `$${n.toFixed(8)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function safePrice(v: unknown, decimals = 4) {
  const n = Number(v);
  return isFinite(n) ? n.toFixed(decimals) : "0.0000";
}
function getNftProfileAddress({
  address,
  provider,
  network,
  internalEvmAddress,
}: {
  address: string | null;
  provider: string | null;
  network: string | null;
  internalEvmAddress: string | null;
}) {
  if (!address) return null;
  if (provider === "orah-wallet" && internalEvmAddress) return internalEvmAddress;
  return address;
}
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`;
}

const CATEGORIES = ["all", "art", "generative", "relics", "utility", "governance", "bridge", "ai"];
const CAT_ICONS: Record<string, string> = {
  all: "🌐", art: "🎨", generative: "⚡", relics: "🏛️",
  utility: "🔧", governance: "🗳️", bridge: "🌉", ai: "🤖",
};
const CHAINS = ["BSV", "ETH", "BNB", "SOL", "MATIC"];
const CHAIN_COLOR: Record<string, string> = { BSV: "#00ff88", ETH: "#7b68ee", BNB: "#f3ba2f", SOL: "#9945ff", MATIC: "#8247e5" };
const HIGH_PRICE_IMPACT_THRESHOLD_PERCENT = 3;

function Avatar({ src, name, size = 36, ring }: { src?: string; name?: string; size?: number; ring?: boolean }) {
  const [err, setErr] = useState(false);
  const fallback = (
    <div style={{
      width: size, height: size,
      background: ring ? "transparent" : "linear-gradient(135deg,#00ff88,#00aaff)",
      borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.4, color: "#000", flexShrink: 0,
    }}>
      {ring ? (
        <div style={{
          width: size - 6, height: size - 6, borderRadius: "50%",
          background: "linear-gradient(135deg,#00ff88,#00aaff)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#000", fontWeight: 700, fontSize: (size - 6) * 0.4,
        }}>{name?.[0]?.toUpperCase() ?? "?"}</div>
      ) : name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
  if (err || !src) return fallback;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      ...(ring ? { padding: 3, background: "linear-gradient(135deg,#00ff88,#00aaff)", boxSizing: "border-box" as const } : {}) }}>
      <img src={src} alt={name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
    </div>
  );
}

function SupplyBar({ minted, max }: { minted: number; max: number | null }) {
  if (!max) return null;
  const pct = Math.min((minted / max) * 100, 100);
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] mb-0.5 text-muted-foreground">
        <span>{fmtNum(minted)} minted</span>
        <span>{max - minted > 0 ? `${max - minted} left` : "SOLD OUT"}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden bg-muted/30">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 95 ? "#ff4444" : pct >= 70 ? "#ffaa00" : "#00ff88" }} />
      </div>
    </div>
  );
}

function TradeSheet({ creator, onClose }: { creator: Creator; onClose: () => void }) {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [bsvAmount, setBsvAmount] = useState("0.01");
  const [tokenAmount, setTokenAmount] = useState("1000000");
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [error, setError] = useState("");
  const { address, network, chainId, balance: storeBalance, provider } = useWalletStore();
  const isEvm = !address || network === "evm" || (!!address && address.startsWith("0x"));
  const isOrahWallet = provider === "orah-wallet";

  useBsvBalance();
  const { balances: evmBalances } = useEvmBalances(isEvm ? address : null, chainId ?? null);

  const nativeEvmBalance = evmBalances?.find(b => b.isNative);
  const availableBsvNum = isEvm && !isOrahWallet
    ? (nativeEvmBalance ? Number(nativeEvmBalance.amount) || 0 : 0)
    : parseFloat(String(storeBalance ?? "0")) || 0;
  const hasLoadedBalance = isEvm && !isOrahWallet
    ? (evmBalances != null && evmBalances.length > 0)
    : storeBalance != null;
  const availableLabel = isEvm && !isOrahWallet
    ? (nativeEvmBalance ? `${Number(nativeEvmBalance.amount).toFixed(4)} ${nativeEvmBalance.symbol ?? "ETH"}` : null)
    : storeBalance != null ? `${parseFloat(String(storeBalance)).toFixed(6)} BSV` : null;

  const [holdingAmount, setHoldingAmount] = useState<number | null>(null);
  useEffect(() => {
    if (mode !== "sell" || !address) { setHoldingAmount(null); return; }
    fetch(`${API}/social/holdings/${address}/coin/${creator.address}`)
      .then(r => r.json())
      .then(d => setHoldingAmount(parseFloat(d.amount) || 0))
      .catch(() => setHoldingAmount(null));
  }, [mode, address, creator.address]);

  const parsedBsvAmount = parseFloat(bsvAmount) || 0;
  const parsedTokenAmount = parseFloat(tokenAmount) || 0;
  const insufficientFunds = mode === "buy" && hasLoadedBalance && parsedBsvAmount > availableBsvNum;
  const insufficientTokens = mode === "sell" && holdingAmount !== null && parsedTokenAmount > holdingAmount;
  const canTrade = !insufficientFunds && !insufficientTokens;

  const [, navigate] = useLocation();

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const params = mode === "buy"
          ? `type=buy&bsv_amount=${bsvAmount}`
          : `type=sell&token_amount=${tokenAmount}`;
        const r = await fetch(`${API}/social/quote/${creator.address}?${params}`);
        if (r.ok) setQuote(await r.json());
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [mode, bsvAmount, tokenAmount, creator.address]);

  async function doTrade() {
    if (!address) { navigate("/settings"); return; }
    if (!canTrade) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/social/creators/${creator.address}/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trader: address, trade_type: mode,
          bsv_amount: mode === "buy" ? parseFloat(bsvAmount) : undefined,
          token_amount: mode === "sell" ? parseFloat(tokenAmount) : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Trade failed");
      setSuccess(d);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <Portal>
    <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "hsl(var(--card))" }} onClick={e => e.stopPropagation()}>
        {success ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">{mode === "buy" ? "🚀" : "💸"}</div>
            <h3 className="text-xl font-bold mb-1 text-foreground">{mode === "buy" ? "Bought!" : "Sold!"}</h3>
            <p className="text-sm mb-4 text-muted-foreground">
              {mode === "buy" ? `+${fmtNum(success.tokensExchanged)} $${creator.symbol}` : `+${safePrice(success.bsvExchanged)} BSV`}
            </p>
            <p className="text-[10px] text-muted-foreground mb-4">New market cap: {fmtUsd(success.newMarketCap)}</p>
            <button onClick={onClose} className="px-6 py-2 rounded-xl text-sm font-bold" style={{ background: "#00ff88", color: "#000" }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Avatar src={creator.avatar_url} name={creator.username} size={28} />
                <span className="font-bold text-foreground">${creator.symbol}</span>
              </div>
              <button onClick={onClose}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="flex gap-1 mb-4 p-1 rounded-xl bg-muted/30">
              {(["buy", "sell"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === m ? (m === "buy" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400") : "text-muted-foreground"}`}>
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
            {mode === "buy" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">BSV Amount</label>
                  {availableLabel && (
                    <span className="text-xs text-muted-foreground">
                      Available: <span className={`font-mono ${insufficientFunds ? "text-red-400" : "text-foreground"}`}>{availableLabel}</span>
                    </span>
                  )}
                </div>
                <input type="number" value={bsvAmount} onChange={e => setBsvAmount(e.target.value)} step="0.001" min="0.001"
                  className={`w-full px-3 py-2 rounded-xl text-sm bg-muted/30 border text-foreground outline-none transition-colors ${insufficientFunds ? "border-red-500/60" : "border-border focus:border-primary"}`} />
                {insufficientFunds && <p className="text-xs text-red-400">Insufficient balance</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Token Amount</label>
                  {holdingAmount !== null && (
                    <span className="text-xs text-muted-foreground">
                      Held: <span className={`font-mono ${insufficientTokens ? "text-red-400" : "text-foreground"}`}>{fmtNum(holdingAmount)}</span>
                    </span>
                  )}
                </div>
                <input type="number" value={tokenAmount} onChange={e => setTokenAmount(e.target.value)} step="1" min="1"
                  className={`w-full px-3 py-2 rounded-xl text-sm bg-muted/30 border text-foreground outline-none transition-colors ${insufficientTokens ? "border-red-500/60" : "border-border focus:border-primary"}`} />
                {insufficientTokens && <p className="text-xs text-red-400">Insufficient token balance</p>}
              </div>
            )}
            {quote && (
              <div className="mt-3 p-3 rounded-xl bg-muted/20 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Est. receive</span><span className="font-mono text-foreground">{mode === "buy" ? `${fmtNum(quote.tokensOut)} $${creator.symbol}` : `${safePrice(quote.bsvOut)} BSV`}</span></div>
                <div className="flex justify-between"><span>Price impact</span><span className="font-mono" style={{ color: (quote.priceImpact ?? 0) > HIGH_PRICE_IMPACT_THRESHOLD_PERCENT ? "#ff4444" : "#00ff88" }}>{safePrice(quote.priceImpact, 2)}%</span></div>
              </div>
            )}
            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            <button onClick={doTrade} disabled={loading || !canTrade}
              className="w-full mt-4 py-3 rounded-xl font-bold text-sm disabled:opacity-50 transition-all"
              style={{ background: insufficientFunds || insufficientTokens ? "#555" : mode === "buy" ? "#00ff88" : "#ff4444", color: insufficientFunds || insufficientTokens ? "#fff" : "#000" }}>
              {loading ? "Processing…" : insufficientFunds ? "Insufficient Balance" : insufficientTokens ? "Insufficient Tokens" : `${mode === "buy" ? "Buy" : "Sell"} $${creator.symbol}`}
            </button>
          </>
        )}
      </div>
    </div>
    </Portal>
  );
}

function FeedTab({ likedIds, onLike, onMint, onOpen, onCreator }: {
  likedIds: Set<string>; onLike: (id: string) => void; onMint: (p: Post) => void;
  onOpen: (p: Post) => void; onCreator: (a: string) => void;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"hot" | "new" | "top">("hot");
  const [cat, setCat] = useState("all");
  const [chain, setChain] = useState("BSV");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort, limit: "50" });
      if (cat !== "all") params.set("category", cat);
      const r = await fetch(`${API}/social/feed?${params}`);
      if (r.ok) { const d = await r.json(); setPosts(d.posts ?? d); }
    } catch {} finally { setLoading(false); }
  }, [sort, cat, chain]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-2 flex items-center gap-2 border-b border-border">
        <div className="flex gap-1 p-0.5 rounded-lg bg-muted/30">
          {(["hot", "new", "top"] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${sort === s ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
              {s === "hot" ? "🔥" : s === "new" ? "🕐" : "⭐"} {s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          {CHAINS.map(c => (
            <button key={c} onClick={() => setChain(c)}
              className={`px-2 py-0.5 rounded text-[9px] font-bold ${chain === c ? "opacity-100" : "opacity-40"}`}
              style={{ color: CHAIN_COLOR[c] }}>{c}</button>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 gap-1 px-4 py-1.5 overflow-x-auto">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all ${cat === c ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground"}`}>
            <span>{CAT_ICONS[c]}</span>{c}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-16"><RefreshCw className="animate-spin text-muted-foreground" size={20} /></div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Sparkles size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No posts yet</p>
            <p className="text-xs mt-1">Be the first to create on OrahNFT</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map(p => (
              <div key={p.id} className="rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-all group">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
                  <button onClick={() => onCreator(p.creator)} className="flex items-center gap-2 hover:opacity-80">
                    <Avatar src={p.creator_avatar} name={p.creator_name} size={28} />
                    <div className="text-left">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-foreground">{p.creator_name || shortAddr(p.creator)}</span>
                        {p.is_verified && <BadgeCheck size={12} className="text-primary" />}
                      </div>
                      <span className="text-[9px] text-muted-foreground">{timeAgo(p.created_at)}</span>
                    </div>
                  </button>
                  <div className="ml-auto flex items-center gap-1">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${CHAIN_COLOR[p.chain] ?? "#888"}22`, color: CHAIN_COLOR[p.chain] ?? "#888" }}>{p.chain}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">{CAT_ICONS[p.category]} {p.category}</span>
                  </div>
                </div>
                <button onClick={() => onOpen(p)} className="w-full">
                  {p.image_url ? (
                    <div className="aspect-[4/3] bg-muted/20 overflow-hidden">
                      <img src={p.image_url} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-gradient-to-br from-primary/10 to-violet-500/10 flex items-center justify-center">
                      <ImageIcon size={32} className="text-muted-foreground/30" />
                    </div>
                  )}
                </button>
                <div className="px-3 py-2.5 space-y-1.5">
                  <button onClick={() => onOpen(p)} className="text-left w-full">
                    <h3 className="text-sm font-bold text-foreground line-clamp-1">{p.title}</h3>
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>}
                  </button>
                  {p.inscription_id && (
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-mono">
                      <Layers size={10} />
                      <span className="truncate">{p.inscription_id.slice(0, 16)}…</span>
                    </div>
                  )}
                  <SupplyBar minted={p.mint_count} max={p.max_supply} />
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-3">
                      <button onClick={() => onLike(p.id)} className="flex items-center gap-1 text-xs hover:scale-110 transition-transform">
                        <Heart size={14} fill={likedIds.has(p.id) ? "#ff4444" : "none"} className={likedIds.has(p.id) ? "text-red-500" : "text-muted-foreground"} />
                        <span className="text-muted-foreground">{fmtNum(p.like_count + (likedIds.has(p.id) ? 1 : 0))}</span>
                      </button>
                      <button onClick={() => onOpen(p)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <MessageCircle size={14} /><span>{fmtNum(p.comment_count)}</span>
                      </button>
                    </div>
                    <button onClick={() => onMint(p)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:scale-105"
                      style={{ background: "rgba(0,255,136,0.15)", color: "#00ff88" }}>
                      <Zap size={12} />{safePrice(p.mint_price)} {p.mint_currency} · Collect
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchTab({ onCreator, onOpenPost }: { onCreator: (a: string) => void; onOpenPost: (p: Post) => void }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"creators" | "posts">("creators");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    if (!q.trim()) { setCreators([]); setPosts([]); return; }
    setLoading(true);
    try {
      if (tab === "creators") {
        const r = await fetch(`${API}/social/creators?search=${encodeURIComponent(q)}`);
        if (r.ok) setCreators(await r.json());
      } else {
        const r = await fetch(`${API}/social/feed?q=${encodeURIComponent(q)}&limit=30`);
        if (r.ok) { const d = await r.json(); setPosts(d.posts ?? d); }
      }
    } catch {} finally { setLoading(false); }
  }, [q, tab]);
  useEffect(() => { const t = setTimeout(search, 300); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    if (!q.trim()) {
      fetch(`${API}/social/creators?sort=market_cap&limit=20`)
        .then(r => r.ok ? r.json() : []).then(setCreators).catch(() => {});
    }
  }, [q]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search creators or posts…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary" />
        </div>
        <div className="flex gap-1 mt-2 p-0.5 rounded-lg bg-muted/30 w-fit">
          {(["creators", "posts"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase ${tab === t ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex justify-center py-8"><RefreshCw className="animate-spin text-muted-foreground" size={18} /></div>
        ) : tab === "creators" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {creators.map(c => (
              <button key={c.address} onClick={() => onCreator(c.address)}
                className="p-3 rounded-xl border border-border bg-card hover:border-primary/40 transition-all text-left">
                <div className="flex items-center gap-3">
                  <Avatar src={c.avatar_url} name={c.username} size={40} ring={c.is_verified} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold text-foreground truncate">{c.username || shortAddr(c.address)}</span>
                      {c.is_verified && <BadgeCheck size={14} className="text-primary" />}
                    </div>
                    <span className="text-xs text-primary font-bold">${c.symbol}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-foreground">{fmtUsd(c.market_cap_usd)}</div>
                    <div className="text-[10px] text-muted-foreground">mcap</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {posts.map(p => (
              <button key={p.id} onClick={() => onOpenPost(p)}
                className="p-3 rounded-xl border border-border bg-card hover:border-primary/40 transition-all text-left">
                <div className="flex items-center gap-3">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted/30 flex items-center justify-center"><ImageIcon size={18} className="text-muted-foreground/30" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{p.title}</p>
                    <p className="text-[10px] text-muted-foreground">{p.creator_name} · {timeAgo(p.created_at)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateTab({ onSuccess }: { onSuccess: () => void }) {
  const { address, provider, network, internalEvmAddress } = useWalletStore();
  const actorAddress = getNftProfileAddress({ address, provider, network, internalEvmAddress });
  const [, navigate] = useLocation();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("art");
  const [chain, setChain] = useState("BSV");
  const [imageUrl, setImageUrl] = useState("");
  const [mintPrice, setMintPrice] = useState("0.001");
  const [maxSupply, setMaxSupply] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function publish() {
    if (!address) { navigate("/settings"); return; }
    if (!title.trim()) { setError("Title required"); return; }
    const creatorAddress = actorAddress ?? address;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/social/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator: creatorAddress, title, description: desc, image_url: imageUrl,
          category: cat, chain, mint_price: mintPrice, mint_currency: "BSV",
          max_supply: maxSupply ? parseInt(maxSupply) : null, tags: "",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      onSuccess();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (!address) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <Lock size={32} className="mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold text-foreground mb-2">Connect Wallet</h3>
          <p className="text-sm text-muted-foreground mb-4">Connect your wallet to create posts on OrahNFT</p>
          <button onClick={() => navigate("/settings")} className="px-6 py-2 rounded-xl text-sm font-bold" style={{ background: "#00ff88", color: "#000" }}>Connect</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-lg font-bold text-foreground">Create Post</h2>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-semibold">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give your creation a title"
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary" />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-semibold">Description</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe your work…" rows={3}
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary resize-none" />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-semibold">Image URL</label>
          <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…"
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-semibold">Category</label>
            <select value={cat} onChange={e => setCat(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none">
              {CATEGORIES.filter(c => c !== "all").map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-semibold">Chain</label>
            <select value={chain} onChange={e => setChain(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none">
              {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-semibold">Mint Price (BSV)</label>
            <input type="number" value={mintPrice} onChange={e => setMintPrice(e.target.value)} step="0.001"
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-semibold">Max Supply (optional)</label>
            <input type="number" value={maxSupply} onChange={e => setMaxSupply(e.target.value)} placeholder="Unlimited"
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary" />
          </div>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button onClick={publish} disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
          style={{ background: "#00ff88", color: "#000" }}>
          {loading ? "Publishing…" : "Publish to BSV"}
        </button>
      </div>
    </div>
  );
}

function MyProfileTab({ onOpenCreator, onOpenPost }: { onOpenCreator: (a: string) => void; onOpenPost: (p: Post) => void }) {
  const { address, provider, network, internalEvmAddress } = useWalletStore();
  const profileAddress = getNftProfileAddress({ address, provider, network, internalEvmAddress });
  const [, navigate] = useLocation();
  const [creator, setCreator] = useState<Creator | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"portfolio" | "posts" | "settings">("portfolio");

  useEffect(() => {
    if (!profileAddress) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetch(`${API}/social/creators/${profileAddress}`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/social/holdings/${profileAddress}`).then(r => r.ok ? r.json().then(d => d.holdings ?? d) : []),
      fetch(`${API}/social/feed?creator=${profileAddress}`).then(r => r.ok ? r.json().then(d => d.posts ?? d) : []),
    ]).then(([c, h, p]) => { setCreator(c); setHoldings(h); setMyPosts(p); })
      .finally(() => setLoading(false));
  }, [profileAddress]);

  if (!profileAddress) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <User size={32} className="mx-auto mb-3 text-muted-foreground" />
          <h3 className="text-lg font-bold text-foreground mb-2">Connect Wallet</h3>
          <p className="text-sm text-muted-foreground mb-4">Connect your wallet to view your NFT profile</p>
          <button onClick={() => navigate("/settings")} className="px-6 py-2 rounded-xl text-sm font-bold" style={{ background: "#00ff88", color: "#000" }}>Connect</button>
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex justify-center py-16"><RefreshCw className="animate-spin text-muted-foreground" size={20} /></div>;

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="max-w-4xl mx-auto">
        {creator ? (
          <div className="mb-6 p-4 rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-4">
              <Avatar src={creator.avatar_url} name={creator.username} size={56} ring={creator.is_verified} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">{creator.username}</h2>
                  {creator.is_verified && <BadgeCheck size={18} className="text-primary" />}
                  <span className="text-sm font-bold text-primary">${creator.symbol}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{creator.bio || "No bio"}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 mt-4">
              <div className="text-center"><div className="text-sm font-bold text-foreground">{fmtUsd(creator.market_cap_usd)}</div><div className="text-[10px] text-muted-foreground">Market Cap</div></div>
              <div className="text-center"><div className="text-sm font-bold text-foreground">{fmtNum(creator.holder_count)}</div><div className="text-[10px] text-muted-foreground">Holders</div></div>
              <div className="text-center"><div className="text-sm font-bold text-foreground">{fmtNum(creator.follower_count)}</div><div className="text-[10px] text-muted-foreground">Followers</div></div>
              <div className="text-center"><div className="text-sm font-bold text-foreground">{creator.post_count}</div><div className="text-[10px] text-muted-foreground">Posts</div></div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-2xl border border-border bg-card text-center">
            <p className="text-sm text-muted-foreground mb-3">You haven't created a profile yet</p>
            <button onClick={() => onOpenCreator(profileAddress)} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: "#00ff88", color: "#000" }}>Create Profile</button>
          </div>
        )}
        <div className="flex gap-1 mb-4 p-0.5 rounded-lg bg-muted/30 w-fit">
          {(["portfolio", "posts"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold ${tab === t ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
              {t === "portfolio" ? "Holdings" : "My Posts"}
            </button>
          ))}
        </div>
        {tab === "portfolio" ? (
          holdings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {holdings.map(h => (
                <button key={h.coin_creator} onClick={() => onOpenCreator(h.coin_creator)}
                  className="p-3 rounded-xl border border-border bg-card hover:border-primary/40 transition-all text-left">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-foreground">${h.symbol}</span>
                      <div className="text-[10px] text-muted-foreground">{h.username}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-foreground">{fmtNum(h.amount)}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtUsd(h.amount * h.price_usd)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingBag size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No holdings yet</p>
            </div>
          )
        ) : (
          myPosts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {myPosts.map(p => (
                <button key={p.id} onClick={() => onOpenPost(p)}
                  className="p-3 rounded-xl border border-border bg-card hover:border-primary/40 transition-all text-left">
                  <div className="flex items-center gap-3">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted/30 flex items-center justify-center"><ImageIcon size={18} className="text-muted-foreground/30" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{p.title}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtNum(p.mint_count)} minted · {fmtNum(p.like_count)} likes</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Camera size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No posts yet</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function CreatorProfileSheet({ creatorAddress, currentUserAddress, onClose, onOpenPost }: {
  creatorAddress: string; currentUserAddress?: string; onClose: () => void; onOpenPost: (p: Post) => void;
}) {
  const [creator, setCreator] = useState<Creator | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [holders, setHolders] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"posts" | "holders" | "trades">("posts");
  const [showTrade, setShowTrade] = useState(false);
  const [createForm, setCreateForm] = useState({ username: "", bio: "", avatar_url: "", website: "" });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const isViewingOwnProfile = !!currentUserAddress && currentUserAddress === creatorAddress;

  const loadProfileData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/social/creators/${creatorAddress}`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/social/feed?creator=${creatorAddress}`).then(r => r.ok ? r.json().then(d => d.posts ?? d) : []),
      fetch(`${API}/social/creators/${creatorAddress}/holders`).then(r => r.ok ? r.json() : []),
    ]).then(([c, p, h]) => { setCreator(c); setPosts(p); setHolders(h); })
      .finally(() => setLoading(false));
  }, [creatorAddress]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  async function createProfile() {
    if (!isViewingOwnProfile) return;
    if (!createForm.username.trim()) { setCreateError("Username is required"); return; }
    setCreateLoading(true);
    setCreateError("");
    try {
      const res = await fetch(`${API}/social/creators/${creatorAddress}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: createForm.username.trim(),
          bio: createForm.bio.trim(),
          avatar_url: createForm.avatar_url.trim(),
          website: createForm.website.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to create profile");
      loadProfileData();
    } catch (err: any) {
      setCreateError(err.message ?? "Failed to create profile");
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <Portal>
    <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "hsl(var(--card))", maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Creator Profile</h3>
          <button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 56px)" }}>
          {loading ? (
            <div className="flex justify-center py-16"><RefreshCw className="animate-spin text-muted-foreground" size={20} /></div>
          ) : !creator ? (
            isViewingOwnProfile ? (
              <div className="p-4 space-y-3">
                <h4 className="text-sm font-bold text-foreground">Create your profile</h4>
                <input
                  value={createForm.username}
                  onChange={e => setCreateForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Username"
                  className="w-full px-3 py-2 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary"
                />
                <textarea
                  value={createForm.bio}
                  onChange={e => setCreateForm(prev => ({ ...prev, bio: e.target.value }))}
                  placeholder="Bio"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary resize-none"
                />
                <input
                  value={createForm.avatar_url}
                  onChange={e => setCreateForm(prev => ({ ...prev, avatar_url: e.target.value }))}
                  placeholder="Avatar URL"
                  className="w-full px-3 py-2 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary"
                />
                <input
                  value={createForm.website}
                  onChange={e => setCreateForm(prev => ({ ...prev, website: e.target.value }))}
                  placeholder="Website"
                  className="w-full px-3 py-2 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary"
                />
                {createError && <p className="text-xs text-red-400">{createError}</p>}
                <button
                  onClick={createProfile}
                  disabled={createLoading}
                  className="w-full px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ background: "#00ff88", color: "#000" }}
                >
                  {createLoading ? "Saving…" : "Create Profile"}
                </button>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">Creator not found</div>
            )
          ) : (
            <>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar src={creator.avatar_url} name={creator.username} size={48} ring={creator.is_verified} />
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-foreground">{creator.username || shortAddr(creator.address)}</span>
                      {creator.is_verified && <BadgeCheck size={14} className="text-primary" />}
                    </div>
                    <span className="text-sm font-bold text-primary">${creator.symbol}</span>
                  </div>
                  <button onClick={() => setShowTrade(true)}
                    className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: "#00ff88", color: "#000" }}>
                    Trade ${creator.symbol}
                  </button>
                </div>
                {creator.bio && <p className="text-xs text-muted-foreground mb-3">{creator.bio}</p>}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div><div className="text-sm font-bold text-foreground">{fmtUsd(creator.market_cap_usd)}</div><div className="text-[9px] text-muted-foreground">Mcap</div></div>
                  <div><div className="text-sm font-bold text-foreground">{safePrice(creator.price_bsv, 6)}</div><div className="text-[9px] text-muted-foreground">BSV Price</div></div>
                  <div><div className="text-sm font-bold text-foreground">{fmtNum(creator.holder_count)}</div><div className="text-[9px] text-muted-foreground">Holders</div></div>
                  <div><div className="text-sm font-bold text-foreground">{fmtUsd(creator.ath_usd)}</div><div className="text-[9px] text-muted-foreground">ATH</div></div>
                </div>
              </div>
              <div className="flex border-t border-border">
                {(["posts", "holders"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex-1 py-2 text-xs font-bold border-b-2 ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
                    {t === "posts" ? `Posts (${posts.length})` : `Holders (${holders.length})`}
                  </button>
                ))}
              </div>
              <div className="p-4 space-y-2" style={{ maxHeight: 300, overflowY: "auto" }}>
                {tab === "posts" ? (
                  posts.length > 0 ? posts.map(p => (
                    <button key={p.id} onClick={() => onOpenPost(p)}
                      className="w-full p-2 rounded-xl border border-border hover:border-primary/40 transition-all flex items-center gap-3 text-left">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted/30 flex items-center justify-center"><ImageIcon size={14} className="text-muted-foreground/30" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{p.title}</p>
                        <p className="text-[10px] text-muted-foreground">{fmtNum(p.mint_count)} minted · {timeAgo(p.created_at)}</p>
                      </div>
                    </button>
                  )) : <p className="text-xs text-muted-foreground text-center py-4">No posts</p>
                ) : (
                  holders.length > 0 ? holders.map(h => (
                    <div key={h.holder} className="flex items-center justify-between p-2 rounded-xl border border-border">
                      <span className="text-xs font-mono text-muted-foreground">{shortAddr(h.holder)}</span>
                      <span className="text-xs font-bold text-foreground">{fmtNum(h.amount)}</span>
                    </div>
                  )) : <p className="text-xs text-muted-foreground text-center py-4">No holders</p>
                )}
              </div>
              {showTrade && <TradeSheet creator={creator} onClose={() => setShowTrade(false)} />}
            </>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}

function PostDetailSheet({ post, onClose, onMint, onSell, onLike, liked, onCreator }: {
  post: Post; onClose: () => void; onMint: (p: Post) => void; onSell?: (p: Post) => void;
  onLike: (id: string) => void; liked: boolean; onCreator: (a: string) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const { address, provider, network, internalEvmAddress } = useWalletStore();
  const actorAddress = getNftProfileAddress({ address, provider, network, internalEvmAddress });

  useEffect(() => {
    fetch(`${API}/social/posts/${post.id}`).then(r => r.ok ? r.json() : null).then(d => setComments(d?.comments ?? [])).catch(() => {});
  }, [post.id]);

  async function submitComment() {
    if (!commentText.trim() || !actorAddress) return;
    try {
      const r = await fetch(`${API}/social/posts/${post.id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: actorAddress, content: commentText }),
      });
      if (r.ok) {
        const c = await r.json();
        setComments(c?.comments ?? []);
        setCommentText("");
      }
    } catch {}
  }

  return (
    <Portal>
    <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden" style={{ background: "hsl(var(--card))", maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <button onClick={() => onCreator(post.creator)} className="flex items-center gap-2 hover:opacity-80">
            <Avatar src={post.creator_avatar} name={post.creator_name} size={28} />
            <div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-foreground">{post.creator_name || shortAddr(post.creator)}</span>
                {post.is_verified && <BadgeCheck size={12} className="text-primary" />}
              </div>
              <span className="text-[9px] text-muted-foreground">{timeAgo(post.created_at)}</span>
            </div>
          </button>
          <button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 56px)" }}>
          {post.image_url && (
            <img src={post.image_url} alt={post.title} className="w-full max-h-[400px] object-contain bg-black" />
          )}
          <div className="p-4 space-y-3">
            <h3 className="text-lg font-bold text-foreground">{post.title}</h3>
            {post.description && <p className="text-sm text-muted-foreground">{post.description}</p>}
            <div className="flex items-center gap-4">
              <button onClick={() => onLike(post.id)} className="flex items-center gap-1 text-sm hover:scale-110 transition-transform">
                <Heart size={18} fill={liked ? "#ff4444" : "none"} className={liked ? "text-red-500" : "text-muted-foreground"} />
                <span className="text-muted-foreground">{fmtNum(post.like_count + (liked ? 1 : 0))}</span>
              </button>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <MessageCircle size={18} />{fmtNum(post.comment_count)}
              </span>
              <button onClick={() => onMint(post)}
                className="ml-auto flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: "rgba(0,255,136,0.15)", color: "#00ff88" }}>
                <Zap size={14} /> Collect · {safePrice(post.mint_price)} {post.mint_currency}
              </button>
              {onSell && (
                <button onClick={() => onSell(post)}
                  aria-label="Sell"
                  className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-bold"
                  style={{ background: "#ff4444", color: "#fff" }}>
                  Sell
                </button>
              )}
            </div>
            {post.inscription_id && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono p-2 rounded-lg bg-muted/20">
                <Layers size={12} />BSV Inscription: {post.inscription_id}
              </div>
            )}
            <div className="border-t border-border pt-3 space-y-2">
              <h4 className="text-xs font-bold text-foreground">Comments ({comments.length})</h4>
              {comments.map(c => (
                <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/10">
                  <Avatar name={commentHandle(c)} size={24} />
                  <div>
                    <span className="text-[10px] font-bold text-foreground">{commentHandle(c)}</span>
                    <p className="text-xs text-muted-foreground">{c.content}</p>
                  </div>
                </div>
              ))}
              {address && (
                <div className="flex gap-2">
                  <input value={commentText} onChange={e => setCommentText(e.target.value)}
                    placeholder="Add a comment…" onKeyDown={e => e.key === "Enter" && submitComment()}
                    className="flex-1 px-3 py-2 rounded-xl text-xs bg-muted/30 border border-border text-foreground outline-none focus:border-primary" />
                  <button onClick={submitComment} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: "#00ff88", color: "#000" }}>
                    <Send size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}

function MintSheet({ post, onClose, initialMode = "buy" }: { post: Post; onClose: () => void; initialMode?: "buy" | "sell" }) {
  const [mode, setMode] = useState<"buy" | "sell">(initialMode);
  const { address, network, chainId, balance: storeBalance, provider, internalEvmAddress } = useWalletStore();
  const actorAddress = getNftProfileAddress({ address, provider, network, internalEvmAddress });
  const [, navigate] = useLocation();
  const isEvm = !address || network === "evm" || (!!address && address.startsWith("0x"));
  const isOrahWallet = provider === "orah-wallet";
  useBsvBalance();
  const { balances: evmBalances, loading: evmBalancesLoading } = useEvmBalances(isEvm ? address : null, chainId ?? null);
  const { availableAmount: availableNum, hasLoadedBalance, availableLabel } = resolveNftSpendBalance({
    isEvm,
    isOrahWallet,
    storeBalance,
    evmBalances,
    evmBalancesLoading,
    mintCurrency: post.mint_currency,
  });
  const mintPrice = parseFloat(String(post.mint_price)) || 0;
  const insufficientFunds = mode === "buy" && !!address && hasLoadedBalance && mintPrice > 0 && availableNum < mintPrice;
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [error, setError] = useState("");
  const [listPriceInput, setListPriceInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const sellDisabled = mode === "sell" && !listPriceInput;
  const actionDisabled = loading || insufficientFunds || sellDisabled;
  const actionBg = actionDisabled ? "#555" : mode === "buy" ? "#00ff88" : "#ff4444";
  const actionColor = actionDisabled ? "#fff" : mode === "buy" ? "#000" : "#fff";
  const actionLabel = loading
    ? (mode === "buy" ? "Minting…" : "Listing…")
    : insufficientFunds
      ? "Insufficient Balance"
      : mode === "buy"
        ? `Collect for ${safePrice(post.mint_price)} ${post.mint_currency}`
        : `List for ${listPriceInput || "…"} ${post.mint_currency}`;

  function ensureAddress() {
    if (address) return true;
    navigate("/settings");
    return false;
  }

  async function doMint() {
    if (!ensureAddress()) return;
    if (!actorAddress) return;
    if (insufficientFunds) return;
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API}/social/posts/${post.id}/mint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minter: actorAddress }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Mint failed");
      setSuccess(d);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function doList() {
    if (!ensureAddress()) return;
    const price = parseFloat(listPriceInput);
    if (!price || price <= 0) { setError("Price must be greater than 0"); return; }
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API}/nft/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nftId: post.id,
          collectionId: "social-posts",
          seller: address,
          chain: post.chain,
          price: String(price),
          currency: post.mint_currency || "BSV",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to list");
      setSuccess(d);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <Portal>
    <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "hsl(var(--card))" }} onClick={e => e.stopPropagation()}>
        {success ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-3">{mode === "buy" ? "⚡" : "🏷️"}</div>
            <h3 className="text-xl font-bold text-foreground mb-1">{mode === "buy" ? "Collected!" : "Listed!"}</h3>
            <p className="text-sm text-muted-foreground mb-2">{post.title}</p>
            {mode === "buy" && success.inscriptionId && (
              <p className="text-[10px] text-muted-foreground font-mono">Inscription: {String(success.inscriptionId).slice(0, 20)}…</p>
            )}
            <button onClick={onClose} className="mt-4 px-6 py-2 rounded-xl text-sm font-bold" style={{ background: "#00ff88", color: "#000" }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-foreground">{mode === "buy" ? "Collect NFT" : "List NFT for Sale"}</h3>
              <button onClick={onClose}><X size={18} className="text-muted-foreground" /></button>
            </div>
            <div className="flex gap-1 mb-4 p-1 rounded-xl bg-muted/30">
              {(["buy", "sell"] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setError(""); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === m ? (m === "buy" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400") : "text-muted-foreground"}`}>
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
            {post.image_url && <img src={post.image_url} alt={post.title} className="w-full h-48 object-cover rounded-xl mb-3" />}
            <h4 className="font-bold text-foreground">{post.title}</h4>
            <p className="text-xs text-muted-foreground mt-1">by {post.creator_name || shortAddr(post.creator)}</p>
            {mode === "buy" ? (
              <>
                <div className="mt-3 p-3 rounded-xl bg-muted/20 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Price</span><span className="font-bold text-foreground">{safePrice(post.mint_price)} {post.mint_currency}</span></div>
                  {availableLabel && (
                    <div className="flex justify-between">
                      <span>Your balance</span>
                      <span className={`font-mono font-bold ${insufficientFunds ? "text-red-400" : "text-foreground"}`}>{availableLabel}</span>
                    </div>
                  )}
                  <div className="flex justify-between"><span>Chain</span><span style={{ color: CHAIN_COLOR[post.chain] }}>{post.chain}</span></div>
                  <div className="flex justify-between"><span>Minted</span><span>{fmtNum(post.mint_count)}{post.max_supply ? ` / ${fmtNum(post.max_supply)}` : ""}</span></div>
                </div>
                {insufficientFunds && <p className="text-xs text-red-400 mt-2">Insufficient balance to collect this NFT</p>}
              </>
            ) : (
              <div className="mt-3 space-y-2">
                <label htmlFor="nft-list-price-input" className="text-xs text-muted-foreground font-semibold">Listing Price ({post.mint_currency})</label>
                <input
                  id="nft-list-price-input"
                  aria-describedby="nft-list-price-help"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={listPriceInput}
                  onChange={e => setListPriceInput(e.target.value)}
                  placeholder="0.0000"
                  className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary"
                />
                <p id="nft-list-price-help" className="text-xs text-muted-foreground">Mint price: {safePrice(post.mint_price)} {post.mint_currency}</p>
              </div>
            )}
            <div className="mt-3 rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setShowAdvanced(v => !v)}
                className="w-full px-3 py-2 text-xs font-bold flex items-center justify-between bg-muted/20 text-foreground"
              >
                <span>Advanced NFT Details</span>
                <ChevronRight size={14} className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`} />
              </button>
              {showAdvanced && (
                <div className="p-3 space-y-1.5 text-[11px] text-muted-foreground">
                  <div className="flex justify-between gap-3"><span>Post ID</span><span className="font-mono text-foreground truncate">{post.id}</span></div>
                  <div className="flex justify-between gap-3"><span>Creator</span><span className="font-mono text-foreground truncate">{post.creator}</span></div>
                  <div className="flex justify-between gap-3"><span>Chain</span><span style={{ color: CHAIN_COLOR[post.chain] ?? "#9ca3af" }}>{post.chain}</span></div>
                  <div className="flex justify-between gap-3"><span>Currency</span><span className="text-foreground">{post.mint_currency}</span></div>
                </div>
              )}
            </div>
            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            {!address ? (
              <p className="text-xs text-center text-muted-foreground mt-4">{mode === "buy" ? "Connect wallet to collect" : "Connect wallet to list"}</p>
            ) : (
              <button onClick={mode === "buy" ? doMint : doList} disabled={actionDisabled}
                className="w-full mt-4 py-3 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
                style={{ background: actionBg, color: actionColor }}>
                {actionLabel}
              </button>
            )}
          </>
        )}
      </div>
    </div>
    </Portal>
  );
}

type ActiveTab = "feed" | "search" | "create" | "profile";

export function NFTPage() {
  const { address, provider, network, internalEvmAddress } = useWalletStore();
  const profileAddress = getNftProfileAddress({ address, provider, network, internalEvmAddress });
  const [activeTab, setActiveTab] = useState<ActiveTab>("feed");
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [mintPost, setMintPost] = useState<{ post: Post; mode: "buy" | "sell" } | null>(null);
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);

  const handleLike = useCallback((id: string) => {
    setLikedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (profileAddress) fetch(`${API}/social/posts/${id}/like`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: profileAddress }) }).catch(() => {});
  }, [profileAddress]);

  const openPost = useCallback((p: Post) => setDetailPost(p), []);
  const openCreator = useCallback((a: string) => setCreatorAddress(a), []);

  const INNER_TABS: { key: ActiveTab; label: string; Icon: any }[] = [
    { key: "feed", label: "Feed", Icon: Flame },
    { key: "search", label: "Search", Icon: Search },
    { key: "create", label: "Create", Icon: PlusSquare },
    { key: "profile", label: "Profile", Icon: User },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]" style={{ background: "hsl(var(--background))" }}>
      <div className="flex items-center justify-between px-6 py-3 shrink-0 border-b border-border">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-black tracking-tight text-foreground">Orah<span className="text-primary">NFT</span></h1>
            <div className="text-[10px] font-mono text-muted-foreground">BSV · Multichain · Creator Coins</div>
          </div>
          <div className="flex gap-1 ml-6 p-0.5 rounded-lg bg-muted/30">
            {INNER_TABS.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === key ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {address && (
            <button onClick={() => profileAddress && openCreator(profileAddress)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
              <Avatar src={undefined} name={address} size={20} />
              <span className="text-xs font-mono text-muted-foreground">{shortAddr(address)}</span>
            </button>
          )}
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full animate-pulse bg-primary" /><span className="text-[10px] text-muted-foreground">live</span></div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "feed"    && <FeedTab likedIds={likedIds} onLike={handleLike} onMint={p => setMintPost({ post: p, mode: "buy" })} onOpen={openPost} onCreator={openCreator} />}
        {activeTab === "search"  && <SearchTab onCreator={openCreator} onOpenPost={openPost} />}
        {activeTab === "create"  && <CreateTab onSuccess={() => setActiveTab("feed")} />}
        {activeTab === "profile" && <MyProfileTab onOpenCreator={openCreator} onOpenPost={openPost} />}
      </div>

      {creatorAddress && (
        <CreatorProfileSheet
          creatorAddress={creatorAddress}
          currentUserAddress={profileAddress ?? undefined}
          onClose={() => setCreatorAddress(null)}
          onOpenPost={p => { setCreatorAddress(null); openPost(p); }}
        />
      )}
      {detailPost && (
        <PostDetailSheet
          post={detailPost}
          onClose={() => setDetailPost(null)}
          onMint={p => { setDetailPost(null); setMintPost({ post: p, mode: "buy" }); }}
          onSell={p => { setDetailPost(null); setMintPost({ post: p, mode: "sell" }); }}
          onLike={handleLike}
          liked={likedIds.has(detailPost.id)}
          onCreator={a => { setDetailPost(null); openCreator(a); }}
        />
      )}
      {mintPost && <MintSheet post={mintPost.post} initialMode={mintPost.mode} onClose={() => setMintPost(null)} />}
    </div>
  );
}
