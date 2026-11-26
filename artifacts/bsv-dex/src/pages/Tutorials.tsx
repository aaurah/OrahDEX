import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeftRight, ArrowRight, BookOpen, ChevronDown, CircleHelp,
  Eye, LockKeyhole, Route, Search, ShieldCheck, Wallet, TriangleAlert,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { BrandLogo } from "@/components/BrandLogo";

type Guide = {
  id: string;
  category: string;
  title: string;
  summary: string;
  duration: string;
  icon: typeof Wallet;
  steps: { title: string; body: string; href?: string; linkLabel?: string }[];
};

const GUIDES: Guide[] = [
  {
    id: "connect-wallet",
    category: "Wallet basics",
    title: "Connect a wallet safely",
    summary: "Choose a wallet you control, confirm the request, then check the connected account and chain.",
    duration: "3 min",
    icon: Wallet,
    steps: [
      { title: "Open your wallet", body: "Use the Connect control in OrahDEX, then select a supported wallet option. Confirm you are on the official OrahDEX site before approving anything." },
      { title: "Review the connection request", body: "Your wallet may ask to connect or share a public account address. Read the request in the wallet itself; connecting does not require revealing your recovery phrase or private key." },
      { title: "Confirm account and network", body: "After connecting, check that the displayed address and selected network match the wallet account you intended to use. A connected wallet can still be on the wrong chain." },
      { title: "Disconnect when needed", body: "You can manage or disconnect the session from the wallet controls. Re-check permissions in your wallet if a request is unexpected." , href: "/wallet", linkLabel: "Open Wallet" },
    ],
  },
  {
    id: "review-order",
    category: "Markets & trading",
    title: "Find a market and review an order",
    summary: "Locate a pair, understand the order details, and make a deliberate decision before confirming.",
    duration: "4 min",
    icon: Eye,
    steps: [
      { title: "Find the pair", body: "Browse markets and search for the asset pair you want. Open the pair to inspect its price, recent activity, and available order controls.", href: "/markets", linkLabel: "Browse Markets" },
      { title: "Open the trade view", body: "For the BSV/USDT example, open the spot page. Confirm the pair shown at the top before entering an order.", href: "/trade/BSV-USDT", linkLabel: "View BSV / USDT" },
      { title: "Set order details", body: "Choose buy or sell, order type, and amount. For a limit order, review the limit price; for a market order, understand that the fill price may differ from the last displayed price." },
      { title: "Pause at the review step", body: "Check side, asset pair, amount, price or slippage where shown, and any fees. If your wallet opens a signing request, inspect its network and transaction details before approving. Do not assume an order will fill or settle by a particular time." },
    ],
  },
  {
    id: "swap-bridge-dex",
    category: "Routes & quotes",
    title: "Compare Swap, Bridge, and DEX routes",
    summary: "Each tab can use a different route and confirmation flow. Read the quote before continuing.",
    duration: "5 min",
    icon: Route,
    steps: [
      { title: "Choose a flow", body: "Open Exchange and select Swap, Bridge, or DEX. Swap and Bridge may present provider-based quotes or order flows; the DEX tab presents an on-chain route when one is available.", href: "/swap", linkLabel: "Open Exchange" },
      { title: "Set the assets and networks", body: "Select the exact input and output assets, source and destination chains where applicable, and the amount. Check that the destination chain can receive the asset." },
      { title: "Inspect quote and route", body: "Review the estimated output, rate, route or provider, minimum received or slippage, and displayed fees. A quote can change or become unavailable; availability depends on the route/provider and current conditions." },
      { title: "Understand who handles the flow", body: "Provider-based Swap/Bridge flows are handled through the selected provider's quoted flow and may require provider-specific steps. DEX swaps are wallet-signed on-chain transactions: your wallet asks you to approve the transaction on the selected chain." },
      { title: "Confirm only after checking", body: "Verify chain, destination, amount, route, and fees in the app and any wallet prompt. Decline if details differ from what you intended. Neither execution nor settlement timing is guaranteed." },
    ],
  },
  {
    id: "receive-send",
    category: "Wallet basics",
    title: "Receive and send assets carefully",
    summary: "Use the right network and verify every address and amount before sharing or signing.",
    duration: "4 min",
    icon: ArrowLeftRight,
    steps: [
      { title: "Receive to the matching network", body: "Open Wallet and choose Receive. Select the asset and chain, then copy or scan the address. Before sending funds to it, confirm the sender uses that same network and asset.", href: "/wallet", linkLabel: "Open Wallet" },
      { title: "Verify the destination", body: "Compare the full address using a trusted channel, not just the first and last characters. For a new or high-value destination, consider a small test transfer if appropriate." },
      { title: "Review a send", body: "Choose Send, select the correct asset and chain, enter the destination and amount, and review the estimated network fee. Keep enough of the chain's native asset for any required network fee." },
      { title: "Inspect the wallet prompt", body: "Check chain, destination, amount, and fee again in the wallet before signing. A signed on-chain transfer may be difficult or impossible to reverse." },
    ],
  },
];

const CATEGORIES = ["All guides", "Wallet basics", "Markets & trading", "Routes & quotes"];

