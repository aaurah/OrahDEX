import { useState, useRef, useEffect, useCallback } from "react";
import {
  Code2, Send, Plus, Trash2, Terminal, Cpu, Zap, Copy, Check,
  ChevronRight, BookOpen, Bot, RefreshCw, ChevronDown, ChevronUp, X,
  Globe, Play, Download, FileCode, Hash, TrendingUp, Loader2,
  GitBranch, Activity, Layers, Search, Wallet, Shield, Database,
  Link, CheckCircle, FolderOpen, PenLine, Wrench, Upload,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { cn } from "@/lib/utils";

const API = (import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "") + "/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ToolCallEvent {
  id: string;
  name: string;
  args: Record<string, any>;
  output?: string;
  pending: boolean;
  file?: { id: string; filename: string; content: string; language: string };
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallEvent[];
  createdAt: Date;
}

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
}

// ── Tool metadata ─────────────────────────────────────────────────────────────
const TOOL_META: Record<string, { label: string; icon: any; color: string }> = {
  read_github_file:   { label: "Reading file",      icon: Link,      color: "text-white" },
  list_github_repo:   { label: "Browsing repo",     icon: GitBranch, color: "text-white" },
  execute_code:       { label: "Running code",      icon: Play,      color: "text-amber-400" },
  fetch_url:          { label: "Fetching URL",      icon: Globe,     color: "text-blue-400" },
  create_file:        { label: "Creating file",     icon: FileCode,  color: "text-green-400" },
  fetch_bsv_tx:       { label: "BSV blockchain",    icon: Hash,      color: "text-orange-400" },
  get_orahdex_market: { label: "Market data",       icon: TrendingUp,color: "text-green-400" },
  decode_eth_address: { label: "EVM address",       icon: Wallet,    color: "text-violet-400" },
  read_project_file:  { label: "Reading file",      icon: FileCode,  color: "text-cyan-400" },
  list_project_dir:   { label: "Browsing project",  icon: FolderOpen,color: "text-cyan-400" },
  query_database:     { label: "Querying database", icon: Database,  color: "text-purple-400" },
  write_project_file: { label: "Writing file",      icon: PenLine,   color: "text-yellow-400" },
  run_terminal:       { label: "Running command",   icon: Wrench,    color: "text-orange-400" },
};

