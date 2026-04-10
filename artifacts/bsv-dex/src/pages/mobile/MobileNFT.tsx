import { useState, useEffect, useCallback } from "react";
import {
  Heart, MessageCircle, Share2, Zap, BadgeCheck, Search,
  TrendingUp, PlusSquare, User, ChevronLeft,
  X, Upload, Flame, Clock, Star, Lock, Layers,
  Copy, Send,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useLocation } from "wouter";

const API = "/api";

/* ─── types ────────────────────────────────────────────────────────────────── */
interface Post {
  id: string;
  creator: string;
  creator_name: string;
  creator_avatar: string;
  title: string;
  description: string;
  image_url: string;
  category: string;
  chain: string;
  mint_price: string;
  mint_currency: string;
  mint_price_usd: string;
  mint_count: number;
  max_supply: number | null;
  like_count: number;
  comment_count: number;
  is_verified: boolean;
  tags: string;
  inscription_id: string;
  created_at: string;
}

interface Comment {
  id: string;
  wallet_address: string;
  display_name: string;
  content: string;
  created_at: string;
}

/* ─── helpers ───────────────────────────────────────────────────────────────── */
function shortAddr(addr: string) {
  if (!addr) return "—";
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const CATEGORIES = ["all", "art", "generative", "relics", "utility", "governance", "bridge", "ai"];
const CAT_ICONS: Record<string, string> = {
  all: "🌐", art: "🎨", generative: "⚡", relics: "🏛️",
  utility: "🔧", governance: "🗳️", bridge: "🌉", ai: "🤖",
};

/* ─── supply bar ────────────────────────────────────────────────────────────── */
function SupplyBar({ minted, max }: { minted: number; max: number | null }) {
  if (!max) return null;
  const pct = Math.min((minted / max) * 100, 100);
  const remaining = max - minted;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] mb-0.5" style={{ color: "var(--color-text-secondary)" }}>
        <span>{fmtNum(minted)} minted</span>
        <span>{remaining > 0 ? `${remaining} left` : "SOLD OUT"}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: pct >= 95 ? "#ff4444" : pct >= 70 ? "#ffaa00" : "var(--color-accent)",
          }}
        />
      </div>
    </div>
  );
}

