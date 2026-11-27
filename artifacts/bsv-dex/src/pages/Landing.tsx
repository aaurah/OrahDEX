import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BrandLogo } from "@/components/BrandLogo";
import { ArrowRight, Zap, Shield, Globe, ExternalLink, Sparkles, Brain, TrendingUp, TrendingDown, Minus, MessageSquare, FlaskConical, Layers, Wallet, Activity, Moon, Sun, Smartphone } from "lucide-react";
import { useThemeStore } from "@/store/useThemeStore";
import { SocialBar } from "@/components/SocialBar";
import { API_BASE } from "@/lib/api";
import { useSEO } from "@/hooks/useSEO";
import { CAPABILITY_STATUS } from "@/lib/capabilityStatus";

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
function LiveTerminalCard({ markets, animated, loading }: { markets: any[]; animated: boolean; loading: boolean }) {
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
    const seenBase = new Set<string>();
    const live = markets
      .filter(m => m.status === "active")
      .sort((a, b) => b.volume24h - a.volume24h)
      .filter(m => {
        const key = (m.baseAsset ?? m.symbol ?? "").toUpperCase();
        if (seenBase.has(key)) return false;
        seenBase.add(key);
        return true;
      })
      .slice(0, 6);
    return live;
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
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">MARKET DATA</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${loading && !rows.length ? "bg-muted-foreground animate-pulse" : rows.length ? "bg-green-400" : "bg-amber-400"} ${animated && rows.length ? "animate-pulse" : ""}`} />
            <span data-testid="status-live-market-data" className={`text-[10px] font-black uppercase tracking-widest ${loading && !rows.length ? "text-muted-foreground" : rows.length ? "text-green-400" : "text-amber-400"}`}>
              {loading && !rows.length ? "Loading" : rows.length ? "Data available" : "Unavailable"}
            </span>
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
          {loading && rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-muted-foreground animate-pulse">
              Loading live market data…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-muted-foreground">
              Live market data is unavailable. Sample prices are not shown.
            </p>
          ) : rows.map((m, i) => {
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

/* ── Current feature scope card ──────────────────────────────────────────── */
function AvailabilityCard({ title, icon, desc, status, color }: {
  title: string; icon: string; desc: string; status: string; color: string;
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
          <p className="font-black text-lg leading-tight" style={{ color }}>{title}</p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{desc}</p>
        </div>
        {/* Fee */}
        <div className="relative z-10 pt-3 mt-auto" style={{ borderTop: `1px solid ${color}20` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-0.5">Current scope</p>
          <p className="text-sm font-black" style={{ color }}>{status}</p>
        </div>
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
      aria-label="Market price ticker"
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

function FeaturedMarkets({ markets, loading }: { markets: any[]; loading: boolean }) {
  const [tab, setTab] = useState<MktTab>("ALL");

  const filtered = useMemo(() => {
    const QUOTE_PREF: Record<string, number> = { USDT: 0, USDC: 1, TUSD: 2, USDD: 3, BTC: 4, ETH: 5, BSV: 6 };
    // Only these quote assets have prices in a known, displayable denomination.
    // Stablecoins (USDT/USDC/TUSD/USDD) display as USD. BTC/ETH/BSV display in
    // their own unit. All others (CRO/MATIC/ARB…) are excluded in the ALL tab
    // to avoid e.g. BTC/CRO "$1,105,399" appearing as a dollar price.
    const DISPLAY_QUOTES = new Set(Object.keys(QUOTE_PREF));
    let list = markets.filter(m => m.status === "active");
    if (tab === "BSV") {
      list = list.filter(m => m.baseAsset === "BSV" || m.quoteAsset === "BSV");
    } else if (tab !== "ALL") {
      list = list.filter(m => m.quoteAsset === tab);
    } else {
      // ALL tab: only include markets with a known display quote so prices make sense
      list = list.filter(m => DISPLAY_QUOTES.has(m.quoteAsset));
    }
    // Deduplicate: keep one pair per baseAsset — prefer preferred quotes, then highest volume
    const seen = new Map<string, any>();
    for (const m of list.sort((a, b) => {
      const pa = QUOTE_PREF[a.quoteAsset] ?? 99;
      const pb = QUOTE_PREF[b.quoteAsset] ?? 99;
      if (pa !== pb) return pa - pb;
      return b.volume24h - a.volume24h;
    })) {
      if (!seen.has(m.baseAsset)) seen.set(m.baseAsset, m);
    }
    return [...seen.values()].sort((a, b) => b.volume24h - a.volume24h).slice(0, 24);
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
            <span className="text-xs font-black text-green-400 uppercase tracking-[0.3em] mb-1.5 block">Market data</span>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground">
              Top Trading Pairs
              <span className="ml-3 text-sm font-bold text-muted-foreground/50 align-middle">
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
          {loading && markets.length === 0 ? (
            Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                data-testid={`market-card-skeleton-${index}`}
                aria-hidden="true"
                className="h-32 rounded-2xl border border-border bg-card/40 animate-pulse"
              />
            ))
          ) : filtered.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-border bg-card/30 px-5 py-10 text-center text-sm text-muted-foreground">
              {markets.length ? "No pairs are available in this filter." : "Market data is unavailable. No sample prices are shown."}
            </div>
          ) : filtered.map(m => {
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
            Browse supported markets <ArrowRight className="w-4 h-4" />
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
  const MARKETS_PREVIEW_LIMIT = 200;

  useSEO({
    title: "OrahDEX — Trade Means DEX | Spot, Futures & P2P Crypto Exchange",
    description: "OrahDEX provides route-specific digital-asset trading and market data. Supported assets, networks, custody, fees, and execution depend on the selected feature and provider.",
    keywords: "OrahDEX, DEX, crypto trading, BSV, spot trading, market data, wallet trading, swaps",
    url: "https://orahdex.com/",
    type: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "OrahDEX — Trade Means DEX",
      "description": "Digital-asset trading and market-data features with route-specific networks, providers, custody, and settlement.",
      "url": "https://orahdex.com/",
      "isPartOf": { "@type": "WebSite", "name": "OrahDEX", "url": "https://orahdex.com" }
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

  const { data: marketsData, isLoading: marketsLoading } = useQuery({
    queryKey: ["landing-markets-v1"],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/markets?type=spot&quoteAssets=USDT,USDC,TUSD,USDD,BTC,ETH,BSV&limit=${MARKETS_PREVIEW_LIMIT}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        console.warn("Landing market preview fetch failed", response.status);
        return { markets: [] };
      }
      const rows = await response.json();
      return { markets: Array.isArray(rows) ? rows : [] };
    },
    staleTime: 60_000,
  });

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
                  Multi-route Digital Asset Exchange
                </span>
              </div>

              {/* Headline */}
              <div>
                <h1 className="text-6xl sm:text-7xl xl:text-8xl font-black leading-[1.0] tracking-[-0.025em]">
                  <span className="text-foreground block">Trade</span>
                  <span className="text-foreground block">Means</span>
                  <span className="block" style={{
                    background: "linear-gradient(135deg, #4ade80 0%, #22d3ee 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: "drop-shadow(0 0 40px rgba(74,222,128,0.25))",
                  }}>DEX.</span>
                </h1>
                <p className="mt-5 text-lg sm:text-xl font-semibold text-muted-foreground max-w-md leading-relaxed mx-auto lg:mx-0">
                  Review the route before you <span className="text-amber-400 font-black">trade</span>.
                  <span className="text-muted-foreground/60"> Availability varies by feature.</span>
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
                </Link>
              </div>

              {/* Live stats bar */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-2.5">
                <StatPill
                  label="Market data"
                  value={marketsLoading && !marketsData ? "Loading" : markets.length ? "Available" : "Unavailable"}
                  color={marketsLoading && !marketsData ? "text-muted-foreground" : markets.length ? "text-green-400" : "text-amber-400"}
                />
                <StatPill label="Networks" value="Per route" color="text-amber-400" />
                <StatPill label="Settlement" value="Route-specific" color="text-blue-400" />
                <BsvBlockPill blockHeight={bsvBlock} blockHash={bsvBlockHash} />
              </div>
            </div>

            {/* Right: Live Terminal */}
            <div className={`hidden lg:block ${lowMotionMode ? "" : "orah-float"}`}>
              <LiveTerminalCard markets={markets ?? []} animated={!lowMotionMode} loading={marketsLoading} />
            </div>
          </div>

          {/* Mobile terminal card — below content on small screens */}
          <div className="lg:hidden mt-10">
            <LiveTerminalCard markets={markets ?? []} animated={false} loading={marketsLoading} />
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
              <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-400 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Route availability varies
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
              {CAPABILITY_STATUS.map(({ area: label, status: value }, i, arr) => {
                const color = ["#4ade80", "#F5A623", "#60a5fa", "#f472b6", "#c084fc", "#34d399", "#38bdf8", "#f97316"][i]!;
                return (
                <div key={label}
                  className="flex flex-col gap-1.5 px-4 py-4"
                  style={{ borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: `${color}70` }}>{label}</span>
                  <span className="text-xs font-black text-foreground/90">{value}</span>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURED MARKETS ──────────────────────────────────────────────── */}
          <FeaturedMarkets markets={markets ?? []} loading={marketsLoading} />

      {/* ── FEATURE STRIP ─────────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-12 py-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {CAPABILITY_STATUS.slice(0, 5).map(({ id, area: label, status: pill, summary: desc }, i) => {
              const pillColor = ["#4ade80", "#F5A623", "#60a5fa", "#f472b6", "#c084fc"][i]!;
              return (
              <div key={id}
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
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FEATURE AVAILABILITY ──────────────────────────────────────────── */}
      <section ref={scrollRef} className="relative px-6 lg:px-10 py-24">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-14">
            <span className="text-xs font-black text-amber-400 uppercase tracking-[0.3em] mb-3 block">
              Current implementation
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-foreground mb-4">
              Check each route before trading
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Wallet, network, liquidity, fees, and settlement differ by feature. The app
              and this page describe the same route limits; review the live order or quote
              before signing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CAPABILITY_STATUS.slice(0, 4).map(({ id, area: title, status, summary: desc }, i) => (
              <AvailabilityCard
                key={id}
                title={title}
                icon={["◈", "◎", "↗", "⌁"][i]!}
                desc={desc}
                status={status}
                color={["#9ca3af", "#60a5fa", "#c084fc", "#F5A623"][i]!}
              />
            ))}
          </div>

          <div className="mt-8 p-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 flex items-center gap-4">
            <Shield className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="text-amber-400 font-bold">Before signing</span> — Confirm the selected wallet,
              network, asset, displayed fee, and whether the action is an on-chain transaction or a
              provider-managed route.
            </p>
          </div>
        </div>
      </section>

      {/* ── LIQUIDITY AND EXECUTION ───────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 py-24" style={{ background: "linear-gradient(180deg, rgba(245,166,35,0.03) 0%, rgba(74,222,128,0.03) 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] mb-4" style={{ color: "#F5A623" }}>
              <Zap className="w-3.5 h-3.5" /> Liquidity and execution
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-foreground mb-4">
              A displayed price is not a guaranteed fill.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Order-book depth depends on active orders. Reference prices, virtual liquidity,
              and external provider quotes have different execution and settlement rules.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {[
              {
                icon: Activity,
                title: "Order-book depth",
                desc: "The order book reflects available active orders for that pair; it can be empty or change before an order is matched.",
                color: "#4ade80",
              },
              {
                icon: FlaskConical,
                title: "Reference prices",
                desc: "Chart and indicative prices may come from data providers and do not guarantee that an order can execute at that price.",
                color: "#F5A623",
              },
              {
                icon: Layers,
                title: "External quotes",
                desc: "A quote is not a completed trade. Check the selected provider, wallet transaction, and final settlement status.",
                color: "#60a5fa",
              },
              {
                icon: Wallet,
                title: "Virtual liquidity",
                desc: "Where simulated liquidity is shown, it is not escrowed user liquidity and is not a guaranteed executable fill.",
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

          {/* Route guidance */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(245,166,35,0.15)", border: "1px solid rgba(245,166,35,0.3)" }}>
              <Zap className="w-6 h-6 text-amber-400" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-black text-foreground text-sm mb-1">Check the execution route</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Before signing, confirm whether the action uses an order book, a wallet-signed contract,
                or a provider-managed quote. The displayed price, fee, and settlement path are specific
                to that route.
              </p>
            </div>
            <Link
              href="/markets"
              className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-amber-300 border border-amber-500/30 hover:border-amber-400/60 bg-amber-500/10 hover:bg-amber-500/20 transition-all whitespace-nowrap"
            >
              Browse markets <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── EXECUTION ROUTES ──────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 py-24" style={{ background: "rgba(255,255,255,0.01)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-black text-green-400 uppercase tracking-[0.3em] mb-3 block">
              Execution routes
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-foreground mb-4">
              Different paths, different settlement
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
              A connected wallet, the OrahDEX API, an escrow contract, or an external
              provider may take part depending on the feature. Check the route shown
              before authorizing a transaction.
            </p>
          </div>

          {/* Capability cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {CAPABILITY_STATUS.slice(0, 3).map(({ id, area: title, status, summary: desc }, i) => (
              <AvailabilityCard
                key={id}
                title={title}
                icon={["◈", "◎", "↗"][i]!}
                desc={desc}
                status={status}
                color={["#4ade80", "#F5A623", "#60a5fa"][i]!}
              />
            ))}
          </div>

          {/* Architecture flow diagram */}
          <div className="rounded-2xl border border-border bg-card/40 p-6 overflow-x-auto">
            <div className="flex items-center justify-center gap-2 min-w-[480px] text-xs font-bold">
              {[
                { label: "Connected wallet", sub: "Selected account + network", color: "#4ade80" },
                null,
                { label: "OrahDEX app", sub: "Order and route handling", color: "#F5A623" },
                null,
                { label: "Contract or provider", sub: "Depends on the feature", color: "#60a5fa" },
                null,
                { label: "Execution result", sub: "Check chain/provider status", color: "#4ade80" },
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
              OrahDEX combines wallet-signed and provider-managed routes. Wallet custody,
              execution, fees, and settlement depend on the feature and network selected.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link
              href="/trade/BSV-USDT"
              className="group flex items-center gap-3 px-10 py-4 rounded-2xl font-black text-base text-black transition-all hover:scale-[1.03]"
              style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)", boxShadow: "0 0 80px rgba(74,222,128,0.3), 0 4px 32px rgba(74,222,128,0.2)" }}
            >
              Open the Exchange
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/whitepaper"
              className="flex items-center gap-2 px-7 py-4 rounded-2xl font-bold text-sm text-amber-400 border transition-all hover:scale-[1.02]"
              style={{ borderColor: "rgba(245,166,35,0.3)", background: "rgba(245,166,35,0.06)" }}>
              Read the Whitepaper
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
            © {new Date().getFullYear()} OrahDEX · orahdex.com · Trade Means DEX
          </p>
        </div>
      </section>
    </div>
  );
}
