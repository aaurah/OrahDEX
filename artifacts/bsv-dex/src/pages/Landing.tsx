import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Zap, Shield, Globe, ExternalLink, Sparkles, Brain, TrendingUp, TrendingDown, Minus, MessageSquare, FlaskConical, Layers, Wallet, Activity, Moon, Sun, Smartphone } from "lucide-react";
import { useThemeStore } from "@/store/useThemeStore";
import { SocialBar } from "@/components/SocialBar";

/* ── Theme cycle helpers ─────────────────────────────────────────────────── */
const LAND_THEME_CYCLE = ["amoled", "dark", "light"] as const;
type LandTheme = typeof LAND_THEME_CYCLE[number];
const LAND_THEME_ICONS: Record<LandTheme, typeof Moon> = { amoled: Smartphone, dark: Moon, light: Sun };
const LAND_THEME_LABELS: Record<LandTheme, string> = { amoled: "AMOLED", dark: "Dark", light: "Light" };

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Animated OrahO sigil — large sovereign version ───────────────────── */
function SovereignSigil({ size = 160 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className="drop-shadow-[0_0_40px_rgba(74,222,128,0.35)]"
    >
      {/* Outer ring */}
      <circle cx="100" cy="100" r="88" stroke="#4ade80" strokeWidth="6" opacity="0.25" />
      {/* Main ring */}
      <circle cx="100" cy="100" r="72" stroke="#4ade80" strokeWidth="10" />
      {/* Gold accent ring */}
      <circle cx="100" cy="100" r="52" stroke="#F5A623" strokeWidth="2" opacity="0.5" />
      {/* Inner pulsing dot — ring 1 */}
      <circle cx="100" cy="100" r="22" fill="#4ade80" opacity="0.15">
        <animate attributeName="r"       from="22" to="60" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.15" to="0"  dur="2.4s" repeatCount="indefinite" />
      </circle>
      {/* Inner pulsing dot — ring 2 (offset) */}
      <circle cx="100" cy="100" r="22" fill="#4ade80" opacity="0.12">
        <animate attributeName="r"       from="22" to="60" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.12" to="0"  dur="2.4s" begin="1.2s" repeatCount="indefinite" />
      </circle>
      {/* Core */}
      <circle cx="100" cy="100" r="20" fill="#4ade80" />
      {/* Gold crosshair marks */}
      <line x1="100" y1="12" x2="100" y2="28" stroke="#F5A623" strokeWidth="2" opacity="0.6" />
      <line x1="100" y1="172" x2="100" y2="188" stroke="#F5A623" strokeWidth="2" opacity="0.6" />
      <line x1="12" y1="100" x2="28" y2="100" stroke="#F5A623" strokeWidth="2" opacity="0.6" />
      <line x1="172" y1="100" x2="188" y2="100" stroke="#F5A623" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}

/* ── Animated background grid ──────────────────────────────────────────── */
function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.04]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#4ade80" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      {/* Radial glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(74,222,128,0.06) 0%, transparent 70%)" }} />
      <div className="absolute top-3/4 left-1/4 w-[400px] h-[400px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(245,166,35,0.05) 0%, transparent 70%)" }} />
    </div>
  );
}

/* ── Keeper tier card ────────────────────────────────────────────────────── */
function KeeperCard({ tier, icon, desc, fee, color }: {
  tier: string; icon: string; desc: string; fee: string; color: string;
}) {
  return (
    <div
      className="relative rounded-2xl border p-6 flex flex-col gap-3 overflow-hidden transition-all hover:scale-[1.02] hover:-translate-y-1 group"
      style={{
        borderColor: `${color}30`,
        background: `linear-gradient(135deg, ${color}08 0%, transparent 60%)`,
      }}
    >
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-opacity"
        style={{ background: color, transform: "translate(30%, -30%)" }} />
      <div className="text-3xl">{icon}</div>
      <div>
        <p className="font-black text-lg tracking-wide" style={{ color }}>{tier}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
      </div>
      <div className="mt-auto pt-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground/60">Maker fee</p>
        <p className="font-bold text-foreground">{fee}</p>
      </div>
    </div>
  );
}

