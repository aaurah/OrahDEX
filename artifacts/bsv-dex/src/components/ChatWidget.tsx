import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Send, MessageCircle, Globe, Headphones, Radio, Bot,
  ChevronLeft, Zap, Shield, Users, Info, ExternalLink, Loader2,
  Hash, AlertTriangle, UserCircle2, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types ──────────────────────────────────────────────────────────────── */
type ChannelKind = "global" | "pair" | "support" | "system" | "ora";

interface ChatMessage {
  id: string;
  channel: string;
  wallet: string;
  displayName: string;
  role: "trader" | "leader" | "follower" | "support" | "system" | "ora";
  text: string;
  ts: number;
  txid?: string;
  replyTo?: string;
}

interface ChannelDef {
  id: ChannelKind;
  channelKey: string;
  label: string;
  icon: typeof Globe;
  color: string;
  readOnly?: boolean;
  description: string;
}

/* ── Txid pattern ────────────────────────────────────────────────────────── */
const TXID_RE = /\b([0-9a-fA-F]{64})\b/g;

function linkifyText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  TXID_RE.lastIndex = 0;
  while ((match = TXID_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const txid = match[1]!;
    parts.push(
      <a
        key={txid}
        href={`https://whatsonchain.com/tx/${txid}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 font-mono text-xs"
        onClick={e => e.stopPropagation()}
      >
        <Zap className="w-3 h-3" />
        {txid.slice(0, 8)}…{txid.slice(-6)}
        <ExternalLink className="w-2.5 h-2.5" />
      </a>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/* ── ORA AI streaming inside chat ───────────────────────────────────────── */
async function streamOraReply(
  text: string,
  convId: number | null,
  setConvId: (id: number) => void,
  onChunk: (chunk: string) => void,
  onDone: () => void,
) {
  try {
    let cid = convId;
    if (!cid) {
      const r = await fetch(`${BASE}/api/ai/conversations`, { method: "POST" });
      const data = await r.json();
      cid = data.id;
      setConvId(cid!);
    }
    const r = await fetch(`${BASE}/api/ai/conversations/${cid}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    const reader = r.body?.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.content) onChunk(ev.content);
          if (ev.done) break;
        } catch { /* */ }
      }
    }
  } catch { /* */ }
  onDone();
}

/* ── Relative time ────────────────────────────────────────────────────────── */
function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  return new Date(ts).toLocaleDateString();
}

/* ── Role badge ─────────────────────────────────────────────────────────── */
function RoleBadge({ role }: { role: ChatMessage["role"] }) {
  if (role === "system") return <span className="text-[9px] font-bold px-1 rounded bg-primary/20 text-primary uppercase">System</span>;
  if (role === "support") return <span className="text-[9px] font-bold px-1 rounded bg-blue-500/20 text-blue-400 uppercase">Support</span>;
  if (role === "ora") return <span className="text-[9px] font-bold px-1 rounded bg-emerald-500/20 text-emerald-400 uppercase">Ora AI</span>;
  if (role === "leader") return <span className="text-[9px] font-bold px-1 rounded bg-amber-500/20 text-amber-400 uppercase">Leader</span>;
  return null;
}

