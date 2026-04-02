import { useState } from "react";
import { ArrowLeft, FileText, Download, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { OrahInline, BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

const VERSION = "3.0.0";
const PUBLISH_DATE = "2 April 2026";

const TOC = [
  { id: "abstract",       label: "Abstract" },
  { id: "problem",        label: "1. Problem Statement" },
  { id: "solution",       label: "2. The OrahDEX Solution" },
  { id: "architecture",   label: "3. Technical Architecture" },
  { id: "bsv-settlement", label: "4. BSV On-Chain Settlement" },
  { id: "amm",            label: "5. AMM & Liquidity Pools" },
  { id: "genesis-vamm",   label: "5.4 Genesis Liquidity Engine (VAMM)" },
  { id: "cross-chain",    label: "6. Cross-Chain Bridge" },
  { id: "trading",        label: "7. Trading Engine" },
  { id: "copy-vault",     label: "8. CopyVault System" },
  { id: "ora-ai",         label: "9. Ora AI Integration" },
  { id: "tokenomics",     label: "10. Fee Model & Revenue" },
  { id: "security",       label: "11. Security Model" },
  { id: "roadmap",        label: "12. Roadmap" },
  { id: "conclusion",     label: "Conclusion" },
  { id: "disclaimer",     label: "Legal Disclaimer" },
];

function TocEntry({ id, label, active, onClick }: { id: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all",
        active
          ? "bg-primary/10 text-primary font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-white/5",
      )}
    >
      {label}
    </button>
  );
}

