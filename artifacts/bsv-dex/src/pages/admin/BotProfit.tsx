import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, TrendingUp, DollarSign, ArrowDownToLine, RefreshCw,
  CheckCircle, Clock, Copy, Check, AlertTriangle, Zap,
  Flame, Droplets, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Source = {
  total: number;
  lastCycle: number;
  lastCycleAt: string | null;
  label: string;
  description: string;
};

type BotProfitData = {
  cumulative: number;
  withdrawn: number;
  available: number;
  dailyRate: number;
  startTime: string | null;
  sources: { spread: Source; funding: Source; liquidation: Source };
  history: Withdrawal[];
};

type Withdrawal = {
  id: string;
  amount: number;
  address: string;
  network: string;
  txid: string;
  status: "completed" | "pending";
  timestamp: string;
};

const NETWORKS = ["BSV", "ETH", "BNB", "Polygon", "Arbitrum", "Optimism", "Base", "Solana"];

/* ─── helpers ──────────────────────────────────────────────────────────── */
const fmt   = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fmtSm = (n: number) => n.toFixed(6);
const fmtPct = (part: number, total: number) =>
  total > 0 ? ((part / total) * 100).toFixed(1) : "0.0";

function elapsed(iso: string | null) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }}
      className="ml-1.5 text-white/40 hover:text-white/80 transition-colors"
    >
      {done ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ─── top stat card ────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color: "yellow" | "green" | "blue" | "orange";
}) {
  const cls = {
    yellow: "text-yellow-400 bg-yellow-400/10",
    green:  "text-green-400  bg-green-400/10",
    blue:   "text-blue-400   bg-blue-400/10",
    orange: "text-orange-400 bg-orange-400/10",
  }[color];
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
      <div className={cn("inline-flex p-2 rounded-lg mb-3", cls)}><Icon className="w-5 h-5" /></div>
      <div className="text-2xl font-bold text-white mb-0.5">{value}</div>
      <div className="text-xs text-white/50">{label}</div>
      {sub && <div className="text-xs text-white/30 mt-1">{sub}</div>}
    </div>
  );
}

/* ─── income source card ───────────────────────────────────────────────── */
function SourceCard({
  icon: Icon, color, source, total,
}: {
  icon: React.ElementType;
  color: "yellow" | "cyan" | "orange";
  source: Source;
  total: number;
}) {
  const pct = parseFloat(fmtPct(source.total, total));
  const bar = {
    yellow: "bg-yellow-400",
    cyan:   "bg-cyan-400",
    orange: "bg-orange-400",
  }[color];
  const text = {
    yellow: "text-yellow-400",
    cyan:   "text-cyan-400",
    orange: "text-orange-400",
  }[color];
  const iconBg = {
    yellow: "bg-yellow-400/10 text-yellow-400",
    cyan:   "bg-cyan-400/10   text-cyan-400",
    orange: "bg-orange-400/10 text-orange-400",
  }[color];

  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", iconBg)}><Icon className="w-4 h-4" /></div>
          <div>
            <div className="text-sm font-semibold text-white">{source.label}</div>
            <div className="text-xs text-white/40 mt-0.5 max-w-[220px]">{source.description}</div>
          </div>
        </div>
        <div className="text-right shrink-0 ml-2">
          <div className={cn("text-xl font-bold", text)}>${fmt(source.total)}</div>
          <div className="text-xs text-white/40">{pct}% of total</div>
        </div>
      </div>

      {/* progress bar */}
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>

      {/* last cycle */}
      <div className="flex items-center justify-between text-xs text-white/40">
        <span>Last cycle: <span className="text-white/60">{fmtSm(source.lastCycle)} USD</span></span>
        <span>{source.lastCycleAt ? new Date(source.lastCycleAt).toLocaleTimeString() : "pending…"}</span>
      </div>
    </div>
  );
}