/* ── Single message bubble ─────────────────────────────────────────────── */
function MessageBubble({ msg, isMine }: { msg: ChatMessage; isMine: boolean }) {
  const isSystem = msg.role === "system";
  const isOra = msg.role === "ora";

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-xl px-3 py-1.5 max-w-[90%]">
          <Radio className="w-3 h-3 text-primary shrink-0" />
          <span className="text-[11px] text-primary/90 leading-relaxed">{msg.text}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2 mb-3", isMine && "flex-row-reverse")}>
      {/* Avatar */}
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold",
        isOra ? "bg-emerald-500/20 text-emerald-400" :
        isMine ? "bg-primary/20 text-primary" :
        "bg-secondary text-muted-foreground"
      )}>
        {isOra ? <Bot className="w-3.5 h-3.5" /> : (msg.displayName[0] ?? "?").toUpperCase()}
      </div>

      <div className={cn("flex flex-col max-w-[75%]", isMine && "items-end")}>
        {/* Name + time */}
        <div className={cn("flex items-center gap-1 mb-0.5", isMine && "flex-row-reverse")}>
          <span className="text-[10px] font-semibold text-foreground/70">{msg.displayName}</span>
          <RoleBadge role={msg.role} />
          <span className="text-[9px] text-muted-foreground/50">{relTime(msg.ts)}</span>
        </div>

        {/* Bubble */}
        <div className={cn(
          "px-3 py-2 rounded-2xl text-[12px] leading-relaxed break-words",
          isMine
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : isOra
              ? "bg-emerald-950/80 text-emerald-100 border border-emerald-500/20 rounded-tl-sm"
              : "bg-secondary text-foreground rounded-tl-sm"
        )}>
          {linkifyText(msg.text)}
        </div>

        {/* Txid badge */}
        {msg.txid && (
          <a
            href={`https://whatsonchain.com/tx/${msg.txid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
          >
            <Zap className="w-2.5 h-2.5" />
            BSV proof detected
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Context banner (pair / vault awareness) ────────────────────────────── */
function ContextBanner({ pair }: { pair: string | null }) {
  if (!pair) return null;
  return (
    <div className="px-3 py-1.5 bg-primary/5 border-b border-border/40 flex items-center gap-1.5">
      <Hash className="w-3 h-3 text-primary/60" />
      <span className="text-[10px] text-primary/70 font-medium">Discussing {pair}</span>
    </div>
  );
}

/* ── Main ChatWidget ─────────────────────────────────────────────────────── */
export function ChatWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { address } = useWalletStore();
  const [location] = useLocation();

  /* Detect current pair from URL */
  const detectedPair = (() => {
    const m = location.match(/\/(?:trade|futures)\/([A-Z0-9]+-[A-Z0-9]+)/);
    return m ? m[1]!.replace("-PERP", "") : null;
  })();

  /* ── Channel definitions ─────────────────────────────────────────────── */
  const channels: ChannelDef[] = [
    {
      id: "global",
      channelKey: "global",
      label: "Global",
      icon: Globe,
      color: "text-blue-400",
      description: "Exchange-wide chat",
    },
    ...(detectedPair ? [{
      id: "pair" as ChannelKind,
      channelKey: `pair:${detectedPair}`,
      label: detectedPair,
      icon: Hash,
      color: "text-violet-400",
      description: `Chat for ${detectedPair}`,
    }] : []),
    {
      id: "support",
      channelKey: "support",
      label: "Support",
      icon: Headphones,
      color: "text-amber-400",
      description: "AI support & human escalation",
    },
    {
      id: "system",
      channelKey: "system",
      label: "System",
      icon: Radio,
      color: "text-primary",
      readOnly: true,
      description: "Protocol announcements",
    },
    {
      id: "ora",
      channelKey: "ora",
      label: "Ora AI",
      icon: Bot,
      color: "text-emerald-400",
      description: "Dedicated AI trading assistant",
    },
  ];

  /* ── State ─────────────────────────────────────────────────────────────── */
  const [activeChannelIdx, setActiveChannelIdx] = useState(0);
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [oraStreaming, setOraStreaming] = useState(false);
  const [oraConvId, setOraConvId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pseudonym, setPseudonym] = useState(() => localStorage.getItem("chat_pseudonym") || "");
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const evtSourceRef = useRef<EventSource | null>(null);

  const activeChannel = channels[activeChannelIdx]!;
  const msgs = messagesByChannel[activeChannel.channelKey] ?? [];

  /* Derived display name */
  const displayName = pseudonym || (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "anon");

  /* ── SSE subscription ─────────────────────────────────────────────────── */
  const subscribeToChannel = useCallback((channelKey: string) => {
    evtSourceRef.current?.close();
    const es = new EventSource(`${BASE}/api/chat/channels/${encodeURIComponent(channelKey)}/stream`);
    evtSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "backfill") {
          setMessagesByChannel(prev => ({ ...prev, [channelKey]: data.messages ?? [] }));
        } else {
          /* Single new message */
          setMessagesByChannel(prev => {
            const existing = prev[channelKey] ?? [];
            if (existing.find((m: ChatMessage) => m.id === data.id)) return prev;
            return { ...prev, [channelKey]: [...existing, data] };
          });
          setUnreadByChannel(prev => ({ ...prev, [channelKey]: (prev[channelKey] ?? 0) + 1 }));
        }
      } catch { /* */ }
    };

    es.onerror = () => {
      es.close();
    };
  }, []);

  /* Subscribe when channel changes */
  useEffect(() => {
    if (!open) return;
    subscribeToChannel(activeChannel.channelKey);
    setUnreadByChannel(prev => ({ ...prev, [activeChannel.channelKey]: 0 }));
    return () => { evtSourceRef.current?.close(); };
  }, [open, activeChannel.channelKey, subscribeToChannel]);

  /* Auto-scroll */
  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [msgs.length]);

  /* Focus input on open */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  /* ── Send message ────────────────────────────────────────────────────── */
  async function handleSend() {
    const text = input.trim();
    if (!text || sending || oraStreaming) return;
    setInput("");
    setError(null);

    /* Ora AI channel — stream from AI endpoint */
    if (activeChannel.id === "ora") {
      const userMsg: ChatMessage = {
        id: `local-${Date.now()}`,
        channel: "ora",
        wallet: address || "anonymous",
        displayName,
        role: "trader",
        text,
        ts: Date.now(),
      };
      setMessagesByChannel(prev => ({
        ...prev,
        ora: [...(prev["ora"] ?? []), userMsg],
      }));

      const oraMsg: ChatMessage = {
        id: `ora-${Date.now()}`,
        channel: "ora",
        wallet: "ora",
        displayName: "Ora",
        role: "ora",
        text: "",
        ts: Date.now(),
      };
      setMessagesByChannel(prev => ({ ...prev, ora: [...(prev["ora"] ?? []), oraMsg] }));
      setOraStreaming(true);

      await streamOraReply(
        text,
        oraConvId,
        (id) => setOraConvId(id),
        (chunk) => {
          setMessagesByChannel(prev => {
            const list = [...(prev["ora"] ?? [])];
            const last = list[list.length - 1];
            if (last && last.role === "ora") {
              list[list.length - 1] = { ...last, text: last.text + chunk };
            }
            return { ...prev, ora: list };
          });
        },
        () => setOraStreaming(false),
      );
      return;
    }

    /* Regular channel */
    setSending(true);
    try {
      const res = await fetch(`${BASE}/api/chat/channels/${encodeURIComponent(activeChannel.channelKey)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          wallet: address || "anonymous",
          displayName,
          role: "trader",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Failed to send message.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function savePseudonym() {
    const name = nameInput.trim().slice(0, 24);
    setPseudonym(name);
    localStorage.setItem("chat_pseudonym", name);
    setShowNameEdit(false);
    setNameInput("");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 border-b border-border bg-card/95 backdrop-blur"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top, 12px))" }}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground active:bg-secondary"
            >
              <ChevronLeft size={18} />
            </button>
            <div className={cn("w-7 h-7 rounded-xl flex items-center justify-center", `bg-current/10`)}>
              <activeChannel.icon className={cn("w-4 h-4", activeChannel.color)} />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">{activeChannel.label}</p>
              <p className="text-[10px] text-muted-foreground">{activeChannel.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {activeChannel.readOnly && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase tracking-wide">Read-only</span>
            )}
            <button
              onClick={() => { setShowNameEdit(v => !v); setNameInput(pseudonym); }}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground active:bg-secondary"
              title="Set display name"
            >
              <UserCircle2 size={16} />
            </button>
          </div>
        </div>

        {/* Pseudonym editor */}
        {showNameEdit && (
          <div className="px-4 pb-3 flex items-center gap-2">
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              maxLength={24}
              placeholder="Your display name (optional)"
              className="flex-1 bg-secondary/60 rounded-xl px-3 py-1.5 text-xs outline-none border border-border focus:border-primary/50"
              onKeyDown={e => e.key === "Enter" && savePseudonym()}
            />
            <button
              onClick={savePseudonym}
              className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
            >Save</button>
          </div>
        )}

        {/* ── Channel tabs ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-0.5 px-3 pb-2 overflow-x-auto scrollbar-none">
          {channels.map((ch, idx) => {
            const unread = unreadByChannel[ch.channelKey] ?? 0;
            const isActive = idx === activeChannelIdx;
            return (
              <button
                key={ch.channelKey}
                onClick={() => setActiveChannelIdx(idx)}
                className={cn(
                  "relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all shrink-0",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-white/5 border border-transparent"
                )}
              >
                <ch.icon className={cn("w-3 h-3", isActive ? "text-primary" : ch.color)} />
                {ch.label}
                {unread > 0 && !isActive && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[8px] text-white font-bold flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pair context banner */}
      {activeChannel.id === "pair" && <ContextBanner pair={detectedPair} />}

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-16">
            <activeChannel.icon className={cn("w-10 h-10 opacity-20", activeChannel.color)} />
            <p className="text-sm font-medium opacity-60">
              {activeChannel.id === "system" ? "No announcements yet." : "No messages yet. Be the first!"}
            </p>
            {activeChannel.id === "ora" && (
              <div className="flex flex-wrap gap-2 justify-center mt-2 max-w-xs">
                {["What is BSV settlement?", "Explain HTLC swaps", "How do Keeper tiers work?", "What is a VAMM?"].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="text-[10px] px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {activeChannel.id === "support" && (
              <div className="flex flex-wrap gap-2 justify-center mt-2 max-w-xs">
                {["I'm stuck in a bridge", "My order failed", "How do I withdraw?", "What is a Keeper?"].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="text-[10px] px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {msgs.map(msg => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isMine={!!address && msg.wallet === address}
          />
        ))}

        {/* Ora streaming indicator */}
        {oraStreaming && activeChannel.id === "ora" && (
          <div className="flex gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-emerald-950/80 border border-emerald-500/20">
              <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Input area ────────────────────────────────────────────────────── */}
      {!activeChannel.readOnly && (
        <div
          className="shrink-0 px-3 pt-2 pb-safe bg-card/95 border-t border-border"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
        >
          {/* Identity indicator */}
          <div className="flex items-center gap-1.5 mb-2">
            <UserCircle2 className="w-3 h-3 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/60">
              Posting as <span className="text-foreground/70 font-medium">{displayName}</span>
              {!address && <span className="text-amber-400/70 ml-1">· Connect wallet to be identified</span>}
            </span>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                activeChannel.id === "ora"
                  ? "Ask Ora anything about trading, BSV, markets…"
                  : activeChannel.id === "support"
                    ? "Describe your issue…"
                    : `Message #${activeChannel.label}…`
              }
              rows={1}
              className="flex-1 resize-none bg-secondary/60 rounded-2xl px-4 py-2.5 text-sm outline-none border border-border focus:border-primary/50 transition-colors max-h-32 scrollbar-none"
              style={{ lineHeight: "1.4" }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending || oraStreaming}
              className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center transition-all shrink-0",
                input.trim() && !sending && !oraStreaming
                  ? "bg-primary text-primary-foreground hover:brightness-110 active:scale-95"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {sending || oraStreaming
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />
              }
            </button>
          </div>

          {/* Info row */}
          <div className="flex items-center gap-2 mt-1.5">
            <Shield className="w-2.5 h-2.5 text-muted-foreground/40" />
            <span className="text-[9px] text-muted-foreground/40">
              AI-moderated · No PII · Wallet-identity only · No accounts required
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
