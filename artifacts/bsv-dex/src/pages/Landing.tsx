import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Zap, Shield, Globe, ChevronDown, ExternalLink } from "lucide-react";

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
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">{desc}</p>
      </div>
      <div className="mt-auto pt-3 border-t border-white/5">
        <p className="text-xs text-gray-500">Maker fee</p>
        <p className="font-bold text-white">{fee}</p>
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
        : "border-white/8 bg-white/3 opacity-70"
    }`}>
      {active && (
        <span className="absolute top-4 right-4 text-[9px] font-black px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 uppercase tracking-widest">
          Live
        </span>
      )}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        active ? "bg-green-500/15" : "bg-white/5"
      }`}>
        <Icon className={`w-5 h-5 ${active ? "text-green-400" : "text-gray-500"}`} />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Phase {phase}</span>
        </div>
        <p className={`font-black text-base ${active ? "text-white" : "text-gray-400"}`}>{title}</p>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ── Live stat pill ──────────────────────────────────────────────────────── */
function StatPill({ label, value, color = "text-green-400" }: {
  label: string; value: string | number; color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-4 rounded-2xl border border-white/8 bg-white/3 min-w-[120px]">
      <span className={`text-2xl font-black ${color}`}>{value}</span>
      <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold">{label}</span>
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
      className="group flex flex-col items-center gap-0.5 px-6 py-4 rounded-2xl border border-green-500/25 bg-green-500/6 hover:bg-green-500/10 hover:border-green-500/40 min-w-[130px] transition-all hover:scale-[1.02] cursor-pointer"
    >
      <span className="text-[9px] uppercase tracking-[0.25em] text-green-500/60 font-bold flex items-center gap-1">
        Explore
        <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
      <span className="text-xl font-black text-green-400">
        {blockHeight > 0 ? `#${blockHeight.toLocaleString()}` : "Live"}
      </span>
      <span className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">BSV Block</span>
    </a>
  );
}

