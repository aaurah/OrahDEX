import { adminFetch } from "@/lib/adminFetch";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Code2, Terminal, Cpu, Zap, RefreshCw, Send, Trash2, Eye, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Activity, MessageSquare, ToggleLeft, ToggleRight,
  Link, Key, Settings, Loader2, Bot, Copy, Check, BookOpen, AlertCircle, ShieldCheck,
  GitBranch, FileCode, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const DEVAI_MODELS = [
  { id: "gpt-5.4",    label: "GPT-5.4",    desc: "DevAI default — highest capability for code" },
  { id: "gpt-5.2",    label: "GPT-5.2",    desc: "Balanced — fast and capable" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", desc: "Fastest — simple Q&A" },
];

const SYSTEM_PROMPT_PREVIEW = `You are OrahDevAI — the developer intelligence of OrahDEX (orahdex.org), a sovereign decentralized exchange built on BSV (Bitcoin SV) settlement.

You are a senior protocol engineer who deeply understands the OrahDEX stack. You help developers build bots, integrations, wallets, and tools on top of OrahDEX.

## OrahDEX REST API (base: https://orahdex.org/api)
GET /api/markets — all listed pairs with price, volume, change
GET /api/markets/:symbol/ticker — single pair ticker
POST /api/orders — place an order
POST /api/swap/quote — get swap quote
...

## Guidelines:
- Always include working, runnable code examples
- Use TypeScript by default; include Python on request
- Show error handling in examples
- Be direct and concise. Skip preamble. Go straight to the code.`;

/* ── CopyButton ─────────────────────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-white/5"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ── Stats Row ──────────────────────────────────────────────────────────────── */
function DevAIStats() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-devai-stats"],
    queryFn: async () => {
      const [convR, statsR] = await Promise.all([
        fetch(`${BASE}/api/devai/conversations`),
        adminFetch(`/api/admin/stats`).then(r => r.json()).catch(() => ({})),
      ]);
      const convs = convR.ok ? await convR.json() : [];
      return {
        sessions: convs.length ?? 0,
        messages: statsR.aiMessages ?? "—",
        insights: statsR.aiInsights ?? "—",
        signals:  statsR.aiSignals ?? "—",
      };
    },
    refetchInterval: 30000,
  });

  const cards = [
    { label: "Dev Sessions",     value: data?.sessions ?? "—",  icon: Terminal,      color: "text-green-400 bg-green-400/10" },
    { label: "Messages Sent",    value: data?.messages ?? "—",  icon: MessageSquare, color: "text-blue-400 bg-blue-400/10" },
    { label: "Code Generations", value: data?.insights ?? "—",  icon: Code2,         color: "text-amber-400 bg-amber-400/10" },
    { label: "API Calls",        value: data?.signals ?? "—",   icon: Activity,      color: "text-violet-400 bg-violet-400/10" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", c.color)}>
            <c.icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-black font-mono">{typeof c.value === "number" ? c.value.toLocaleString() : c.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── GitHub Status Card ─────────────────────────────────────────────────────── */
function GitHubStatusCard() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-devai-github"],
    queryFn: async () => {
      const r = await adminFetch(`/api/admin/devai/github`);
      return r.json();
    },
    retry: false,
  });

  const connected = data?.connected === true;
  const repos: { name: string; full_name: string; private: boolean; language: string | null; updated_at: string }[] = data?.repos ?? [];

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white/8 flex items-center justify-center">
            <Link className="w-4 h-4 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold">GitHub Integration</p>
            <p className="text-xs text-muted-foreground">GITHUB_TOKEN — repo access for DevAI context</p>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="p-2 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground">
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin text-green-400")} />
        </button>
      </div>

      {/* Status badge */}
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-xl border",
        connected ? "bg-green-500/8 border-green-500/20" : "bg-red-500/8 border-red-500/20"
      )}>
        {connected
          ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
        <div>
          <p className={cn("text-sm font-semibold", connected ? "text-green-300" : "text-red-300")}>
            {connected ? "Connected" : "Not Connected"}
          </p>
          <p className="text-xs text-muted-foreground">
            {connected
              ? `Authenticated as ${data?.login ?? "unknown"} · ${repos.length} repos accessible`
              : "Set GITHUB_TOKEN in environment secrets to enable repo access"}
          </p>
        </div>
      </div>

      {/* Repos list */}
      {connected && repos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Accessible Repositories</p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {repos.map(repo => (
              <div key={repo.full_name} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/3 border border-white/5">
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-semibold text-foreground truncate">{repo.full_name}</p>
                  {repo.language && <p className="text-[10px] text-muted-foreground">{repo.language}</p>}
                </div>
                {repo.private && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 text-amber-400 uppercase shrink-0">Private</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!connected && (
        <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/25 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-300">How to connect</p>
            <p className="text-[11px] text-amber-400/70 mt-0.5">
              Generate a GitHub Personal Access Token with <span className="font-mono">repo</span> scope, then add it as <span className="font-mono">GITHUB_TOKEN</span> in your environment secrets. DevAI will automatically use it to read your repos as context.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Model Settings Card ────────────────────────────────────────────────────── */
function DevAIModelSettings() {
  const [model, setModel] = useState("gpt-5.4");
  const [enabled, setEnabled] = useState(true);
  const [githubContext, setGithubContext] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-green-400/10 flex items-center justify-center">
          <Settings className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-bold">DevAI Settings</p>
          <p className="text-xs text-muted-foreground">Model, features, and access controls</p>
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/5">
          <div>
            <p className="text-sm font-semibold">DevAI Enabled</p>
            <p className="text-xs text-muted-foreground">Allow users to access /devai on the platform</p>
          </div>
          <button onClick={() => setEnabled(e => !e)} className="transition-colors shrink-0">
            {enabled
              ? <ToggleRight className="w-8 h-8 text-green-400" />
              : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
          </button>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/5">
          <div>
            <p className="text-sm font-semibold">GitHub Repo Context</p>
            <p className="text-xs text-muted-foreground">Allow DevAI to read GitHub repos as conversation context</p>
          </div>
          <button onClick={() => setGithubContext(e => !e)} className="transition-colors shrink-0">
            {githubContext
              ? <ToggleRight className="w-8 h-8 text-green-400" />
              : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Model selector */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Active Model</p>
        <div className="space-y-2">
          {DEVAI_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                model === m.id
                  ? "border-green-500/40 bg-green-500/8 text-foreground"
                  : "border-white/5 bg-white/2 text-muted-foreground hover:bg-white/4"
              )}
            >
              <Cpu className={cn("w-4 h-4 shrink-0", model === m.id ? "text-green-400" : "")} />
              <div className="flex-1">
                <p className={cn("text-sm font-bold", model === m.id ? "text-foreground" : "")}>{m.label}</p>
                <p className="text-xs">{m.desc}</p>
              </div>
              {model === m.id && <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* System prompt preview */}
      <div>
        <button
          onClick={() => setShowPrompt(p => !p)}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          {showPrompt ? "Hide" : "View"} DevAI system prompt
          {showPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showPrompt && (
          <div className="mt-2 relative">
            <div className="absolute top-2 right-2">
              <CopyButton text={SYSTEM_PROMPT_PREVIEW} />
            </div>
            <pre className="p-3 pt-8 rounded-xl bg-black/40 border border-white/5 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {SYSTEM_PROMPT_PREVIEW}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Chat Tester ────────────────────────────────────────────────────────────── */
function DevAIChatTester() {
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  async function send() {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: q }]);
    setStreaming(true);

    try {
      let cId = convId;
      if (!cId) {
        const r = await fetch(`${BASE}/api/devai/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const d = await r.json();
        cId = d.id;
        setConvId(cId);
      }

      setMessages(m => [...m, { role: "assistant", content: "" }]);
      abortRef.current = new AbortController();

      const resp = await fetch(`${BASE}/api/devai/conversations/${cId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: q }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok || !resp.body) throw new Error("Stream failed");
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
            if (data.content) setMessages(m => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + data.content };
              return copy;
            });
          } catch { }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: "Error contacting DevAI." };
          return copy;
        });
      }
    } finally {
      setStreaming(false);
    }
  }

  const reset = () => { setConvId(null); setMessages([]); setInput(""); abortRef.current?.abort(); setStreaming(false); };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-green-400/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-bold">DevAI Chat Tester</p>
            <p className="text-xs text-muted-foreground">Live test — connects to the real DevAI backend</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="h-64 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Code2 className="w-8 h-8 text-green-400/40 mb-2" />
            <p className="text-sm text-muted-foreground">Send a message to test DevAI</p>
            <div className="flex flex-wrap gap-2 mt-3 justify-center">
              {["Show me the OrahDEX API", "Build a market making bot", "How do I sign a BSV tx?"].map(s => (
                <button key={s} onClick={() => { setInput(s); }} className="text-[11px] px-2.5 py-1 rounded-lg border border-border/50 hover:border-green-500/40 hover:bg-green-500/5 text-muted-foreground hover:text-foreground transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "assistant" && (
                  <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
                    <Code2 className="w-3 h-3 text-black" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                  m.role === "user"
                    ? "bg-green-500/15 border border-green-500/25"
                    : "bg-muted/30 border border-border/40"
                )}>
                  {m.content
                    ? <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                    : <Loader2 className="w-3 h-3 animate-spin text-green-400" />}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border/50">
        <div className="flex items-end gap-2 bg-muted/20 border border-border/50 rounded-xl px-3 py-2 focus-within:border-green-500/40 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask DevAI anything..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-xs placeholder:text-muted-foreground min-h-[20px] max-h-[120px] leading-5"
            style={{ overflowY: "auto" }}
          />
          {streaming
            ? <button onClick={() => { abortRef.current?.abort(); setStreaming(false); }} className="shrink-0 w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-colors"><XCircle className="w-3.5 h-3.5" /></button>
            : <button onClick={send} disabled={!input.trim()} className="shrink-0 w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center text-black hover:bg-green-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><Send className="w-3 h-3" /></button>}
        </div>
      </div>
    </div>
  );
}

/* ── Session Manager ────────────────────────────────────────────────────────── */
function DevAISessionManager() {
  const qc = useQueryClient();
  const { data: sessions = [], isFetching, refetch } = useQuery({
    queryKey: ["admin-devai-sessions"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/devai/conversations`);
      return r.ok ? r.json() : [];
    },
  });

  async function deleteSession(id: number) {
    await fetch(`${BASE}/api/devai/conversations/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["admin-devai-sessions"] });
    qc.invalidateQueries({ queryKey: ["admin-devai-stats"] });
  }

  async function deleteAll() {
    if (!sessions.length) return;
    await Promise.all(sessions.map((s: any) => fetch(`${BASE}/api/devai/conversations/${s.id}`, { method: "DELETE" })));
    qc.invalidateQueries({ queryKey: ["admin-devai-sessions"] });
    qc.invalidateQueries({ queryKey: ["admin-devai-stats"] });
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-400/10 flex items-center justify-center">
            <FileCode className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-bold">Dev Sessions</p>
            <p className="text-xs text-muted-foreground">{sessions.length} conversation{sessions.length !== 1 ? "s" : ""} stored</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching} className="p-2 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground">
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin text-green-400")} />
          </button>
          {sessions.length > 0 && (
            <button
              onClick={deleteAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-400/10 hover:bg-red-400/20 border border-red-400/20 text-red-400 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <AlertCircle className="w-4 h-4" /> No sessions yet
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {sessions.map((s: { id: number; title: string; createdAt: string }) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5 group">
              <Terminal className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{s.title}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                  <p className="text-[10px] text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">#{s.id}</span>
              <button
                onClick={() => deleteSession(s.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Access & Auth Card ─────────────────────────────────────────────────────── */
function DevAIAccessCard() {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-violet-400/10 flex items-center justify-center">
          <ShieldCheck className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-bold">Access & Endpoints</p>
          <p className="text-xs text-muted-foreground">DevAI API surface</p>
        </div>
      </div>

      <div className="space-y-2">
        {[
          { method: "GET",    path: "/api/devai/conversations",           desc: "List all sessions" },
          { method: "POST",   path: "/api/devai/conversations",           desc: "Create session" },
          { method: "GET",    path: "/api/devai/conversations/:id",       desc: "Load session + messages" },
          { method: "POST",   path: "/api/devai/conversations/:id/messages", desc: "Stream message (SSE)" },
          { method: "DELETE", path: "/api/devai/conversations/:id",       desc: "Delete session" },
          { method: "GET",    path: "/admin/devai",                       desc: "Admin settings (this page)" },
        ].map(ep => {
          const colors: Record<string, string> = {
            GET: "text-blue-400 bg-blue-500/10",
            POST: "text-green-400 bg-green-500/10",
            DELETE: "text-red-400 bg-red-500/10",
          };
          return (
            <div key={ep.path} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/3 border border-white/5">
              <span className={cn("text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0", colors[ep.method] ?? "text-muted-foreground bg-muted/30")}>
                {ep.method}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] text-foreground/80 truncate">{ep.path}</p>
                <p className="text-[10px] text-muted-foreground">{ep.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5 bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-3">
        <Key className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-green-400/80">
          DevAI conversations are stored in the same PostgreSQL <span className="font-mono">conversations</span> table as Ora AI, partitioned by route. All streaming uses SSE with abort support.
        </p>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export function AdminDevAI() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
          <Code2 className="w-5 h-5 text-black" />
        </div>
        <div>
          <h1 className="text-xl font-black">DevAI Settings</h1>
          <p className="text-sm text-muted-foreground">Developer Intelligence — model config, GitHub integration, session management</p>
        </div>
      </div>

      {/* Stats */}
      <DevAIStats />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DevAIModelSettings />
        <GitHubStatusCard />
      </div>

      {/* Chat tester */}
      <DevAIChatTester />

      {/* Sessions + Access */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DevAISessionManager />
        <DevAIAccessCard />
      </div>
    </div>
  );
}