/* ─── avatar ────────────────────────────────────────────────────────────────── */
function Avatar({ src, name, size = 36 }: { src: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  return err ? (
    <div
      className="rounded-full flex items-center justify-center font-bold text-sm shrink-0"
      style={{ width: size, height: size, background: "linear-gradient(135deg,#00ff88,#00aaff)", color: "#000" }}
    >
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  ) : (
    <img
      src={src} alt={name}
      onError={() => setErr(true)}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

/* ─── POST CARD ─────────────────────────────────────────────────────────────── */
function PostCard({
  post, likedIds, onLike, onMint, onOpen,
}: {
  post: Post;
  likedIds: Set<string>;
  onLike: (id: string) => void;
  onMint: (post: Post) => void;
  onOpen: (post: Post) => void;
}) {
  const liked = likedIds.has(post.id);
  const [imgErr, setImgErr] = useState(false);
  const soldOut = post.max_supply !== null && post.mint_count >= post.max_supply;

  return (
    <div className="rounded-2xl overflow-hidden mb-4 mx-3" style={{ background: "var(--color-surface)" }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <Avatar src={post.creator_avatar} name={post.creator_name} size={38} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-sm truncate" style={{ color: "var(--color-text)" }}>
              {post.creator_name}
            </span>
            {post.is_verified && <BadgeCheck size={13} style={{ color: "var(--color-accent)" }} />}
          </div>
          <div className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>
            {shortAddr(post.creator)} · {timeAgo(post.created_at)}
          </div>
        </div>
        <div
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(0,255,136,0.12)", color: "var(--color-accent)" }}
        >
          BSV
        </div>
      </div>

      {/* Image */}
      <div
        className="relative cursor-pointer"
        style={{ aspectRatio: "1/1", background: "rgba(0,0,0,0.4)" }}
        onClick={() => onOpen(post)}
      >
        {!imgErr ? (
          <img src={post.image_url} alt={post.title} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">🖼️</div>
        )}
        <div
          className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}
        >
          #{post.inscription_id?.slice(0, 8)}…
        </div>
        <div
          className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm"
          style={{ background: "rgba(0,0,0,0.6)", color: "var(--color-accent)" }}
        >
          {CAT_ICONS[post.category]} {post.category}
        </div>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-1 px-3 pt-2.5">
        <button
          onClick={() => onLike(post.id)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all active:scale-90"
          style={{
            background: liked ? "rgba(255,60,60,0.15)" : "rgba(255,255,255,0.05)",
            color: liked ? "#ff4444" : "var(--color-text-secondary)",
          }}
        >
          <Heart size={15} fill={liked ? "#ff4444" : "none"} stroke={liked ? "#ff4444" : "currentColor"} />
          <span className="text-xs font-medium">{fmtNum(post.like_count + (liked ? 1 : 0))}</span>
        </button>
        <button
          onClick={() => onOpen(post)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all active:scale-90"
          style={{ background: "rgba(255,255,255,0.05)", color: "var(--color-text-secondary)" }}
        >
          <MessageCircle size={15} />
          <span className="text-xs font-medium">{fmtNum(post.comment_count)}</span>
        </button>
        <button
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all active:scale-90"
          style={{ background: "rgba(255,255,255,0.05)", color: "var(--color-text-secondary)" }}
          onClick={() => navigator.share?.({ title: post.title, text: post.description }).catch(() => {})}
        >
          <Share2 size={15} />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => !soldOut && onMint(post)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all active:scale-95"
          style={{
            background: soldOut
              ? "rgba(255,255,255,0.08)"
              : "linear-gradient(135deg,var(--color-accent),#00aaff)",
            color: soldOut ? "var(--color-text-secondary)" : "#000",
            opacity: soldOut ? 0.5 : 1,
          }}
        >
          <Zap size={12} />
          {soldOut ? "Sold Out" : `Collect · ${parseFloat(post.mint_price).toFixed(4)} ${post.mint_currency}`}
        </button>
      </div>

      {/* Supply bar */}
      <div className="px-3 pb-1">
        <SupplyBar minted={post.mint_count} max={post.max_supply} />
      </div>

      {/* Title & description */}
      <div className="px-3 pb-3 mt-1">
        <p className="text-sm font-bold leading-tight" style={{ color: "var(--color-text)" }}>{post.title}</p>
        {post.description && (
          <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>{post.description}</p>
        )}
        {post.tags && (() => {
          try {
            const tags: string[] = JSON.parse(post.tags);
            return (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {tags.slice(0, 4).map(t => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,255,136,0.08)", color: "var(--color-accent)" }}>
                    #{t}
                  </span>
                ))}
              </div>
            );
          } catch { return null; }
        })()}
      </div>
    </div>
  );
}

/* ─── POST DETAIL SHEET ─────────────────────────────────────────────────────── */
function PostDetailSheet({
  post, onClose, onMint, onLike, liked,
}: {
  post: Post;
  onClose: () => void;
  onMint: (post: Post) => void;
  onLike: (id: string) => void;
  liked: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [imgErr, setImgErr] = useState(false);
  const { address } = useWalletStore();
  const soldOut = post.max_supply !== null && post.mint_count >= post.max_supply;

  useEffect(() => {
    fetch(`${API}/social/posts/${post.id}`)
      .then(r => r.json())
      .then(d => setComments(d.comments ?? []))
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }, [post.id]);

  async function submitComment() {
    if (!commentText.trim() || !address) return;
    const txt = commentText;
    setCommentText("");
    await fetch(`${API}/social/posts/${post.id}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: address, content: txt, display_name: shortAddr(address) }),
    }).catch(() => {});
    const d = await fetch(`${API}/social/posts/${post.id}`).then(r => r.json()).catch(() => ({}));
    setComments(d.comments ?? []);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* Nav */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
        <button onClick={onClose} className="active:opacity-60">
          <ChevronLeft size={22} style={{ color: "var(--color-text)" }} />
        </button>
        <Avatar src={post.creator_avatar} name={post.creator_name} size={30} />
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>{post.creator_name}</span>
            {post.is_verified && <BadgeCheck size={12} style={{ color: "var(--color-accent)" }} />}
          </div>
        </div>
        <div className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(0,255,136,0.12)", color: "var(--color-accent)" }}>BSV</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Image */}
        <div className="relative" style={{ aspectRatio: "1/1", background: "#000" }}>
          {!imgErr ? (
            <img src={post.image_url} alt={post.title} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl">🖼️</div>
          )}
        </div>

        <div className="p-4">
          <h2 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>{post.title}</h2>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>{post.description}</p>

          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { label: "Minted", value: fmtNum(post.mint_count) },
              { label: "Likes",  value: fmtNum(post.like_count + (liked ? 1 : 0)) },
              { label: "Supply", value: post.max_supply ? fmtNum(post.max_supply) : "∞" },
            ].map(({ label, value }) => (
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
              <div className="text-[10px] font-medium" style={{ color: "var(--color-text-secondary)" }}>BSV Inscription ID</div>
              <div className="text-xs font-mono truncate" style={{ color: "var(--color-text)" }}>{post.inscription_id}</div>
            </div>
            <button onClick={() => navigator.clipboard.writeText(post.inscription_id).catch(() => {})} className="shrink-0 active:opacity-60">
              <Copy size={14} style={{ color: "var(--color-text-secondary)" }} />
            </button>
          </div>

          {post.tags && (() => {
            try {
              const tags: string[] = JSON.parse(post.tags);
              return (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {tags.map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,255,136,0.1)", color: "var(--color-accent)" }}>
                      #{t}
                    </span>
                  ))}
                </div>
              );
            } catch { return null; }
          })()}
        </div>

        {/* Comments */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Comments</span>
            <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{post.comment_count}</span>
          </div>
          {loadingComments ? (
            <div className="text-center py-6 text-xs" style={{ color: "var(--color-text-secondary)" }}>Loading…</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-6 text-xs" style={{ color: "var(--color-text-secondary)" }}>Be the first to comment</div>
          ) : (
            comments.map(c => (
              <div key={c.id} className="flex gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>
                  {c.display_name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>{c.display_name}</span>
                    <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{c.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="h-24" />
      </div>

      {/* Bottom bar */}
      <div className="border-t p-3 shrink-0" style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}>
        <button
          onClick={() => !soldOut && onMint(post)}
          disabled={soldOut}
          className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 mb-2 active:opacity-80"
          style={{
            background: soldOut ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,var(--color-accent),#00aaff)",
            color: soldOut ? "var(--color-text-secondary)" : "#000",
            opacity: soldOut ? 0.4 : 1,
          }}
        >
          <Zap size={16} />
          {soldOut ? "Sold Out" : `Collect for ${parseFloat(post.mint_price).toFixed(4)} ${post.mint_currency}`}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onLike(post.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl flex-1 justify-center transition-all active:scale-90"
            style={{
              background: liked ? "rgba(255,60,60,0.15)" : "rgba(255,255,255,0.05)",
              color: liked ? "#ff4444" : "var(--color-text-secondary)",
            }}
          >
            <Heart size={15} fill={liked ? "#ff4444" : "none"} stroke={liked ? "#ff4444" : "currentColor"} />
            <span className="text-xs font-medium">Like</span>
          </button>
          <div className="flex flex-1 items-center gap-1.5 rounded-xl overflow-hidden" style={{ background: "var(--color-surface)" }}>
            <input
              className="flex-1 bg-transparent text-xs px-3 py-2 outline-none"
              style={{ color: "var(--color-text)" }}
              placeholder={address ? "Add a comment…" : "Connect wallet to comment"}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submitComment()}
              disabled={!address}
            />
            {commentText.trim() && (
              <button onClick={submitComment} className="pr-2 active:opacity-60">
                <Send size={14} style={{ color: "var(--color-accent)" }} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── MINT SHEET ────────────────────────────────────────────────────────────── */
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
      const res = await fetch(`${API}/social/posts/${post.id}/mint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minter: address }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Mint failed");
      setMinted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div
        className="w-full rounded-t-3xl p-5"
        style={{ background: "var(--color-bg)", maxHeight: "85vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {minted ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🎉</div>
            <h3 className="text-xl font-bold mb-1" style={{ color: "var(--color-text)" }}>Collected!</h3>
            <p className="text-sm mb-3" style={{ color: "var(--color-text-secondary)" }}>
              {post.title} is now permanently inscribed on BSV.
            </p>
            <div className="text-xs font-mono px-3 py-1.5 rounded-xl inline-block mb-4" style={{ background: "var(--color-surface)", color: "var(--color-accent)" }}>
              {post.inscription_id.slice(0, 24)}…
            </div>
            <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-sm" style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-14 h-14 rounded-xl overflow-hidden" style={{ background: "var(--color-surface)" }}>
                <img src={post.image_url} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base" style={{ color: "var(--color-text)" }}>{post.title}</h3>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>by {post.creator_name}</span>
                  {post.is_verified && <BadgeCheck size={11} style={{ color: "var(--color-accent)" }} />}
                </div>
              </div>
              <button onClick={onClose} className="active:opacity-60"><X size={20} style={{ color: "var(--color-text-secondary)" }} /></button>
            </div>

            {[
              ["Chain", "BSV (on-chain inscription)"],
              ["Price", `${parseFloat(post.mint_price).toFixed(4)} ${post.mint_currency} ≈ $${post.mint_price_usd}`],
              ["Minted", `${fmtNum(post.mint_count)}${post.max_supply ? ` / ${fmtNum(post.max_supply)}` : " (open edition)"}`],
              ["Inscription", `${post.inscription_id.slice(0, 20)}…`],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{label}</span>
                <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{val}</span>
              </div>
            ))}

            <div className="mt-3"><SupplyBar minted={post.mint_count} max={post.max_supply} /></div>

            {!address && (
              <div className="mt-4 p-3 rounded-xl flex items-center gap-2" style={{ background: "rgba(255,170,0,0.12)" }}>
                <Lock size={14} style={{ color: "#ffaa00" }} />
                <span className="text-xs" style={{ color: "#ffaa00" }}>Connect your wallet to collect</span>
              </div>
            )}
            {error && (
              <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}>{error}</div>
            )}

            <button
              onClick={doMint}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm mt-5 flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,var(--color-accent),#00aaff)", color: "#000" }}
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                : <><Zap size={16} />{address ? `Collect for ${parseFloat(post.mint_price).toFixed(4)} ${post.mint_currency}` : "Connect Wallet"}</>
              }
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── CREATE TAB ─────────────────────────────────────────────────────────────── */
function CreateTab({ onSuccess }: { onSuccess: () => void }) {
  const { address } = useWalletStore();
  const [form, setForm] = useState({ title: "", description: "", imageUrl: "", mintPrice: "0.01", mintCurrency: "BSV", category: "art", maxSupply: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!address) { setError("Connect your wallet first"); return; }
    if (!form.title || !form.imageUrl) { setError("Title and image URL are required"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/social/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator: address,
          creator_name: shortAddr(address),
          title: form.title,
          description: form.description,
          image_url: form.imageUrl,
          mint_price: parseFloat(form.mintPrice) || 0.01,
          mint_currency: form.mintCurrency,
          category: form.category,
          max_supply: form.maxSupply ? parseInt(form.maxSupply, 10) : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onSuccess(); }, 2500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inp: React.CSSProperties = {
    background: "var(--color-surface)", color: "var(--color-text)",
    border: "1px solid var(--color-border)", borderRadius: 12,
    padding: "10px 12px", fontSize: 14, width: "100%", outline: "none",
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <div className="text-6xl mb-4">✨</div>
        <h3 className="text-xl font-bold mb-2" style={{ color: "var(--color-text)" }}>Inscribed on BSV!</h3>
        <p className="text-sm text-center px-6" style={{ color: "var(--color-text-secondary)" }}>
          Your post is permanently on the BSV blockchain. Forever.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-32 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-1" style={{ color: "var(--color-text)" }}>Create Post</h2>
      <p className="text-xs mb-4" style={{ color: "var(--color-text-secondary)" }}>
        Every post is inscribed on BSV and becomes a mintable NFT + coin.
      </p>

      {form.imageUrl && (
        <div className="rounded-2xl overflow-hidden mb-4" style={{ aspectRatio: "1/1" }}>
          <img src={form.imageUrl} alt="" className="w-full h-full object-cover" onError={() => setForm(f => ({ ...f, imageUrl: "" }))} />
        </div>
      )}
      {!form.imageUrl && (
        <div className="rounded-2xl flex flex-col items-center justify-center gap-2 mb-4" style={{ aspectRatio: "1/1", background: "var(--color-surface)", border: "2px dashed var(--color-border)" }}>
          <Upload size={32} style={{ color: "var(--color-text-secondary)" }} />
          <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Paste image URL below</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Image URL *</label>
          <input style={inp} placeholder="https://…" value={form.imageUrl} onChange={set("imageUrl")} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Title *</label>
          <input style={inp} placeholder="Name your creation" value={form.title} onChange={set("title")} maxLength={100} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Description</label>
          <textarea style={{ ...inp, resize: "none" } as React.CSSProperties} rows={3} placeholder="What is this about?" value={form.description} onChange={set("description")} maxLength={500} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Mint Price</label>
            <input style={inp} type="number" min="0" step="0.001" value={form.mintPrice} onChange={set("mintPrice")} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Currency</label>
            <select style={inp} value={form.mintCurrency} onChange={set("mintCurrency")}>
              <option>BSV</option><option>ETH</option><option>USDT</option>
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

        <div className="rounded-xl p-3 flex gap-2" style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)" }}>
          <Layers size={14} style={{ color: "var(--color-accent)", marginTop: 2, flexShrink: 0 }} />
          <div>
            <div className="text-xs font-bold mb-0.5" style={{ color: "var(--color-accent)" }}>Permanent BSV Inscription</div>
            <div className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              Your post is inscribed on BSV via OP_RETURN. No server. No IPFS. Just the chain.
            </div>
          </div>
        </div>

        {error && <div className="p-3 rounded-xl text-xs" style={{ background: "rgba(255,60,60,0.12)", color: "#ff4444" }}>{error}</div>}

        <button
          onClick={submit}
          disabled={loading || !form.title || !form.imageUrl}
          className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,var(--color-accent),#00aaff)", color: "#000" }}
        >
          {loading
            ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
            : <><Zap size={15} /> Inscribe on BSV</>
          }
        </button>
      </div>
    </div>
  );
}

/* ─── EXPLORE TAB ────────────────────────────────────────────────────────────── */
function ExploreTab({
  onMint, onOpen,
}: {
  onMint: (p: Post) => void;
  onOpen: (p: Post) => void;
}) {
  const [data, setData] = useState<{ topPosts: Post[]; hotMints: Post[] }>({ topPosts: [], hotMints: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/social/trending`)
      .then(r => r.json())
      .then(d => setData({ topPosts: d.topPosts ?? [], hotMints: d.hotMints ?? [] }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function GridCard({ post }: { post: Post }) {
    const [imgErr, setImgErr] = useState(false);
    return (
      <button className="relative rounded-xl overflow-hidden active:opacity-80" style={{ aspectRatio: "1/1" }} onClick={() => onOpen(post)}>
        {!imgErr
          ? <img src={post.image_url} alt="" className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ background: "var(--color-surface)" }}>🖼️</div>
        }
        <div className="absolute inset-x-0 bottom-0 p-1.5" style={{ background: "linear-gradient(transparent,rgba(0,0,0,0.85))" }}>
          <p className="text-[10px] font-bold truncate text-white">{post.title}</p>
          <p className="text-[9px] text-white/60">{parseFloat(post.mint_price).toFixed(3)} {post.mint_currency}</p>
        </div>
        {post.is_verified && (
          <div className="absolute top-1.5 right-1.5"><BadgeCheck size={11} style={{ color: "var(--color-accent)" }} /></div>
        )}
      </button>
    );
  }

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-accent)" }} />
    </div>
  );

  return (
    <div className="pb-32 overflow-y-auto h-full">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--color-surface)" }}>
          <Search size={14} style={{ color: "var(--color-text-secondary)" }} />
          <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Search inscriptions…</span>
        </div>
      </div>
      {[
        { label: "🔥 Most Liked",  posts: data.topPosts },
        { label: "⚡ Hot Mints",   posts: data.hotMints },
      ].map(({ label, posts }) => (
        <div key={label} className="mb-5 px-4">
          <h3 className="text-sm font-bold mb-2.5" style={{ color: "var(--color-text)" }}>{label}</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {posts.map(p => <GridCard key={p.id} post={p} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── PROFILE TAB ────────────────────────────────────────────────────────────── */
function ProfileTab({ onOpen }: { onOpen: (p: Post) => void }) {
  const { address } = useWalletStore();
  const [, navigate] = useLocation();
  const [data, setData] = useState<{ posts: Post[]; mints: any[]; stats: any } | null>(null);
  const [tab, setTab] = useState<"created" | "collected">("created");

  useEffect(() => {
    if (!address) return;
    fetch(`${API}/social/profile/${address}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [address]);

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 px-8">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}>
          <User size={28} style={{ color: "var(--color-text-secondary)" }} />
        </div>
        <p className="text-sm text-center" style={{ color: "var(--color-text-secondary)" }}>Connect your wallet to see your profile</p>
        <button
          onClick={() => navigate("/settings")}
          className="px-6 py-2.5 rounded-xl font-bold text-sm"
          style={{ background: "var(--color-accent)", color: "#000" }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="pb-32 overflow-y-auto h-full">
      <div className="h-20 w-full" style={{ background: "linear-gradient(135deg,#001a0f,#002244)" }} />
      <div className="px-4 -mt-8 pb-4">
        <div className="flex items-end justify-between mb-3">
          <div className="w-16 h-16 rounded-2xl border-4 flex items-center justify-center font-bold text-xl" style={{ background: "var(--color-surface)", borderColor: "var(--color-bg)", color: "var(--color-text)" }}>
            {address[2]?.toUpperCase()}
          </div>
          <button className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>
            Edit
          </button>
        </div>
        <div className="font-bold text-base" style={{ color: "var(--color-text)" }}>{shortAddr(address)}</div>
        <div className="text-xs font-mono mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{address.slice(0, 20)}…</div>

        {stats && (
          <div className="grid grid-cols-4 gap-1.5 mt-3">
            {[
              { label: "Posts", value: stats.postCount },
              { label: "Collected", value: stats.collectCount },
              { label: "Likes", value: fmtNum(stats.totalLikes) },
              { label: "Mints", value: fmtNum(stats.totalMints) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl p-2 text-center" style={{ background: "var(--color-surface)" }}>
                <div className="text-sm font-bold" style={{ color: "var(--color-text)" }}>{value}</div>
                <div className="text-[9px]" style={{ color: "var(--color-text-secondary)" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1 mt-4 p-1 rounded-xl" style={{ background: "var(--color-surface)" }}>
          {(["created", "collected"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all"
              style={{
                background: tab === t ? "var(--color-accent)" : "transparent",
                color: tab === t ? "#000" : "var(--color-text-secondary)",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-3">
          {(tab === "created" ? (data?.posts ?? []) : (data?.mints ?? [])).map((item: any) => (
            <button
              key={item.id}
              className="rounded-xl overflow-hidden active:opacity-80"
              style={{ aspectRatio: "1/1", background: "var(--color-surface)" }}
              onClick={() => tab === "created" && onOpen(item)}
            >
              <img src={item.image_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </button>
          ))}
        </div>
        {((tab === "created" && !data?.posts?.length) || (tab === "collected" && !data?.mints?.length)) && (
          <div className="text-center py-12 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {tab === "created" ? "Nothing created yet — start by posting!" : "No collectibles yet — browse the feed!"}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── FEED TAB ───────────────────────────────────────────────────────────────── */
function FeedTab({
  likedIds, onLike, onMint, onOpen,
}: {
  likedIds: Set<string>;
  onLike: (id: string) => void;
  onMint: (p: Post) => void;
  onOpen: (p: Post) => void;
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
    fetch(`${API}/social/feed?${params}`)
      .then(r => r.json())
      .then(d => setPosts(d.posts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sort, category, search]);

  useEffect(() => { load(); }, [load]);

  const SORTS = [
    { key: "hot" as const, icon: Flame,  label: "Hot" },
    { key: "new" as const, icon: Clock,  label: "New" },
    { key: "top" as const, icon: Star,   label: "Top" },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-3 pt-2 pb-1 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2" style={{ background: "var(--color-surface)" }}>
          <Search size={14} style={{ color: "var(--color-text-secondary)" }} />
          <input
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--color-text)" }}
            placeholder="Search posts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 mb-2">
          {SORTS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
              style={{
                background: sort === key ? "var(--color-accent)" : "var(--color-surface)",
                color: sort === key ? "#000" : "var(--color-text-secondary)",
              }}
            >
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all"
              style={{
                background: category === c ? "rgba(0,255,136,0.15)" : "var(--color-surface)",
                color: category === c ? "var(--color-accent)" : "var(--color-text-secondary)",
                border: category === c ? "1px solid rgba(0,255,136,0.3)" : "1px solid transparent",
              }}
            >
              {CAT_ICONS[c]} {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-2">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-accent)" }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: "var(--color-text-secondary)" }}>No posts found</div>
        ) : (
          <>
            {posts.map(p => <PostCard key={p.id} post={p} likedIds={likedIds} onLike={onLike} onMint={onMint} onOpen={onOpen} />)}
            <div className="h-32" />
          </>
        )}
      </div>
    </div>
  );
}

/* ─── ROOT ───────────────────────────────────────────────────────────────────── */
export function MobileNFT() {
  const [activeTab, setActiveTab] = useState<"feed" | "explore" | "create" | "profile">("feed");
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [mintPost, setMintPost] = useState<Post | null>(null);
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const { address } = useWalletStore();

  function handleLike(id: string) {
    setLikedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (address) {
      fetch(`${API}/social/posts/${id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: address }),
      }).catch(() => {});
    }
  }

  const INNER_TABS = [
    { key: "feed"    as const, label: "Feed",    Icon: Layers },
    { key: "explore" as const, label: "Explore", Icon: TrendingUp },
    { key: "create"  as const, label: "Create",  Icon: PlusSquare },
    { key: "profile" as const, label: "Profile", Icon: User },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div>
          <h1 className="text-lg font-black tracking-tight" style={{ color: "var(--color-text)" }}>
            Orah<span style={{ color: "var(--color-accent)" }}>NFT</span>
          </h1>
          <div className="text-[10px] font-mono" style={{ color: "var(--color-text-secondary)" }}>
            Decentralised · BSV inscriptions
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--color-accent)" }} />
          <span className="text-[10px]" style={{ color: "var(--color-text-secondary)" }}>mainnet</span>
        </div>
      </div>

      {/* Inner nav */}
      <div className="flex shrink-0 px-3 pt-2 pb-1 gap-1" style={{ borderBottom: "1px solid var(--color-border)" }}>
        {INNER_TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-all"
            style={{
              background: activeTab === key ? "rgba(0,255,136,0.1)" : "transparent",
              color: activeTab === key ? "var(--color-accent)" : "var(--color-text-secondary)",
            }}
          >
            <Icon size={18} />
            <span className="text-[9px] font-semibold">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "feed"    && <FeedTab    likedIds={likedIds} onLike={handleLike} onMint={setMintPost} onOpen={setDetailPost} />}
        {activeTab === "explore" && <ExploreTab onMint={setMintPost} onOpen={setDetailPost} />}
        {activeTab === "create"  && <CreateTab  onSuccess={() => setActiveTab("feed")} />}
        {activeTab === "profile" && <ProfileTab onOpen={setDetailPost} />}
      </div>

      {/* Overlays */}
      {detailPost && (
        <PostDetailSheet
          post={detailPost}
          onClose={() => setDetailPost(null)}
          onMint={p => { setDetailPost(null); setMintPost(p); }}
          onLike={handleLike}
          liked={likedIds.has(detailPost.id)}
        />
      )}
      {mintPost && <MintSheet post={mintPost} onClose={() => setMintPost(null)} />}
    </div>
  );
}
