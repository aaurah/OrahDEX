import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Heart, MessageCircle, Share2, Zap, BadgeCheck, Search,
  TrendingUp, PlusSquare, User, ChevronLeft, X, Upload,
  Flame, Clock, Star, Lock, Layers, Copy, Send, Globe,
  AtSign, Camera, ArrowUpRight, ArrowDownRight,
  UserPlus, UserCheck, BarChart2, Grid3X3, Activity,
  ShoppingBag, Settings, ChevronRight, RefreshCw, Sparkles, ExternalLink,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useLocation } from "wouter";

const API = "/api";

const MODAL_ROOT_STYLE: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
  zIndex: 99999, pointerEvents: "auto", display: "flex", flexDirection: "column",
};

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
  return createPortal(<div style={MODAL_ROOT_STYLE}>{children}</div>, target);
}

/* ─── types ─────────────────────────────────────────────────────────────────── */
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

/* ─── helpers ────────────────────────────────────────────────────────────────── */
function shortAddr(a: string) { return a?.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : (a ?? "—"); }
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

/* ─── tiny UI ────────────────────────────────────────────────────────────────── */
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
      ...(ring ? { padding: 3, background: "linear-gradient(135deg,#00ff88,#00aaff)", boxSizing: "border-box" } : {}) }}>
      <img src={src} alt={name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
    </div>
  );
}

function SupplyBar({ minted, max }: { minted: number; max: number | null }) {
  if (!max) return null;
  const pct = Math.min((minted / max) * 100, 100);
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
        <span>{fmtNum(minted)} minted</span>
        <span>{max - minted > 0 ? `${max - minted} left` : "SOLD OUT"}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 95 ? "#ff4444" : pct >= 70 ? "#ffaa00" : "var(--color-accent)" }} />
      </div>
    </div>
  );
}

