import { useEffect, useState } from "react";
import { Sparkles, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  onAskOra?: (question: string) => void;
}

function triggerOra(question: string) {
  window.dispatchEvent(new CustomEvent("ora:open", { detail: question }));
}

export function AiInsightsBar({ onAskOra }: Props) {
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${BASE}/api/ai/insights`);
        if (!r.ok) throw new Error();
        const data = await r.json();
        const parsed: string[] = JSON.parse(data.insights);
        if (!cancelled) {
          setInsights(parsed.filter(Boolean));
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-rotate insights every 6 seconds
  useEffect(() => {
    if (insights.length <= 1) return;
    const t = setInterval(() => {
      setActiveIdx(i => (i + 1) % insights.length);
    }, 6000);
    return () => clearInterval(t);
  }, [insights]);

  if (error || (!loading && insights.length === 0)) return null;

  return (
    <div className="w-full bg-gradient-to-r from-green-950/60 via-emerald-950/40 to-transparent border-b border-green-500/20 px-4 py-2.5">
      <div className="flex items-center gap-3 max-w-7xl mx-auto">
        {/* Label */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-5 h-5 rounded-full bg-green-400/20 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-green-400" />
          </div>
          <span className="text-[11px] font-semibold text-green-400 uppercase tracking-wider">Ora AI</span>
        </div>

        <div className="w-px h-4 bg-green-500/30 shrink-0" />

        {/* Insight text */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-green-400 animate-spin" />
              <span className="text-xs text-gray-400">Generating market insights...</span>
            </div>
          ) : (
            <div className="relative overflow-hidden h-4">
              {insights.map((insight, i) => (
                <p
                  key={i}
                  className={cn(
                    "absolute inset-0 text-xs text-gray-300 truncate transition-all duration-500",
                    i === activeIdx ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                  )}
                >
                  {insight}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Indicator dots */}
        {insights.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            {insights.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  i === activeIdx ? "bg-green-400 w-3" : "bg-green-400/30"
                )}
              />
            ))}
          </div>
        )}

        {/* Ask Ora CTA */}
        <button
          onClick={() => {
            const q = insights[activeIdx] ?? "Tell me more about current market trends";
            if (onAskOra) onAskOra(q);
            else triggerOra(q);
          }}
          className="shrink-0 flex items-center gap-1 text-[11px] text-green-400 hover:text-green-300 transition-colors font-medium"
        >
          Ask Ora
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