/* ── Architecture phase card ────────────────────────────────────────────── */
function PhaseCard({ phase, title, desc, icon: Icon, active }: {
  phase: number; title: string; desc: string;
  icon: typeof Zap; active?: boolean;
}) {
  return (
    <div className={`relative flex flex-col gap-4 rounded-2xl border p-6 transition-all ${
      active
        ? "border-green-500/40 bg-green-500/5"
        : "border-border bg-card/40 opacity-70"
    }`}>
      {active && (
        <span className="absolute top-4 right-4 text-[9px] font-black px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 uppercase tracking-widest">
          Live
        </span>
      )}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        active ? "bg-green-500/15" : "bg-foreground/5"
      }`}>
        <Icon className={`w-5 h-5 ${active ? "text-green-400" : "text-muted-foreground/50"}`} />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-black text-muted-foreground/60 uppercase tracking-widest">Phase {phase}</span>
        </div>
        <p className={`font-black text-base ${active ? "text-foreground" : "text-muted-foreground"}`}>{title}</p>
        <p className="text-sm text-muted-foreground/70 mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ── Live stat pill ──────────────────────────────────────────────────────── */
function StatPill({ label, value, color = "text-green-400" }: {
  label: string; value: string | number; color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-4 rounded-2xl border border-border bg-card/60 min-w-[120px]">
      <span className={`text-2xl font-black ${color}`}>{value}</span>
      <span className="text-xs text-muted-foreground/60 uppercase tracking-widest font-semibold">{label}</span>
    </div>
  );
}

/* ── Explore Live BSV Block pill ─────────────────────────────────────────── */
function BsvBlockPill({ blockHeight, blockHash }: { blockHeight: number; blockHash?: string }) {
  const explorerUrl = blockHash
    ? `https://whatsonchain.com/block/${blockHash}`
    : `https://whatsonchain.com`;

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col items-center gap-1 px-6 py-4 rounded-2xl border border-green-500/30 bg-green-500/8 hover:bg-green-500/14 hover:border-green-500/50 min-w-[120px] transition-all active:scale-95 cursor-pointer"
    >
      <span className="text-2xl font-black text-green-400 leading-none">
        {blockHeight > 0 ? `#${blockHeight.toLocaleString()}` : "Live"}
      </span>
      <span className="text-xs text-green-500/70 font-semibold flex items-center gap-1">
        BSV Block <ExternalLink className="w-3 h-3" />
      </span>
    </a>
  );
}

