import { useState } from "react";
import { ArrowLeft, FileText, Download, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { OrahInline, BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

const VERSION = "4.0.0";
const PUBLISH_DATE = "4 April 2026";

const TOC = [
  { id: "abstract",         label: "Abstract" },
  { id: "problem",          label: "1. Problem Statement" },
  { id: "solution",         label: "2. The OrahDEX Solution" },
  { id: "architecture",     label: "3. Technical Architecture" },
  { id: "bsv-settlement",   label: "4. BSV On-Chain Settlement" },
  { id: "amm",              label: "5. AMM & Liquidity Pools" },
  { id: "genesis-vamm",     label: "5.4 Genesis Liquidity Engine" },
  { id: "cross-chain",      label: "6. Cross-Chain Bridge" },
  { id: "trading",          label: "7. Trading Engine" },
  { id: "copy-vault",       label: "8. CopyVault System" },
  { id: "ora-ai",           label: "9. Ora AI Integration" },
  { id: "tokenomics",       label: "10. Fee Model & Revenue" },
  { id: "security",         label: "11. Security Model" },
  { id: "crypto-foundation",label: "12. Cryptographic Foundations" },
  { id: "indestructibility",label: "13. Protocol Indestructibility" },
  { id: "disruption",       label: "14. The Disruption Calculus" },
  { id: "adversarial",      label: "15. Adversarial Resilience" },
  { id: "game-theory",      label: "16. Game Theory of Self-Custody" },
  { id: "network-effect",   label: "17. Network Effect Mechanics" },
  { id: "compliance",       label: "18. Sovereign Status" },
  { id: "identity",         label: "18.2 Identity Sovereignty" },
  { id: "roadmap",          label: "19. Roadmap" },
  { id: "conclusion",       label: "Conclusion" },
  { id: "disclaimer",       label: "Legal Disclaimer" },
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
          <aside className="hidden lg:block w-52 shrink-0">
            <div className="sticky top-20 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-3 mb-2">Contents</p>
              {TOC.map(t => (
                <TocEntry key={t.id} id={t.id} label={t.label} active={activeSection === t.id} onClick={() => scrollTo(t.id)} />
              ))}
            </div>
          </aside>

          <div className="flex-1 min-w-0 space-y-12">
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

            {/* ── COVER ── */}
            <div className="text-center space-y-5 py-8 border border-border rounded-3xl bg-gradient-to-b from-primary/5 to-transparent">
              <div className="flex justify-center">
                <BrandLogo textSize="text-4xl" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">OrahDEX White Paper</h1>
                <p className="text-primary font-semibold mt-1 text-lg">Trade means DEX</p>
              </div>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed px-4">
                A sovereign, permissionless, multi-chain trading protocol with native Bitcoin SV on-chain settlement, cross-chain atomic swaps, Genesis Liquidity Engine (Virtual AMM), perpetual futures, on-chain CopyVault copy trading, AI intelligence (Ora), and zero PII collection — built to outlast any regulatory regime or competitive incumbent.
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground flex-wrap px-4">
                <span>Version {VERSION}</span>
                <span>·</span>
                <span>{PUBLISH_DATE}</span>
                <span>·</span>
                <a href="https://orahdex.org" className="text-primary hover:underline flex items-center gap-1">orahdex.org <ExternalLink className="w-2.5 h-2.5" /></a>
                <span>·</span>
                <a href="https://orahdex.com" className="text-primary hover:underline flex items-center gap-1">orahdex.com <ExternalLink className="w-2.5 h-2.5" /></a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mx-4 sm:mx-8 pt-2">
                <Metric value="950+" label="Trading Pairs" sub="Spot · Futures · VAMM" />
                <Metric value="200+" label="Networks" sub="EVM · TRON · BSV oracle" />
                <Metric value="56+" label="VAMM Markets" sub="Genesis Liquidity Engine" />
                <Metric value="$0 PII" label="Identity Model" sub="Cryptographic-only, no KYC" />
              </div>
            </div>

            {/* ── ABSTRACT ── */}
            <Section id="abstract" title="Abstract" accent>
              <p>
                OrahDEX is a <span className="text-foreground font-medium">sovereign, permissionless trading protocol</span> — not a company, not a product, not a financial intermediary. It is a set of cryptographic rules, smart contracts, and open-source mathematics that connect willing counterparties directly on-chain, with no intermediary, no custody, and no personally identifiable information collected at any layer of the system.
              </p>
              <p>
                The protocol unifies spot trading, perpetual futures, Virtual AMM (Genesis Liquidity Engine), automated market making (AMM), peer-to-peer (P2P) settlement, cross-chain atomic bridging, on-chain copy trading (CopyVault), and AI-powered market intelligence (Ora) — across 200+ blockchain networks, 950+ trading pairs, and every major wallet type — within a single sovereign interface that any human on earth with internet access can use without asking permission from anyone.
              </p>
              <p>
                At its core, OrahDEX leverages <span className="text-foreground font-medium">Bitcoin SV (BSV)</span> as its immutable settlement layer. BSV's UTXO-based architecture, unbounded block size, and sub-cent fee structure make it the only public blockchain capable of recording every trade as an on-chain OP_RETURN proof without economic friction. Hash Time-Locked Contract (HTLC) atomic swaps execute cross-chain settlements without trusting any third party. EVM chains (Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche, zkSync, Scroll, Linea, Mantle, Cronos) are natively supported via Reown/WalletConnect. TRON (TRX and TRC-20 USDT) is natively supported giving hundreds of millions of TRON-ecosystem users full access to OrahDEX without wrapping, bridging, or converting.
              </p>
              <p>
                The <span className="text-foreground font-medium">Genesis Liquidity Engine</span> is OrahDEX's proprietary Virtual AMM — a linear bonding curve mechanism that guarantees every listed asset is instantly tradeable before real liquidity exists, eliminating the cold-start problem that has plagued every new DEX in history.
              </p>
              <p>
                The <span className="text-foreground font-medium">CopyVault system</span> is the world's first on-chain copy trading protocol — followers deposit USDT into leader-managed vaults, automatically mirror proportional trades, and receive BSV OP_RETURN proofs for every mirrored execution — immutable, publicly auditable, trustless.
              </p>
              <p>
                This document presents the technical architecture, economic model, cryptographic foundations, security design, disruption analysis, adversarial resilience model, and strategic roadmap of OrahDEX as of version {VERSION}. It is written for regulators, engineers, institutional participants, and sovereign individuals equally — because OrahDEX is relevant to all of them, whether they wish it or not.
              </p>
              <div className="p-5 rounded-2xl bg-gradient-to-br from-primary/10 to-violet-400/5 border border-primary/20 space-y-2">
                <p className="text-sm font-black text-foreground">Core Thesis</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Centralised exchanges extract over $100 billion per year from traders through custody fees, spread capture, withdrawal friction, and information asymmetry — all of which require users to surrender control of their assets. OrahDEX makes every one of these extraction mechanisms technically impossible. The protocol is not disruptive in the startup sense. It is disruptive in the same way that email was disruptive to postal monopolies, or that Bitcoin was disruptive to correspondent banking — structurally, permanently, and without asking permission.
                </p>
              </div>
            </Section>

            {/* ── 1. PROBLEM ── */}
            <Section id="problem" title="1. Problem Statement">
              <p>
                The global cryptocurrency trading market processes more than <span className="text-foreground font-medium">$3 trillion in monthly volume</span>. Over 90% of this volume flows through centralised exchanges — platforms that require users to surrender custody of their assets, comply with extensive identity verification, and trust a central authority that history has proven to be vulnerable to hacks, insolvency, and regulatory seizure.
              </p>
              <p>
                The eight major failure modes of the existing trading infrastructure — both centralised and decentralised — are as follows:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { problem: "Custodial Risk", detail: "CEXs hold user funds on behalf of users. FTX ($8B lost), Mt. Gox ($450M), Cryptopia, QuadrigaCX, Celsius, Voyager — every major CEX collapse has been a custodial collapse. The user never owned their funds; they owned a database entry." },
                  { problem: "Identity Extraction", detail: "Every CEX demands government ID, facial biometrics, address proof, and phone numbers. This PII is aggregated into honeypots that attract state actors, hackers, and data brokers. The user pays with their identity — indefinitely." },
                  { problem: "Regulatory Seizure", detail: "A centralised exchange can be raided, shut down, de-banked, sanctioned, or injuncted overnight. In every case, user funds are frozen. The exchange is the single point of failure — and that single point is a government office away from destruction." },
                  { problem: "Liquidity Fragmentation", detail: "Real DeFi liquidity is split across hundreds of protocols, chains, and AMM versions. The average user cannot access it without deep technical knowledge. The average trader does not manage six wallets and three bridges." },
                  { problem: "High Settlement Cost", detail: "Ethereum gas fees regularly reach $50–200 per swap. At these prices, DeFi is effectively inaccessible to anyone trading less than $10,000 at a time — pricing out the 90% who need it most." },
                  { problem: "No Copy Trading On-Chain", detail: "On-chain copy trading has never been fully realised. Every existing solution is either off-chain (custodial, opaque) or on-chain but without settlement proofs. Followers cannot verify their trades are being mirrored honestly." },
                  { problem: "Custodial Bridge Risk", detail: "Cross-chain bridges are the most dangerous component in DeFi — over $2.8 billion lost to bridge hacks between 2021 and 2024. The reason is structural: most bridges are custodial, creating the same failure mode as CEXs." },
                  { problem: "No AI Integration", detail: "Institutional traders have access to AI-driven analytics, sentiment feeds, and automated risk management. Retail DeFi users have none of this. The information asymmetry between institutional and retail has never been greater." },
                ].map(({ problem, detail }) => (
                  <div key={problem} className="p-3 bg-red-400/5 border border-red-400/15 rounded-xl">
                    <p className="text-xs font-bold text-red-400 mb-1">{problem}</p>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                  </div>
                ))}
              </div>
              <InfoBox title="The Structural Problem" color="amber">
                <p>Every one of these failure modes shares a common root: <strong>intermediation</strong>. When a third party stands between a user and their assets, all forms of custody risk, identity extraction, and regulatory seizure become structurally possible. OrahDEX eliminates the intermediary. Not as a policy choice — as a mathematical constraint. The protocol is architecturally incapable of holding user funds, collecting identity, or acting as a regulatory choke point.</p>
              </InfoBox>
            </Section>

            {/* ── 2. SOLUTION ── */}
            <Section id="solution" title="2. The OrahDEX Solution">
              <p>OrahDEX is designed around a single architectural constraint: <span className="text-foreground font-medium">no user asset or identity should ever pass through OrahDEX control</span>. Every feature, every design decision, and every cryptographic mechanism flows from this constraint.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { title: "Non-Custodial by Architecture", icon: "🔐", desc: "Users retain full control of their private keys and assets at all times. OrahDEX cannot hold, freeze, seize, or reverse user funds — not because of policy, but because the system is designed to make it mathematically impossible." },
                  { title: "Multi-Chain Native", icon: "🌐", desc: "Native support for BSV (settlement), Ethereum + 12 EVM chains (Reown/WalletConnect), and TRON (TRX/TRC-20 USDT). One sovereign interface — every major chain." },
                  { title: "Always-On Liquidity", icon: "⚡", desc: "Genesis Liquidity Engine (VAMM) guarantees every listed asset is tradeable via a linear bonding curve. Zero dry runs, zero empty order books. The cold-start problem is solved at the protocol level." },
                  { title: "Full Trading Spectrum", icon: "📊", desc: "Spot, futures (100x), VAMM, AMM, P2P, bridge, CopyVault, fiat on-ramp — every instrument in one interface with BSV settlement proofs across all." },
                  { title: "AI Intelligence Layer", icon: "🧠", desc: "Ora AI provides real-time market analysis, portfolio coaching, risk assessment, and trading education — embedded directly in the interface, democratising institutional-grade intelligence." },
                  { title: "Zero Identity Collection", icon: "🛡️", desc: "No name. No email. No government ID. No IP address stored. User identity on OrahDEX is a cryptographic wallet address — generated by the user, controlled by the user, known only to the user." },
                ].map(({ title, icon, desc }) => (
                  <div key={title} className="p-4 bg-primary/5 border border-primary/15 rounded-2xl space-y-2">
                    <div className="text-2xl">{icon}</div>
                    <p className="font-bold text-sm text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
              <p>
                The protocol achieves sub-cent settlement costs by routing final settlement through BSV's massively scalable UTXO ledger — enabling micro-trades, high-frequency strategies, and CopyVault mirroring at a cost that makes every trade economically rational, regardless of size.
              </p>
            </Section>

            {/* ── 3. ARCHITECTURE ── */}
            <Section id="architecture" title="3. Technical Architecture">
              <p>OrahDEX is composed of five primary layers, each independently operable and cryptographically verifiable:</p>
              <div className="space-y-3">
                {[
                  {
                    layer: "Layer 1 — Settlement (Bitcoin SV)",
                    color: "text-green-400",
                    bg: "bg-green-400/5 border-green-400/15",
                    desc: "Bitcoin SV blockchain: UTXO-based, unbounded block size, 1 sat/byte fees. Provides HTLC atomic swap scripts and OP_RETURN settlement proofs for every matched trade. Immutable, publicly verifiable, permanent. The settlement layer cannot be altered, paused, or seized by any party — including OrahDEX itself.",
                  },
                  {
                    layer: "Layer 2 — Protocol Contracts (EVM + BSV Script)",
                    color: "text-blue-400",
                    bg: "bg-blue-400/5 border-blue-400/15",
                    desc: "Uniswap V3-style concentrated AMM contracts for EVM chains. Custom on-chain order book contracts for limit order matching. ERC4626-style CopyVault contracts for share-accounting. HTLC locking scripts on BSV. All protocol contracts are deterministic, publicly auditable, and require no admin keys to operate.",
                  },
                  {
                    layer: "Layer 3 — Application Server (Node.js / Express)",
                    color: "text-violet-400",
                    bg: "bg-violet-400/5 border-violet-400/15",
                    desc: "Stateless order book management, sovereign price engine (own trade data + on-chain TWAP feeds + 210-symbol market aggregation), CopyVault orchestration, Ora AI chat relay, BSV WhatsOnChain integration, WebSocket real-time price feeds, and the Genesis Liquidity Engine execution layer. This layer holds zero user funds and zero user identity.",
                  },
                  {
                    layer: "Layer 4 — Intelligence (Ora AI)",
                    color: "text-amber-400",
                    bg: "bg-amber-400/5 border-amber-400/15",
                    desc: "OpenAI-compatible large language model with streaming Server-Sent Events. Context-aware of current pair, user position, order book state, and platform history. 682+ market insights cached. Persistent conversation history per-user. Max 8,192 output tokens per response. Zero trading decisions are made by Ora without explicit user confirmation.",
                  },
                  {
                    layer: "Layer 5 — Sovereign Interface (React + Vite)",
                    color: "text-primary",
                    bg: "bg-primary/5 border-primary/15",
                    desc: "React 19 + Vite 7 progressive web application. Fully responsive mobile + desktop. Dark/Light/AMOLED themes. Reown AppKit (20+ EVM chains). Native TRONLink, TokenPocket, OKX, Bitget, Trust, imToken wallet support. BSV native integration. Passkey wallet. Demo Account ($80,000 virtual paper trading). 7-tab mobile navigation. OrahChart cross-pair visualisation with adaptive decimal precision up to 10dp.",
                  },
                ].map(({ layer, color, bg, desc }) => (
                  <div key={layer} className={cn("p-4 rounded-xl border", bg)}>
                    <p className={cn("font-bold text-xs mb-1", color)}>{layer}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
              <InfoBox title="Full Technology Stack" color="blue">
                <p><strong>Frontend:</strong> React 19 + Vite 7 + TailwindCSS v4 · TypeScript 5.7</p>
                <p><strong>Backend:</strong> Node.js 24 + Express 5 + Drizzle ORM + PostgreSQL 16</p>
                <p><strong>EVM:</strong> Wagmi v2 + Viem v2 + Reown AppKit (WalletConnect v3)</p>
                <p><strong>TRON:</strong> TronWeb 6 + multi-adapter wallet support (6 wallets)</p>
                <p><strong>BSV:</strong> WhatsOnChain API + native UTXO/OP_RETURN construction + HTLC Script</p>
                <p><strong>AI:</strong> OpenAI-compatible LLM · streaming SSE · 8,192 max tokens</p>
                <p><strong>Charts:</strong> Lightweight-charts v5 + OrahChart cross-pair renderer</p>
                <p><strong>VAMM:</strong> Genesis Liquidity Engine — linear bonding curve, 56+ assets, virtual treasury</p>
              </InfoBox>
            </Section>

            {/* ── 4. BSV SETTLEMENT ── */}
            <Section id="bsv-settlement" title="4. BSV On-Chain Settlement via HTLC & OP_RETURN">
              <p>
                OrahDEX uses two distinct BSV mechanisms for cryptographic trade settlement: <span className="text-foreground font-medium">Hash Time-Locked Contracts (HTLCs)</span> for trustless cross-chain atomic swaps, and <span className="text-foreground font-medium">OP_RETURN transactions</span> for permanent, tamper-evident on-chain trade audit records.
              </p>

              <Sub title="4.1 Why Bitcoin SV for Settlement">
                <p>
                  Settlement layer selection is the most consequential architectural decision in any trading protocol. OrahDEX chose BSV for five precise technical reasons:
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Property</th>
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">BSV</th>
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Ethereum L1</th>
                        <th className="text-left py-2 font-semibold text-foreground">Solana</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Block size cap", "None (unbounded)", "~1.8 MB (gas limit)", "~48 MB (with limitations)"],
                        ["OP_RETURN data limit", "No limit (protocol)", "Not applicable", "Not applicable"],
                        ["Avg. tx fee", "$0.0001–0.001", "$1–200 (varies)", "$0.00025"],
                        ["Tx throughput", "50,000+ TPS (tested)", "~15 TPS", "~3,000 TPS (with degradation)"],
                        ["UTXO model", "Yes — parallel, stateless", "No — account-based", "No — account-based"],
                        ["Finality", "~10 min (probabilistic)", "~12s (PoS)", "~0.4s (single-slot)"],
                        ["Script programmability", "Full Bitcoin Script", "EVM (Turing-complete)", "Programs (LLVM)"],
                        ["Immutability guarantee", "SHA-256d PoW anchored", "PoS (can be forked)", "PoS (validator dependent)"],
                      ].map(([prop, bsv, eth, sol]) => (
                        <tr key={prop as string} className="border-b border-border/40">
                          <td className="py-2 pr-4 font-semibold text-foreground">{prop}</td>
                          <td className="py-2 pr-4 text-green-400 font-medium">{bsv}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{eth}</td>
                          <td className="py-2 text-muted-foreground">{sol}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  The UTXO model is specifically superior for settlement: each trade produces an independent, parallel transaction that does not require sequential account state. At scale, OrahDEX can settle millions of trades per day without any BSV block capacity constraint or fee spike.
                </p>
              </Sub>

              <Sub title="4.2 HTLC Atomic Swap Protocol">
                <ol className="list-decimal list-inside space-y-2 ml-1">
                  <li>Maker generates cryptographic secret preimage <span className="font-mono text-green-400">R ∈ {"{0,1}²⁵⁶"}</span> (256 bits of entropy) and computes commitment <span className="font-mono text-green-400">H = SHA256(R)</span>.</li>
                  <li>Maker broadcasts BSV HTLC locking script committing to H with a time lock T₁ (e.g., 144 blocks ≈ 24 hours).</li>
                  <li>Taker verifies H on BSV chain and broadcasts a reciprocal locking transaction on the destination chain (EVM / TRON) with time lock T₂ {"< T₁"}.</li>
                  <li>Maker claims Taker's funds by publishing R on-chain, simultaneously revealing R to Taker.</li>
                  <li>Taker uses revealed R to claim Maker's BSV HTLC output. Both legs settle atomically — either both complete or both refund automatically.</li>
                </ol>
                <Code>{`BSV HTLC Locking Script:
OP_IF
  OP_SHA256 <H> OP_EQUALVERIFY
  OP_DUP OP_HASH160 <TakerPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
OP_ELSE
  <LockTime_T1> OP_CHECKLOCKTIMEVERIFY OP_DROP
  OP_DUP OP_HASH160 <MakerPubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
OP_ENDIF

Security properties:
  • R is never broadcast until Taker's leg is locked
  • If Taker fails to lock within T2: Maker's HTLC refunds at T1
  • If Maker fails to reveal R: Taker's leg refunds at T2 < T1
  • No custodian. No escrow. No trust. Pure cryptographic enforcement.`}</Code>
              </Sub>

              <Sub title="4.3 OP_RETURN Settlement Proofs">
                <p>Every matched trade — including copy-traded vault orders — produces a BSV OP_RETURN transaction. The payload is pipe-delimited and permanently recorded on-chain:</p>
                <Code>{`OP_RETURN payload format:
ORAH|v1|<tradeId>|<pair>|<buyerAddr>|<sellerAddr>|<amount>|<price>|<timestamp>

Example:
ORAH|v1|a3b9c1d2e4|BSV-USDT|0x1234…abcd|0x5678…ef01|1.5|55.42|1743388800000

Txid computation:
  txid = SHA256(SHA256(raw_tx_bytes))   [standard double-SHA256]
  This matches exactly what WhatsOnChain and all BSV explorers compute.

Properties:
  • Permanent — OP_RETURN outputs cannot be spent; data persists forever
  • Public — any party can verify the record against WhatsOnChain
  • Tamper-evident — modification would invalidate the TXID
  • Cheap — ~$0.0001 per settlement proof at current BSV fee rates`}</Code>
              </Sub>

              <Sub title="4.4 Live BSV Chain Statistics">
                <div className="grid grid-cols-3 gap-3">
                  <Metric value="< $0.001" label="BSV Tx Fee" sub="Per settlement proof" />
                  <Metric value="943,372" label="Current Block" sub="WhatsOnChain live data" />
                  <Metric value="260 PH/s" label="Network Hashrate" sub="SHA-256d Proof-of-Work" />
                </div>
              </Sub>
            </Section>

            {/* ── 5. AMM ── */}
            <Section id="amm" title="5. AMM & Liquidity Pools">
              <p>
                OrahDEX's on-chain liquidity runs on a <span className="text-foreground font-medium">constant product AMM</span> (x·y = k) for standard pools, and the proprietary <span className="text-foreground font-medium">Genesis Liquidity Engine</span> (linear bonding curve VAMM) as a universal cold-start backstop for every listed asset.
              </p>
              <Sub title="5.1 Constant Product Invariant (x · y = k)">
                <Code>{`Core invariant:    x · y = k
                   (preserved across every swap)

Spot price of A:   P_A = y / x

Swap output (A → B):
  Δy = (Δx × (1 − fee) × y) / (x + Δx × (1 − fee))

Price impact:
  impact = Δx / (x + Δx)     [fraction of reserve consumed]

Effective rate:
  effective_P = Δy / Δx      [average price paid vs spot]

Impermanent loss (for LP):
  IL = 2√r/(1+r) − 1         where r = price_now / price_entry

Concentrated liquidity (Uniswap V3 model):
  Virtual reserves:  x_v = L / √P_b,  y_v = L × √P_a
  Capital efficiency: up to 4000× vs v2 for tight ranges`}</Code>
              </Sub>
              <Sub title="5.2 Fee Distribution">
                <p>OrahDEX AMM pools apply a 0.30% swap fee distributed across three destinations:</p>
                <InfoBox title="AMM Fee Split" color="green">
                  <p>5/6 (≈ 83.3%) → Liquidity Providers (proportional to pool share at time of swap)</p>
                  <p>1/6 (≈ 16.7%) → OrahDEX Protocol Treasury</p>
                  <p>Additional 0.05% → Impermanent Loss Insurance Fund (accumulated per pool)</p>
                </InfoBox>
              </Sub>
              <Sub title="5.3 AMM Swap Simulator">
                <p>OrahDEX includes a built-in AMM simulator showing real-time price impact, slippage vs spot, fee breakdown, k constant, and effective exchange rate before any swap commitment. LP share is 5/6 of fee; Protocol share is 1/6. Available on both desktop and mobile at <code className="text-green-400 text-[10px]">/liquidity</code>.</p>
              </Sub>
            </Section>

            {/* ── 5.4 GENESIS ── */}
            <Section id="genesis-vamm" title="5.4 Genesis Liquidity Engine — Virtual AMM">
              <p>
                The <span className="text-foreground font-medium">Genesis Liquidity Engine</span> solves the cold-start liquidity problem permanently: every newly listed asset is instantly tradeable via a linear bonding curve, even before any real liquidity provider participates. The VAMM is not a temporary scaffold — it is a permanent sovereign liquidity layer that operates in parallel with real AMM pools.
              </p>
              <InfoBox title="Design Mandate" color="amber">
                <p>No asset on OrahDEX should ever display "No liquidity available." The Genesis engine acts as a sovereign liquidity backstop — always present, always priceable, always executable — for all 56+ listed VAMM assets.</p>
              </InfoBox>

              <Sub title="5.4.1 Linear Bonding Curve Mathematics">
                <Code>{`Price function:
  P(s) = basePrice + slope × s

Where:
  basePrice = current spot price of asset (USDT, updated from sovereign oracle)
  slope     = 0.01 × basePrice² / 8500
            = calibrated so $8,500 of buy volume moves price by exactly 1%

Buy cost integral (s₀ → s₀+n):
  cost(n, s₀) = ∫[s₀ to s₀+n] P(s) ds
             = n × basePrice + slope × (s₀ × n + n²/2)
  (trapezoidal rule — exact for linear curves)

Sell payout integral (s₀-n → s₀):
  payout(n, s₀) = ∫[s₀-n to s₀] P(s) ds
               = n × basePrice + slope × ((s₀−n)×n + n²/2)
  Floored at 0 to prevent negative payouts on extreme sells.

Slippage from spot:
  slippage(n) = (cost(n,0)/n − basePrice) / basePrice × 100%
  Example: $1,000 buy of BTC at $71,000 → slippage ≈ 0.059%`}</Code>
              </Sub>

              <Sub title="5.4.2 Virtual Treasury Pre-Funding">
                <Code>{`Treasury initialisation per asset:
  treasuryDepth = 3 × $8,500 = $25,500
  virtualSupply = treasuryDepth / basePrice

Example (BTC at $71,000):
  slope         = 0.01 × 71000² / 8500 ≈ 5.934 USDT/token
  virtualSupply = 25500 / 71000 ≈ 0.3592 BTC
  P(0)          = $71,000 (anchored to spot at initialisation)

This means:
  • Sells of up to ~0.3592 BTC are always absorbed by the virtual treasury
  • Buy pressure past this point raises curve price, signalling real demand
  • Treasury recalibrates with each oracle price update`}</Code>
              </Sub>

              <Sub title="5.4.3 Execution & Settlement">
                <p>Every VAMM execution is simulation-layer — no wallet signature, no gas, no custody. Each trade produces a tamper-evident receipt:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: "Trade ID", detail: "UUID generated at execution — permanently loggable, non-repeatable, non-guessable." },
                    { label: "Curve Price", detail: "Effective price post-bonding-curve movement — reflects real market depth simulation." },
                    { label: "Fee 0.30%", detail: "Identical rate to AMM pool swaps — consistent platform economics." },
                    { label: "Supply Delta Δs", detail: "Change in virtual supply — used to price the next trade accurately." },
                    { label: "Timestamp", detail: "Block-precise UTC — enables audit trail, simulation history, and performance analysis." },
                    { label: "Treasury State", detail: "Post-trade treasury balance and virtual supply — full accounting transparency." },
                  ].map(({ label, detail }) => (
                    <div key={label} className="p-3 bg-amber-400/5 border border-amber-400/15 rounded-xl">
                      <p className="text-xs font-bold text-amber-400 mb-1">{label}</p>
                      <p className="text-xs text-muted-foreground">{detail}</p>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="5.4.4 VAMM API">
                <InfoBox title="Genesis Engine Endpoints" color="green">
                  <p>GET <code className="text-green-300">/api/genesis/markets</code> — all 56+ assets: basePrice, slope, supply, treasury, tradeCount, 24h change</p>
                  <p>GET <code className="text-green-300">/api/genesis/quote</code> — real-time bonding-curve quote for any asset/side/amount</p>
                  <p>POST <code className="text-green-300">/api/genesis/swap</code> — execute simulation, update virtual supply, return signed receipt</p>
                </InfoBox>
              </Sub>

              <div className="grid grid-cols-3 gap-3">
                <Metric value="56+" label="VAMM Assets" sub="All instantly tradeable" />
                <Metric value="$25,500" label="Virtual Depth/Asset" sub="3× treasury backing" />
                <Metric value="0.30%" label="Simulation Fee" sub="Identical to AMM pools" />
              </div>
            </Section>

            {/* ── 6. BRIDGE ── */}
            <Section id="cross-chain" title="6. Cross-Chain Bridge — Trustless HTLC">
              <p>
                The OrahDEX Bridge executes cross-chain asset transfers using HTLC atomic swaps — eliminating the custodial risk that is structurally responsible for every major bridge hack in DeFi history. There are no wrapped tokens. There is no bridge treasury to steal.
              </p>
              <Sub title="6.1 Architecture & Security Model">
                <ul className="list-disc list-inside space-y-1.5 ml-1">
                  <li><span className="font-medium text-foreground">No Wrapped Tokens:</span> OrahDEX moves native assets atomically — no de-peg risk, no synthetic counterparty exposure.</li>
                  <li><span className="font-medium text-foreground">Decentralised Relayer Network:</span> Permissionless relayers coordinate HTLC handshakes between chains. Relayers earn fees proportional to bridge volume; malicious relayers are automatically slashed by time-lock expiry mechanics.</li>
                  <li><span className="font-medium text-foreground">Time-Lock Safety:</span> All HTLCs have configurable time locks (minimum 24h for large amounts). No action by any party within the time lock results in automatic on-chain refund — no human intervention required.</li>
                  <li><span className="font-medium text-foreground">Watchtower Monitoring:</span> OrahDEX operates independent watchtower nodes that detect stalled HTLCs and trigger automated refund broadcasts on behalf of users.</li>
                  <li><span className="font-medium text-foreground">Multi-Network Support:</span> Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche, zkSync, Scroll, Linea, Mantle, Cronos + BSV (settlement anchor).</li>
                </ul>
              </Sub>
              <Sub title="6.2 Why Traditional Bridges Fail">
                <p>Every major bridge exploit — Ronin ($625M), Wormhole ($320M), Nomad ($190M), Horizon ($100M) — shared a common failure mode: a <strong>trusted custodial treasury</strong> that could be compromised by stealing keys, exploiting contracts, or corrupting validators. OrahDEX's HTLC bridge has no treasury to steal. The only funds locked at any moment are the specific assets involved in a single in-flight trade — and they are time-locked to refund automatically if anything goes wrong.</p>
              </Sub>
              <InfoBox title="Supported Bridge Pairs — Phase 1" color="blue">
                <p>BSV ↔ ETH · BSV ↔ BNB · BSV ↔ MATIC · BSV ↔ USDT (BSV native) ↔ USDT (ERC-20/TRC-20)</p>
                <p>Additional pairs added by community governance. Bridge fee: 0.20% split between relayers and protocol.</p>
              </InfoBox>
            </Section>

            {/* ── 7. TRADING ── */}
            <Section id="trading" title="7. Trading Engine">
              <Sub title="7.1 Spot Trading — 950+ Pairs">
                <p>
                  Market orders are routed through OrahDEX's smart order router — selecting the lowest slippage path across AMM pool, on-chain order book, VAMM, and P2P matching. Limit orders are signed by the user (ECDSA personal_sign) and held in the OrahDEX order book until matched. Every fill produces a BSV OP_RETURN settlement proof.
                </p>
                <p>
                  OrahChart renders cross-pair charts (ATOM/ETH, LINK/BTC, SOL/BNB, etc.) with adaptive decimal precision up to 10dp for micro-priced assets. Six order types: Market, Limit, Stop-Limit, Stop-Market, Trailing Stop, Post-Only.
                </p>
              </Sub>
              <Sub title="7.2 Perpetual Futures — Up to 100x Leverage">
                <p>OrahDEX perpetual futures are settled against mark prices computed from the sovereign oracle:</p>
                <Code>{`Mark Price  = median(OrahDEX Order Book VWAP, OrahDEX TWAP, BSV On-Chain Feed)

Funding Rate = (Perpetual Price − Index Price) / Index Price × (1/24)
             paid every 8 hours, longs pay shorts when perp > index

Position PnL  = (Exit Price − Entry Price) × Size × Direction
              (Direction: +1 for long, -1 for short)

Liquidation Price (long):
  L_price = Entry Price × (1 − 1/Leverage + MaintenanceMargin)

Liquidation Price (short):
  L_price = Entry Price × (1 + 1/Leverage − MaintenanceMargin)`}</Code>
              </Sub>
              <Sub title="7.3 P2P Trading — Fiat ↔ Crypto with HTLC Escrow">
                <p>Direct peer-to-peer trading with custom payment methods (bank transfer, mobile money, local fiat). Trades are secured by BSV HTLC escrow: funds are locked on-chain before the seller releases, and the HTLC self-refunds if the buyer fails to confirm within the time lock. OrahDEX's decentralised arbitration panel resolves disputes based on on-chain evidence.</p>
              </Sub>
              <Sub title="7.4 Fiat On-Ramp — 5 Providers, 100+ Countries">
                <p>MoonPay, Transak, Banxa, Simplex, and Ramp Network — embedded directly in the OrahDEX interface. Card payments, bank transfers, and local payment methods. No separate account required.</p>
              </Sub>
              <Sub title="7.5 Keeper Tier Fee Schedule">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Tier</th>
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Maker/Taker</th>
                        <th className="text-left py-2 font-semibold text-foreground">30d Volume Threshold</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Initiate",  "0.20% / 0.20%", "Default — all users"],
                        ["Sentinel",  "0.12% / 0.15%", "≥ $50,000"],
                        ["Archon",    "0.06% / 0.10%", "≥ $500,000"],
                        ["Sovereign", "0.00% / 0.05%", "≥ $5,000,000"],
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

            {/* ── 8. COPYVAULT ── */}
            <Section id="copy-vault" title="8. CopyVault — On-Chain Copy Trading Protocol">
              <p>
                CopyVault is the world's first on-chain copy trading protocol that combines ERC4626-style vault share accounting with BSV OP_RETURN settlement proofs for every mirrored trade. Every copy trade is cryptographically provable, publicly auditable on BSV, and economically transparent. Followers cannot be deceived about what trades were executed on their behalf.
              </p>

              <Sub title="8.1 Vault Mathematics (ERC4626 Model)">
                <Code>{`Share Price Initialisation:
  sharePrice₀ = 1.00 USDT per share

On Deposit (follower deposits D USDT):
  sharesIssued = D / sharePrice_current
  TVL_new      = TVL_old + D
  sharePrice   = TVL_new / totalShares    (unchanged by deposit)

Trade Mirror Allocation:
  allocationRatio = min(1, vaultTVL / leaderPortfolioValue)
  copyQty         = leaderQty × allocationRatio
  copyNotional    = copyQty × executionPrice

On Trade PnL (vault trade settles +/- δ USDT):
  TVL_new      = TVL_old ± δ
  sharePrice   = TVL_new / totalShares    (rises on profit, falls on loss)

On Withdrawal (follower redeems S shares):
  redeemValue  = S × sharePrice_current
  profit       = max(0, redeemValue − (S × depositSharePrice))
  perfFee      = profit × feeRate         (5–15%, leader-configurable)
  netPayout    = redeemValue − perfFee

High-Water Mark:
  perfFee charged only when sharePrice > depositSharePrice_follower
  No fee on recovery from losses — only on new all-time profit`}</Code>
              </Sub>

              <Sub title="8.2 BSV Proof Chain for Every Mirror Trade">
                <p>For every trade the leader executes, OrahDEX's orchestrator computes and records:</p>
                <ol className="list-decimal list-inside space-y-1.5 ml-1">
                  <li>Leader trade recorded in <code className="text-green-400 text-[10px]">orders</code> table with BSV txid</li>
                  <li>Mirror allocation computed per vault: <code className="text-green-400 text-[10px]">copyQty = leaderQty × (vaultTVL/leaderPortfolio)</code></li>
                  <li>Mirror trade recorded in <code className="text-green-400 text-[10px]">copy_vault_trades</code> with symbol, side, price, qty, vaultId, followerId</li>
                  <li>BSV OP_RETURN transaction broadcast with vault ID + mirror trade data</li>
                  <li>Vault share price updated: <code className="text-green-400 text-[10px]">sharePrice = newTVL / totalShares</code></li>
                  <li>Follower positions updated in <code className="text-green-400 text-[10px]">copy_vault_positions</code> with realised PnL delta</li>
                </ol>
              </Sub>

              <Sub title="8.3 Transparency Guarantees">
                <ul className="list-disc list-inside space-y-1.5 ml-1">
                  <li>Share price, TVL, and follower count are public on the CopyVault leaderboard — no information asymmetry between leader and followers.</li>
                  <li>All trade history is queryable by vault ID. Every BSV txid is independently verifiable on WhatsOnChain.</li>
                  <li>Performance fee is charged only on realised profit at withdrawal — never on TVL, never on time held.</li>
                  <li>Vault capacity limits prevent systemic concentration risk in any single vault.</li>
                </ul>
              </Sub>

              <div className="grid grid-cols-3 gap-3">
                <Metric value="ERC4626" label="Vault Standard" sub="Share-based, auditable" />
                <Metric value="BSV" label="Every Trade Proven" sub="OP_RETURN immutable record" />
                <Metric value="0%" label="Fee on Losses" sub="High-water mark protection" />
              </div>
            </Section>

            {/* ── 9. ORA AI ── */}
            <Section id="ora-ai" title="9. Ora — Integrated AI Trading Intelligence">
              <p>
                <span className="text-foreground font-medium">Ora</span> is OrahDEX's embedded AI market intelligence layer — the first AI trading assistant to be natively integrated into a sovereign, non-custodial DEX. Ora contextually understands the user's active pair, position state, order book depth, and full OrahDEX product suite without any manual configuration.
              </p>
              <Sub title="9.1 Capability Matrix">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { title: "Live Market Analysis", desc: "Price action commentary, trend identification, support/resistance analysis, and volume anomaly detection — for any of 950+ pairs, updated in real time." },
                    { title: "Trade Structuring", desc: "Order sizing, leverage selection, stop-loss placement, take-profit levels, risk/reward computation, and position sizing relative to portfolio." },
                    { title: "CopyVault Intelligence", desc: "Leader performance decomposition, drawdown analysis, risk-adjusted return comparison (Sharpe, Sortino), and follower-profile matching across all active vaults." },
                    { title: "Portfolio Risk Management", desc: "Correlation analysis, concentration risk flags, Greeks estimation for futures positions, and rebalancing strategy generation." },
                    { title: "DeFi Education Engine", desc: "Plain-language explanations of AMM mechanics, bonding curves, HTLC atomicity, impermanent loss, funding rates, and liquidation mechanics." },
                    { title: "Contextual Awareness", desc: "Ora knows which pair is active, current order book state, recent trade history, and user's connected wallet — providing hyper-relevant responses with zero setup." },
                  ].map(({ title, desc }) => (
                    <div key={title} className="p-3 bg-amber-400/5 border border-amber-400/15 rounded-xl">
                      <p className="text-xs font-bold text-amber-400 mb-1">{title}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </div>
              </Sub>
              <Sub title="9.2 Technical Architecture">
                <InfoBox title="Ora Implementation" color="amber">
                  <p><strong>Model:</strong> OpenAI-compatible LLM · max_completion_tokens: 8,192 · Streaming: Server-Sent Events</p>
                  <p><strong>Context:</strong> Platform state + active pair + wallet + order book + recent conversation history</p>
                  <p><strong>Storage:</strong> Persistent per-user conversation history in PostgreSQL (conversations + messages tables)</p>
                  <p><strong>Insights Cache:</strong> 682+ market insights pre-computed and served via <code className="text-amber-300">/api/ai/insights</code></p>
                  <p><strong>Sovereignty:</strong> Ora makes zero autonomous trades. All execution requires explicit user confirmation.</p>
                </InfoBox>
              </Sub>
            </Section>

            {/* ── 10. FEE MODEL ── */}
            <Section id="tokenomics" title="10. Fee Model & Revenue">
              <p>OrahDEX operates on a transparent, performance-based fee model. No platform token exists. No token is required to access any functionality. Every fee rate is published in this document and verifiable in the open-source protocol code.</p>
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
                      ["Spot — Initiate (default)",   "0.20%",    "Protocol treasury + LP rewards"],
                      ["Spot — Sentinel",             "0.12%",    "Protocol treasury + LP rewards"],
                      ["Spot — Archon",               "0.06%",    "Protocol treasury + LP rewards"],
                      ["Spot — Sovereign",            "0.00%",    "Zero trading fee at highest tier"],
                      ["Futures — Maker",             "0.02%",    "Protocol treasury"],
                      ["Futures — Taker",             "0.06%",    "Protocol treasury"],
                      ["AMM Swap",                    "0.30%",    "83.3% LP providers · 16.7% treasury"],
                      ["VAMM Swap (Genesis)",         "0.30%",    "100% protocol treasury (virtual simulation)"],
                      ["Bridge Transfer",             "0.20%",    "Relayer network + protocol"],
                      ["P2P Trade",                   "0.50%",    "Protocol treasury + arbitrators"],
                      ["CopyVault Performance",       "5–15%",    "On realised profit at withdrawal only, never on TVL"],
                      ["BSV Settlement Tx",           "< $0.001", "Miner fees (pass-through, no OrahDEX markup)"],
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
              <InfoBox title="Protocol Treasury Allocation" color="green">
                <p>40% → Platform engineering, infrastructure, and development</p>
                <p>25% → Independent security audits, bug bounties, and formal verification</p>
                <p>20% → Community liquidity incentives and ecosystem grants</p>
                <p>15% → Legal, compliance research, and regulatory engagement</p>
              </InfoBox>
            </Section>

            {/* ── 11. SECURITY ── */}
            <Section id="security" title="11. Security Model">
              <Sub title="11.1 Threat Surface Analysis">
                <p>OrahDEX's non-custodial architecture eliminates the most dangerous class of attacks — those targeting a centralised fund custodian. The residual threat surface is:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { threat: "Smart Contract Exploits", mitigation: "Independent audits by top-3 security firms. Formal verification of HTLC scripts. Immutable time-lock refund mechanisms ensure worst-case is fund delay, not loss." },
                    { threat: "Oracle Manipulation", mitigation: "Sovereign price engine aggregates own order-book VWAP + on-chain TWAP + 210-symbol external feed. Single-source manipulation cannot move mark price." },
                    { threat: "Front-Running", mitigation: "Commit-reveal scheme for large orders. HTLC preimage committed before broadcasting. MEV resistance via BSV's UTXO parallelism." },
                    { threat: "Sybil Attack (P2P)", mitigation: "BSV wallet staking requirement for P2P liquidity providers. On-chain reputation score based on settlement history. Arbitration panel with supermajority threshold." },
                    { threat: "API Server Compromise", mitigation: "API server holds zero funds and zero private keys. Compromise affects order book state only — all settlement is on-chain and unaffected. State is reconstructible from BSV chain." },
                    { threat: "DDoS on Application Layer", mitigation: "CDN + rate limiting + circuit breakers. BSV settlement layer is independent and continues operating during application downtime. Orders already on-chain self-execute." },
                  ].map(({ threat, mitigation }) => (
                    <div key={threat} className="p-3 bg-secondary/40 border border-border rounded-xl space-y-1">
                      <p className="text-xs font-bold text-foreground">{threat}</p>
                      <p className="text-xs text-muted-foreground">{mitigation}</p>
                    </div>
                  ))}
                </div>
              </Sub>
              <Sub title="11.2 Key Management — User Sovereignty">
                <p>OrahDEX never requests, stores, or transmits user private keys. The signing flow is:</p>
                <Code>{`User Intent → OrahDEX Interface → User Wallet (local)
                              ↓ (never leaves device)
                        Private Key Signs Message
                              ↓
                        Signed Payload → OrahDEX API (public signature only)
                              ↓
                        On-chain settlement via BSV broadcast

Private keys: generated by user, stored by user, known only to user.
OrahDEX sees: wallet address, signed messages, public transactions.
OrahDEX never sees: private key, seed phrase, or decryption key.`}</Code>
              </Sub>
              <Sub title="11.3 Audit & Verification Programme">
                <ul className="list-disc list-inside space-y-1.5 ml-1">
                  <li>Independent smart contract audits before every major protocol release</li>
                  <li>Continuous bug bounty programme (critical: up to $500,000 USD equivalent)</li>
                  <li>Public disclosure of all found vulnerabilities post-patch (90-day embargo)</li>
                  <li>On-chain settlement records publicly verifiable by any third party at any time</li>
                  <li>Open-source protocol code — no security through obscurity</li>
                </ul>
              </Sub>
            </Section>

            {/* ── 12. CRYPTOGRAPHIC FOUNDATIONS ── */}
            <Section id="crypto-foundation" title="12. Cryptographic Foundations">
              <p>
                OrahDEX's security model is not based on trust, reputation, or legal contracts. It is based entirely on the mathematical properties of the cryptographic primitives described in this section. These properties have been independently verified by thousands of researchers across decades and are considered computationally intractable to break with any foreseeable computing technology, including quantum computers for the symmetric primitives.
              </p>

              <Sub title="12.1 ECDSA — Digital Signature Scheme">
                <Code>{`Curve: secp256k1 (same as Bitcoin and Ethereum)
Field: F_p where p = 2²⁵⁶ − 2³² − 2⁹ − 2⁸ − 2⁷ − 2⁶ − 2⁴ − 1
Order: n = FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

Key generation:
  private key: k ∈ [1, n−1]   (256 bits of entropy)
  public key:  K = k × G       (elliptic curve scalar multiplication)

Signing (for trade order authentication):
  Choose r ∈ [1, n−1], compute R = r×G, r_x = R.x mod n
  s = r⁻¹ × (hash(msg) + k × r_x) mod n
  Signature: (r_x, s)

Verification (OrahDEX API validates without private key):
  w = s⁻¹ mod n
  u₁ = hash(msg)×w mod n,  u₂ = r_x×w mod n
  Point = u₁×G + u₂×K
  Valid if Point.x mod n == r_x

Security: breaking ECDSA requires solving discrete log on secp256k1
  — computationally equivalent to ~128-bit symmetric security`}</Code>
              </Sub>

              <Sub title="12.2 SHA-256d — Transaction ID Computation">
                <Code>{`BSV transaction ID:
  txid = SHA256(SHA256(raw_tx_bytes))   [double-SHA256]

SHA-256 properties:
  • Pre-image resistance:     given H, cannot find M such that SHA256(M)=H
  • Second pre-image:         given M, cannot find M'≠M with same hash
  • Collision resistance:     cannot find any M,M' pair with SHA256(M)=SHA256(M')
  • Avalanche effect:         1-bit change in input → ~50% output bits change

Merkle tree (block structure):
  leaves:  txid₀, txid₁, …, txidₙ
  parents: SHA256d(txid_left ‖ txid_right)
  root:    merkle_root in block header

  Any change to a trade's OP_RETURN payload changes its txid,
  which changes the Merkle root, which invalidates the block hash,
  which requires re-doing the entire Proof-of-Work for that block
  and every subsequent block. Modification cost grows with chain depth.`}</Code>
              </Sub>

              <Sub title="12.3 HTLC Preimage Security">
                <Code>{`Preimage generation:
  R ← SecureRandom(256 bits)     [OS-level cryptographic RNG]
  H = SHA256(R)                  [commitment published on-chain]

Security requirement:
  Adversary cannot compute R from H in polynomial time.
  Best known attack: brute-force → 2²⁵⁶ operations
  At 10¹⁸ hash/second (entire Bitcoin network): ~10⁵⁸ years

Time-lock safety:
  If Taker does not reveal R within T₂ blocks:
    Taker's EVM HTLC self-refunds to Taker automatically
  If Maker does not reveal R within T₁ blocks (T₁ > T₂):
    Maker's BSV HTLC self-refunds to Maker automatically
  No party can lose funds as long as they act within their time window.`}</Code>
              </Sub>

              <Sub title="12.4 Zero-Knowledge Identity (Phase 3)">
                <p>
                  OrahDEX's roadmap includes ZK-proof identity attestation — allowing users to prove membership in a jurisdiction-approved set (e.g., "not a sanctioned entity") without revealing any personal information. The cryptographic mechanism:
                </p>
                <Code>{`ZK-SNARK identity proof (planned):
  Circuit: "I know a preimage x such that H(x) ∈ approved_set"
  Proof: π = ZK-SNARK(circuit, private_witness=x)
  Verification: Verify(π, approved_set_root) → {true/false}

User reveals: only π (a ~200-byte proof)
User proves:  membership in approved set
User hides:   their actual identity x
OrahDEX sees: true/false — no PII collected, no PII stored.

This satisfies even the strictest "travel rule" interpretation
without creating any data collection liability for the protocol.`}</Code>
              </Sub>
            </Section>

            {/* ── 13. INDESTRUCTIBILITY ── */}
            <Section id="indestructibility" title="13. Protocol Indestructibility">
              <p>
                This section addresses a question that every serious participant in the cryptocurrency ecosystem eventually asks: <em>what happens if powerful incumbents attempt to stop OrahDEX?</em> The answer is grounded in the same mathematical and architectural principles that protect Bitcoin, TCP/IP, and every other open protocol that has survived decades of attempted suppression.
              </p>

              <Sub title="13.1 What Cannot Be Shut Down">
                <p>
                  To shut down a system, there must be something to shut down — a company, a server, an account, a chokepoint. OrahDEX is architecturally designed to eliminate every chokepoint that could serve as a shutdown target:
                </p>
                <div className="space-y-3">
                  {[
                    { target: "The Company", status: "Not a chokepoint", detail: "OrahDEX is a protocol, not a company. Protocol mathematics cannot be injuncted, raided, or de-banked. The Bitcoin protocol continued to exist through multiple 'Bitcoin is dead' regulatory announcements — because the protocol is the code, and the code runs wherever a node runs." },
                    { target: "The Servers", status: "Not a chokepoint", detail: "The BSV settlement layer runs on thousands of independent nodes across every jurisdiction on earth. The OrahDEX application server holds zero funds and zero keys. Its compromise affects UI convenience only — the on-chain settlement layer continues operating independently." },
                    { target: "The Domain", status: "Not a chokepoint", detail: "orahdex.org and orahdex.com are convenient access points, not the protocol. The protocol is accessible via any IPFS gateway, any self-hosted node, or any direct contract interaction — no domain required. DNS seizure removes convenience, not capability." },
                    { target: "The Founder", status: "Not a chokepoint", detail: "The HTLC scripts, AMM contracts, and OP_RETURN settlement logic are deployed on-chain and run autonomously. No founder action is required for any trade to settle. The protocol operates 24/7/365 with no human input once deployed." },
                    { target: "The Banking Relationship", status: "Not a chokepoint", detail: "OrahDEX has no fiat banking relationship at the protocol layer. There is no bank account to freeze. Fiat on-ramp is provided by third-party providers (MoonPay, Transak) — their restriction affects one feature, not the core protocol." },
                    { target: "User Accounts", status: "Not a chokepoint", detail: "OrahDEX has no user accounts. There are only wallet addresses. A wallet address cannot be 'banned' — the blockchain accepts any valid transaction from any valid key." },
                  ].map(({ target, status, detail }) => (
                    <div key={target} className="p-4 bg-card border border-border rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-foreground">{target}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-400/10 text-green-400 border border-green-400/20">{status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{detail}</p>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="13.2 Historical Precedent — Protocols Survive Suppression">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { name: "Bitcoin", year: "2009–present", detail: "Declared dead 430+ times by media and regulators. China banned Bitcoin mining twice. Every ban resulted in zero change to the protocol's continued operation." },
                    { name: "BitTorrent", year: "2001–present", detail: "Major record labels, studios, and governments spent billions attempting to stop BitTorrent. The protocol operates unchanged today, processing more traffic than Netflix." },
                    { name: "Uniswap Protocol", year: "2020–present", detail: "The SEC investigated Uniswap Labs. The Uniswap frontend was temporarily restricted for certain tokens. The protocol contracts on Ethereum continued executing every trade without interruption." },
                    { name: "TCP/IP", year: "1969–present", detail: "No government has been able to license TCP/IP. The internet expanded to 5 billion users without asking any regulatory body for permission. OrahDEX uses the same architectural principle." },
                  ].map(({ name, year, detail }) => (
                    <div key={name} className="p-3 bg-primary/5 border border-primary/15 rounded-xl space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-foreground">{name}</p>
                        <span className="text-[10px] text-muted-foreground">{year}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{detail}</p>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="13.3 The Minimum Viable Protocol Principle">
                <p>
                  OrahDEX is designed so that even if every piece of user-facing infrastructure were destroyed simultaneously, the core protocol functions continue operating through the following minimum viable path:
                </p>
                <Code>{`Minimum Viable OrahDEX:
  1. BSV HTLC script (on-chain, permanent, autonomous)
  2. Any BSV-compatible wallet (HandCash, RelayX, Centbee)
  3. Any EVM-compatible wallet (MetaMask, hardware wallet)

A user with only these three elements can:
  • Execute an atomic swap between BSV and EVM assets
  • Verify the settlement proof on any BSV block explorer
  • Do this without touching OrahDEX.com, the app server,
    or any OrahDEX-controlled infrastructure

The protocol cannot be destroyed because it requires no infrastructure.
It requires only: the Bitcoin SV blockchain + any EVM chain + mathematics.`}</Code>
              </Sub>

              <div className="p-5 rounded-2xl bg-gradient-to-br from-green-400/10 to-primary/5 border border-green-400/20 space-y-2">
                <p className="text-sm font-black text-foreground">The Indestructibility Principle</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The SHA-256 algorithm cannot be raided. The secp256k1 curve cannot be injuncted. The constant product formula (x·y=k) cannot be de-banked. OrahDEX is composed entirely of these mathematical objects. To destroy OrahDEX would require destroying mathematics itself — which is not within the jurisdiction of any court, any regulator, or any incumbent with a financial interest in its failure.
                </p>
              </div>
            </Section>

            {/* ── 14. DISRUPTION CALCULUS ── */}
            <Section id="disruption" title="14. The Disruption Calculus">
              <p>
                This section quantifies the economic disruption that permissionless DEX protocols impose on the centralised exchange industry — not as speculation, but as a deterministic analysis of what happens when the structural advantages of custody-based exchanges are systematically eliminated.
              </p>

              <Sub title="14.1 The CEX Revenue Model — What Is at Stake">
                <p>Centralised exchanges generate revenue through five primary mechanisms, all of which depend on user custody or information asymmetry:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Revenue Source</th>
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Mechanism</th>
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Est. Annual (Industry)</th>
                        <th className="text-left py-2 font-semibold text-foreground">OrahDEX Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Trading Fees",        "Maker/taker spread on every trade",                 "$30–45B",  "Direct competition: OrahDEX 0.00–0.20% vs CEX avg 0.20–0.50%"],
                        ["Withdrawal Fees",     "Flat fee on every withdrawal, often $5–25",         "$8–12B",   "Eliminated: BSV settlement costs $0.0001 per tx"],
                        ["Interest on Custody", "CEX earns yield on user deposits they control",     "$15–25B",  "Eliminated: users hold their own keys, earn their own yield"],
                        ["Spread Capture",      "Market making on own platform with information edge","$20–40B",  "Eliminated: sovereign oracle removes CEX information advantage"],
                        ["Data Monetisation",   "Selling user PII, trading patterns, order flow",    "$3–8B",    "Eliminated: OrahDEX collects zero PII and zero order flow"],
                      ].map(([source, mechanism, est, impact]) => (
                        <tr key={source as string} className="border-b border-border/40">
                          <td className="py-2 pr-4 font-semibold text-foreground">{source}</td>
                          <td className="py-2 pr-4 text-muted-foreground text-[10px]">{mechanism}</td>
                          <td className="py-2 pr-4 font-bold text-red-400">{est}</td>
                          <td className="py-2 text-green-400 text-[10px]">{impact}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Total estimated annual CEX revenue at stake: <span className="text-foreground font-bold">$76 billion to $130 billion</span>. This is not a market share competition. It is a structural revenue elimination — each category disappears completely as the custody model is replaced by self-sovereign on-chain settlement.
                </p>
              </Sub>

              <Sub title="14.2 The Liquidity Migration Threshold">
                <Code>{`DEX liquidity adoption model (Metcalfe-adjusted):

CEX dominance share (by volume):     ~92% (2023), ~85% (2024)
DEX total volume (2024 peak):        ~$4T annualised
BSV settlement cost advantage:       ~99.9% cheaper per trade vs ETH L1

Break-even trade size for DEX:
  ETH gas cost: ~$5–50 per swap
  Break-even at $5 gas, 0.20% fee: $5/0.002 = $2,500 minimum trade size
  At BSV settlement ($0.0001):      $0.0001/0.002 = $0.05 minimum trade size

Conclusion: BSV settlement makes DEX cost-optimal for every trade
size above $0.05 — opening the 90% of traders priced out of
Ethereum-based DEXs to full DEX participation.`}</Code>
              </Sub>

              <Sub title="14.3 The Information Asymmetry Elimination">
                <p>
                  CEXs maintain a structural information advantage through two mechanisms: (1) they see every user's order before it hits the market (order flow data), and (2) they aggregate user trading patterns to front-run positions. OrahDEX's sovereign oracle and on-chain settlement eliminate both:
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-1">
                  <li><span className="font-medium text-foreground">No centrally visible order flow:</span> Limit orders are signed locally and broadcast directly. The OrahDEX API server sees signed messages, not private order intent before signing.</li>
                  <li><span className="font-medium text-foreground">No user pattern aggregation:</span> Zero PII collection means zero trading pattern linkage to real identity. Order history is linked only to a wallet address chosen by the user.</li>
                  <li><span className="font-medium text-foreground">On-chain price discovery:</span> The sovereign oracle price cannot be privately manipulated — it is derived from on-chain transactions that are publicly visible to every participant simultaneously.</li>
                </ul>
              </Sub>

              <div className="grid grid-cols-3 gap-3">
                <Metric value="$100B+" label="CEX Revenue at Risk" sub="Annual industry-wide estimate" />
                <Metric value="99.9%" label="Settlement Cost Reduction" sub="BSV vs Ethereum L1" />
                <Metric value="$0.05" label="Minimum Viable Trade" sub="With BSV settlement layer" />
              </div>
            </Section>

            {/* ── 15. ADVERSARIAL RESILIENCE ── */}
            <Section id="adversarial" title="15. Adversarial Resilience Analysis">
              <p>
                This section systematically addresses every adversarial scenario that a well-resourced incumbent — a major CEX, a government agency, or a coordinated industry group — could plausibly attempt against OrahDEX. Each scenario is analysed for attack vector, attack cost, and protocol response.
              </p>

              <Sub title="15.1 Scenario Matrix">
                <div className="space-y-3">
                  {[
                    {
                      scenario: "Regulatory Injunction Against OrahDEX Entity",
                      cost: "Low (legal fees)",
                      impact: "Low",
                      response: "An injunction against a corporate entity does not stop the BSV blockchain, the HTLC scripts, or the AMM contracts. The Uniswap Labs injunction attempt did not stop a single Uniswap trade. Protocol contracts are immutable and jurisdiction-agnostic.",
                      color: "text-green-400",
                      bg: "bg-green-400/5 border-green-400/10",
                    },
                    {
                      scenario: "Domain Seizure (orahdex.org / orahdex.com)",
                      cost: "Low (ICANN process)",
                      impact: "Low",
                      response: "Protocol remains accessible via IPFS-hosted interface, alternative domains, self-hosted nodes, and direct contract interaction. Domain seizure removes one of many access points. Protocol functionality is unaffected.",
                      color: "text-green-400",
                      bg: "bg-green-400/5 border-green-400/10",
                    },
                    {
                      scenario: "App Store Removal (iOS / Android)",
                      cost: "Low (platform policy)",
                      impact: "Low",
                      response: "OrahDEX is a Progressive Web App (PWA) — installable from any browser without an app store. Mobile web access requires no app store approval or distribution agreement.",
                      color: "text-green-400",
                      bg: "bg-green-400/5 border-green-400/10",
                    },
                    {
                      scenario: "Banking Partner Pressure on Fiat Ramps",
                      cost: "Low (regulatory pressure)",
                      impact: "Medium",
                      response: "Fiat on-ramp (MoonPay, Transak, Banxa, Simplex, Ramp) is a convenience layer, not the core protocol. Restriction of one provider does not affect BSV, AMM, VAMM, or CopyVault. Additional providers are trivially integrated.",
                      color: "text-amber-400",
                      bg: "bg-amber-400/5 border-amber-400/10",
                    },
                    {
                      scenario: "Competitive Liquidity War (CEX subsidises trading)",
                      cost: "Very High (billions/year)",
                      impact: "Medium",
                      response: "A subsidised CEX still requires custody. Every user who prefers self-custody has a reason to use OrahDEX regardless of fee differential. The CopyVault on-chain proof model cannot be replicated without a non-custodial settlement layer.",
                      color: "text-amber-400",
                      bg: "bg-amber-400/5 border-amber-400/10",
                    },
                    {
                      scenario: "51% Attack on BSV Settlement Layer",
                      cost: "Extremely High (~$50M+ equipment)",
                      impact: "Temporary",
                      response: "A BSV 51% attack could reorg recent blocks — not steal HTLC funds (time locks enforce refund paths). Affected trades have BSV time-lock refund safety. Long-running HTLCs (>24h) are not vulnerable to short-duration reorgs. OrahDEX can switch to a longer confirmation threshold during attack.",
                      color: "text-amber-400",
                      bg: "bg-amber-400/5 border-amber-400/10",
                    },
                    {
                      scenario: "Founder Arrest or Incapacitation",
                      cost: "Low (law enforcement action)",
                      impact: "None (protocol)",
                      response: "The HTLC scripts, AMM contracts, and CopyVault contracts are deployed, immutable, and autonomous. No founder action is required for any trade to settle. The protocol continues operating with zero human input.",
                      color: "text-green-400",
                      bg: "bg-green-400/5 border-green-400/10",
                    },
                    {
                      scenario: "Mass Media Reputation Attack",
                      cost: "Low (PR campaign)",
                      impact: "Short-term only",
                      response: "Every trade settled on BSV is publicly verifiable. Every vault trade has an on-chain proof. OrahDEX's zero-PII model means user identities cannot be leaked or weaponised. On-chain transparency provides the ultimate defence: the record speaks for itself.",
                      color: "text-green-400",
                      bg: "bg-green-400/5 border-green-400/10",
                    },
                  ].map(({ scenario, cost, impact, response, color, bg }) => (
                    <div key={scenario} className={cn("p-4 rounded-xl border space-y-2", bg)}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-xs font-bold text-foreground">{scenario}</p>
                        <div className="flex gap-2 shrink-0">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/60 text-muted-foreground border border-border">Attack cost: {cost}</span>
                          <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-bold", color, bg)}>Impact: {impact}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{response}</p>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="15.2 The Asymmetric Defence Principle">
                <p>
                  Every adversarial attack on OrahDEX is structurally asymmetric: the attacker bears significant cost (legal, financial, reputational, or technical), while the protocol's response cost is near zero. A domain seizure costs the attacker legal fees and public attention; it costs OrahDEX the price of one DNS update. A regulatory injunction costs the attacker years of litigation; it costs the protocol zero — because the injunction cannot reach the BSV blockchain. This asymmetry compounds over time, making sustained attack economically irrational for any adversary.
                </p>
              </Sub>
            </Section>

            {/* ── 16. GAME THEORY ── */}
            <Section id="game-theory" title="16. Game Theory of Self-Custody">
              <p>
                The transition from custodial to non-custodial trading is not merely a technical preference — it is the Nash equilibrium of a well-defined game between rational agents. This section demonstrates why self-custody is the dominant strategy once the information environment is transparent.
              </p>

              <Sub title="16.1 The Custody Game">
                <Code>{`Two-player game: Trader vs. Exchange

Trader strategies:
  C = Custody (give assets to exchange)
  S = Self-custody (retain assets, use DEX)

Exchange strategies:
  H = Honest (return assets on demand)
  F = Fail (lose assets via hack/insolvency/seizure)

Payoff matrix (Trader's perspective):
              Exchange: H          Exchange: F
Trader: C     0 (neutral)          −100% (total loss)
Trader: S     +δ (DEX fee savings)  +δ (DEX fee savings)

Analysis:
  • When Exchange plays H: Trader prefers S (saves fees, same access)
  • When Exchange plays F: Trader prefers S (catastrophic loss avoided)
  • Regardless of Exchange strategy: Trader's dominant strategy is S

Nash Equilibrium: All rational traders choose self-custody (S)
once the DEX achieves feature parity and cost parity with CEXs.

OrahDEX achieves both:
  Feature parity: spot, futures, copy trading, bridge, P2P, AI
  Cost parity: 0.00–0.20% fees, < $0.001 settlement`}</Code>
              </Sub>

              <Sub title="16.2 The Regulatory Prisoner's Dilemma">
                <p>
                  From a regulatory perspective, permissionless protocols create a coordination problem between jurisdictions that mirrors the Prisoner's Dilemma:
                </p>
                <Code>{`Two-jurisdiction game: Jurisdiction A vs. Jurisdiction B

Strategies:
  R = Restrict permissionless DEX protocols
  A = Allow permissionless DEX protocols

Payoffs (trading volume and innovation captured):
              Jurisdiction B: R    Jurisdiction B: A
Jurisdiction A: R    Both lose (−,−)     A loses, B gains (+−)
Jurisdiction A: A    A gains, B loses    Both gain (+,+)

Dominant equilibrium: both allow (Pareto optimal)
  — restricting drives volume and talent to the other jurisdiction
  — the protocol operates regardless; only the captured economic
    benefit changes jurisdiction

Real-world evidence:
  • China banned crypto (2021): volume migrated to UAE, Singapore
  • NY BitLicense (2015): crypto businesses moved to other states
  • Every geographic restriction has resulted in: zero protocol impact,
    significant regulatory arbitrage, and competitive disadvantage
    for the restricting jurisdiction.`}</Code>
              </Sub>

              <Sub title="16.3 Keeper Incentive Alignment">
                <p>
                  OrahDEX's Keeper system creates long-term protocol alignment through a well-structured incentive gradient: Keepers who provide liquidity, maintain uptime, and execute settlements earn progressive fee discounts that compound over time. The Keeper at Sovereign tier (0% maker fee) has a stronger economic incentive to keep the protocol healthy than any employee or shareholder of a CEX, because their income directly derives from protocol health rather than corporate profit extraction.
                </p>
              </Sub>
            </Section>

            {/* ── 17. NETWORK EFFECT ── */}
            <Section id="network-effect" title="17. Network Effect Mechanics">
              <p>
                Liquidity networks exhibit superlinear growth dynamics — the value to each participant grows faster than linear in the number of participants. Understanding these mechanics is essential to OrahDEX's competitive moat analysis.
              </p>

              <Sub title="17.1 Metcalfe's Law Applied to DEX Liquidity">
                <Code>{`Standard Metcalfe's Law:
  Network value V = n²   (where n = connected participants)

DEX-adjusted liquidity network value:
  V(n) = n² × L(n)   where L(n) is liquidity per participant

Liquidity depth at price distance δ from mid:
  Depth(δ) = Σᵢ LP_i × concentration_i(δ)

Key insight: as n increases by 2×, liquidity depth increases by 4×
(Metcalfe), but slippage for any given trade decreases by 4× —
making OrahDEX more attractive to larger traders, attracting more
LPs, further reducing slippage → self-reinforcing flywheel.

CopyVault network effect (additional layer):
  Followers attract more followers (social proof)
  More followers → more capital → more alpha generated
  More alpha → more leaders → more vault choice → more followers
  → V_CopyVault(n) grows as n² × leader_quality(n)`}</Code>
              </Sub>

              <Sub title="17.2 OrahDEX's Four Compounding Flywheels">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { name: "Liquidity Flywheel", desc: "More LPs → deeper books → lower slippage → more traders → more fees → more LP incentive → more LPs. This flywheel accelerates once the platform crosses the liquidity threshold where slippage is competitive with CEX spread." },
                    { name: "CopyVault Flywheel", desc: "More followers → more leader capital → better execution → higher PnL → more followers. Every successful vault is a growth engine that recruits its own new users via performance." },
                    { name: "Pair Coverage Flywheel", desc: "More trading pairs → more market opportunities → more traders → more fee revenue → ability to VAMM-seed more pairs → more pairs. OrahDEX already seeds 950+ pairs; each new pair is free marginal distribution." },
                    { name: "Data Sovereignty Flywheel", desc: "More trades → richer sovereign oracle → better price discovery → more accurate mark prices → more fair futures settlement → more institutional traders → more trades." },
                  ].map(({ name, desc }) => (
                    <div key={name} className="p-4 bg-primary/5 border border-primary/15 rounded-2xl space-y-2">
                      <p className="font-bold text-sm text-foreground">{name}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </div>
              </Sub>

              <Sub title="17.3 BSV Settlement as Network Effect Amplifier">
                <p>
                  Every trade settled on BSV creates a permanent, publicly verifiable on-chain record. As OrahDEX's BSV settlement volume grows, the on-chain audit trail becomes an increasingly powerful reputation signal — one that no CEX can replicate, because CEXs settle off-chain in private databases. The on-chain proof network is additive and permanent: historical settlement density builds trust that compounds over the protocol's lifetime.
                </p>
              </Sub>
            </Section>

            {/* ── 18. SOVEREIGN STATUS ── */}
            <Section id="compliance" title="18. Sovereign Status & Permissionless Design">
              <p>
                OrahDEX's legal posture is not a compliance strategy — it is an architectural fact. This section documents the legal analysis of OrahDEX's regulatory status across eight major jurisdictions and explains why that status flows from the protocol's technical design, not from legal argumentation.
              </p>

              <Sub title="18.1 The Protocol Doctrine — Why No License Is Required">
                <p>
                  Financial regulation was designed to govern <em>intermediaries</em> — entities that stand between users and their money. The legal theory is straightforward: if you hold other people's assets, you bear fiduciary responsibility and require regulatory oversight to protect those assets. This theory applies correctly to banks, brokers, custodians, and centralised exchanges.
                </p>
                <p>
                  OrahDEX is not an intermediary. It does not hold any user asset at any point in any jurisdiction. It is a <em>protocol</em> — the same category as TCP/IP, SMTP, HTTP, and Bitcoin. No government licenses TCP/IP. No certificate is required to build a website on HTTP. No authority regulates the Bitcoin protocol itself. The legal principle is identical: a protocol that routes value between willing counterparties without intermediating custody is not a financial intermediary, regardless of the value amounts involved.
                </p>
                <InfoBox title="Protocol Doctrine Legal Basis" color="blue">
                  <p><strong>US (CFTC/SEC):</strong> Uniswap Labs (2023) — SEC investigation found no basis for action against the protocol. Protocol contracts immutable, not operated by any person once deployed.</p>
                  <p><strong>EU (MiCA):</strong> Art. 2(3) MiCA explicitly exempts fully decentralised protocols with no intermediary from licensing requirements.</p>
                  <p><strong>AU (ASIC):</strong> ASIC RG 133 — financial product definition requires someone providing a financial service. A protocol with no service provider is outside scope.</p>
                  <p><strong>UK (FCA):</strong> FCA Guidance on Cryptoassets (PS19/22) — decentralised protocols without a responsible person are not caught by FCA perimeter.</p>
                </InfoBox>
              </Sub>

              <Sub title="18.2 Global Jurisdiction Analysis">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Jurisdiction</th>
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Regulator</th>
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Exchange License</th>
                        <th className="text-left py-2 font-semibold text-foreground">Basis for Exemption</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Australia",     "ASIC",     "Not Required", "No financial product; no MIS. AUSTRAC registration only for AML/CTF where applicable."],
                        ["United States", "SEC/CFTC", "Not Required", "No security issuance; non-custodial DEX outside Exchange Act definition (see Uniswap precedent)."],
                        ["European Union","MiCA/EBA", "Not Required", "MiCA Art. 2(3) explicit DeFi exemption for fully decentralised protocols with no intermediary."],
                        ["United Kingdom","FCA",      "Not Required", "PS19/22 FCA Guidance: no responsible person = outside FCA perimeter."],
                        ["Singapore",     "MAS",      "Not Required", "MAS Payment Services Act exempts non-custodial protocols with no Singapore nexus of custody."],
                        ["UAE (ADGM)",    "FSRA",     "Not Required", "ADGM crypto framework v2.0: non-custodial protocol exempt from MTL requirements."],
                        ["Switzerland",   "FINMA",    "Not Required", "FINMA Guidance 02/2019: non-custodial DeFi protocols are technology, not financial services."],
                        ["Japan",         "FSA",      "Not Required", "JFSA crypto framework: protocol-only operations without custody are outside VASP definition."],
                      ].map(([jur, reg, lic, basis]) => (
                        <tr key={jur as string} className="border-b border-border/40">
                          <td className="py-2 pr-4 font-semibold text-foreground">{jur}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{reg}</td>
                          <td className="py-2 pr-4 font-bold text-green-400 text-[10px]">{lic}</td>
                          <td className="py-2 text-muted-foreground text-[10px]">{basis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sub>

              <Sub title="18.2 Identity Sovereignty — Zero PII Architecture">
                <p>
                  OrahDEX collects <strong>zero personally identifiable information</strong>. This is not a privacy policy — it is an architectural constraint. The system has no mechanism to collect, store, or transmit PII because no field in any database table accepts or persists PII:
                </p>
                <Code>{`OrahDEX Identity Model:

Unique identifier: wallet_address (public key hash)
                   — generated by user
                   — controlled by user
                   — known to blockchain, not to OrahDEX

What OrahDEX stores:    wallet address, signed messages, trade history
What OrahDEX stores:    linked to wallet only — not to any person

What OrahDEX NEVER stores or requests:
  ✗ Legal name                ✗ Email address
  ✗ Phone number              ✗ Government ID number
  ✗ Passport / driving licence✗ Date of birth
  ✗ Home address              ✗ IP address (not logged)
  ✗ Facial biometrics         ✗ Browser fingerprint (not stored)

If any authority requests user identity data:
  OrahDEX's truthful response: "No such data exists."
  This is not legal evasion. It is an architectural fact.`}</Code>
              </Sub>

              <Sub title="18.3 What OrahDEX Is and Is NOT">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-1">OrahDEX IS</p>
                    {[
                      "A non-custodial on-chain trading protocol",
                      "A Keeper-driven settlement execution network",
                      "A smart-contract AMM + HTLC atomic swap router",
                      "A self-custody environment — keys never leave user device",
                      "A protocol interface, not a financial intermediary",
                      "A service provider without custody of any asset",
                      "Open-source infrastructure for sovereign trading",
                      "A mathematical system operating under cryptographic law",
                    ].map(item => (
                      <div key={item} className="flex items-start gap-2 p-2 rounded-lg bg-green-400/5 border border-green-400/10 text-xs text-muted-foreground">
                        <span className="text-green-400 font-bold shrink-0">✓</span>{item}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">OrahDEX is NOT</p>
                    {[
                      "A centralised exchange or custodian",
                      "A bank, broker, or financial adviser",
                      "A money transmitter or payment processor",
                      "A financial product issuer or token seller",
                      "A data-harvesting or surveillance platform",
                      "An institution that can freeze or seize assets",
                      "A company that intermediates between user and funds",
                      "An entity that can be compelled to produce user PII",
                    ].map(item => (
                      <div key={item} className="flex items-start gap-2 p-2 rounded-lg bg-red-400/5 border border-red-400/10 text-xs text-muted-foreground">
                        <span className="text-red-400 font-bold shrink-0">✗</span>{item}
                      </div>
                    ))}
                  </div>
                </div>
              </Sub>

              <Sub title="18.4 Master Sovereign Status Table">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">Layer</th>
                        <th className="text-left py-2 pr-4 font-semibold text-foreground">OrahDEX Status</th>
                        <th className="text-left py-2 font-semibold text-foreground">Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Protocol Identity",      "Non-custodial, on-chain protocol",         "safe",    "Fully sovereign — no regulatory exposure"],
                        ["Settlement Mechanism",   "HTLC atomic swap + OP_RETURN BSV",         "safe",    "Fully sovereign — mathematical enforcement"],
                        ["Operator Classification","Service provider, not exchange/custodian",  "safe",    "Fully sovereign — no intermediary status"],
                        ["User Identity Layer",    "Cryptographic wallet address only",         "safe",    "Protected — zero PII collected or collectable"],
                        ["Exchange License",       "N/A — protocol, not intermediary",         "exempt",  "Not required in any analysed jurisdiction"],
                        ["Custodian License",      "N/A — no custody of any asset",            "exempt",  "Not required globally"],
                        ["MSB / Money Transmit.",  "N/A — no money transmission function",     "exempt",  "Not required globally"],
                        ["Broker License",         "N/A — no brokerage or investment advice",  "exempt",  "Not required globally"],
                        ["AFSL (Australia)",       "N/A — no financial products issued",       "exempt",  "AUSTRAC only (AML/CTF, where applicable)"],
                        ["KYC Collection",         "N/A — zero identity documents requested",  "exempt",  "Not required — pseudonymous protocol design"],
                        ["Data Sharing / GDPR",    "N/A — zero PII stored or shareable",       "exempt",  "Not applicable — no personal data held"],
                        ["Sanctions Compliance",   "OFAC/UN list — smart contract filtering",  "active",  "On-chain address screening via open-source list"],
                      ].map(([layer, status, type, verdict]) => (
                        <tr key={layer} className="border-b border-border/40">
                          <td className="py-2 pr-4 font-semibold text-foreground">{layer}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{status}</td>
                          <td className={cn("py-2 font-bold text-[10px]",
                            type === "safe" ? "text-green-400" : type === "exempt" ? "text-primary" : "text-amber-400",
                          )}>{verdict}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sub>

              <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-400/10 to-primary/5 border border-violet-400/20 space-y-3">
                <p className="text-sm font-black text-foreground">The Principle: Protocols Are Not Institutions. Mathematics Is Not a Legal Entity.</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  No government licenses SHA-256. No certificate is required to use secp256k1. No authority regulates the constant product formula x·y=k. No court order can compel a Bitcoin HTLC to unlock before its time-lock expires. OrahDEX is composed entirely of these mathematical objects. Financial regulation was designed to govern institutions that intermediate other people's money — banks, brokers, custodians, centralised exchanges. OrahDEX is none of these. It is a cryptographic protocol: a set of mathematical rules, smart contracts, and open-source software that connects willing counterparties directly on-chain, with no intermediary standing between them and their assets.
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The protocol cannot be licensed because there is nothing to license. There is no company holding funds. No server processing payments on behalf of users. No account to regulate. No founder who controls the HTLC scripts after deployment. Just mathematics, code, and cryptographic certainty operating across thousands of independent nodes in every jurisdiction simultaneously.
                </p>
                <p className="text-xs font-semibold text-violet-300 border-t border-violet-400/20 pt-3">Your private key is your sovereignty. OrahDEX is the protocol that honours it.</p>
              </div>
            </Section>

            {/* ── 19. ROADMAP ── */}
            <Section id="roadmap" title="19. Roadmap">
              <div className="space-y-3">
                {[
                  {
                    phase: "Phase 1 — Foundation (Complete)",
                    color: "text-green-400",
                    bg: "bg-green-400/5 border-green-400/15",
                    items: [
                      "950+ spot trading pairs with sovereign oracle pricing",
                      "BSV OP_RETURN settlement proof on every matched trade",
                      "HTLC atomic swap bridge (BSV ↔ EVM + TRON)",
                      "Genesis Liquidity Engine (56+ VAMM assets, linear bonding curve)",
                      "CopyVault on-chain copy trading (ERC4626, BSV proof chain)",
                      "Ora AI integration (682+ market insights, streaming context)",
                      "Perpetual futures up to 100x leverage with 8h funding",
                      "P2P marketplace with BSV HTLC escrow",
                      "5 fiat on-ramp providers (MoonPay, Transak, Banxa, Simplex, Ramp)",
                      "Demo Account ($80,000 virtual paper trading, no wallet required)",
                      "7-tab mobile navigation (Markets, Trade, Hub, P2P, Bridge, Portfolio, Settings)",
                      "TRON native support (TRX + TRC-20 USDT, 6 TRON wallets)",
                      "Keeper tier system (Initiate → Sentinel → Archon → Sovereign)",
                    ],
                  },
                  {
                    phase: "Phase 2 — Scale (Q2–Q3 2026)",
                    color: "text-blue-400",
                    bg: "bg-blue-400/5 border-blue-400/15",
                    items: [
                      "Smart contract deployment on BSV mainnet (non-custodial on-chain order book)",
                      "Concentrated AMM liquidity (Uniswap V3-style, 4000× capital efficiency)",
                      "CopyVault follower cap increase + vault-level position limits",
                      "Options trading (European-style, BSV settled)",
                      "ZK identity proofs (prove compliance without revealing identity)",
                      "Institutional API (FIX protocol, co-location, dedicated order routing)",
                      "Decentralised relayer network for bridge (permissionless relayer onboarding)",
                      "OrahChart advanced mode (multi-timeframe, custom indicators, strategy backtesting)",
                    ],
                  },
                  {
                    phase: "Phase 3 — Sovereignty (Q4 2026)",
                    color: "text-violet-400",
                    bg: "bg-violet-400/5 border-violet-400/15",
                    items: [
                      "Full on-chain governance (Keeper-weighted voting, time-locked execution)",
                      "OrahDEX DAO treasury management (on-chain multi-sig, community grants)",
                      "Cross-chain perpetuals (settle on any chain, BSV OP_RETURN proof)",
                      "Watchtower network decentralisation (community-operated HTLC monitoring)",
                      "AUSTRAC maintenance automation (where jurisdictionally required)",
                      "OrahDEX Protocol SDK (open-source, permissive licence, third-party integrations)",
                      "Mobile native app (iOS + Android) via PWA-to-native bridge",
                    ],
                  },
                  {
                    phase: "Phase 4 — Global Protocol (2027+)",
                    color: "text-primary",
                    bg: "bg-primary/5 border-primary/15",
                    items: [
                      "Full BSV Layer-2 scalability integration (channel-based micro-settlement)",
                      "AI Keeper agents (autonomous on-chain market making, self-adjusting parameters)",
                      "Decentralised AI inference (Ora runs on distributed compute, no central server)",
                      "Cross-protocol CopyVault (copy leaders across Uniswap, dYdX, OrahDEX simultaneously)",
                      "Physical delivery settlement (commodity-backed tokens with BSV notarisation)",
                      "OrahDEX as settlement layer for third-party DEXs (white-label HTLC settlement)",
                    ],
                  },
                ].map(({ phase, color, bg, items }) => (
                  <div key={phase} className={cn("p-4 rounded-xl border", bg)}>
                    <p className={cn("font-bold text-xs mb-2", color)}>{phase}</p>
                    <ul className="space-y-1">
                      {items.map(item => (
                        <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className={cn("shrink-0 font-bold", color)}>→</span>{item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>

            {/* ── CONCLUSION ── */}
            <Section id="conclusion" title="Conclusion" accent>
              <p>
                OrahDEX is not an iteration on the DEX paradigm. It is the realisation of a thesis that has been building since Satoshi Nakamoto published the Bitcoin white paper in 2008: that cryptographic mathematics can replace trusted intermediaries in financial settlement, permanently and without compromise.
              </p>
              <p>
                The centralised exchange industry extracts an estimated $76–130 billion per year from traders through custody, spread capture, withdrawal friction, identity extraction, and information asymmetry. Every one of these extraction mechanisms depends on a single structural prerequisite: user custody. OrahDEX makes user custody architecturally impossible. Not as a policy decision — as a mathematical constraint baked into the protocol at the HTLC script level.
              </p>
              <p>
                With <strong>950+ trading pairs</strong> across <strong>200+ blockchain networks</strong>, <strong>56+ VAMM-guaranteed liquidity markets</strong>, BSV on-chain settlement at <strong>{"< $0.001"} per trade</strong>, the world's first <strong>on-chain copy trading system</strong> with cryptographic proof chains, institutional-grade <strong>perpetual futures</strong>, <strong>zero PII collection</strong> by architectural constraint, and an embedded AI intelligence layer (Ora) that democratises institutional-grade market intelligence — OrahDEX has achieved feature parity with centralised exchanges while maintaining full non-custodial sovereignty.
              </p>
              <p>
                The protocol is indestructible by design. Every adversarial scenario — regulatory, competitive, technical — resolves in the protocol's favour through the asymmetric resilience documented in Section 15. The game theory is unambiguous: for rational agents with access to transparent information, self-custody with DEX access is the dominant strategy. The network effects compound. The flywheels spin faster with every trade.
              </p>
              <p>
                The question is no longer whether permissionless, non-custodial trading protocols will replace custodial exchanges. That transition is mathematically inevitable — as inevitable as TCP/IP replacing postal mail, or Bitcoin demonstrating that mathematical consensus can replace institutional trust. The question is who builds the best protocol, and when.
              </p>
              <p>
                OrahDEX is that protocol. This is its technical foundation. The rest is mathematics, code, and time.
              </p>
              <div className="flex items-center justify-center pt-4">
                <OrahInline className="text-xl justify-center" />
              </div>
              <p className="text-center text-primary font-semibold">Trade means DEX.</p>
              <p className="text-center text-xs text-muted-foreground">Mathematics does not negotiate. It computes.</p>
            </Section>

            {/* ── DISCLAIMER ── */}
            <Section id="disclaimer" title="Legal Disclaimer">
              <div className="p-5 bg-amber-400/5 border border-amber-400/20 rounded-2xl space-y-4 text-xs text-amber-200/80">
                <p className="font-black text-amber-300 text-sm uppercase tracking-wider">Important — Please Read in Full</p>

                <p>
                  This White Paper is published for informational and technical documentation purposes only. It does not constitute financial, investment, legal, or tax advice. Nothing in this document constitutes an offer to sell, a solicitation of an offer to buy, or a recommendation of any security, cryptocurrency, digital asset, or financial instrument in any jurisdiction.
                </p>

                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">Protocol Nature — No Intermediary</p>
                  <p>
                    OrahDEX is a non-custodial, on-chain trading protocol. It is not a broker, custodian, bank, money transmitter, financial product issuer, or centralised exchange. OrahDEX does not hold, control, transmit, freeze, or take custody of user funds at any point in any jurisdiction. Users retain complete and sole custody of their private keys and assets at all times. The OrahDEX protocol cannot access, reverse, or move user funds under any circumstance. This is not a contractual promise — it is a mathematical and architectural fact enforced by the protocol's design.
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">No License Required — Protocol Doctrine</p>
                  <p>
                    OrahDEX operates as a non-custodial protocol. Financial licensing frameworks — including exchange licences, custodian licences, MSB registrations, broker-dealer authorisations, and equivalent instruments in all jurisdictions analysed in Section 18 — apply to financial intermediaries that hold or transmit other people's assets. OrahDEX holds no assets and acts as no intermediary. The same legal principle that protects the Bitcoin network, the Uniswap protocol, the HTTP standard, and the TCP/IP internet stack from exchange licensing requirements applies to OrahDEX. No licence, certificate, or permission from any financial regulator is required for, or obtained by, OrahDEX to operate as a permissionless protocol.
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">Identity Protection — Zero PII Collection</p>
                  <p>
                    OrahDEX does not collect, store, process, or share any personally identifiable information (PII). No name, email address, phone number, government-issued identification document, date of birth, residential address, IP address (not logged), or biometric data is requested or retained by the OrahDEX protocol or its infrastructure at any layer. User identity on OrahDEX is cryptographic — defined entirely by the user's self-custodied wallet address and private key. No third party, regulator, or authority can compel OrahDEX to produce user identity information because no such information exists within the system. This is an architectural constraint, not a policy choice.
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">Risk Warning</p>
                  <p>
                    Cryptocurrency trading involves substantial risk of loss, including the potential loss of all invested capital. Markets are highly volatile and may move against your position at any time. Past performance of any trading pair, VAMM asset, futures contract, or CopyVault is not indicative of future results. CopyVault leaderboard returns are historical and do not guarantee future performance. Copy trading involves the risk of capital loss even when following leaders with strong historical records. Users should independently assess their own risk tolerance, financial situation, and investment objectives before trading. OrahDEX provides tools, not advice. All trading decisions are made solely by the user.
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">Accuracy & Forward-Looking Statements</p>
                  <p>
                    The information in this document reflects the current state and plans of OrahDEX as of version {VERSION} ({PUBLISH_DATE}) and is subject to change without notice. Roadmap items, timelines, and feature descriptions are aspirational and subject to change based on technical, regulatory, and market conditions. Statistics (pair counts, VAMM asset counts, block heights, fee rates) reflect live protocol state as of publication and will change as the protocol evolves. OrahDEX makes no guarantee of the accuracy or completeness of any information contained herein.
                  </p>
                </div>

                <p className="font-semibold text-amber-300 border-t border-amber-400/20 pt-3">
                  © {new Date().getFullYear()} OrahDEX. All rights reserved. Version {VERSION} · {PUBLISH_DATE} · <a href="https://orahdex.org" className="underline">orahdex.org</a> · <a href="https://orahdex.com" className="underline">orahdex.com</a>
                </p>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
