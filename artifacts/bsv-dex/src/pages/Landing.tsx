import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BrandLogo } from "@/components/BrandLogo";
import { ArrowRight, Zap, Shield, Globe, ExternalLink, Sparkles, Brain, TrendingUp, TrendingDown, Minus, MessageSquare, FlaskConical, Layers, Wallet, Activity, Moon, Sun, Smartphone } from "lucide-react";
import { useThemeStore } from "@/store/useThemeStore";
import { SocialBar } from "@/components/SocialBar";
import { API_BASE } from "@/lib/api";
import { useSEO } from "@/hooks/useSEO";

/* ── Theme cycle helpers ─────────────────────────────────────────────────── */
const LAND_THEME_CYCLE = ["amoled", "dark", "light"] as const;
type LandTheme = typeof LAND_THEME_CYCLE[number];
const LAND_THEME_ICONS: Record<LandTheme, typeof Moon> = { amoled: Smartphone, dark: Moon, light: Sun };
const LAND_THEME_LABELS: Record<LandTheme, string> = { amoled: "AMOLED", dark: "Dark", light: "Light" };
const LANDING_LOW_MOTION_BREAKPOINT_PX = 767;

function shouldUseLowMotionLandingMode() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia(`(max-width: ${LANDING_LOW_MOTION_BREAKPOINT_PX}px), (pointer: coarse)`).matches ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function subscribeToMediaQuery(query: MediaQueryList, onChange: () => void) {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}

function useLowMotionLandingMode() {
  const [enabled, setEnabled] = useState(() => shouldUseLowMotionLandingMode());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    // Treat coarse-pointer tablets like mobile here because the Safari/WebKit crash report
    // is device-class specific rather than strictly width specific.
    const mobileQuery = window.matchMedia(`(max-width: ${LANDING_LOW_MOTION_BREAKPOINT_PX}px), (pointer: coarse)`);
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(mobileQuery.matches || reducedMotionQuery.matches);

    update();
    const unbindMobile = subscribeToMediaQuery(mobileQuery, update);
    const unbindReducedMotion = subscribeToMediaQuery(reducedMotionQuery, update);
    return () => {
      unbindMobile();
      unbindReducedMotion();
    };
  }, []);

  return enabled;
}

/* ── Animated OrahO sigil — large sovereign version ───────────────────── */
function SovereignSigil({ size = 160, animated = true }: { size?: number; animated?: boolean }) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className={animated ? "drop-shadow-[0_0_40px_rgba(74,222,128,0.35)]" : undefined}
    >
      {/* Outer ring */}
      <circle cx="100" cy="100" r="88" stroke="#4ade80" strokeWidth="6" opacity="0.25" />
      {/* Main ring */}
      <circle cx="100" cy="100" r="72" stroke="#4ade80" strokeWidth="10" />
      {/* Gold accent ring */}
      <circle cx="100" cy="100" r="52" stroke="#F5A623" strokeWidth="2" opacity="0.5" />
      {animated ? (
        <>
          {/* Inner pulsing dot — ring 1 */}
          <circle cx="100" cy="100" r="22" fill="#4ade80" opacity="0.15">
            <animate attributeName="r" from="22" to="60" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.15" to="0" dur="2.4s" repeatCount="indefinite" />
          </circle>
          {/* Inner pulsing dot — ring 2 (offset) */}
          <circle cx="100" cy="100" r="22" fill="#4ade80" opacity="0.12">
            <animate attributeName="r" from="22" to="60" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.12" to="0" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
          </circle>
        </>
      ) : (
        <>
          <circle cx="100" cy="100" r="34" fill="#4ade80" opacity="0.1" />
          <circle cx="100" cy="100" r="48" fill="#4ade80" opacity="0.06" />
        </>
      )}
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
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="orah-grid-lg" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#4ade80" strokeWidth="0.6" />
          </pattern>
          <pattern id="orah-grid-sm" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#4ade80" strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#orah-grid-lg)" opacity="0.055" />
        <rect width="100%" height="100%" fill="url(#orah-grid-sm)" opacity="0.018" />
      </svg>
      {/* Primary green glow — center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[700px] rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(74,222,128,0.09) 0%, transparent 60%)", animation: "orah-glow-pulse 5s ease-in-out infinite" }} />
      {/* Gold accent — bottom left */}
      <div className="absolute -bottom-40 -left-20 w-[600px] h-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(245,166,35,0.07) 0%, transparent 65%)" }} />
      {/* Blue accent — top right */}
      <div className="absolute -top-32 right-0 w-[500px] h-[500px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(96,165,250,0.05) 0%, transparent 65%)" }} />
      {/* Edge vignette */}
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 50%, transparent 25%, hsl(var(--background)) 95%)" }} />
    </div>
  );
}

