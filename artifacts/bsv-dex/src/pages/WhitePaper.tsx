import { useState } from "react";
import { ArrowLeft, FileText, Download, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useLocation } from "wouter";
import { OrahInline, BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";
import { CAPABILITY_STATUS, CAPABILITY_STATUS_AS_OF } from "@/lib/capabilityStatus";

const VERSION = "5.0.0";
const FOUNDER = "Parminder Singh";
const FOUNDER_ALIASES = "Aura · Orah · Aaurah";

const SECTIONS = [
  { id: "abstract", label: "Abstract" },
  { id: "status", label: "Current implementation status" },
  { id: "architecture", label: "1. Architecture and custody" },
  { id: "orderbook", label: "2. Ethereum orderbook" },
  { id: "markets", label: "3. Markets and liquidity" },
  { id: "swaps", label: "4. Swaps and bridges" },
  { id: "features", label: "5. Other product areas" },
  { id: "economics", label: "6. Fees and providers" },
  { id: "security", label: "7. Security and limitations" },
  { id: "privacy", label: "8. Privacy and compliance" },
  { id: "roadmap", label: "9. Roadmap" },
  { id: "glossary", label: "Glossary" },
  { id: "disclaimer", label: "Legal disclaimer" },
];

function TocEntry({ id, label, active, onClick }: {
  id: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all",
        active ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-white/5",
      )}
    >
      {label}
    </button>
  );
}