/* ─── TRADE SHEET (vAMM buy/sell creator coin) ───────────────────────────────── */
function TradeSheet({ creator, onClose }: { creator: Creator; onClose: () => void }) {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [bsvAmount, setBsvAmount] = useState("0.01");
  const [tokenAmount, setTokenAmount] = useState("1000000");
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [error, setError] = useState("");
  const { address } = useWalletStore();
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
    <div className="w-full h-full flex items-end" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5 pb-8" style={{ background: "var(--color-bg)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        {success ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">{mode === "buy" ? "🚀" : "💸"}</div>
            <h3 className="text-xl font-bold mb-1" style={{ color: "var(--color-text)" }}>
              {mode === "buy" ? "Bought!" : "Sold!"}
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
              {mode === "buy"
                ? `${fmtNum(success.tokensExchanged)} ${creator.symbol} for ${success.bsvExchanged} BSV`
                : `${fmtNum(success.tokensExchanged)} ${creator.symbol} → ${success.bsvExchanged} BSV`}
            </p>
            <div className="rounded-xl p-3 mb-4" style={{ background: "var(--color-surface)" }}>
              <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>New market cap</div>
              <div className="text-lg font-bold" style={{ color: "var(--color-accent)" }}>{fmtUsd(success.newMarketCap)}</div>
            </div>
            <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-sm" style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <Avatar src={creator.avatar_url} name={creator.username} size={44} ring />
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <span className="font-bold" style={{ color: "var(--color-text)" }}>{creator.username}</span>
                  {creator.is_verified && <BadgeCheck size={14} style={{ color: "var(--color-accent)" }} />}
                </div>
                <div className="text-xs font-mono" style={{ color: "var(--color-accent)" }}>{creator.symbol}</div>
              </div>
              <button onClick={onClose}><X size={20} style={{ color: "var(--color-text-secondary)" }} /></button>
            </div>

            {/* Price / mcap header */}
            <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--color-surface)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Price</div>
                  <div className="text-lg font-bold" style={{ color: "var(--color-text)" }}>{fmtUsd(creator.price_usd)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Market Cap</div>
                  <div className="text-lg font-bold" style={{ color: "var(--color-accent)" }}>{fmtUsd(creator.market_cap_usd)}</div>
                </div>
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-[10px] mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  <span>ATH: {fmtUsd(creator.ath_usd)}</span>
                  <span>{creator.holder_count} holders</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min((creator.market_cap_usd / (creator.ath_usd || 1)) * 100, 100)}%`, background: "var(--color-accent)" }} />
                </div>
              </div>
            </div>

            {/* Buy / Sell toggle */}
            <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: "var(--color-surface)" }}>
              {(["buy", "sell"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} className="flex-1 py-2.5 rounded-lg font-bold text-sm capitalize transition-all"
                  style={{ background: mode === m ? (m === "buy" ? "var(--color-accent)" : "#ff4444") : "transparent", color: mode === m ? "#000" : "var(--color-text-secondary)" }}>
                  {m === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>

            {/* Input */}
            {mode === "buy" ? (
              <div className="mb-3">
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>BSV to spend</label>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                  <input className="flex-1 bg-transparent text-sm font-medium outline-none" style={{ color: "var(--color-text)" }}
                    type="number" min="0.001" step="0.001" value={bsvAmount} onChange={e => setBsvAmount(e.target.value)} />
                  <span className="text-xs font-bold" style={{ color: "var(--color-accent)" }}>BSV</span>
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  {["0.001", "0.01", "0.1", "1"].map(v => (
                    <button key={v} onClick={() => setBsvAmount(v)} className="flex-1 py-1 rounded-lg text-xs font-bold"
                      style={{ background: bsvAmount === v ? "rgba(0,255,136,0.15)" : "var(--color-surface)", color: bsvAmount === v ? "var(--color-accent)" : "var(--color-text-secondary)", border: bsvAmount === v ? "1px solid rgba(0,255,136,0.3)" : "1px solid transparent" }}>
                      {v}
                    </button>
                  ))}
                </div>
                {quote && <p className="text-xs mt-2 text-center" style={{ color: "var(--color-text-secondary)" }}>≈ {fmtNum(quote.tokensOut)} {creator.symbol} · impact {quote.priceImpact}%</p>}
              </div>
            ) : (
              <div className="mb-3">
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Tokens to sell</label>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                  <input className="flex-1 bg-transparent text-sm font-medium outline-none" style={{ color: "var(--color-text)" }}
                    type="number" min="1" step="1000" value={tokenAmount} onChange={e => setTokenAmount(e.target.value)} />
                  <span className="text-xs font-bold" style={{ color: "var(--color-accent)" }}>{creator.symbol}</span>
                </div>
                {quote && <p className="text-xs mt-2 text-center" style={{ color: "var(--color-text-secondary)" }}>≈ {quote.bsvOut} BSV · impact {quote.priceImpact}%</p>}
              </div>
            )}

            {!address && <div className="p-3 rounded-xl flex items-center gap-2 mb-3" style={{ background: "rgba(255,170,0,0.12)" }}>
              <Lock size={14} style={{ color: "#ffaa00" }} /><span className="text-xs" style={{ color: "#ffaa00" }}>Connect wallet to trade</span>
            </div>}
            {error && <div className="p-3 rounded-xl text-xs mb-3" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}>{error}</div>}

            <button onClick={doTrade} disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50"
              style={{ background: mode === "buy" ? "var(--color-accent)" : "#ff4444", color: "#000" }}>
              {loading ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" /> :
                <>{mode === "buy" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />} {address ? (mode === "buy" ? `Buy ${creator.symbol}` : `Sell ${creator.symbol}`) : "Connect Wallet"}</>}
            </button>

            <div className="mt-3 text-center text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
              1% fee · {fmtNum(creator.trade_count ?? 0)} trades · Bonding curve vAMM · BSV on-chain
            </div>
          </>
        )}
      </div>
    </div>
    </Portal>
  );
}

/* ─── CREATOR PROFILE SHEET ──────────────────────────────────────────────────── */
function CreatorProfileSheet({
  creatorAddress, currentUserAddress, onClose, onOpenPost,
}: {
  creatorAddress: string;
  currentUserAddress?: string;
  onClose: () => void;
  onOpenPost: (p: Post) => void;
}) {
  const [data, setData] = useState<{ profile: Creator; posts: Post[]; topHolders: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [gridTab, setGridTab] = useState<"posts" | "collected" | "activity">("posts");
  const [isFollowing, setIsFollowing] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    fetch(`${API}/social/creators/${creatorAddress}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [creatorAddress]);

  async function toggleFollow() {
    if (!currentUserAddress) return;
    const prev = isFollowing;
    setIsFollowing(!prev);
    await fetch(`${API}/social/follow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ follower: currentUserAddress, following: creatorAddress }),
    }).catch(() => setIsFollowing(prev));
  }

  const profile = data?.profile;
  const posts = data?.posts ?? [];
  const topHolders = data?.topHolders ?? [];

  if (loading) return (
    <Portal>
      <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-accent)" }} />
      </div>
    </Portal>
  );

  if (!profile) return null;

  const athPct = (() => { const m = Number(profile.market_cap_usd), a = Number(profile.ath_usd); return a > 0 ? Math.min((m / a) * 100, 100) : 0; })();
  const isSelf = currentUserAddress === creatorAddress;

  return (
    <Portal>
    <div className="w-full h-full flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* Top nav */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 absolute top-0 left-0 right-0 z-10">
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-60" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <ChevronLeft size={18} style={{ color: "#fff" }} />
        </button>
        <div className="flex gap-2">
          <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
            <Share2 size={14} style={{ color: "#fff" }} />
          </button>
          <button className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
            <Settings size={14} style={{ color: "#fff" }} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Cover */}
        <div className="relative h-36 shrink-0" style={{ background: "linear-gradient(135deg,#001a0f 0%,#002244 50%,#1a0033 100%)" }}>
          {!imgErr && profile.cover_url && (
            <img src={profile.cover_url} alt="" className="w-full h-full object-cover opacity-40" onError={() => setImgErr(true)} />
          )}
        </div>

        {/* Profile header */}
        <div className="px-4 -mt-10 pb-4">
          {/* Avatar row */}
          <div className="flex items-end justify-between mb-3">
            <Avatar src={profile.avatar_url} name={profile.username} size={72} ring />
            <div className="flex gap-2 pb-1">
              {!isSelf && (
                <button onClick={toggleFollow}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-all"
                  style={{ background: isFollowing ? "var(--color-surface)" : "var(--color-accent)", color: isFollowing ? "var(--color-text)" : "#000" }}>
                  {isFollowing ? <><UserCheck size={12} />Following</> : <><UserPlus size={12} />Follow</>}
                </button>
              )}
            </div>
          </div>

          {/* Username + social links */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-black" style={{ color: "var(--color-text)" }}>{profile.username}</span>
            {profile.is_verified && <BadgeCheck size={16} style={{ color: "var(--color-accent)" }} />}
          </div>

          {/* Social row */}
          <div className="flex items-center gap-3 mb-2">
            {profile.instagram && <a href="#" className="active:opacity-60"><Camera size={14} style={{ color: "var(--color-text-secondary)" }} /></a>}
            {profile.twitter && <a href="#" className="active:opacity-60"><AtSign size={14} style={{ color: "var(--color-text-secondary)" }} /></a>}
            {profile.website && (
              <div className="flex items-center gap-0.5">
                <Globe size={12} style={{ color: "var(--color-accent)" }} />
                <span className="text-xs" style={{ color: "var(--color-accent)" }}>{profile.website}</span>
              </div>
            )}
            <Copy size={12} style={{ color: "var(--color-text-secondary)" }} onClick={() => navigator.clipboard.writeText(profile.address).catch(() => {})} />
          </div>

          {/* Bio */}
          {profile.bio && <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--color-text-secondary)" }}>{profile.bio}</p>}

          {/* Followers */}
          <div className="flex items-center gap-3 mb-4 text-xs">
            <span><strong style={{ color: "var(--color-text)" }}>{fmtNum(profile.follower_count)}</strong> <span style={{ color: "var(--color-text-secondary)" }}>Followers</span></span>
            <span><strong style={{ color: "var(--color-text)" }}>{fmtNum(profile.following_count)}</strong> <span style={{ color: "var(--color-text-secondary)" }}>Following</span></span>
          </div>

          {/* Stats: Posts | Holders | Holding */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "Posts", value: fmtNum(profile.post_count) },
              { label: "Holders", value: fmtNum(profile.holder_count ?? 0) },
              { label: "Trades", value: fmtNum(profile.trade_count ?? 0) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: "var(--color-surface)" }}>
                <div className="text-sm font-bold" style={{ color: "var(--color-text)" }}>{value}</div>
                <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Market cap card */}
          <div className="rounded-2xl p-4 mb-3" style={{ background: "var(--color-surface)" }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[10px] font-medium mb-0.5" style={{ color: "var(--color-text-secondary)" }}>Market cap</div>
                <div className="text-2xl font-black" style={{ color: "var(--color-accent)" }}>{fmtUsd(profile.market_cap_usd ?? 0)}</div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  {fmtUsd(profile.price_usd ?? 0)} / {profile.symbol}
                </div>
              </div>
              {topHolders.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium mb-1 text-right" style={{ color: "var(--color-text-secondary)" }}>Top holders</div>
                  <div className="flex -space-x-1">
                    {topHolders.slice(0, 3).map((h, i) => (
                      <div key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2" style={{ background: "linear-gradient(135deg,#00ff88,#00aaff)", color: "#000", borderColor: "var(--color-surface)" }}>
                        {shortAddr(h.holder)[0]}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ATH bar */}
            <div className="mb-3">
              <div className="flex justify-between text-[10px] mb-1" style={{ color: "var(--color-text-secondary)" }}>
                <span>ATH {fmtUsd(profile.ath_usd ?? 0)}</span>
                <span>{athPct.toFixed(0)}% of ATH</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${athPct}%`, background: "var(--color-accent)" }} />
              </div>
            </div>

            {/* Trade / Edit */}
            {isSelf ? (
              <button className="w-full py-3 rounded-xl font-bold text-sm" style={{ background: "var(--color-border)", color: "var(--color-text)" }}>
                Edit Profile
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setShowTrade(true)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
                  style={{ background: "var(--color-accent)", color: "#000" }}>
                  <BarChart2 size={14} /> Trade {profile.symbol}
                </button>
                <button className="px-4 py-3 rounded-xl font-bold text-sm" style={{ background: "var(--color-border)", color: "var(--color-text)" }}>
                  Share
                </button>
              </div>
            )}
          </div>

          {/* Chain badges */}
          <div className="flex gap-2 mb-4">
            {CHAINS.map(c => (
              <div key={c} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold" style={{ background: `${CHAIN_COLOR[c]}18`, color: CHAIN_COLOR[c] }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: CHAIN_COLOR[c] }} /> {c}
              </div>
            ))}
          </div>

          {/* Grid tabs */}
          <div className="flex items-center gap-1 mb-3 p-1 rounded-xl" style={{ background: "var(--color-surface)" }}>
            {([
              { key: "posts", icon: Grid3X3 },
              { key: "collected", icon: ShoppingBag },
              { key: "activity", icon: Activity },
            ] as const).map(({ key, icon: Icon }) => (
              <button key={key} onClick={() => setGridTab(key)}
                className="flex-1 py-2 rounded-lg flex items-center justify-center"
                style={{ background: gridTab === key ? "var(--color-accent)" : "transparent", color: gridTab === key ? "#000" : "var(--color-text-secondary)" }}>
                <Icon size={16} />
              </button>
            ))}
          </div>

          {/* Posts grid */}
          {gridTab === "posts" && (
            <div className="grid grid-cols-3 gap-0.5">
              {posts.length === 0 && <div className="col-span-3 text-center py-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>No posts yet</div>}
              {posts.map(p => (
                <button key={p.id} onClick={() => onOpenPost(p)} className="relative active:opacity-80" style={{ aspectRatio: "1/1", overflow: "hidden" }}>
                  <img src={p.image_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div className="absolute bottom-0 left-0 right-0 p-1" style={{ background: "linear-gradient(transparent,rgba(0,0,0,0.7))" }}>
                    <div className="text-[9px] text-white/80 font-mono">{p.mint_count} mints</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {gridTab === "collected" && (
            <div className="text-center py-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>No collectibles yet</div>
          )}

          {gridTab === "activity" && (
            <div className="space-y-2">
              {posts.slice(0, 10).map(p => (
                <div key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: "var(--color-surface)" }}>
                  <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--color-text)" }}>Minted "{p.title}"</p>
                    <p className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{p.mint_count} collectors · {timeAgo(p.created_at)}</p>
                  </div>
                  <div className="text-xs font-bold" style={{ color: "var(--color-accent)" }}>{p.mint_price} {p.mint_currency}</div>
                </div>
              ))}
            </div>
          )}

          <div className="h-16" />
        </div>
      </div>

      {showTrade && <TradeSheet creator={profile} onClose={() => setShowTrade(false)} />}
    </div>
    </Portal>
  );
}

/* ─── POST CARD ──────────────────────────────────────────────────────────────── */
function PostCard({ post, likedIds, onLike, onMint, onOpen, onCreator }: {
  post: Post; likedIds: Set<string>;
  onLike: (id: string) => void; onMint: (p: Post) => void;
  onOpen: (p: Post) => void; onCreator: (a: string) => void;
}) {
  const liked = likedIds.has(post.id);
  const [imgErr, setImgErr] = useState(false);
  const soldOut = post.max_supply !== null && post.mint_count >= post.max_supply;

  return (
    <div className="mb-4 mx-3 rounded-2xl overflow-hidden" style={{ background: "var(--color-surface)" }}>
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <button onClick={() => onCreator(post.creator)}>
          <Avatar src={post.creator_avatar} name={post.creator_name} size={38} ring />
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={() => onCreator(post.creator)} className="flex items-center gap-1 active:opacity-70">
            <span className="font-semibold text-sm truncate" style={{ color: "var(--color-text)" }}>{post.creator_name}</span>
            {post.is_verified && <BadgeCheck size={12} style={{ color: "var(--color-accent)" }} />}
          </button>
          <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{shortAddr(post.creator)} · {timeAgo(post.created_at)}</div>
        </div>
        <div className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,255,136,0.12)", color: "var(--color-accent)" }}>BSV</div>
      </div>

      <div className="relative cursor-pointer" style={{ aspectRatio: "1/1", background: "#000" }} onClick={() => onOpen(post)}>
        {!imgErr
          ? <img src={post.image_url} alt="" className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : <div className="w-full h-full flex items-center justify-center text-5xl">🖼️</div>
        }
        <div className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.65)", color: "#fff", backdropFilter: "blur(4px)" }}>
          #{post.inscription_id?.slice(0, 8)}…
        </div>
        <div className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.65)", color: "var(--color-accent)", backdropFilter: "blur(4px)" }}>
          {CAT_ICONS[post.category]} {post.category}
        </div>
        <div className="absolute bottom-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: "rgba(0,0,0,0.65)", color: "#fff", backdropFilter: "blur(4px)" }}>
          <Sparkles size={9} />{fmtNum(post.mint_count)} minted
        </div>
      </div>

      <div className="flex items-center gap-1 px-3 pt-2.5">
        <button onClick={() => onLike(post.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all active:scale-90"
          style={{ background: liked ? "rgba(255,60,60,0.15)" : "rgba(255,255,255,0.05)", color: liked ? "#ff4444" : "var(--color-text-secondary)" }}>
          <Heart size={15} fill={liked ? "#ff4444" : "none"} stroke={liked ? "#ff4444" : "currentColor"} />
          <span className="text-xs font-medium">{fmtNum(post.like_count + (liked ? 1 : 0))}</span>
        </button>
        <button onClick={() => onOpen(post)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl active:scale-90"
          style={{ background: "rgba(255,255,255,0.05)", color: "var(--color-text-secondary)" }}>
          <MessageCircle size={15} />
          <span className="text-xs font-medium">{fmtNum(post.comment_count)}</span>
        </button>
        <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl active:scale-90"
          style={{ background: "rgba(255,255,255,0.05)", color: "var(--color-text-secondary)" }}
          onClick={() => navigator.share?.({ title: post.title, text: post.description }).catch(() => {})}>
          <Share2 size={15} />
        </button>
        <div className="flex-1" />
        <button onClick={() => !soldOut && onMint(post)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs active:scale-95 transition-all"
          style={{ background: soldOut ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,var(--color-accent),#00aaff)", color: soldOut ? "var(--color-text-secondary)" : "#000", opacity: soldOut ? 0.5 : 1 }}>
          <Zap size={12} />
          {soldOut ? "Sold Out" : `Collect · ${safePrice(post.mint_price)} ${post.mint_currency}`}
        </button>
      </div>

      <div className="px-3 pb-1"><SupplyBar minted={post.mint_count} max={post.max_supply} /></div>
      <div className="px-3 pb-3 mt-1">
        <p className="text-sm font-bold" style={{ color: "var(--color-text)" }}>{post.title}</p>
        {post.description && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>{post.description}</p>}
        {post.tags && (() => {
          try {
            const tags: string[] = JSON.parse(post.tags);
            return <div className="flex flex-wrap gap-1 mt-1.5">{tags.slice(0, 4).map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,255,136,0.08)", color: "var(--color-accent)" }}>#{t}</span>)}</div>;
          } catch { return null; }
        })()}
      </div>
    </div>
  );
}

/* ─── POST DETAIL SHEET ──────────────────────────────────────────────────────── */
function PostDetailSheet({ post, onClose, onMint, onLike, liked, onCreator }: {
  post: Post; onClose: () => void; onMint: (p: Post) => void;
  onLike: (id: string) => void; liked: boolean; onCreator: (a: string) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingC, setLoadingC] = useState(true);
  const [imgErr, setImgErr] = useState(false);
  const { address } = useWalletStore();
  const soldOut = post.max_supply !== null && post.mint_count >= post.max_supply;

  useEffect(() => {
    fetch(`${API}/social/posts/${post.id}`).then(r => r.json()).then(d => setComments(d.comments ?? [])).catch(() => {}).finally(() => setLoadingC(false));
  }, [post.id]);

  async function submitComment() {
    if (!commentText.trim() || !address) return;
    const txt = commentText; setCommentText("");
    await fetch(`${API}/social/posts/${post.id}/comment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: address, content: txt, display_name: shortAddr(address) }) }).catch(() => {});
    const d = await fetch(`${API}/social/posts/${post.id}`).then(r => r.json()).catch(() => ({}));
    setComments(d.comments ?? []);
  }

  return (
    <Portal>
    <div className="w-full h-full flex flex-col" style={{ background: "var(--color-bg)" }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
        <button onClick={onClose}><ChevronLeft size={22} style={{ color: "var(--color-text)" }} /></button>
        <button onClick={() => { onClose(); onCreator(post.creator); }}>
          <Avatar src={post.creator_avatar} name={post.creator_name} size={30} ring />
        </button>
        <div className="flex-1">
          <button onClick={() => { onClose(); onCreator(post.creator); }} className="flex items-center gap-1">
            <span className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>{post.creator_name}</span>
            {post.is_verified && <BadgeCheck size={12} style={{ color: "var(--color-accent)" }} />}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="relative" style={{ aspectRatio: "1/1", background: "#000" }}>
          {!imgErr ? <img src={post.image_url} alt="" className="w-full h-full object-cover" onError={() => setImgErr(true)} /> : <div className="w-full h-full flex items-center justify-center text-6xl">🖼️</div>}
        </div>
        <div className="p-4">
          <h2 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>{post.title}</h2>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>{post.description}</p>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[{ label: "Minted", value: fmtNum(post.mint_count) }, { label: "Likes", value: fmtNum(post.like_count + (liked ? 1 : 0)) }, { label: "Supply", value: post.max_supply ? fmtNum(post.max_supply) : "∞" }].map(({ label, value }) => (
              <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: "var(--color-surface)" }}>
                <div className="text-base font-bold" style={{ color: "var(--color-text)" }}>{value}</div>
                <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-3"><SupplyBar minted={post.mint_count} max={post.max_supply} /></div>
          <div className="mt-3 rounded-xl p-3 flex items-center gap-2" style={{ background: "var(--color-surface)" }}>
            <Layers size={14} style={{ color: "var(--color-accent)" }} />
            <div className="flex-1 min-w-0">
              <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>BSV Inscription ID</div>
              <div className="text-xs font-mono truncate" style={{ color: "var(--color-text)" }}>{post.inscription_id}</div>
            </div>
            <button onClick={() => navigator.clipboard.writeText(post.inscription_id).catch(() => {})}><Copy size={14} style={{ color: "var(--color-text-secondary)" }} /></button>
          </div>
          {post.tags && (() => { try { const t: string[] = JSON.parse(post.tags); return <div className="flex flex-wrap gap-1.5 mt-3">{t.map(g => <span key={g} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,255,136,0.1)", color: "var(--color-accent)" }}>#{g}</span>)}</div>; } catch { return null; } })()}
        </div>
        <div className="px-4 pb-2">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Comments</span>
            <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{post.comment_count}</span>
          </div>
          {loadingC ? <div className="text-center py-6 text-xs" style={{ color: "var(--color-text-secondary)" }}>Loading…</div>
            : comments.length === 0 ? <div className="text-center py-6 text-xs" style={{ color: "var(--color-text-secondary)" }}>Be the first to comment</div>
            : comments.map(c => (
              <div key={c.id} className="flex gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>{c.display_name?.[0]?.toUpperCase() ?? "?"}</div>
                <div><div className="flex items-center gap-1.5"><span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>{c.display_name}</span><span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{timeAgo(c.created_at)}</span></div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{c.content}</p></div>
              </div>
            ))}
        </div>
        <div className="h-24" />
      </div>
      <div className="border-t px-3 pt-3 shrink-0"
        style={{ borderColor: "var(--color-border)", background: "var(--color-bg)", paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
        <button onClick={() => !soldOut && onMint(post)} disabled={soldOut}
          className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 mb-3 active:opacity-80 transition-all"
          style={{ background: soldOut ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,var(--color-accent),#00aaff)", color: soldOut ? "var(--color-text-secondary)" : "#000", opacity: soldOut ? 0.4 : 1 }}>
          <Zap size={16} />{soldOut ? "Sold Out" : `Collect for ${safePrice(post.mint_price)} ${post.mint_currency}`}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => onLike(post.id)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl justify-center active:scale-90 transition-all shrink-0"
            style={{ background: liked ? "rgba(255,60,60,0.15)" : "rgba(255,255,255,0.06)", color: liked ? "#ff4444" : "var(--color-text-secondary)", border: liked ? "1px solid rgba(255,60,60,0.3)" : "1px solid var(--color-border)" }}>
            <Heart size={16} fill={liked ? "#ff4444" : "none"} stroke={liked ? "#ff4444" : "currentColor"} />
            <span className="text-xs font-bold ml-1">{fmtNum(post.like_count + (liked ? 1 : 0))}</span>
          </button>
          <div className="flex flex-1 items-center rounded-xl overflow-hidden" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <input className="flex-1 bg-transparent text-xs px-3 py-2.5 outline-none min-w-0" style={{ color: "var(--color-text)" }}
              placeholder={address ? "Add a comment…" : "Connect wallet to comment"} value={commentText}
              onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === "Enter" && submitComment()} disabled={!address} />
            {commentText.trim() && <button onClick={submitComment} className="px-3 py-2.5 shrink-0 active:opacity-60" style={{ color: "var(--color-accent)" }}><Send size={14} /></button>}
          </div>
          <button className="flex items-center gap-1 px-3 py-2.5 rounded-xl shrink-0"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
            onClick={() => navigator.share?.({ title: post.title, url: window.location.href }).catch(() => {})}>
            <Share2 size={14} />
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

/* ─── MINT SHEET ─────────────────────────────────────────────────────────────── */
function MintSheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const [minted, setMinted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { address } = useWalletStore();
  const [, navigate] = useLocation();

  async function doMint() {
    if (!address) { navigate("/settings"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/social/posts/${post.id}/mint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minter: address }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Mint failed");
      setMinted(true);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <Portal>
    <div className="w-full h-full flex items-end" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5 pb-8" style={{ background: "var(--color-bg)", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        {minted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🎉</div>
            <h3 className="text-xl font-bold mb-1" style={{ color: "var(--color-text)" }}>Collected!</h3>
            <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>{post.title} is permanently on BSV.</p>
            <div className="text-xs font-mono px-3 py-1.5 rounded-xl inline-block mb-4" style={{ background: "var(--color-surface)", color: "var(--color-accent)" }}>{post.inscription_id.slice(0, 24)}…</div>
            <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-sm" style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-14 h-14 rounded-xl overflow-hidden" style={{ background: "var(--color-surface)" }}><img src={post.image_url} alt="" className="w-full h-full object-cover" /></div>
              <div className="flex-1">
                <h3 className="font-bold text-base" style={{ color: "var(--color-text)" }}>{post.title}</h3>
                <div className="flex items-center gap-1 mt-0.5"><span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>by {post.creator_name}</span>{post.is_verified && <BadgeCheck size={11} style={{ color: "var(--color-accent)" }} />}</div>
              </div>
              <button onClick={onClose}><X size={20} style={{ color: "var(--color-text-secondary)" }} /></button>
            </div>
            {[["Chain", "BSV (on-chain inscription)"], ["Price", `${safePrice(post.mint_price)} ${post.mint_currency} ≈ $${post.mint_price_usd}`], ["Minted", `${fmtNum(post.mint_count)}${post.max_supply ? ` / ${fmtNum(post.max_supply)}` : " (open edition)"}`], ["Inscription", `${post.inscription_id.slice(0, 20)}…`]].map(([l, v]) => (
              <div key={l} className="flex justify-between py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{l}</span>
                <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{v}</span>
              </div>
            ))}
            <div className="mt-3"><SupplyBar minted={post.mint_count} max={post.max_supply} /></div>
            {!address && <div className="mt-4 p-3 rounded-xl flex items-center gap-2" style={{ background: "rgba(255,170,0,0.12)" }}><Lock size={14} style={{ color: "#ffaa00" }} /><span className="text-xs" style={{ color: "#ffaa00" }}>Connect wallet to collect</span></div>}
            {error && <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}>{error}</div>}
            <button onClick={doMint} disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm mt-5 flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,var(--color-accent),#00aaff)", color: "#000" }}>
              {loading ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" /> : <><Zap size={16} />{address ? `Collect for ${safePrice(post.mint_price)} ${post.mint_currency}` : "Connect Wallet"}</>}
            </button>
          </>
        )}
      </div>
    </div>
    </Portal>
  );
}

/* ─── SEARCH TAB ─────────────────────────────────────────────────────────────── */
const CHAIN_BADGE: Record<string, { bg: string; label: string }> = {
  BSV:   { bg: "#f7931a", label: "BSV" },
  ETH:   { bg: "#627eea", label: "ETH" },
  BASE:  { bg: "#0052ff", label: "BASE" },
  SOL:   { bg: "#9945ff", label: "SOL" },
  ZORA:  { bg: "#00aaff", label: "ZORA" },
};

function ChainBadge({ chain }: { chain: string }) {
  const cfg = CHAIN_BADGE[chain] ?? { bg: "#666", label: chain };
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: cfg.bg + "33", color: cfg.bg, border: `1px solid ${cfg.bg}44` }}>
      {cfg.label}
    </span>
  );
}

function ExternalNFTCard({ item, onLink }: { item: any; onLink: (url: string) => void }) {
  const [imgErr, setImgErr] = useState(false);
  const price = typeof item.mint_price === "number" ? item.mint_price : parseFloat(item.mint_price ?? "0");
  return (
    <button onClick={() => onLink(item.external_url)} className="flex items-center gap-3 p-3 rounded-xl w-full text-left active:opacity-75 transition-all"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0" style={{ background: "var(--color-surface-2, #1a1a2e)" }}>
        {!imgErr ? <img src={item.image_url} alt="" className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : <div className="w-full h-full flex items-center justify-center text-2xl">🖼️</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>{item.title}</span>
          <ChainBadge chain={item.chain} />
        </div>
        <div className="text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>{item.creator_name}</div>
        <div className="text-[10px] mt-0.5" style={{ color: "#aaa" }}>{item.marketplace}</div>
      </div>
      <div className="text-right shrink-0">
        {price > 0 && <div className="text-xs font-bold" style={{ color: "var(--color-accent)" }}>{price < 0.001 ? price.toExponential(2) : price.toFixed(4)}</div>}
        {price > 0 && <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{item.mint_currency}</div>}
        <ExternalLink size={11} className="mt-1 ml-auto" style={{ color: "var(--color-text-secondary)" }} />
      </div>
    </button>
  );
}

function SearchTab({ onCreator, onOpenPost }: { onCreator: (a: string) => void; onOpenPost: (p: Post) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ creators: any[]; posts: Post[] } | null>(null);
  const [coins, setCoins] = useState<any[]>([]);
  const [loadingCoins, setLoadingCoins] = useState(true);
  const [external, setExternal] = useState<{ zora: any[]; magicEden: any[] } | null>(null);
  const [loadingExt, setLoadingExt] = useState(true);
  const [exploreSection, setExploreSection] = useState<"coins" | "zora" | "sol">("coins");

  useEffect(() => {
    fetch(`${API}/social/trending-coins`).then(r => r.json()).then(d => setCoins(d.coins ?? [])).catch(() => {}).finally(() => setLoadingCoins(false));
    fetch(`${API}/social/external/trending`).then(r => r.json()).then(d => setExternal({ zora: d.zora ?? [], magicEden: d.magicEden ?? [] })).catch(() => setExternal({ zora: [], magicEden: [] })).finally(() => setLoadingExt(false));
  }, []);

  useEffect(() => {
    if (!q) { setResults(null); return; }
    const t = setTimeout(() => {
      fetch(`${API}/social/search?q=${encodeURIComponent(q)}`).then(r => r.json()).then(setResults).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  function openExternal(url: string) {
    window.open(url, "_blank", "noopener");
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--color-surface)" }}>
          <Search size={15} style={{ color: "var(--color-text-secondary)" }} />
          <input className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--color-text)" }}
            placeholder="Search creators, posts, coins…" value={q} onChange={e => setQ(e.target.value)} />
          {q && <button onClick={() => setQ("")}><X size={14} style={{ color: "var(--color-text-secondary)" }} /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-28">
        {!q && (
          <>
            {/* Section toggle pills */}
            <div className="flex gap-2 mb-3 mt-1">
              {([["coins", "🔥 BSV Creator Coins"], ["zora", "⚡ Zora · Base · ETH"], ["sol", "🌊 Magic Eden · SOL"]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setExploreSection(key)}
                  className="flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                  style={{ background: exploreSection === key ? "var(--color-accent)" : "var(--color-surface)", color: exploreSection === key ? "#000" : "var(--color-text-secondary)" }}>
                  {label}
                </button>
              ))}
            </div>

            {exploreSection === "coins" && (
              <>
                {loadingCoins ? (
                  <div className="flex items-center justify-center h-24"><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-accent)" }} /></div>
                ) : coins.length === 0 ? (
                  <div className="text-center py-8 text-sm" style={{ color: "var(--color-text-secondary)" }}>No creator coins yet</div>
                ) : coins.map((c, i) => (
                  <button key={c.address} onClick={() => onCreator(c.address)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl mb-2 active:opacity-80 transition-all"
                    style={{ background: "var(--color-surface)" }}>
                    <div className="text-sm font-bold w-5 shrink-0" style={{ color: "var(--color-text-secondary)" }}>{i + 1}</div>
                    <Avatar src={c.avatar_url} name={c.username} size={38} ring />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-sm truncate" style={{ color: "var(--color-text)" }}>{c.username}</span>
                        {c.is_verified && <BadgeCheck size={11} style={{ color: "var(--color-accent)" }} />}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                        <span className="font-mono font-bold" style={{ color: "var(--color-accent)" }}>{c.symbol}</span>
                        {" "}· {fmtNum(c.holder_count ?? 0)} holders · <ChainBadge chain="BSV" />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold" style={{ color: "var(--color-text)" }}>{fmtUsd(c.market_cap_usd)}</div>
                      <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{fmtUsd(c.price_usd)}</div>
                    </div>
                    <ChevronRight size={14} style={{ color: "var(--color-text-secondary)" }} />
                  </button>
                ))}
              </>
            )}

            {exploreSection === "zora" && (
              <>
                <div className="text-xs mb-2" style={{ color: "var(--color-text-secondary)" }}>Live trending mints from Zora, Base & Ethereum</div>
                {loadingExt ? (
                  <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "#0052ff" }} /></div>
                ) : (external?.zora ?? []).length === 0 ? (
                  <div className="text-center py-8 text-sm" style={{ color: "var(--color-text-secondary)" }}>Couldn't reach Zora — try again</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(external?.zora ?? []).map((item: any) => <ExternalNFTCard key={item.id} item={item} onLink={openExternal} />)}
                  </div>
                )}
              </>
            )}

            {exploreSection === "sol" && (
              <>
                <div className="text-xs mb-2" style={{ color: "var(--color-text-secondary)" }}>Top 24h collections from Magic Eden · Solana</div>
                {loadingExt ? (
                  <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "#9945ff" }} /></div>
                ) : (external?.magicEden ?? []).length === 0 ? (
                  <div className="text-center py-8 text-sm" style={{ color: "var(--color-text-secondary)" }}>Couldn't reach Magic Eden — try again</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(external?.magicEden ?? []).map((item: any) => <ExternalNFTCard key={item.id} item={item} onLink={openExternal} />)}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {results && (
          <>
            {results.creators.length > 0 && (
              <>
                <div className="text-xs font-bold mb-2 mt-2" style={{ color: "var(--color-text-secondary)" }}>CREATORS</div>
                {results.creators.map(c => (
                  <button key={c.address} onClick={() => onCreator(c.address)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl mb-2 active:opacity-80"
                    style={{ background: "var(--color-surface)" }}>
                    <Avatar src={c.avatar_url} name={c.username} size={40} ring />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>{c.username}</span>
                        {c.is_verified && <BadgeCheck size={11} style={{ color: "var(--color-accent)" }} />}
                      </div>
                      <div className="text-xs font-mono" style={{ color: "var(--color-accent)" }}>{c.symbol} · {fmtUsd(c.market_cap_usd)} mcap</div>
                    </div>
                    <div className="text-xs font-bold" style={{ color: "var(--color-text-secondary)" }}>{fmtNum(c.follower_count)} followers</div>
                  </button>
                ))}
              </>
            )}
            {results.posts.length > 0 && (
              <>
                <div className="text-xs font-bold mb-2 mt-3" style={{ color: "var(--color-text-secondary)" }}>POSTS</div>
                {results.posts.map(p => (
                  <button key={p.id} onClick={() => onOpenPost(p as Post)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl mb-2 active:opacity-80"
                    style={{ background: "var(--color-surface)" }}>
                    <img src={p.image_url} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>{p.title}</p>
                      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{p.creator_name} · {fmtNum(p.mint_count)} mints</p>
                    </div>
                    <div className="text-xs font-bold shrink-0" style={{ color: "var(--color-accent)" }}>{p.mint_price} {p.mint_currency}</div>
                  </button>
                ))}
              </>
            )}
            {results.creators.length === 0 && results.posts.length === 0 && (
              <div className="text-center py-12 text-sm" style={{ color: "var(--color-text-secondary)" }}>No results for "{q}"</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── CREATE TAB ─────────────────────────────────────────────────────────────── */
function CreateTab({ onSuccess }: { onSuccess: () => void }) {
  const { address } = useWalletStore();
  const [form, setForm] = useState({ title: "", description: "", imageUrl: "", mintPrice: "0.01", mintCurrency: "BSV", category: "art", maxSupply: "", chain: "BSV" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const inp: React.CSSProperties = { background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "10px 12px", fontSize: 14, width: "100%", outline: "none" };

  async function submit() {
    if (!address) { setError("Connect your wallet first"); return; }
    if (!form.title || !form.imageUrl) { setError("Title and image URL are required"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/social/posts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator: address, creator_name: shortAddr(address), title: form.title, description: form.description, image_url: form.imageUrl, mint_price: parseFloat(form.mintPrice) || 0.01, mint_currency: form.mintCurrency, category: form.category, max_supply: form.maxSupply ? parseInt(form.maxSupply, 10) : null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      // ensure creator profile + coin
      await fetch(`${API}/social/creators/${address}`, { method: "GET" }).catch(() => {});
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onSuccess(); }, 2000);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (success) return (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <div className="text-6xl mb-4">✨</div>
      <h3 className="text-xl font-bold mb-2" style={{ color: "var(--color-text)" }}>Inscribed on BSV!</h3>
      <p className="text-sm text-center px-6" style={{ color: "var(--color-text-secondary)" }}>Your post is permanently on the BSV blockchain. Your creator coin was auto-created.</p>
    </div>
  );

  return (
    <div className="p-4 pb-32 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-1" style={{ color: "var(--color-text)" }}>Create Post</h2>
      <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>Every post = NFT inscription on BSV + tradeable creator coin. Multichain support via OrahBridge.</p>

      {form.imageUrl && <div className="rounded-2xl overflow-hidden mb-4" style={{ aspectRatio: "1/1" }}><img src={form.imageUrl} alt="" className="w-full h-full object-cover" onError={() => setForm(f => ({ ...f, imageUrl: "" }))} /></div>}
      {!form.imageUrl && (
        <div className="rounded-2xl flex flex-col items-center justify-center gap-2 mb-4" style={{ aspectRatio: "1/1", background: "var(--color-surface)", border: "2px dashed var(--color-border)" }}>
          <Upload size={32} style={{ color: "var(--color-text-secondary)" }} />
          <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Paste image URL below</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div><label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Image URL *</label><input style={inp} placeholder="https://…" value={form.imageUrl} onChange={set("imageUrl")} /></div>
        <div><label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Title *</label><input style={inp} placeholder="Name your creation" value={form.title} onChange={set("title")} maxLength={100} /></div>
        <div><label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Description</label><textarea style={{ ...inp, resize: "none" } as React.CSSProperties} rows={3} placeholder="What is this about?" value={form.description} onChange={set("description")} maxLength={500} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Mint Price</label><input style={inp} type="number" min="0" step="0.001" value={form.mintPrice} onChange={set("mintPrice")} /></div>
          <div><label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Currency</label>
            <select style={inp} value={form.mintCurrency} onChange={set("mintCurrency")}>{CHAINS.map(c => <option key={c}>{c}</option>)}</select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Category</label><select style={inp} value={form.category} onChange={set("category")}>{CATEGORIES.filter(c => c !== "all").map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}</select></div>
          <div><label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Max Supply</label><input style={inp} type="number" min="1" placeholder="Open edition" value={form.maxSupply} onChange={set("maxSupply")} /></div>
        </div>

        {/* Multichain info */}
        <div className="rounded-xl p-3" style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)" }}>
          <div className="text-xs font-bold mb-2" style={{ color: "var(--color-accent)" }}>🌐 Multichain NFT + Coin</div>
          <div className="flex flex-wrap gap-1.5">
            {CHAINS.map(c => <span key={c} className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${CHAIN_COLOR[c]}20`, color: CHAIN_COLOR[c] }}>{c}</span>)}
          </div>
          <p className="text-[11px] mt-2" style={{ color: "var(--color-text-secondary)" }}>Inscribed on BSV · Bridgeable to ETH, BNB, SOL via OrahBridge · Creator coin auto-created on first post</p>
        </div>

        {error && <div className="p-3 rounded-xl text-xs" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}>{error}</div>}
        <button onClick={submit} disabled={loading || !form.title || !form.imageUrl}
          className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,var(--color-accent),#00aaff)", color: "#000" }}>
          {loading ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" /> : <><Zap size={15} /> Inscribe on BSV</>}
        </button>
      </div>
    </div>
  );
}

/* ─── MY PROFILE TAB ─────────────────────────────────────────────────────────── */
function MyProfileTab({ onOpenCreator, onOpenPost }: { onOpenCreator: (a: string) => void; onOpenPost: (p: Post) => void }) {
  const { address } = useWalletStore();
  const [, navigate] = useLocation();
  if (!address) return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-8">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}><User size={28} style={{ color: "var(--color-text-secondary)" }} /></div>
      <p className="text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>Connect your wallet to see your profile and creator coin</p>
      <button onClick={() => navigate("/settings")} className="px-6 py-2.5 rounded-xl font-bold text-sm" style={{ background: "var(--color-accent)", color: "#000" }}>Connect Wallet</button>
    </div>
  );
  // Redirect to full creator profile view
  useEffect(() => { if (address) onOpenCreator(address); }, [address]);
  return <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-accent)" }} /></div>;
}