/* ── Main landing page ───────────────────────────────────────────────────── */
export function LandingPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);

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

  const marketCount = markets?.length ?? 933;
  const bsvBlock     = bsvStatus?.blockHeight ?? 0;
  const bsvBlockHash = bsvStatus?.bestBlockHash as string | undefined;

  const scrollDown = () => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div
      className="min-h-screen text-white overflow-x-hidden"
      style={{ background: "#080a0f" }}
    >
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20">
        <GridBackground />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 lg:px-10 py-5 z-10">
          <div className="flex items-center gap-2 font-black text-xl tracking-tight">
            <svg viewBox="0 0 100 100" className="w-7 h-7" fill="none">
              <circle cx="50" cy="50" r="38" stroke="#4ade80" strokeWidth="12" />
              <circle cx="50" cy="50" r="12" fill="#4ade80" />
            </svg>
            <span className="text-white">Orah</span><span className="text-green-400">DEX</span>
          </div>
          <div className="flex items-center gap-3">
            {bsvBlock > 0 && (
              <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-green-400 border border-green-500/30 px-2.5 py-1 rounded-full bg-green-500/8 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                BSV #{bsvBlock.toLocaleString()}
              </span>
            )}
            <Link href="/markets" className="text-sm font-semibold text-gray-400 hover:text-white transition-colors px-4 py-2 rounded-xl border border-white/10 hover:border-white/20 bg-white/5">
              Markets
            </Link>
            <Link href="/trade/BSV-USDT" className="text-sm font-bold text-black px-4 py-2 rounded-xl bg-green-400 hover:bg-green-300 transition-all hover:scale-[1.02] shadow-lg shadow-green-500/20">
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
              <span className="text-white">Trade means</span>
              <br />
              <span className="text-green-400">DEX.</span>
            </h1>
          </div>

          {/* Ritual taglines */}
          <div className={`transition-all duration-700 ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "400ms" }}>
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 text-sm font-semibold">
              {["Identity is the engine.", "Execution is a ritual.", "Every trade is a declaration."].map((s, i) => (
                <span key={i} className="text-gray-400"
                  style={{ borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.1)" : "none", paddingLeft: i > 0 ? "2rem" : undefined }}>
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
              className="group flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-base text-black transition-all hover:scale-[1.03] hover:shadow-2xl"
              style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)", boxShadow: "0 0 40px rgba(74,222,128,0.3)" }}
            >
              Enter the Exchange
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/markets" className="flex items-center gap-2 px-7 py-4 rounded-2xl font-bold text-sm text-gray-300 border border-white/12 hover:border-white/25 hover:text-white bg-white/5 hover:bg-white/8 transition-all">
              View All Markets
              <span className="text-xs font-black text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full border border-green-500/25">
                {marketCount.toLocaleString()}
              </span>
            </Link>
          </div>

          {/* Live stats bar */}
          <div className={`flex flex-wrap justify-center gap-3 transition-all duration-700 ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "600ms" }}>
            <StatPill label="Markets" value={marketCount.toLocaleString()} />
            <StatPill label="Chains" value="20+" color="text-amber-400" />
            <StatPill label="Settlement" value="BSV" color="text-blue-400" />
            <BsvBlockPill blockHeight={bsvBlock} blockHash={bsvBlockHash} />
          </div>

          {/* Scroll indicator */}
          <button
            onClick={scrollDown}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-gray-600 hover:text-gray-400 transition-colors animate-bounce"
            aria-label="Scroll down"
          >
            <span className="text-[10px] uppercase tracking-widest font-bold">Explore</span>
            <ChevronDown className="w-4 h-4" />
          </button>
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
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              The Keeper Protocol
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto leading-relaxed">
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
            <p className="text-sm text-gray-400 leading-relaxed">
              <span className="text-amber-400 font-bold">Keeper Registry</span> — A permissionless on-chain registry
              tracks all Keeper tiers. Tier upgrades are automatic, based on volume, stake, and time-in-protocol.
              No whitelist. No gatekeepers. Sovereignty earned, not granted.
            </p>
          </div>
        </div>
      </section>

      {/* ── ARCHITECTURE ──────────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 py-24" style={{ background: "rgba(255,255,255,0.01)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-black text-green-400 uppercase tracking-[0.3em] mb-3 block">
              Hybrid Architecture
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              Three Phases of Sovereignty
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto leading-relaxed">
              OrahDEX is not a simple DEX. It is a progressive architecture — 
              starting with deep CEX-backed liquidity, evolving to full on-chain AMM,
              and culminating in a sovereign BSV↔EVM bridge.
            </p>
          </div>

          {/* Phase cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <PhaseCard
              phase={1}
              title="CEX-Backed Liquidity"
              desc="Deep order books powered by connected CEX venues. Real prices, real depth, real fills. Every coin, every pair."
              icon={Globe}
              active
            />
            <PhaseCard
              phase={2}
              title="On-Chain AMM"
              desc="Keeper-governed automated market makers. Permissionless pool creation. Identity-aware routing for optimal fills."
              icon={Zap}
            />
            <PhaseCard
              phase={3}
              title="BSV↔EVM Bridge"
              desc="Native bridge between Bitcoin SV and EVM chains. All settlements finalize on BSV — fastest, cheapest, permanent."
              icon={Shield}
            />
          </div>

          {/* Architecture flow diagram */}
          <div className="rounded-2xl border border-white/8 bg-white/3 p-6 overflow-x-auto">
            <div className="flex items-center justify-center gap-2 min-w-[480px] text-xs font-bold">
              {[
                { label: "Your Wallet", sub: "EVM / BSV / SOL", color: "#4ade80" },
                null,
                { label: "OrahDEX Engine", sub: "Keeper routing", color: "#F5A623" },
                null,
                { label: "CEX Venues", sub: "Binance / OKX / Bybit", color: "#60a5fa" },
                null,
                { label: "BSV Chain", sub: "Final settlement", color: "#4ade80" },
              ].map((item, i) =>
                item === null ? (
                  <div key={i} className="flex-1 max-w-[60px] flex items-center">
                    <div className="w-full h-px bg-white/10" />
                    <div className="w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-4 border-l-white/20" />
                  </div>
                ) : (
                  <div key={i} className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border min-w-[110px] text-center"
                    style={{ borderColor: `${item.color}30`, background: `${item.color}08` }}>
                    <span style={{ color: item.color }}>{item.label}</span>
                    <span className="text-[10px] text-gray-500 font-normal">{item.sub}</span>
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
            <p className="text-gray-500 text-sm uppercase tracking-[0.3em] font-bold">The Declaration</p>
            <blockquote className="text-2xl sm:text-3xl font-black leading-snug text-white">
              "We do not build exchanges.<br />
              <span className="text-green-400">We build thresholds.</span>"
            </blockquote>
            <p className="text-gray-400 max-w-lg mx-auto leading-relaxed mt-2">
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

          <div className="flex items-center gap-6 text-xs text-gray-600 font-semibold">
            <Link href="/markets" className="hover:text-gray-400 transition-colors">Markets</Link>
            <span>·</span>
            <Link href="/whitepaper" className="hover:text-gray-400 transition-colors">Whitepaper</Link>
            <span>·</span>
            <Link href="/p2p" className="hover:text-gray-400 transition-colors">P2P</Link>
            <span>·</span>
            <Link href="/bridge" className="hover:text-gray-400 transition-colors">Bridge</Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-gray-400 transition-colors">Terms</Link>
          </div>
          <p className="text-[11px] text-gray-700">
            © {new Date().getFullYear()} OrahDEX · orahdex.org · Trade means DEX
          </p>
        </div>
      </section>
    </div>
  );
}

