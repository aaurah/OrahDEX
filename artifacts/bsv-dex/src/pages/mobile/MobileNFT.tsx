import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Heart, MessageCircle, Share2, Zap, BadgeCheck, Search,
  TrendingUp, PlusSquare, User, ChevronLeft, X, Upload,
  Flame, Clock, Star, Lock, Layers, Copy, Send, Globe,
  AtSign, Camera, ArrowUpRight, ArrowDownRight,
  UserPlus, UserCheck, BarChart2, Grid3X3, Activity,
  ShoppingBag, Settings, ChevronRight, RefreshCw, Sparkles, ExternalLink, Link, ImageIcon, Trash2, AlertCircle, MessagesSquare, Bell, Tag, Send as SendIcon,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { useBsvBalance } from "@/hooks/useBsvBalance";
import { useLocation } from "wouter";
import { disconnectReown, sendEvmTransfer } from "@/lib/reown";
import { resolveNftSpendBalance } from "@/lib/nftBalance";
import { deriveChannelKey, encryptMessage, decryptMessage } from "@/lib/chatCrypto";
import { useHybridBalance } from "@/hooks/useHybridBalance";

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
const MIN_ADDRESS_LIKE_LENGTH = 24;
function isAddressLike(value: string) {
  const v = value.trim();
  if (!v) return false;
  if (v.includes("…")) return true;
  if (v.startsWith("0x")) return true;
  return new RegExp(`^[A-Za-z0-9]{${MIN_ADDRESS_LIKE_LENGTH},}$`).test(v);
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
function safePrice(v: unknown, decimals?: number) {
  const n = Number(v);
  if (!isFinite(n)) return "0.0000";
  if (decimals !== undefined) return n.toFixed(decimals);
  // Auto-scale: show enough decimals to represent micro amounts
  if (n === 0) return "0";
  if (n >= 1) return n.toFixed(4);
  const d = Math.ceil(-Math.log10(Math.abs(n))) + 2;
  return n.toFixed(Math.max(4, Math.min(d, 8)));
}
function getNftProfileAddress({
  address,
  provider: _provider,
  network: _network,
  internalEvmAddress,
}: {
  address: string | null;
  provider: string | null;
  network: string | null;
  internalEvmAddress: string | null;
}) {
  // If the user has a fixed, internally-derived EVM address (seed phrase, passkey,
  // or server-side provisioning), ALWAYS use it as their NFT profile identity.
  // internalEvmAddress is explicitly preserved by every chain-switch path and is
  // only cleared when a genuinely different wallet connects — so this is the
  // most robust signal for "one seed, one profile".
  if (internalEvmAddress) return internalEvmAddress;
  // For external-only wallets (MetaMask, WalletConnect, etc.) use the connected address.
  if (!address) return null;
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
const CHAINS = ["BSV","ETH","BASE","BNB","MATIC","ARB","OP","SOL","BTC","BCH"];
const CHAIN_COLOR: Record<string, string> = {
  BSV: "#00ff88", ETH: "#627eea", BASE: "#0052ff", BNB: "#f3ba2f",
  MATIC: "#8247e5", ARB: "#12aaff", OP: "#ff0420", SOL: "#9945ff",
  BTC: "#f7931a", BCH: "#4caf50",
};
const CHAIN_CURRENCY: Record<string, string> = {
  BSV: "BSV", ETH: "ETH", BASE: "ETH", BNB: "BNB",
  MATIC: "MATIC", ARB: "ETH", OP: "ETH", SOL: "SOL",
  BTC: "BTC", BCH: "BCH",
};
const CHAIN_LABEL: Record<string, string> = {
  BSV: "BSV", ETH: "Ethereum", BASE: "Base", BNB: "BNB Chain",
  MATIC: "Polygon", ARB: "Arbitrum", OP: "Optimism", SOL: "Solana",
  BTC: "Bitcoin", BCH: "Bitcoin Cash",
};

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
/* ── Module-level profile cache — survives tab switches, cleared on logout ── */
const _profileDataCache: Record<string, { profile: Creator; posts: Post[]; topHolders: any[] }> = {};
const _profileMintsCache: Record<string, any[]> = {};
const _profileHoldingsCache: Record<string, any[]> = {};

function CreatorProfileSheet({
  creatorAddress, currentUserAddress, onClose, onOpenPost, onOpenCreator,
}: {
  creatorAddress: string;
  currentUserAddress?: string;
  onClose: () => void;
  onOpenPost: (p: Post) => void;
  onOpenCreator?: (a: string) => void;
}) {
  const cached = _profileDataCache[creatorAddress] ?? null;
  const [data, setData] = useState<{ profile: Creator; posts: Post[]; topHolders: any[] } | null>(cached);
  const [mints, setMints] = useState<any[]>(_profileMintsCache[creatorAddress] ?? []);
  const [loading, setLoading] = useState(!cached);
  const [gridTab, setGridTab] = useState<"posts" | "collected" | "activity">("posts");
  const [isFollowing, setIsFollowing] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [dmPeer, setDmPeer] = useState<{ address: string; name: string; avatar?: string } | null>(null);
  const [myFollowingSet, setMyFollowingSet] = useState<Set<string>>(new Set());
  const [followBusy, setFollowBusy] = useState<Set<string>>(new Set());
  const [imgErr, setImgErr] = useState(false);
  const [photoUploading, setPhotoUploading] = useState<"cover" | "avatar" | null>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [followList, setFollowList] = useState<{ type: "followers" | "following"; items: any[] } | null>(null);
  const [statSheet, setStatSheet] = useState<{ type: "holders" | "holding"; items: any[] } | null>(null);
  const [holdingItems, setHoldingItems] = useState<any[]>(_profileHoldingsCache[creatorAddress] ?? []);
  const hybrid = useHybridBalance(60_000);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const isSelf = currentUserAddress && currentUserAddress === creatorAddress;
    if (!isSelf) { setUnreadCount(0); return; }
    const LAST_SEEN_KEY = `nft_notif_seen_${currentUserAddress}`;
    function poll() {
      const lastSeen = parseInt(localStorage.getItem(LAST_SEEN_KEY) ?? "0", 10);
      fetch(`${API}/social/notifications?address=${encodeURIComponent(currentUserAddress!)}&since=${lastSeen}`)
        .then(r => r.ok ? r.json() : { notifications: [] })
        .then(d => setUnreadCount((d.notifications ?? []).length))
        .catch(() => {});
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [currentUserAddress, creatorAddress]);

  useEffect(() => {
    fetch(`${API}/social/creators/${creatorAddress}`)
      .then(r => r.json())
      .then(d => { _profileDataCache[creatorAddress] = d; setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch(`${API}/social/profile/${creatorAddress}`)
      .then(r => r.json())
      .then(d => { const m = d.mints ?? []; _profileMintsCache[creatorAddress] = m; setMints(m); })
      .catch(() => {});
    fetch(`${API}/social/holdings/${creatorAddress}`)
      .then(r => r.ok ? r.json() : {})
      .then(d => { const data = d as { holdings?: any[] }; const h = Array.isArray(data.holdings) ? data.holdings : []; _profileHoldingsCache[creatorAddress] = h; setHoldingItems(h); })
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

  function handleQuickFile(field: "cover_url" | "avatar_url") {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string;
        quickSavePhoto(field, dataUrl);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    };
  }

  async function quickSavePhoto(field: "cover_url" | "avatar_url", dataUrl: string) {
    setPhotoUploading(field === "cover_url" ? "cover" : "avatar");
    try {
      await fetch(`${API}/social/creators/${creatorAddress}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: dataUrl }),
      });
      if (data) {
        const updated = { ...data, profile: { ...data.profile, [field]: dataUrl } };
        _profileDataCache[creatorAddress] = updated;
        setData(updated);
      }
      if (field === "cover_url") setImgErr(false);
    } catch {}
    finally { setPhotoUploading(null); }
  }

  async function openFollowList(type: "followers" | "following") {
    const res = await fetch(`${API}/social/creators/${creatorAddress}/${type}`).catch(() => null);
    const items = res?.ok ? await res.json() : [];
    setFollowList({ type, items });
    // Hydrate which of these the current user already follows so we can show
    // the right Follow / Following label on each row.
    if (currentUserAddress) {
      const r = await fetch(`${API}/social/creators/${currentUserAddress}/following`).catch(() => null);
      const myFollowing: any[] = r?.ok ? await r.json() : [];
      setMyFollowingSet(new Set(myFollowing.map(u => String(u.address).toLowerCase())));
    }
  }

  async function toggleFollowAddr(addr: string) {
    if (!currentUserAddress || addr.toLowerCase() === currentUserAddress.toLowerCase()) return;
    const key = addr.toLowerCase();
    if (followBusy.has(key)) return;
    setFollowBusy(prev => { const n = new Set(prev); n.add(key); return n; });
    const wasFollowing = myFollowingSet.has(key);
    // Optimistic
    setMyFollowingSet(prev => {
      const n = new Set(prev);
      if (wasFollowing) n.delete(key); else n.add(key);
      return n;
    });
    try {
      await fetch(`${API}/social/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follower: currentUserAddress, following: addr }),
      });
    } catch {
      // Revert on failure
      setMyFollowingSet(prev => {
        const n = new Set(prev);
        if (wasFollowing) n.add(key); else n.delete(key);
        return n;
      });
    } finally {
      setFollowBusy(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
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

  // Only block with full-screen loader if we have ZERO cached data
  if (loading && !data) return (
    <Portal>
      <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ background: "hsl(var(--background))" }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-accent)" }} />
        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Loading profile…</p>
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
        <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--color-text)" }}>
          {profile.username || shortAddr(creatorAddress)}
          {loading && <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: "var(--color-accent)" }} />}
        </span>
        <div className="flex gap-2">
          <button className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}>
            <Share2 size={14} style={{ color: "var(--color-text)" }} />
          </button>
          {isSelf && (
            <button
              onClick={() => {
                setUnreadCount(0);
                localStorage.setItem(`nft_notif_seen_${currentUserAddress}`, String(Date.now()));
                setNotifOpen(true);
              }}
              className="relative w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "var(--color-surface)" }}
            >
              <Bell size={14} style={{ color: "var(--color-text)" }} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] flex items-center justify-center rounded-full text-[9px] font-black px-0.5"
                  style={{ background: "var(--color-accent)", color: "#000" }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          )}
          {isSelf && (
            <button onClick={() => setShowEdit(true)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}>
              <Settings size={14} style={{ color: "var(--color-text)" }} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Cover image ── */}
        <div className="relative h-28 shrink-0" style={{ background: "linear-gradient(180deg,#0a0a0a 0%,#111111 100%)" }}>
          {!imgErr && profile.cover_url && (
            <img src={profile.cover_url} alt="" className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          )}
          {isSelf && (
            <>
              <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={handleQuickFile("cover_url")} />
              <button
                onClick={() => coverFileRef.current?.click()}
                className="absolute inset-0 w-full h-full flex items-center justify-center"
                style={{ background: photoUploading === "cover" ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)" }}
              >
                {photoUploading === "cover" && (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
              </button>
            </>
          )}
        </div>

        <div className="px-4 pt-3 pb-4">

          {/* ── Avatar + Stats row (Instagram-style) ── */}
          <div className="flex items-center gap-4 mb-3">
            {isSelf ? (
              <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
                <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={handleQuickFile("avatar_url")} />
                <Avatar src={profile.avatar_url} name={profile.username} size={80} ring />
                <button
                  onClick={() => avatarFileRef.current?.click()}
                  className="absolute inset-0 rounded-full flex items-center justify-center"
                  style={{ background: photoUploading === "avatar" ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)" }}
                >
                  {photoUploading === "avatar" && (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                </button>
              </div>
            ) : (
              <Avatar src={profile.avatar_url} name={profile.username} size={80} ring />
            )}
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

            {/* Trade + Follow buttons — always visible (Edit profile lives in the Settings gear) */}
            <div className="flex gap-2">
              <button onClick={() => setShowTrade(true)}
                className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
                style={{ background: "var(--color-accent)", color: "#000" }}>
                <BarChart2 size={14} /> Trade
              </button>
              {!isSelf && (
                <>
                  <button onClick={toggleFollow}
                    className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all"
                    style={{ background: isFollowing ? "var(--color-surface-2,var(--color-surface))" : "transparent", color: isFollowing ? "var(--color-text)" : "var(--color-text)", border: "1px solid var(--color-border)" }}>
                    {isFollowing ? <><UserCheck size={14} />Following</> : <><UserPlus size={14} />Follow</>}
                  </button>
                  <button onClick={() => setDmPeer({ address: creatorAddress, name: profile.username, avatar: profile.avatar_url })}
                    aria-label="Message"
                    className="px-3 py-3 rounded-xl font-bold text-sm flex items-center justify-center"
                    style={{ background: "var(--color-surface-2,var(--color-surface))", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                    <MessageCircle size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Hybrid wallet balance (only on own profile) ── */}
          {isSelf && (
            <div className="rounded-2xl p-3.5 mb-3" style={{ background: "var(--color-surface)" }}>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>Total Portfolio</span>
                {hybrid.loading && <RefreshCw size={10} className="animate-spin" style={{ color: "var(--color-text-secondary)" }} />}
              </div>
              <div className="text-2xl font-black mb-2.5" style={{ color: "var(--color-accent)" }}>
                {hybrid.loading && hybrid.chains.length === 0
                  ? "—"
                  : `$${hybrid.totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
              {hybrid.chains.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {hybrid.chains.filter(c => c.native > 0).map(c => (
                    <div key={c.chain} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <span style={{ color: CHAIN_COLOR[c.chain] ?? "var(--color-text-secondary)" }}>{c.chain}</span>
                      <span style={{ color: "var(--color-text)" }}>{c.native < 0.0001 ? c.native.toExponential(2) : c.native.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
                      <span style={{ color: "var(--color-text-secondary)" }}>·</span>
                      <span style={{ color: "var(--color-accent)" }}>${c.usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
      {dmPeer && currentUserAddress && (
        <DmSheet
          me={currentUserAddress}
          peer={dmPeer.address}
          peerName={dmPeer.name}
          peerAvatar={dmPeer.avatar}
          onClose={() => setDmPeer(null)}
        />
      )}
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
                ) : followList.items.map((u: any) => {
                  const addr = String(u.address ?? "");
                  if (!addr) return null;
                  const key = addr.toLowerCase();
                  const isMe = currentUserAddress && key === currentUserAddress.toLowerCase();
                  const followingThem = myFollowingSet.has(key);
                  const busy = followBusy.has(key);
                  const displayName = u.username ?? shortAddr(addr);
                  return (
                    <div key={addr} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: "var(--color-surface)" }}>
                      <button
                        onClick={() => {
                          setFollowList(null);
                          if (onOpenCreator) onOpenCreator(addr);
                        }}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-60"
                      >
                        <Avatar src={u.avatar_url} name={displayName} size={36} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text)" }}>{displayName}</p>
                            {u.is_verified && <BadgeCheck size={14} style={{ color: "var(--color-accent)" }} />}
                          </div>
                          <p className="text-[11px] font-mono truncate" style={{ color: "var(--color-text-secondary)" }}>{shortAddr(addr)}</p>
                        </div>
                      </button>
                      {!isMe && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              setFollowList(null);
                              setDmPeer({ address: addr, name: displayName, avatar: u.avatar_url });
                            }}
                            aria-label="Message"
                            className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-60"
                            style={{ background: "var(--color-surface-2,rgba(255,255,255,0.06))", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                          >
                            <MessageCircle size={13} />
                          </button>
                          <button
                            onClick={() => toggleFollowAddr(addr)}
                            disabled={busy || !currentUserAddress}
                            className="px-3 h-8 rounded-full text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                            style={{
                              background: followingThem ? "transparent" : "var(--color-accent)",
                              color: followingThem ? "var(--color-text)" : "#000",
                              border: followingThem ? "1px solid var(--color-border)" : "none",
                            }}
                          >
                            {followingThem ? <><UserCheck size={11} />Following</> : <><UserPlus size={11} />Follow</>}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
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
      {notifOpen && currentUserAddress && (
        <NotificationPanel address={currentUserAddress} onClose={() => setNotifOpen(false)} />
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
  const { address, provider, network, internalEvmAddress } = useWalletStore();
  const actorAddress = getNftProfileAddress({ address, provider, network, internalEvmAddress });
  const soldOut = post.max_supply !== null && post.mint_count >= post.max_supply;

  useEffect(() => {
    fetch(`${API}/social/posts/${post.id}`).then(r => r.json()).then(d => setComments(d.comments ?? [])).catch(() => {}).finally(() => setLoadingC(false));
  }, [post.id]);

  async function submitComment() {
    if (!commentText.trim() || !actorAddress) return;
    const txt = commentText; setCommentText("");
    await fetch(`${API}/social/posts/${post.id}/comment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: actorAddress, content: txt }) }).catch(() => {});
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
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>{commentHandle(c)[0]?.toUpperCase() ?? "?"}</div>
                <div><div className="flex items-center gap-1.5"><span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>{commentHandle(c)}</span><span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{timeAgo(c.created_at)}</span></div>
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
  const floorPrice = parseFloat(String(post.mint_price)) || 0;
  const [listPrice, setListPrice] = useState(() => floorPrice > 0 ? safePrice(floorPrice) : "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch(`${API}/social/prices`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.prices) setLivePrices(d.prices); })
      .catch(() => {});
  }, []);
  const { address, network, chainId, balance: storeBalance, provider, internalEvmAddress } = useWalletStore();
  const actorAddress = getNftProfileAddress({ address, provider, network, internalEvmAddress });
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
  const [qty, setQty] = useState(1);
  const liveUsdRate = livePrices[post.mint_currency?.toUpperCase() ?? ""] ?? 0;
  const liveUsdPerUnit = liveUsdRate > 0 ? mintPrice * liveUsdRate : null;

  const remainingSupply = post.max_supply ? Math.max(0, post.max_supply - post.mint_count) : null;
  const maxAffordable = mintPrice > 0 && availableNum > 0 ? Math.floor(availableNum / mintPrice) : 99;
  const maxQty = remainingSupply !== null
    ? Math.max(1, Math.min(remainingSupply, maxAffordable, 100))
    : Math.max(1, Math.min(maxAffordable, 100));

  const totalPrice = mintPrice * qty;
  const insufficientFunds = mode === "buy" && !!address && hasLoadedBalance && totalPrice > 0 && availableNum < totalPrice;
  const [, navigate] = useLocation();

  // Chain name → EVM chainId (for on-chain payment)
  const EVM_CHAIN_IDS: Record<string, number> = {
    ETH: 1, OP: 10, BASE: 8453, ARB: 42161, BNB: 56, MATIC: 137,
  };

  async function doMint() {
    if (!address) { navigate("/settings"); return; }
    if (!actorAddress) return;
    if (insufficientFunds) return;
    setLoading(true); setError("");
    try {
      // ── On-chain payment for EVM posts ──────────────────────────────────
      const postChain = post.chain ?? "BSV";
      const targetChainId = EVM_CHAIN_IDS[postChain];
      if (targetChainId && mintPrice > 0 && post.creator) {
        const valueWei = BigInt(Math.round(mintPrice * qty * 1e18));
        await sendEvmTransfer({
          from: address,
          to: post.creator,
          valueWei,
          targetChainId,
        });
      }

      // ── Record in backend ───────────────────────────────────────────────
      for (let i = 0; i < qty; i++) {
        const res = await fetch(`${API}/social/posts/${post.id}/mint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minter: actorAddress }) });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Mint failed");
      }
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
            <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>{mode === "buy" ? `${qty > 1 ? `${qty}× ` : ""}${post.title} permanently on ${post.chain ?? "BSV"}.` : `${post.title} is now listed for sale.`}</p>
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
                {/* Price + Balance comparison card */}
                <div className="rounded-2xl p-4 mb-3" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--color-text-secondary)" }}>Price per item</div>
                      <div className="text-xl font-black" style={{ color: "var(--color-text)" }}>
                        {safePrice(post.mint_price)}{" "}
                        <span className="font-bold" style={{ color: CHAIN_COLOR[post.chain] ?? "var(--color-accent)" }}>{post.mint_currency}</span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                        {liveUsdPerUnit !== null
                          ? `≈ $${liveUsdPerUnit < 1 ? liveUsdPerUnit.toFixed(4) : liveUsdPerUnit.toFixed(2)} each`
                          : `≈ $${post.mint_price_usd} each`}
                      </div>
                    </div>
                    {availableLabel && (
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--color-text-secondary)" }}>Your Balance</div>
                        <div className="text-xl font-black font-mono" style={{ color: insufficientFunds ? "#ff4444" : "var(--color-accent)" }}>{availableLabel}</div>
                        {insufficientFunds
                          ? <div className="text-[10px] mt-0.5 font-bold" style={{ color: "#ff4444" }}>Need {safePrice(totalPrice - availableNum)} more</div>
                          : address && hasLoadedBalance
                            ? <div className="text-[10px] mt-0.5 font-bold" style={{ color: "var(--color-accent)" }}>Enough ✓</div>
                            : null}
                      </div>
                    )}
                  </div>

                  {/* Quantity slider */}
                  {maxQty > 1 && mintPrice > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--color-text-secondary)" }}>Quantity</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setQty(q => Math.max(1, q - 1))}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-black"
                            style={{ background: "var(--color-border)", color: "var(--color-text)" }}>−</button>
                          <span className="text-base font-black w-8 text-center" style={{ color: "var(--color-text)" }}>{qty}</span>
                          <button onClick={() => setQty(q => Math.min(maxQty, q + 1))}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-black"
                            style={{ background: "var(--color-accent)", color: "#000" }}>+</button>
                        </div>
                      </div>
                      <input type="range" min={1} max={maxQty} value={qty}
                        onChange={e => setQty(parseInt(e.target.value, 10))}
                        className="w-full" style={{ accentColor: CHAIN_COLOR[post.chain] ?? "var(--color-accent)" }} />
                      <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                        <span>1</span>
                        <span>Max {maxQty}</span>
                      </div>
                    </div>
                  )}

                  {/* Total price row */}
                  {qty > 1 && (
                    <div className="flex items-center justify-between py-2 rounded-xl px-3 mb-3"
                      style={{ background: insufficientFunds ? "rgba(255,60,60,0.1)" : "rgba(0,255,136,0.07)", border: `1px solid ${insufficientFunds ? "rgba(255,60,60,0.25)" : "rgba(0,255,136,0.2)"}` }}>
                      <div>
                        <span className="text-xs font-bold" style={{ color: "var(--color-text-secondary)" }}>Total ({qty}×)</span>
                        {liveUsdPerUnit !== null && (
                          <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
                            ≈ ${(liveUsdPerUnit * qty).toFixed(2)}
                          </div>
                        )}
                      </div>
                      <span className="text-base font-black" style={{ color: insufficientFunds ? "#ff4444" : "var(--color-text)" }}>
                        {safePrice(totalPrice)} <span style={{ color: CHAIN_COLOR[post.chain] ?? "var(--color-accent)" }}>{post.mint_currency}</span>
                      </span>
                    </div>
                  )}

                  {/* Progress bar: total price vs balance */}
                  {availableLabel && totalPrice > 0 && availableNum > 0 && (
                    <div className="rounded-full overflow-hidden" style={{ height: 3, background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, (totalPrice / availableNum) * 100)}%`, background: insufficientFunds ? "#ff4444" : CHAIN_COLOR[post.chain] ?? "var(--color-accent)" }} />
                    </div>
                  )}
                </div>

                {/* Remaining details */}
                {[["Chain", `${post.chain ?? "BSV"} (on-chain inscription)`], ["Minted", `${fmtNum(post.mint_count)}${post.max_supply ? ` / ${fmtNum(post.max_supply)}` : " (open edition)"}`], ["Inscription", `${post.inscription_id.slice(0, 20)}…`]].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                    <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{l}</span>
                    <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{v}</span>
                  </div>
                ))}
                <div className="mt-3"><SupplyBar minted={post.mint_count} max={post.max_supply} /></div>
                {!address && <div className="mt-4 p-3 rounded-xl flex items-center gap-2" style={{ background: "rgba(255,170,0,0.12)" }}><Lock size={14} style={{ color: "#ffaa00" }} /><span className="text-xs" style={{ color: "#ffaa00" }}>Connect wallet to collect</span></div>}
                {insufficientFunds && <div className="mt-4 p-3 rounded-xl text-xs flex items-center gap-2" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}><span>Insufficient — need {safePrice(totalPrice)} {post.mint_currency} for {qty}×, you have {safePrice(availableNum)}</span></div>}
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
                    <><Zap size={16} />{address
                      ? qty > 1
                        ? `Buy ${qty}× for ${safePrice(totalPrice)} ${post.mint_currency}`
                        : `Buy for ${safePrice(mintPrice)} ${post.mint_currency}`
                      : "Connect Wallet"
                    }</>}
                </button>
              </>
            ) : (
              (() => {
                const parsedListPrice = parseFloat(listPrice) || 0;
                const sliderMin = 0;
                const sliderMax = floorPrice > 0 ? floorPrice * 20 : 0.001;
                const sliderStep = floorPrice > 0 ? floorPrice / 100 : 0.000001;
                const isBelowFloor = floorPrice > 0 && parsedListPrice > 0 && parsedListPrice < floorPrice;
                const liveListUsd = liveUsdRate > 0 && parsedListPrice > 0 ? parsedListPrice * liveUsdRate : null;
                return (
                <>
                  {/* Price card */}
                  <div className="rounded-2xl p-4 mb-3" style={{ background: "var(--color-surface)", border: `1px solid ${isBelowFloor ? "rgba(255,60,60,0.4)" : "var(--color-border)"}` }}>
                    <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--color-text-secondary)" }}>Your Listing Price</div>

                    {/* Price input */}
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-2" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${isBelowFloor ? "rgba(255,60,60,0.4)" : "var(--color-border)"}` }}>
                      <input type="number" min={0} step="any" placeholder={safePrice(floorPrice)}
                        className="flex-1 bg-transparent text-xl font-black outline-none"
                        style={{ color: "var(--color-text)" }}
                        value={listPrice} onChange={e => setListPrice(e.target.value)} />
                      <span className="text-sm font-bold shrink-0" style={{ color: CHAIN_COLOR[post.chain] ?? "var(--color-accent)" }}>{post.mint_currency}</span>
                    </div>
                    {liveListUsd !== null && (
                      <div className="text-xs mb-3" style={{ color: "var(--color-text-secondary)" }}>≈ ${liveListUsd < 1 ? liveListUsd.toFixed(4) : liveListUsd.toFixed(2)} USD</div>
                    )}

                    {/* Min / Max slider */}
                    {floorPrice > 0 && (
                      <div className="mb-1">
                        <input type="range"
                          min={sliderMin} max={sliderMax} step={sliderStep}
                          value={parsedListPrice || floorPrice}
                          onChange={e => setListPrice(safePrice(parseFloat(e.target.value)))}
                          className="w-full" style={{ accentColor: isBelowFloor ? "#ff4444" : (CHAIN_COLOR[post.chain] ?? "var(--color-accent)") }} />
                        <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                          <span>Min 0</span>
                          <span className="font-bold" style={{ color: CHAIN_COLOR[post.chain] ?? "var(--color-accent)" }}>
                            Floor {safePrice(floorPrice)}
                          </span>
                          <span>Max {safePrice(sliderMax)}</span>
                        </div>
                      </div>
                    )}

                    {/* Quick-pick buttons */}
                    {floorPrice > 0 && (
                      <div className="flex gap-2 mt-3">
                        {[["Floor", floorPrice], ["2×", floorPrice * 2], ["5×", floorPrice * 5], ["10×", floorPrice * 10]].map(([label, val]) => (
                          <button key={label as string}
                            onClick={() => setListPrice(safePrice(val as number))}
                            className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                            style={{
                              background: Math.abs(parsedListPrice - (val as number)) < sliderStep * 2 ? (CHAIN_COLOR[post.chain] ?? "var(--color-accent)") + "33" : "rgba(255,255,255,0.05)",
                              color: Math.abs(parsedListPrice - (val as number)) < sliderStep * 2 ? (CHAIN_COLOR[post.chain] ?? "var(--color-accent)") : "var(--color-text-secondary)",
                              border: `1px solid ${Math.abs(parsedListPrice - (val as number)) < sliderStep * 2 ? (CHAIN_COLOR[post.chain] ?? "var(--color-accent)") + "55" : "var(--color-border)"}`,
                            }}>
                            {label as string}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Below-floor warning */}
                  {isBelowFloor && (
                    <div className="mb-3 p-3 rounded-xl flex items-center gap-2" style={{ background: "rgba(255,60,60,0.1)", border: "1px solid rgba(255,60,60,0.25)" }}>
                      <span className="text-[11px]" style={{ color: "#ff6666" }}>⚠ Price is below the floor ({safePrice(floorPrice)} {post.mint_currency}). Buyers are unlikely to purchase below floor.</span>
                    </div>
                  )}

                  {!address && <div className="mb-3 p-3 rounded-xl flex items-center gap-2" style={{ background: "rgba(255,170,0,0.12)" }}><Lock size={14} style={{ color: "#ffaa00" }} /><span className="text-xs" style={{ color: "#ffaa00" }}>Connect wallet to list</span></div>}
                  {error && <div className="mb-3 p-3 rounded-xl text-xs" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}>{error}</div>}

                  <button onClick={doList} disabled={loading || !listPrice || parsedListPrice <= 0}
                    className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50"
                    style={{ background: loading || !listPrice || parsedListPrice <= 0 ? "#555" : "#ff4444", color: "#fff" }}>
                    {loading
                      ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : address
                        ? <><Tag size={15} />{`List for ${listPrice || "…"} ${post.mint_currency}`}</>
                        : "Connect Wallet"}
                  </button>
                </>
                );
              })()
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
  BSV:   { bg: "#00ff88", label: "BSV" },
  ETH:   { bg: "#627eea", label: "ETH" },
  BASE:  { bg: "#0052ff", label: "BASE" },
  BNB:   { bg: "#f3ba2f", label: "BNB" },
  MATIC: { bg: "#8247e5", label: "MATIC" },
  ARB:   { bg: "#12aaff", label: "ARB" },
  OP:    { bg: "#ff0420", label: "OP" },
  SOL:   { bg: "#9945ff", label: "SOL" },
  BTC:   { bg: "#f7931a", label: "BTC" },
  BCH:   { bg: "#4caf50", label: "BCH" },
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
  const { address, provider, network, internalEvmAddress } = useWalletStore();
  const actorAddress = getNftProfileAddress({ address, provider, network, internalEvmAddress });
  const [form, setForm] = useState({
    title: "", description: "", imageUrl: "", ticker: "",
    mintPrice: "0.001", mintCurrency: "BSV", category: "art", maxSupply: "", chain: "BSV",
  });
  const [mediaMode, setMediaMode] = useState<"url" | "file">("url");
  const [filePreview, setFilePreview] = useState("");
  const [fileData, setFileData] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const CHAIN_DEFAULT_PRICE: Record<string, string> = {
    BSV: "0.001", ETH: "0.0001", BASE: "0.0001", OP: "0.0001", ARB: "0.0001",
    BNB: "0.0005", MATIC: "0.01", SOL: "0.001", BTC: "0.00001", BCH: "0.001",
  };

  function selectChain(c: string) {
    setForm(f => ({ ...f, chain: c, mintCurrency: CHAIN_CURRENCY[c] ?? c, mintPrice: CHAIN_DEFAULT_PRICE[c] ?? "0.001" }));
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
    const creatorAddress = actorAddress ?? address;
    setLoading(true); setError("");
    try {
      const image_url = mediaMode === "url" ? form.imageUrl : fileData;
      const profileRes = await fetch(`${API}/social/creators/${creatorAddress}`).catch(() => null);
      const profileData = profileRes?.ok ? await profileRes.json() : null;
      const creatorName = profileData?.profile?.username || profileData?.username || shortAddr(creatorAddress);
      const res = await fetch(`${API}/social/posts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator: creatorAddress,
          creator_name: creatorName,
          title: form.title,
          description: form.description,
          image_url,
          ticker: form.ticker || undefined,
          mint_price: parseFloat(form.mintPrice) || 0,
          mint_currency: form.mintCurrency,
          category: form.category,
          max_supply: form.maxSupply ? parseInt(form.maxSupply, 10) : null,
          chain: form.chain,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      await fetch(`${API}/social/creators/${creatorAddress}`).catch(() => {});
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onSuccess(); }, 2200);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (success) return (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <div className="text-6xl mb-4">✨</div>
      <h3 className="text-xl font-bold mb-2" style={{ color: "var(--color-text)" }}>Posted on {CHAIN_LABEL[form.chain] ?? form.chain}!</h3>
      <p className="text-sm text-center px-6" style={{ color: "var(--color-text-secondary)" }}>
        Your post is permanently inscribed on {form.chain}. Your creator coin was auto-created.
      </p>
    </div>
  );

  return (
    <div className="p-4 pb-32 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-1" style={{ color: "var(--color-text)" }}>Create Post</h2>
      <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>
        Every post = NFT inscription + tradeable creator coin. Choose your chain below.
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
          <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>Creator coin ticker — auto-generated if blank</div>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Description</label>
          <textarea style={{ ...inp, resize: "none" } as React.CSSProperties} rows={3}
            placeholder="Tell collectors about this work…" value={form.description} onChange={set("description")} maxLength={500} />
        </div>

        {/* Chain selector */}
        <div>
          <label className="text-xs font-medium block mb-2" style={{ color: "var(--color-text-secondary)" }}>Chain</label>
          <div className="flex flex-wrap gap-1.5">
            {CHAINS.map(c => {
              const active = form.chain === c;
              const col = CHAIN_COLOR[c] ?? "#888";
              return (
                <button key={c} onClick={() => selectChain(c)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all"
                  style={{
                    background: active ? `${col}28` : "var(--color-surface)",
                    color: active ? col : "var(--color-text-secondary)",
                    border: active ? `1.5px solid ${col}80` : "1.5px solid transparent",
                  }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col }} />
                  {c}
                </button>
              );
            })}
          </div>
          {form.chain && (
            <p className="text-[10px] mt-1.5" style={{ color: "var(--color-text-secondary)" }}>
              Posting on <span style={{ color: CHAIN_COLOR[form.chain] ?? "inherit", fontWeight: 700 }}>{CHAIN_LABEL[form.chain] ?? form.chain}</span> · mint currency: <span style={{ fontWeight: 700, color: "var(--color-text)" }}>{form.mintCurrency}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Mint Price</label>
            <input style={inp} type="number" min="0" step="any" inputMode="decimal"
              placeholder={CHAIN_DEFAULT_PRICE[form.chain] ?? "0.001"}
              value={form.mintPrice} onChange={set("mintPrice")} />
            <div className="text-[10px] mt-1" style={{ color: "var(--color-text-secondary)" }}>
              Micro: {CHAIN_DEFAULT_PRICE[form.chain] ?? "0.001"} · any amount OK
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Currency</label>
            <div style={{ ...inp, display: "flex", alignItems: "center", fontWeight: 700, color: CHAIN_COLOR[form.chain] ?? "var(--color-text)" }}>
              {form.mintCurrency}
            </div>
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
          <div className="text-xs font-bold mb-2" style={{ color: "var(--color-accent)" }}>🌐 Supported Chains</div>
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

  // Truly disconnected — no wallet at all
  if (!address) return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-8">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}><User size={28} style={{ color: "var(--color-text-secondary)" }} /></div>
      <p className="text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>Connect your wallet to see your profile and creator coin</p>
      <button onClick={() => navigate("/settings")} className="px-6 py-2.5 rounded-xl font-bold text-sm" style={{ background: "var(--color-accent)", color: "#000" }}>Connect Wallet</button>
    </div>
  );

  // Wallet connected but internal EVM identity not yet ready (e.g. just switched chain)
  if (!profileAddress) return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-8">
      <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-accent)" }} />
      <p className="text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>Setting up your NFT identity…</p>
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
  const [feedChain, setFeedChain] = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ sort, limit: "20" });
    if (category !== "all") params.set("category", category);
    if (feedChain !== "all") params.set("chain", feedChain);
    if (search) params.set("q", search);
    fetch(`${API}/social/feed?${params}`).then(r => r.json()).then(d => setPosts(d.posts ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, [sort, category, feedChain, search]);

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
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 mb-1.5" style={{ scrollbarWidth: "none" }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all"
              style={{ background: category === c ? "rgba(0,255,136,0.15)" : "var(--color-surface)", color: category === c ? "var(--color-accent)" : "var(--color-text-secondary)", border: category === c ? "1px solid rgba(0,255,136,0.3)" : "1px solid transparent" }}>
              {CAT_ICONS[c]} {c}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {[{key:"all",label:"All Chains",color:"#888"}, ...CHAINS.map(c => ({ key: c, label: c, color: CHAIN_COLOR[c] ?? "#888" }))].map(({ key, label, color }) => (
            <button key={key} onClick={() => setFeedChain(key)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap shrink-0 transition-all"
              style={{
                background: feedChain === key ? `${color}22` : "var(--color-surface)",
                color: feedChain === key ? color : "var(--color-text-secondary)",
                border: feedChain === key ? `1.5px solid ${color}60` : "1.5px solid transparent",
              }}>
              {key !== "all" && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}
              {label}
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

/* ─── DIRECT MESSAGE SHEET ─────────────────────────────────────────────────── */
function dmChannelFor(a: string, b: string): string {
  return `dm:${[a.toLowerCase(), b.toLowerCase()].sort().join(":")}`;
}

function DmSheet({ me, peer, peerName, peerAvatar, onClose }: {
  me: string; peer: string; peerName: string; peerAvatar?: string; onClose: () => void;
}) {
  const channel = useMemo(() => dmChannelFor(me, peer), [me, peer]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(false);
  const [cryptoReady, setCryptoReady] = useState(false);
  const [error, setError] = useState("");
  const cryptoKeyRef = useRef<CryptoKey | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    deriveChannelKey(channel).then(k => { cryptoKeyRef.current = k; setCryptoReady(true); });
  }, [channel]);

  useEffect(() => {
    if (!cryptoReady) return;
    const src = new EventSource(`${API}/chat/channels/${encodeURIComponent(channel)}/stream`);
    src.onopen = () => setOnline(true);
    src.onerror = () => setOnline(false);
    src.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "backfill") {
          const msgs: ChatMsg[] = data.messages ?? [];
          setMessages(msgs);
          const entries = await Promise.all(
            msgs.map(async m => [m.id, await decryptMessage(cryptoKeyRef.current!, m.text)] as const)
          );
          setDecrypted(prev => ({ ...prev, ...Object.fromEntries(entries) }));
        } else if (data.id) {
          setMessages(prev => prev.find(m => m.id === data.id) ? prev : [...prev, data]);
          const plain = await decryptMessage(cryptoKeyRef.current!, data.text);
          setDecrypted(prev => ({ ...prev, [data.id]: plain }));
        }
      } catch {}
    };
    return () => src.close();
  }, [cryptoReady, channel]);

  useEffect(() => {
    if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const txt = input.trim();
    if (!txt || sending || !cryptoKeyRef.current) return;
    setInput("");
    setSending(true);
    setError("");
    try {
      const displayName = `${me.slice(0, 6)}…${me.slice(-4)}`;
      const encrypted = await encryptMessage(cryptoKeyRef.current, txt);
      const res = await fetch(`${API}/chat/channels/${encodeURIComponent(channel)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: encrypted, wallet: me, displayName, role: "trader" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "Failed to send");
    } catch { setError("Network error"); }
    finally { setSending(false); inputRef.current?.focus(); }
  }

  function fmtTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "hsl(var(--background))" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-3 shrink-0 border-b" style={{ borderColor: "var(--color-border)" }}>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}>
          <ChevronLeft size={18} style={{ color: "var(--color-text)" }} />
        </button>
        <Avatar src={peerAvatar} name={peerName} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm truncate" style={{ color: "var(--color-text)" }}>{peerName}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono shrink-0" style={{ background: "rgba(0,255,136,0.12)", color: "var(--color-accent)" }}>🔒 E2E</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: online ? "var(--color-accent)" : "#666" }} />
            <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{online ? "live" : "connecting…"}</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {!cryptoReady && (
          <div className="text-center text-[10px] py-4" style={{ color: "var(--color-text-secondary)" }}>🔒 Initialising encryption…</div>
        )}
        {cryptoReady && messages.length === 0 && (
          <div className="text-center py-16">
            <MessageCircle size={36} style={{ color: "var(--color-text-secondary)", margin: "0 auto 10px" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Say hi to {peerName}</p>
            <p className="text-[11px] mt-1" style={{ color: "var(--color-text-secondary)" }}>Messages are end-to-end encrypted.</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.wallet.toLowerCase() === me.toLowerCase();
          const plain = decrypted[msg.id] ?? (msg.text.startsWith("enc:") ? "🔒…" : msg.text);
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[78%]">
                <div className="px-3 py-2 rounded-2xl text-[13px] leading-snug break-words"
                  style={{
                    background: isMe ? "var(--color-accent)" : "var(--color-surface)",
                    color: isMe ? "#000" : "var(--color-text)",
                    borderBottomRightRadius: isMe ? 4 : undefined,
                    borderBottomLeftRadius: !isMe ? 4 : undefined,
                  }}>
                  {plain}
                </div>
                <div className={`text-[9px] mt-0.5 ${isMe ? "text-right" : "text-left"}`} style={{ color: "var(--color-text-secondary)" }}>
                  {fmtTime(msg.ts)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {error && (
        <div className="px-3 py-1.5 text-[10px] text-center" style={{ background: "rgba(255,80,80,0.12)", color: "#ff5555" }}>{error}</div>
      )}
      <div className="flex items-center gap-2 px-3 py-2.5 shrink-0 border-t" style={{ borderColor: "var(--color-border)", paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
        <input ref={inputRef} value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={cryptoReady ? `Message ${peerName}…` : "Initialising…"}
          disabled={!cryptoReady || sending}
          className="flex-1 px-3 py-2.5 rounded-full text-[13px] outline-none border"
          style={{ background: "var(--color-surface)", color: "var(--color-text)", borderColor: "var(--color-border)" }} />
        <button onClick={send} disabled={!input.trim() || sending || !cryptoReady}
          className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40"
          style={{ background: "var(--color-accent)", color: "#000" }}>
          <SendIcon size={16} />
        </button>
      </div>
    </div>,
    document.body
  );
}

/* ─── NFT CHAT TAB ──────────────────────────────────────────────────────────── */
interface ChatMsg {
  id: string; channel: string; wallet: string; displayName: string;
  role: string; text: string; ts: number; txid?: string; replyTo?: string;
}

function NftChatTab() {
  const { address, provider, network, internalEvmAddress } = useWalletStore();
  const actor = getNftProfileAddress({ address, provider, network, internalEvmAddress });

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [cryptoReady, setCryptoReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);

  const CHANNEL = "nft";

  useEffect(() => {
    deriveChannelKey(CHANNEL).then(k => { cryptoKeyRef.current = k; setCryptoReady(true); });
  }, []);

  async function decryptBatch(msgs: ChatMsg[]) {
    if (!cryptoKeyRef.current) return;
    const entries = await Promise.all(
      msgs.map(async m => [m.id, await decryptMessage(cryptoKeyRef.current!, m.text)] as const)
    );
    setDecrypted(prev => ({ ...prev, ...Object.fromEntries(entries) }));
  }

  useEffect(() => {
    if (!cryptoReady) return;
    const src = new EventSource(`${API}/chat/channels/${CHANNEL}/stream`);
    src.onopen = () => setOnline(true);
    src.onerror = () => setOnline(false);
    src.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "backfill") {
          const msgs: ChatMsg[] = data.messages ?? [];
          setMessages(msgs);
          decryptBatch(msgs);
        } else if (data.id) {
          setMessages(prev => {
            if (prev.find(m => m.id === data.id)) return prev;
            return [...prev, data];
          });
          decryptMessage(cryptoKeyRef.current!, data.text).then(plain =>
            setDecrypted(prev => ({ ...prev, [data.id]: plain }))
          );
        }
      } catch {}
    };
    return () => src.close();
  }, [cryptoReady]);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function sendMsg() {
    const txt = input.trim();
    if (!txt || sending || !cryptoKeyRef.current) return;
    setInput("");
    setSending(true);
    setError("");
    try {
      const displayName = actor ? `${actor.slice(0, 6)}…${actor.slice(-4)}` : "anon";
      const encrypted = await encryptMessage(cryptoKeyRef.current, txt);
      const res = await fetch(`${API}/chat/channels/${CHANNEL}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: encrypted, wallet: actor ?? "anonymous", displayName, role: "trader" }),
      });
      const d = await res.json();
      if (!res.ok) setError(d.error ?? "Failed to send");
    } catch { setError("Network error"); }
    finally { setSending(false); inputRef.current?.focus(); }
  }

  function fmtTime(ts: number) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const roleColor: Record<string, string> = {
    trader: "var(--color-text-secondary)",
    leader: "#00ff88",
    support: "#ffaa00",
    system: "#7b68ee",
    ora: "#00aaff",
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "hsl(var(--background))" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-2">
          <MessagesSquare size={16} style={{ color: "var(--color-accent)" }} />
          <span className="font-bold text-sm" style={{ color: "var(--color-text)" }}>NFT Community Chat</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: "rgba(0,255,136,0.12)", color: "var(--color-accent)" }}>🔒 E2E</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: online ? "var(--color-accent)" : "#666", boxShadow: online ? "0 0 6px var(--color-accent)" : "none" }} />
          <span className="text-[10px]" style={{ color: online ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
            {online ? "live" : "connecting…"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-16">
            <MessagesSquare size={40} style={{ color: "var(--color-text-secondary)", margin: "0 auto 12px" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>NFT Community Chat</p>
            <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
              Discuss NFTs, drops, and creators with the community.
            </p>
          </div>
        )}
        {!cryptoReady && (
          <div className="flex justify-center py-4">
            <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>🔒 Initialising encryption…</span>
          </div>
        )}
        {messages.map(msg => {
          const isMe = actor && msg.wallet === actor;
          const isSystem = msg.role === "system" || msg.role === "ora";
          const plainText = decrypted[msg.id] ?? msg.text;
          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="text-[10px] px-3 py-1 rounded-full" style={{ background: "rgba(123,104,238,0.12)", color: "#7b68ee" }}>
                  {plainText}
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: isMe ? "rgba(0,255,136,0.2)" : "var(--color-surface)", color: isMe ? "var(--color-accent)" : "var(--color-text-secondary)" }}>
                {(msg.displayName?.[0] ?? "?").toUpperCase()}
              </div>
              <div className={`flex flex-col max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  {!isMe && (
                    <span className="text-[10px] font-semibold" style={{ color: roleColor[msg.role] ?? "var(--color-text-secondary)" }}>
                      {msg.displayName}
                    </span>
                  )}
                  <span className="text-[9px]" style={{ color: "var(--color-text-secondary)" }}>{fmtTime(msg.ts)}</span>
                </div>
                <div className="px-3 py-2 rounded-2xl text-xs break-words"
                  style={{
                    background: isMe ? "var(--color-accent)" : "var(--color-surface)",
                    color: isMe ? "#000" : "var(--color-text)",
                    borderBottomRightRadius: isMe ? 4 : undefined,
                    borderBottomLeftRadius: !isMe ? 4 : undefined,
                  }}>
                  {plainText}
                  {msg.txid && (
                    <div className="mt-1 text-[9px] font-mono opacity-70 truncate"
                      style={{ maxWidth: 180, color: isMe ? "#000" : "var(--color-accent)" }}>
                      txid: {msg.txid.slice(0, 12)}…
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="px-3 py-1 text-[10px] shrink-0" style={{ color: "#ff4444", background: "rgba(255,68,68,0.08)" }}>
          {error}
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 px-3 pt-2 border-t" style={{ borderColor: "var(--color-border)", paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))", background: "var(--color-bg)" }}>
        {!actor ? (
          <div className="py-2.5 text-center text-xs rounded-xl" style={{ background: "var(--color-surface)", color: "var(--color-text-secondary)" }}>
            Connect a wallet to chat
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-xs outline-none min-w-0"
              style={{ color: "var(--color-text)" }}
              placeholder="Message the NFT community…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMsg())}
              maxLength={500}
              disabled={sending}
            />
            <button
              onClick={sendMsg}
              disabled={!input.trim() || sending}
              className="flex items-center justify-center w-7 h-7 rounded-xl shrink-0 transition-all active:scale-90 disabled:opacity-40"
              style={{ background: input.trim() ? "var(--color-accent)" : "rgba(255,255,255,0.06)", color: input.trim() ? "#000" : "var(--color-text-secondary)" }}>
              <Send size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Notification types ─────────────────────────────────────────────────── */
interface SocialNotif {
  id: string;
  type: string;
  title: string;
  body: string;
  timestamp: number;
  txid?: string;
}

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  like:    <Heart size={14} className="text-rose-400" />,
  mint:    <Zap size={14} className="text-yellow-400" />,
  comment: <MessageCircle size={14} className="text-sky-400" />,
};

function timeAgoShort(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function NotificationPanel({ address, onClose }: { address: string; onClose: () => void }) {
  const [notifs, setNotifs] = useState<SocialNotif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/social/notifications?address=${encodeURIComponent(address)}`)
      .then(r => r.ok ? r.json() : { notifications: [] })
      .then(d => { setNotifs(d.notifications ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [address]);

  function clearAll() {
    fetch(`${API}/social/notifications?address=${encodeURIComponent(address)}`, { method: "DELETE" }).catch(() => {});
    setNotifs([]);
  }

  return (
    <Portal>
      <div
        className="absolute inset-0 z-50 flex flex-col"
        style={{ background: "rgba(0,0,0,0.55)" }}
        onClick={onClose}
      >
        <div className="flex-1" />
        <div
          className="rounded-t-2xl flex flex-col"
          style={{ background: "hsl(var(--card))", maxHeight: "75vh" }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-primary" />
              <span className="font-bold text-sm text-foreground">Notifications</span>
              {notifs.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold">{notifs.length}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {notifs.length > 0 && (
                <button onClick={clearAll} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Clear all</button>
              )}
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-xl bg-secondary/60">
                <X size={14} className="text-foreground/70" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 space-y-1.5" style={{ minHeight: 120 }}>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <Bell size={28} strokeWidth={1.5} />
                <span className="text-sm">No notifications yet</span>
                <span className="text-[11px] text-center text-muted-foreground/60">You'll see likes, mints, and comments on your posts here</span>
              </div>
            ) : (
              notifs.map(n => (
                <div key={n.id} className="flex items-start gap-2.5 p-2.5 rounded-xl border border-border/30 bg-secondary/20">
                  <div className="w-7 h-7 rounded-full bg-secondary/60 flex items-center justify-center shrink-0 mt-0.5">
                    {NOTIF_ICONS[n.type] ?? <Bell size={13} className="text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-foreground leading-tight">{n.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{n.body}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0 mt-0.5">{timeAgoShort(n.timestamp)}</span>
                </div>
              ))
            )}
          </div>
          <div style={{ height: "env(safe-area-inset-bottom, 12px)", minHeight: 12 }} />
        </div>
      </div>
    </Portal>
  );
}

export function MobileNFT() {
  const [activeTab, setActiveTab] = useState<"feed" | "search" | "create" | "chat" | "profile">("feed");
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [mintPost, setMintPost] = useState<{ post: Post; mode: "buy" | "sell" } | null>(null);
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [creatorAddress, setCreatorAddress] = useState<string | null>(null);
  const { address, provider, network, internalEvmAddress } = useWalletStore();
  const profileAddress = getNftProfileAddress({ address, provider, network, internalEvmAddress });

  useEffect(() => {
    setCreatorAddress(null);
    if (!profileAddress) {
      setActiveTab((tab) => (tab === "profile" ? "feed" : tab));
    }
  }, [profileAddress]);

  // Auto-restore profile overlay when profile tab is active but all other overlays have closed
  useEffect(() => {
    if (activeTab === "profile" && profileAddress && !creatorAddress && !detailPost && !mintPost) {
      setCreatorAddress(profileAddress);
    }
  }, [activeTab, profileAddress, creatorAddress, detailPost, mintPost]);

  function handleLike(id: string) {
    setLikedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    if (profileAddress) fetch(`${API}/social/posts/${id}/like`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: profileAddress }) }).catch(() => {});
  }

  const openCreator = useCallback((addr: string) => setCreatorAddress(addr), []);
  const openPost = useCallback((p: Post) => setDetailPost(p), []);

  const INNER_TABS = [
    { key: "feed"    as const, label: "Feed",    Icon: Layers },
    { key: "search"  as const, label: "Search",  Icon: Search },
    { key: "create"  as const, label: "Create",  Icon: PlusSquare },
    { key: "chat"    as const, label: "Chat",    Icon: MessagesSquare },
    { key: "profile" as const, label: "Profile", Icon: User },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: "hsl(var(--background))" }}>
      {/* Inner nav */}
      <div className="flex items-center shrink-0 px-3 pt-2 pb-1 gap-1" style={{ borderBottom: "1px solid var(--color-border)" }}>
        {INNER_TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => {
            setActiveTab(key);
            // Open profile overlay immediately (same batch = no spinner flash)
            if (key === "profile" && profileAddress) setCreatorAddress(profileAddress);
          }}
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
        {activeTab === "chat"    && <NftChatTab />}
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
          onOpenCreator={openCreator}
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
