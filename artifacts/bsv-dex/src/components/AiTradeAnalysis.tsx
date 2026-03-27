import { useState, useEffect } from "react";
import { Bot, Sparkles, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  symbol: string;
  baseAsset?: string;
}

interface AnalysisData {
  analysis: string;
  sentiment?: "bullish" | "bearish" | "neutral";
  signal?: string;
}

function parseMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, '<code class="bg-white/10 px-1 rounded text-[11px] font-mono">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-300">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, "<br/>");
}

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  if (!sentiment) return null;
  const cfg = {
    bullish: { label: "Bullish", icon: TrendingUp, cls: "text-green-400 bg-green-400/10 border-green-400/20" },
    bearish: { label: "Bearish", icon: TrendingDown, cls: "text-red-400 bg-red-400/10 border-red-400/20" },
    neutral: { label: "Neutral", icon: Minus, cls: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  };
  const c = cfg[sentiment as keyof typeof cfg];
  if (!c) return null;
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border", c.cls)}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

export function AiTradeAnalysis({ symbol, baseAsset }: Props) {
  const coin = baseAsset ?? symbol.split(/[-/]/)[0] ?? symbol;
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fetched, setFetched] = useState<string | null>(null);

  useEffect(() => {
    if (coin === fetched) return;
    setData(null);
    setLoading(true);
    const ac = new AbortController();
    Promise.all([
      fetch(`${BASE}/api/ai/market-analysis?symbol=${encodeURIComponent(coin)}`, { signal: ac.signal }),
      fetch(`${BASE}/api/ai/trade-signal?symbol=${encodeURIComponent(coin)}`, { signal: ac.signal }),
    ])
      .then(([ar, sr]) => Promise.all([ar.json(), sr.json()]))
      .then(([a, s]) => {
        setData({ analysis: a.analysis ?? "", signal: s.signal ?? "", sentiment: s.sentiment });
        setFetched(coin);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [coin, fetched]);

  function refresh() {
    setFetched(null);
  }

  return (
    <div className="border border-white/10 rounded-xl bg-[#0a0f0a] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400/20 to-emerald-600/20 flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-green-400" />
        </div>
        <span className="text-sm font-semibold text-white flex-1 text-left">
          Ora AI Analysis
          <span className="text-gray-500 font-normal ml-2 text-xs">· {coin}</span>
        </span>
        {data?.sentiment && !loading && <SentimentBadge sentiment={data.sentiment} />}
        {loading && <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-1.5 h-1.5 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>}
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5">
          {loading ? (
            <div className="py-6 flex flex-col items-center gap-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
              <p className="text-xs text-gray-500">Ora is analyzing {coin}...</p>
            </div>
          ) : data ? (
            <div className="space-y-3 pt-3">
              {/* Signal */}
              {data.signal && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-white/5 border border-white/5">
                  <Sparkles className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-300 leading-relaxed">{data.signal}</p>
                </div>
              )}

              {/* Full analysis */}
              <div
                className="text-xs text-gray-400 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(data.analysis) }}
              />

              {/* Footer */}
              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] text-gray-600">Market education only · Not financial advice</p>
                <button
                  onClick={refresh}
                  className="flex items-center gap-1 text-[11px] text-green-400/60 hover:text-green-400 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-xs text-gray-500">Could not load analysis. <button onClick={refresh} className="text-green-400 hover:underline">Try again</button></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
