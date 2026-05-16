import { useState, useRef, useEffect, useCallback } from "react";
import { useSEO } from "@/hooks/useSEO";
import { Bot, Send, Plus, Trash2, Sparkles, TrendingUp, Zap, ChevronRight, BarChart2, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getMarkets } from "@workspace/api-client-react";

const API = (import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "") + "/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
}

const STARTER_PROMPTS = [
  { icon: TrendingUp, label: "Top movers today", prompt: "What are the biggest movers on OrahDEX today? Show me the top gainers and losers." },
  { icon: BarChart2, label: "BSV market analysis", prompt: "Give me a quick analysis of BSV's current market position and recent price action." },
  { icon: Zap, label: "Best opportunities", prompt: "Based on current OrahDEX volume data, what pairs have the most interesting setups right now?" },
  { icon: Sparkles, label: "Keeper tiers explained", prompt: "Explain the Keeper Protocol tiers and which one makes sense for different trading volumes." },
];

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <h3 key={i} className="font-black text-foreground text-sm mt-3 mb-1">{line.slice(4)}</h3>;
        if (line.startsWith("## ")) return <h2 key={i} className="font-black text-foreground text-base mt-3 mb-1">{line.slice(3)}</h2>;
        if (line.startsWith("# ")) return <h1 key={i} className="font-black text-foreground text-lg mt-3 mb-1">{line.slice(2)}</h1>;
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-green-400 mt-0.5 shrink-0">·</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          const match = line.match(/^(\d+)\.\s(.*)$/);
          if (match) return (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-green-400 shrink-0 font-black text-xs mt-0.5">{match[1]}.</span>
              <span>{renderInline(match[2])}</span>
            </div>
          );
        }
        if (line === "") return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-black text-foreground">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="font-mono text-green-400 bg-green-500/10 px-1 rounded text-[11px]">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export function OraAIPage() {
  useSEO({
    title: "Ora AI — Trading Intelligence | OrahDEX",
    description: "Chat with Ora, OrahDEX's AI trading assistant. Get market analysis, trading strategy, DeFi insights, and real-time data across 900+ markets.",
    keywords: "crypto AI assistant, trading AI, Ora AI, OrahDEX AI, market analysis AI, DeFi AI, BSV trading intelligence",
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: markets } = useQuery({
    queryKey: ["markets"],
    queryFn: () => getMarkets(),
    staleTime: 30_000,
  });

  const topMovers = [...(markets ?? [])]
    .sort((a, b) => Math.abs(b.priceChangePercent24h ?? 0) - Math.abs(a.priceChangePercent24h ?? 0))
    .slice(0, 6);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await fetch(`${API}/anthropic/conversations`);
      if (res.ok) setConversations(await res.json());
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadConversation = useCallback(async (id: number) => {
    setActiveConvId(id);
    setMessages([]);
    try {
      const res = await fetch(`${API}/anthropic/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages.map((m: any) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        createdAt: new Date(m.createdAt),
      })));
    } catch { }
  }, []);

  const newConversation = useCallback(async (title = "New chat") => {
    const res = await fetch(`${API}/anthropic/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const conv = await res.json();
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(conv.id);
    setMessages([]);
    return conv.id as number;
  }, []);

  const deleteConversation = useCallback(async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${API}/anthropic/conversations/${id}`, { method: "DELETE" });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
  }, [activeConvId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    const msg = text.trim();
    setInput("");

    let convId = activeConvId;
    if (!convId) {
      const title = msg.slice(0, 60) + (msg.length > 60 ? "…" : "");
      convId = await newConversation(title);
      if (!convId) return;
    }

    const userMsg: Message = { id: Date.now() + "-u", role: "user", content: msg, createdAt: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    const assistantId = Date.now() + "-a";
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", createdAt: new Date() }]);

    abortRef.current = new AbortController();
    try {
      const res = await fetch(`${API}/anthropic/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msg }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
            if (data.content) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + data.content } : m
              ));
            }
          } catch { }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: "Something went wrong. Please try again." } : m
        ));
      }
    } finally {
      setStreaming(false);
    }
  }, [activeConvId, streaming, newConversation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* Sidebar */}
      <div className="hidden lg:flex flex-col w-64 xl:w-72 border-r border-border/50 bg-background/50">
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
              <Bot className="w-4 h-4 text-black" />
            </div>
            <div>
              <p className="font-black text-sm text-foreground">Ora AI</p>
              <p className="text-[9px] text-green-400 uppercase tracking-widest font-black">Live Market Intel</p>
            </div>
          </div>
          <button
            onClick={() => newConversation()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black text-black transition-all hover:scale-[1.02]"
            style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingConvs ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-4 h-4 text-muted-foreground/40 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/40 text-center py-6 px-3">No conversations yet. Start chatting below.</p>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full group flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition-all ${activeConvId === conv.id ? "bg-green-500/10 text-foreground border border-green-500/20" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
                <Bot className="w-3.5 h-3.5 shrink-0 text-green-400/60" />
                <span className="truncate flex-1">{conv.title}</span>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-all">
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))
          )}
        </div>

        {/* Live market sidebar card */}
        <div className="p-3 border-t border-border/50">
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">Top Movers</p>
          <div className="space-y-1.5">
            {topMovers.slice(0, 5).map(m => {
              const up = (m.priceChangePercent24h ?? 0) >= 0;
              return (
                <div key={m.symbol} className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-foreground">{m.baseAsset}</span>
                  <span className={`text-[10px] font-black ${up ? "text-green-400" : "text-red-400"}`}>
                    {up ? "+" : ""}{(m.priceChangePercent24h ?? 0).toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border/50 shrink-0"
          style={{ background: "rgba(var(--background),0.8)", backdropFilter: "blur(12px)" }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
            <Bot className="w-4 h-4 text-black" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-sm text-foreground">Ora AI</p>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <p className="text-[10px] text-green-400 font-black uppercase tracking-widest">Live market data connected</p>
            </div>
          </div>
          {activeConvId && (
            <button
              onClick={() => { setActiveConvId(null); setMessages([]); }}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground text-xs font-semibold transition-all">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:block">New Chat</span>
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">
          {isEmpty ? (
            <div className="max-w-2xl mx-auto">
              {/* Welcome */}
              <div className="text-center mb-10">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: "linear-gradient(135deg, rgba(74,222,128,0.15), rgba(34,211,238,0.15))", border: "1px solid rgba(74,222,128,0.2)" }}>
                  <Bot className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-2xl font-black text-foreground mb-2">Hello, I'm Ora</h2>
                <p className="text-muted-foreground text-sm">Your real-time AI trading intelligence for OrahDEX.<br />I can see live prices, volumes, and market data right now.</p>
              </div>

              {/* Starter prompts */}
              <div className="grid sm:grid-cols-2 gap-3 mb-8">
                {STARTER_PROMPTS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.prompt)}
                    className="group flex items-start gap-3 p-4 rounded-2xl border border-border/50 hover:border-green-500/30 bg-card/50 hover:bg-green-500/5 transition-all text-left">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-green-500/20 bg-green-500/10">
                      <s.icon className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-foreground">{s.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{s.prompt}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-green-400 mt-0.5 shrink-0 ml-auto transition-colors" />
                  </button>
                ))}
              </div>

              {/* Live data preview */}
              {topMovers.length > 0 && (
                <div className="rounded-2xl border border-border/50 bg-card/30 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/50">Live Market Snapshot</p>
                    <span className="flex items-center gap-1.5 text-[10px] font-black text-green-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      Live
                    </span>
                  </div>
                  <div className="divide-y divide-border/20">
                    {topMovers.slice(0, 5).map(m => {
                      const up = (m.priceChangePercent24h ?? 0) >= 0;
                      return (
                        <div key={m.symbol} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <p className="text-sm font-black text-foreground">{m.baseAsset}</p>
                            <p className="text-[10px] text-muted-foreground/50">{m.symbol}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-foreground font-mono">
                              ${Number(m.lastPrice ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}
                            </p>
                            <p className={`text-[11px] font-black ${up ? "text-green-400" : "text-red-400"}`}>
                              {up ? "+" : ""}{(m.priceChangePercent24h ?? 0).toFixed(2)}%
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
                      <Bot className="w-3.5 h-3.5 text-black" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-green-500/15 border border-green-500/20 text-foreground text-sm font-medium"
                      : "bg-card border border-border/50 text-muted-foreground"
                  }`}>
                    {msg.role === "assistant" && msg.content === "" ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" style={{ animationDelay: "0.2s" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" style={{ animationDelay: "0.4s" }} />
                      </div>
                    ) : msg.role === "assistant" ? (
                      <MarkdownText text={msg.content} />
                    ) : (
                      <p className="text-sm">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-border/50"
          style={{ background: "rgba(var(--background),0.9)", backdropFilter: "blur(12px)" }}>
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3 items-end rounded-2xl border border-border/60 bg-card/50 p-3 focus-within:border-green-500/40 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Ora about live prices, market trends, trading strategies…"
                rows={1}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 resize-none outline-none min-h-[24px] max-h-[160px]"
                style={{ fieldSizing: "content" } as any}
                disabled={streaming}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || streaming}
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-30"
                style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
                <Send className="w-3.5 h-3.5 text-black" />
              </button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground/30 mt-2 font-medium">
              Ora has access to live OrahDEX market data · Not financial advice
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
