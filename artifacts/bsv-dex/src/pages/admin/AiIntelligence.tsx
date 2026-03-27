import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain, Zap, RefreshCw, Play, CheckCircle, XCircle, Clock,
  TrendingUp, TrendingDown, Minus, MessageSquare, BarChart3,
  Settings, Cpu, Activity, ChevronDown, ChevronUp, ArrowRightLeft,
  Loader2, Sparkles, AlertCircle, Bot, ToggleLeft, ToggleRight,
  FlaskConical, Send, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── helpers ──────────────────────────────────────────────────────────────── */
const DEMO_PAIRS = [
  "BSV/USDT", "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT",
  "DOGE/USDT", "ADA/USDT", "AVAX/USDT", "DOT/USDT", "MATIC/USDT",
];

const SIGNAL_PAIRS = ["BSV/USDT", "BTC/USDT", "ETH/USDT", "SOL/USDT", "DOGE/USDT"];

const AI_MODELS = [
  { id: "gpt-5-mini",  label: "GPT-5 Mini",  desc: "Fast, cost-effective — Ora default" },
  { id: "gpt-5",       label: "GPT-5",        desc: "Balanced general-purpose" },
  { id: "gpt-5.2",     label: "GPT-5.2",      desc: "Most capable general model" },
];

type DemoTradeResult = {
  pair: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  status: "pending" | "placed" | "filled" | "error";
  orderId?: string;
  txid?: string;
  error?: string;
  aiSignal?: string;
  aiSentiment?: "bullish" | "bearish" | "neutral";
  timeMs?: number;
};

function SentimentBadge({ s }: { s?: string }) {
  if (!s) return null;
  const map: Record<string, string> = {
    bullish: "text-green-400 bg-green-400/10 border-green-400/20",
    bearish: "text-red-400 bg-red-400/10 border-red-400/20",
    neutral: "text-gray-400 bg-gray-400/10 border-gray-400/20",
  };
  const Icon = s === "bullish" ? TrendingUp : s === "bearish" ? TrendingDown : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-wider", map[s] ?? map.neutral)}>
      <Icon className="w-3 h-3" />
      {s}
    </span>
  );
}

function StatusIcon({ status }: { status: DemoTradeResult["status"] }) {
  if (status === "pending") return <Clock className="w-4 h-4 text-gray-400 animate-spin" />;
  if (status === "placed")  return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
  if (status === "filled")  return <CheckCircle className="w-4 h-4 text-green-400" />;
  return <XCircle className="w-4 h-4 text-red-400" />;
}