/* ─── FEED TAB ───────────────────────────────────────────────────────────────── */
function FeedTab({ likedIds, onLike, onMint, onOpen, onCreator }: {
  likedIds: Set<string>; onLike: (id: string) => void;
  onMint: (p: Post) => void; onOpen: (p: Post) => void; onCreator: (a: string) => void;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"hot" | "new" | "top">("hot");
  const [category, setCategory] = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ sort, limit: "20" });
    if (category !== "all") params.set("category", category);
    if (search) params.set("q", search);
    fetch(`${API}/social/feed?${params}`).then(r => r.json()).then(d => setPosts(d.posts ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, [sort, category, search]);

  useEffect(() => { load(); }, [load]);

  const SORTS = [{ key: "hot" as const, icon: Flame, label: "Hot" }, { key: "new" as const, icon: Clock, label: "New" }, { key: "top" as const, icon: Star, label: "Top" }];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-3 pt-2 pb-1 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2" style={{ background: "var(--color-surface)" }}>
          <Search size={14} style={{ color: "var(--color-text-secondary)" }} />
          <input className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--color-text)" }} placeholder="Search posts…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 mb-2">
          {SORTS.map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => setSort(key)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
              style={{ background: sort === key ? "var(--color-accent)" : "var(--color-surface)", color: sort === key ? "#000" : "var(--color-text-secondary)" }}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all"
              style={{ background: category === c ? "rgba(0,255,136,0.15)" : "var(--color-surface)", color: category === c ? "var(--color-accent)" : "var(--color-text-secondary)", border: category === c ? "1px solid rgba(0,255,136,0.3)" : "1px solid transparent" }}>
              {CAT_ICONS[c]} {c}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pt-2">
        {loading ? (
          <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-accent)" }} /></div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: "var(--color-text-secondary)" }}>No posts found</div>
        ) : (
          <>{posts.map(p => <PostCard key={p.id} post={p} likedIds={likedIds} onLike={onLike} onMint={onMint} onOpen={onOpen} onCreator={onCreator} />)}<div className="h-32" /></>
        )}
      </div>
    </div>
  );
}

