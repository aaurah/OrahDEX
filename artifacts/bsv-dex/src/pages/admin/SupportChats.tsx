import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Headphones, MessageCircle, RefreshCw, Send, User } from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { useSupportChatStore } from "@/store/useSupportChatStore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SupportChatSummary {
  id: string;
  displayName: string;
  wallet: string;
  status: string;
  lastMessageId: string;
  lastMessageRole: "customer" | "support";
  lastMessagePreview: string;
  lastMessageAt: string;
  unread: boolean;
  createdAt: string;
}

interface SupportChatMessage {
  id: string;
  senderRole: "customer" | "support";
  senderName: string;
  text: string;
  createdAt: string;
}

function messageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Date(value).toLocaleDateString();
}

export function AdminSupportChats() {
  const { toast } = useToast();
  const setUnreadCount = useSupportChatStore(state => state.setUnreadCount);
  const [chats, setChats] = useState<SupportChatSummary[]>([]);
  const [selected, setSelected] = useState<SupportChatSummary | null>(null);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadChats = useCallback(async () => {
    try {
      const response = await adminFetch("/api/admin/support/chats");
      if (!response.ok) throw new Error("Could not load support chats.");
      const data: SupportChatSummary[] = await response.json();
      setChats(data);
      setUnreadCount(data.filter(chat => chat.unread).length);
      setSelected(current => current ? data.find(chat => chat.id === current.id) ?? current : null);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Could not load support chats.");
    } finally {
      setLoadingChats(false);
    }
  }, [setUnreadCount]);

  useEffect(() => {
    void loadChats();
    const timer = window.setInterval(loadChats, 6_000);
    return () => window.clearInterval(timer);
  }, [loadChats]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    let active = true;
    let inFlight = false;
    let markedUnreadRead = false;
    const loadMessages = async () => {
      if (inFlight) return;
      inFlight = true;
      setLoadingMessages(true);
      try {
        const response = await adminFetch(`/api/admin/support/chats/${selected.id}/messages`);
        if (!response.ok) throw new Error("Could not load this chat.");
        const data = await response.json();
        if (!active) return;
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setChats(current => current.map(chat => chat.id === selected.id ? { ...chat, unread: false } : chat));
        if (selected.unread && !markedUnreadRead) {
          setUnreadCount(Math.max(0, useSupportChatStore.getState().unreadCount - 1));
          markedUnreadRead = true;
        }
        setError(null);
      } catch (err: any) {
        if (active) setError(err?.message ?? "Could not load this chat.");
      } finally {
        inFlight = false;
        if (active) setLoadingMessages(false);
      }
    };
    void loadMessages();
    const timer = window.setInterval(loadMessages, 4_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selected?.id, setUnreadCount]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleReply = async () => {
    if (!selected || !reply.trim() || sending) return;
    setSending(true);
    try {
      const response = await adminFetch(`/api/admin/support/chats/${selected.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply.trim() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not send reply.");
      }
      const data = await response.json();
      if (data.message) setMessages(current => [...current, data.message]);
      setReply("");
      toast({ title: "Reply sent", description: "The customer will see it in their support chat." });
      await loadChats();
    } catch (err: any) {
      toast({ title: "Reply failed", description: err?.message ?? "Could not send reply.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <MessageCircle className="h-5 w-5 text-primary" /> Live Support Chats
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Private customer conversations. New messages refresh automatically.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadChats()}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-white/5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loadingChats && "animate-spin")} /> Refresh
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">{error}</div>}

      <div className="grid min-h-[560px] flex-1 grid-cols-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className={cn(
          "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card",
          selected && "hidden lg:flex",
        )}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Conversations</h2>
              <p className="text-[11px] text-muted-foreground">{chats.length} total · {chats.filter(chat => chat.unread).length} unread</p>
            </div>
            <Headphones className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 divide-y divide-border overflow-y-auto">
            {loadingChats && chats.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading chats…
              </div>
            ) : chats.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-12 text-center text-muted-foreground">
                <MessageCircle className="h-8 w-8 opacity-25" />
                <p className="text-xs">No live chats yet.</p>
              </div>
            ) : chats.map(chat => (
              <button
                type="button"
                key={chat.id}
                onClick={() => { setSelected(chat); setMessages([]); }}
                className={cn(
                  "w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.03]",
                  selected?.id === chat.id && "bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-xs", chat.unread ? "font-bold text-foreground" : "font-medium text-foreground/80")}>
                    {chat.displayName || "Guest"}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(chat.lastMessageAt)}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{chat.lastMessagePreview}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[9px] text-muted-foreground/60">{chat.wallet === "anonymous" ? "Guest" : chat.wallet}</span>
                  {chat.unread && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">NEW</span>}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className={cn(
          "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card",
          !selected && "hidden lg:flex",
        )}>
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageCircle className="h-10 w-10 opacity-20" />
              <p className="text-sm">Select a conversation to reply.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground lg:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{selected.displayName || "Guest"}</h2>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">{selected.wallet}</p>
                </div>
                <span className="ml-auto rounded-full border border-green-500/20 bg-green-500/10 px-2 py-1 text-[9px] font-bold uppercase text-green-400">Private chat</span>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {loadingMessages && messages.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading messages…
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">No messages in this conversation yet.</p>
                ) : messages.map(message => {
                  const isSupport = message.senderRole === "support";
                  return (
                    <div key={message.id} className={cn("flex gap-2.5", isSupport && "flex-row-reverse")}>
                      <div className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        isSupport ? "bg-green-500/10 text-green-400" : "bg-primary/10 text-primary",
                      )}>
                        {isSupport ? <Headphones className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                      </div>
                      <div className={cn("max-w-[82%]", isSupport && "text-right")}>
                        <div className="mb-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          {isSupport && <span className="ml-auto" />}
                          <span className="font-medium">{message.senderName}</span>
                          <span>{messageTime(message.createdAt)}</span>
                        </div>
                        <p className={cn(
                          "whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed",
                          isSupport ? "rounded-tr-sm bg-green-500/10 text-foreground" : "rounded-tl-sm bg-secondary text-foreground",
                        )}>{message.text}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={event => setReply(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleReply();
                      }
                    }}
                    maxLength={2000}
                    rows={2}
                    placeholder="Write a private reply…"
                    className="max-h-32 min-h-10 flex-1 resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => void handleReply()}
                    disabled={!reply.trim() || sending}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Send reply"
                  >
                    {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