function toolSubtitle(name: string, args: Record<string, any>): string {
  switch (name) {
    case "read_github_file":   return `${args.owner_repo}/${args.path}`;
    case "list_github_repo":   return `${args.owner_repo}${args.path ? "/" + args.path : ""}`;
    case "execute_code":       return args.description ?? "JavaScript";
    case "fetch_url":          return args.url?.replace(/^https?:\/\//, "") ?? "";
    case "create_file":        return args.filename ?? "";
    case "fetch_bsv_tx":       return args.txid ? args.txid.slice(0, 16) + "…" : "";
    case "get_orahdex_market": return args.symbol ?? "top markets";
    case "decode_eth_address": return args.address ? args.address.slice(0, 10) + "…" + args.address.slice(-6) : "";
    case "read_project_file":  return args.path ?? "";
    case "list_project_dir":   return args.path ?? "/";
    case "query_database":     return (args.sql ?? "").slice(0, 60);
    case "write_project_file": return args.path ?? "";
    case "run_terminal":       return args.description ?? (args.command ?? "").slice(0, 60);
    default:                   return "";
  }
}

// ── CopyButton ────────────────────────────────────────────────────────────────
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

// ── Tool call block ───────────────────────────────────────────────────────────
function ToolCallBlock({ tc }: { tc: ToolCallEvent }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_META[tc.name] ?? { label: tc.name, icon: Zap, color: "text-muted-foreground" };
  const Icon = meta.icon;
  const subtitle = toolSubtitle(tc.name, tc.args);

  return (
    <div className="my-1">
      <button
        onClick={() => !tc.pending && setExpanded(e => !e)}
        disabled={tc.pending}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all",
          tc.pending
            ? "bg-white/3 border-white/8 cursor-default"
            : "bg-white/3 border-white/8 hover:bg-white/6 hover:border-white/15"
        )}
      >
        {tc.pending
          ? <Loader2 className="w-3.5 h-3.5 text-green-400 animate-spin shrink-0" />
          : <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />}
        <Icon className={cn("w-3.5 h-3.5 shrink-0", meta.color)} />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-foreground">{meta.label}</span>
          {subtitle && (
            <span className="text-[11px] text-muted-foreground font-mono ml-2 truncate inline-block max-w-[200px] align-middle">
              {subtitle}
            </span>
          )}
        </div>
        {!tc.pending && tc.output && (
          expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && tc.output && (
        <div className="mt-1 mx-1">
          <pre className="p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
            {tc.output.slice(0, 4000)}{tc.output.length > 4000 ? "\n…(truncated)" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── File download block ───────────────────────────────────────────────────────
function FileDownloadBlock({ file }: { file: ToolCallEvent["file"] }) {
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!file) return null;

  const download = () => {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = file.filename; a.click();
    URL.revokeObjectURL(url);
  };

  const copy = () => {
    navigator.clipboard.writeText(file.content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineCount = file.content.split("\n").length;
  const charCount = file.content.length;

  return (
    <div className="my-2 rounded-2xl border border-green-500/30 bg-green-500/5 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-green-500/15">
        <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center shrink-0">
          <FileCode className="w-4 h-4 text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-green-300 font-mono truncate">{file.filename}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {file.language} · {lineCount.toLocaleString()} lines · {charCount.toLocaleString()} chars
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setPreview(p => !p)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 text-xs font-medium transition-all"
          >
            {preview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Preview
          </button>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground text-xs font-medium transition-all"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={download}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 text-black text-xs font-bold hover:bg-green-400 transition-colors"
          >
            <Download className="w-3 h-3" />
            Download
          </button>
        </div>
      </div>
      {preview && (
        <div className="max-h-80 overflow-y-auto">
          <pre className="p-4 text-[11px] font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed bg-black/20">
            {file.content.slice(0, 6000)}{file.content.length > 6000 ? "\n\n…(truncated — download for full file)" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Inline markdown renderer ──────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="font-mono text-green-400 bg-green-500/10 px-1 rounded text-[11px]">{part.slice(1, -1)}</code>;
    return part;
  });
}

function DevMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || "text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++;
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

    if (line.startsWith("### ")) { blocks.push(<h3 key={i} className="font-bold text-sm text-foreground mt-4 mb-1">{line.slice(4)}</h3>); i++; continue; }
    if (line.startsWith("## "))  { blocks.push(<h2 key={i} className="font-bold text-base text-foreground mt-4 mb-1">{line.slice(3)}</h2>); i++; continue; }
    if (line.startsWith("# "))   { blocks.push(<h1 key={i} className="font-bold text-lg text-foreground mt-4 mb-1">{line.slice(2)}</h1>); i++; continue; }

    if (line.startsWith("- ") || line.startsWith("• ")) {
      blocks.push(<div key={i} className="flex gap-2 items-start"><span className="text-green-400 mt-0.5 shrink-0 text-xs">·</span><span className="text-sm">{renderInline(line.slice(2))}</span></div>);
      i++; continue;
    }

    const numMatch = line.match(/^(\d+)\.\s(.*)$/);
    if (numMatch) {
      blocks.push(<div key={i} className="flex gap-2 items-start"><span className="text-green-400 shrink-0 font-bold text-xs mt-0.5">{numMatch[1]}.</span><span className="text-sm">{renderInline(numMatch[2])}</span></div>);
      i++; continue;
    }

    if (line === "") { blocks.push(<div key={i} className="h-1.5" />); i++; continue; }
    blocks.push(<p key={i} className="text-sm leading-relaxed">{renderInline(line)}</p>);
    i++;
  }

  return <div className="space-y-0.5">{blocks}</div>;
}

// ── Starters ──────────────────────────────────────────────────────────────────
const STARTERS = [
  { icon: Terminal,    label: "Market making bot",     prompt: "Build a TypeScript market making bot for BSV/USDT on OrahDEX — fetch live prices first, then generate a downloadable bot file." },
  { icon: Hash,        label: "BSV transaction",        prompt: "Explain BSV transactions and show me how to build and broadcast one using @bsv/sdk. Include P2PKH, signing, and fee calculation." },
  { icon: Wallet,      label: "EVM wallet inspector",   prompt: "Show me how to inspect an EVM wallet — get native balance, ERC-20 tokens, and recent transactions using ethers.js and viem." },
  { icon: Zap,         label: "DeFi arbitrage bot",     prompt: "Build an arbitrage bot that detects price discrepancies across OrahDEX pairs and executes trades. Use real market data." },
  { icon: Shield,      label: "Smart contract audit",   prompt: "What are the top 10 smart contract vulnerabilities (reentrancy, overflow, access control, etc.) and how do I write secure Solidity?" },
  { icon: Code2,       label: "Swap integration",       prompt: "Show me how to get a swap quote from OrahDEX and execute it — ETH to BSV, 1 ETH. Fetch live prices first, then generate a TypeScript file." },
  { icon: Database,    label: "BSV data indexer",       prompt: "Build a BSV blockchain indexer using the WhatsOnChain API — index transactions, track addresses, and store UTXO sets." },
  { icon: Layers,      label: "DeFi AMM math",          prompt: "Explain Uniswap v2 AMM math: x*y=k, price impact, slippage, impermanent loss. Show the formulas with working JavaScript calculations." },
];

// ── API Reference panel ───────────────────────────────────────────────────────
const API_SECTIONS = [
  {
    label: "Markets",
    items: [
      { method: "GET",    path: "/api/markets",                   desc: "All pairs" },
      { method: "GET",    path: "/api/markets/:symbol/ticker",    desc: "Single ticker" },
      { method: "GET",    path: "/api/markets/:symbol/orderbook", desc: "Order book" },
    ],
  },
  {
    label: "Orders",
    items: [
      { method: "POST",   path: "/api/orders",                    desc: "Place order" },
      { method: "GET",    path: "/api/orders",                    desc: "Open orders" },
      { method: "DELETE", path: "/api/orders/:id",                desc: "Cancel" },
    ],
  },
  {
    label: "Swap / Bridge",
    items: [
      { method: "POST",   path: "/api/swap/quote",                desc: "Get quote" },
      { method: "POST",   path: "/api/swap/execute",              desc: "Execute swap" },
      { method: "POST",   path: "/api/bridge/quote",              desc: "Bridge quote" },
    ],
  },
  {
    label: "BSV",
    items: [
      { method: "GET",    path: "/api/health",                    desc: "Chain status" },
      { method: "GET",    path: "/api/deposit/address/:addr",     desc: "Deposit addr" },
    ],
  },
  {
    label: "Futures",
    items: [
      { method: "GET",    path: "/api/futures/positions",         desc: "Open positions" },
      { method: "POST",   path: "/api/futures/order",             desc: "Place futures order" },
    ],
  },
];

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "text-blue-400 bg-blue-500/10", POST: "text-green-400 bg-green-500/10", DELETE: "text-red-400 bg-red-500/10",
  };
  return <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${colors[method] ?? "text-muted-foreground bg-muted/30"}`}>{method}</span>;
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
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="p-3 space-y-1">
        <div className="text-[10px] text-muted-foreground mb-2 font-mono">base: orahdex.org</div>
        {API_SECTIONS.map(section => (
          <div key={section.label} className="border border-border/30 rounded-lg overflow-hidden">
            <button onClick={() => setExpanded(expanded === section.label ? null : section.label)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold hover:bg-muted/30 transition-colors">
              {section.label}
              {expanded === section.label ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
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

        <div className="mt-3 border border-border/30 rounded-lg p-3">
          <div className="text-xs font-bold mb-2">Keeper Fee Tiers</div>
          {[["Standard","30bps","default"],["Guardian","25bps","1K ORAH"],["Elder","20bps","10K ORAH"],["Archon","15bps","100K ORAH"]].map(([tier,fee,req]) => (
            <div key={tier} className="flex items-center justify-between py-1 border-b border-border/20 last:border-0">
              <span className="text-[11px] text-foreground/80">{tier}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{req}</span>
                <span className="text-[11px] font-mono text-green-400">{fee}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 border border-border/30 rounded-lg p-3">
          <div className="text-xs font-bold mb-1">Blockchain Tools</div>
          {[
            { icon: Hash, label: "BSV Tx Lookup", desc: "Paste any BSV txid" },
            { icon: TrendingUp, label: "Live Market Data", desc: "Real prices & orderbooks" },
            { icon: Wallet, label: "EVM Address", desc: "Balance & transaction history" },
            { icon: Play, label: "Code Execution", desc: "Run JS in secure sandbox" },
            { icon: Link, label: "GitHub Integration", desc: "Read any repo file" },
          ].map(t => (
            <div key={t.label} className="flex items-center gap-2 py-1.5 border-b border-border/20 last:border-0">
              <t.icon className="w-3 h-3 text-green-400 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-foreground/80">{t.label}</p>
                <p className="text-[10px] text-muted-foreground">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 border border-border/30 rounded-lg p-3">
          <div className="text-xs font-bold mb-1">WebSocket</div>
          <div className="font-mono text-[10px] text-muted-foreground break-all">wss://orahdex.org/ws</div>
          <div className="text-[10px] text-muted-foreground mt-1">Channels: ticker, orderbook, trades, portfolio</div>
        </div>
      </div>
    </div>
  );
}

// ── Main DevAI page ───────────────────────────────────────────────────────────
export function DevAIPage() {
  useSEO({
    title: "DevAI — Developer Intelligence | OrahDEX",
    description: "OrahDEX DevAI: build trading bots, analyse BSV transactions, inspect EVM wallets, read GitHub repos, execute code, and generate TypeScript & Python integrations — the blockchain AI for the sovereign DEX.",
    keywords: "OrahDEX API, BSV blockchain AI, crypto trading bot, smart contract, DEX integration, developer AI, BSV developer, EVM wallet, DeFi bot",
  });

  const PERSIST_KEY = "devai:activeConvId";

  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [showApiPanel, setShowApiPanel] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishDone, setPublishDone] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef  = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const didAutoLoad = useRef(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  // Persist active conversation ID across refreshes
  useEffect(() => {
    if (activeId != null) localStorage.setItem(PERSIST_KEY, String(activeId));
    else localStorage.removeItem(PERSIST_KEY);
  }, [activeId]);

  const loadConvs = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await fetch(`${API}/devai/conversations`);
      if (res.ok) {
        const list: Conversation[] = await res.json();
        setConvs(list);
        // Auto-restore last active session on first load
        if (!didAutoLoad.current && list.length > 0) {
          didAutoLoad.current = true;
          const stored = Number(localStorage.getItem(PERSIST_KEY) || "0") || null;
          const target = (stored && list.some(c => c.id === stored)) ? stored : list[0].id;
          setActiveId(target);
          const r = await fetch(`${API}/devai/conversations/${target}`);
          if (r.ok) {
            const data = await r.json();
            setMessages(data.messages.map((m: any) => ({
              id: String(m.id), role: m.role, content: m.content, toolCalls: [], createdAt: new Date(m.createdAt),
            })));
          }
        }
      }
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
        toolCalls: [],
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

  const publish = useCallback(async () => {
    if (publishing) return;
    setPublishing(true);
    setPublishDone(false);
    try {
      await fetch(`${API}/admin/devai/restart`, { method: "POST" });
      setPublishDone(true);
      setTimeout(() => setPublishDone(false), 4000);
    } catch { /* ignore */ } finally {
      setPublishing(false);
    }
  }, [publishing]);

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
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", toolCalls: [], createdAt: new Date() }]);

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
            } else if (data.tool_call) {
              const tc = data.tool_call;
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, toolCalls: [...(m.toolCalls ?? []), { id: tc.id, name: tc.name, args: tc.args, pending: true }] }
                  : m
              ));
            } else if (data.tool_result) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                    ...m,
                    toolCalls: (m.toolCalls ?? []).map(tc =>
                      tc.id === data.tool_result.id ? { ...tc, output: data.tool_result.output, pending: false } : tc
                    ),
                  }
                  : m
              ));
            } else if (data.file) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                    ...m,
                    toolCalls: (m.toolCalls ?? []).map(tc =>
                      tc.id === data.file.id ? { ...tc, file: data.file } : tc
                    ),
                  }
                  : m
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
      // Refresh conversation list to update title
      loadConvs();
    }
  }, [activeId, streaming, newConv, loadConvs]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Left sidebar ──────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-60 xl:w-64 border-r border-border/50 bg-background/50 shrink-0">
        <div className="p-3 border-b border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
              <Code2 className="w-4 h-4 text-black" />
            </div>
            <div>
              <div className="text-sm font-black">DevAI</div>
              <div className="text-[10px] text-muted-foreground">Blockchain Intelligence</div>
            </div>
          </div>
          <button
            onClick={() => { setActiveId(null); setMessages([]); localStorage.removeItem(PERSIST_KEY); didAutoLoad.current = true; }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 hover:border-green-500/40 hover:bg-green-500/5 text-xs font-medium transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> New chat
          </button>
        </div>

        {/* Capabilities */}
        <div className="p-3 border-b border-border/30">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Capabilities</div>
          <div className="space-y-1">
            {[
              { icon: GitBranch,  label: "Read & write GitHub repos" },
              { icon: FolderOpen, label: "Browse project files" },
              { icon: PenLine,    label: "Write & edit any file" },
              { icon: Wrench,     label: "Run shell commands" },
              { icon: Database,   label: "Query live database" },
              { icon: Play,       label: "Execute JavaScript" },
              { icon: Hash,       label: "BSV blockchain lookup" },
              { icon: TrendingUp, label: "Live market data" },
              { icon: Wallet,     label: "EVM address decode" },
              { icon: Download,   label: "Generate files" },
            ].map(c => (
              <div key={c.label} className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
                <c.icon className="w-2.5 h-2.5 text-green-400 shrink-0" />
                {c.label}
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="p-3 border-b border-border/30">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Quick actions</div>
          <div className="space-y-0.5">
            {[
              { label: "Explore codebase",  prompt: "List the workspace root, then show me the backend routes directory and the frontend pages directory." },
              { label: "Query DB schema",   prompt: "Query the database to list all tables and show column names for the most important ones." },
              { label: "Add a feature",     prompt: "Read the current backend routes, then add a new GET /api/status/extended endpoint that returns server uptime, DB connection status, and active market count. Write the changes directly." },
              { label: "Market maker bot",  prompt: "Build a TypeScript market making bot for BSV/USDT. Check live prices first, then write it as a downloadable file." },
              { label: "Install a package", prompt: "Install the 'zod' validation library in the api-server and show me how to use it for request validation." },
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

        {/* Conversations */}
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
                  className={cn(
                    "flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer group transition-colors",
                    activeId === conv.id
                      ? "bg-green-500/10 border border-green-500/30"
                      : "hover:bg-muted/30 border border-transparent"
                  )}
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

      {/* ── Main chat area ─────────────────────────────────────────────────────── */}
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
                Blockchain AI · Build bots · Read repos · Analyse on-chain data · Execute code
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Live tools indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-green-500/20 bg-green-500/5 text-green-400">
              <Activity className="w-3 h-3 animate-pulse" />
              <span className="text-[10px] font-bold">13 live tools</span>
            </div>
            {/* Publish / restart button */}
            <button
              onClick={publish}
              disabled={publishing}
              title="Restart services to apply code changes"
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all",
                publishDone
                  ? "border-green-500/40 bg-green-500/15 text-green-400"
                  : "border-orange-500/30 bg-orange-500/8 text-orange-400 hover:bg-orange-500/15"
              )}
            >
              {publishing
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : publishDone
                  ? <CheckCircle className="w-3 h-3" />
                  : <Upload className="w-3 h-3" />
              }
              {publishing ? "Restarting…" : publishDone ? "Live" : "Publish"}
            </button>
            <button
              onClick={() => setShowApiPanel(v => !v)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all",
                showApiPanel
                  ? "border-green-500/50 bg-green-500/10 text-green-400"
                  : "border-border/50 hover:border-green-500/30 text-muted-foreground hover:text-foreground"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:block">API Ref</span>
            </button>
          </div>
        </div>

        {/* Messages / Empty state */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full max-w-3xl mx-auto text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
                <Code2 className="w-7 h-7 text-black" />
              </div>
              <h2 className="text-xl font-black mb-1">OrahDEX DevAI</h2>
              <p className="text-sm text-muted-foreground mb-2 max-w-md">
                Blockchain AI with real tools — reads your GitHub repos, looks up live BSV transactions, checks EVM wallets, runs code, fetches live market data, and generates downloadable files.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
                {[
                  { icon: GitBranch, label: "GitHub" },
                  { icon: Hash, label: "BSV chain" },
                  { icon: Wallet, label: "EVM" },
                  { icon: Play, label: "Code run" },
                  { icon: TrendingUp, label: "Live markets" },
                  { icon: Download, label: "File gen" },
                ].map(b => (
                  <span key={b.label} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-border/40 text-muted-foreground">
                    <b.icon className="w-2.5 h-2.5 text-green-400" />{b.label}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
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
                <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
                      <Code2 className="w-3.5 h-3.5 text-black" />
                    </div>
                  )}

                  <div className={cn(
                    "max-w-[85%] rounded-xl px-4 py-3",
                    msg.role === "user"
                      ? "bg-green-500/15 border border-green-500/25 text-sm"
                      : "bg-muted/30 border border-border/40 text-foreground/90"
                  )}>
                    {msg.role === "user" ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <>
                        {/* Tool calls */}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="space-y-0.5 mb-2">
                            {msg.toolCalls.map(tc => (
                              tc.name === "create_file" && !tc.pending && tc.file
                                ? <FileDownloadBlock key={tc.id} file={tc.file} />
                                : <ToolCallBlock key={tc.id} tc={tc} />
                            ))}
                          </div>
                        )}

                        {/* Text content */}
                        {msg.content ? (
                          <DevMarkdown text={msg.content} />
                        ) : !msg.toolCalls?.length ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Thinking...
                          </div>
                        ) : (
                          msg.toolCalls.some(tc => tc.pending) && (
                            <div className="flex items-center gap-1.5 text-muted-foreground text-xs mt-1">
                              <Loader2 className="w-3 h-3 animate-spin text-green-400" />
                              Working...
                            </div>
                          )
                        )}
                      </>
                    )}
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
              placeholder="Ask about bots, BSV transactions, EVM wallets, smart contracts, APIs, DeFi..."
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
            Enter to send · Shift+Enter for new line · DevAI has tools: GitHub, BSV chain, EVM, code execution, file generation
          </div>
        </div>
      </div>

      {/* ── Right panel: API Reference ──────────────────────────────────────────── */}
      {showApiPanel && <ApiPanel onClose={() => setShowApiPanel(false)} />}
    </div>
  );
}
