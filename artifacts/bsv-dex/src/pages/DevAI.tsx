import { useState, useRef, useEffect, useCallback } from "react";
import {
  Code2, Send, Plus, Trash2, Terminal, Cpu, Zap, Copy, Check,
  ChevronRight, BookOpen, Bot, RefreshCw, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";

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

/* ── Code block copy button ─────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-white/5"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ── Inline markdown (bold + inline code) ───────────────────────────────── */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="font-mono text-green-400 bg-green-500/10 px-1 rounded text-[11px]">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

/* ── Full markdown renderer with fenced code blocks ────────────────────── */
function DevMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || "text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const code = codeLines.join("\n");
      blocks.push(
        <div key={`code-${i}`} className="my-3 rounded-lg overflow-hidden border border-border/40">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/40">
            <span className="text-[11px] font-mono text-muted-foreground">{lang}</span>
            <CopyButton text={code} />
          </div>
          <pre className="p-3 overflow-x-auto text-[12px] leading-relaxed font-mono bg-black/20 text-foreground/90">
            <code>{code}</code>
          </pre>
        </div>
      );
      continue;
    }

    // Headings
    if (line.startsWith("### ")) { blocks.push(<h3 key={i} className="font-bold text-sm text-foreground mt-4 mb-1">{line.slice(4)}</h3>); i++; continue; }
    if (line.startsWith("## "))  { blocks.push(<h2 key={i} className="font-bold text-base text-foreground mt-4 mb-1">{line.slice(3)}</h2>); i++; continue; }
    if (line.startsWith("# "))   { blocks.push(<h1 key={i} className="font-bold text-lg text-foreground mt-4 mb-1">{line.slice(2)}</h1>); i++; continue; }

    // Bullet
    if (line.startsWith("- ") || line.startsWith("• ")) {
      blocks.push(
        <div key={i} className="flex gap-2 items-start">
          <span className="text-green-400 mt-0.5 shrink-0 text-xs">·</span>
          <span className="text-sm">{renderInline(line.slice(2))}</span>
        </div>
      );
      i++; continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s(.*)$/);
    if (numMatch) {
      blocks.push(
        <div key={i} className="flex gap-2 items-start">
          <span className="text-green-400 shrink-0 font-bold text-xs mt-0.5">{numMatch[1]}.</span>
          <span className="text-sm">{renderInline(numMatch[2])}</span>
        </div>
      );
      i++; continue;
    }

    // Blank line
    if (line === "") { blocks.push(<div key={i} className="h-1.5" />); i++; continue; }

    // Normal paragraph
    blocks.push(<p key={i} className="text-sm leading-relaxed">{renderInline(line)}</p>);
    i++;
  }

  return <div className="space-y-0.5">{blocks}</div>;
}

/* ── Starter prompts ─────────────────────────────────────────────────────── */
const STARTERS = [
  { icon: Terminal, label: "Market making bot", prompt: "Generate a TypeScript market making bot for BSV/USDT that posts bids and asks around the mid price with a 20bps spread." },
  { icon: Zap, label: "Build a swap", prompt: "Show me how to get a swap quote from OrahDEX and execute it — ETH to BSV, 1 ETH, in TypeScript using fetch." },
  { icon: BookOpen, label: "API overview", prompt: "Give me a full overview of the OrahDEX REST API — all endpoints, request bodies, and response shapes." },
  { icon: Cpu, label: "Arbitrage bot", prompt: "Build an arbitrage bot in TypeScript that detects price discrepancies across OrahDEX pairs and captures them." },
  { icon: Code2, label: "Python integration", prompt: "Show me how to integrate with OrahDEX using Python — place a limit order, fetch the orderbook, and stream trades." },
  { icon: Bot, label: "BSV transaction", prompt: "How do I build and broadcast a BSV transaction using @bsv/sdk? Include key derivation and signing." },
];

