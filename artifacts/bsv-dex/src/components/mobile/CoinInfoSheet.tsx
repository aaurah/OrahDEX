import { X, Globe, FileText, ExternalLink, Code2, MessageCircle, TrendingUp, BarChart2, Layers, Cpu, Calendar, Sparkles, AlertTriangle, Zap, Users } from "lucide-react";
import { CoinLogo } from "@/components/CoinLogo";
import { getTagColor } from "@/lib/coinInfo";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ContractAddressBadge } from "@/components/ContractAddressBadge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  symbol: string | null;
  onClose: () => void;
}

interface AiInsight {
  summary?: string;
  useCase?: string;
  strengths?: string[];
  risks?: string[];
  traderNote?: string;
}

interface CoinFull {
  error?: string;
  cgId?: string;
  name?: string;
  symbol?: string;
  description?: string;
  categories?: string[];
  image?: string;
  marketCapRank?: number | null;
  genesisDate?: string | null;
  hashingAlgo?: string | null;
  countryOrigin?: string | null;
  platforms?: Record<string, string>;
  homepage?: string | null;
  whitepaper?: string | null;
  twitter?: string | null;
  twitterHandle?: string | null;
  reddit?: string | null;
  github?: string | null;
  telegram?: string | null;
  priceUsd?: number | null;
  priceChange24h?: number | null;
  priceChange7d?: number | null;
  priceChange30d?: number | null;
  priceChange1y?: number | null;
  marketCap?: number | null;
  fullyDilutedVal?: number | null;
  totalVolume?: number | null;
  circulatingSupply?: number | null;
  totalSupply?: number | null;
  maxSupply?: number | null;
  ath?: number | null;
  athDate?: string | null;
  athChangePercent?: number | null;
  atl?: number | null;
  atlDate?: string | null;
  atlChangePercent?: number | null;
  twitterFollowers?: number | null;
  redditSubscribers?: number | null;
  aiAnalysis?: string | null;
}

function fmtNum(n: number | null | undefined, opts?: Intl.NumberFormatOptions): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", opts ?? { maximumFractionDigits: 2 });
}

