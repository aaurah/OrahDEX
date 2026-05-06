import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Heart, MessageCircle, Share2, Zap, BadgeCheck, Search,
  TrendingUp, PlusSquare, User, ChevronLeft, X, Upload,
  Flame, Clock, Star, Lock, Layers, Copy, Send, Globe,
  AtSign, Camera, ArrowUpRight, ArrowDownRight,
  UserPlus, UserCheck, BarChart2, Grid3X3, Activity,
  ShoppingBag, Settings, ChevronRight, RefreshCw, Sparkles, ExternalLink, Edit3, Link, ImageIcon, MessagesSquare,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { useBsvBalance } from "@/hooks/useBsvBalance";
import { resolveNftSpendBalance } from "@/lib/nftBalance";
import { useLocation } from "wouter";
import { deriveChannelKey, encryptMessage, decryptMessage } from "@/lib/chatCrypto";
import { useHybridBalance } from "@/hooks/useHybridBalance";
import { signTradeIfNeeded } from "@/lib/tradeSig";
import { MediaCapture } from "@/components/MediaCapture";

const API = (import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "") + "/api";

/** Only allow http/https URLs or raster-format data URIs for image src attributes.
 *  SVG is excluded because it can contain embedded JavaScript. */
function sanitizeImageUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "http:") return u.href;
    if (u.protocol === "data:" && /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(url)) return url;
  } catch { /* invalid URL */ }
  return "";
}

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
// Auto-generated coin symbols are the last few uppercase hex chars of the
// creator's wallet address. Treat those as addresses so we hide them when a
// real handle exists — trading is keyed off the handle, not the raw address.
function isAddrLikeSymbol(s?: string) {
  if (!s) return true;
  const t = s.trim();
  return t.length === 0 || /^[0-9A-F]{4,8}$/.test(t);
}
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
function safePrice(v: unknown, decimals = 4) {
  const n = Number(v);
  return isFinite(n) ? n.toFixed(decimals) : "0.0000";
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
  // only cleared when a genuinely different wallet connects.
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
const CHAINS = ["BSV", "ETH", "BASE", "BNB", "MATIC", "ARB", "OP", "SOL", "BTC", "BCH"];
const CHAIN_COLOR: Record<string, string> = {
  BSV: "#00ff88", ETH: "#627eea", BASE: "#0052ff", BNB: "#f3ba2f",
  MATIC: "#8247e5", ARB: "#12aaff", OP: "#ff0420", SOL: "#9945ff",
  BTC: "#f7931a", BCH: "#4caf50",
};
// Chain → EVM chainId. Non-EVM chains (BSV/SOL/BTC/BCH) are intentionally absent
// so the wallet keeps its current network for those — only the feed filter changes.
const EVM_CHAIN_IDS_FOR_NFT: Record<string, number> = {
  ETH: 1, OP: 10, BASE: 8453, ARB: 42161, BNB: 56, MATIC: 137,
};
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
  const nativeSymbol = isEvm && !isOrahWallet ? (nativeEvmBalance?.symbol ?? "ETH") : "BSV";
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
        const params = (mode === "buy"
          ? `type=buy&bsv_amount=${bsvAmount}`
          : `type=sell&token_amount=${tokenAmount}`) + `&payment_asset=${nativeSymbol}`;
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
      const amountStr = mode === "buy"
        ? String(parseFloat(bsvAmount))
        : String(parseFloat(tokenAmount));
      const sig = await signTradeIfNeeded({
        walletAddress: address, network, isOrahWallet,
        creator: creator.address, side: mode, amount: amountStr, asset: nativeSymbol,
      });
      const res = await fetch(`${API}/social/creators/${creator.address}/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trader: address, trade_type: mode,
          bsv_amount: mode === "buy" ? parseFloat(bsvAmount) : undefined,
          token_amount: mode === "sell" ? parseFloat(tokenAmount) : undefined,
          payment_asset: nativeSymbol,
          ...(sig.nonce && sig.signature ? { nonce: sig.nonce, signature: sig.signature } : {}),
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
              {mode === "buy" ? `+${fmtNum(success.tokensExchanged)} ${isAddrLikeSymbol(creator.symbol) ? (creator.username || "tokens") : `$${creator.symbol}`}` : `+${safePrice(success.bsvExchanged)} ${nativeSymbol}`}
            </p>
            <p className="text-[10px] text-muted-foreground mb-4">New market cap: {fmtUsd(success.newMarketCap)}</p>
            <button onClick={onClose} className="px-6 py-2 rounded-xl text-sm font-bold" style={{ background: "#00ff88", color: "#000" }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Avatar src={creator.avatar_url} name={creator.username} size={28} />
                <span className="font-bold text-foreground">{creator.username || (isAddrLikeSymbol(creator.symbol) ? "Anon" : `$${creator.symbol}`)}</span>
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
                  <label className="text-xs text-muted-foreground">{nativeSymbol} Amount</label>
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
                <div className="flex justify-between"><span>Est. receive</span><span className="font-mono text-foreground">{mode === "buy" ? `${fmtNum(quote.tokensOut)} ${isAddrLikeSymbol(creator.symbol) ? "tokens" : `$${creator.symbol}`}` : `${safePrice(quote.bsvOut)} ${nativeSymbol}`}</span></div>
                <div className="flex justify-between"><span>Price impact</span><span className="font-mono" style={{ color: (quote.priceImpact ?? 0) > HIGH_PRICE_IMPACT_THRESHOLD_PERCENT ? "#ff4444" : "#00ff88" }}>{safePrice(quote.priceImpact, 2)}%</span></div>
              </div>
            )}
            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            <button onClick={doTrade} disabled={loading || !canTrade}
              className="w-full mt-4 py-3 rounded-xl font-bold text-sm disabled:opacity-50 transition-all"
              style={{ background: insufficientFunds || insufficientTokens ? "#555" : mode === "buy" ? "#00ff88" : "#ff4444", color: insufficientFunds || insufficientTokens ? "#fff" : "#000" }}>
              {loading ? "Processing…" : insufficientFunds ? "Insufficient Balance" : insufficientTokens ? "Insufficient Tokens" : `${mode === "buy" ? "Buy" : "Sell"} ${isAddrLikeSymbol(creator.symbol) ? (creator.username || "tokens") : `$${creator.symbol}`}`}
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
  const [chain, setChain] = useState("all");
  const switchChain = useWalletStore(s => s.switchChain);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort, limit: "50" });
      if (cat !== "all") params.set("category", cat);
      if (chain !== "all") params.set("chain", chain);
      const r = await fetch(`${API}/social/feed?${params}`);
      if (r.ok) { const d = await r.json(); setPosts(d.posts ?? d); }
    } catch {} finally { setLoading(false); }
  }, [sort, cat, chain]);
  useEffect(() => { load(); }, [load]);

  // Smart chain switch: when the user picks an EVM chain in the filter, also
  // flip the connected wallet to that chain so trading/minting hits the right
  // network without an extra step. Non-EVM chains (BSV/SOL/BTC/BCH) just filter
  // the feed; the wallet keeps whatever provider it has.
  function pickChain(c: string) {
    setChain(c);
    const id = EVM_CHAIN_IDS_FOR_NFT[c];
    if (id) switchChain(id);
  }

  const chainOpts = [{ key: "all", label: "All", color: "#888" }, ...CHAINS.map(c => ({ key: c, label: c, color: CHAIN_COLOR[c] ?? "#888" }))];

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
        <div className="ml-auto flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {chainOpts.map(({ key, label, color }) => {
            const active = chain === key;
            return (
              <button key={key} onClick={() => pickChain(key)}
                title={key === "all" ? "Show all chains" : `Filter ${label} & switch wallet`}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap shrink-0 transition-all"
                style={{
                  background: active ? `${color}22` : "transparent",
                  color: active ? color : "var(--color-text-secondary)",
                  border: active ? `1px solid ${color}60` : "1px solid transparent",
                }}>
                {key !== "all" && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}
                {label}
              </button>
            );
          })}
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

  /** Sanitize image URLs at state-set time: only allow http/https or raster data URIs */
  function setValidatedImageUrl(url: string) {
    setImageUrl(sanitizeImageUrl(url));
  }
  const [mintPrice, setMintPrice] = useState("0.001");
  const [maxSupply, setMaxSupply] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTab, setCaptureTab] = useState<"camera" | "ai" | "photos">("camera");

  function openCapture(tab: "camera" | "ai" | "photos") {
    setCaptureTab(tab);
    setCaptureOpen(true);
  }

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

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-lg font-bold text-foreground">Create Post</h2>
        {!address && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
               style={{ background: "rgba(255,170,0,0.12)", color: "#ffaa00" }}>
            <Lock size={13} />
            <span>Connect a wallet to publish — you can still generate AI images now.</span>
          </div>
        )}
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
          <label className="text-xs text-muted-foreground font-semibold">Image</label>
          {imageUrl && (
            <div className="rounded-xl overflow-hidden border border-border" style={{ aspectRatio: "1/1", maxWidth: 280 }}>
              <img src={imageUrl} alt="" className="w-full h-full object-cover"
                   onError={() => setImageUrl("")} />
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => openCapture("camera")}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}>
              <Camera size={13} /> Camera
            </button>
            <button type="button" onClick={() => openCapture("ai")}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              style={{ background: "#00ff88", color: "#000" }}>
              <Sparkles size={13} /> AI Generate
            </button>
            <button type="button" onClick={() => openCapture("photos")}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}>
              <ImageIcon size={13} /> Upload
            </button>
          </div>
          <input value={imageUrl} onChange={e => setValidatedImageUrl(e.target.value)} placeholder="…or paste image URL"
            className="w-full px-3 py-2.5 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary" />
          <MediaCapture open={captureOpen} onClose={() => setCaptureOpen(false)}
            initialTab={captureTab}
            onSelect={(dataUrl) => setValidatedImageUrl(dataUrl)} />
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
          {loading ? "Publishing…" : !address ? "Connect Wallet to Publish" : "Publish to BSV"}
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

  // Truly disconnected — no wallet at all
  if (!address) {
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

  // Wallet connected but internal EVM identity not yet ready (e.g. just switched chain)
  if (!profileAddress) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <RefreshCw size={24} className="mx-auto mb-3 text-muted-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">Setting up your NFT identity…</p>
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
                  {!isAddrLikeSymbol(creator.symbol) && <span className="text-sm font-bold text-primary">${creator.symbol}</span>}
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
  const [avatarCaptureOpen, setAvatarCaptureOpen] = useState(false);
  const isViewingOwnProfile = !!currentUserAddress && currentUserAddress === creatorAddress;
  const hybrid = useHybridBalance(60_000);

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
                {createForm.avatar_url && (
                  <div className="flex justify-center">
                    <div className="w-20 h-20 rounded-full overflow-hidden" style={{ border: "2px solid #00ff88" }}>
                      <img src={createForm.avatar_url} alt="" className="w-full h-full object-cover"
                           onError={() => setCreateForm(p => ({ ...p, avatar_url: "" }))} />
                    </div>
                  </div>
                )}
                <button type="button" onClick={() => setAvatarCaptureOpen(true)}
                  className="w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                  style={{ background: "#00ff88", color: "#000" }}>
                  <Camera size={12} /> Camera
                  <span style={{ opacity: 0.5 }}>•</span>
                  <Sparkles size={12} /> AI
                  <span style={{ opacity: 0.5 }}>•</span>
                  <ImageIcon size={12} /> Upload
                </button>
                <input
                  value={createForm.avatar_url}
                  onChange={e => setCreateForm(prev => ({ ...prev, avatar_url: e.target.value }))}
                  placeholder="…or paste avatar URL"
                  className="w-full px-3 py-2 rounded-xl text-sm bg-muted/30 border border-border text-foreground outline-none focus:border-primary"
                />
                <MediaCapture open={avatarCaptureOpen} onClose={() => setAvatarCaptureOpen(false)}
                  onSelect={(dataUrl) => setCreateForm(p => ({ ...p, avatar_url: dataUrl }))} />
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
                      <span className="font-bold text-foreground">{creator.username || "Anon"}</span>
                      {creator.is_verified && <BadgeCheck size={14} className="text-primary" />}
                    </div>
                    {!isAddrLikeSymbol(creator.symbol) && <span className="text-sm font-bold text-primary">${creator.symbol}</span>}
                  </div>
                  <button onClick={() => setShowTrade(true)}
                    className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: "#00ff88", color: "#000" }}>
                    Trade {isAddrLikeSymbol(creator.symbol) ? (creator.username || "tokens") : `$${creator.symbol}`}
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

              {/* ── Hybrid portfolio (own profile only) ── */}
              {isViewingOwnProfile && (
                <div className="mx-4 mb-3 rounded-xl p-3 border border-border/40" style={{ background: "rgba(0,255,136,0.04)" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Portfolio</span>
                    {hybrid.loading && <RefreshCw size={10} className="animate-spin text-muted-foreground" />}
                  </div>
                  <div className="text-lg font-black text-primary mb-1.5">
                    {hybrid.loading && hybrid.chains.length === 0
                      ? "—"
                      : `$${hybrid.totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </div>
                  {hybrid.chains.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {hybrid.chains.filter(c => c.native > 0).map(c => (
                        <span key={c.symbol} className="text-[10px] px-1.5 py-0.5 rounded-md border border-border/40 text-muted-foreground">
                          {c.symbol} {c.native < 0.0001 ? c.native.toExponential(2) : c.native.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                          {" · "}
                          <span className="text-primary">${c.usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                      <span className="text-xs font-medium text-muted-foreground truncate">{(h as any).username ?? "Anon holder"}</span>
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

/* ─── CHAT PANEL (desktop) ───────────────────────────────────────────────────── */
interface ChatMsg {
  id: string; channel: string; wallet: string; displayName: string;
  role: string; text: string; ts: number; txid?: string;
}

function NftChatPanel() {
  const { address, provider, network, internalEvmAddress } = useWalletStore();
  const actor = getNftProfileAddress({ address, provider, network, internalEvmAddress });

  const CHANNEL = "nft";
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
          setMessages(prev => prev.find(m => m.id === data.id) ? prev : [...prev, data]);
          decryptMessage(cryptoKeyRef.current!, data.text).then(plain =>
            setDecrypted(prev => ({ ...prev, [data.id]: plain }))
          );
        }
      } catch {}
    };
    return () => src.close();
  }, [cryptoReady]);

  useEffect(() => {
    if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  const roleColor: Record<string, string> = {
    trader: "hsl(var(--muted-foreground))",
    leader: "hsl(var(--primary))",
    support: "#ffaa00",
    system: "#7b68ee",
    ora: "#00aaff",
  };

  return (
    <div className="flex h-full">
      {/* Message list */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <MessagesSquare size={16} className="text-primary" />
            <span className="font-bold text-sm text-foreground">NFT Community Chat</span>
            <span className="text-[10px] text-muted-foreground">(real-time · all users)</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono bg-primary/10 text-primary">🔒 E2E encrypted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: online ? "hsl(var(--primary))" : "#555", boxShadow: online ? "0 0 5px hsl(var(--primary))" : "none" }} />
            <span className="text-[10px]" style={{ color: online ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
              {online ? "live" : "connecting…"}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <MessagesSquare size={48} className="text-muted-foreground/30 mb-3" />
              <p className="text-base font-semibold text-foreground">NFT Community Chat</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Discuss NFTs, drops, creator coins, and BSV inscriptions with the community.
              </p>
            </div>
          )}
          {!cryptoReady && (
            <div className="flex justify-center py-4">
              <span className="text-xs text-muted-foreground">🔒 Initialising encryption…</span>
            </div>
          )}
          {messages.map(msg => {
            const isMe = actor && msg.wallet === actor;
            const isSystem = msg.role === "system" || msg.role === "ora";
            const time = new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const plainText = decrypted[msg.id] ?? msg.text;
            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="text-[10px] px-3 py-1 rounded-full bg-primary/10 text-primary/80">{plainText}</div>
                </div>
              );
            }
            return (
              <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isMe ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {(msg.displayName?.[0] ?? "?").toUpperCase()}
                </div>
                <div className={`flex flex-col max-w-[60%] ${isMe ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    {!isMe && <span className="text-[10px] font-semibold" style={{ color: roleColor[msg.role] ?? "hsl(var(--muted-foreground))" }}>{msg.displayName}</span>}
                    <span className="text-[9px] text-muted-foreground">{time}</span>
                  </div>
                  <div className={`px-3 py-2 rounded-2xl text-sm break-words ${isMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                    {plainText}
                    {msg.txid && <div className="mt-0.5 text-[9px] font-mono opacity-60 truncate max-w-[200px]">txid: {msg.txid.slice(0, 14)}…</div>}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {error && <div className="px-6 py-1 text-xs text-destructive bg-destructive/10 shrink-0">{error}</div>}

        <div className="shrink-0 px-6 py-4 border-t border-border">
          {!actor ? (
            <div className="text-center py-3 text-sm text-muted-foreground bg-muted/30 rounded-xl">
              Connect a wallet to join the chat
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-muted/30 rounded-2xl px-4 py-2.5 border border-border">
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
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
                className="flex items-center justify-center w-8 h-8 rounded-xl transition-all disabled:opacity-40 bg-primary hover:bg-primary/90 disabled:bg-muted"
                style={{ color: input.trim() ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))" }}>
                <Send size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ActiveTab = "feed" | "search" | "create" | "chat" | "profile";

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
    { key: "feed",    label: "Feed",    Icon: Flame },
    { key: "search",  label: "Search",  Icon: Search },
    { key: "create",  label: "Create",  Icon: PlusSquare },
    { key: "chat",    label: "Chat",    Icon: MessagesSquare },
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
          {(profileAddress ?? address) && (
            <button onClick={() => profileAddress && openCreator(profileAddress)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
              <Avatar src={undefined} name={profileAddress ?? address!} size={20} />
              <span className="text-xs font-mono text-muted-foreground">{shortAddr(profileAddress ?? address ?? "")}</span>
            </button>
          )}
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full animate-pulse bg-primary" /><span className="text-[10px] text-muted-foreground">live</span></div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "feed"    && <FeedTab likedIds={likedIds} onLike={handleLike} onMint={p => setMintPost({ post: p, mode: "buy" })} onOpen={openPost} onCreator={openCreator} />}
        {activeTab === "search"  && <SearchTab onCreator={openCreator} onOpenPost={openPost} />}
        {activeTab === "create"  && <CreateTab onSuccess={() => setActiveTab("feed")} />}
        {activeTab === "chat"    && <NftChatPanel />}
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
