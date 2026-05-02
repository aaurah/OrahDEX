import { adminFetch } from "@/lib/adminFetch";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Filter, RefreshCw, Search, TrendingUp, Waves, ShieldCheck, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function Stat({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", color)}><Icon className="w-4 h-4" /></div>
      </div>
      <div className="text-2xl font-bold font-mono">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function AdminTradeAnalytics() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [side, setSide] = useState("all");
  const [type, setType] = useState("all");
  const [symbol, setSymbol] = useState("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-trade-analytics"],
    queryFn: async () => {
      const r = await adminFetch(`/api/admin/trade-analytics`);
      return r.ok ? r.json() : null;
    },
    refetchInterval: 15_000,
  });

  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const trades = Array.isArray(data?.trades) ? data.trades : [];
  const pairStats = Array.isArray(data?.pairStats) ? data.pairStats : [];
  const limitBreakdown = Array.isArray(data?.limitBreakdown) ? data.limitBreakdown : [];
  const liquidityDepth = Array.isArray(data?.liquidityDepth) ? data.liquidityDepth : [];

  const symbols = useMemo(() => ["all", ...new Set(orders.map((o: any) => o.symbol).filter(Boolean))], [orders]);

  const filteredOrders = orders.filter((o: any) => {
    const matchesSearch = !search || `${o.id} ${o.walletAddress} ${o.symbol}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = status === "all" || o.status === status;
    const matchesSide = side === "all" || o.side === side;
    const matchesType = type === "all" || o.type === type;
    const matchesSymbol = symbol === "all" || o.symbol === symbol;
    return matchesSearch && matchesStatus && matchesSide && matchesType && matchesSymbol;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Trade Analytics</h2>
          <p className="text-muted-foreground text-sm">Detailed placed orders, liquidity, limits, fills, and market depth</p>
        </div>
        <button onClick={() => refetch()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Stat label="Placed Orders" value={isLoading ? "…" : String(data?.summary?.totalOrders ?? 0)} sub="all user orders" icon={ArrowRightLeft} color="text-primary bg-primary/10" />
        <Stat label="Open Orders" value={isLoading ? "…" : String(data?.summary?.openOrders ?? 0)} sub="currently resting" icon={Filter} color="text-orange-400 bg-orange-400/10" />
        <Stat label="Filled Orders" value={isLoading ? "…" : String(data?.summary?.filledOrders ?? 0)} sub="completed trades" icon={ShieldCheck} color="text-green-400 bg-green-400/10" />
        <Stat label="Filled Volume" value={isLoading ? "…" : `$${Number(data?.summary?.filledVolume ?? 0).toLocaleString()}`} sub="matched volume" icon={TrendingUp} color="text-blue-400 bg-blue-400/10" />
        <Stat label="Liquidity Orders" value={String(liquidityDepth.reduce((s: number, m: any) => s + (m.liquidityOrders ?? 0), 0))} sub="bot depth count" icon={Waves} color="text-violet-400 bg-violet-400/10" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Placed Orders</h3>
            <span className="text-xs text-muted-foreground">{filteredOrders.length} shown</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order / wallet / symbol" className="px-3 py-2 rounded-xl bg-secondary/40 border border-border text-sm md:col-span-2" />
            <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-xl bg-secondary/40 border border-border text-sm"><option value="all">All Status</option><option value="open">Open</option><option value="filled">Filled</option><option value="cancelled">Cancelled</option></select>
            <select value={side} onChange={e => setSide(e.target.value)} className="px-3 py-2 rounded-xl bg-secondary/40 border border-border text-sm"><option value="all">All Sides</option><option value="buy">Buy</option><option value="sell">Sell</option></select>
            <select value={type} onChange={e => setType(e.target.value)} className="px-3 py-2 rounded-xl bg-secondary/40 border border-border text-sm"><option value="all">All Types</option><option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option></select>
            <select value={symbol} onChange={e => setSymbol(e.target.value)} className="px-3 py-2 rounded-xl bg-secondary/40 border border-border text-sm md:col-span-5"><option value="all">All Symbols</option>{symbols.slice(1).map((s: string) => <option key={s} value={s}>{s}</option>)}</select>
          </div>
          <div className="overflow-auto max-h-[640px]">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground sticky top-0 bg-card">
                <tr className="text-left border-b border-border">
                  <th className="py-3 pr-4">ID</th><th className="py-3 pr-4">Wallet</th><th className="py-3 pr-4">Symbol</th><th className="py-3 pr-4">Side</th><th className="py-3 pr-4">Type</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Price</th><th className="py-3 pr-4">Qty</th><th className="py-3 pr-4">Total</th><th className="py-3 pr-4">Tx</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o: any) => (
                  <tr key={o.id} className="border-b border-border/60 hover:bg-white/5">
                    <td className="py-3 pr-4 font-mono text-xs">{String(o.id).slice(0, 10)}…</td>
                    <td className="py-3 pr-4 font-mono text-xs">{String(o.walletAddress).slice(0, 10)}…</td>
                    <td className="py-3 pr-4">{o.symbol ?? "—"}</td>
                    <td className={cn("py-3 pr-4 font-semibold", o.side === "buy" ? "text-green-400" : "text-red-400")}>{o.side ?? "—"}</td>
                    <td className="py-3 pr-4">{o.type ?? "—"}</td>
                    <td className="py-3 pr-4">{o.status ?? "—"}</td>
                    <td className="py-3 pr-4 font-mono">{o.price ?? "—"}</td>
                    <td className="py-3 pr-4 font-mono">{o.quantity ?? "—"}</td>
                    <td className="py-3 pr-4 font-mono">{o.total ?? "—"}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{o.txid ? String(o.txid).slice(0, 10) + "…" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold mb-4">Limit / Market Breakdown</h3>
            <div className="space-y-3">
              {limitBreakdown.map((x: any) => (
                <div key={x.type} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{x.type}</span>
                  <span className="font-mono">{x.count} · ${Number(x.volume ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold mb-4">Liquidity Depth</h3>
            <div className="space-y-3 max-h-[260px] overflow-auto">
              {liquidityDepth.map((m: any) => (
                <div key={m.symbol} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{m.symbol}</div>
                    <div className="text-xs text-muted-foreground">{m.status ?? "—"} · last {m.lastPrice ?? "—"}</div>
                  </div>
                  <div className="font-mono">{m.liquidityOrders ?? 0}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold mb-4">Top Trading Pairs</h3>
            <div className="space-y-3 max-h-[260px] overflow-auto">
              {pairStats.map((p: any) => (
                <div key={p.symbol} className="border border-border/60 rounded-xl p-3 text-sm">
                  <div className="flex items-center justify-between mb-1"><span className="font-medium">{p.symbol}</span><span className="font-mono">${Number(p.volume ?? 0).toLocaleString()}</span></div>
                  <div className="text-xs text-muted-foreground">{p.total} orders · {p.filled} filled · {p.open} open · {p.buy} buy / {p.sell} sell</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-semibold mb-4">Recent Fills</h3>
            <div className="space-y-3 max-h-[260px] overflow-auto">
              {trades.map((t: any) => (
                <div key={t.id} className="border border-border/60 rounded-xl p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t.symbol}</span>
                    <span className={cn("font-semibold", t.side === "buy" ? "text-green-400" : "text-red-400")}>{t.side}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{t.quantity} @ {t.price} · fee {t.fee}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
