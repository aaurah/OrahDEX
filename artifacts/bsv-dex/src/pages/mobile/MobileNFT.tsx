import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Heart, MessageCircle, Share2, Zap, BadgeCheck, Search,
  TrendingUp, PlusSquare, User, ChevronLeft, X, Upload,
  Flame, Clock, Star, Lock, Layers, Copy, Send, Globe,
  AtSign, Camera, ArrowUpRight, ArrowDownRight,
  UserPlus, UserCheck, BarChart2, Grid3X3, Activity,
  ShoppingBag, Settings, ChevronRight, RefreshCw, Sparkles, ExternalLink, Edit3, Link, ImageIcon, Trash2, AlertCircle,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { useBsvBalance } from "@/hooks/useBsvBalance";
import { useLocation } from "wouter";
import { disconnectReown } from "@/lib/reown";
import { resolveNftSpendBalance } from "@/lib/nftBalance";

const API = "/api";

const MODAL_ROOT_STYLE: React.CSSProperties = {
  position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
  pointerEvents: "auto", display: "flex", flexDirection: "column",
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>BSV to spend</label>
                  {availableLabel && (
                    <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                      Available: <span className="font-mono font-medium" style={{ color: insufficientFunds ? "#ff4444" : "var(--color-text)" }}>{availableLabel}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--color-surface)", border: `1px solid ${insufficientFunds ? "rgba(255,68,68,0.6)" : "var(--color-border)"}` }}>
                  <input className="flex-1 bg-transparent text-sm font-medium outline-none" style={{ color: "var(--color-text)" }}
                    type="number" min="0.001" step="0.001" value={bsvAmount} onChange={e => setBsvAmount(e.target.value)} />
                  <span className="text-xs font-bold" style={{ color: "var(--color-accent)" }}>BSV</span>
                </div>
                {insufficientFunds && <p className="text-xs mt-1" style={{ color: "#ff4444" }}>Insufficient balance</p>}
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>Tokens to sell</label>
                  {holdingAmount !== null && (
                    <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                      Held: <span className="font-mono font-medium" style={{ color: insufficientTokens ? "#ff4444" : "var(--color-text)" }}>{fmtNum(holdingAmount)}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--color-surface)", border: `1px solid ${insufficientTokens ? "rgba(255,68,68,0.6)" : "var(--color-border)"}` }}>
                  <input className="flex-1 bg-transparent text-sm font-medium outline-none" style={{ color: "var(--color-text)" }}
                    type="number" min="1" step="1000" value={tokenAmount} onChange={e => setTokenAmount(e.target.value)} />
                  <span className="text-xs font-bold" style={{ color: "var(--color-accent)" }}>{creator.symbol}</span>
                </div>
                {insufficientTokens && <p className="text-xs mt-1" style={{ color: "#ff4444" }}>Insufficient token balance</p>}
                {quote && <p className="text-xs mt-2 text-center" style={{ color: "var(--color-text-secondary)" }}>≈ {quote.bsvOut} BSV · impact {quote.priceImpact}%</p>}
              </div>
            )}

            {!address && <div className="p-3 rounded-xl flex items-center gap-2 mb-3" style={{ background: "rgba(255,170,0,0.12)" }}>
              <Lock size={14} style={{ color: "#ffaa00" }} /><span className="text-xs" style={{ color: "#ffaa00" }}>Connect wallet to trade</span>
            </div>}
            {error && <div className="p-3 rounded-xl text-xs mb-3" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}>{error}</div>}

            <button onClick={doTrade} disabled={loading || !canTrade}
              className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50"
              style={{ background: insufficientFunds || insufficientTokens ? "#555" : mode === "buy" ? "var(--color-accent)" : "#ff4444", color: insufficientFunds || insufficientTokens ? "#fff" : "#000" }}>
              {loading ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" /> :
                insufficientFunds ? "Insufficient Balance" :
                insufficientTokens ? "Insufficient Tokens" :
                <>{mode === "buy" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />} {address ? (mode === "buy" ? "Buy" : "Sell") : "Connect Wallet"}</>}
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
  const [mints, setMints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [gridTab, setGridTab] = useState<"posts" | "collected" | "activity">("posts");
  const [isFollowing, setIsFollowing] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [followList, setFollowList] = useState<{ type: "followers" | "following"; items: any[] } | null>(null);
  const [statSheet, setStatSheet] = useState<{ type: "holders" | "holding"; items: any[] } | null>(null);
  const [holdingItems, setHoldingItems] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API}/social/creators/${creatorAddress}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch(`${API}/social/profile/${creatorAddress}`)
      .then(r => r.json())
      .then(d => setMints(d.mints ?? []))
      .catch(() => {});
    fetch(`${API}/social/holdings/${creatorAddress}`)
      .then(r => r.ok ? r.json() : {})
      .then(d => setHoldingItems(Array.isArray(d.holdings) ? d.holdings : []))
      .catch(() => setHoldingItems([]));
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

  async function openFollowList(type: "followers" | "following") {
    const res = await fetch(`${API}/social/creators/${creatorAddress}/${type}`).catch(() => null);
    const items = res?.ok ? await res.json() : [];
    setFollowList({ type, items });
  }

  async function openStatSheet(type: "holders" | "holding") {
    if (type === "holders") {
      setStatSheet({ type, items: topHolders });
    } else {
      const res = await fetch(`${API}/social/holdings/${creatorAddress}`).catch(() => null);
      const d = res?.ok ? await res.json() : {};
      const holdings = Array.isArray(d.holdings) ? d.holdings : [];
      setHoldingItems(holdings);
      setStatSheet({ type, items: holdings });
    }
  }

  const profile = data?.profile;
  const posts = data?.posts ?? [];
  const topHolders = data?.topHolders ?? [];

  if (loading) return (
    <Portal>
      <div className="w-full h-full flex items-center justify-center" style={{ background: "hsl(var(--background))" }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-accent)" }} />
      </div>
    </Portal>
  );

  if (!profile) return null;

  const athPct = (() => { const m = Number(profile.market_cap_usd), a = Number(profile.ath_usd); return a > 0 ? Math.min((m / a) * 100, 100) : 0; })();
  const isSelf = currentUserAddress === creatorAddress;

  return (
    <Portal>
    <div className="w-full h-full flex flex-col" style={{ background: "hsl(var(--background))" }}>

      {/* ── Top nav ── */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-60" style={{ background: "var(--color-surface)" }}>
          <ChevronLeft size={18} style={{ color: "var(--color-text)" }} />
        </button>
        <span className="text-sm font-bold" style={{ color: "var(--color-text)" }}>
          {profile.username || shortAddr(creatorAddress)}
        </span>
        <div className="flex gap-2">
          <button className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}>
            <Share2 size={14} style={{ color: "var(--color-text)" }} />
          </button>
          {isSelf && (
            <button onClick={() => setShowEdit(true)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}>
              <Settings size={14} style={{ color: "var(--color-text)" }} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Cover image ── */}
        <div className="relative h-28 shrink-0" style={{ background: "linear-gradient(135deg,#001a0f 0%,#002244 50%,#1a0033 100%)" }}>
          {!imgErr && profile.cover_url && (
            <img src={profile.cover_url} alt="" className="w-full h-full object-cover" style={{ opacity: 0.7 }} onError={() => setImgErr(true)} />
          )}
        </div>

        <div className="px-4 pt-3 pb-4">

          {/* ── Avatar + Stats row (Instagram-style) ── */}
          <div className="flex items-center gap-4 mb-3">
            <Avatar src={profile.avatar_url} name={profile.username} size={80} ring />
            <div className="flex-1 grid grid-cols-3 text-center">
              <button className="active:opacity-60" onClick={() => setGridTab("posts")}>
                <div className="text-base font-black" style={{ color: "var(--color-text)" }}>{fmtNum(Math.max(profile.post_count, posts.length))}</div>
                <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>Posts</div>
              </button>
              <button className="active:opacity-60" onClick={() => openStatSheet("holders")}>
                <div className="text-base font-black" style={{ color: "var(--color-text)" }}>{fmtNum(profile.holder_count ?? 0)}</div>
                <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>Holders</div>
              </button>
              <button className="active:opacity-60" onClick={() => openStatSheet("holding")}>
                <div className="text-base font-black" style={{ color: "var(--color-text)" }}>{fmtNum(holdingItems.length)}</div>
                <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>Holding</div>
              </button>
            </div>
          </div>

          {/* ── Username + social icons ── */}
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-base font-black" style={{ color: "var(--color-text)" }}>{profile.username}</span>
            {profile.is_verified && <BadgeCheck size={15} style={{ color: "var(--color-accent)" }} />}
            {profile.follower_count > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--color-surface)", color: "var(--color-text-secondary)" }}>
                {fmtNum(profile.follower_count)}
              </span>
            )}
            {profile.instagram && <a href={`https://instagram.com/${profile.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="active:opacity-60"><Camera size={13} style={{ color: "var(--color-text-secondary)" }} /></a>}
            {profile.twitter && <a href={`https://twitter.com/${profile.twitter.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="active:opacity-60"><AtSign size={13} style={{ color: "var(--color-text-secondary)" }} /></a>}
            <button onClick={() => navigator.clipboard.writeText(profile.address).catch(() => {})}>
              <Copy size={12} style={{ color: "var(--color-text-secondary)" }} />
            </button>
          </div>

          {/* ── Bio ── */}
          {profile.bio && (
            <p className="text-xs leading-relaxed mb-1.5" style={{ color: "var(--color-text-secondary)" }}>{profile.bio}</p>
          )}

          {/* ── Website ── */}
          {profile.website && (
            <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 mb-2 active:opacity-60">
              <Globe size={11} style={{ color: "var(--color-accent)" }} />
              <span className="text-xs font-medium underline underline-offset-2" style={{ color: "var(--color-accent)" }}>{profile.website}</span>
            </a>
          )}

          {/* ── Followers / Following ── */}
          <div className="flex items-center gap-3 mb-4 text-xs">
            <button className="active:opacity-60" onClick={() => openFollowList("followers")}>
              <strong style={{ color: "var(--color-text)" }}>{fmtNum(profile.follower_count)}</strong>{" "}
              <span style={{ color: "var(--color-text-secondary)" }}>Followers</span>
            </button>
            <button className="active:opacity-60" onClick={() => openFollowList("following")}>
              <strong style={{ color: "var(--color-text)" }}>{fmtNum(profile.following_count)}</strong>{" "}
              <span style={{ color: "var(--color-text-secondary)" }}>Following</span>
            </button>
          </div>

          {/* ── Market cap + Top holders (side by side) ── */}
          <div className="rounded-2xl p-3.5 mb-3" style={{ background: "var(--color-surface)" }}>
            <div className="flex items-start gap-4 mb-3">
              <div className="flex-1">
                <div className="text-[10px] font-medium mb-0.5" style={{ color: "var(--color-text-secondary)" }}>Market cap</div>
                <div className="text-xl font-black" style={{ color: "var(--color-accent)" }}>{fmtUsd(profile.market_cap_usd ?? 0)}</div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  {fmtUsd(profile.price_usd ?? 0)} per token
                </div>
              </div>
              <div className="flex-1 text-right">
                <div className="text-[10px] font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>Top holders</div>
                {topHolders.length > 0 ? (
                  <div className="flex -space-x-1.5 justify-end">
                    {topHolders.slice(0, 5).map((h, i) => (
                      <div key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2" style={{ background: "linear-gradient(135deg,#00ff88,#00aaff)", color: "#000", borderColor: "var(--color-surface)", zIndex: 5 - i }}>
                        {shortAddr(h.holder)[0]}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>No holders yet</span>
                )}
              </div>
            </div>

            {/* ATH bar */}
            <div className="mb-3.5">
              <div className="h-2 rounded-full overflow-hidden mb-1" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full" style={{ width: `${athPct}%`, background: "var(--color-accent)" }} />
              </div>
              <div className="flex justify-between text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                <span>{athPct.toFixed(0)}% of ATH</span>
                <span>ATH {fmtUsd(profile.ath_usd ?? 0)}</span>
              </div>
            </div>

            {/* Trade + Edit Profile / Follow buttons — always visible */}
            <div className="flex gap-2">
              <button onClick={() => setShowTrade(true)}
                className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
                style={{ background: "var(--color-accent)", color: "#000" }}>
                <BarChart2 size={14} /> Trade
              </button>
              {isSelf ? (
                <button onClick={() => setShowEdit(true)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
                  style={{ background: "var(--color-surface-2,var(--color-surface))", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                  <Edit3 size={14} /> Edit profile
                </button>
              ) : (
                <button onClick={toggleFollow}
                  className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all"
                  style={{ background: isFollowing ? "var(--color-surface-2,var(--color-surface))" : "transparent", color: isFollowing ? "var(--color-text)" : "var(--color-text)", border: "1px solid var(--color-border)" }}>
                  {isFollowing ? <><UserCheck size={14} />Following</> : <><UserPlus size={14} />Follow</>}
                </button>
              )}
            </div>
          </div>

          {/* ── Chain badges ── */}
          <div className="flex gap-1.5 flex-wrap mb-4">
            {CHAINS.map(c => (
              <div key={c} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold" style={{ background: `${CHAIN_COLOR[c]}18`, color: CHAIN_COLOR[c] }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: CHAIN_COLOR[c] }} /> {c}
              </div>
            ))}
          </div>

          {/* ── Grid tabs ── */}
          <div className="flex items-center gap-1 mb-3 p-1 rounded-xl" style={{ background: "var(--color-surface)" }}>
            {([
              { key: "posts",     icon: Grid3X3 },
              { key: "collected", icon: ShoppingBag },
              { key: "activity",  icon: Activity },
            ] as const).map(({ key, icon: Icon }) => (
              <button key={key} onClick={() => setGridTab(key)}
                className="flex-1 py-2 rounded-lg flex items-center justify-center"
                style={{ background: gridTab === key ? "var(--color-accent)" : "transparent", color: gridTab === key ? "#000" : "var(--color-text-secondary)" }}>
                <Icon size={16} />
              </button>
            ))}
          </div>

          {/* ── Posts grid — Trade overlay instead of mint count ── */}
          {gridTab === "posts" && (
            <div className="grid grid-cols-3 gap-0.5">
              {posts.length === 0 && (
                <div className="col-span-3 text-center py-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>No posts yet</div>
              )}
              {posts.map(p => (
                <button key={p.id} onClick={() => onOpenPost(p)}
                  className="relative group active:opacity-80"
                  style={{ aspectRatio: "1/1", overflow: "hidden" }}>
                  <img src={p.image_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  {/* Trade overlay on tap/hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-active:opacity-100 transition-opacity"
                    style={{ background: "rgba(0,0,0,0.5)" }}>
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black"
                      style={{ background: "var(--color-accent)", color: "#000" }}>
                      <BarChart2 size={12} /> Trade
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {gridTab === "collected" && (
            mints.length === 0 ? (
              <div className="text-center py-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>No collectibles yet</div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5">
                {mints.map((m: any) => (
                  <div key={m.id} className="relative group" style={{ aspectRatio: "1/1", overflow: "hidden" }}>
                    <img src={m.image_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[9px] font-semibold truncate"
                      style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                      {m.title}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {gridTab === "activity" && (
            <div className="space-y-2">
              {posts.length === 0 && (
                <div className="text-center py-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>No activity yet</div>
              )}
              {posts.slice(0, 10).map(p => (
                <div key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: "var(--color-surface)" }}>
                  <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--color-text)" }}>"{p.title}"</p>
                    <p className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{timeAgo(p.created_at)}</p>
                  </div>
                  <button onClick={() => setShowTrade(true)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold"
                    style={{ background: "var(--color-accent)", color: "#000" }}>
                    Trade
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="h-16" />
        </div>
      </div>

      {showTrade && <TradeSheet creator={profile} onClose={() => setShowTrade(false)} />}
      {showEdit && (
        <EditProfileSheet
          address={creatorAddress}
          profile={profile}
          onClose={() => setShowEdit(false)}
          onSave={(updated) => {
            setData(d => d ? { ...d, profile: { ...d.profile, ...updated } } : d);
            setShowEdit(false);
          }}
        />
      )}
      {followList && (
        <Portal>
          <div className="w-full h-full flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setFollowList(null)}>
            <div className="w-full rounded-t-3xl" style={{ background: "var(--color-bg)", maxHeight: "70vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <h3 className="font-bold text-base capitalize" style={{ color: "var(--color-text)" }}>{followList.type}</h3>
                <button onClick={() => setFollowList(null)}><X size={20} style={{ color: "var(--color-text-secondary)" }} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {followList.items.length === 0 ? (
                  <div className="text-center py-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>No {followList.type} yet</div>
                ) : followList.items.map((u: any) => (
                  <div key={u.address} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: "var(--color-surface)" }}>
                    <Avatar src={u.avatar_url} name={u.username ?? u.address} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>{u.username ?? shortAddr(u.address)}</p>
                      <p className="text-[11px] font-mono truncate" style={{ color: "var(--color-text-secondary)" }}>{shortAddr(u.address)}</p>
                    </div>
                    {u.is_verified && <BadgeCheck size={14} style={{ color: "var(--color-accent)" }} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Portal>
      )}
      {statSheet && (
        <Portal>
          <div className="w-full h-full flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setStatSheet(null)}>
            <div className="w-full rounded-t-3xl" style={{ background: "var(--color-bg)", maxHeight: "70vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
                <h3 className="font-bold text-base" style={{ color: "var(--color-text)" }}>{statSheet.type === "holders" ? "Top Holders" : "Holdings"}</h3>
                <button onClick={() => setStatSheet(null)}><X size={20} style={{ color: "var(--color-text-secondary)" }} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {statSheet.items.length === 0 ? (
                  <div className="text-center py-10 text-sm" style={{ color: "var(--color-text-secondary)" }}>No {statSheet.type === "holders" ? "holders" : "holdings"} yet</div>
                ) : statSheet.type === "holders" ? statSheet.items.map((h: any, i: number) => (
                  <div key={h.holder ?? i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: "var(--color-surface)" }}>
                    <div className="w-6 text-center text-xs font-bold" style={{ color: "var(--color-text-secondary)" }}>#{i + 1}</div>
                    <Avatar src={undefined} name={h.username ?? h.holder} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>{h.username ?? shortAddr(h.holder)}</p>
                      <p className="text-[11px] font-mono truncate" style={{ color: "var(--color-text-secondary)" }}>{shortAddr(h.holder)}</p>
                    </div>
                    <span className="text-xs font-bold font-mono shrink-0" style={{ color: "var(--color-accent)" }}>{fmtNum(h.amount)}</span>
                  </div>
                )) : statSheet.items.map((h: any, i: number) => (
                  <div key={h.coin_creator ?? i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: "var(--color-surface)" }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0" style={{ background: "var(--color-accent)", color: "#000" }}>{h.symbol?.slice(0, 3)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>{h.username ?? shortAddr(h.coin_creator)}</p>
                      <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>{h.symbol} · ${parseFloat(h.price_usd || "0").toFixed(4)}</p>
                    </div>
                    <span className="text-xs font-bold font-mono shrink-0" style={{ color: "var(--color-accent)" }}>{fmtNum(h.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
    </Portal>
  );
}

/* ─── EDIT PROFILE SHEET ─────────────────────────────────────────────────────── */
function EditProfileSheet({ address, profile, onClose, onSave }: {
  address: string;
  profile: Creator;
  onClose: () => void;
  onSave: (updated: Partial<Creator>) => void;
}) {
  const { provider, disconnect } = useWalletStore();
  const [, navigate] = useLocation();
  const [form, setForm] = useState({
    username: profile.username || "",
    bio: profile.bio || "",
    avatar_url: profile.avatar_url || "",
    cover_url: profile.cover_url || "",
    website: profile.website || "",
    twitter: profile.twitter || "",
    instagram: profile.instagram || "",
  });
  const [avatarMode, setAvatarMode] = useState<"url" | "file">("url");
  const [coverMode, setCoverMode] = useState<"url" | "file">("url");
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || "");
  const [coverPreview, setCoverPreview] = useState(profile.cover_url || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  function handleFileChange(field: "avatar" | "cover") {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string;
        if (field === "avatar") {
          setAvatarPreview(dataUrl);
          setForm(f => ({ ...f, avatar_url: dataUrl }));
        } else {
          setCoverPreview(dataUrl);
          setForm(f => ({ ...f, cover_url: dataUrl }));
        }
      };
      reader.readAsDataURL(file);
    };
  }

  async function save() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/social/creators/${address}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      onSave(form as any);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteProfile() {
    if (!address || deleteConfirmText !== "DELETE") return;
    setDeleteLoading(true); setDeleteError("");
    try {
      const res = await fetch(`${API}/social/creators/${address}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to delete profile");
      setShowDeleteConfirm(false);
      if (provider === "reown") await disconnectReown();
      disconnect();
      onClose();
      navigate("/");
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    background: "var(--color-surface)", color: "var(--color-text)",
    border: "1px solid var(--color-border)", borderRadius: 12,
    padding: "10px 12px", fontSize: 14, width: "100%", outline: "none",
    boxSizing: "border-box",
  };
  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
    background: active ? "var(--color-accent)" : "transparent",
    color: active ? "#000" : "var(--color-text-secondary)",
    border: "none", cursor: "pointer",
  });

  return (
    <Portal>
    <div className="w-full h-full flex flex-col" style={{ background: "hsl(var(--background))" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}>
          <X size={16} style={{ color: "var(--color-text)" }} />
        </button>
        <span className="text-sm font-bold" style={{ color: "var(--color-text)" }}>Edit Profile</span>
        <button onClick={save} disabled={loading}
          className="px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-1.5"
          style={{ background: "var(--color-accent)", color: "#000", opacity: loading ? 0.6 : 1 }}>
          {loading ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" /> : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

        {/* Cover photo */}
        <div>
          <label className="text-xs font-bold block mb-2" style={{ color: "var(--color-text-secondary)" }}>COVER PHOTO</label>
          {coverPreview && (
            <div className="rounded-2xl overflow-hidden mb-3" style={{ height: 120 }}>
              <img src={coverPreview} alt="" className="w-full h-full object-cover" onError={() => setCoverPreview("")} />
            </div>
          )}
          <div className="flex mb-2 p-1 rounded-xl gap-1" style={{ background: "var(--color-surface)" }}>
            <button style={tabBtn(coverMode === "url")} onClick={() => setCoverMode("url")}><Link size={11} className="inline mr-1" />URL</button>
            <button style={tabBtn(coverMode === "file")} onClick={() => setCoverMode("file")}><Upload size={11} className="inline mr-1" />Upload</button>
          </div>
          {coverMode === "url" ? (
            <input style={inp} placeholder="https://… cover image URL" value={form.cover_url}
              onChange={e => { set("cover_url")(e); setCoverPreview(e.target.value); }} />
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer"
              style={{ background: "var(--color-surface)", border: "2px dashed var(--color-border)", padding: "20px 0" }}>
              <ImageIcon size={24} style={{ color: "var(--color-text-secondary)" }} />
              <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Tap to select image</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange("cover")} />
            </label>
          )}
        </div>

        {/* Avatar */}
        <div>
          <label className="text-xs font-bold block mb-2" style={{ color: "var(--color-text-secondary)" }}>PROFILE PICTURE</label>
          {avatarPreview && (
            <div className="mb-3 flex justify-center">
              <div className="w-20 h-20 rounded-full overflow-hidden" style={{ border: "3px solid var(--color-accent)" }}>
                <img src={avatarPreview} alt="" className="w-full h-full object-cover" onError={() => setAvatarPreview("")} />
              </div>
            </div>
          )}
          <div className="flex mb-2 p-1 rounded-xl gap-1" style={{ background: "var(--color-surface)" }}>
            <button style={tabBtn(avatarMode === "url")} onClick={() => setAvatarMode("url")}><Link size={11} className="inline mr-1" />URL</button>
            <button style={tabBtn(avatarMode === "file")} onClick={() => setAvatarMode("file")}><Upload size={11} className="inline mr-1" />Upload</button>
          </div>
          {avatarMode === "url" ? (
            <input style={inp} placeholder="https://… avatar URL" value={form.avatar_url}
              onChange={e => { set("avatar_url")(e); setAvatarPreview(e.target.value); }} />
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer"
              style={{ background: "var(--color-surface)", border: "2px dashed var(--color-border)", padding: "20px 0" }}>
              <ImageIcon size={24} style={{ color: "var(--color-text-secondary)" }} />
              <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Tap to select image</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleFileChange("avatar")} />
            </label>
          )}
        </div>

        {/* Display name */}
        <div>
          <label className="text-xs font-bold block mb-1.5" style={{ color: "var(--color-text-secondary)" }}>DISPLAY NAME</label>
          <input style={inp} placeholder="Your creator name" value={form.username} onChange={set("username")} maxLength={40} />
        </div>

        {/* Bio */}
        <div>
          <label className="text-xs font-bold block mb-1.5" style={{ color: "var(--color-text-secondary)" }}>BIO</label>
          <textarea style={{ ...inp, resize: "none" } as React.CSSProperties} rows={3}
            placeholder="Tell the world about your art and why you create on BSV…"
            value={form.bio} onChange={set("bio")} maxLength={300} />
          <div className="text-right text-[10px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{form.bio.length}/300</div>
        </div>

        {/* Social links */}
        <div>
          <label className="text-xs font-bold block mb-1.5" style={{ color: "var(--color-text-secondary)" }}>SOCIAL LINKS</label>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Globe size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
              <input style={inp} placeholder="Website URL" value={form.website} onChange={set("website")} />
            </div>
            <div className="flex items-center gap-2">
              <AtSign size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
              <input style={inp} placeholder="Twitter / X handle" value={form.twitter} onChange={set("twitter")} />
            </div>
            <div className="flex items-center gap-2">
              <Camera size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
              <input style={inp} placeholder="Instagram handle" value={form.instagram} onChange={set("instagram")} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-3.5 border" style={{ background: "rgba(255,68,68,0.08)", borderColor: "rgba(255,68,68,0.25)" }}>
          <p className="text-[10px] font-bold mb-1 tracking-widest" style={{ color: "#ff6b6b" }}>DANGER ZONE</p>
          <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>
            Delete Profile — Permanently remove your profile and posts.
          </p>
          <button
            onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(""); setDeleteError(""); }}
            className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
            style={{ background: "rgba(255,68,68,0.18)", color: "#ff6b6b" }}
          >
            <Trash2 size={13} />
            Delete Profile
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl text-xs" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}>{error}</div>
        )}

        <div className="h-8" />
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-4" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,68,68,0.2)" }}>
                <Trash2 size={18} style={{ color: "#ff6b6b" }} />
              </div>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "var(--color-surface)" }}
              >
                <X size={16} style={{ color: "var(--color-text)" }} />
              </button>
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: "var(--color-text)" }}>Delete Profile</h3>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                This will permanently delete your profile, all posts, mints, follows, and coin data. This action cannot be undone.
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold mb-2 uppercase tracking-widest" style={{ color: "var(--color-text-secondary)" }}>
                Type DELETE to confirm
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value.toUpperCase())}
                placeholder="DELETE"
                className="w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                autoFocus
              />
            </div>
            {deleteError && (
              <p className="text-xs flex items-center gap-1.5" style={{ color: "#ff6b6b" }}>
                <AlertCircle size={13} /> {deleteError}
              </p>
            )}
            <button
              onClick={handleDeleteProfile}
              disabled={deleteConfirmText !== "DELETE" || deleteLoading}
              className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-60"
              style={{ background: "#ff4444", color: "#fff" }}
            >
              {deleteLoading ? "Deleting..." : "Delete Profile Permanently"}
            </button>
          </div>
        </div>
      )}
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

      <div className="relative cursor-pointer" style={{ aspectRatio: "1/1", background: "#000" }} onClick={() => onCreator(post.creator)}>
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
function PostDetailSheet({ post, onClose, onMint, onSell, onLike, liked, onCreator }: {
  post: Post; onClose: () => void; onMint: (p: Post) => void; onSell?: (p: Post) => void;
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
    <div className="w-full h-full flex flex-col" style={{ background: "hsl(var(--background))" }}>
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
        <div className="flex gap-2 mb-3">
          <button onClick={() => !soldOut && onMint(post)} disabled={soldOut}
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:opacity-80 transition-all"
            style={{ background: soldOut ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,var(--color-accent),#00aaff)", color: soldOut ? "var(--color-text-secondary)" : "#000", opacity: soldOut ? 0.4 : 1 }}>
            <Zap size={16} />{soldOut ? "Sold Out" : "Buy"}
          </button>
          <button onClick={() => onSell?.(post)}
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:opacity-80 transition-all"
            style={{ background: "#ff4444", color: "#fff" }}>
            Sell
          </button>
        </div>
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
function MintSheet({ post, onClose, initialMode = "buy" }: { post: Post; onClose: () => void; initialMode?: "buy" | "sell" }) {
  const [mode, setMode] = useState<"buy" | "sell">(initialMode);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { address, network, chainId, balance: storeBalance, provider } = useWalletStore();
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
  const [, navigate] = useLocation();

  async function doMint() {
    if (!address) { navigate("/settings"); return; }
    if (insufficientFunds) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/social/posts/${post.id}/mint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minter: address }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Mint failed");
      setDone(true);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function doList() {
    if (!address) { navigate("/settings"); return; }
    const price = parseFloat(listPrice);
    if (!price || price <= 0) { setError("Enter a valid price"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/nft/listings`, {
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
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to list");
      setDone(true);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <Portal>
    <div className="w-full h-full flex items-end" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5 pb-8" style={{ background: "var(--color-bg)", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">{mode === "buy" ? "🎉" : "🏷️"}</div>
            <h3 className="text-xl font-bold mb-1" style={{ color: "var(--color-text)" }}>{mode === "buy" ? "Collected!" : "Listed!"}</h3>
            <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>{mode === "buy" ? `${post.title} is permanently on BSV.` : `${post.title} is now listed for sale.`}</p>
            {mode === "buy" && <div className="text-xs font-mono px-3 py-1.5 rounded-xl inline-block mb-4" style={{ background: "var(--color-surface)", color: "var(--color-accent)" }}>{post.inscription_id.slice(0, 24)}…</div>}
            <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-sm" style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-xl overflow-hidden" style={{ background: "var(--color-surface)" }}><img src={post.image_url} alt="" className="w-full h-full object-cover" /></div>
              <div className="flex-1">
                <h3 className="font-bold text-base" style={{ color: "var(--color-text)" }}>{post.title}</h3>
                <div className="flex items-center gap-1 mt-0.5"><span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>by {post.creator_name}</span>{post.is_verified && <BadgeCheck size={11} style={{ color: "var(--color-accent)" }} />}</div>
              </div>
              <button onClick={onClose}><X size={20} style={{ color: "var(--color-text-secondary)" }} /></button>
            </div>

            {/* Buy / Sell toggle */}
            <div className="flex rounded-xl overflow-hidden mb-4" style={{ background: "var(--color-surface)" }}>
              {(["buy", "sell"] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setError(""); }} className="flex-1 py-2.5 font-bold text-sm capitalize transition-all"
                  style={{ background: mode === m ? (m === "buy" ? "var(--color-accent)" : "#ff4444") : "transparent", color: mode === m ? "#000" : "var(--color-text-secondary)" }}>
                  {m === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>

            {mode === "buy" ? (
              <>
                {[["Chain", "BSV (on-chain inscription)"], ["Price", `${safePrice(post.mint_price)} ${post.mint_currency} ≈ $${post.mint_price_usd}`], ["Minted", `${fmtNum(post.mint_count)}${post.max_supply ? ` / ${fmtNum(post.max_supply)}` : " (open edition)"}`], ["Inscription", `${post.inscription_id.slice(0, 20)}…`]].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                    <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{l}</span>
                    <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{v}</span>
                  </div>
                ))}
                {availableLabel && (
                  <div className="flex justify-between py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                    <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Your balance</span>
                    <span className="text-sm font-mono font-medium" style={{ color: insufficientFunds ? "#ff4444" : "var(--color-text)" }}>{availableLabel}</span>
                  </div>
                )}
                <div className="mt-3"><SupplyBar minted={post.mint_count} max={post.max_supply} /></div>
                {!address && <div className="mt-4 p-3 rounded-xl flex items-center gap-2" style={{ background: "rgba(255,170,0,0.12)" }}><Lock size={14} style={{ color: "#ffaa00" }} /><span className="text-xs" style={{ color: "#ffaa00" }}>Connect wallet to collect</span></div>}
                {insufficientFunds && <div className="mt-4 p-3 rounded-xl text-xs flex items-center gap-2" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}><span>Insufficient balance — you need at least {safePrice(post.mint_price)} {post.mint_currency}</span></div>}
                {error && <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}>{error}</div>}
                <div className="mt-4 rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                  <button
                    onClick={() => setShowAdvanced(v => !v)}
                    className="w-full px-3 py-2.5 text-xs font-bold flex items-center justify-between"
                    style={{ background: "var(--color-surface)", color: "var(--color-text)" }}
                  >
                    <span>Advanced NFT Details</span>
                    <ChevronRight size={14} style={{ transform: showAdvanced ? "rotate(90deg)" : undefined, transition: "transform 0.2s ease" }} />
                  </button>
                  {showAdvanced && (
                    <div className="px-3 py-2.5 text-[11px] space-y-1.5" style={{ background: "rgba(255,255,255,0.02)", color: "var(--color-text-secondary)" }}>
                      <div className="flex justify-between gap-2"><span>Post ID</span><span className="font-mono truncate" style={{ color: "var(--color-text)" }}>{post.id}</span></div>
                      <div className="flex justify-between gap-2"><span>Creator</span><span className="font-mono truncate" style={{ color: "var(--color-text)" }}>{post.creator}</span></div>
                      <div className="flex justify-between gap-2"><span>Chain</span><span style={{ color: CHAIN_COLOR[post.chain] ?? "var(--color-text)" }}>{post.chain}</span></div>
                      <div className="flex justify-between gap-2"><span>Currency</span><span style={{ color: "var(--color-text)" }}>{post.mint_currency}</span></div>
                    </div>
                  )}
                </div>
                <button onClick={doMint} disabled={loading || insufficientFunds}
                  className="w-full py-3.5 rounded-xl font-bold text-sm mt-5 flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50"
                  style={{ background: insufficientFunds ? "#555" : "linear-gradient(135deg,var(--color-accent),#00aaff)", color: insufficientFunds ? "#fff" : "#000" }}>
                  {loading ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" /> :
                    insufficientFunds ? "Insufficient Balance" :
                    <><Zap size={16} />{address ? `Buy for ${safePrice(post.mint_price)} ${post.mint_currency}` : "Connect Wallet"}</>}
                </button>
              </>
            ) : (
              <>
                <div className="py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                  <p className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>Set a price to list your copy of this NFT on the OrahDEX marketplace. Buyers pay you directly.</p>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                    <input type="number" min="0" step="0.0001" placeholder="0.0000"
                      className="flex-1 bg-transparent text-sm font-mono outline-none"
                      style={{ color: "var(--color-text)" }}
                      value={listPrice} onChange={e => setListPrice(e.target.value)} />
                    <span className="text-xs font-bold shrink-0" style={{ color: "var(--color-text-secondary)" }}>{post.mint_currency}</span>
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: "var(--color-text-secondary)" }}>Current floor: {safePrice(post.mint_price)} {post.mint_currency}</p>
                </div>
                {!address && <div className="mt-4 p-3 rounded-xl flex items-center gap-2" style={{ background: "rgba(255,170,0,0.12)" }}><Lock size={14} style={{ color: "#ffaa00" }} /><span className="text-xs" style={{ color: "#ffaa00" }}>Connect wallet to list</span></div>}
                {error && <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}>{error}</div>}
                <button onClick={doList} disabled={loading || !listPrice}
                  className="w-full py-3.5 rounded-xl font-bold text-sm mt-5 flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50"
                  style={{ background: loading || !listPrice ? "#555" : "#ff4444", color: "#fff" }}>
                  {loading ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> :
                    <>{address ? `List for ${listPrice || "…"} ${post.mint_currency}` : "Connect Wallet"}</>}
                </button>
              </>
            )}
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
  const [form, setForm] = useState({
    title: "", description: "", imageUrl: "", ticker: "",
    mintPrice: "0.01", mintCurrency: "BSV", category: "art", maxSupply: "",
  });
  const [mediaMode, setMediaMode] = useState<"url" | "file">("url");
  const [filePreview, setFilePreview] = useState("");
  const [fileData, setFileData] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const inp: React.CSSProperties = {
    background: "var(--color-surface)", color: "var(--color-text)",
    border: "1px solid var(--color-border)", borderRadius: 12,
    padding: "10px 12px", fontSize: 14, width: "100%", outline: "none",
    boxSizing: "border-box",
  };
  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
    background: active ? "var(--color-accent)" : "transparent",
    color: active ? "#000" : "var(--color-text-secondary)",
    border: "none", cursor: "pointer",
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setFilePreview(preview);
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result as string;
      setFileData(data);
      setForm(f => ({ ...f, imageUrl: "" }));
    };
    reader.readAsDataURL(file);
  }

  const effectiveImage = mediaMode === "file" ? (filePreview || fileData) : form.imageUrl;
  const canSubmit = form.title && (mediaMode === "url" ? !!form.imageUrl : !!fileData);

  async function submit() {
    if (!address) { setError("Connect your wallet first"); return; }
    if (!canSubmit) { setError("Title and media are required"); return; }
    setLoading(true); setError("");
    try {
      const image_url = mediaMode === "url" ? form.imageUrl : fileData;
      const profileRes = await fetch(`${API}/social/creators/${address}`).catch(() => null);
      const profileData = profileRes?.ok ? await profileRes.json() : null;
      const creatorName = profileData?.profile?.username || profileData?.username || shortAddr(address);
      const res = await fetch(`${API}/social/posts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator: address,
          creator_name: creatorName,
          title: form.title,
          description: form.description,
          image_url,
          ticker: form.ticker || undefined,
          mint_price: parseFloat(form.mintPrice) || 0.01,
          mint_currency: form.mintCurrency,
          category: form.category,
          max_supply: form.maxSupply ? parseInt(form.maxSupply, 10) : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      await fetch(`${API}/social/creators/${address}`).catch(() => {});
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onSuccess(); }, 2200);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (success) return (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <div className="text-6xl mb-4">✨</div>
      <h3 className="text-xl font-bold mb-2" style={{ color: "var(--color-text)" }}>Inscribed on BSV!</h3>
      <p className="text-sm text-center px-6" style={{ color: "var(--color-text-secondary)" }}>
        Your post is permanently on the BSV blockchain. Your creator coin was auto-created.
      </p>
    </div>
  );

  return (
    <div className="p-4 pb-32 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-1" style={{ color: "var(--color-text)" }}>Create Post</h2>
      <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>
        Every post = NFT inscription on BSV + tradeable creator coin. Multichain via OrahBridge.
      </p>

      {/* Media preview */}
      {effectiveImage ? (
        <div className="rounded-2xl overflow-hidden mb-3 relative group" style={{ aspectRatio: "1/1" }}>
          <img src={effectiveImage} alt="" className="w-full h-full object-cover" onError={() => { setFilePreview(""); setFileData(""); setForm(f => ({ ...f, imageUrl: "" })); }} />
          <button onClick={() => { setFilePreview(""); setFileData(""); setForm(f => ({ ...f, imageUrl: "" })); }}
            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}>
            <X size={12} style={{ color: "#fff" }} />
          </button>
        </div>
      ) : (
        <div className="rounded-2xl flex flex-col items-center justify-center gap-2 mb-3" style={{ aspectRatio: "1/1", background: "var(--color-surface)", border: "2px dashed var(--color-border)" }}>
          <ImageIcon size={32} style={{ color: "var(--color-text-secondary)" }} />
          <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {mediaMode === "url" ? "Paste an image URL below" : "Tap to pick a file"}
          </span>
          {mediaMode === "file" && (
            <label className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{ background: "var(--color-accent)", color: "#000" }}>
              Choose File <input type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={handleFile} />
            </label>
          )}
        </div>
      )}

      {/* Media mode toggle */}
      <div className="flex mb-4 p-1 rounded-xl gap-1" style={{ background: "var(--color-surface)" }}>
        <button style={tabBtn(mediaMode === "url")} onClick={() => setMediaMode("url")}><Link size={11} className="inline mr-1" />URL</button>
        <button style={tabBtn(mediaMode === "file")} onClick={() => setMediaMode("file")}><Upload size={11} className="inline mr-1" />Upload File</button>
      </div>

      <div className="flex flex-col gap-3">
        {/* URL input */}
        {mediaMode === "url" && (
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Media URL *</label>
            <input style={inp} placeholder="https://… image, video, audio" value={form.imageUrl} onChange={set("imageUrl")} />
          </div>
        )}

        {/* File picker inline */}
        {mediaMode === "file" && !fileData && (
          <label className="flex items-center gap-3 p-3 rounded-xl cursor-pointer" style={{ background: "var(--color-surface)", border: "1px dashed var(--color-border)" }}>
            <Upload size={16} style={{ color: "var(--color-text-secondary)" }} />
            <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Select image / video / audio</span>
            <input type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={handleFile} />
          </label>
        )}
        {mediaMode === "file" && fileData && (
          <label className="flex items-center gap-3 p-3 rounded-xl cursor-pointer" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <Camera size={16} style={{ color: "var(--color-accent)" }} />
            <span className="text-sm flex-1" style={{ color: "var(--color-text)" }}>File selected — tap to replace</span>
            <input type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={handleFile} />
          </label>
        )}

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Title *</label>
          <input style={inp} placeholder="Name your creation" value={form.title} onChange={set("title")} maxLength={100} />
        </div>

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Ticker / Symbol <span style={{ opacity: 0.5 }}>(optional)</span></label>
          <input style={inp} placeholder="e.g. ORDI, ART, MUSIC — auto-generated if blank" value={form.ticker}
            onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) }))} maxLength={8} />
          <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>This becomes your creator coin ticker on BSV</div>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Description</label>
          <textarea style={{ ...inp, resize: "none" } as React.CSSProperties} rows={3}
            placeholder="Tell collectors about this work…" value={form.description} onChange={set("description")} maxLength={500} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Mint Price</label>
            <input style={inp} type="number" min="0" step="0.001" value={form.mintPrice} onChange={set("mintPrice")} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Currency</label>
            <select style={inp} value={form.mintCurrency} onChange={set("mintCurrency")}>
              {CHAINS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Category</label>
            <select style={inp} value={form.category} onChange={set("category")}>
              {CATEGORIES.filter(c => c !== "all").map(c => <option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Max Supply</label>
            <input style={inp} type="number" min="1" placeholder="Open edition" value={form.maxSupply} onChange={set("maxSupply")} />
          </div>
        </div>

        {/* Multichain info */}
        <div className="rounded-xl p-3" style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)" }}>
          <div className="text-xs font-bold mb-2" style={{ color: "var(--color-accent)" }}>🌐 Multichain NFT + Coin</div>
          <div className="flex flex-wrap gap-1.5">
            {CHAINS.map(c => <span key={c} className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${CHAIN_COLOR[c]}20`, color: CHAIN_COLOR[c] }}>{c}</span>)}
          </div>
          <p className="text-[11px] mt-2" style={{ color: "var(--color-text-secondary)" }}>
            Inscribed on BSV · Bridgeable to ETH, BNB, SOL via OrahBridge · Creator coin auto-created on first post
          </p>
        </div>

        {error && <div className="p-3 rounded-xl text-xs" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}>{error}</div>}

        <button onClick={submit} disabled={loading || !canSubmit}
          className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,var(--color-accent),#00aaff)", color: "#000" }}>
          {loading
            ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
            : <><Zap size={15} /> Inscribe on BSV</>
          }
        </button>
      </div>
    </div>
  );
}

/* ─── MY PROFILE TAB ─────────────────────────────────────────────────────────── */
function MyProfileTab({ onOpenCreator, onOpenPost }: { onOpenCreator: (a: string) => void; onOpenPost: (p: Post) => void }) {
  const { address, provider, network, internalEvmAddress } = useWalletStore();
  const profileAddress = getNftProfileAddress({ address, provider, network, internalEvmAddress });
  const [, navigate] = useLocation();
  if (!profileAddress) return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-8">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}><User size={28} style={{ color: "var(--color-text-secondary)" }} /></div>
      <p className="text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>Connect your wallet to see your profile and creator coin</p>
      <button onClick={() => navigate("/settings")} className="px-6 py-2.5 rounded-xl font-bold text-sm" style={{ background: "var(--color-accent)", color: "#000" }}>Connect Wallet</button>
    </div>
  );
  // Redirect to full creator profile view
  useEffect(() => { if (profileAddress) onOpenCreator(profileAddress); }, [profileAddress, onOpenCreator]);
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
  const [mintPost, setMintPost] = useState<{ post: Post; mode: "buy" | "sell" } | null>(null);
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);
  const { address, provider, network, internalEvmAddress } = useWalletStore();
  const profileAddress = getNftProfileAddress({ address, provider, network, internalEvmAddress });

  function handleLike(id: string) {
    setLikedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    if (address) fetch(`${API}/social/posts/${id}/like`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: address }) }).catch(() => {});
  }

  const openCreator = useCallback((addr: string) => setCreatorAddress(addr), []);
  const openPost = useCallback((p: Post) => setDetailPost(p), []);

  const INNER_TABS = [
    { key: "feed"    as const, label: "Feed",    Icon: Layers },
    { key: "search"  as const, label: "Search",  Icon: Search },
    { key: "create"  as const, label: "Create",  Icon: PlusSquare },
    { key: "profile" as const, label: "Profile", Icon: User },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: "hsl(var(--background))" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div>
          <h1 className="text-lg font-black tracking-tight" style={{ color: "var(--color-text)" }}>Orah<span style={{ color: "var(--color-accent)" }}>NFT</span></h1>
          <div className="text-[10px] font-mono" style={{ color: "var(--color-text-secondary)" }}>BSV · Multichain · Creator Coins</div>
        </div>
        <div className="flex items-center gap-2">
          {address && (
            <button onClick={() => profileAddress && openCreator(profileAddress)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl active:opacity-70" style={{ background: "var(--color-surface)" }}>
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
        {activeTab === "feed"    && <FeedTab    likedIds={likedIds} onLike={handleLike} onMint={p => setMintPost({ post: p, mode: "buy" })} onOpen={openPost} onCreator={openCreator} />}
        {activeTab === "search"  && <SearchTab  onCreator={openCreator} onOpenPost={openPost} />}
        {activeTab === "create"  && <CreateTab  onSuccess={() => setActiveTab("feed")} />}
        {activeTab === "profile" && <MyProfileTab onOpenCreator={openCreator} onOpenPost={openPost} />}
      </div>

      {/* OVERLAYS */}
      {creatorAddress && (
        <CreatorProfileSheet
          creatorAddress={creatorAddress}
          currentUserAddress={profileAddress ?? undefined}
          onClose={() => {
            setCreatorAddress(null);
            // If the profile tab triggered this sheet, return to feed
            // so the tab doesn't stay on the permanent loading spinner.
            if (activeTab === "profile") setActiveTab("feed");
          }}
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