/* ── Ora AI section ──────────────────────────────────────────────────────── */
function OraAiSection() {
  const [insights, setInsights] = useState<{ id: number; content: string; sentiment?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Static fallback shown immediately if the AI call takes too long or fails
  const FALLBACK_INSIGHTS = [
    { id: 1, content: "BSV settlement gives OrahDEX sub-cent fees — ideal for high-frequency strategies that bleed out on Ethereum gas.", sentiment: "bullish" },
    { id: 2, content: "Layer-2 volumes continue rising as users chase cheaper execution; watch ARB and BASE for breakout pairs this month.", sentiment: "neutral" },
    { id: 3, content: "DeFi liquidity fragmentation is creating arbitrage windows across 950+ OrahDEX pairs — algo traders watch BSV/USDT spread.", sentiment: "bullish" },
  ];

  useEffect(() => {
    let cancelled = false;

    // 8-second timeout — show fallback if AI is too slow
    const timer = setTimeout(() => {
      if (!cancelled) { setInsights(FALLBACK_INSIGHTS); setLoading(false); }
    }, 8000);

    const controller = new AbortController();
    fetch(`${BASE}/api/ai/insights`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        clearTimeout(timer);
        const raw: unknown[] = Array.isArray(data?.insights) ? data.insights : [];
        if (raw.length > 0) {
          const mapped = raw.slice(0, 3).map((item, i) => {
            // API may return strings or {id, content, sentiment} objects
            if (typeof item === "string") {
              const lower = item.toLowerCase();
              const sentiment = lower.includes("bullish") ? "bullish" : lower.includes("bearish") ? "bearish" : "neutral";
              return { id: i + 1, content: item, sentiment };
            }
            return { id: i + 1, content: String((item as any).content ?? item), sentiment: (item as any).sentiment };
          });
          setInsights(mapped);
        } else {
          setInsights(FALLBACK_INSIGHTS);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { clearTimeout(timer); setInsights(FALLBACK_INSIGHTS); setLoading(false); }
      });

    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, []);

  const sentimentIcon = (s?: string) => {
    if (s === "bullish") return <TrendingUp className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />;
    if (s === "bearish") return <TrendingDown className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />;
    return <Minus className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />;
  };

  const sentimentColor = (s?: string) =>
    s === "bullish" ? "border-green-500/25 bg-green-500/5" :
    s === "bearish" ? "border-red-500/25 bg-red-500/5" :
    "border-white/8 bg-white/3";

  const openOra = () => window.dispatchEvent(new CustomEvent("ora:open", { detail: { message: "Give me today's top market intelligence." } }));

  return (
    <section className="relative px-6 lg:px-10 py-24" style={{ background: "linear-gradient(180deg, rgba(74,222,128,0.02) 0%, transparent 100%)" }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 text-xs font-black text-green-400 uppercase tracking-[0.3em] mb-4">
            <Sparkles className="w-3.5 h-3.5" /> AI Intelligence
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground mb-4">
            Meet <span className="text-green-400">Ora</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Your AI co-pilot for every trade. Ora monitors 950+ markets in real-time,
            generates trade signals, spots emerging patterns, and answers your questions
            instantly — all powered by sovereign intelligence.
          </p>
        </div>

        {/* Capabilities row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            { icon: Brain, label: "Market Intelligence", desc: "Real-time analysis across every pair. Ora spots breakouts, volume surges, and sentiment shifts before they happen.", color: "#4ade80" },
            { icon: TrendingUp, label: "Trade Signals", desc: "Buy, sell, or hold signals for every major pair — with confidence scores and Ora's reasoning behind each call.", color: "#F5A623" },
            { icon: MessageSquare, label: "Always Available", desc: "Ask Ora anything: price targets, portfolio breakdowns, chart explanations, or what a BSV settlement actually means.", color: "#60a5fa" },
          ].map(({ icon: Icon, label, desc, color }) => (
            <div key={label} className="flex flex-col gap-3 p-5 rounded-2xl border border-border bg-card/60 hover:bg-card transition-colors">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                <Icon className="w-4.5 h-4.5" style={{ color }} />
              </div>
              <div>
                <p className="font-bold text-foreground text-sm mb-1">{label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Live insights */}
        <div className="rounded-2xl border border-green-500/15 bg-green-500/4 p-6 mb-8">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="w-4 h-4 text-green-400" />
            <span className="text-sm font-black text-foreground">Live Market Insights</span>
            <span className="ml-auto text-[10px] text-green-500/60 font-bold uppercase tracking-wider">Powered by Ora</span>
          </div>

          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 rounded-xl bg-foreground/4 animate-pulse" />
              ))}
            </div>
          ) : insights.length > 0 ? (
            <div className="flex flex-col gap-3">
              {insights.map(ins => (
                <div key={ins.id} className={`flex items-start gap-3 p-4 rounded-xl border ${sentimentColor(ins.sentiment)}`}>
                  {sentimentIcon(ins.sentiment)}
                  <p className="text-sm text-foreground/80 leading-relaxed">{ins.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card/50">
              <Sparkles className="w-4 h-4 text-green-400 shrink-0" />
              <p className="text-sm text-muted-foreground">Ora is analysing the markets. Insights will appear shortly.</p>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
          <button
            onClick={openOra}
            className="group flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-black transition-all hover:scale-[1.02] hover:shadow-2xl active:scale-95"
            style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)", boxShadow: "0 0 40px rgba(74,222,128,0.3)" }}
          >
            <Sparkles className="w-5 h-5" />
            Chat with Ora
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          <Link
            href="/trade/BSV-USDT"
            className="flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-foreground border border-border hover:bg-card transition-all text-sm"
          >
            View Trade Signals <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Main landing page ───────────────────────────────────────────────────── */
export function LandingPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  const { theme, setTheme } = useThemeStore();

  const safeTheme: LandTheme = (LAND_THEME_CYCLE as readonly string[]).includes(theme)
    ? (theme as LandTheme)
    : "amoled";

  const cycleTheme = () => {
    const idx = LAND_THEME_CYCLE.indexOf(safeTheme);
    setTheme(LAND_THEME_CYCLE[(idx + 1) % LAND_THEME_CYCLE.length]);
  };

  const ThemeIcon = LAND_THEME_ICONS[safeTheme];

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 80);
    return () => clearTimeout(t);
  }, []);

  const { data: bsvStatus } = useQuery({
    queryKey: ["bsv-status"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/bsv-status`);
      return r.ok ? r.json() : { online: false, blockHeight: 0 };
    },
    refetchInterval: 30_000,
  });

  const { data: markets } = useQuery({
    queryKey: ["market-count"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  const marketCount = markets?.length ?? 950;
  const bsvBlock     = bsvStatus?.blockHeight ?? 0;
  const bsvBlockHash = bsvStatus?.bestBlockHash as string | undefined;

  const scrollDown = () => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20">
        <GridBackground />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 lg:px-10 py-5 z-10">
          <div className="flex items-center gap-2 font-black text-xl tracking-tight">
            <svg viewBox="0 0 100 100" className="w-7 h-7 overflow-visible" fill="none">
              {/* Outer O ring — white, no glow */}
              <circle cx="50" cy="50" r="40" stroke="white" strokeWidth="12" fill="none" />
              {/* Pulsing glow around dot */}
              <circle cx="50" cy="50" r="13" fill="#4ade80" opacity="0.7"
                style={{ filter: "blur(2px) drop-shadow(0 0 6px rgba(74,222,128,0.8))" }}>
                <animate attributeName="r"       from="13" to="34" dur="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.7" to="0"  dur="1.2s" repeatCount="indefinite" />
              </circle>
              {/* Center dot with glow */}
              <circle cx="50" cy="50" r="13" fill="#4ade80"
                style={{ filter: "drop-shadow(0 0 5px rgba(74,222,128,0.8)) drop-shadow(0 0 2px rgba(74,222,128,0.8))" }} />
            </svg>
            <span><span className="text-foreground">Orah</span><span className="text-green-400">DEX</span></span>
          </div>
          <div className="flex items-center gap-2.5">
            {bsvBlock > 0 && (
              <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-green-400 border border-green-500/30 px-2.5 py-1 rounded-full bg-green-500/8 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                BSV #{bsvBlock.toLocaleString()}
              </span>
            )}
            {/* Theme toggle */}
            <button
              onClick={cycleTheme}
              title={`Switch theme — current: ${LAND_THEME_LABELS[safeTheme]}`}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-border bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground text-xs font-semibold transition-all"
            >
              <ThemeIcon className="w-3 h-3" />
              <span className="hidden sm:block">{LAND_THEME_LABELS[safeTheme]}</span>
            </button>
            <Link href="/markets" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-lg border border-border hover:border-border/80 bg-card/60">
              Markets
            </Link>
            <Link href="/trade/BSV-USDT" className="text-xs font-bold text-black px-3 py-1 rounded-lg bg-green-400 hover:bg-green-300 transition-all hover:scale-[1.02] shadow-md shadow-green-500/20">
              Launch App
            </Link>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto gap-8">
          {/* Sigil */}
          <div className={`transition-all duration-1000 ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "100ms" }}>
            <SovereignSigil size={140} />
          </div>

          {/* Identity badge */}
          <div className={`transition-all duration-700 ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "200ms" }}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] border"
              style={{ borderColor: "#F5A623cc", color: "#F5A623", background: "rgba(245,166,35,0.08)" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#F5A623" }} />
              Sovereign Decentralized Exchange
            </span>
          </div>

          {/* Headline */}
          <div className={`transition-all duration-700 ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "300ms" }}>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight">
              <span className="text-foreground">Trade means</span>
              <br />
              <span className="text-green-400">DEX.</span>
            </h1>
            <p className="mt-4 text-lg sm:text-xl font-semibold text-muted-foreground">
              Trade as a <span className="text-amber-400 font-bold">Keeper</span>, not a customer.
            </p>
          </div>

          {/* Ritual taglines */}
          <div className={`transition-all duration-700 ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "400ms" }}>
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-0 text-sm font-semibold">
              {["Identity is the engine.", "Execution is a ritual.", "Every trade is a declaration."].map((s, i) => (
                <span key={i} className="flex items-center text-muted-foreground">
                  {i > 0 && <span className="hidden sm:block w-px h-4 bg-border mx-6" />}
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* CTAs */}
          <div className={`flex flex-col sm:flex-row items-center gap-4 transition-all duration-700 ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "500ms" }}>
            <Link
              href="/trade/BSV-USDT"
              className="group flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-base text-black transition-all hover:scale-[1.03] hover:shadow-2xl w-full sm:w-auto justify-center"
              style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)", boxShadow: "0 0 40px rgba(74,222,128,0.3)" }}
            >
              Enter the Exchange
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/markets" className="flex items-center gap-2 px-7 py-4 rounded-2xl font-bold text-sm text-muted-foreground border border-border hover:border-border/70 hover:text-foreground bg-card/60 hover:bg-card transition-all w-full sm:w-auto justify-center">
              View All Markets
              <span className="text-xs font-black text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full border border-green-500/25">
                {marketCount.toLocaleString()}
              </span>
            </Link>
          </div>

          {/* Live stats bar */}
          <div className={`grid grid-cols-2 sm:flex sm:flex-wrap justify-center gap-3 transition-all duration-700 ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "600ms" }}>
            <StatPill label="Markets" value={marketCount.toLocaleString()} />
            <StatPill label="Chains" value="20+" color="text-amber-400" />
            <StatPill label="Settlement" value="BSV" color="text-blue-400" />
            <BsvBlockPill blockHeight={bsvBlock} blockHash={bsvBlockHash} />
          </div>

        </div>
      </section>

      {/* ── PROTOCOL SNAPSHOT ─────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 pb-6 -mt-4">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-2xl border border-border/60 overflow-hidden"
            style={{ background: "radial-gradient(circle at top left, rgba(24,27,43,0.9) 0%, rgba(5,6,10,0.95) 60%)" }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Protocol Snapshot</span>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-green-400 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Online
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-border/40">
              {[
                { label: "Settlement", value: "BSV + OP_RETURN" },
                { label: "Liquidity", value: "AMM + VAMM + OB" },
                { label: "Bridge", value: "HTLC, no custody" },
                { label: "Copy trading", value: "CopyVault ERC4626" },
                { label: "AI layer", value: "Ora (context‑aware)" },
                { label: "Identity", value: "Wallet‑only, no KYC" },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-1 px-4 py-3.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</span>
                  <span className="text-xs font-bold text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE STRIP ─────────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 py-12">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: "Settlement",
              pill: "BSV proofs",
              pillColor: "#4ade80",
              desc: "Every trade, vault rebalance, and bridge event is anchored to BSV as an OP_RETURN settlement proof — immutable, verifiable, and independent of any intermediary.",
            },
            {
              label: "Liquidity",
              pill: "Genesis engine",
              pillColor: "#F5A623",
              desc: "A hybrid of constant-product AMM, virtual AMM, and orderbook routing ensures every listed asset is tradeable — even with few users and no external market makers.",
            },
            {
              label: "CopyVault",
              pill: "Leaders & followers",
              pillColor: "#c084fc",
              desc: "ERC4626-style vaults mirror leader trades on-chain, with BSV proof chains and high-water-mark performance fees — no pooled custody, no opaque risk.",
            },
          ].map(({ label, pill, pillColor, desc }) => (
            <div key={label}
              className="rounded-2xl border border-border bg-card/40 p-5 flex flex-col gap-3 hover:bg-card/60 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">{label}</span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider"
                  style={{ color: pillColor, borderColor: `${pillColor}30`, background: `${pillColor}10` }}>
                  {pill}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── KEEPERS ───────────────────────────────────────────────────────── */}
      <section ref={scrollRef} className="relative px-6 lg:px-10 py-24">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-14">
            <span className="text-xs font-black text-amber-400 uppercase tracking-[0.3em] mb-3 block">
              Identity System
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-foreground mb-4">
              The Keeper Protocol
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
              OrahDEX runs on identity-aware execution. Keepers are sovereign participants
              who gain privileges, reduced fees, and priority routing in exchange for
              staking and contribution. Your identity is your engine.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KeeperCard
              tier="Initiate"
              icon="◎"
              desc="New Keepers enter the registry. Basic trading access, standard fee schedule, open to all wallets."
              fee="0.20%"
              color="#9ca3af"
            />
            <KeeperCard
              tier="Sentinel"
              icon="⬡"
              desc="Proven participants with 30-day history. Enhanced order routing, reduced maker rebate, P2P access."
              fee="0.12%"
              color="#60a5fa"
            />
            <KeeperCard
              tier="Archon"
              icon="◈"
              desc="High-volume Keepers with staked collateral. Identity-aware routing, priority fills, BSV settlement rewards."
              fee="0.06%"
              color="#c084fc"
            />
            <KeeperCard
              tier="Sovereign"
              icon="∞"
              desc="Elite Keepers. Access to AMM liquidity pools, bridge priority, governance votes, and zero maker fees."
              fee="0.00%"
              color="#F5A623"
            />
          </div>

          <div className="mt-8 p-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 flex items-center gap-4">
            <Shield className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="text-amber-400 font-bold">Keeper Registry</span> — A permissionless on-chain registry
              tracks all Keeper tiers. Tier upgrades are automatic, based on volume, stake, and time-in-protocol.
              No whitelist. No gatekeepers. Sovereignty earned, not granted.
            </p>
          </div>
        </div>
      </section>

      {/* ── GENESIS LIQUIDITY ENGINE ──────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 py-24" style={{ background: "linear-gradient(180deg, rgba(245,166,35,0.03) 0%, rgba(74,222,128,0.03) 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] mb-4" style={{ color: "#F5A623" }}>
              <Zap className="w-3.5 h-3.5" /> Genesis Liquidity Engine
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-foreground mb-4">
              Every Coin. Always Tradeable.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
              OrahDEX's Virtual AMM (VAMM) ensures no asset ever has zero liquidity.
              A linear bonding curve provides instant price discovery and trade execution
              for 56+ major assets — embedded directly in the Market Hub.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {[
              {
                icon: Activity,
                title: "Instant Price Discovery",
                desc: "A linear bonding curve prices every asset the moment it's listed. No pools to seed. No makers to recruit.",
                color: "#4ade80",
              },
              {
                icon: FlaskConical,
                title: "Simulated Execution",
                desc: "Trade against the virtual treasury at the bonding curve price. Receipts include Trade ID, timestamp, fee, and curve price.",
                color: "#F5A623",
              },
              {
                icon: Layers,
                title: "Built into the Exchange",
                desc: "The VAMM ⚡ button appears on every coin row in the Market Hub. No separate page, no navigation — trade from where you discover.",
                color: "#60a5fa",
              },
              {
                icon: Wallet,
                title: "EVM + TRON + BSV",
                desc: "Connect any wallet — 20+ EVM networks, TRON (TRX/TRC-20 USDT), or native Bitcoin SV — and access every feature instantly.",
                color: "#c084fc",
              },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title}
                className="relative rounded-2xl border p-6 flex flex-col gap-4 overflow-hidden transition-all hover:scale-[1.02] hover:-translate-y-1 group"
                style={{ borderColor: `${color}30`, background: `linear-gradient(135deg, ${color}08 0%, transparent 60%)` }}
              >
                <div className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity"
                  style={{ background: color, transform: "translate(30%,-30%)" }} />
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <div>
                  <p className="font-black text-foreground text-sm mb-1">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Bonding curve callout */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(245,166,35,0.15)", border: "1px solid rgba(245,166,35,0.3)" }}>
              <Zap className="w-6 h-6 text-amber-400" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-black text-foreground text-sm mb-1">Linear Bonding Curve — Virtual AMM Mathematics</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Price(supply) = spotPrice + slope × supply, where slope = 0.01 × spotPrice² ÷ 8,500.
                Every $8,500 of simulated buy pressure moves the curve price by ~1%. The virtual treasury
                is pre-funded at 3× depth so sell orders always find a bid. Buying $100 of BTC at curve price
                generates a receipt with Trade ID, fee breakdown, and a "where did tokens go?" explanation.
              </p>
            </div>
            <Link
              href="/markets"
              className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-amber-300 border border-amber-500/30 hover:border-amber-400/60 bg-amber-500/10 hover:bg-amber-500/20 transition-all whitespace-nowrap"
            >
              Try VAMM <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── ORA AI ───────────────────────────────────────────────────────── */}
      <OraAiSection />

      {/* ── ARCHITECTURE ──────────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 py-24" style={{ background: "rgba(255,255,255,0.01)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-black text-green-400 uppercase tracking-[0.3em] mb-3 block">
              Hybrid Architecture
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-foreground mb-4">
              Three Phases of Sovereignty
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
              OrahDEX is not a simple DEX. It is a progressive architecture — 
              starting with deep CEX-backed liquidity and Virtual AMM price discovery,
              evolving to full on-chain AMM pools, and culminating in a sovereign BSV↔EVM bridge.
            </p>
          </div>

          {/* Phase cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <PhaseCard
              phase={1}
              title="CEX-Backed + VAMM Liquidity"
              desc="Deep order books powered by connected CEX venues plus Genesis VAMM bonding curves for instant guaranteed liquidity on 56+ assets."
              icon={Globe}
              active
            />
            <PhaseCard
              phase={2}
              title="On-Chain AMM Pools"
              desc="Keeper-governed automated market makers. Permissionless pool creation. Identity-aware routing for optimal fills."
              icon={Zap}
              active
            />
            <PhaseCard
              phase={3}
              title="BSV↔EVM Bridge"
              desc="Native bridge between Bitcoin SV and EVM chains. All settlements finalize on BSV — fastest, cheapest, permanent."
              icon={Shield}
              active
            />
          </div>

          {/* Architecture flow diagram */}
          <div className="rounded-2xl border border-border bg-card/40 p-6 overflow-x-auto">
            <div className="flex items-center justify-center gap-2 min-w-[480px] text-xs font-bold">
              {[
                { label: "Your Wallet", sub: "EVM · TRON · BSV", color: "#4ade80" },
                null,
                { label: "OrahDEX Engine", sub: "Keeper routing + VAMM", color: "#F5A623" },
                null,
                { label: "CEX Venues", sub: "Binance / OKX / Bybit", color: "#60a5fa" },
                null,
                { label: "BSV Chain", sub: "Final settlement", color: "#4ade80" },
              ].map((item, i) =>
                item === null ? (
                  <div key={i} className="flex-1 max-w-[60px] flex items-center">
                    <div className="w-full h-px bg-border" />
                    <div className="w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-4 border-l-border" />
                  </div>
                ) : (
                  <div key={i} className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border min-w-[110px] text-center"
                    style={{ borderColor: `${item.color}30`, background: `${item.color}08` }}>
                    <span style={{ color: item.color }}>{item.label}</span>
                    <span className="text-[10px] text-muted-foreground/50 font-normal">{item.sub}</span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── DECLARATION ───────────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 py-32">
        <GridBackground />
        <div className="relative z-10 max-w-4xl mx-auto text-center flex flex-col items-center gap-8">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(74,222,128,0.15), rgba(245,166,35,0.1))", border: "1px solid rgba(74,222,128,0.2)" }}>
            <SovereignSigil size={50} />
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground/60 text-sm uppercase tracking-[0.3em] font-bold">The Declaration</p>
            <blockquote className="text-2xl sm:text-3xl font-black leading-snug text-foreground">
              "We do not build exchanges.<br />
              <span className="text-green-400">We build thresholds.</span>"
            </blockquote>
            <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed mt-2">
              OrahDEX is a sovereign exchange where every participant is a Keeper,
              every trade is an act of financial sovereignty, and settlement lives
              permanently on Bitcoin SV.
            </p>
          </div>

          <Link
            href="/trade/BSV-USDT"
            className="group flex items-center gap-3 px-10 py-5 rounded-2xl font-black text-lg text-black transition-all hover:scale-[1.02] hover:shadow-2xl"
            style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)", boxShadow: "0 0 60px rgba(74,222,128,0.25)" }}
          >
            Enter the Sovereign Exchange
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>

          <div className="flex items-center gap-6 text-xs text-muted-foreground/50 font-semibold">
            <Link href="/markets" className="hover:text-muted-foreground transition-colors">Markets</Link>
            <span>·</span>
            <Link href="/whitepaper" className="hover:text-muted-foreground transition-colors">Whitepaper</Link>
            <span>·</span>
            <Link href="/p2p" className="hover:text-muted-foreground transition-colors">P2P</Link>
            <span>·</span>
            <Link href="/bridge" className="hover:text-muted-foreground transition-colors">Bridge</Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-muted-foreground transition-colors">Terms</Link>
          </div>
          <SocialBar iconSize="sm" variant="landing" className="max-w-sm" />
          <p className="text-[11px] text-muted-foreground/30">
            © {new Date().getFullYear()} OrahDEX · orahdex.org · Trade means DEX
          </p>
        </div>
      </section>
    </div>
  );
}