function Section({ id, title, children, accent = false }: { id: string; title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className={cn(
        "flex items-center gap-3 pb-2 border-b",
        accent ? "border-primary/30" : "border-border",
      )}>
        <h2 className={cn(
          "text-lg font-black",
          accent ? "text-primary" : "text-foreground",
        )}>{title}</h2>
      </div>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function Metric({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="text-center p-4 bg-card border border-border rounded-2xl space-y-1">
      <p className="text-2xl font-black text-primary">{value}</p>
      <p className="text-xs font-semibold text-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-secondary/60 border border-border rounded-xl px-4 py-3 text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 pt-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-1.5 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function InfoBox({ title, children, color = "blue" }: { title: string; children: React.ReactNode; color?: "blue" | "green" | "amber" | "violet" }) {
  const colors = {
    blue:   "bg-blue-400/5 border-blue-400/20 text-blue-300",
    green:  "bg-green-400/5 border-green-400/20 text-green-300",
    amber:  "bg-amber-400/5 border-amber-400/20 text-amber-300",
    violet: "bg-violet-400/5 border-violet-400/20 text-violet-300",
  };
  return (
    <div className={cn("p-4 rounded-xl border space-y-1", colors[color])}>
      <p className="font-semibold text-xs uppercase tracking-wider">{title}</p>
      <div className="text-xs leading-relaxed opacity-90">{children}</div>
    </div>
  );
}

export function WhitePaper() {
  const [, navigate] = useLocation();
  const [tocOpen, setTocOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("abstract");

  const scrollTo = (id: string) => {
    setActiveSection(id);
    setTocOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate(-1 as any)}
            className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">White Paper</span>
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">v{VERSION}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block">{PUBLISH_DATE}</span>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Save / Print</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 pb-24">
        <div className="flex gap-8">
          {/* Sidebar TOC */}
          <aside className="hidden lg:block w-52 shrink-0">
            <div className="sticky top-20 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-3 mb-2">Contents</p>
              {TOC.map(t => (
                <TocEntry key={t.id} id={t.id} label={t.label} active={activeSection === t.id} onClick={() => scrollTo(t.id)} />
              ))}
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-12">
            {/* Mobile TOC */}
            <div className="lg:hidden">
              <button
                onClick={() => setTocOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 bg-card border border-border rounded-xl text-sm font-semibold"
              >
                <span>Table of Contents</span>
                {tocOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {tocOpen && (
                <div className="mt-2 p-2 bg-card border border-border rounded-xl space-y-0.5">
                  {TOC.map(t => (
                    <TocEntry key={t.id} id={t.id} label={t.label} active={activeSection === t.id} onClick={() => scrollTo(t.id)} />
                  ))}
                </div>
              )}
            </div>

            {/* Cover */}
            <div className="text-center space-y-5 py-8 border border-border rounded-3xl bg-gradient-to-b from-primary/5 to-transparent">
              <div className="flex justify-center">
                <BrandLogo textSize="text-4xl" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">OrahDEX White Paper</h1>
                <p className="text-primary font-semibold mt-1 text-lg">Trade means DEX</p>
              </div>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed px-4">
                A sovereign, multi-chain, non-custodial decentralised exchange with native Bitcoin SV on-chain settlement, cross-chain atomic swaps, Genesis Liquidity Engine (Virtual AMM with bonding curves), perpetual futures, on-chain copy trading (CopyVault), TRON/TRC-20 wallet support, and AI-powered trading intelligence (Ora).
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span>Version {VERSION}</span>
                <span>·</span>
                <span>{PUBLISH_DATE}</span>
                <span>·</span>
                <a href="https://orahdex.org" className="text-primary hover:underline flex items-center gap-1">orahdex.org <ExternalLink className="w-2.5 h-2.5" /></a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mx-4 sm:mx-8 pt-2">
                <Metric value="934+" label="Trading Pairs" sub="Spot + Futures + VAMM" />
                <Metric value="200+" label="Networks" sub="EVM · TRON · BSV sovereign oracle" />
                <Metric value="56+" label="VAMM Markets" sub="Genesis Liquidity Engine" />
                <Metric value="BSV" label="Settlement Layer" sub="OP_RETURN on-chain proof" />
              </div>
            </div>

            {/* Abstract */}
            <Section id="abstract" title="Abstract" accent>
              <p>
                OrahDEX is a next-generation, fully non-custodial decentralised exchange (DEX) protocol that unifies spot trading, perpetual futures, Virtual AMM (Genesis Liquidity Engine), automated market making (AMM), peer-to-peer (P2P) trading, cross-chain bridging, on-chain copy trading (CopyVault), and fiat on-ramp services within a single, seamless sovereign interface.
              </p>
              <p>
                At its core, OrahDEX leverages <span className="text-foreground font-medium">Bitcoin SV (BSV)</span> as its primary settlement layer, exploiting BSV's massively scalable, low-fee, and UTXO-based blockchain to execute Hash Time-Locked Contract (HTLC) atomic swaps and OP_RETURN settlement proofs that are provably fair and fully transparent. EVM-compatible chains (Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche, zkSync, Scroll, Linea, Mantle, Cronos, and more) are supported natively through Reown/WalletConnect integration. <span className="text-foreground font-medium">TRON network</span> is natively supported — including TRX and TRC-20 USDT (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) — giving traders in TRON-dominant markets full access to OrahDEX without wrapping or bridging.
              </p>
              <p>
                The <span className="text-foreground font-medium">Genesis Liquidity Engine</span> is OrahDEX's proprietary Virtual AMM — a linear bonding curve mechanism that guarantees every listed asset is instantly tradeable, even before real liquidity exists. Integrated directly into the Market Hub, the VAMM provides on-demand price discovery and simulated trade execution for 56+ major assets, backed by a virtual treasury pre-funded at 3× depth.
              </p>
              <p>
                OrahDEX runs a sovereign price engine — aggregating its own order-book trade data, on-chain TWAP feeds, and real-time market signals — giving traders access to the same market intelligence as institutional players. The platform's novel <span className="text-foreground font-medium">CopyVault system</span> brings on-chain copy trading to DeFi for the first time — followers deposit USDT into leader-managed vaults and automatically mirror the leader's trades proportionally, with BSV OP_RETURN proofs for every mirrored trade.
              </p>
              <p>
                <span className="text-foreground font-medium">Ora</span> — OrahDEX's integrated AI — provides real-time trading assistance, market analysis, and portfolio coaching powered by large language models, embedded directly in the trading interface.
              </p>
              <p>
                This white paper describes the technical architecture, economic model, security design, and strategic roadmap of OrahDEX as of version {VERSION}.
              </p>
            </Section>

            {/* 1. Problem */}
            <Section id="problem" title="1. Problem Statement">
              <p>
                The global cryptocurrency trading market processes trillions of dollars in volume annually, yet the majority of this activity flows through <span className="text-foreground font-medium">centralised exchanges (CEXs)</span> — platforms that require users to surrender custody of their assets, comply with extensive KYC, and trust a central authority that history has shown to be vulnerable to hacks, insolvency, and regulatory shutdown.
              </p>
              <p>Existing decentralised alternatives suffer from their own set of limitations:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { problem: "Fragmentation", detail: "Liquidity is split across hundreds of protocols and chains, forcing users to manage multiple wallets, bridges, and interfaces." },
                  { problem: "High Fees", detail: "Ethereum-based DEXs charge prohibitive gas fees that make small trades uneconomical, pricing out retail users." },
                  { problem: "Poor UX", detail: "Most DEXs require deep technical knowledge. Seed phrase management, gas estimation, and slippage settings are inaccessible to mainstream users." },
                  { problem: "Limited Instruments", detail: "DEX offerings are almost exclusively limited to spot swaps. Perpetual futures, P2P markets, copy trading, and fiat rails are virtually absent." },
                  { problem: "Custodial Bridges", detail: "Cross-chain bridges are the single largest source of crypto losses, having suffered over $2.5B in hacks due to their custodial intermediary models." },
                  { problem: "No Copy Trading", detail: "On-chain copy trading has never been fully realised in DeFi. Existing solutions are off-chain, opaque, and custodial — losing the core DeFi value proposition." },
                  { problem: "No AI Assistance", detail: "Professional trading tools with integrated AI guidance are exclusively available on CEXs, locked behind costly subscriptions or institutional access." },
                  { problem: "BSV Neglect", detail: "Bitcoin SV's massively scalable, low-cost, and UTXO-based blockchain is underutilised by DeFi, despite being technically superior for settlement-layer applications." },
                ].map(({ problem, detail }) => (
                  <div key={problem} className="p-3 bg-red-400/5 border border-red-400/15 rounded-xl">
                    <p className="text-xs font-bold text-red-400 mb-1">{problem}</p>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* 2. Solution */}
            <Section id="solution" title="2. The OrahDEX Solution">
              <p>OrahDEX addresses these problems through a unified, non-custodial trading platform built on five foundational principles:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { title: "Non-Custodial", icon: "🔐", desc: "Users retain full control of their private keys and assets at all times. OrahDEX never holds user funds." },
                  { title: "Multi-Chain", icon: "🌐", desc: "Native support for BSV, Ethereum, 12+ EVM chains, and TRON (TRX/TRC-20 USDT). One interface — every chain." },
                  { title: "Always-On Liquidity", icon: "⚡", desc: "Genesis Liquidity Engine (VAMM) guarantees every listed asset is tradeable via a linear bonding curve — zero dry runs, zero empty order books." },
                  { title: "Full-Spectrum", icon: "📊", desc: "Spot, futures, VAMM, AMM, P2P, bridge, copy trading, and fiat on-ramp — every trading instrument in one platform." },
                  { title: "AI-Powered", icon: "🧠", desc: "Ora AI provides real-time market intelligence, trade coaching, and portfolio analysis — embedded in the interface." },
                ].map(({ title, icon, desc }) => (
                  <div key={title} className="p-4 bg-primary/5 border border-primary/15 rounded-2xl space-y-2">
                    <div className="text-2xl">{icon}</div>
                    <p className="font-bold text-sm text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
              <p>
                OrahDEX combines the transparency and trustlessness of DeFi with the usability and feature-richness of CeFi — without the custody risk. By building BSV settlement into the core architecture, OrahDEX achieves per-transaction fees below $0.001, enabling micro-trades and high-frequency strategies that are impractical on Ethereum. The CopyVault system extends this to copy trading — every mirrored trade produces a BSV OP_RETURN proof that is publicly verifiable on-chain.
              </p>
            </Section>

            {/* 3. Architecture */}
            <Section id="architecture" title="3. Technical Architecture">
              <p>OrahDEX is composed of five primary layers:</p>
              <div className="space-y-3">
                {[
                  {
                    layer: "Layer 1 — Settlement",
                    color: "text-green-400",
                    bg: "bg-green-400/5 border-green-400/15",
                    desc: "Bitcoin SV blockchain for on-chain UTXO-based HTLC settlement and OP_RETURN trade proofs. Immutable, transparent, and final. Every matched trade produces a publicly verifiable BSV transaction ID.",
                  },
                  {
                    layer: "Layer 2 — Protocol",
                    color: "text-blue-400",
                    bg: "bg-blue-400/5 border-blue-400/15",
                    desc: "OrahDEX smart contracts on EVM chains (Uniswap V3-style AMM for concentrated liquidity, custom order book contracts for limit orders, CopyVault ERC4626-style vault contracts). HTLC scripts on BSV.",
                  },
                  {
                    layer: "Layer 3 — Application",
                    color: "text-violet-400",
                    bg: "bg-violet-400/5 border-violet-400/15",
                    desc: "Express.js API server providing order book management, sovereign price engine (own trades + on-chain TWAP), CopyVault orchestration, Ora AI chat, user account management, and WebSocket real-time feeds.",
                  },
                  {
                    layer: "Layer 4 — Intelligence",
                    color: "text-amber-400",
                    bg: "bg-amber-400/5 border-amber-400/15",
                    desc: "Ora AI integration powered by large language models. Provides real-time trading assistance, market commentary, copy trading recommendations, and portfolio analysis embedded in the trading interface.",
                  },
                  {
                    layer: "Layer 5 — Interface",
                    color: "text-primary",
                    bg: "bg-primary/5 border-primary/15",
                    desc: "React + Vite progressive web application. Fully responsive (mobile + desktop). Dark/Light/AMOLED/System themes. WalletConnect/Reown for EVM (20+ chains). Native TRON wallet support (TronLink, TokenPocket, OKX, Bitget, Trust, imToken). Native BSV wallet integration. OrahChart for cross-pair visualisation.",
                  },
                ].map(({ layer, color, bg, desc }) => (
                  <div key={layer} className={cn("p-4 rounded-xl border", bg)}>
                    <p className={cn("font-bold text-xs mb-1", color)}>{layer}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
              <InfoBox title="Technology Stack" color="blue">
                <p>Frontend: React 19 + Vite 7 + TailwindCSS v4 · Backend: Node.js 24 + Express 5 + Drizzle ORM</p>
                <p>Database: PostgreSQL 16 · EVM: Wagmi + Viem + Reown AppKit · AI: OpenAI-compatible LLM</p>
                <p>BSV: WhatsOnChain API + native UTXO/OP_RETURN construction · Charts: Lightweight-charts v5</p>
                <p>TRON: TronWeb + TronLink / TokenPocket / OKX / Bitget / Trust / imToken wallet adapters</p>
                <p>VAMM: Genesis Liquidity Engine (linear bonding curve, 56+ assets, virtual treasury) · Markets: 934+ pairs</p>
              </InfoBox>
            </Section>

            {/* 4. BSV Settlement */}
            <Section id="bsv-settlement" title="4. BSV On-Chain Settlement via HTLC & OP_RETURN">
              <p>
                OrahDEX uses two BSV mechanisms for on-chain trade proof: <span className="text-foreground font-medium">Hash Time-Locked Contracts (HTLCs)</span> for trustless cross-chain settlement, and <span className="text-foreground font-medium">OP_RETURN transactions</span> for immutable trade audit records.
              </p>
              <Sub title="4.1 HTLC Atomic Swaps">
                <ol className="list-decimal list-inside space-y-2 ml-1">
                  <li>Maker generates a secret preimage <span className="font-mono text-green-400">R</span> and its hash <span className="font-mono text-green-400">H = SHA256(R)</span>.</li>
                  <li>Maker locks funds in a BSV HTLC script: <em>"Pay to Taker if Taker reveals R within T blocks; else refund to Maker."</em></li>
                  <li>Taker verifies the HTLC on-chain and locks corresponding funds in the reciprocal leg (BSV or EVM).</li>
                  <li>Maker reveals <span className="font-mono text-green-400">R</span>, claiming Taker's funds. Revelation on-chain simultaneously allows Taker to claim Maker's funds.</li>
                  <li>If either party fails to act within the time lock, all funds are automatically refunded. No custodian required.</li>
                </ol>
                <Code>{`OP_IF
  OP_SHA256 <H> OP_EQUALVERIFY
  OP_DUP OP_HASH160 <TakerPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
OP_ELSE
  <LockTime> OP_CHECKLOCKTIMEVERIFY OP_DROP
  OP_DUP OP_HASH160 <MakerPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
OP_ENDIF`}</Code>
              </Sub>
              <Sub title="4.2 OP_RETURN Settlement Proofs">
                <p>Every matched trade on OrahDEX — including copy-traded vault orders — produces a BSV OP_RETURN transaction. The payload is pipe-delimited and permanently recorded on-chain:</p>
                <Code>{`OP_RETURN payload format:
ORAH|v1|<tradeId>|<pair>|<buyerAddr>|<sellerAddr>|<amount>|<price>|<timestamp>

Example:
ORAH|v1|a3b9c1d2e4|BSV-USDT|0x1234…abcd|0x5678…ef01|1.5|55.42|1743388800000`}</Code>
                <p>The BSV txid is computed as double-SHA256 of the serialised raw transaction, matching exactly what the BSV network computes. This creates a tamper-evident, publicly-auditable on-chain ledger of all OrahDEX settlement activity.</p>
              </Sub>
              <div className="grid grid-cols-3 gap-3">
                <Metric value="< $0.001" label="BSV Tx Fee" sub="Per settlement" />
                <Metric value="0" label="Counterparty Risk" sub="Trustless HTLC" />
                <Metric value="100%" label="On-Chain Proof" sub="OP_RETURN audit trail" />
              </div>
            </Section>

            {/* 5. AMM */}
            <Section id="amm" title="5. AMM & Liquidity Pools">
              <p>
                OrahDEX's on-chain liquidity is provided through <span className="text-foreground font-medium">Automated Market Maker (AMM) pools</span> using the constant product invariant, alongside the proprietary <span className="text-foreground font-medium">Genesis Liquidity Engine</span> — a virtual bonding-curve AMM that guarantees liquidity for every listed asset before real pools exist.
              </p>
              <Sub title="5.1 Constant Product Formula (x · y = k)">
                <Code>{`x * y = k
Where:
  x = reserve of Token A
  y = reserve of Token B
  k = constant (preserved by every swap)

Price Impact:   Δy = (Δx × (1−fee) × y) / (x + Δx × (1−fee))
Price of A:     P = y / x
Effective price: (y − Δy) / (x + Δx × (1 − fee))`}</Code>
              </Sub>
              <Sub title="5.2 Fee Distribution">
                <p>OrahDEX AMM pools apply a 0.30% swap fee distributed across three destinations:</p>
                <InfoBox title="AMM Fee Split" color="green">
                  <p>5/6 (≈ 83.3%) → Liquidity Providers (proportional to pool share)</p>
                  <p>1/6 (≈ 16.7%) → OrahDEX Protocol Treasury</p>
                  <p>Additional protocol revenue: 0.05% per swap → Impermanent Loss Insurance Fund</p>
                </InfoBox>
              </Sub>
              <Sub title="5.3 AmmSwapSimulator">
                <p>OrahDEX includes a built-in AMM simulator that shows real-time price impact, slippage, fee breakdown, k constant, and effective exchange rate before committing a swap. Available on both desktop and mobile.</p>
              </Sub>
            </Section>

            {/* 5.4 Genesis Liquidity Engine */}
            <Section id="genesis-vamm" title="5.4 Genesis Liquidity Engine — Virtual AMM">
              <p>
                The <span className="text-foreground font-medium">Genesis Liquidity Engine</span> (VAMM) is OrahDEX's answer to the cold-start liquidity problem: every newly listed asset is immediately tradeable via a linear bonding curve, even before any real liquidity provider participates. The VAMM is embedded directly into the Market Hub — every coin row in the exchange listing carries a ⚡ VAMM button that opens an instant swap panel without navigating away.
              </p>
              <InfoBox title="Design Goal" color="amber">
                <p>No asset on OrahDEX should ever show "No liquidity". The VAMM acts as a sovereign liquidity backstop — always present, always priceable, instantly accessible from the market listing view.</p>
              </InfoBox>

              <Sub title="5.4.1 Linear Bonding Curve">
                <p>
                  Each asset's VAMM price is determined by a linear bonding curve anchored to the current spot price and calibrated so that spending $8,500 of simulated capital moves the curve price by approximately 1%:
                </p>
                <Code>{`Price(supply) = basePrice + slope × supply

Where:
  basePrice = current spot price of the asset (USDT)
  slope     = 0.01 × basePrice² / 8500
            = 1% price impact per $8,500 of buy volume

Buy cost for n tokens starting from supply S₀:
  cost = n × basePrice + slope × (S₀ × n + n²/2)
       ≡ trapezoidal integral of price from S₀ to S₀+n

Sell payout for n tokens ending at supply S₀:
  payout = n × basePrice + slope × ((S₀−n) × n + n²/2)

Both are floored at 0 to prevent negative payouts.`}</Code>
              </Sub>

              <Sub title="5.4.2 Virtual Treasury">
                <p>
                  Each VAMM market is pre-funded with a virtual treasury equal to 3× the base depth ($8,500 × 3 = $25,500 in simulated token holdings). This ensures that sell orders of any reasonable size always have a bid — even when the virtual supply is at zero, the treasury provides counterparty liquidity for sellers.
                </p>
                <Code>{`Treasury initialisation per asset:
  virtualSupply = treasuryDepth / basePrice
  treasuryDepth = 3 × $8,500 = $25,500

  Example (BTC at $65,000):
    slope         = 0.01 × 65000² / 8500 ≈ 4.97 USDT/token
    virtualSupply = 25500 / 65000 ≈ 0.392 BTC
    Price at s=0  = $65,000 (anchored to spot)`}</Code>
              </Sub>

              <Sub title="5.4.3 Trade Execution & Receipts">
                <p>
                  Every VAMM swap is <strong>simulated</strong> — no real tokens transfer, no wallet signature is required, and no gas is consumed. The system records each simulation with a tamper-evident receipt:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: "Trade ID", detail: "UUID for each simulated swap — permanently loggable in Simulation History" },
                    { label: "Curve Price", detail: "Effective price at the moment of execution — includes bonding curve movement" },
                    { label: "Fee (0.30%)", detail: "Platform fee deducted from USDT input — identical rate to AMM pool swaps" },
                    { label: "Supply Delta", detail: "Δ tokens added/removed from virtual supply — used for next trade pricing" },
                    { label: "Timestamp", detail: "Block-precise UTC timestamp for audit trail and simulation history" },
                    { label: "\"Where did tokens go?\"", detail: "Every receipt explains the virtual nature — tokens exist in the simulation ledger, not a wallet" },
                  ].map(({ label, detail }) => (
                    <div key={label} className="p-3 bg-amber-400/5 border border-amber-400/15 rounded-xl">
                      <p className="text-xs font-bold text-amber-400 mb-1">{label}</p>
                      <p className="text-xs text-muted-foreground">{detail}</p>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="5.4.4 Market Hub Integration">
                <p>
                  The VAMM is not a separate product — it is a layer embedded within the Market Hub (All Coins table). Every row in the exchange's coin listing carries a ⚡ VAMM action. Clicking it opens either:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-1">
                  <li><span className="font-medium text-foreground">Inline overlay</span> — a focused VAMM swap card anchored to the coin row, for quick single-asset trades without opening the full detail view.</li>
                  <li><span className="font-medium text-foreground">Coin detail modal</span> — full VAMM swap panel with live bonding curve quote, simulation history, and receipt modal embedded inside the coin's exchange listing page.</li>
                  <li><span className="font-medium text-foreground">Genesis Liquidity page</span> — accessible at <code className="text-green-400 text-[10px]">/genesis</code> for a dedicated full-screen VAMM experience with all 56+ assets, asset selector, and full simulation history.</li>
                </ul>
              </Sub>

              <div className="grid grid-cols-3 gap-3">
                <Metric value="56+" label="VAMM Assets" sub="Major pairs instantly tradeable" />
                <Metric value="0.30%" label="Simulated Fee" sub="Same rate as AMM pools" />
                <Metric value="3×" label="Treasury Depth" sub="$25,500 virtual backing per asset" />
              </div>

              <InfoBox title="VAMM API Endpoints" color="green">
                <p>GET <code className="text-green-300">/api/genesis/markets</code> — list all 56 VAMM-enabled assets with basePrice, slope, supply, and depth</p>
                <p>GET <code className="text-green-300">/api/genesis/quote</code> — real-time quote for any side/amount pair using live spot price</p>
                <p>POST <code className="text-green-300">/api/genesis/swap</code> — execute a simulated swap, update virtual supply, return signed receipt with Trade ID</p>
              </InfoBox>
            </Section>

            {/* 6. Bridge */}
            <Section id="cross-chain" title="6. Cross-Chain Bridge">
              <p>
                The OrahDEX Bridge enables trustless asset transfers between BSV and EVM-compatible networks using HTLC atomic swaps — eliminating the custodial risk that has made traditional bridges the most dangerous component in DeFi.
              </p>
              <Sub title="Bridge Architecture">
                <ul className="list-disc list-inside space-y-1.5 ml-1">
                  <li><span className="font-medium text-foreground">No Wrapped Tokens:</span> OrahDEX bridges move native assets using atomic swaps, eliminating de-peg risk.</li>
                  <li><span className="font-medium text-foreground">Relayer Network:</span> A decentralised network of OrahDEX relayers facilitates HTLC coordination between chains. Relayers are economically incentivised and operate in a trust-minimised fashion.</li>
                  <li><span className="font-medium text-foreground">Time-Lock Safety:</span> All cross-chain HTLCs have configurable time locks (minimum 24 hours for large amounts). Expired HTLCs automatically refund to the sender on-chain.</li>
                  <li><span className="font-medium text-foreground">Watchtower Services:</span> OrahDEX operates watchtower nodes that monitor pending HTLCs and automatically execute refunds if the counterparty fails to act.</li>
                  <li><span className="font-medium text-foreground">Multi-Network:</span> Supports Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche, zkSync, Scroll, Linea, Mantle, and Cronos.</li>
                </ul>
              </Sub>
              <InfoBox title="Supported Bridge Pairs (Phase 1)" color="blue">
                <p>BSV ↔ ETH · BSV ↔ BNB · BSV ↔ MATIC · BSV ↔ USDT (BSV native) ↔ USDT (ERC-20)</p>
                <p>Additional pairs added based on liquidity and community governance vote.</p>
              </InfoBox>
            </Section>

            {/* 7. Trading */}
            <Section id="trading" title="7. Trading Engine">
              <Sub title="7.1 Spot Trading">
                <p>
                  Spot trading is available for <strong>934+ pairs</strong> across 200+ blockchain networks — all priced by OrahDEX's sovereign oracle. Market orders are routed to the best available source — AMM pool, on-chain order book, or P2P matching — with smart order routing selecting the lowest slippage path.
                </p>
                <p>
                  Limit orders are signed by the user (ECDSA personal_sign) and held in the OrahDEX order book until filled. On match, the platform produces a BSV OP_RETURN settlement transaction providing an immutable on-chain audit trail. OrahChart renders cross-pair charts (ATOM/ETH, LINK/BTC, SOL/BTC, etc.) with adaptive decimal precision (up to 10 decimal places for micro-priced assets).
                </p>
              </Sub>
              <Sub title="7.2 Perpetual Futures">
                <p>
                  OrahDEX offers perpetual futures contracts with up to 100x leverage. Positions are tracked by the protocol and settled against mark prices derived from the OrahDEX sovereign oracle (own order-book + on-chain TWAP). Funding rates are exchanged every 8 hours to keep perpetual prices anchored to spot.
                </p>
                <Code>{`Funding Rate = (Perpetual Price − Index Price) / Index Price × (1/24)
Position PnL  = (Exit Price − Entry Price) × Size × Direction
Liq. Price    = Entry Price × (1 − Initial Margin / Leverage)
Mark Price    = median(OrahDEX Order Book, OrahDEX TWAP, BSV On-Chain Feed)`}</Code>
              </Sub>
              <Sub title="7.3 P2P Trading">
                <p>
                  OrahDEX's P2P marketplace enables direct peer-to-peer trades with custom payment methods including bank transfer, mobile money, and local fiat options. Trades are secured by a BSV HTLC escrow that releases automatically when both parties confirm completion. Dispute resolution is handled by OrahDEX's decentralised arbitration panel.
                </p>
              </Sub>
              <Sub title="7.4 Fiat On-Ramp">
                <p>
                  OrahDEX integrates five fiat on-ramp providers: <strong>MoonPay, Transak, Banxa, Simplex, and Ramp Network</strong>. Users can purchase crypto with credit/debit cards, bank transfers, and local payment methods in 100+ countries directly within the OrahDEX interface.
                </p>
              </Sub>
              <Sub title="7.5 Order Types">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {["Market", "Limit", "Stop-Limit", "Stop-Market", "Trailing Stop", "Post-Only"].map(t => (
                    <div key={t} className="text-center py-2 px-3 bg-secondary/40 rounded-xl border border-border text-xs font-medium text-foreground">{t}</div>
                  ))}
                </div>
              </Sub>
              <Sub title="7.6 Keeper Tier Discounts">
                <p>OrahDEX rewards active participants with progressive fee discounts through Keeper tiers:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Tier</th>
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Maker Fee</th>
                        <th className="text-left py-2 font-semibold text-foreground">Requirements</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Initiate",  "0.20%", "Default tier — all users"],
                        ["Sentinel",  "0.12%", "30d volume ≥ $50,000"],
                        ["Archon",    "0.06%", "30d volume ≥ $500,000"],
                        ["Sovereign", "0.00%", "30d volume ≥ $5,000,000"],
                      ].map(([t, f, r]) => (
                        <tr key={t as string} className="border-b border-border/50">
                          <td className="py-2 pr-4 font-semibold text-primary">{t}</td>
                          <td className="py-2 pr-4 font-mono text-green-400">{f}</td>
                          <td className="py-2 text-muted-foreground">{r}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sub>
            </Section>

            {/* 8. CopyVault */}
            <Section id="copy-vault" title="8. CopyVault — On-Chain Copy Trading">
              <p>
                CopyVault is OrahDEX's proprietary on-chain copy trading system — the first of its kind to combine ERC4626-style vault accounting with BSV on-chain settlement proofs for every mirrored trade. Followers deposit USDT into a leader-managed vault and automatically participate in the leader's trading strategy, with full transparency and on-chain verification.
              </p>

              <Sub title="8.1 Vault Architecture">
                <p>A CopyVault is modelled on the ERC4626 vault standard: a pool of follower capital, represented by fungible vault shares, operated by a single designated leader wallet.</p>
                <Code>{`Share Price = Vault TVL / Total Shares
             (starts at $1.00 USDT per share)

Shares Issued on Deposit:
  shares = depositAmountUsdt / currentSharePrice

Redemption Value on Withdraw:
  redeemValue = sharesOwned × currentSharePrice

Performance Fee (on profit only):
  fee = max(0, redeemValue − depositAmount) × feeRate
  netPayout = redeemValue − fee`}</Code>
              </Sub>

              <Sub title="8.2 Trade Mirroring">
                <p>
                  The OrahDEX off-chain orchestrator monitors all trades on the platform. When a leader wallet executes a trade, the orchestrator computes the vault's proportional allocation and mirrors the trade:
                </p>
                <Code>{`Allocation Ratio = min(1, vaultTvl / leaderPortfolioValue)
Copy Quantity   = leaderQuantity × allocationRatio
Copy Total      = copyQuantity × price

For every mirrored trade:
  • An entry is recorded in copy_vault_trades
  • A BSV OP_RETURN settlement transaction is produced
  • The vault share price is recalculated: newSharePrice = newTvl / totalShares`}</Code>
              </Sub>

              <Sub title="8.3 Vault Lifecycle">
                <ul className="list-disc list-inside space-y-1.5 ml-1">
                  <li><span className="font-medium text-foreground">Deposit:</span> Follower deposits USDT → vault issues shares at current share price. TVL increases.</li>
                  <li><span className="font-medium text-foreground">Trading:</span> Leader trades are mirrored automatically. Vault share price adjusts to reflect PnL.</li>
                  <li><span className="font-medium text-foreground">Withdraw:</span> Follower redeems all shares at current share price. Performance fee deducted from profit only (never on losses). Net USDT returned immediately.</li>
                  <li><span className="font-medium text-foreground">On-Chain Proof:</span> Every vault trade produces a BSV OP_RETURN transaction with full settlement data.</li>
                </ul>
              </Sub>

              <Sub title="8.4 Security & Transparency">
                <ul className="list-disc list-inside space-y-1.5 ml-1">
                  <li>All vault accounting is stored in the OrahDEX PostgreSQL database and cross-referenced with BSV on-chain records.</li>
                  <li>Share price, TVL, and follower count are publicly visible in the CopyVault leaderboard.</li>
                  <li>Performance fee is charged only on realised profit at withdrawal — not on TVL or time.</li>
                  <li>Vault capacity limits (max TVL per vault) prevent any single vault from concentrating systemic risk.</li>
                  <li>Admin panel provides full vault management: create, pause, activate, and audit all vaults and their trade history.</li>
                </ul>
              </Sub>

              <div className="grid grid-cols-3 gap-3">
                <Metric value="ERC4626" label="Vault Model" sub="Share-based accounting" />
                <Metric value="BSV" label="Trade Proofs" sub="OP_RETURN on-chain" />
                <Metric value="0" label="Fee on Losses" sub="Profit-only performance fee" />
              </div>

              <InfoBox title="CopyVault Database Schema" color="violet">
                <p><strong>copy_vaults</strong> — vault config, TVL, share price, PnL stats, leader info, status</p>
                <p><strong>copy_vault_positions</strong> — per-follower share holdings, entry price, current value, realized PnL</p>
                <p><strong>copy_vault_trades</strong> — every mirrored trade with symbol, side, price, quantity, BSV txid</p>
              </InfoBox>
            </Section>

            {/* 9. Ora AI */}
            <Section id="ora-ai" title="9. Ora — Integrated AI Trading Intelligence">
              <p>
                <span className="text-foreground font-medium">Ora</span> is OrahDEX's embedded AI assistant, designed to bring institutional-grade market intelligence to every trader on the platform. Ora is contextually aware of current market prices, the user's active positions, and the full OrahDEX product suite.
              </p>
              <Sub title="9.1 Capabilities">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { title: "Market Analysis", desc: "Real-time commentary on price action, volume, trend direction, and support/resistance levels for any of 934+ trading pairs." },
                    { title: "Trade Assistance", desc: "Helps traders evaluate order sizing, leverage, stop-loss placement, and risk/reward ratios before entering a position." },
                    { title: "CopyVault Guidance", desc: "Analyses vault leaderboards, compares leader performance metrics, and helps followers select vaults aligned with their risk profile." },
                    { title: "Portfolio Coaching", desc: "Reviews open positions, calculates portfolio Greeks, identifies concentration risk, and suggests rebalancing strategies." },
                    { title: "Educational Mode", desc: "Explains trading concepts, DeFi mechanisms, HTLC atomic swaps, AMM mathematics, and BSV settlement in plain language." },
                    { title: "Contextual Awareness", desc: "Ora is aware of the pair currently being viewed, active orderbook state, and recent trades — providing hyper-relevant responses without manual context." },
                  ].map(({ title, desc }) => (
                    <div key={title} className="p-3 bg-amber-400/5 border border-amber-400/15 rounded-xl">
                      <p className="text-xs font-bold text-amber-400 mb-1">{title}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </div>
              </Sub>
              <Sub title="9.2 Architecture">
                <p>
                  Ora is implemented as a streaming chat interface backed by an OpenAI-compatible LLM API. Conversations are stored per-user in the OrahDEX database (conversations + messages tables) providing persistent context across sessions. The system prompt includes OrahDEX platform context, the user's active wallet, and current market state.
                </p>
                <InfoBox title="Ora Technical Config" color="amber">
                  <p>Model: OpenAI-compatible · max_completion_tokens: 8,192 · Streaming: Server-Sent Events</p>
                  <p>Context: Platform description + current pair + user wallet + recent chat history</p>
                  <p>Storage: Persistent per-user conversation history in PostgreSQL</p>
                </InfoBox>
              </Sub>
            </Section>

            {/* 10. Tokenomics */}
            <Section id="tokenomics" title="10. Fee Model & Revenue">
              <p>OrahDEX operates on a transparent, performance-based fee model. No platform token is required to access any trading functionality.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Activity</th>
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Fee</th>
                      <th className="text-left py-2 font-semibold text-foreground">Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Spot — Initiate Maker/Taker", "0.20%", "Protocol treasury + LP rewards"],
                      ["Spot — Sentinel",             "0.12%", "Protocol treasury + LP rewards"],
                      ["Spot — Archon",               "0.06%", "Protocol treasury + LP rewards"],
                      ["Spot — Sovereign",            "0.00%", "Zero trading fee"],
                      ["Futures — Maker",             "0.02%", "Protocol treasury"],
                      ["Futures — Taker",             "0.06%", "Protocol treasury"],
                      ["AMM Swap",                    "0.30%", "83.3% LPs · 16.7% treasury"],
                      ["VAMM Swap (Genesis)",         "0.30%", "100% protocol treasury (simulated — no real settlement)"],
                      ["Bridge Transfer",             "0.20%", "Relayer network + protocol"],
                      ["P2P Trade",                   "0.50%", "Protocol treasury + arbitrators"],
                      ["CopyVault Perf. Fee",         "5–15%", "On profits only, at withdrawal. Configurable per vault by leader."],
                      ["Withdrawal (BSV)",            "< $0.001", "Miner fees (pass-through)"],
                    ].map(([a, f, d]) => (
                      <tr key={a as string} className="border-b border-border/50">
                        <td className="py-2 pr-4 text-muted-foreground">{a}</td>
                        <td className="py-2 pr-4 font-mono text-primary font-semibold">{f}</td>
                        <td className="py-2 text-muted-foreground">{d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <InfoBox title="Protocol Treasury Usage" color="green">
                <p>40% → Platform development and engineering</p>
                <p>25% → Security audits and bug bounties</p>
                <p>20% → Community growth and liquidity incentives</p>
                <p>15% → Legal, compliance, and operational costs</p>
              </InfoBox>
            </Section>

            {/* 11. Security */}
            <Section id="security" title="11. Security Model">
              <p>Security is the foundational requirement of any financial platform. OrahDEX employs defence-in-depth across all layers:</p>
              <div className="space-y-3">
                {[
                  { title: "Non-Custodial Architecture", desc: "User funds never touch OrahDEX servers. All assets are held in user-controlled wallets or on-chain HTLC contracts. There is no honeypot for hackers to target." },
                  { title: "ECDSA Order Signing", desc: "All spot limit orders are signed by the user's private key (ECDSA personal_sign) before submission. The signature proves the trader authorised the order, preventing spoofing." },
                  { title: "Smart Contract Audits", desc: "All OrahDEX smart contracts undergo mandatory third-party security audits before mainnet deployment. Audit reports are published publicly." },
                  { title: "Bug Bounty Program", desc: "OrahDEX maintains an active bug bounty program with rewards up to $250,000 for critical vulnerabilities submitted through responsible disclosure." },
                  { title: "HTLC Time-Lock Safety", desc: "All cross-chain HTLCs have enforced time locks. If any party fails to act, funds automatically refund on-chain. No human intervention required." },
                  { title: "CopyVault Capacity Limits", desc: "Each vault has a configurable maximum TVL cap. No single vault can accumulate unbounded systemic risk. Vault status can be paused by admin in real-time." },
                  { title: "Admin Multi-Sig & 2FA", desc: "Admin panel requires TOTP two-factor authentication. Critical protocol parameter changes require multi-signature approval from a time-locked governance multi-sig wallet." },
                  { title: "Real-Time Monitoring", desc: "OrahDEX operates 24/7 on-chain monitoring for anomalous transaction patterns, unusual price movements, and smart contract events. Alerts trigger automated circuit breakers." },
                ].map(({ title, desc }) => (
                  <div key={title} className="flex gap-3 p-3 bg-card border border-border rounded-xl">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-foreground">{title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* 12. Roadmap */}
            <Section id="roadmap" title="12. Roadmap">
              <div className="space-y-4">
                {[
                  {
                    phase: "Phase 1 — Foundation",
                    date: "Q1–Q2 2026",
                    status: "complete",
                    items: [
                      "Launch spot trading with 934+ pairs across 200+ networks (sovereign oracle)",
                      "BSV HTLC settlement integration + OP_RETURN trade proofs",
                      "EVM wallet support via Reown/WalletConnect (20+ networks)",
                      "TRON network support — TRX + TRC-20 USDT (6 TRON wallets: TronLink, TokenPocket, OKX, Bitget, Trust, imToken)",
                      "Perpetual futures with up to 100x leverage",
                      "200+ network multi-chain market explorer (sovereign oracle)",
                      "OrahDEX Base chain liquidity integration",
                      "P2P marketplace with HTLC escrow",
                      "AMM liquidity pools (x·y=k constant product) with AmmSwapSimulator",
                      "Genesis Liquidity Engine — Virtual AMM (VAMM) with linear bonding curves for 56+ assets",
                      "VAMM embedded in Market Hub — ⚡ button on every coin row, VAMM panel in coin detail modal",
                      "Trade receipt system with Trade ID, curve price, fee breakdown, simulation history",
                      "Cross-chain HTLC bridge (BSV ↔ EVM)",
                      "CopyVault on-chain copy trading system (ERC4626 vaults + BSV proofs)",
                      "Ora AI trading assistant (streaming LLM, persistent history)",
                      "Admin panel with full platform configuration (25+ admin pages)",
                      "Keeper tier fee structure (Initiate → Sovereign)",
                      "Fiat on-ramp (MoonPay, Transak, Banxa, Simplex, Ramp)",
                      "OrahChart cross-pair chart engine (adaptive decimal precision)",
                      "4 theme modes: Dark, Light, AMOLED, System",
                    ],
                  },
                  {
                    phase: "Phase 2 — Mobile & Derivatives",
                    date: "Q3 2026",
                    status: "upcoming",
                    items: [
                      "Native iOS + Android app (Expo React Native)",
                      "Mobile CopyVault experience with biometric auth",
                      "Advanced order types (TWAP, VWAP, iceberg, conditional)",
                      "Options trading (European-style, BSV-settled)",
                      "Structured products (delta-neutral yield vaults)",
                      "Impermanent loss insurance fund",
                      "KYC/AML integration for institutional users",
                      "WebSocket real-time order book feeds",
                    ],
                  },
                  {
                    phase: "Phase 3 — Institutional & Governance",
                    date: "Q4 2026",
                    status: "planned",
                    items: [
                      "Decentralised governance model (on-chain voting)",
                      "Institutional API with co-location support and FIX protocol",
                      "CopyVault social features (leader rankings, performance badges)",
                      "Cross-chain NFT marketplace integration",
                      "OrahDEX SDK for third-party integrations",
                      "Ora AI v2 — proactive trade signals and portfolio alerts",
                    ],
                  },
                  {
                    phase: "Phase 4 — Global Expansion",
                    date: "2027",
                    status: "planned",
                    items: [
                      "Regulatory licensing in target jurisdictions (EU MiCA, Singapore MAS)",
                      "OTC desk for high-net-worth clients",
                      "ZK-proof privacy layer for sensitive trades",
                      "Decentralised identity (DID) integration",
                      "Integration with traditional finance rails (SWIFT, SEPA)",
                      "OrahDEX Layer 2 on BSV for ultra-high-frequency settlement",
                    ],
                  },
                ].map(({ phase, date, status, items }) => (
                  <div key={phase} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        "w-3 h-3 rounded-full border-2 mt-0.5 shrink-0",
                        status === "complete" ? "bg-primary border-primary" : status === "upcoming" ? "bg-primary/30 border-primary" : "bg-transparent border-border",
                      )} />
                      <div className="w-px flex-1 bg-border mt-1" />
                    </div>
                    <div className="pb-6 flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-bold text-sm text-foreground">{phase}</p>
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border",
                          status === "complete" ? "bg-green-400/10 text-green-400 border-green-400/20" :
                          status === "upcoming" ? "bg-primary/10 text-primary border-primary/20" :
                          "bg-secondary text-muted-foreground border-border",
                        )}>
                          {status === "complete" ? "✓ Launched" : status === "upcoming" ? "In Progress" : "Planned"}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">{date}</span>
                      </div>
                      <ul className="space-y-1">
                        {items.map(item => (
                          <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <span className={cn(
                              "mt-1.5 w-1 h-1 rounded-full shrink-0",
                              status === "complete" ? "bg-primary" : "bg-muted-foreground/50",
                            )} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Conclusion */}
            <Section id="conclusion" title="Conclusion" accent>
              <p>
                OrahDEX represents a fundamentally new approach to decentralised trading — one that does not compromise between security and usability, between DeFi and CeFi, or between Bitcoin, Ethereum, and TRON. By building native BSV settlement into its core, OrahDEX accesses a blockchain that is technically superior for the settlement use case: unlimited scalability, sub-cent fees, and UTXO-based programmability through powerful Script capabilities.
              </p>
              <p>
                The combination of HTLC atomic swaps, the Genesis Liquidity Engine (Virtual AMM with linear bonding curves), concentrated AMM liquidity, perpetual futures, P2P markets, cross-chain bridging, TRON/TRC-20 native support, and the world's first on-chain copy trading system (CopyVault) — all in a single, non-custodial interface guided by Ora AI — positions OrahDEX as the most comprehensive decentralised trading platform available.
              </p>
              <p>
                With <strong>934+ trading pairs</strong>, <strong>56+ VAMM-guaranteed markets</strong>, access to <strong>200+ blockchain networks</strong> via OrahDEX's own sovereign oracle, five distinct trading instruments, native TRON wallet support, and a self-sovereign identity designed for the next generation of traders — OrahDEX is not a product iteration. It is a paradigm shift.
              </p>
              <p>
                We invite traders, liquidity providers, copy trading leaders, developers, and partners to join us in building the future of decentralised finance.
              </p>
              <div className="flex items-center justify-center pt-4">
                <OrahInline className="text-xl justify-center" />
              </div>
              <p className="text-center text-primary font-semibold">Trade means DEX</p>
            </Section>

            {/* Disclaimer */}
            <Section id="disclaimer" title="Legal Disclaimer">
              <div className="p-4 bg-amber-400/5 border border-amber-400/20 rounded-xl space-y-2 text-xs text-amber-200/80">
                <p className="font-bold text-amber-300">IMPORTANT — PLEASE READ CAREFULLY</p>
                <p>
                  This White Paper is published for informational purposes only and does not constitute financial, investment, legal, or tax advice. Nothing in this document constitutes an offer to sell, a solicitation of an offer to buy, or a recommendation of any security, cryptocurrency, or any other financial instrument.
                </p>
                <p>
                  Cryptocurrency trading involves substantial risk. You may lose all of your invested capital. Past performance is not indicative of future results. CopyVault returns displayed in the leaderboard are historical and do not guarantee future results. Copy trading involves the risk of losing capital even when following successful leaders.
                </p>
                <p>
                  The information in this document reflects the current state and plans of OrahDEX as of the publication date and is subject to change without notice. OrahDEX does not guarantee the accuracy or completeness of the information in this document.
                </p>
                <p>
                  The roadmap timelines and features described are aspirational and subject to change based on technical, regulatory, and market conditions. This document may not be distributed in any jurisdiction where such distribution would be unlawful.
                </p>
                <p className="font-medium text-amber-300">
                  © {new Date().getFullYear()} OrahDEX. All rights reserved. Version {VERSION} · {PUBLISH_DATE}
                </p>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