function Section({ id, title, children, accent = false }: {
  id: string; title: string; children: React.ReactNode; accent?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className={cn("flex items-center gap-3 pb-2 border-b", accent ? "border-primary/30" : "border-border")}>
        <h2 className={cn("text-lg font-black", accent ? "text-primary" : "text-foreground")}>{title}</h2>
      </div>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function Notice({ title, children, tone = "amber" }: {
  title: string; children: React.ReactNode; tone?: "amber" | "blue" | "green" | "red";
}) {
  const tones = {
    amber: "bg-amber-400/5 border-amber-400/20 text-amber-200",
    blue: "bg-blue-400/5 border-blue-400/20 text-blue-200",
    green: "bg-green-400/5 border-green-400/20 text-green-200",
    red: "bg-red-400/5 border-red-400/20 text-red-200",
  };
  return (
    <div className={cn("p-4 rounded-xl border space-y-1", tones[tone])}>
      <p className="font-semibold text-xs uppercase tracking-wider">{title}</p>
      <div className="text-xs leading-relaxed opacity-90">{children}</div>
    </div>
  );
}

export function WhitePaper() {
  useSEO({
    title: "OrahDEX White Paper — Current Product and Route Status",
    description: "Current OrahDEX architecture, supported trading routes, custody boundaries, market-data limits, and security considerations.",
    keywords: "OrahDEX whitepaper, trading routes, Ethereum escrow, market data, custody, security",
  });
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
            aria-label="Go back"
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
            <span className="text-xs text-muted-foreground hidden sm:block">{CAPABILITY_STATUS_AS_OF}</span>
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
        <div role="alert" className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          This paper distinguishes verified routes from limited or provider-dependent features. The source build and published app can differ until a new build is published; always check the route shown in the app.
        </div>
        <div className="flex gap-8">
          <aside className="hidden lg:block w-52 shrink-0">
            <div className="sticky top-20 space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-3 mb-2">Contents</p>
              {SECTIONS.map(section => (
                <TocEntry key={section.id} {...section} active={activeSection === section.id} onClick={() => scrollTo(section.id)} />
              ))}
            </div>
          </aside>

          <main className="flex-1 min-w-0 space-y-12">
            <div className="lg:hidden">
              <button
                onClick={() => setTocOpen(open => !open)}
                className="w-full flex items-center justify-between px-4 py-3 bg-card border border-border rounded-xl text-sm font-semibold"
              >
                <span>Table of Contents</span>
                {tocOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {tocOpen && (
                <div className="mt-2 p-2 bg-card border border-border rounded-xl space-y-0.5">
                  {SECTIONS.map(section => (
                    <TocEntry key={section.id} {...section} active={activeSection === section.id} onClick={() => scrollTo(section.id)} />
                  ))}
                </div>
              )}
            </div>

            <header className="text-center space-y-5 py-8 border border-border rounded-3xl bg-gradient-to-b from-primary/5 to-transparent">
              <div className="flex justify-center"><BrandLogo textSize="text-4xl" /></div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">OrahDEX White Paper</h1>
                <p className="text-primary font-semibold mt-1 text-lg">Trade Means DEX</p>
                <p className="text-sm text-muted-foreground mt-2">
                  By <span className="text-foreground font-semibold">{FOUNDER}</span>
                  <span className="text-muted-foreground/60 mx-1.5">·</span>
                  <span className="text-primary/80 text-xs font-medium">{FOUNDER_ALIASES}</span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed px-4">
                A current description of OrahDEX's trading paths, operational dependencies, and route-specific risks.
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground flex-wrap px-4">
                <span>Version {VERSION}</span><span>·</span><span>{CAPABILITY_STATUS_AS_OF}</span><span>·</span>
                <a href="https://orahdex.com" className="text-primary hover:underline flex items-center gap-1">
                  orahdex.com <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </header>

            <Section id="abstract" title="Abstract" accent>
              <p>
                OrahDEX is a digital-asset application with wallet-signed, server-managed, and third-party-provider routes. The custody model, supported assets, fees, execution, settlement, and operational dependencies vary by feature.
              </p>
              <p>
                This paper records what is supported by the current source and verified deployment evidence. A user interface, market quote, or API endpoint is not by itself proof of an on-chain contract, completed trade, guaranteed liquidity, or payout.
              </p>
              <p>
                The status table below is the reference for current availability. Longer-term capabilities are identified as limited, provider-dependent, or planned rather than presented as universal protocol guarantees.
              </p>
            </Section>

            <Section id="status" title="Current implementation status" accent>
              <p>
                Last reviewed {CAPABILITY_STATUS_AS_OF}. These statuses describe the reviewed application source and public deployment evidence; providers, chains, and production deployments can change.
              </p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[620px] text-xs border-collapse">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border">
                      <th className="text-left p-3 font-semibold text-foreground">Area</th>
                      <th className="text-left p-3 font-semibold text-foreground">Status</th>
                      <th className="text-left p-3 font-semibold text-foreground">What this means</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAPABILITY_STATUS.map(capability => (
                      <tr key={capability.id} className="border-b border-border/60 last:border-0 align-top">
                        <td className="p-3 font-semibold text-foreground">{capability.area}</td>
                        <td className="p-3 whitespace-nowrap"><span className="px-2 py-1 rounded-full bg-primary/10 text-primary">{capability.status}</span></td>
                        <td className="p-3 leading-relaxed">{capability.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Notice title="Published version can lag" tone="blue">
                Publishing updates the live site and API. If the published deployment has not received this source build, its actual behavior may differ from the table.
              </Notice>
            </Section>

            <Section id="architecture" title="1. Architecture and custody">
              <p>
                A trading request may involve the user's wallet, the OrahDEX API and database, a smart contract, a relayer, or an external provider. Which parties handle funds and execution depends on the selected feature.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-card border border-border space-y-1">
                  <h3 className="font-bold text-foreground">Wallet-signed actions</h3>
                  <p className="text-xs">The wallet signs the transaction or message. Confirm the selected account, network, contract, and transaction details in the wallet.</p>
                </div>
                <div className="p-4 rounded-xl bg-card border border-border space-y-1">
                  <h3 className="font-bold text-foreground">API-managed features</h3>
                  <p className="text-xs">The API may store order records, route requests, maintain application state, or coordinate a relayer. These services can be unavailable or out of sync with chain state.</p>
                </div>
              </div>
              <Notice title="Custody is route-specific" tone="amber">
                Do not assume that every feature is non-custodial. Check whether a route locks assets in a contract, uses an internal ledger, or relies on a provider or server-managed wallet.
              </Notice>
            </Section>

            <Section id="orderbook" title="2. Ethereum wallet-funded orderbook">
              <p>
                The verified wallet-funded orderbook path is Ethereum mainnet (chain ID 1) and supports registered assets with 18 decimals. The deployed escrow is <code className="text-primary break-all">0x50ca6cEBAD36bdDC73752AD4F0Ab6401a1625eD9</code>.
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>A wallet signs and submits an order to the escrow contract; the contract locks the required sell asset or buy quote asset.</li>
                <li>The order remains open until it is matched, expires under contract rules, or is cancelled.</li>
                <li>A matched order requires an on-chain settlement transaction. An order appearing in a book is not proof that it filled.</li>
                <li>Cancellation is an on-chain action. Check the wallet prompt and transaction receipt; a database status change alone cannot release escrowed funds.</li>
              </ol>
              <Notice title="Chain state is authoritative" tone="green">
                The application order list is an index of activity, not the source of escrow balances. Confirm an order using its transaction hash and the contract's current order state. Recovery can rebuild a missing list record from confirmed events; it does not send a transaction or move funds.
              </Notice>
              <p>
                Order matching depends on compatible live orders, price, remaining amount, expiry, and network availability. No fill or execution price is guaranteed.
              </p>
            </Section>

            <Section id="markets" title="3. Markets, charts, and liquidity">
              <p>
                Market lists, prices, candles, and volume summaries come from configured data providers and application records. Provider outages, low activity, pair age, and missing exchange fills can leave a chart or order book empty.
              </p>
              <p>
                Reference candles can help display historical price movement but are not OrahDEX fills. External market depth, synthetic depth, and virtual liquidity must not be represented as executable OrahDEX orders.
              </p>
              <Notice title="No guaranteed liquidity" tone="amber">
                A listed pair or displayed price does not guarantee a counterparty, a route, a fill, or a price. Review the live order book and the order's funding and settlement instructions.
              </Notice>
            </Section>

            <Section id="swaps" title="4. Swaps and bridges">
              <p>
                Swap and bridge routes can request quotes from external providers. Quotes, minimums, fees, wallet approvals, transaction submission, and provider settlement are separate steps.
              </p>
              <p>
                A quote or an application balance update is not proof that an external provider delivered the output asset. Verify the provider's order status and the destination-chain transaction before treating funds as received.
              </p>
              <p>
                Provider availability, supported networks, and minimum amounts can change. An unavailable quote should be shown as unavailable rather than replaced by an invented price.
              </p>
            </Section>

            <Section id="features" title="5. Other product areas">
              <p>
                Futures, prediction rounds, P2P, copy features, and NFT tools are separate product areas. Availability and state management vary; the existence of a route or control does not establish that a feature is fully on-chain or available on every network.
              </p>
              <p>
                Do not infer guaranteed leverage, yield, payouts, creator-token liquidity, or cross-chain settlement unless the current feature terms, deployed contract, and transaction path explicitly confirm it.
              </p>
            </Section>

            <Section id="economics" title="6. Fees and providers">
              <p>
                Fees, spread, gas, limits, and provider charges are route-specific. A global maker/taker schedule should not be inferred from this paper. Review the quote and wallet transaction details before signing.
              </p>
              <p>
                Third-party providers set their own terms, availability, and processing times. OrahDEX cannot guarantee a provider's quote, exchange rate, completion time, or service continuity.
              </p>
            </Section>

            <Section id="security" title="7. Security and operational limitations">
              <ul className="list-disc pl-5 space-y-2">
                <li>Smart contracts can contain defects and may depend on privileged relayers or other roles.</li>
                <li>API, database, RPC, wallet, and data-provider outages can prevent an order from appearing, matching, or completing.</li>
                <li>Internal-ledger and provider-managed paths have different risks from direct wallet transactions.</li>
                <li>Market, bridge, token, and counterparty risks remain even when a transaction is confirmed.</li>
                <li>This document does not claim that every contract or feature has passed an independent security audit.</li>
              </ul>
              <Notice title="Outages do not change chain state" tone="red">
                If the app is unavailable, inspect the transaction and contract on the relevant network. Do not sign a new transaction solely because an order is missing from the interface.
              </Notice>
            </Section>

            <Section id="privacy" title="8. Privacy and compliance">
              <p>
                OrahDEX processes wallet addresses, transaction and order records, and operational data. Some support, administrative, verification, or provider flows may process additional information. Review the current privacy notice and feature-specific disclosures.
              </p>
              <p>
                Regulatory requirements depend on the service and jurisdiction. This paper is not a legal opinion and does not claim that any feature is exempt from licensing, registration, or other requirements.
              </p>
            </Section>

            <Section id="roadmap" title="9. Roadmap and change control">
              <p>
                Network expansion, full-chain trading, broader contract coverage, and provider integrations are not implied by the current feature list. A roadmap item remains planned until the app, API, contract deployment, and user flow are verified together.
              </p>
              <p>
                Changes to supported networks, settlement, fees, or custody should update the shared capability status used by this paper and the landing page. The status date is updated only after the corresponding evidence is reviewed.
              </p>
            </Section>

            <Section id="glossary" title="Glossary">
              <dl className="space-y-3">
                {[
                  ["Escrow order", "An order whose required assets are held by a smart contract until settlement or cancellation rules release them."],
                  ["Reference price", "A price obtained from market data; it is not a promise of an executable order."],
                  ["Provider quote", "An estimate from an external venue. It is not proof that a trade or payout has completed."],
                  ["Relayer", "A service that submits or coordinates transactions; its role and permissions depend on the contract."],
                  ["Route-specific custody", "The custody and control model can differ between wallet-signed, API-managed, and provider-managed features."],
                ].map(([term, definition]) => (
                  <div key={term}>
                    <dt className="font-bold text-foreground">{term}</dt>
                    <dd>{definition}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section id="disclaimer" title="Legal disclaimer">
              <Notice title="Important — read before using the service" tone="amber">
                <p>
                  This paper is informational only and is not financial, investment, legal, or tax advice, or an offer or recommendation to buy or sell a digital asset.
                </p>
                <p>
                  Digital-asset trading involves substantial risk, including the possible loss of all funds. Smart-contract, market, wallet, provider, custody, regulatory, and operational risks can affect users differently by route.
                </p>
                <p>
                  Product descriptions and network support can change. Verify the current route, contract, fees, wallet prompt, provider status, and legal requirements before proceeding. Obtain independent professional advice where appropriate.
                </p>
                <p className="border-t border-amber-400/20 pt-3">
                  © {new Date().getFullYear()} OrahDEX · {FOUNDER} · Version {VERSION} · {CAPABILITY_STATUS_AS_OF} · <a href="https://orahdex.com" className="underline">orahdex.com</a>
                </p>
              </Notice>
              <div className="flex items-center justify-center pt-3"><OrahInline className="text-xl justify-center" /></div>
              <p className="text-center text-primary font-semibold">Trade Means DEX.</p>
            </Section>
          </main>
        </div>
      </div>
    </div>
  );
}