/* ── AI Insights Card ─────────────────────────────────────────────────────── */
function AiInsightsCard() {
  const qc = useQueryClient();
  const { data, isFetching } = useQuery({
    queryKey: ["admin-ai-insights"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/ai/insights`);
      return r.json();
    },
    staleTime: 0,
  });

  const insights: string[] = (() => {
    try { return JSON.parse(data?.insights ?? "[]"); } catch { return []; }
  })();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-ai-insights"] });
    fetch(`${BASE}/api/ai/insights?bust=${Date.now()}`);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-green-400/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-bold">Live AI Insights</p>
            <p className="text-xs text-muted-foreground">Ora's current market read · 10-min cache</p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={isFetching}
          className="p-2 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin text-green-400")} />
        </button>
      </div>
      {insights.length === 0 && !isFetching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <AlertCircle className="w-4 h-4" /> No insights loaded yet — click refresh
        </div>
      )}
      {isFetching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin text-green-400" /> Generating fresh insights with Ora…
        </div>
      )}
      <div className="space-y-2">
        {insights.map((ins, i) => (
          <div key={i} className="flex gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-green-400/15 text-green-400 text-[10px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
            <p className="text-sm text-muted-foreground leading-relaxed">{ins}</p>
          </div>
        ))}
      </div>
      {data?.cached && (
        <p className="text-[11px] text-muted-foreground">Serving cached response — next refresh in ~10 min</p>
      )}
    </div>
  );
}

/* ── AI Trade Signals Card ────────────────────────────────────────────────── */
function AiTradeSignalsCard() {
  const [signals, setSignals] = useState<Record<string, { signal: string; sentiment: string; loading: boolean }>>({});

  const fetchSignal = async (sym: string) => {
    setSignals(s => ({ ...s, [sym]: { ...s[sym], loading: true } }));
    try {
      const r = await fetch(`${BASE}/api/ai/trade-signal?symbol=${sym.replace("/", "%2F")}`);
      const d = await r.json();
      setSignals(s => ({ ...s, [sym]: { signal: d.signal, sentiment: d.sentiment, loading: false } }));
    } catch {
      setSignals(s => ({ ...s, [sym]: { signal: "Error fetching signal", sentiment: "neutral", loading: false } }));
    }
  };

  const fetchAll = () => SIGNAL_PAIRS.forEach(p => fetchSignal(p));

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-violet-400/10 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-bold">AI Trade Signals</p>
            <p className="text-xs text-muted-foreground">Real-time directional reads per pair</p>
          </div>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-400/10 hover:bg-violet-400/20 border border-violet-400/20 text-violet-400 text-xs font-semibold transition-colors"
        >
          <Zap className="w-3.5 h-3.5" />
          Refresh All
        </button>
      </div>
      <div className="space-y-2">
        {SIGNAL_PAIRS.map(sym => {
          const sig = signals[sym];
          return (
            <div key={sym} className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
              <span className="shrink-0 text-xs font-mono font-bold text-foreground bg-white/8 px-2 py-1 rounded-lg mt-0.5">{sym}</span>
              <div className="flex-1 min-w-0">
                {sig?.loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />}
                {!sig?.loading && sig?.signal && (
                  <div className="space-y-1">
                    <SentimentBadge s={sig.sentiment} />
                    <p className="text-xs text-muted-foreground leading-relaxed">{sig.signal}</p>
                  </div>
                )}
                {!sig && <p className="text-xs text-muted-foreground">— click Refresh All to load</p>}
              </div>
              <button
                onClick={() => fetchSignal(sym)}
                className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Demo Trade Runner ────────────────────────────────────────────────────── */
const DEMO_WALLET = "0xDEMO_AI_TRADER_0000000000000000000001";

function DemoTradeRunner() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DemoTradeResult[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const abortRef = useRef(false);

  async function runDemoTrades() {
    abortRef.current = false;
    setRunning(true);
    const initial: DemoTradeResult[] = DEMO_PAIRS.map(pair => ({
      pair, side: Math.random() > 0.5 ? "buy" : "sell", qty: 0, price: 0, status: "pending",
    }));
    setResults(initial);

    for (let i = 0; i < DEMO_PAIRS.length; i++) {
      if (abortRef.current) break;
      const pair = DEMO_PAIRS[i];

      try {
        const start = Date.now();

        // 1. Fetch AI signal for this pair
        const sigResp = await fetch(`${BASE}/api/ai/trade-signal?symbol=${pair.replace("/", "%2F")}`);
        const sigData = await sigResp.json();
        const side: "buy" | "sell" = sigData.sentiment === "bearish" ? "sell" : "buy";

        // 2. Fetch current price from ticker
        const tickResp = await fetch(`${BASE}/api/markets/${encodeURIComponent(pair)}/ticker`);
        const tickData = tickResp.ok ? await tickResp.json() : null;
        const price = tickData?.last ?? tickData?.price ?? 1.0;
        const qty   = parseFloat((10 / price).toFixed(6)); // ~$10 notional

        setResults(r => r.map(t => t.pair === pair ? { ...t, side, qty, price, status: "placed", aiSignal: sigData.signal, aiSentiment: sigData.sentiment } : t));

        // 3. Place the demo order
        const orderResp = await fetch(`${BASE}/api/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: DEMO_WALLET,
            symbol: pair,
            side,
            type: "market",
            quantity: qty.toString(),
            networkType: "evm",
          }),
        });

        const orderData = orderResp.ok ? await orderResp.json() : null;
        const timeMs = Date.now() - start;

        setResults(r => r.map(t => t.pair === pair ? {
          ...t,
          status: orderData?.id ? "filled" : "error",
          orderId: orderData?.id,
          txid: orderData?.txid,
          timeMs,
          error: !orderData?.id ? "Order placement failed" : undefined,
        } : t));

        // small delay between pairs
        await new Promise(res => setTimeout(res, 400));
      } catch (err: any) {
        setResults(r => r.map(t => t.pair === pair ? { ...t, status: "error", error: err?.message ?? "Unknown error" } : t));
      }
    }
    setRunning(false);
  }

  function stopDemo() {
    abortRef.current = true;
    setRunning(false);
  }

  const filled  = results.filter(r => r.status === "filled").length;
  const errors  = results.filter(r => r.status === "error").length;
  const pending = results.filter(r => r.status === "pending" || r.status === "placed").length;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-400/10 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold">AI Demo Trade Runner</p>
            <p className="text-xs text-muted-foreground">Ora analyses each pair then places a $10 test order · demo wallet</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <button onClick={stopDemo} className="px-3 py-1.5 rounded-lg bg-red-400/10 hover:bg-red-400/20 border border-red-400/20 text-red-400 text-xs font-semibold transition-colors">
              Stop
            </button>
          )}
          <button
            onClick={runDemoTrades}
            disabled={running}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-all",
              running
                ? "bg-white/5 text-muted-foreground cursor-not-allowed"
                : "bg-amber-400 text-black hover:bg-amber-300 hover:scale-[1.02]"
            )}
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Running…" : "Run Demo Trades"}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-400/10 border border-green-400/20 text-green-400 text-xs font-bold">
              <CheckCircle className="w-3.5 h-3.5" />
              {filled} Filled
            </span>
            {errors > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-400/10 border border-red-400/20 text-red-400 text-xs font-bold">
                <XCircle className="w-3.5 h-3.5" />
                {errors} Error{errors > 1 ? "s" : ""}
              </span>
            )}
            {pending > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-400/10 border border-blue-400/20 text-blue-400 text-xs font-bold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {pending} In progress
              </span>
            )}
          </div>

          {/* Results table */}
          <div className="space-y-2">
            {results.map(r => (
              <div key={r.pair} className="rounded-xl border border-white/5 overflow-hidden">
                <button
                  onClick={() => setExpanded(e => e === r.pair ? null : r.pair)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-white/3 transition-colors text-left"
                >
                  <StatusIcon status={r.status} />
                  <span className="font-mono text-sm font-bold text-foreground min-w-[110px]">{r.pair}</span>
                  <span className={cn("px-2 py-0.5 rounded text-[11px] font-bold uppercase", r.side === "buy" ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400")}>
                    {r.side}
                  </span>
                  {r.qty > 0 && <span className="text-xs text-muted-foreground">{r.qty} @ ${r.price?.toLocaleString()}</span>}
                  <SentimentBadge s={r.aiSentiment} />
                  {r.timeMs && <span className="ml-auto text-xs text-muted-foreground">{r.timeMs}ms</span>}
                  {expanded === r.pair ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />}
                </button>
                {expanded === r.pair && (
                  <div className="px-4 pb-3 pt-1 border-t border-white/5 space-y-1.5 text-xs text-muted-foreground bg-white/2">
                    {r.aiSignal && <p><span className="text-foreground font-semibold">Ora signal:</span> {r.aiSignal}</p>}
                    {r.orderId && <p><span className="text-foreground font-semibold">Order ID:</span> <span className="font-mono">{r.orderId}</span></p>}
                    {r.txid && <p><span className="text-foreground font-semibold">BSV txid:</span> <a href={`https://whatsonchain.com/tx/${r.txid}`} target="_blank" rel="noreferrer" className="text-green-400 hover:underline font-mono">{r.txid?.slice(0, 32)}…</a></p>}
                    {r.error && <p className="text-red-400"><span className="font-semibold">Error:</span> {r.error}</p>}
                    {r.status === "pending" && <p className="text-blue-400">Waiting for AI analysis…</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Model Settings Card ──────────────────────────────────────────────────── */
function AiModelSettings() {
  const [model, setModel] = useState("gpt-5-mini");
  const [enabled, setEnabled] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);

  const SYSTEM_PREVIEW = `You are Ora — the AI Trading Intelligence of OrahDEX, a sovereign decentralized exchange where every coin is listed and every trade settles on BSV (Bitcoin SV) blockchain.

Your personality: Calm, knowledgeable, and direct. You speak like an experienced market analyst.

What you know: BSV settlement, Keeper Protocol tiers, 933+ markets across 20+ chains, Uniswap/PancakeSwap DEX pools, DeFi, Gaming, AI/DePIN, Meme, RWA, BRC-20 and more.`;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-blue-400/10 flex items-center justify-center">
          <Settings className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-bold">Ora AI Settings</p>
          <p className="text-xs text-muted-foreground">Model, persona, and feature toggles</p>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/5">
        <div>
          <p className="text-sm font-semibold">AI Assistant (Ora)</p>
          <p className="text-xs text-muted-foreground">Floating chat widget and market insights bar</p>
        </div>
        <button onClick={() => setEnabled(e => !e)} className="transition-colors">
          {enabled
            ? <ToggleRight className="w-8 h-8 text-green-400" />
            : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
        </button>
      </div>

      {/* Model selector */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Active Model</p>
        <div className="space-y-2">
          {AI_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                model === m.id
                  ? "border-primary/40 bg-primary/8 text-foreground"
                  : "border-white/5 bg-white/2 text-muted-foreground hover:bg-white/4"
              )}
            >
              <Cpu className={cn("w-4 h-4 shrink-0", model === m.id ? "text-primary" : "")} />
              <div>
                <p className={cn("text-sm font-bold", model === m.id ? "text-foreground" : "")}>{m.label}</p>
                <p className="text-xs">{m.desc}</p>
              </div>
              {model === m.id && <CheckCircle className="w-4 h-4 text-primary ml-auto" />}
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
          {showPrompt ? "Hide" : "View"} Ora system prompt
          {showPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showPrompt && (
          <pre className="mt-2 p-3 rounded-xl bg-black/40 border border-white/5 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">
            {SYSTEM_PREVIEW}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ── Conversation Stats ───────────────────────────────────────────────────── */
function ConversationStats() {
  const { data } = useQuery({
    queryKey: ["admin-ai-conv-stats"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/admin/stats`);
      return r.json();
    },
    refetchInterval: 30000,
  });

  const cards = [
    { label: "Total Conversations", value: data?.aiConversations ?? "—", icon: MessageSquare, color: "text-blue-400 bg-blue-400/10" },
    { label: "Messages Exchanged", value: data?.aiMessages ?? "—", icon: Send, color: "text-green-400 bg-green-400/10" },
    { label: "Insights Generated", value: data?.aiInsights ?? "—", icon: Sparkles, color: "text-amber-400 bg-amber-400/10" },
    { label: "Signals Served", value: data?.aiSignals ?? "—", icon: Activity, color: "text-violet-400 bg-violet-400/10" },
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

/* ── Chat Tester ──────────────────────────────────────────────────────────── */
function AiChatTester() {
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: q }]);
    setStreaming(true);

    try {
      let cId = convId;
      if (!cId) {
        const r = await fetch(`${BASE}/api/ai/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const d = await r.json();
        cId = d.id;
        setConvId(cId);
      }

      setMessages(m => [...m, { role: "assistant", content: "" }]);

      abortRef.current = new AbortController();
      const resp = await fetch(`${BASE}/api/ai/conversations/${cId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: q }),
        signal: abortRef.current.signal,
      });

      const reader = resp.body!.getReader();
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
          const payload = JSON.parse(line.slice(6));
          if (payload.content) {
            setMessages(m => {
              const copy = [...m];
              copy[copy.length - 1] = { role: "assistant", content: (copy[copy.length - 1].content) + payload.content };
              return copy;
            });
          }
          if (payload.done) break;
        }
      }
    } catch {
      // swallow abort errors
    }
    setStreaming(false);
  }

  const QUICK = ["What's the outlook for BSV?", "Explain Keeper Protocol tiers", "Best DeFi strategy for March 2026?", "Compare Uniswap v3 vs PancakeSwap"];

  return (
    <div className="bg-card border border-border rounded-2xl flex flex-col" style={{ height: 480 }}>
      <div className="p-4 border-b border-border flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-green-400/15 flex items-center justify-center">
          <Bot className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-bold">Chat with Ora</p>
          <p className="text-xs text-muted-foreground">{convId ? `Conv #${convId}` : "New conversation · responds as Ora"}</p>
        </div>
        {convId && (
          <button onClick={() => { setConvId(null); setMessages([]); }} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors">
            New chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-green-400/10 border border-green-400/20 flex items-center justify-center">
              <Bot className="w-6 h-6 text-green-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">Ask Ora anything</p>
              <p className="text-xs text-muted-foreground mt-1">Test the AI assistant directly from the admin panel</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {QUICK.map(q => (
                <button key={q} onClick={() => { setInput(q); }} className="text-xs px-3 py-1.5 rounded-full border border-white/10 hover:border-primary/30 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-all">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-green-400/15 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-green-400" />
              </div>
            )}
            <div className={cn(
              "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
              m.role === "user" ? "bg-primary text-black font-medium rounded-br-md" : "bg-white/5 border border-white/8 rounded-bl-md"
            )}>
              {m.content || (streaming && i === messages.length - 1 ? <span className="inline-block w-2 h-4 bg-green-400 animate-pulse rounded-sm" /> : "…")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask Ora a market question…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/40 transition-colors placeholder:text-muted-foreground"
          />
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className={cn(
              "p-2.5 rounded-xl transition-all",
              input.trim() && !streaming ? "bg-primary text-black hover:bg-primary/90" : "bg-white/5 text-muted-foreground cursor-not-allowed"
            )}
          >
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export function AdminAiIntelligence() {
  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Brain className="w-6 h-6 text-green-400" />
          AI Intelligence
        </h2>
        <p className="text-muted-foreground text-sm">Ora AI — model settings, live insights, trade signals, and demo trading</p>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 p-4 bg-green-400/5 border border-green-400/20 rounded-xl">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <div>
          <span className="text-sm font-semibold text-green-400">Ora AI Online</span>
          <span className="text-xs text-muted-foreground ml-3">Model: gpt-5-mini · SSE streaming · 10-min insight cache</span>
        </div>
      </div>

      {/* Stats */}
      <ConversationStats />

      {/* Two columns */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <AiModelSettings />
          <AiInsightsCard />
        </div>
        <div className="space-y-6">
          <AiTradeSignalsCard />
        </div>
      </div>

      {/* Demo Trade Runner — full width */}
      <DemoTradeRunner />

      {/* Chat tester — full width */}
      <AiChatTester />
    </div>
  );
}