/* ─── main component ───────────────────────────────────────────────────── */
export function AdminBotProfit() {
  const qc = useQueryClient();
  const [amount,  setAmount]  = useState("");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("BSV");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  const { data, isLoading, refetch } = useQuery<BotProfitData>({
    queryKey: ["admin-bot-profit"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/admin/bot-profit`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 15_000,
  });

  const withdrawMut = useMutation({
    mutationFn: async (body: { amount: number; address: string; network: string }) => {
      const r = await fetch(`${BASE}/api/admin/bot-profit/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Withdrawal failed");
      return j;
    },
    onSuccess: (j) => {
      setSuccess(`Sent! TXID: ${j.txid}`);
      setAmount(""); setAddress(""); setError("");
      qc.invalidateQueries({ queryKey: ["admin-bot-profit"] });
    },
    onError: (e: Error) => { setError(e.message); setSuccess(""); },
  });

  function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError("Enter a valid amount"); return; }
    if (!address.trim())        { setError("Destination address is required"); return; }
    withdrawMut.mutate({ amount: amt, address: address.trim(), network });
  }

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-yellow-400" />
            Bot Profit
          </h1>
          <p className="text-sm text-white/40 mt-1">
            All three income streams running live — refreshes every 15 s
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Top stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 animate-pulse h-28" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp}      color="green"  label="Total Earned"      value={`$${fmt(data.cumulative)}`} sub={`Running ${elapsed(data.startTime)}`} />
          <StatCard icon={DollarSign}      color="yellow" label="Available Balance" value={`$${fmt(data.available)}`}  sub="Ready to withdraw" />
          <StatCard icon={Activity}        color="blue"   label="Est. Daily Rate"   value={`$${fmt(data.dailyRate)}`}  sub="Based on uptime" />
          <StatCard icon={Zap}             color="orange" label="Total Withdrawn"   value={`$${fmt(data.withdrawn)}`}  sub={`${data.history.length} withdrawals`} />
        </div>
      ) : null}

      {/* Income source breakdown */}
      {data && (
        <div>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-3">
            Income Sources — Live
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SourceCard icon={Droplets} color="yellow" source={data.sources.spread}      total={data.cumulative} />
            <SourceCard icon={Activity} color="cyan"   source={data.sources.funding}     total={data.cumulative} />
            <SourceCard icon={Flame}    color="orange" source={data.sources.liquidation} total={data.cumulative} />
          </div>
        </div>
      )}

      {/* Withdraw + History */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Withdraw form */}
        <div className="lg:col-span-2 bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-yellow-400" />
            Withdraw Profits
          </h2>

          <form onSubmit={handleWithdraw} className="space-y-4">
            <div>
              <label className="text-xs text-white/50 mb-1 block">Network</label>
              <select
                value={network}
                onChange={e => setNetwork(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400/60"
              >
                {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-white/50 mb-1 block">Destination Address</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder={network === "BSV" ? "1BSV…" : "0x…"}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-yellow-400/60"
              />
            </div>

            <div>
              <label className="text-xs text-white/50 mb-1 flex items-center justify-between">
                <span>Amount (USD)</span>
                <button
                  type="button"
                  onClick={() => data && setAmount(data.available.toFixed(4))}
                  className="text-yellow-400 hover:text-yellow-300 text-xs"
                >
                  Max ${data ? fmt(data.available) : "—"}
                </button>
              </label>
              <input
                type="number"
                step="0.0001"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-yellow-400/60"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 text-green-400 text-xs bg-green-400/10 rounded-lg px-3 py-2 break-all">
                <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{success}
              </div>
            )}

            <button
              type="submit"
              disabled={withdrawMut.isPending}
              className="w-full py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {withdrawMut.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</>
                : <><ArrowDownToLine className="w-4 h-4" /> Withdraw</>}
            </button>
          </form>

          {data && (
            <div className="mt-4 pt-4 border-t border-white/10 space-y-2 text-xs">
              <div className="flex justify-between text-white/50">
                <span>Spread Capture</span>
                <span className="text-yellow-400">${fmt(data.sources.spread.total)}</span>
              </div>
              <div className="flex justify-between text-white/50">
                <span>Funding Rate Fees</span>
                <span className="text-cyan-400">${fmt(data.sources.funding.total)}</span>
              </div>
              <div className="flex justify-between text-white/50">
                <span>Liquidation Income</span>
                <span className="text-orange-400">${fmt(data.sources.liquidation.total)}</span>
              </div>
              <div className="flex justify-between text-white/50 pt-1 border-t border-white/10">
                <span>Total Earned</span>
                <span className="text-white/80">${fmt(data.cumulative)}</span>
              </div>
              <div className="flex justify-between text-white/50">
                <span>Total Withdrawn</span>
                <span className="text-white/80">${fmt(data.withdrawn)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-white/70">Available</span>
                <span className="text-yellow-400">${fmt(data.available)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Withdrawal history */}
        <div className="lg:col-span-3 bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            Withdrawal History
          </h2>

          {!data || data.history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-white/30">
              <ArrowDownToLine className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No withdrawals yet</p>
              <p className="text-xs mt-1">All three income streams are running — profits build up every cycle</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/40 border-b border-white/10">
                    <th className="text-left pb-2 font-normal">Time</th>
                    <th className="text-right pb-2 font-normal">Amount</th>
                    <th className="text-left pb-2 font-normal pl-4">Network</th>
                    <th className="text-left pb-2 font-normal pl-4">Address / TXID</th>
                    <th className="text-left pb-2 font-normal pl-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.history.map((w) => (
                    <tr key={w.id}>
                      <td className="py-2.5 text-white/50 whitespace-nowrap pr-3">
                        {new Date(w.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-semibold text-yellow-400 whitespace-nowrap">
                        ${w.amount.toFixed(4)}
                      </td>
                      <td className="py-2.5 pl-4 text-white/60 whitespace-nowrap">{w.network}</td>
                      <td className="py-2.5 pl-4 max-w-[180px]">
                        <div className="flex items-center text-white/50 truncate">
                          <span className="truncate">{w.address.slice(0, 12)}…</span>
                          <CopyBtn text={w.address} />
                        </div>
                        <div className="flex items-center text-white/30 truncate mt-0.5">
                          <span className="truncate">{w.txid.slice(0, 18)}…</span>
                          <CopyBtn text={w.txid} />
                        </div>
                      </td>
                      <td className="py-2.5 pl-4">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium",
                          w.status === "completed"
                            ? "bg-green-400/10 text-green-400"
                            : "bg-yellow-400/10 text-yellow-400",
                        )}>
                          {w.status === "completed"
                            ? <><CheckCircle className="w-3 h-3" /> Completed</>
                            : <><Clock className="w-3 h-3" /> Pending</>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* How it works legend */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-4 text-xs text-yellow-300/70">
            <strong className="text-yellow-300 flex items-center gap-1.5 mb-1">
              <Droplets className="w-3.5 h-3.5" /> Spread Capture
            </strong>
            Bot places 12 bid/ask levels on all {data.sources.spread.lastCycleAt ? "368" : "—"} active markets every 30 s.
            Profit = 1 bp of total market volume captured per cycle.
            Updates every 30 seconds automatically.
          </div>
          <div className="bg-cyan-400/5 border border-cyan-400/20 rounded-xl p-4 text-xs text-cyan-300/70">
            <strong className="text-cyan-300 flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5" /> Funding Rate Fees
            </strong>
            Every 8 hours, longs pay shorts (or vice versa) at 0.01%–0.015% per period.
            OrahDEX retains 10% of all funding payments as platform income.
            Synthetic baseline from estimated market open-interest is added.
          </div>
          <div className="bg-orange-400/5 border border-orange-400/20 rounded-xl p-4 text-xs text-orange-300/70">
            <strong className="text-orange-300 flex items-center gap-1.5 mb-1">
              <Flame className="w-3.5 h-3.5" /> Liquidation Income
            </strong>
            Leveraged positions are checked every 60 s against live prices.
            Liquidated positions pay a 0.5% fee on margin to the platform.
            Synthetic baseline from estimated market-wide liquidation activity included.
          </div>
        </div>
      )}
    </div>
  );
}
