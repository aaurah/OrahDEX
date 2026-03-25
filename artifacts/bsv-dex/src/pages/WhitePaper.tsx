import { useState } from "react";
import { ArrowLeft, FileText, Download, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { OrahInline, BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

const VERSION = "1.0.0";
const PUBLISH_DATE = "25 March 2026";

const TOC = [
  { id: "abstract",       label: "Abstract" },
  { id: "problem",        label: "1. Problem Statement" },
  { id: "solution",       label: "2. The OrahDEX Solution" },
  { id: "architecture",   label: "3. Technical Architecture" },
  { id: "bsv-settlement", label: "4. BSV On-Chain Settlement" },
  { id: "amm",            label: "5. AMM Liquidity Pools" },
  { id: "cross-chain",    label: "6. Cross-Chain Bridge" },
  { id: "trading",        label: "7. Trading Engine" },
  { id: "tokenomics",     label: "8. Fee Model & Tokenomics" },
  { id: "security",       label: "9. Security Model" },
  { id: "roadmap",        label: "10. Roadmap" },
  { id: "conclusion",     label: "Conclusion" },
  { id: "disclaimer",     label: "Legal Disclaimer" },
];

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

function InfoBox({ title, children, color = "blue" }: { title: string; children: React.ReactNode; color?: "blue" | "green" | "amber" }) {
  const colors = {
    blue: "bg-blue-400/5 border-blue-400/20 text-blue-300",
    green: "bg-green-400/5 border-green-400/20 text-green-300",
    amber: "bg-amber-400/5 border-amber-400/20 text-amber-300",
  };
  return (
    <div className={cn("p-4 rounded-xl border space-y-1", colors[color])}>
      <p className="font-semibold text-xs uppercase tracking-wider">{title}</p>
      <div className="text-xs leading-relaxed opacity-90">{children}</div>
    </div>
  );
}

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
          {/* Sidebar TOC — desktop */}
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
                A multi-chain, non-custodial decentralised exchange with native Bitcoin SV on-chain settlement, cross-chain atomic swaps, automated market making, and perpetual futures.
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span>Version {VERSION}</span>
                <span>·</span>
                <span>{PUBLISH_DATE}</span>
                <span>·</span>
                <a href="https://orahdex.org" className="text-primary hover:underline flex items-center gap-1">orahdex.org <ExternalLink className="w-2.5 h-2.5" /></a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mx-4 sm:mx-8 pt-2">
                <Metric value="226+" label="Trading Pairs" sub="Spot + Futures" />
                <Metric value="200+" label="Networks" sub="via GeckoTerminal" />
                <Metric value="0%" label="Custody Risk" sub="Non-custodial" />
                <Metric value="BSV" label="Settlement Layer" sub="On-chain HTLC" />
              </div>
            </div>

            {/* Abstract */}
            <Section id="abstract" title="Abstract" accent>
              <p>
                OrahDEX is a next-generation, fully non-custodial decentralised exchange (DEX) protocol that unifies spot trading, perpetual futures, automated market making (AMM), peer-to-peer (P2P) trading, cross-chain bridging, and fiat on-ramp services within a single, seamless interface.
              </p>
              <p>
                At its core, OrahDEX leverages <span className="text-foreground font-medium">Bitcoin SV (BSV)</span> as its primary settlement layer, exploiting BSV's massively scalable, low-fee, and UTXO-based blockchain to execute Hash Time-Locked Contract (HTLC) atomic swaps that are provably fair and fully transparent. EVM-compatible chains (Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, and more) are supported natively through Reown/WalletConnect integration.
              </p>
              <p>
                OrahDEX aggregates live price feeds from CoinGecko, CoinMarketCap, GeckoTerminal (200+ networks), and DexScreener, giving traders access to the same market intelligence as institutional players. The platform introduces a novel <span className="text-foreground font-medium">cross-chain HTLC bridge</span> that allows trustless asset swaps between BSV and any EVM-compatible network without custodial intermediaries.
              </p>
              <p>
                This white paper describes the technical architecture, economic model, security design, and strategic roadmap of OrahDEX.
              </p>
            </Section>

            {/* 1. Problem */}
            <Section id="problem" title="1. Problem Statement">
              <p>
                The global cryptocurrency trading market processes trillions of dollars in volume annually, yet the majority of this activity flows through <span className="text-foreground font-medium">centralised exchanges (CEXs)</span> — platforms that require users to surrender custody of their assets, comply with extensive KYC, and trust a central authority that history has shown to be vulnerable to hacks, insolvency, and regulatory shutdown.
              </p>
              <p>
                Existing decentralised alternatives suffer from their own set of limitations:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { problem: "Fragmentation", detail: "Liquidity is split across hundreds of protocols and chains, forcing users to manage multiple wallets, bridges, and interfaces." },
                  { problem: "High Fees", detail: "Ethereum-based DEXs charge prohibitive gas fees that make small trades uneconomical, pricing out retail users." },
                  { problem: "Poor UX", detail: "Most DEXs require deep technical knowledge. Seed phrase management, gas estimation, and slippage settings are inaccessible to mainstream users." },
                  { problem: "Limited Instruments", detail: "DEX offerings are almost exclusively limited to spot swaps. Perpetual futures, P2P markets, and fiat rails are virtually absent." },
                  { problem: "Custodial Bridges", detail: "Cross-chain bridges are the single largest source of crypto losses, having suffered over $2.5B in hacks due to their custodial intermediary models." },
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
              <p>
                OrahDEX addresses these problems through a unified, non-custodial trading platform built on three foundational principles:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { title: "Non-Custodial", icon: "🔐", desc: "Users retain full control of their private keys and assets at all times. OrahDEX never holds user funds." },
                  { title: "Multi-Chain", icon: "🌐", desc: "Native support for BSV, Ethereum, and 10+ EVM chains. One interface — every chain." },
                  { title: "Full-Spectrum", icon: "📊", desc: "Spot, futures, AMM, P2P, bridge, and fiat on-ramp — every trading instrument in one platform." },
                ].map(({ title, icon, desc }) => (
                  <div key={title} className="p-4 bg-primary/5 border border-primary/15 rounded-2xl text-center space-y-2">
                    <div className="text-2xl">{icon}</div>
                    <p className="font-bold text-sm text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
              <p>
                OrahDEX combines the transparency and trustlessness of DeFi with the usability and feature-richness of CeFi — without the custody risk. By building BSV settlement into the core architecture, OrahDEX achieves per-transaction fees below $0.001, enabling micro-trades and high-frequency strategies that are impractical on Ethereum.
              </p>
            </Section>

            {/* 3. Architecture */}
            <Section id="architecture" title="3. Technical Architecture">
              <p>OrahDEX is composed of four primary layers:</p>
              <div className="space-y-3">
                {[
                  {
                    layer: "Layer 1 — Settlement",
                    color: "text-green-400",
                    bg: "bg-green-400/5 border-green-400/15",
                    desc: "Bitcoin SV blockchain for on-chain UTXO-based HTLC settlement. Immutable, transparent, and final.",
                  },
                  {
                    layer: "Layer 2 — Protocol",
                    color: "text-blue-400",
                    bg: "bg-blue-400/5 border-blue-400/15",
                    desc: "OrahDEX smart contracts on EVM chains (Uniswap V3 fork for AMM, custom order book contracts for limit orders). HTLC scripts on BSV.",
                  },
                  {
                    layer: "Layer 3 — Application",
                    color: "text-violet-400",
                    bg: "bg-violet-400/5 border-violet-400/15",
                    desc: "Express.js API server providing order book management, price aggregation, user account management, and WebSocket real-time feeds.",
                  },
                  {
                    layer: "Layer 4 — Interface",
                    color: "text-primary",
                    bg: "bg-primary/5 border-primary/15",
                    desc: "React + Vite progressive web application. Fully responsive (mobile + desktop). Dark/Light/AMOLED themes. WalletConnect/Reown for EVM. Native BSV wallet integration.",
                  },
                ].map(({ layer, color, bg, desc }) => (
                  <div key={layer} className={cn("p-4 rounded-xl border", bg)}>
                    <p className={cn("font-bold text-xs mb-1", color)}>{layer}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
              <InfoBox title="Key Technology Stack" color="blue">
                <p>Frontend: React 18 + Vite 7 + TailwindCSS · Backend: Node.js + Express 5 + Drizzle ORM</p>
                <p>Database: PostgreSQL · EVM Integration: Wagmi + Viem + Reown AppKit</p>
                <p>BSV Integration: WhatsOnChain API + native UTXO construction · Charts: Lightweight-charts</p>
              </InfoBox>
            </Section>

            {/* 4. BSV Settlement */}
            <Section id="bsv-settlement" title="4. BSV On-Chain Settlement via HTLC">
              <p>
                OrahDEX uses <span className="text-foreground font-medium">Hash Time-Locked Contracts (HTLCs)</span> on the Bitcoin SV blockchain for trustless cross-chain settlement. HTLCs are a proven cryptographic primitive that enable atomic swaps — where either both legs of a trade execute, or neither does.
              </p>
              <Sub title="How an OrahDEX BSV Trade Works">
                <ol className="list-decimal list-inside space-y-2 ml-1">
                  <li>Maker generates a secret preimage <span className="font-mono text-green-400">R</span> and its hash <span className="font-mono text-green-400">H = SHA256(R)</span>.</li>
                  <li>Maker locks funds in a BSV HTLC script: <em>"Pay to Taker if Taker reveals R within T blocks; else refund to Maker."</em></li>
                  <li>Taker verifies the HTLC on-chain and locks corresponding funds in the reciprocal leg (BSV or EVM).</li>
                  <li>Maker reveals <span className="font-mono text-green-400">R</span>, claiming Taker's funds. Revelation of <span className="font-mono text-green-400">R</span> on-chain simultaneously allows Taker to claim Maker's funds.</li>
                  <li>If either party fails to act within the time lock, all funds are automatically refunded. No custodian required.</li>
                </ol>
              </Sub>
              <Code>{`OP_IF
  OP_SHA256 <H> OP_EQUALVERIFY
  OP_DUP OP_HASH160 <TakerPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
OP_ELSE
  <LockTime> OP_CHECKLOCKTIMEVERIFY OP_DROP
  OP_DUP OP_HASH160 <MakerPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
OP_ENDIF`}</Code>
              <p>
                BSV's sub-cent transaction fees and 10-minute block times (with instant zero-confirmation for low-value trades) make it the optimal settlement layer for cross-chain atomic swaps at scale.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Metric value="< $0.001" label="BSV Tx Fee" sub="Per settlement" />
                <Metric value="0" label="Counterparty Risk" sub="Trustless HTLC" />
                <Metric value="100%" label="On-Chain Proof" sub="Publicly verifiable" />
              </div>
            </Section>

            {/* 5. AMM */}
            <Section id="amm" title="5. AMM Liquidity Pools">
              <p>
                OrahDEX's on-chain liquidity is provided through <span className="text-foreground font-medium">Automated Market Maker (AMM) pools</span> deployed as smart contracts on EVM-compatible chains. The protocol uses a concentrated liquidity model inspired by Uniswap V3, allowing liquidity providers (LPs) to specify price ranges for their capital, maximising fee efficiency.
              </p>
              <Sub title="Constant Product Formula (x · y = k)">
                <p>For standard pools, OrahDEX uses the constant product invariant:</p>
                <Code>{`x * y = k
Where:
  x = reserve of Token A
  y = reserve of Token B
  k = constant (preserved by every swap)

Price of A in terms of B = y / x
Effective price with fee: (y - Δy) / (x + Δx * (1 - fee))`}</Code>
              </Sub>
              <Sub title="Impermanent Loss Protection (Roadmap)">
                <p>OrahDEX plans to introduce an impermanent loss insurance fund in Q3 2026, funded by a portion of protocol trading fees, to compensate LPs for sustained directional moves in pool-paired assets.</p>
              </Sub>
              <InfoBox title="AMM Fee Distribution" color="green">
                <p>80% of AMM swap fees → Liquidity Providers (proportional to pool share)</p>
                <p>15% of AMM swap fees → OrahDEX Protocol Treasury</p>
                <p>5% of AMM swap fees → Impermanent Loss Insurance Fund</p>
              </InfoBox>
            </Section>

            {/* 6. Bridge */}
            <Section id="cross-chain" title="6. Cross-Chain Bridge">
              <p>
                The OrahDEX Bridge enables trustless asset transfers between BSV and EVM-compatible networks using HTLC atomic swaps — eliminating the custodial risk that has made traditional bridges the most dangerous component in DeFi.
              </p>
              <Sub title="Bridge Architecture">
                <ul className="list-disc list-inside space-y-1.5 ml-1">
                  <li><span className="font-medium text-foreground">No Wrapped Tokens:</span> OrahDEX bridges move native assets directly using atomic swaps rather than minting synthetic wrapped versions, eliminating the de-peg risk of wrapped tokens.</li>
                  <li><span className="font-medium text-foreground">Relayer Network:</span> A decentralised network of OrahDEX relayers facilitates HTLC coordination between chains. Relayers are economically incentivised and operate in a trust-minimised fashion.</li>
                  <li><span className="font-medium text-foreground">Time-Lock Safety:</span> All cross-chain HTLCs have configurable time locks (minimum 24 hours for large amounts). Expired HTLCs automatically refund to the sender on-chain.</li>
                  <li><span className="font-medium text-foreground">Watchtower Services:</span> OrahDEX operates watchtower nodes that monitor pending HTLCs and automatically execute refunds if the counterparty fails to act.</li>
                </ul>
              </Sub>
              <InfoBox title="Supported Bridge Pairs (Phase 1)" color="blue">
                <p>BSV ↔ ETH · BSV ↔ BNB · BSV ↔ MATIC · BSV ↔ USDT (BSV) ↔ USDT (ERC-20)</p>
                <p>Additional pairs added based on liquidity and community governance.</p>
              </InfoBox>
            </Section>

            {/* 7. Trading */}
            <Section id="trading" title="7. Trading Engine">
              <Sub title="7.1 Spot Trading">
                <p>
                  Spot trading is available for 226+ pairs. Market orders are routed to the best available source — AMM pool, on-chain order book, or P2P matching — with smart order routing selecting the lowest slippage path. Limit orders are signed by the user (ECDSA) and held in the OrahDEX order book until filled; the platform broadcasts the settlement transaction only when a counterparty is matched.
                </p>
              </Sub>
              <Sub title="7.2 Perpetual Futures">
                <p>
                  OrahDEX offers perpetual futures contracts with up to 100x leverage. Positions are tracked by the OrahDEX protocol and settled against mark prices derived from an aggregated oracle (CoinGecko + CMC + on-chain TWAP). Funding rates are exchanged between long and short positions every 8 hours to keep perpetual prices anchored to spot.
                </p>
                <Code>{`Funding Rate = (Perpetual Price - Index Price) / Index Price × (1/24)
Position PnL = (Exit Price - Entry Price) × Position Size × Direction
Liquidation Price = Entry Price × (1 - Initial Margin / Leverage)`}</Code>
              </Sub>
              <Sub title="7.3 P2P Trading">
                <p>
                  OrahDEX's P2P marketplace enables direct peer-to-peer trades with custom payment methods including bank transfer, mobile money, and local fiat options. Trades are secured by a BSV HTLC escrow that releases automatically when both parties confirm completion. Dispute resolution is handled by OrahDEX's decentralised arbitration panel.
                </p>
              </Sub>
              <Sub title="7.4 Order Types">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {["Market", "Limit", "Stop-Limit", "Stop-Market", "Trailing Stop", "Post-Only"].map(t => (
                    <div key={t} className="text-center py-2 px-3 bg-secondary/40 rounded-xl border border-border text-xs font-medium text-foreground">{t}</div>
                  ))}
                </div>
              </Sub>
            </Section>

            {/* 8. Tokenomics */}
            <Section id="tokenomics" title="8. Fee Model & Revenue">
              <p>OrahDEX operates on a transparent, performance-based fee model with no platform token required to access trading functionality.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Activity</th>
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Fee</th>
                      <th className="text-left py-2 font-semibold text-foreground">Distribution</th>
                    </tr>
                  </thead>
                  <tbody className="space-y-1">
                    {[
                      ["Spot — Maker", "0.10%", "Protocol treasury + LP rewards"],
                      ["Spot — Taker", "0.10%", "Protocol treasury + LP rewards"],
                      ["Futures — Maker", "0.02%", "Protocol treasury"],
                      ["Futures — Taker", "0.06%", "Protocol treasury"],
                      ["AMM Swap", "0.30%", "80% LPs · 15% treasury · 5% IL fund"],
                      ["Bridge Transfer", "0.20%", "Relayer network + protocol"],
                      ["P2P Trade", "0.50%", "Protocol treasury + arbitrators"],
                      ["Withdrawal (BSV)", "< 0.001 BSV", "Miner fees (pass-through)"],
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

            {/* 9. Security */}
            <Section id="security" title="9. Security Model">
              <p>Security is the foundational requirement of any financial platform. OrahDEX employs defence-in-depth across all layers:</p>
              <div className="space-y-3">
                {[
                  { title: "Non-Custodial Architecture", desc: "User funds never touch OrahDEX servers. All assets are held in user-controlled wallets or on-chain HTLC contracts. There is no honeypot for hackers to target." },
                  { title: "Smart Contract Audits", desc: "All OrahDEX smart contracts undergo mandatory third-party security audits before mainnet deployment. Audit reports are published publicly." },
                  { title: "Bug Bounty Program", desc: "OrahDEX maintains an active bug bounty program with rewards up to $250,000 for critical vulnerabilities submitted through responsible disclosure." },
                  { title: "HTLC Time-Lock Safety", desc: "All cross-chain HTLCs have enforced time locks. If any party fails to act, funds automatically refund on-chain. No human intervention required." },
                  { title: "Admin Multi-Sig", desc: "Critical protocol parameter changes require multi-signature approval from a time-locked governance multi-sig wallet. No single point of administrative compromise." },
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

            {/* 10. Roadmap */}
            <Section id="roadmap" title="10. Roadmap">
              <div className="space-y-4">
                {[
                  {
                    phase: "Phase 1 — Foundation",
                    date: "Q1–Q2 2026",
                    status: "complete",
                    items: [
                      "Launch spot trading with 226+ pairs",
                      "BSV HTLC settlement integration",
                      "EVM wallet support via Reown/WalletConnect",
                      "Perpetual futures with up to 100x leverage",
                      "GeckoTerminal 200+ network market explorer",
                      "DexScreener Base chain integration",
                      "P2P marketplace launch",
                      "Admin panel with full platform configuration",
                      "Fiat on-ramp (MoonPay, Transak, Banxa, Simplex, Ramp)",
                    ],
                  },
                  {
                    phase: "Phase 2 — DeFi Expansion",
                    date: "Q3 2026",
                    status: "upcoming",
                    items: [
                      "AMM liquidity pools on Ethereum + BSV",
                      "Cross-chain HTLC bridge (BSV ↔ EVM)",
                      "LP dashboard and impermanent loss analytics",
                      "Mobile native app (iOS + Android)",
                      "Advanced order types (TWAP, VWAP, iceberg)",
                      "Copy trading and signal marketplace",
                      "KYC/AML integration for institutional users",
                    ],
                  },
                  {
                    phase: "Phase 3 — Institutional & Governance",
                    date: "Q4 2026",
                    status: "planned",
                    items: [
                      "Decentralised governance model",
                      "Institutional API with co-location support",
                      "Options trading (European-style)",
                      "Structured products (yield vaults, delta-neutral strategies)",
                      "Cross-chain NFT marketplace integration",
                      "OrahDEX SDK for third-party integrations",
                    ],
                  },
                  {
                    phase: "Phase 4 — Global Expansion",
                    date: "2027",
                    status: "planned",
                    items: [
                      "Regulatory licensing in target jurisdictions",
                      "OTC desk for high-net-worth clients",
                      "Decentralised identity (DID) integration",
                      "ZK-proof privacy layer for sensitive trades",
                      "Integration with traditional finance rails (SWIFT, SEPA)",
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
                OrahDEX represents a fundamentally new approach to decentralised trading — one that does not compromise between security and usability, between DeFi and CeFi, or between Bitcoin and Ethereum. By building native BSV settlement into its core, OrahDEX accesses a blockchain that is technically superior for the settlement use case: unlimited scalability, sub-cent fees, and UTXO-based programmability through powerful Script capabilities.
              </p>
              <p>
                The combination of HTLC atomic swaps, concentrated AMM liquidity, perpetual futures, P2P markets, and a cross-chain bridge — all in a single, non-custodial interface — positions OrahDEX as the most comprehensive decentralised trading platform available.
              </p>
              <p>
                We invite traders, liquidity providers, developers, and partners to join us in building the future of decentralised finance.
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
                  Cryptocurrency trading involves substantial risk. You may lose all of your invested capital. Past performance is not indicative of future results. The information in this document reflects the current state and plans of OrahDEX as of the publication date and is subject to change without notice.
                </p>
                <p>
                  OrahDEX does not guarantee the accuracy or completeness of the information in this document. The roadmap timelines and features described are aspirational and subject to change based on technical, regulatory, and market conditions.
                </p>
                <p>
                  This document may not be distributed in any jurisdiction where such distribution would be unlawful. Recipients in prohibited jurisdictions should not rely on any information contained herein.
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