export function TutorialsPage() {
  const [category, setCategory] = useState("All guides");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>("connect-wallet");

  useSEO({
    title: "Tutorials",
    description: "Step-by-step OrahDEX guides for wallet connections, market orders, swap routes, and wallet safety.",
    keywords: "OrahDEX tutorials, wallet safety, trading guide, swap, bridge, DEX",
    url: "/tutorials",
  });

  const filteredGuides = GUIDES.filter((guide) => {
    const matchesCategory = category === "All guides" || guide.category === category;
    const searchableText = [
      guide.title,
      guide.summary,
      guide.category,
      ...guide.steps.flatMap((step) => [step.title, step.body]),
    ].join(" ").toLowerCase();
    return matchesCategory && (!query.trim() || searchableText.includes(query.trim().toLowerCase()));
  });

  return (
    <main className="min-h-[100dvh] bg-background text-foreground" data-testid="page-tutorials">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/swap" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="link-tutorials-brand">
            <BrandLogo textSize="text-sm" />
          </Link>
          <nav aria-label="Tutorial page navigation" className="flex items-center gap-4 text-sm">
            <Link href="/support" className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded" data-testid="link-tutorials-support">Support</Link>
            <Link href="/markets" className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 font-semibold text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="link-tutorials-markets">
              Markets <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:pt-10">
        <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_290px] lg:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
              <BookOpen className="h-3.5 w-3.5" /> OrahDEX learning library
            </div>
            <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">A clear read before you connect or confirm.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Short, practical walkthroughs for wallets, markets, and routed trades. Take your time; nothing here asks you to sign or transact.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4" data-testid="text-tutorial-count">
            <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Review first. Confirm yourself.</div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">OrahDEX connects to wallets you control. Always read the request in your wallet before approving.</p>
          </div>
        </div>

        <div className="grid gap-7 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl border border-border bg-card p-4">
              <label htmlFor="tutorial-search" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Find a guide</label>
              <div className="relative">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="tutorial-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search topics"
                  className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                  data-testid="input-tutorial-search"
                />
              </div>
              <div className="mt-4 space-y-1" aria-label="Filter tutorials">
                {CATEGORIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={category === item}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${category === item ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                    data-testid={`button-filter-${item.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}`}
                  >
                    {item}<span className="font-mono text-[11px]">{item === "All guides" ? GUIDES.length : GUIDES.filter((guide) => guide.category === item).length}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4" data-testid="notice-wallet-safety">
              <div className="flex items-start gap-2 text-sm font-semibold text-foreground">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> Keep keys private
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Never share your recovery phrase or private keys with anyone, including someone claiming to be support.</p>
            </div>
          </aside>

          <section aria-label="Tutorial guides" className="min-w-0 space-y-3">
            {filteredGuides.length ? filteredGuides.map((guide) => {
              const Icon = guide.icon;
              const isOpen = expanded === guide.id;
              return (
                <article key={guide.id} className={`overflow-hidden rounded-2xl border bg-card transition-colors ${isOpen ? "border-primary/30" : "border-border"}`} data-testid={`card-tutorial-${guide.id}`}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`guide-content-${guide.id}`}
                    onClick={() => setExpanded(isOpen ? null : guide.id)}
                    className="flex w-full items-start gap-4 p-4 text-left sm:p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    data-testid={`button-toggle-${guide.id}`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <span>{guide.category}</span><span aria-hidden="true">·</span><span>{guide.duration}</span>
                      </span>
                      <span className="mt-1 block text-base font-bold sm:text-lg">{guide.title}</span>
                      <span className="mt-1 block text-sm leading-5 text-muted-foreground">{guide.summary}</span>
                    </span>
                    <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  <div
                    id={`guide-content-${guide.id}`}
                    hidden={!isOpen}
                    className="border-t border-border/70 px-4 pb-5 pt-4 sm:px-5"
                    data-testid={`content-tutorial-${guide.id}`}
                  >
                      <ol className="space-y-0">
                        {guide.steps.map((step, stepIndex) => (
                          <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
                            {stepIndex < guide.steps.length - 1 && <span aria-hidden="true" className="absolute left-[13px] top-7 h-[calc(100%-8px)] w-px bg-border" />}
                            <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-background font-mono text-[11px] font-bold text-primary">{String(stepIndex + 1).padStart(2, "0")}</span>
                            <div className="min-w-0 pt-0.5">
                              <h3 className="text-sm font-semibold">{step.title}</h3>
                              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{step.body}</p>
                              {step.href && step.linkLabel && (
                                <Link href={step.href} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`link-guide-${guide.id}-${stepIndex + 1}`}>
                                  {step.linkLabel}<ArrowRight className="h-3 w-3" />
                                </Link>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                  </div>
                </article>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center" data-testid="empty-tutorial-results">
                <CircleHelp className="mx-auto h-7 w-7 text-muted-foreground" />
                <h2 className="mt-3 font-semibold">No guides match that search</h2>
                <p className="mt-1 text-sm text-muted-foreground">Try another topic or clear your search.</p>
                <button type="button" onClick={() => { setQuery(""); setCategory("All guides"); }} className="mt-4 rounded-lg bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="button-clear-tutorial-filters">Clear filters</button>
              </div>
            )}
          </section>
        </div>

        <section className="mt-8 grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6" aria-labelledby="before-confirming-title">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <h2 id="before-confirming-title" className="font-bold">Before you confirm anything</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                Verify the <strong className="font-semibold text-foreground">chain, destination, amount, route, and fees</strong> in the app and wallet prompt. Never share recovery phrases or private keys. Quotes, route availability, execution, and settlement timing can vary and are not guaranteed.
              </p>
            </div>
          </div>
          <Link href="/support" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="link-tutorials-get-help">
            Need help? <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </main>
  );
}