/* ── Live terminal card (right side of hero) ────────────────────────────── */
const HERO_FALLBACK_MKTS = [
  { symbol: "BSV/USDT",  baseAsset: "BSV",  quoteAsset: "USDT", lastPrice: 45.20,    priceChangePercent24h:  2.41, volume24h: 9e6 },
  { symbol: "BTC/USDT",  baseAsset: "BTC",  quoteAsset: "USDT", lastPrice: 67200,    priceChangePercent24h:  1.18, volume24h: 8e9 },
  { symbol: "ETH/USDT",  baseAsset: "ETH",  quoteAsset: "USDT", lastPrice: 3421,     priceChangePercent24h: -0.55, volume24h: 3e9 },
  { symbol: "BNB/USDT",  baseAsset: "BNB",  quoteAsset: "USDT", lastPrice: 421,      priceChangePercent24h:  0.89, volume24h: 6e8 },
  { symbol: "SOL/USDT",  baseAsset: "SOL",  quoteAsset: "USDT", lastPrice: 172,      priceChangePercent24h:  3.21, volume24h: 5e8 },
  { symbol: "XRP/USDT",  baseAsset: "XRP",  quoteAsset: "USDT", lastPrice: 0.6120,   priceChangePercent24h: -1.02, volume24h: 2e8 },
];

