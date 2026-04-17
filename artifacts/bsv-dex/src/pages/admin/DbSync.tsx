import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Database, RefreshCw, CheckCircle2, AlertTriangle, Loader2, ChevronRight,
  ArrowDownToLine, ArrowUpFromLine, Wallet, Activity, ShieldCheck, Search,
  X, Check, Copy, CheckCheck, TrendingUp, Users, Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/adminFetch";

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function fmt(n: number | string, dec = 2) {
  const v = parseFloat(String(n));
  if (isNaN(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString(undefined, { maximumFractionDigits: dec });
}
function shortAddr(a: string) { return a ? `${a.slice(0, 8)}…${a.slice(-6)}` : "—"; }

function CopyBtn({ text }: { text: string }) {
  const [c, setC] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 1500); }}
      className="p-0.5 text-muted-foreground hover:text-foreground">
      {c ? <CheckCheck className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

interface HealthSummary {
  totalWallets: number; walletsWithBalances: number;
  orphanedBalanceWallets: number; orphanedOrderWallets: number; orphanedTradeWallets: number;
  totalOrders: number; openOrders: number; totalTrades: number;
  pendingWithdrawals: number; verifiedDeposits: number; depositAddresses: number;
  mintBurnLogs: number; coverageScore: number;
}
interface WalletRow { address: string; network_type: string; provider: string | null; last_seen: string; asset_count: string; total_balance_units: string; }
interface MintBurnRow { action: string; asset: string; amount: string; wallet_address: string; note: string | null; created_at: string; }
interface WalletDetail { wallet: any; balances: any[]; recentOrders: any[]; recentTrades: any[]; deposits: any[]; withdrawals: any[]; }

type View = "overview" | "wallets" | "detail";

export function AdminDbSync() {
  const qc = useQueryClient();
  const [view, setView]         = useState<View>("overview");
  const [search, setSearch]     = useState("");
  const [detailAddr, setDetailAddr] = useState("");
  const [syncMsg, setSyncMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: health, isFetching: healthFetching, refetch: refetchHealth } = useQuery<{
    summary: HealthSummary; walletsByNetwork: any[]; topBalanceWallets: WalletRow[]; recentMintBurn: MintBurnRow[];
  }>({
    queryKey: ["admin-db-health"],
    queryFn:  () => adminFetch(`${API}/api/admin/db-health`),
    staleTime: 30_000,
  });

  const { data: walletList, isFetching: walletListFetching, refetch: refetchWallets } = useQuery<{ wallets: WalletRow[]; total: number }>({
    queryKey: ["admin-ledger-wallets", search],
    queryFn:  () => adminFetch(`${API}/api/admin/ledger-wallets?limit=100&search=${encodeURIComponent(search)}`),
    staleTime: 30_000,
  });

  const { data: detail, isFetching: detailFetching } = useQuery<WalletDetail>({
    queryKey: ["admin-wallet-detail", detailAddr],
    queryFn:  () => adminFetch(`${API}/api/admin/wallet-detail/${encodeURIComponent(detailAddr)}`),
    enabled:  !!detailAddr && view === "detail",
  });

  // ── sync mutation ──────────────────────────────────────────────────────────
  const syncMut = useMutation({
    mutationFn: () => adminFetch(`${API}/api/admin/db-sync`, { method: "POST" }),
    onSuccess: (data: any) => {
      setSyncMsg({ ok: true, text: data.message });
      qc.invalidateQueries({ queryKey: ["admin-db-health"] });
      qc.invalidateQueries({ queryKey: ["admin-ledger-wallets"] });
    },
    onError: (e: any) => setSyncMsg({ ok: false, text: e.message ?? "Sync failed" }),
  });

  const s = health?.summary;
  const orphanTotal = (s?.orphanedBalanceWallets ?? 0) + (s?.orphanedOrderWallets ?? 0) + (s?.orphanedTradeWallets ?? 0);
  const score       = s?.coverageScore ?? 0;

  const scoreColor = score === 100 ? "text-green-400" : score >= 90 ? "text-yellow-400" : "text-red-400";
  const scoreBg    = score === 100 ? "bg-green-500/10 border-green-500/30" : score >= 90 ? "bg-yellow-500/10 border-yellow-500/30" : "bg-red-500/10 border-red-500/30";

  // ── stat card helper ───────────────────────────────────────────────────────
  const Stat = ({ icon: Icon, label, value, sub, color = "" }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) => (
    <div className="border border-border rounded-xl p-4 bg-card/30 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Database Sync</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            On-chain, exchange, and wallet coverage — all tables in one view
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { refetchHealth(); refetchWallets(); setSyncMsg(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
            <RefreshCw className={cn("w-3.5 h-3.5", healthFetching && "animate-spin")} /> Refresh
          </button>
          <button onClick={() => { setSyncMsg(null); syncMut.mutate(); }}
            disabled={syncMut.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
            {syncMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
            Sync Now
          </button>
        </div>
      </div>

      {/* Sync result */}
      {syncMsg && (
        <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl border text-sm",
          syncMsg.ok ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400")}>
          {syncMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {syncMsg.text}
          <button onClick={() => setSyncMsg(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Health score */}
      {s && (
        <div className={cn("flex items-center gap-4 px-5 py-4 rounded-2xl border", scoreBg)}>
          <div className="text-center">
            <div className={cn("text-4xl font-black tabular-nums", scoreColor)}>{score}%</div>
            <div className="text-xs text-muted-foreground mt-0.5">Coverage</div>
          </div>
          <div className="flex-1 space-y-1 text-sm">
            <div className={cn("font-semibold", scoreColor)}>
              {score === 100 ? "All wallets registered" : `${orphanTotal} wallet(s) not yet in registry`}
            </div>
            <div className="text-xs text-muted-foreground">
              {s.totalWallets} registered · {s.walletsWithBalances} with exchange balances ·{" "}
              {s.depositAddresses} deposit addresses · {s.verifiedDeposits} on-chain deposits confirmed
            </div>
          </div>
          {orphanTotal > 0 && (
            <button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-60 shrink-0">
              Fix Now
            </button>
          )}
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { id: "overview", label: "Overview",     icon: Activity },
          { id: "wallets",  label: "All Wallets",  icon: Users },
        ] as const).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setView(t.id)}
              className={cn("flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                view === t.id || (view === "detail" && t.id === "wallets")
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground")}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
        {view === "detail" && (
          <div className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 border-primary text-primary -mb-px">
            <Wallet className="w-3.5 h-3.5" /> {shortAddr(detailAddr)}
          </div>
        )}
      </div>

      {/* ── Overview ──────────────────────────────────────────────────────── */}
      {view === "overview" && (
        <div className="space-y-6">
          {/* Stat grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={Users}         label="Registered Wallets"    value={s?.totalWallets ?? "—"} />
            <Stat icon={Coins}         label="Exchange Balances"      value={s?.walletsWithBalances ?? "—"} sub="wallets with > 0 assets" />
            <Stat icon={TrendingUp}    label="Total Orders"          value={fmt(s?.totalOrders ?? 0, 0)} sub={`${fmt(s?.openOrders ?? 0, 0)} open`} />
            <Stat icon={Activity}      label="Trades Executed"        value={s?.totalTrades ?? "—"} />
            <Stat icon={ArrowDownToLine} label="On-Chain Deposits"    value={s?.verifiedDeposits ?? 0}
              color={s?.verifiedDeposits === 0 ? "text-yellow-400" : "text-green-400"}
              sub={`${s?.depositAddresses ?? 0} deposit addresses`} />
            <Stat icon={ArrowUpFromLine} label="Pending Withdrawals"  value={s?.pendingWithdrawals ?? 0}
              color={(s?.pendingWithdrawals ?? 0) > 0 ? "text-orange-400" : ""} />
            <Stat icon={Database}      label="Ledger Adjustments"     value={s?.mintBurnLogs ?? "—"} />
            <Stat icon={AlertTriangle} label="Unregistered Wallets"   value={orphanTotal}
              color={orphanTotal > 0 ? "text-red-400" : "text-green-400"}
              sub="from orders / balances / trades" />
          </div>

          {/* Networks breakdown */}
          {(health?.walletsByNetwork ?? []).length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b border-border text-sm font-semibold">Wallets by Network</div>
              {health!.walletsByNetwork.map((r: any) => (
                <div key={r.network_type} className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-border last:border-0">
                  <span className="font-medium capitalize">{r.network_type}</span>
                  <span className="tabular-nums font-bold">{r.cnt}</span>
                </div>
              ))}
            </div>
          )}

          {/* Top wallets by balance */}
          {(health?.topBalanceWallets ?? []).length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b border-border text-sm font-semibold flex items-center justify-between">
                Top Wallets by Exchange Balance
                <button onClick={() => setView("wallets")} className="text-xs text-primary hover:underline">View all</button>
              </div>
              <div className="divide-y divide-border">
                {health!.topBalanceWallets.slice(0, 10).map((w: WalletRow) => (
                  <div key={w.address}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => { setDetailAddr(w.address); setView("detail"); }}>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-muted-foreground truncate">{w.address}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {w.asset_count} assets · via {w.provider ?? w.network_type} · {new Date(w.last_seen).toLocaleDateString()}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent ledger adjustments */}
          {(health?.recentMintBurn ?? []).length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b border-border text-sm font-semibold">Recent Ledger Adjustments</div>
              <div className="divide-y divide-border">
                {health!.recentMintBurn.map((r: MintBurnRow, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                      r.action === "mint" ? "bg-green-500/10" : "bg-red-500/10")}>
                      {r.action === "mint"
                        ? <ArrowDownToLine className="w-3.5 h-3.5 text-green-400" />
                        : <ArrowUpFromLine className="w-3.5 h-3.5 text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">
                        {r.action === "mint" ? "Deposited" : "Withdrawn"}{" "}
                        <span className="text-primary">{parseFloat(r.amount).toLocaleString()} {r.asset}</span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate">{r.wallet_address}</div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">{new Date(r.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── All Wallets ────────────────────────────────────────────────────── */}
      {(view === "wallets" || view === "detail") && view !== "detail" && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Filter by wallet address…"
              className="w-full pl-9 pr-4 py-2.5 bg-muted/40 border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>

          <div className="border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-muted/30 border-b border-border text-sm font-semibold flex items-center justify-between">
              <span>Wallets ({walletList?.total ?? "…"})</span>
              {walletListFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {(walletList?.wallets ?? []).map(w => (
                <div key={w.address}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => { setDetailAddr(w.address); setView("detail"); }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs">{w.address}</span>
                      <CopyBtn text={w.address} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {w.asset_count} assets · {w.provider ?? w.network_type} · last seen {new Date(w.last_seen).toLocaleDateString()}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              ))}
              {(walletList?.wallets ?? []).length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">No wallets found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Wallet Detail ──────────────────────────────────────────────────── */}
      {view === "detail" && (
        <div className="space-y-5">
          {/* Nav back */}
          <button onClick={() => setView("wallets")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to wallets
          </button>

          {detailFetching ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : detail ? (
            <>
              {/* Wallet registration card */}
              <div className="border border-border rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  {detail.wallet ? "Registered in wallets table" : "NOT registered — orphaned"}
                </div>
                {detail.wallet && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {[
                      { label: "Address",      val: shortAddr(detail.wallet.address) },
                      { label: "Network",      val: detail.wallet.network_type },
                      { label: "Provider",     val: detail.wallet.provider ?? "—" },
                      { label: "First Seen",   val: new Date(detail.wallet.first_seen).toLocaleDateString() },
                    ].map(r => (
                      <div key={r.label} className="bg-muted/30 rounded-lg p-2.5">
                        <div className="text-muted-foreground">{r.label}</div>
                        <div className="font-semibold mt-0.5">{r.val}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Exchange balances */}
              <Section title="Exchange Balances" count={detail.balances.length}>
                {detail.balances.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-4 py-3">No exchange balances.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {detail.balances.map((b: any) => (
                      <div key={b.asset_symbol} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-semibold">{b.asset_symbol}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {parseFloat(b.available).toLocaleString(undefined, { maximumFractionDigits: 6 })} avail
                          {parseFloat(b.locked) > 0 && ` · ${parseFloat(b.locked).toLocaleString()} locked`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* On-chain deposits */}
              <Section title="On-Chain Deposits Verified" count={detail.deposits.length}>
                {detail.deposits.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-4 py-3">No on-chain deposits recorded.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {detail.deposits.map((d: any) => (
                      <div key={d.tx_hash} className="px-4 py-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{d.amount} {d.asset}</span>
                          <span className="text-muted-foreground">chain {d.chain_id}</span>
                          <span className="ml-auto text-muted-foreground">{new Date(d.verified_at).toLocaleString()}</span>
                        </div>
                        <div className="font-mono text-muted-foreground/60 truncate mt-0.5">{d.tx_hash}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Recent orders */}
              <Section title="Recent Orders" count={detail.recentOrders.length}>
                {detail.recentOrders.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-4 py-3">No orders.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {detail.recentOrders.map((o: any) => (
                      <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                          o.status === "open" ? "bg-blue-400" : o.status === "filled" ? "bg-green-400" : "bg-muted")} />
                        <span className="font-semibold">{o.symbol}</span>
                        <span className="capitalize">{o.side} {o.type}</span>
                        <span className="text-muted-foreground">{parseFloat(o.quantity).toLocaleString()} @ {o.price ? parseFloat(o.price).toLocaleString() : "market"}</span>
                        <span className={cn("ml-auto text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase",
                          o.status === "open" ? "bg-blue-500/15 text-blue-400" : o.status === "filled" ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground")}>
                          {o.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Withdrawals */}
              <Section title="Withdrawal History" count={detail.withdrawals.length}>
                {detail.withdrawals.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-4 py-3">No withdrawals.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {detail.withdrawals.map((w: any) => (
                      <div key={w.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                        <div>
                          <span className="font-semibold">{parseFloat(w.amount).toLocaleString()} {w.asset}</span>
                          <span className="text-muted-foreground ml-2">{w.network}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
                            w.status === "completed" ? "bg-green-500/15 text-green-400"
                            : w.status === "pending" ? "bg-yellow-500/15 text-yellow-400"
                            : "bg-muted text-muted-foreground")}>
                            {w.status}
                          </span>
                          <span className="text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-12">Wallet not found.</div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-muted/30 border-b border-border text-sm font-semibold flex items-center justify-between">
        {title}
        <span className="text-xs text-muted-foreground font-normal">{count} record{count !== 1 ? "s" : ""}</span>
      </div>
      {children}
    </div>
  );
}
