import { useState, useEffect } from "react";
import { Bot, Sparkles, TrendingUp, TrendingDown, Minus, Shield, AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Holding {
  symbol: string;
  valueUSD: number;
  pct: number;
}

interface PortfolioAnalysis {
  score: number;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  bullets: string[];
  sentiment: "bullish" | "bearish" | "neutral";
}

interface Props {
  holdings: Holding[];
  totalValueUSD: number;
}

function parseMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, '<code class="bg-white/10 px-1 rounded text-[10px] font-mono">$1</code>');
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const cfg = {
    bullish: { label: "Bullish", icon: TrendingUp, cls: "text-green-400 bg-green-400/10 border-green-400/20" },
    bearish: { label: "Bearish", icon: TrendingDown, cls: "text-red-400 bg-red-400/10 border-red-400/20" },
    neutral: { label: "Neutral", icon: Minus, cls: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  };
  const c = cfg[sentiment as keyof typeof cfg] ?? cfg.neutral;
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", c.cls)}>
      <Icon className="w-3 h-3" /> {c.label}
    </span>
  );
}

function RiskBadge({ level }: { level: string }) {
  const cfg = {
    low:    { label: "Low Risk",    icon: Shield,        cls: "text-green-400 bg-green-400/10 border-green-400/20" },
    medium: { label: "Medium Risk", icon: AlertTriangle, cls: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
    high:   { label: "High Risk",   icon: AlertTriangle, cls: "text-red-400 bg-red-400/10 border-red-400/20" },
  };
  const c = cfg[level as keyof typeof cfg] ?? cfg.medium;
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", c.cls)}>
      <Icon className="w-3 h-3" /> {c.label}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 24;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 70 ? "#4ade80" : score >= 45 ? "#facc15" : "#f87171";
  return (
    <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
      <svg width="64" height="64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <span className="absolute text-base font-black" style={{ color }}>{score}</span>
    </div>
  );
}

export function AiPortfolioAnalysis({ holdings, totalValueUSD }: Props) {
  const [data, setData] = useState<PortfolioAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lastHoldings, setLastHoldings] = useState<string>("");

  const fetchAnalysis = async () => {
    if (!holdings.length || totalValueUSD < 0.01) return;
    const key = holdings.map(h => `${h.symbol}:${h.pct.toFixed(1)}`).sort().join(",");
    if (key === lastHoldings && data) return;

    setLoading(true);
    try {
      const r = await fetch(
        `${BASE}/api/ai/portfolio-analysis?holdings=${encodeURIComponent(JSON.stringify(holdings.slice(0, 10)))}`,
      );
      if (!r.ok) throw new Error();
      const d = await r.json();
      setData(d);
      setLastHoldings(key);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (holdings.length > 0 && totalValueUSD > 0) fetchAnalysis();
  }, [holdings.length, totalValueUSD]);

  if (!holdings.length || totalValueUSD < 0.01) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden mt-4">
      <button
        onClick={() => { setExpanded(e => !e); if (!data && !loading) fetchAnalysis(); }}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-600/20 border border-green-500/30 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-green-400" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-green-400" /> Ora AI Portfolio Review
          </p>
          <p className="text-[10px] text-muted-foreground">
            {data ? data.summary : "AI analysis of your current holdings"}
          </p>
        </div>
        {loading ? (
          <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
        ) : expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/40">
          {loading && !data && (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-xs">Analyzing your portfolio...</span>
            </div>
          )}

          {data && (
            <div className="pt-3 space-y-3">
              {/* Score + badges row */}
              <div className="flex items-center gap-4">
                <ScoreRing score={data.score} />
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground font-medium">Portfolio Health</p>
                  <div className="flex flex-wrap gap-1.5">
                    <RiskBadge level={data.riskLevel} />
                    <SentimentBadge sentiment={data.sentiment} />
                  </div>
                </div>
              </div>

              {/* Bullets */}
              {data.bullets.length > 0 && (
                <div className="space-y-1.5">
                  {data.bullets.map((b, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-green-400 mt-0.5 shrink-0 text-[11px]">·</span>
                      <p
                        className="text-[12px] text-muted-foreground leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: parseMarkdown(b) }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Refresh */}
              <button
                onClick={() => { setLastHoldings(""); fetchAnalysis(); }}
                disabled={loading}
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-green-400 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                Refresh analysis
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
