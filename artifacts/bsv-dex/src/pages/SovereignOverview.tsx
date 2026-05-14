import { Link } from "wouter";
import {
  ArrowRight, Shield, Key, Globe, Zap, Lock, Layers,
  ArrowRightLeft, Cpu, Wallet, TrendingUp, Users, ExternalLink,
} from "lucide-react";
import { OrahDEXInline } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

/* ── Animated sovereign sigil (reused from Landing) ────────────────────── */
function SovereignSigil({ size = 120 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className="drop-shadow-[0_0_40px_rgba(74,222,128,0.35)]"
    >
      <circle cx="100" cy="100" r="88" stroke="#4ade80" strokeWidth="6" opacity="0.25" />
      <circle cx="100" cy="100" r="72" stroke="#4ade80" strokeWidth="10" />
      <circle cx="100" cy="100" r="52" stroke="#F5A623" strokeWidth="2" opacity="0.5" />
      <circle cx="100" cy="100" r="22" fill="#4ade80" opacity="0.15">
        <animate attributeName="r"       from="22" to="60" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.15" to="0"  dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="100" cy="100" r="22" fill="#4ade80" opacity="0.12">
        <animate attributeName="r"       from="22" to="60" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.12" to="0"  dur="2.4s" begin="1.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="100" cy="100" r="20" fill="#4ade80" />
      <line x1="100" y1="12" x2="100" y2="28" stroke="#F5A623" strokeWidth="2" opacity="0.6" />
      <line x1="100" y1="172" x2="100" y2="188" stroke="#F5A623" strokeWidth="2" opacity="0.6" />
      <line x1="12" y1="100" x2="28" y2="100" stroke="#F5A623" strokeWidth="2" opacity="0.6" />
      <line x1="172" y1="100" x2="188" y2="100" stroke="#F5A623" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}

/* ── Subtle grid background ─────────────────────────────────────────────── */
function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="sov-grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#4ade80" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sov-grid)" />
      </svg>
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(74,222,128,0.06) 0%, transparent 70%)" }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(245,166,35,0.04) 0%, transparent 70%)" }}
      />
    </div>
  );
}

