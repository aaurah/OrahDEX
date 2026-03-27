import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Send, Loader2, MessageSquare, Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Message {
  role: "user" | "assistant";
  content: string;
}

function parseMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, '<code class="bg-white/10 px-1 rounded text-xs font-mono">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc">$1</li>')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/\n/g, "<br/>");
}

const QUICK_PROMPTS = [
  "What is BSV settlement?",
  "Explain Keeper tier fees",
  "Best DeFi pairs right now?",
  "How do I read the order book?",
];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingMsgRef = useRef<string | null>(null);

  const scrollBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(() => {
    if (open) {
      setUnread(0);
      scrollBottom();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, scrollBottom]);

  // Listen for external open events (e.g. from AiInsightsBar "Ask Ora" button)
  useEffect(() => {
    function handleOpenEvent(e: Event) {
      const question = (e as CustomEvent<string>).detail;
      pendingMsgRef.current = question ?? null;
      setOpen(true);
    }
    window.addEventListener("ora:open", handleOpenEvent);
    return () => window.removeEventListener("ora:open", handleOpenEvent);
  }, []);

  // When the chat opens with a pending question, send it
  useEffect(() => {
    if (open && pendingMsgRef.current) {
      const q = pendingMsgRef.current;
      pendingMsgRef.current = null;
      setTimeout(() => sendMessage(q), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { scrollBottom(); }, [messages, scrollBottom]);

  async function ensureConversation(): Promise<number> {
    if (conversationId) return conversationId;
    const r = await fetch(`${BASE}/api/ai/conversations`, { method: "POST" });
    if (!r.ok) throw new Error("Failed to create conversation");
    const data = await r.json();
    setConversationId(data.id);
    return data.id;
  }

  async function sendMessage(content: string) {
    if (!content.trim() || streaming) return;
    setInput("");

    const userMsg: Message = { role: "user", content };
    setMessages(prev => [...prev, userMsg]);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages(prev => [...prev, assistantMsg]);
    setStreaming(true);

    try {
      const convId = await ensureConversation();

      abortRef.current = new AbortController();
      const r = await fetch(`${BASE}/api/ai/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: abortRef.current.signal,
      });

      if (!r.ok) throw new Error("Failed to send message");

      const reader = r.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.content) {
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: (next[next.length - 1].content) + event.content };
                return next;
              });
            }
            if (event.done) break;
          } catch {}
        }
      }

      if (!open) setUnread(u => u + 1);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: "Sorry, I ran into an error. Please try again." };
          return next;
        });
      }
    } finally {
      setStreaming(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl",
          "bg-gradient-to-br from-green-400 to-emerald-600 hover:from-green-300 hover:to-emerald-500",
          "flex items-center justify-center transition-all duration-200 hover:scale-110",
          open && "hidden"
        )}
        title="Ask Ora — AI Trading Assistant"
      >
        <Bot className="w-6 h-6 text-black" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl border border-white/10",
          "bg-[#0a0f0a] transition-all duration-200",
          minimised ? "w-72 h-14" : "w-[380px] h-[580px] max-h-[85vh]"
        )}>
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-gradient-to-r from-green-950/80 to-emerald-950/80 rounded-t-2xl shrink-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-black" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-white text-sm">Ora</span>
                <Sparkles className="w-3 h-3 text-green-400" />
              </div>
              <p className="text-[10px] text-green-400">AI Trading Intelligence · OrahDEX</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMinimised(m => !m)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                <ChevronDown className={cn("w-4 h-4 transition-transform", minimised && "rotate-180")} />
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!minimised && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                {isEmpty ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-6">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400/20 to-emerald-600/20 flex items-center justify-center">
                      <Bot className="w-8 h-8 text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-sm">Ask Ora anything</h3>
                      <p className="text-gray-500 text-xs mt-1">Market analysis, trading tips, coin research</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 w-full">
                      {QUICK_PROMPTS.map(q => (
                        <button
                          key={q}
                          onClick={() => sendMessage(q)}
                          className="text-left text-xs px-3 py-2 rounded-xl border border-white/10 hover:border-green-500/40 hover:bg-green-950/30 text-gray-300 hover:text-white transition-all"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                      {msg.role === "assistant" && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="w-3.5 h-3.5 text-black" />
                        </div>
                      )}
                      <div className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        msg.role === "user"
                          ? "bg-green-600/30 text-white rounded-tr-sm border border-green-500/20"
                          : "bg-white/5 text-gray-200 rounded-tl-sm border border-white/5"
                      )}>
                        {msg.role === "assistant" && msg.content === "" && streaming ? (
                          <div className="flex gap-1 py-1">
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        ) : (
                          <p
                            className="leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input area */}
              <div className="p-3 border-t border-white/10 shrink-0">
                <div className="flex gap-2 items-end bg-white/5 rounded-xl border border-white/10 focus-within:border-green-500/40 transition-colors p-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Ask about markets, trading, coins..."
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 resize-none outline-none leading-relaxed max-h-24 overflow-y-auto"
                    style={{ scrollbarWidth: "none" }}
                  />
                  <button
                    onClick={() => streaming ? stopStreaming() : sendMessage(input)}
                    disabled={!streaming && !input.trim()}
                    className={cn(
                      "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                      streaming
                        ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        : input.trim()
                        ? "bg-green-600 text-black hover:bg-green-500"
                        : "bg-white/5 text-gray-600 cursor-not-allowed"
                    )}
                  >
                    {streaming ? (
                      <X className="w-4 h-4" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-gray-600 text-center mt-2">
                  Ora provides market education, not financial advice
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