/* ─── ROOT ───────────────────────────────────────────────────────────────────── */
export function MobileNFT() {
  const [activeTab, setActiveTab] = useState<"feed" | "search" | "create" | "profile">("feed");
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [mintPost, setMintPost] = useState<Post | null>(null);
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);
  const { address } = useWalletStore();

  function handleLike(id: string) {
    setLikedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    if (address) fetch(`${API}/social/posts/${id}/like`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: address }) }).catch(() => {});
  }

  function openCreator(addr: string) { setCreatorAddress(addr); }
  function openPost(p: Post) { setDetailPost(p); }

  const INNER_TABS = [
    { key: "feed"    as const, label: "Feed",    Icon: Layers },
    { key: "search"  as const, label: "Search",  Icon: Search },
    { key: "create"  as const, label: "Create",  Icon: PlusSquare },
    { key: "profile" as const, label: "Profile", Icon: User },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div>
          <h1 className="text-lg font-black tracking-tight" style={{ color: "var(--color-text)" }}>Orah<span style={{ color: "var(--color-accent)" }}>NFT</span></h1>
          <div className="text-[10px] font-mono" style={{ color: "var(--color-text-secondary)" }}>BSV · Multichain · Creator Coins</div>
        </div>
        <div className="flex items-center gap-2">
          {address && (
            <button onClick={() => openCreator(address)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl active:opacity-70" style={{ background: "var(--color-surface)" }}>
              <Avatar src={undefined} name={address} size={18} />
              <span className="text-[10px] font-mono" style={{ color: "var(--color-text-secondary)" }}>{shortAddr(address)}</span>
            </button>
          )}
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--color-accent)" }} /><span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>live</span></div>
        </div>
      </div>

      {/* Inner nav */}
      <div className="flex shrink-0 px-3 pt-2 pb-1 gap-1" style={{ borderBottom: "1px solid var(--color-border)" }}>
        {INNER_TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-all"
            style={{ background: activeTab === key ? "rgba(0,255,136,0.1)" : "transparent", color: activeTab === key ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
            <Icon size={18} /><span className="text-[9px] font-semibold">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "feed"    && <FeedTab    likedIds={likedIds} onLike={handleLike} onMint={setMintPost} onOpen={openPost} onCreator={openCreator} />}
        {activeTab === "search"  && <SearchTab  onCreator={openCreator} onOpenPost={openPost} />}
        {activeTab === "create"  && <CreateTab  onSuccess={() => setActiveTab("feed")} />}
        {activeTab === "profile" && <MyProfileTab onOpenCreator={openCreator} onOpenPost={openPost} />}
      </div>

      {/* OVERLAYS */}
      {creatorAddress && (
        <CreatorProfileSheet
          creatorAddress={creatorAddress}
          currentUserAddress={address}
          onClose={() => setCreatorAddress(null)}
          onOpenPost={p => { setCreatorAddress(null); openPost(p); }}
        />
      )}
      {detailPost && (
        <PostDetailSheet
          post={detailPost}
          onClose={() => setDetailPost(null)}
          onMint={p => { setDetailPost(null); setMintPost(p); }}
          onLike={handleLike}
          liked={likedIds.has(detailPost.id)}
          onCreator={a => { setDetailPost(null); openCreator(a); }}
        />
      )}
      {mintPost && <MintSheet post={mintPost} onClose={() => setMintPost(null)} />}
    </div>
  );
}