/* ── API Reference side panel ────────────────────────────────────────────── */
const API_SECTIONS = [
  {
    label: "Markets",
    items: [
      { method: "GET", path: "/api/markets", desc: "All pairs" },
      { method: "GET", path: "/api/markets/:symbol/ticker", desc: "Single ticker" },
      { method: "GET", path: "/api/markets/:symbol/orderbook", desc: "Order book" },
    ],
  },
  {
    label: "Orders",
    items: [
      { method: "POST", path: "/api/orders", desc: "Place order" },
      { method: "GET",  path: "/api/orders", desc: "Open orders" },
      { method: "DELETE", path: "/api/orders/:id", desc: "Cancel" },
    ],
  },
  {
    label: "Swap / Bridge",
    items: [
      { method: "POST", path: "/api/swap/quote", desc: "Get quote" },
      { method: "POST", path: "/api/swap/execute", desc: "Execute swap" },
      { method: "POST", path: "/api/bridge/quote", desc: "Bridge quote" },
    ],
  },
  {
    label: "BSV",
    items: [
      { method: "GET", path: "/api/health", desc: "Chain status" },
      { method: "GET", path: "/api/deposit/address/:addr", desc: "Deposit addr" },
    ],
  },
];

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "text-blue-400 bg-blue-500/10",
    POST: "text-green-400 bg-green-500/10",
    DELETE: "text-red-400 bg-red-500/10",
  };
  return (
    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${colors[method] ?? "text-muted-foreground bg-muted/30"}`}>
      {method}
    </span>
  );
}

function ApiPanel({ onClose }: { onClose: () => void }) {
  const [expanded, setExpanded] = useState<string | null>("Markets");
  return (
    <div className="w-72 xl:w-80 flex flex-col border-l border-border/50 bg-background/50 overflow-y-auto">
      <div className="flex items-center justify-between p-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-green-400" />
          <span className="text-xs font-bold">API Reference</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-1">
        <div className="text-[10px] text-muted-foreground mb-2 font-mono">base: orahdex.org</div>
        {API_SECTIONS.map(section => (
          <div key={section.label} className="border border-border/30 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === section.label ? null : section.label)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold hover:bg-muted/30 transition-colors"
            >
              {section.label}
              {expanded === section.label
                ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
            </button>
            {expanded === section.label && (
              <div className="border-t border-border/30 divide-y divide-border/20">
                {section.items.map(item => (
                  <div key={item.path} className="px-3 py-2 flex items-start gap-2">
                    <MethodBadge method={item.method} />
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] text-foreground/80 truncate">{item.path}</div>
                      <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Keeper tiers */}
        <div className="mt-3 border border-border/30 rounded-lg p-3">
          <div className="text-xs font-bold mb-2">Keeper Fee Tiers</div>
          {[
            ["Standard", "30bps", "default"],
            ["Guardian", "25bps", "1K ORAH"],
            ["Elder",    "20bps", "10K ORAH"],
            ["Archon",   "15bps", "100K ORAH"],
          ].map(([tier, fee, req]) => (
            <div key={tier} className="flex items-center justify-between py-1 border-b border-border/20 last:border-0">
              <span className="text-[11px] text-foreground/80">{tier}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{req}</span>
                <span className="text-[11px] font-mono text-green-400">{fee}</span>
              </div>
            </div>
          ))}
        </div>

        {/* WebSocket note */}
        <div className="mt-2 border border-border/30 rounded-lg p-3">
          <div className="text-xs font-bold mb-1">WebSocket</div>
          <div className="font-mono text-[10px] text-muted-foreground break-all">wss://orahdex.org/ws</div>
          <div className="text-[10px] text-muted-foreground mt-1">Channels: ticker, orderbook, trades, portfolio</div>
        </div>
      </div>
    </div>
  );
}

/* ── Main DevAI page ─────────────────────────────────────────────────────── */
export function DevAIPage() {
  useSEO({
    title: "DevAI — Developer Intelligence | OrahDEX",
    description: "OrahDEX DevAI: build trading bots, integrate the OrahDEX API, simulate swaps, and generate TypeScript & Python code. The developer AI for the sovereign DEX.",
    keywords: "OrahDEX API, crypto trading bot, DEX integration, developer AI, build on DEX, BSV developer tools, trading bot TypeScript",
  });
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [showApiPanel, setShowApiPanel] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef  = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  /* Auto-resize textarea */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  /* Load conversation list */
  const loadConvs = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await fetch(`${API}/devai/conversations`);
      if (res.ok) setConvs(await res.json());
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  const loadConv = useCallback(async (id: number) => {
    setActiveId(id);
    setMessages([]);
    try {
      const res = await fetch(`${API}/devai/conversations/${id}`);
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

  const newConv = useCallback(async () => {
    const res = await fetch(`${API}/devai/conversations`, { method: "POST" });
    if (!res.ok) return null;
    const conv = await res.json();
    setConvs(prev => [conv, ...prev]);
    setActiveId(conv.id);
    setMessages([]);
    return conv.id as number;
  }, []);

  const deleteConv = useCallback(async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${API}/devai/conversations/${id}`, { method: "DELETE" });
    setConvs(prev => prev.filter(c => c.id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
  }, [activeId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    const msg = text.trim();
    setInput("");

    let convId = activeId;
    if (!convId) {
      convId = await newConv();
      if (!convId) return;
    }

    const userMsg: Message = { id: Date.now() + "-u", role: "user", content: msg, createdAt: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    const assistantId = Date.now() + "-a";
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", createdAt: new Date() }]);

    abortRef.current = new AbortController();
    try {
      const res = await fetch(`${API}/devai/conversations/${convId}/messages`, {
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
  }, [activeId, streaming, newConv]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Left sidebar: conversations ───────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-60 xl:w-64 border-r border-border/50 bg-background/50 shrink-0">
        <div className="p-3 border-b border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
              <Code2 className="w-4 h-4 text-black" />
            </div>
            <div>
              <div className="text-sm font-black">DevAI</div>
              <div className="text-[10px] text-muted-foreground">Developer Intelligence</div>
            </div>
          </div>
          <button
            onClick={() => { setActiveId(null); setMessages([]); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 hover:border-green-500/40 hover:bg-green-500/5 text-xs font-medium transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            New session
          </button>
        </div>

        {/* Quick actions */}
        <div className="p-3 border-b border-border/30">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Quick actions</div>
          <div className="space-y-1">
            {[
              { label: "Market maker", prompt: "Generate a TypeScript market making bot for BSV/USDT." },
              { label: "Swap integration", prompt: "Show me how to execute a swap via the OrahDEX API." },
              { label: "API overview", prompt: "Give me a full overview of the OrahDEX REST API." },
              { label: "Bot template", prompt: "Give me a Python trading bot template for OrahDEX." },
            ].map(q => (
              <button
                key={q.label}
                onClick={() => sendMessage(q.prompt)}
                className="w-full text-left px-2 py-1.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors flex items-center gap-1.5"
              >
                <ChevronRight className="w-2.5 h-2.5 shrink-0 text-green-400" />
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 mb-2">Sessions</div>
          {loadingConvs ? (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
            </div>
          ) : convs.length === 0 ? (
            <div className="text-[11px] text-muted-foreground text-center py-4">No sessions yet</div>
          ) : (
            <div className="space-y-0.5">
              {convs.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => loadConv(conv.id)}
                  className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer group transition-colors ${
                    activeId === conv.id
                      ? "bg-green-500/10 border border-green-500/30"
                      : "hover:bg-muted/30 border border-transparent"
                  }`}
                >
                  <Terminal className="w-3 h-3 shrink-0 text-muted-foreground" />
                  <span className="text-[11px] flex-1 truncate">{conv.title}</span>
                  <button
                    onClick={e => deleteConv(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main chat area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 lg:hidden"
              style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
              <Code2 className="w-3.5 h-3.5 text-black" />
            </div>
            <div>
              <div className="text-sm font-black">OrahDEX DevAI</div>
              <div className="text-[10px] text-muted-foreground hidden sm:block">
                Build bots · Integrate APIs · Simulate swaps · Sign transactions
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowApiPanel(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
              showApiPanel
                ? "border-green-500/50 bg-green-500/10 text-green-400"
                : "border-border/50 hover:border-green-500/30 text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            API Ref
          </button>
        </div>

        {/* Messages / Empty state */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
                <Code2 className="w-7 h-7 text-black" />
              </div>
              <h2 className="text-xl font-black mb-1">OrahDEX DevAI</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                Your developer intelligence for building on OrahDEX. Ask anything — bots, APIs, transactions, integrations.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full">
                {STARTERS.map(s => (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.prompt)}
                    className="flex items-start gap-2.5 p-3 rounded-xl border border-border/50 hover:border-green-500/40 hover:bg-green-500/5 text-left transition-all group"
                  >
                    <s.icon className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    <span className="text-xs font-medium group-hover:text-foreground transition-colors">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
                      <Code2 className="w-3.5 h-3.5 text-black" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-green-500/15 border border-green-500/25 text-sm"
                      : "bg-muted/30 border border-border/40 text-foreground/90"
                  }`}>
                    {msg.role === "user"
                      ? <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      : msg.content
                        ? <DevMarkdown text={msg.content} />
                        : <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Thinking...
                          </div>
                    }
                  </div>
                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-full bg-muted border border-border/50 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold">You</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border/50 shrink-0">
          <div className="flex items-end gap-2 bg-muted/20 border border-border/50 rounded-xl px-3 py-2 focus-within:border-green-500/40 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about bots, APIs, transactions, integrations..."
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none text-sm placeholder:text-muted-foreground min-h-[24px] max-h-[160px] leading-6"
              style={{ overflowY: "auto" }}
            />
            {streaming ? (
              <button
                onClick={() => { abortRef.current?.abort(); setStreaming(false); }}
                className="shrink-0 w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="shrink-0 w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center text-black hover:bg-green-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground text-center mt-1.5">
            Enter to send · Shift+Enter for new line · Powered by OrahDEX DevAI
          </div>
        </div>
      </div>

      {/* ── Right panel: API Reference ─────────────────────────────────────── */}
      {showApiPanel && <ApiPanel onClose={() => setShowApiPanel(false)} />}
    </div>
  );
}
