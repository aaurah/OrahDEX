import { useState, useEffect, useRef } from "react";
import { Newspaper, TrendingUp, TrendingDown, Minus, RefreshCw, Sparkles, ChevronDown, ChevronUp, Zap, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface NewsSentimentData {
  sentiment: "bullish" | "bearish" | "neutral";
  sentimentScore: number;
  narratives: string[];
  catalyst: string | null;
  risk: string | null;
}

interface Props {
  symbol: string;
  defaultExpanded?: boolean;
}

function SentimentBar({ score }: { score: number }) {
  const pct = Math.round(((score + 100) / 200) * 100);
  const color = score > 20 ? "#4ade80" : score < -20 ? "#f87171" : "#facc15";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-muted-foreground w-8 text-right">Bear</span>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[9px] text-muted-foreground w-8">Bull</span>
    </div>
  );
}

function SentimentIcon({ sentiment }: { sentiment: string }) {
  if (sentiment === "bullish") return <TrendingUp className="w-3.5 h-3.5 text-green-400" />;
  if (sentiment === "bearish") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-yellow-400" />;
}

function sentimentColor(s: string) {
  if (s === "bullish") return "text-green-400";
  if (s === "bearish") return "text-red-400";
  return "text-yellow-400";
}

export function AiNewsSentiment({ symbol, defaultExpanded = false }: Props) {
  const [data, setData] = useState<NewsSentimentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSentiment = async (sym: string) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const r = await fetch(
        `${BASE}/api/ai/news-sentiment?symbol=${encodeURIComponent(sym)}`,
        { signal: abortRef.current.signal },
      );
      if (!r.ok) throw new Error();
      const d = await r.json();
      setData(d);
      setFetchedFor(sym);
    } catch (e: any) {
      if (e?.name !== "AbortError") setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (symbol !== fetchedFor) {
      setData(null);
      if (expanded) fetchSentiment(symbol);
    }
  }, [symbol]);

  useEffect(() => {
    if (expanded && !data && !loading) fetchSentiment(symbol);
  }, [expanded]);

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
          <Newspaper className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-blue-400" />
            AI News & Sentiment
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {data
              ? <span className={sentimentColor(data.sentiment)}>
                  {data.sentiment.charAt(0).toUpperCase() + data.sentiment.slice(1)} · {data.narratives[0]?.slice(0, 50)}…
                </span>
              : `${symbol} market narratives & sentiment`}
          </p>
        </div>
        {loading ? (
          <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
        ) : expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/40">
          {loading && !data && (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-xs">Generating {symbol} sentiment report…</span>
            </div>
          )}

          {data && (
            <div className="pt-3 space-y-3">
              {/* Sentiment header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <SentimentIcon sentiment={data.sentiment} />
                  <span className={cn("text-xs font-bold capitalize", sentimentColor(data.sentiment))}>
                    {data.sentiment}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({data.sentimentScore > 0 ? "+" : ""}{data.sentimentScore})
                  </span>
                </div>
                <button
                  onClick={() => { setFetchedFor(null); setData(null); fetchSentiment(symbol); }}
                  disabled={loading}
                  className="text-[10px] text-muted-foreground hover:text-blue-400 flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                  Refresh
                </button>
              </div>

              {/* Sentiment bar */}
              <SentimentBar score={data.sentimentScore} />

              {/* Narratives */}
              <div className="space-y-2">
                {data.narratives.map((n, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-blue-400/60 mt-0.5 shrink-0 text-[11px] font-bold">{i + 1}.</span>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">{n}</p>
                  </div>
                ))}
              </div>

              {/* Catalyst & Risk */}
              {(data.catalyst || data.risk) && (
                <div className="grid grid-cols-1 gap-1.5 pt-1">
                  {data.catalyst && (
                    <div className="flex gap-2 items-start bg-green-500/5 border border-green-500/15 rounded-lg px-2.5 py-2">
                      <Zap className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[9px] font-bold text-green-400 uppercase tracking-wide mb-0.5">Catalyst</p>
                        <p className="text-[11px] text-muted-foreground">{data.catalyst}</p>
                      </div>
                    </div>
                  )}
                  {data.risk && (
                    <div className="flex gap-2 items-start bg-red-500/5 border border-red-500/15 rounded-lg px-2.5 py-2">
                      <AlertCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[9px] font-bold text-red-400 uppercase tracking-wide mb-0.5">Risk</p>
                        <p className="text-[11px] text-muted-foreground">{data.risk}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-[9px] text-muted-foreground/50">AI-generated analysis · not financial advice</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