function fmtBig(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtSupply(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 1)    return `$${n.toFixed(4)}`;
  if (n >= 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(10)}`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return s; }
}

function PctBadge({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const up = v >= 0;
  return (
    <span className={cn("font-semibold tabular-nums", up ? "text-green-400" : "text-red-400")}>
      {up ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
        {icon}{title}
      </p>
      {children}
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-semibold text-foreground", accent)}>{value}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="px-4 pb-6 space-y-5 animate-pulse">
      <div className="h-4 w-3/4 bg-secondary rounded-lg" />
      <div className="h-4 w-1/2 bg-secondary rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        {[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-secondary rounded-xl" />)}
      </div>
      <div className="h-24 bg-secondary rounded-xl" />
      <div className="h-16 bg-secondary rounded-xl" />
    </div>
  );
}

export function CoinInfoSheet({ symbol, onClose }: Props) {
  const { data, isLoading, isError } = useQuery<CoinFull>({
    queryKey: ["coin-full", symbol],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/coins/${encodeURIComponent(symbol!)}/full`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json() as CoinFull;
      // Treat API-level errors as failures so React Query retries & never caches them
      if (json.error === "not_found" || json.error === "fetch_failed") {
        throw new Error(json.error);
      }
      return json;
    },
    enabled: !!symbol,
    staleTime: 30 * 60 * 1000,
    retry: 2,
  });

  if (!symbol) return null;

  let ai: AiInsight | null = null;
  if (data?.aiAnalysis) {
    try { ai = JSON.parse(data.aiAnalysis); } catch { ai = null; }
  }

  const notFound = isError;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border-t border-border rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle + close — minimal, never covers content */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1 rounded-t-2xl">
          <div className="w-8" />
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body — coin identity is first item inside, no overlap */}
        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-2 space-y-5">

          {/* Coin identity — always shown, even while loading */}
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <CoinLogo symbol={symbol} size={44} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-lg font-bold text-foreground leading-tight">
                  {data?.name ?? symbol}
                </span>
                <span className="text-sm font-mono text-muted-foreground">{data?.symbol ?? symbol}</span>
                {data?.marketCapRank && (
                  <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20 leading-none">
                    #{data.marketCapRank}
                  </span>
                )}
              </div>
              {data?.categories && data.categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {data.categories.slice(0, 3).map(tag => (
                    <span key={tag} className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded border leading-none", getTagColor(tag))}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {isLoading && <Skeleton />}

          {!isLoading && notFound && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-center">
              <p className="text-sm text-muted-foreground">No data found for <span className="font-semibold text-foreground">{symbol}</span>.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">This may be a DEX-native or bridge-only pair.</p>
            </div>
          )}

          {!isLoading && data && !notFound && (
            <>
              {/* ── AI Analysis ─────────────────────────────────────────────── */}
              {ai && (
                <Section title="AI Analysis by Ora" icon={<Sparkles className="w-3 h-3 text-violet-400" />}>
                  <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3.5 space-y-3">
                    {ai.summary && (
                      <p className="text-sm text-foreground/90 leading-relaxed">{ai.summary}</p>
                    )}
                    {ai.useCase && (
                      <div>
                        <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-1">Use Case</p>
                        <p className="text-xs text-foreground/80 leading-relaxed">{ai.useCase}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {ai.strengths && ai.strengths.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-1.5">Strengths</p>
                          <ul className="space-y-1">
                            {ai.strengths.map((s, i) => (
                              <li key={i} className="text-[11px] text-foreground/80 flex gap-1.5">
                                <span className="text-green-400 shrink-0 mt-0.5">✓</span>{s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {ai.risks && ai.risks.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1.5">Risks</p>
                          <ul className="space-y-1">
                            {ai.risks.map((r, i) => (
                              <li key={i} className="text-[11px] text-foreground/80 flex gap-1.5">
                                <AlertTriangle size={10} className="text-red-400 shrink-0 mt-0.5" />{r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    {ai.traderNote && (
                      <div className="flex gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                        <Zap size={13} className="text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-200 leading-relaxed">{ai.traderNote}</p>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Price Performance ────────────────────────────────────────── */}
              <Section title="Price Performance" icon={<TrendingUp className="w-3 h-3" />}>
                <div className="rounded-xl border border-border bg-secondary/30 overflow-hidden">
                  {data.priceUsd != null && (
                    <div className="px-3 py-2.5 border-b border-border/40 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Current Price (USD)</span>
                      <span className="text-sm font-bold text-foreground tabular-nums">{fmtPrice(data.priceUsd)}</span>
                    </div>
                  )}
                  <StatRow label="24h Change"  value={<PctBadge v={data.priceChange24h} />} />
                  <StatRow label="7d Change"   value={<PctBadge v={data.priceChange7d} />} />
                  <StatRow label="30d Change"  value={<PctBadge v={data.priceChange30d} />} />
                  <StatRow label="1Y Change"   value={<PctBadge v={data.priceChange1y} />} />
                </div>
              </Section>

              {/* ── Market Stats ─────────────────────────────────────────────── */}
              <Section title="Market Statistics" icon={<BarChart2 className="w-3 h-3" />}>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: "Market Cap",      value: fmtBig(data.marketCap) },
                    { label: "FDV",             value: fmtBig(data.fullyDilutedVal) },
                    { label: "24h Volume",      value: fmtBig(data.totalVolume) },
                    { label: "Mkt Cap Rank",    value: data.marketCapRank ? `#${data.marketCapRank}` : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-secondary/50 border border-border/60 rounded-xl px-3 py-2.5">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── All-Time Records ─────────────────────────────────────────── */}
              <Section title="All-Time Records" icon={<TrendingUp className="w-3 h-3 text-green-400" />}>
                <div className="rounded-xl border border-border bg-secondary/30 overflow-hidden">
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <div className="px-3 py-2.5">
                      <p className="text-[10px] text-green-400 font-bold uppercase tracking-wider mb-1">ATH</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">{fmtPrice(data.ath)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(data.athDate)}</p>
                      {data.athChangePercent != null && (
                        <p className="text-[10px] text-red-400 mt-0.5">{data.athChangePercent.toFixed(1)}% from ATH</p>
                      )}
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider mb-1">ATL</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">{fmtPrice(data.atl)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(data.atlDate)}</p>
                      {data.atlChangePercent != null && (
                        <p className="text-[10px] text-green-400 mt-0.5">+{data.atlChangePercent.toFixed(0)}% from ATL</p>
                      )}
                    </div>
                  </div>
                </div>
              </Section>

              {/* ── Supply ──────────────────────────────────────────────────── */}
              <Section title="Supply" icon={<Layers className="w-3 h-3" />}>
                <div className="rounded-xl border border-border bg-secondary/30 overflow-hidden">
                  <StatRow label="Circulating Supply" value={`${fmtSupply(data.circulatingSupply)} ${data.symbol ?? symbol}`} />
                  <StatRow label="Total Supply"        value={`${fmtSupply(data.totalSupply)} ${data.symbol ?? symbol}`} />
                  <StatRow label="Max Supply"          value={data.maxSupply ? `${fmtSupply(data.maxSupply)} ${data.symbol ?? symbol}` : "∞ Unlimited"} />
                  {data.circulatingSupply && data.maxSupply && data.maxSupply > 0 && (
                    <div className="px-3 py-2.5">
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>Circulating %</span>
                        <span className="font-semibold text-foreground">{((data.circulatingSupply / data.maxSupply) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min(100, (data.circulatingSupply / data.maxSupply) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* ── Community ────────────────────────────────────────────────── */}
              {(data.twitterFollowers || data.redditSubscribers) && (
                <Section title="Community" icon={<Users className="w-3 h-3" />}>
                  <div className="grid grid-cols-2 gap-2.5">
                    {data.twitterFollowers && (
                      <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] text-sky-400 mb-0.5">X Followers</p>
                        <p className="text-sm font-bold text-foreground">{fmtSupply(data.twitterFollowers)}</p>
                      </div>
                    )}
                    {data.redditSubscribers && (
                      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] text-orange-400 mb-0.5">Reddit Members</p>
                        <p className="text-sm font-bold text-foreground">{fmtSupply(data.redditSubscribers)}</p>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Contract / Network ───────────────────────────────────────── */}
              <Section title="Contract / Network" icon={<Cpu className="w-3 h-3" />}>
                <ContractAddressBadge baseAsset={symbol} variant="inline" />
                {data.platforms && Object.keys(data.platforms).length > 0 && (
                  <div className="space-y-1.5 mt-1">
                    {Object.entries(data.platforms).slice(0, 5).map(([chain, addr]) => addr && (
                      <div key={chain} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-secondary/40 border border-border text-xs">
                        <span className="text-muted-foreground capitalize">{chain}</span>
                        <span className="font-mono text-foreground/80 truncate max-w-[140px]">{addr.slice(0, 8)}…{addr.slice(-6)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* ── Technical ────────────────────────────────────────────────── */}
              {(data.genesisDate || data.hashingAlgo || data.countryOrigin) && (
                <Section title="Technical Details" icon={<Calendar className="w-3 h-3" />}>
                  <div className="rounded-xl border border-border bg-secondary/30 overflow-hidden">
                    {data.genesisDate    && <StatRow label="Genesis Date"     value={fmtDate(data.genesisDate)} />}
                    {data.hashingAlgo   && <StatRow label="Hashing Algorithm" value={data.hashingAlgo} />}
                    {data.countryOrigin && <StatRow label="Country of Origin" value={data.countryOrigin} />}
                  </div>
                </Section>
              )}

              {/* ── About ────────────────────────────────────────────────────── */}
              {data.description && (
                <Section title={`About ${data.name ?? symbol}`} icon={<Sparkles className="w-3 h-3" />}>
                  <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">
                    {data.description}
                  </p>
                </Section>
              )}

              {/* ── Links ────────────────────────────────────────────────────── */}
              <Section title="Links & Resources">
                <div className="space-y-1.5">
                  {data.homepage && (
                    <LinkRow href={data.homepage} icon={<Globe className="w-4 h-4 text-primary" />} label={data.homepage.replace(/^https?:\/\//, "").replace(/\/$/, "")} />
                  )}
                  {data.whitepaper && (
                    <LinkRow href={data.whitepaper} icon={<FileText className="w-4 h-4 text-blue-400" />} label="Whitepaper" />
                  )}
                  {data.twitter && (
                    <LinkRow href={data.twitter} icon={<span className="w-4 h-4 text-sky-400 text-xs font-black flex items-center justify-center">𝕏</span>} label={data.twitterHandle ? `@${data.twitterHandle}` : "X / Twitter"} />
                  )}
                  {data.reddit && (
                    <LinkRow href={data.reddit} icon={<span className="w-4 h-4 text-orange-400 text-sm font-black flex items-center justify-center">r/</span>} label="Reddit" />
                  )}
                  {data.github && (
                    <LinkRow href={data.github} icon={<Code2 className="w-4 h-4 text-foreground" />} label="GitHub" />
                  )}
                  {data.telegram && (
                    <LinkRow href={data.telegram} icon={<MessageCircle className="w-4 h-4 text-sky-500" />} label="Telegram" />
                  )}
                </div>
              </Section>

              {/* ── Market data research ────────────────────────────────────── */}
              <Section title="Market Data">
                <div className="space-y-1.5">
                  {data.cgId && (
                    <LinkRow href={`https://www.coingecko.com/en/coins/${data.cgId}`} icon={<ExternalLink className="w-4 h-4 text-green-400" />} label="CoinGecko" />
                  )}
                  <LinkRow href={`https://coinmarketcap.com/currencies/${(data.cgId ?? symbol).toLowerCase()}/`} icon={<ExternalLink className="w-4 h-4 text-blue-400" />} label="CoinMarketCap" />
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LinkRow({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-2 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/60 border border-border transition"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icon}
        <span className="text-sm text-foreground truncate">{label}</span>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    </a>
  );
}
