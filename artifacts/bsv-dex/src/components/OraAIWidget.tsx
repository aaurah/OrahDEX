import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Send, X, Minimize2, ExternalLink, RotateCcw } from "lucide-react";
import { Link } from "wouter";

const API = (import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "") + "/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-black text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="font-mono text-green-400 bg-green-500/10 px-1 rounded text-[10px]">{part.slice(1, -1)}</code>;
    return part;
  });
}

function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-0.5 text-[13px] leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <p key={i} className="font-black text-foreground text-xs mt-2 mb-0.5">{line.slice(4)}</p>;
        if (line.startsWith("## ") || line.startsWith("# ")) return <p key={i} className="font-black text-foreground text-xs mt-2 mb-0.5">{line.replace(/^#+\s/, "")}</p>;
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-1.5 items-start">
              <span className="text-green-400 mt-0.5 shrink-0 text-[10px]">·</span>
              <span className="text-[12px]">{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (line === "") return <div key={i} className="h-0.5" />;
        return <p key={i} className="text-[12px]">{renderInline(line)}</p>;
      })}
    </div>
  );
}

const QUICK_PROMPTS = [
  "What's BTC doing right now?",
  "Top gainers today?",
  "How do Keeper tiers work?",
];

export function OraAIWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [convId, setConvId] = useState<number | null>(null);
  const [pulse, setPulse] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ensureConversation = useCallback(async (title: string): Promise<number | null> => {
    if (convId) return convId;
    try {
      const res = await fetch(`${API}/anthropic/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.slice(0, 80) }),
      });
      if (!res.ok) return null;
      const c = await res.json();
      setConvId(c.id);
      return c.id;
    } catch { return null; }
  }, [convId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    const msg = text.trim();
    setInput("");

    const id = await ensureConversation(msg);
    if (!id) return;

    const userMsg: Message = { id: Date.now() + "-u", role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    const assistantId = Date.now() + "-a";
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${API}/anthropic/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msg }),
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
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: "Something went wrong. Please try again." } : m
      ));
    } finally {
      setStreaming(false);
    }
  }, [streaming, ensureConversation]);

  const reset = useCallback(() => {
    setMessages([]);
    setConvId(null);
    setInput("");
  }, []);

  return (
    <>
      {/* Floating bubble */}
      <div className="fixed bottom-5 left-5 z-50 flex flex-col items-start gap-3">
        {/* Tooltip hint when closed */}
        {!open && pulse && (
          <div className="rounded-2xl px-3 py-2 text-xs font-bold text-foreground shadow-xl animate-fade-in"
            style={{ background: "hsl(var(--card))", border: "1px solid rgba(74,222,128,0.25)", boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}>
            Ask Ora about live prices ✦
          </div>
        )}

        <button
          onClick={() => setOpen(o => !o)}
          className="relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95"
          style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)", boxShadow: "0 4px 32px rgba(74,222,128,0.45)" }}>
          {open ? <X className="w-5 h-5 text-black" /> : <Bot className="w-6 h-6 text-black" />}
          {!open && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-300 border-2 border-background animate-pulse" />
          )}
        </button>
      </div>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 left-5 z-50 flex flex-col rounded-3xl overflow-hidden shadow-2xl"
          style={{
            width: "min(380px, calc(100vw - 20px))",
            height: "min(560px, calc(100vh - 120px))",
            background: "hsl(var(--card))",
            border: "1px solid rgba(74,222,128,0.2)",
            boxShadow: "0 8px 64px rgba(0,0,0,0.4), 0 0 0 1px rgba(74,222,128,0.08)",
          }}>

          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 shrink-0 border-b border-border/40"
            style={{ background: "linear-gradient(180deg, rgba(74,222,128,0.05) 0%, transparent 100%)" }}>
            <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
              <Bot className="w-3.5 h-3.5 text-black" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm text-foreground leading-tight">Ora AI</p>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[9px] font-black text-green-400 uppercase tracking-widest">Live data</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={reset} title="New chat" className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors text-muted-foreground hover:text-foreground">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <Link href="/ora-ai" className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors text-muted-foreground hover:text-foreground inline-flex">
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors text-muted-foreground hover:text-foreground">
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-none">
            {messages.length === 0 ? (
              <div className="py-4">
                <div className="text-center mb-5">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                    style={{ background: "linear-gradient(135deg, rgba(74,222,128,0.12), rgba(34,211,238,0.12))", border: "1px solid rgba(74,222,128,0.15)" }}>
                    <Bot className="w-6 h-6 text-green-400" />
                  </div>
                  <p className="font-black text-sm text-foreground">Ask Ora anything</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">Live OrahDEX market data connected</p>
                </div>
                <div className="space-y-2">
                  {QUICK_PROMPTS.map(p => (
                    <button key={p} onClick={() => sendMessage(p)}
                      className="w-full text-left px-3 py-2 rounded-xl border border-border/40 hover:border-green-500/30 bg-background/40 hover:bg-green-500/5 transition-all text-[12px] font-semibold text-muted-foreground hover:text-foreground">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
                      <Bot className="w-3 h-3 text-black" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    msg.role === "user"
                      ? "bg-green-500/15 border border-green-500/20 text-foreground text-[13px] font-medium"
                      : "bg-background/60 border border-border/40 text-muted-foreground"
                  }`}>
                    {msg.role === "assistant" && msg.content === "" ? (
                      <div className="flex items-center gap-1 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" style={{ animationDelay: "0.2s" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" style={{ animationDelay: "0.4s" }} />
                      </div>
                    ) : msg.role === "assistant" ? (
                      <MiniMarkdown text={msg.content} />
                    ) : (
                      <p className="text-[13px]">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 px-3 pb-3 pt-2 border-t border-border/40">
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-border/50 bg-background/50 focus-within:border-green-500/40 transition-colors">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendMessage(input); }}
                placeholder="Ask about live prices…"
                className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none"
                disabled={streaming}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || streaming}
                className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-30 hover:scale-105"
                style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
                <Send className="w-3 h-3 text-black" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