function LiveTerminalCard({ markets, animated }: { markets: any[]; animated: boolean }) {
  const fmtPrice = (p: number) => {
    if (p >= 10000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (p >= 1)     return "$" + p.toFixed(2);
    if (p >= 0.001) return "$" + p.toPrecision(4);
    return "$" + p.toExponential(2);
  };
  const fmtVol = (v: number) => {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    return "$" + (v / 1e3).toFixed(0) + "K";
  };

  const rows = useMemo(() => {
    const live = markets.filter(m => m.status === "active").sort((a, b) => b.volume24h - a.volume24h).slice(0, 6);
    return live.length >= 4 ? live : HERO_FALLBACK_MKTS;
  }, [markets]);

  return (
    <div className="relative">
      {/* Outer glow halo */}
      <div className="absolute inset-0 rounded-[28px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(74,222,128,0.18) 0%, transparent 65%)", filter: "blur(28px)", transform: "scale(1.15) translateY(5%)" }} />

      {/* Card — uses theme CSS vars so it looks correct on dark/light/amoled */}
      <div className="relative rounded-[24px] border border-green-500/20 overflow-hidden bg-card"
        style={{
          background: "linear-gradient(160deg, rgba(74,222,128,0.06) 0%, hsl(var(--card)) 45%)",
          boxShadow: "0 0 0 1px rgba(74,222,128,0.08), 0 32px 80px rgba(0,0,0,0.25), inset 0 1px 0 rgba(74,222,128,0.06)",
        }}>

        {/* Terminal titlebar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">LIVE MARKETS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full bg-green-400 ${animated ? "animate-pulse" : ""}`} />
            <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Online</span>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-5 py-2 border-b border-border/30">
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/40">Pair</span>
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/40 text-right">Price</span>
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/40 text-right w-14">24h</span>
        </div>

        {/* Market rows */}
        <div>
          {rows.map((m, i) => {
            const up = (m.priceChangePercent24h ?? 0) >= 0;
            return (
              <Link
                key={m.symbol ?? i}
                href={`/trade/${(m.symbol ?? "BSV-USDT").replace("/", "-")}`}
                className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-5 py-3 transition-colors hover:bg-primary/5 group border-b border-border/20 last:border-b-0"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CoinAvatar symbol={m.baseAsset ?? "BSV"} size={30} />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-foreground leading-tight">{m.baseAsset}</p>
                    <p className="text-[9px] text-muted-foreground/40 leading-tight">{fmtVol(m.volume24h ?? 0)} vol</p>
                  </div>
                </div>
                <span className="text-sm font-black text-foreground font-mono tabular-nums">{fmtPrice(m.lastPrice ?? 0)}</span>
                <span className={`text-xs font-black w-14 text-right tabular-nums px-2 py-0.5 rounded-md ${up ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10"}`}>
                  {up ? "+" : ""}{(m.priceChangePercent24h ?? 0).toFixed(2)}%
                </span>
              </Link>
            );
          })}
        </div>

        {/* Shimmer scan line */}
        {animated && (
          <div className="absolute inset-x-0 h-px pointer-events-none overflow-hidden" style={{ animation: "orah-scan 4s ease-in-out infinite", top: "50%" }}>
            <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent, rgba(74,222,128,0.4), transparent)" }} />
          </div>
        )}

        {/* Footer CTA */}
        <div className="px-5 py-4 border-t border-border/40 bg-green-500/[0.02]">
          <Link href="/markets"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-black text-green-500 transition-all hover:bg-green-500/10 border border-green-500/20 hover:border-green-500/40 group">
            View All Markets
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ── Keeper tier card ────────────────────────────────────────────────────── */
function KeeperCard({ tier, icon, desc, fee, color }: {
  tier: string; icon: string; desc: string; fee: string; color: string;
}) {
  return (
    <div
      className="relative rounded-2xl p-px overflow-hidden transition-all hover:scale-[1.02] hover:-translate-y-1 group cursor-default"
      style={{ background: `linear-gradient(135deg, ${color}40 0%, transparent 60%)` }}
    >
      <div className="rounded-[15px] h-full flex flex-col gap-4 p-5 overflow-hidden relative"
        style={{ background: `linear-gradient(160deg, ${color}08 0%, hsl(var(--card)) 50%)` }}>
        {/* Corner glow */}
        <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl opacity-25 group-hover:opacity-40 transition-opacity"
          style={{ background: color }} />
        {/* Icon */}
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl font-black relative z-10"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
          {icon}
        </div>
        {/* Content */}
        <div className="relative z-10 flex-1">
          <p className="font-black text-lg leading-tight" style={{ color }}>{tier}</p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{desc}</p>
        </div>
        {/* Fee */}
        <div className="relative z-10 pt-3 mt-auto" style={{ borderTop: `1px solid ${color}20` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-0.5">Maker fee</p>
          <p className="text-xl font-black" style={{ color }}>{fee}</p>
        </div>
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
    <div className={`relative flex flex-col gap-4 rounded-2xl border p-6 transition-all hover:scale-[1.01] hover:-translate-y-0.5 overflow-hidden group ${
      active
        ? "border-green-500/30 bg-card"
        : "border-border/50 bg-card/30 opacity-60"
    }`}>
      {active && (
        <>
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "radial-gradient(ellipse at 20% 20%, rgba(74,222,128,0.04) 0%, transparent 60%)" }} />
          <span className="absolute top-4 right-4 text-[9px] font-black px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25 uppercase tracking-widest">
            Live
          </span>
        </>
      )}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center relative z-10 ${
        active ? "bg-green-500/12" : "bg-foreground/5"
      }`} style={active ? { border: "1px solid rgba(74,222,128,0.2)" } : {}}>
        <Icon className={`w-5 h-5 ${active ? "text-green-400" : "text-muted-foreground/40"}`} />
      </div>
      <div className="relative z-10">
        <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">Phase {phase}</span>
        <p className={`font-black text-base mt-1 ${active ? "text-foreground" : "text-muted-foreground/60"}`}>{title}</p>
        <p className="text-sm text-muted-foreground/60 mt-2 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ── Live stat pill ──────────────────────────────────────────────────────── */
function StatPill({ label, value, color = "text-green-400" }: {
  label: string; value: string | number; color?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm">
      <span className={`text-lg font-black leading-none ${color}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-bold leading-tight">{label}</span>
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
      className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all active:scale-95 cursor-pointer hover:scale-[1.02]"
      style={{ borderColor: "rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.07)" }}
    >
      <span className="text-lg font-black text-green-400 leading-none tabular-nums">
        {blockHeight > 0 ? `#${blockHeight.toLocaleString()}` : "Live"}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-green-500/60 flex items-center gap-1">
        BSV <ExternalLink className="w-2.5 h-2.5" />
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
    { id: 3, content: "DeFi liquidity fragmentation is creating arbitrage windows across OrahDEX pairs — algo traders watch BSV/USDT spread.", sentiment: "bullish" },
  ];

  useEffect(() => {
    let cancelled = false;

    // 8-second timeout — show fallback if AI is too slow
    const timer = setTimeout(() => {
      if (!cancelled) { setInsights(FALLBACK_INSIGHTS); setLoading(false); }
    }, 8000);

    const controller = new AbortController();
    fetch(`${API_BASE}/ai/insights`, { signal: controller.signal })
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
            Your AI co-pilot for every trade. Ora monitors markets in real-time,
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

/* ── Coin colour map ─────────────────────────────────────────────────────── */
const COIN_COLORS: Record<string, string> = {
  BTC:"#F7931A",ETH:"#627EEA",BSV:"#EAB305",USDT:"#26A17B",BNB:"#F0B90B",
  SOL:"#9945FF",XRP:"#346AA9",ADA:"#0033AD",DOGE:"#C2A633",DOT:"#E6007A",
  AVAX:"#E84142",MATIC:"#8247E5",LINK:"#2A5ADA",UNI:"#FF007A",ATOM:"#2E3148",
  LTC:"#BFBBBB",BCH:"#8DC351",TRX:"#EB0029",NEAR:"#00C08B",ICP:"#29ABE2",
  ARB:"#12AAFF",OP:"#FF0420",SUI:"#4DA2FF",INJ:"#00B2FF",PEPE:"#479A3A",
  SHIB:"#FFA409",MKR:"#6ACCB2",AAVE:"#B6509E",CRV:"#FF0000",ENS:"#5284FF",
  LDO:"#F68819",SUSHI:"#FA52A0",COMP:"#00D395",GRT:"#6F4CBA",SNX:"#00D1FF",
  YFI:"#006AE3",GMX:"#03D1CF",DYDX:"#6966FF",FTM:"#1969FF",ALGO:"#6EC1E4",
  XLM:"#14B6E7",HBAR:"#00ACBF",TON:"#0098EA",KAS:"#49EACB",SEI:"#9B1FE8",
  TIA:"#7B2FBE",BASE:"#0052FF",IMX:"#17B5CB",CAKE:"#D1884F",RAY:"#C54CE0",
  JUP:"#E86334",PYTH:"#E6DAFE",FET:"#1D6AFF",RNDR:"#AE4ABC",TAO:"#88888A",
  WLD:"#676767",HNT:"#474DFF",AXS:"#0055D5",SAND:"#04ADEF",MANA:"#FF2D55",
  APT:"#30B7E8",BONK:"#F5931D",WIF:"#C9B037",PENDLE:"#3BCCB0",CVX:"#3A3A6C",
  GMX2:"#03D1CF",FXS:"#000000",SPELL:"#8B5CF6",PERP:"#00CFBE",INJ2:"#00B2FF",
};
function coinColor(sym: string) { return COIN_COLORS[sym.toUpperCase()] ?? "#6b7280"; }

/* ── Coin avatar ─────────────────────────────────────────────────────────── */
function CoinAvatar({ symbol, size = 26 }: { symbol: string; size?: number }) {
  const [err, setErr] = useState(false);
  const sym = symbol.toUpperCase();
  const color = coinColor(sym);
  return (
    <div
      className="rounded-full shrink-0 overflow-hidden flex items-center justify-center"
      style={{ width: size, height: size, background: `${color}22`, border: `1px solid ${color}44` }}
    >
      {!err ? (
        <img
          src={`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${sym.toLowerCase()}.png`}
          alt={sym}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          style={{ width: size, height: size, objectFit: "contain" }}
          onError={() => setErr(true)}
        />
      ) : (
        <span style={{ fontSize: size * 0.36, color, fontWeight: 900, lineHeight: 1 }}>{sym.slice(0, 2)}</span>
      )}
    </div>
  );
}

/* ── Scrolling price ticker ───────────────────────────────────────────────── */
function TickerStrip({ markets, animated = true }: { markets: any[]; animated?: boolean }) {
  const items = useMemo(() => {
    const usdt = markets
      .filter(m => m.quoteAsset === "USDT" && m.status === "active")
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 35);
    const btc = markets
      .filter(m => m.quoteAsset === "BTC" && m.status === "active")
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 8);
    const seen = new Set<string>();
    return [...usdt, ...btc].filter(m => { if (seen.has(m.symbol)) return false; seen.add(m.symbol); return true; });
  }, [markets]);

  if (items.length === 0) return null;

  const fp = (p: number) =>
    p >= 10000 ? "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : p >= 1   ? "$" + p.toFixed(2)
    : p >= 0.001 ? "$" + p.toPrecision(3)
    : "$" + p.toExponential(2);

  const handleTickerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (animated) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.currentTarget.scrollBy({
      left: event.key === "ArrowRight" ? 160 : -160,
      behavior: "smooth",
    });
  };

  return (
    <div
      className={`w-full border-b border-border/30 bg-card/40 ${animated ? "overflow-hidden backdrop-blur-sm" : "overflow-x-auto"}`}
      role="region"
      aria-label="Live market ticker"
      tabIndex={0}
      onKeyDown={handleTickerKeyDown}
      style={{ height: 38 }}
    >
      {animated && <style>{`@keyframes orah-ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>}
      <div
        className="flex items-center h-full"
        style={{ animation: animated ? "orah-ticker 80s linear infinite" : undefined, width: "max-content" }}
      >
        {(animated ? [...items, ...items] : items).map((m, i) => {
          const up = m.priceChangePercent24h >= 0;
          return (
            <Link
              key={i}
              href={`/trade/${m.symbol.replace("/", "-")}`}
              className="flex items-center gap-1.5 px-3.5 h-full border-r border-border/20 hover:bg-foreground/4 transition-colors shrink-0 cursor-pointer"
            >
              <CoinAvatar symbol={m.baseAsset} size={16} />
              <span className="text-[11px] font-bold text-foreground/80 whitespace-nowrap">{m.symbol}</span>
              <span className="text-[11px] font-mono text-foreground/55 whitespace-nowrap">{fp(m.lastPrice)}</span>
              <span className={`text-[10px] font-bold whitespace-nowrap ${up ? "text-green-400" : "text-red-400"}`}>
                {up ? "▲" : "▼"}{Math.abs(m.priceChangePercent24h).toFixed(2)}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ── Featured markets section ────────────────────────────────────────────── */
type MktTab = "ALL" | "USDT" | "BTC" | "ETH" | "BSV";
const MKT_TABS: { id: MktTab; label: string }[] = [
  { id: "ALL",  label: "All" },
  { id: "USDT", label: "USDT" },
  { id: "BTC",  label: "BTC" },
  { id: "ETH",  label: "ETH" },
  { id: "BSV",  label: "BSV" },
];

function FeaturedMarkets({ markets }: { markets: any[] }) {
  const [tab, setTab] = useState<MktTab>("ALL");

  const filtered = useMemo(() => {
    let list = markets.filter(m => m.status === "active");
    if (tab === "BSV") {
      list = list.filter(m => m.baseAsset === "BSV" || m.quoteAsset === "BSV");
    } else if (tab !== "ALL") {
      list = list.filter(m => m.quoteAsset === tab);
    }
    return list.sort((a, b) => b.volume24h - a.volume24h).slice(0, 24);
  }, [markets, tab]);

  const fmtPrice = (p: number) => {
    if (p >= 10000) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (p >= 1)     return "$" + p.toFixed(2);
    if (p >= 0.0001) return "$" + p.toPrecision(4);
    return "$" + p.toExponential(2);
  };

  const fmtVol = (v: number) => {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    return "$" + v.toFixed(0);
  };

  return (
    <section className="relative px-6 lg:px-10 py-16">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-8 flex-col sm:flex-row">
          <div>
            <span className="text-xs font-black text-green-400 uppercase tracking-[0.3em] mb-1.5 block">Live Markets</span>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground">
              Top Trading Pairs
              <span className="ml-3 text-sm font-bold text-muted-foreground/50 align-middle">
                {markets.length.toLocaleString()}+ total
              </span>
            </h2>
          </div>
          <Link
            href="/markets"
            className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors border border-border px-3 py-1.5 rounded-lg hover:bg-card shrink-0"
          >
            All Markets <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1 scrollbar-none">
          {MKT_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap border ${
                tab === t.id
                  ? "bg-green-500 text-black border-green-500"
                  : "text-muted-foreground border-border hover:border-green-500/30 hover:text-foreground bg-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {filtered.map(m => {
            const up = m.priceChangePercent24h >= 0;
            return (
              <Link
                key={m.symbol}
                href={`/trade/${m.symbol.replace("/", "-")}`}
                className="group flex flex-col gap-2.5 p-3.5 rounded-2xl border border-border bg-card/40 hover:bg-card hover:border-green-500/25 transition-all hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <div className="flex items-center gap-2">
                  <CoinAvatar symbol={m.baseAsset} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-foreground leading-tight truncate">{m.baseAsset}</p>
                    <p className="text-[9px] text-muted-foreground/40 leading-tight truncate">/{m.quoteAsset}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-black text-foreground font-mono leading-tight">{fmtPrice(m.lastPrice)}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[9px] text-muted-foreground/40">Vol {fmtVol(m.volume24h)}</p>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                      up ? "bg-green-500/12 text-green-400" : "bg-red-500/12 text-red-400"
                    }`}>
                      {up ? "+" : ""}{m.priceChangePercent24h.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="flex justify-center mt-10">
          <Link
            href="/markets"
            className="flex items-center gap-2 px-8 py-3.5 rounded-2xl font-black text-sm border border-green-500/30 text-green-400 hover:bg-green-500/8 hover:border-green-500/60 transition-all"
          >
            View All {markets.length.toLocaleString()}+ Markets <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Main landing page ───────────────────────────────────────────────────── */
export function LandingPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useThemeStore();
  const lowMotionMode = useLowMotionLandingMode();
  const MARKET_COUNT_PLACEHOLDER = 1000; // startup placeholder until live total is fetched
  const MARKETS_PREVIEW_LIMIT = 50;

  useSEO({
    title: "OrahDEX — Trade means DEX | Spot, Futures & P2P Crypto Exchange",
    description: "OrahDEX is a sovereign multi-chain DEX with spot trading, perpetual futures, P2P markets, copy trading, and on-chain BSV settlement. Trade 900+ markets across EVM, TRON and BSV networks.",
    keywords: "OrahDEX, DEX, decentralized exchange, crypto trading, BSV, spot trading, perpetual futures, P2P, copy trading, DeFi, multi-chain, EVM, AMM, liquidity pools",
    url: "https://orahdex.org/",
    type: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "OrahDEX — Trade means DEX",
      "description": "Sovereign multi-chain decentralized exchange featuring spot trading, perpetual futures, P2P markets, copy trading, and on-chain BSV settlement.",
      "url": "https://orahdex.org/",
      "isPartOf": { "@type": "WebSite", "name": "OrahDEX", "url": "https://orahdex.org" }
    },
  });

  const safeTheme: LandTheme = (LAND_THEME_CYCLE as readonly string[]).includes(theme)
    ? (theme as LandTheme)
    : "amoled";

  const cycleTheme = () => {
    const idx = LAND_THEME_CYCLE.indexOf(safeTheme);
    setTheme(LAND_THEME_CYCLE[(idx + 1) % LAND_THEME_CYCLE.length]);
  };

  const ThemeIcon = LAND_THEME_ICONS[safeTheme];

  const { data: bsvStatus } = useQuery({
    queryKey: ["bsv-status"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/bsv-status`, { cache: "no-store" });
      return r.ok ? r.json() : { online: false, blockHeight: 0 };
    },
    refetchInterval: 30_000,
  });

  const { data: marketsData } = useQuery({
    queryKey: ["market-count-v2"],
    queryFn: async () => {
      const [leCountRes, countRes, marketsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/letsexchange/pairs/count?all=true`, { cache: "no-store" }),
        fetch(`${API_BASE}/markets/count`, { cache: "no-store" }),
        fetch(`${API_BASE}/markets?limit=${MARKETS_PREVIEW_LIMIT}`, { cache: "no-store" }),
      ]);
      if (leCountRes.status !== "fulfilled") console.warn("Landing market count fetch: LetsExchange count failed", leCountRes.reason);
      if (countRes.status !== "fulfilled") console.warn("Landing market count fetch: Markets count failed", countRes.reason);
      if (marketsRes.status !== "fulfilled") console.warn("Landing market count fetch: Markets preview failed", marketsRes.reason);
      const leCountPayload = leCountRes.status === "fulfilled" && leCountRes.value.ok ? await leCountRes.value.json() : {};
      const countPayload = countRes.status === "fulfilled" && countRes.value.ok ? await countRes.value.json() : {};
      const arr = marketsRes.status === "fulfilled" && marketsRes.value.ok ? await marketsRes.value.json() : [];
      const leCount = Number((leCountPayload as any)?.count ?? 0);
      const marketCount = Number((countPayload as any)?.count ?? 0);
      // /letsexchange/pairs/count already returns merged external+native symbol count.
      // Fall back to /markets/count only when that endpoint is unavailable.
      const totalCount = leCount > 0 ? leCount : marketCount;
      return { count: totalCount, markets: Array.isArray(arr) ? arr : [] };
    },
    staleTime: 60_000,
    placeholderData: { count: MARKET_COUNT_PLACEHOLDER, markets: [] as any[] },
  });

  const marketCount = (marketsData?.count && marketsData.count > 0) ? marketsData.count : MARKET_COUNT_PLACEHOLDER;
  const markets     = marketsData?.markets ?? [];
  const bsvBlock     = bsvStatus?.blockHeight ?? 0;
  const bsvBlockHash = bsvStatus?.bestBlockHash as string | undefined;

  const scrollDown = () => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col justify-center px-6 lg:px-12 pt-24 pb-16 overflow-hidden">
        <GridBackground />

        {/* ── Top navigation bar ── */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 lg:px-12 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(12px)", background: "rgba(var(--background), 0.8)" }}>
          {/* Logo */}
          <BrandLogo textSize="text-xl" />

          {/* Center nav — desktop */}
          <nav className="hidden lg:flex items-center gap-1">
            {[
              { href: "/markets",          label: "Markets"  },
              { href: "/trade/BSV-USDT",   label: "Trade"    },
              { href: "/futures/BSV-USDT-PERP", label: "Futures" },
              { href: "/swap",             label: "Bridge"   },
              { href: "/prediction",       label: "Predict"  },
              { href: "/nft",              label: "NFT"      },
            ].map(({ href, label }) => (
              <Link key={href} href={href}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
                {label}
              </Link>
            ))}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2 shrink-0">
            {bsvBlock > 0 && (
              <span className="hidden md:flex items-center gap-1.5 text-[10px] font-black text-green-400 border border-green-500/25 px-2.5 py-1 rounded-full uppercase tracking-widest"
                style={{ background: "rgba(74,222,128,0.06)" }}>
                <span className={`w-1.5 h-1.5 rounded-full bg-green-400 ${lowMotionMode ? "" : "animate-pulse"}`} />
                BSV #{bsvBlock.toLocaleString()}
              </span>
            )}
            <button onClick={cycleTheme} title={`Switch theme — current: ${LAND_THEME_LABELS[safeTheme]}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground text-xs font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <ThemeIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:block text-[11px]">{LAND_THEME_LABELS[safeTheme]}</span>
            </button>
            <Link href="/trade/BSV-USDT"
              className="text-xs font-black text-black px-4 py-1.5 rounded-lg transition-all hover:scale-[1.03]"
              style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)", boxShadow: "0 0 20px rgba(74,222,128,0.25)" }}>
              Launch App
            </Link>
          </div>
        </div>

        {/* ── Main hero content — split layout ── */}
        <div className="relative z-10 w-full max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_460px] xl:grid-cols-[1fr_500px] gap-10 xl:gap-20 items-center">

            {/* Left: Copy — centered on mobile, left-aligned on desktop */}
            <div className="flex flex-col gap-7 lg:gap-8 items-center text-center lg:items-start lg:text-left">

              {/* Identity badge */}
              <div>
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em]"
                  style={{ border: "1px solid rgba(245,166,35,0.5)", color: "#F5A623", background: "rgba(245,166,35,0.07)" }}>
                  <span className={`w-1.5 h-1.5 rounded-full ${lowMotionMode ? "" : "animate-pulse"}`} style={{ background: "#F5A623" }} />
                  Sovereign Decentralized Exchange
                </span>
              </div>

              {/* Headline */}
              <div>
                <h1 className="text-6xl sm:text-7xl xl:text-8xl font-black leading-[1.0] tracking-[-0.025em]">
                  <span className="text-foreground block">Trade</span>
                  <span className="text-foreground block">means</span>
                  <span className="block" style={{
                    background: "linear-gradient(135deg, #4ade80 0%, #22d3ee 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: "drop-shadow(0 0 40px rgba(74,222,128,0.25))",
                  }}>DEX.</span>
                </h1>
                <p className="mt-5 text-lg sm:text-xl font-semibold text-muted-foreground max-w-md leading-relaxed mx-auto lg:mx-0">
                  Trade as a <span className="text-amber-400 font-black">Keeper</span>, not a customer.
                  <span className="text-muted-foreground/60"> Spot · Futures · P2P · Copy · Predict.</span>
                </p>
              </div>

              {/* Ritual taglines */}
              <div className="flex flex-col gap-2">
                {["Identity is the engine.", "Execution is a ritual.", "Every trade is a declaration."].map((s, i) => (
                  <div key={i} className="flex items-center justify-center lg:justify-start gap-3 text-sm text-muted-foreground/60 font-medium">
                    <div className="w-1 h-1 rounded-full shrink-0" style={{ background: "rgba(74,222,128,0.5)" }} />
                    {s}
                  </div>
                ))}
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center lg:items-start gap-3 w-full sm:w-auto">
                <Link href="/trade/BSV-USDT"
                  className="group flex items-center justify-center gap-3 px-7 py-3.5 rounded-2xl font-black text-sm text-black transition-all hover:scale-[1.03] hover:shadow-2xl w-full sm:w-auto"
                  style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)", boxShadow: "0 4px 40px rgba(74,222,128,0.35)" }}>
                  Enter the Exchange
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link href="/markets"
                  className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-sm text-muted-foreground border border-border/60 hover:text-foreground transition-all w-full sm:w-auto"
                  style={{ background: "rgba(255,255,255,0.03)" }}>
                  View All Markets
                  <span className="text-xs font-black text-green-400 px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.2)" }}>
                    {marketCount.toLocaleString()}
                  </span>
                </Link>
              </div>

              {/* Live stats bar */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-2.5">
                <StatPill label="Markets" value={marketCount.toLocaleString()} />
                <StatPill label="Chains" value="20+" color="text-amber-400" />
                <StatPill label="Settlement" value="BSV" color="text-blue-400" />
                <BsvBlockPill blockHeight={bsvBlock} blockHash={bsvBlockHash} />
              </div>
            </div>

            {/* Right: Live Terminal */}
            <div className={`hidden lg:block ${lowMotionMode ? "" : "orah-float"}`}>
              <LiveTerminalCard markets={markets ?? []} animated={!lowMotionMode} />
            </div>
          </div>

          {/* Mobile terminal card — below content on small screens */}
          <div className="lg:hidden mt-10">
            <LiveTerminalCard markets={markets ?? []} animated={false} />
          </div>
        </div>

        {/* Scroll indicator */}
        {!lowMotionMode && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 cursor-pointer opacity-40 hover:opacity-70 transition-opacity"
            onClick={scrollDown}>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Explore</span>
            <div className="w-5 h-8 rounded-full border border-muted-foreground/30 flex items-start justify-center pt-1.5">
              <div className="w-1 h-2 rounded-full bg-green-400" style={{ animation: "orah-float 1.5s ease-in-out infinite" }} />
            </div>
          </div>
        )}
      </section>

      {/* ── LIVE TICKER STRIP ─────────────────────────────────────────────── */}
      <div className="relative z-0">
        <TickerStrip markets={markets ?? []} animated={!lowMotionMode} />
      </div>

      {/* ── PROTOCOL SNAPSHOT ─────────────────────────────────────────────── */}
      <section className="relative z-10 px-6 lg:px-12 pb-8 -mt-2">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-2xl overflow-hidden"
            style={{
              background: "hsl(var(--card))",
              border: "1px solid rgba(74,222,128,0.15)",
              boxShadow: "0 0 0 1px rgba(74,222,128,0.06), 0 4px 32px rgba(0,0,0,0.3)",
            }}>
            {/* Green accent top bar */}
            <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(74,222,128,0.6) 30%, rgba(245,166,35,0.4) 70%, transparent 100%)" }} />
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
              <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em]">Protocol Snapshot</span>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-green-400 uppercase tracking-widest">
                <span className={`w-1.5 h-1.5 rounded-full bg-green-400 ${lowMotionMode ? "" : "animate-pulse"}`} />
                All Systems Online
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Settlement", value: "BSV + OP_RETURN", color: "#4ade80" },
                { label: "Liquidity", value: "AMM + VAMM + OB", color: "#F5A623" },
                { label: "Bridge", value: "HTLC, no custody", color: "#60a5fa" },
                { label: "NFT + Creator", value: "OrahNFT × BSV", color: "#f472b6" },
                { label: "Copy Trading", value: "CopyVault ERC4626", color: "#c084fc" },
                { label: "Fiat On-Ramp", value: "6 providers", color: "#34d399" },
              ].map(({ label, value, color }, i, arr) => (
                <div key={label}
                  className="flex flex-col gap-1.5 px-4 py-4"
                  style={{ borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: `${color}70` }}>{label}</span>
                  <span className="text-xs font-black text-foreground/90">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURED MARKETS ──────────────────────────────────────────────── */}
      <FeaturedMarkets markets={markets ?? []} />

      {/* ── FEATURE STRIP ─────────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-12 py-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {[
              {
                label: "Settlement",
                pill: "BSV proofs",
                pillColor: "#4ade80",
                desc: "Every trade anchored to BSV as an OP_RETURN settlement proof — immutable, verifiable, independent.",
              },
              {
                label: "Liquidity",
                pill: "Genesis engine",
                pillColor: "#F5A623",
                desc: "Hybrid AMM + VAMM + orderbook routing. Every listed asset is always tradeable — even at launch.",
              },
              {
                label: "OrahNFT",
                pill: "Creator coins",
                pillColor: "#f472b6",
                desc: "Every post is a BSV inscription and a tradeable creator coin. Mint on bonding curves, all inside the DEX.",
              },
              {
                label: "CopyVault",
                pill: "Leaders & followers",
                pillColor: "#c084fc",
                desc: "ERC4626 vaults mirror leader trades on-chain. BSV proof chains. High-water-mark fees. No custody.",
              },
              {
                label: "Prediction",
                pill: "Live now",
                pillColor: "#38bdf8",
                desc: "Binary UP/DOWN markets, 5-minute rounds, 1×–100× leverage, parimutuel payouts. Live price feeds.",
              },
            ].map(({ label, pill, pillColor, desc }) => (
              <div key={label}
                className="group relative rounded-2xl p-px overflow-hidden transition-all hover:scale-[1.02] hover:-translate-y-0.5"
                style={{ background: `linear-gradient(135deg, ${pillColor}20 0%, transparent 60%)` }}>
                <div className="rounded-[15px] h-full flex flex-col gap-3 p-4 transition-colors"
                  style={{ background: `linear-gradient(160deg, ${pillColor}05 0%, hsl(var(--card)) 55%)` }}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-black text-foreground">{label}</span>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider whitespace-nowrap shrink-0"
                      style={{ color: pillColor, borderColor: `${pillColor}35`, background: `${pillColor}12` }}>
                      {pill}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/70 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
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
      <section className="relative px-6 lg:px-12 py-32 overflow-hidden">
        <GridBackground />
        {/* Extra center glow for drama */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-[800px] h-[400px] rounded-full"
            style={{ background: "radial-gradient(ellipse, rgba(74,222,128,0.07) 0%, transparent 65%)", filter: "blur(40px)" }} />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center flex flex-col items-center gap-10">
          {/* Sigil with ring */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(74,222,128,0.15) 0%, transparent 70%)", filter: "blur(20px)", transform: "scale(2)" }} />
            <div className="relative w-24 h-24 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(74,222,128,0.12), rgba(245,166,35,0.08))", border: "1px solid rgba(74,222,128,0.25)" }}>
              <SovereignSigil size={56} animated={!lowMotionMode} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground/50 text-xs uppercase tracking-[0.4em] font-black">The Declaration</p>
            <blockquote className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.15] tracking-tight text-foreground">
              "We do not build exchanges.
              <br />
              <span style={{
                background: "linear-gradient(135deg, #4ade80 0%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>We build thresholds.</span>"
            </blockquote>
            <p className="text-muted-foreground/70 max-w-lg mx-auto leading-relaxed text-base mt-2">
              OrahDEX is a sovereign exchange where every participant is a Keeper,
              every trade is an act of financial sovereignty, and settlement lives
              permanently on Bitcoin SV.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link
              href="/trade/BSV-USDT"
              className="group flex items-center gap-3 px-10 py-4 rounded-2xl font-black text-base text-black transition-all hover:scale-[1.03]"
              style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)", boxShadow: "0 0 80px rgba(74,222,128,0.3), 0 4px 32px rgba(74,222,128,0.2)" }}
            >
              Enter the Sovereign Exchange
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/keeper"
              className="flex items-center gap-2 px-7 py-4 rounded-2xl font-bold text-sm text-amber-400 border transition-all hover:scale-[1.02]"
              style={{ borderColor: "rgba(245,166,35,0.3)", background: "rgba(245,166,35,0.06)" }}>
              Become a Keeper
            </Link>
          </div>

          {/* Footer links */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground/40 font-semibold mt-4">
            {[
              { href: "/markets", label: "Markets" },
              { href: "/nft", label: "NFT" },
              { href: "/whitepaper", label: "Whitepaper" },
              { href: "/p2p", label: "P2P" },
              { href: "/swap", label: "Bridge" },
              { href: "/terms", label: "Terms" },
            ].map(({ href, label }) => (
              <Link key={href} href={href} className="hover:text-muted-foreground/70 transition-colors">{label}</Link>
            ))}
          </div>
          <SocialBar iconSize="sm" variant="landing" className="max-w-sm" />
          <p className="text-[11px] text-muted-foreground/25">
            © {new Date().getFullYear()} OrahDEX · orahdex.org · Trade means DEX
          </p>
        </div>
      </section>
    </div>
  );
}