/* ── Pillar card ────────────────────────────────────────────────────────── */
function PillarCard({
  icon: Icon, title, body, color,
}: {
  icon: typeof Shield; title: string; body: string; color: string;
}) {
  return (
    <div
      className="relative flex flex-col gap-4 rounded-2xl border p-6 overflow-hidden transition-all hover:scale-[1.02] hover:-translate-y-1 group"
      style={{ borderColor: `${color}28`, background: `linear-gradient(135deg, ${color}08 0%, transparent 60%)` }}
    >
      <div
        className="absolute top-0 right-0 w-28 h-28 rounded-full blur-3xl opacity-15 group-hover:opacity-25 transition-opacity"
        style={{ background: color, transform: "translate(30%,-30%)" }}
        aria-hidden
      />
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}30` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="font-black text-base text-foreground mb-1">{title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

/* ── Metric pill ─────────────────────────────────────────────────────────── */
function MetricPill({ value, label, color = "text-green-400" }: {
  value: string; label: string; color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-5 rounded-2xl border border-border bg-card/60 min-w-[110px]">
      <span className={cn("text-2xl font-black", color)}>{value}</span>
      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-semibold text-center leading-tight">{label}</span>
    </div>
  );
}

/* ── Feature row item ───────────────────────────────────────────────────── */
function FeatureRow({ icon: Icon, title, body, href }: {
  icon: typeof ArrowRightLeft; title: string; body: string; href?: string;
}) {
  const inner = (
    <div className="flex items-start gap-4 p-5 rounded-2xl border border-border bg-card/50 hover:bg-card transition-colors group">
      <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-green-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-foreground mb-0.5 flex items-center gap-1.5">
          {title}
          {href && <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-green-400 transition-colors" />}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main export
═══════════════════════════════════════════════════════════════════════════ */
export function SovereignOverviewPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      <GridBackground />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 pt-20 pb-16 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center mb-8">
            <SovereignSigil size={110} />
          </div>

          <span className="inline-flex items-center gap-2 text-xs font-black text-green-400 uppercase tracking-[0.3em] mb-5">
            <Shield className="w-3.5 h-3.5" /> Sovereign Finance
          </span>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.1] mb-6">
            Your Keys.{" "}
            <span className="text-green-400">Your Chain.</span>
            <br />
            Your Exchange.
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
            <OrahDEXInline /> is built on one principle: no intermediary should stand between you
            and your money. Self-custody wallets, non-custodial settlement, and open-protocol
            liquidity — all on the world's most scalable blockchain.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/trade/BSV-USDT"
              className="flex items-center gap-2 px-7 py-3.5 bg-green-500 hover:bg-green-400 text-black font-black rounded-2xl transition-all hover:scale-105 active:scale-95"
            >
              Start Trading <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/whitepaper"
              className="flex items-center gap-2 px-7 py-3.5 border border-border bg-card/60 hover:bg-card text-foreground font-semibold rounded-2xl transition-all"
            >
              Read Whitepaper
            </Link>
          </div>
        </div>
      </section>

      {/* ── METRICS ─────────────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 py-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap justify-center gap-4">
            <MetricPill value="958"    label="Markets"       color="text-green-400" />
            <MetricPill value="10"     label="EVM Chains"    color="text-blue-400" />
            <MetricPill value="< 1¢"   label="BSV Settle Fee" color="text-yellow-400" />
            <MetricPill value="0%"     label="Custody Risk"  color="text-green-400" />
            <MetricPill value="BIP44"  label="HD Wallet"     color="text-purple-400" />
          </div>
        </div>
      </section>

      {/* ── SOVEREIGNTY PILLARS ─────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 text-xs font-black text-green-400 uppercase tracking-[0.3em] mb-4">
              <Lock className="w-3.5 h-3.5" /> Core Principles
            </span>
            <h2 className="text-3xl font-black text-foreground">
              The Three Pillars of Sovereignty
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <PillarCard
              icon={Key}
              color="#4ade80"
              title="Self-Custody"
              body="Your private keys are generated and encrypted client-side using BIP39 + BIP44. The server never sees your seed phrase. Biometric passkey authentication decrypts your key in memory — never at rest."
            />
            <PillarCard
              icon={Globe}
              color="#F5A623"
              title="Open Protocol"
              body="Every settlement on the BSV layer is a verifiable on-chain transaction. Orah uses HTLC atomic swaps across chains — no wrapped tokens, no bridges that can be paused, no single point of failure."
            />
            <PillarCard
              icon={Shield}
              color="#60a5fa"
              title="Non-Custodial"
              body="External wallets (MetaMask, BSV, Phantom, TRON) trade directly to on-chain addresses. Orah's internal ledger is only used when you choose the OrahDEX wallet — and you can withdraw to self-custody at any time."
            />
          </div>
        </div>
      </section>

      {/* ── PROTOCOL FEATURES ───────────────────────────────────────────── */}
      <section
        className="relative px-6 lg:px-10 py-16"
        style={{ background: "linear-gradient(180deg, rgba(74,222,128,0.02) 0%, transparent 100%)" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 text-xs font-black text-green-400 uppercase tracking-[0.3em] mb-4">
              <Layers className="w-3.5 h-3.5" /> Protocol Stack
            </span>
            <h2 className="text-3xl font-black text-foreground">
              Every Layer, Sovereign by Design
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FeatureRow
              icon={Zap}
              href="/swap"
              title="BSV Settlement Layer"
              body="Sub-cent fees on the world's most scalable blockchain. Every spot trade can settle to a BSV UTXO — immutable, final, and always yours."
            />
            <FeatureRow
              icon={Wallet}
              href="/swap"
              title="Native HD Wallet"
              body="BIP44 derivation across EVM, BTC/BSV/BCH, SOL, and TRON from a single BIP39 seed phrase. Import, export, and own your path."
            />
            <FeatureRow
              icon={ArrowRightLeft}
              href="/bridge"
              title="Atomic Cross-Chain Bridge"
              body="HTLC-based bridge with no wrapped tokens. Lock, reveal, and settle across chains trustlessly — or reclaim your funds after timeout."
            />
            <FeatureRow
              icon={TrendingUp}
              href="/copy"
              title="CopyVault — On-Chain Copy Trading"
              body="ERC-4626-style vault accounting mirrors leader trades on-chain. Follow proven strategies without giving anyone custody of your capital."
            />
            <FeatureRow
              icon={Cpu}
              href="/trade/BSV-USDT"
              title="Order Book Engine"
              body="Multi-fill limit & market orders with price-priority matching. Funds locked atomically — no pre-authorization of unlimited token approvals."
            />
            <FeatureRow
              icon={Users}
              href="/p2p"
              title="P2P Marketplace"
              body="Peer-to-peer trades with HTLC escrow. No counterparty risk, no KYC gate between traders — just cryptographic guarantees."
            />
          </div>
        </div>
      </section>

      {/* ── SOVEREIGN IDENTITY ──────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 py-16">
        <div className="max-w-4xl mx-auto rounded-3xl border border-green-500/15 bg-green-500/4 p-8 sm:p-12">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="shrink-0">
              <SovereignSigil size={80} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-foreground mb-3">
                Sovereignty is not a feature — it's the foundation
              </h2>
              <p className="text-muted-foreground leading-relaxed text-sm mb-6">
                Every architectural decision in <OrahDEXInline /> prioritises your autonomy.
                We don't hold your funds. We don't gate your withdrawals. We don't wrap your assets
                in proprietary custody layers. The protocol is open, the settlement is on-chain,
                and your keys are yours — always.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/whitepaper#compliance"
                  className="flex items-center gap-2 text-sm font-semibold text-green-400 hover:text-green-300 transition-colors"
                >
                  Read Sovereign Status in Whitepaper <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-10 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black text-foreground mb-4">
            Reclaim Financial Sovereignty
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-8">
            Open an account with your own wallet — no email required. Trade 958 markets with
            sub-cent BSV settlement. Your assets, your rules.
          </p>
          <Link
            href="/trade/BSV-USDT"
            className="inline-flex items-center gap-2 px-8 py-4 bg-green-500 hover:bg-green-400 text-black font-black rounded-2xl text-base transition-all hover:scale-105 active:scale-95"
          >
            Launch App <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

export default SovereignOverviewPage;
