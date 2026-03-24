import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, TrendingUp, DollarSign, ArrowDownToLine, RefreshCw,
  CheckCircle, Clock, Copy, Check, AlertTriangle, Zap, BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BotProfitData = {
  cumulative: number;
  withdrawn: number;
  available: number;
  lastCycle: number;
  lastCycleAt: string | null;
  startTime: string | null;
  dailyRate: number;
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

function StatCard({
  icon: Icon, label, value, sub, color = "yellow",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: "yellow" | "green" | "blue" | "orange";
}) {
  const colors = {
    yellow: "text-yellow-400 bg-yellow-400/10",
    green:  "text-green-400 bg-green-400/10",
    blue:   "text-blue-400 bg-blue-400/10",
    orange: "text-orange-400 bg-orange-400/10",
  };
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("p-2 rounded-lg", colors[color])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="text-2xl font-bold text-white mb-0.5">{value}</div>
      <div className="text-xs text-white/50">{label}</div>
      {sub && <div className="text-xs text-white/30 mt-1">{sub}</div>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-1.5 text-white/40 hover:text-white/80 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function AdminBotProfit() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("BSV");
  const [error, setError] = useState("");
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
      setSuccess(`Withdrawal sent! TXID: ${j.txid}`);
      setAmount("");
      setAddress("");
      setError("");
      qc.invalidateQueries({ queryKey: ["admin-bot-profit"] });
    },
    onError: (e: Error) => {
      setError(e.message);
      setSuccess("");
    },
  });

  function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError("Enter a valid amount"); return; }
    if (!address.trim()) { setError("Destination address is required"); return; }
    withdrawMut.mutate({ amount: amt, address: address.trim(), network });
  }

  function setMax() {
    if (data) setAmount(data.available.toFixed(4));
  }

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const fmtSmall = (n: number) => n.toFixed(6);
  const elapsed = data?.startTime
    ? (() => {
        const ms = Date.now() - new Date(data.startTime).getTime();
        const h = Math.floor(ms / 3_600_000);
        const m = Math.floor((ms % 3_600_000) / 60_000);
        return `${h}h ${m}m`;
      })()
    : "—";

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
            Spread-capture earnings from the liquidity bot — refresh every 15 s
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

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 animate-pulse h-28" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp}       label="Total Earned"       value={`$${fmt(data.cumulative)}`}  sub={`Running ${elapsed}`}              color="green"  />
          <StatCard icon={DollarSign}       label="Available Balance"  value={`$${fmt(data.available)}`}   sub="Ready to withdraw"                  color="yellow" />
          <StatCard icon={BarChart2}        label="Est. Daily Rate"    value={`$${fmt(data.dailyRate)}`}   sub="Based on uptime"                   color="blue"   />
          <StatCard icon={Zap}             label="Last Cycle Profit"  value={`$${fmtSmall(data.lastCycle)}`} sub={data.lastCycleAt ? new Date(data.lastCycleAt).toLocaleTimeString() : "—"} color="orange" />
        </div>
      ) : null}

      {/* Withdraw panel + History side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Withdraw form */}
        <div className="lg:col-span-2 bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-yellow-400" />
            Withdraw Profits
          </h2>

          <form onSubmit={handleWithdraw} className="space-y-4">
            {/* Network */}
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

            {/* Destination */}
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

            {/* Amount */}
            <div>
              <label className="text-xs text-white/50 mb-1 flex items-center justify-between">
                <span>Amount (USD)</span>
                <button type="button" onClick={setMax} className="text-yellow-400 hover:text-yellow-300 text-xs">
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
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 text-green-400 text-xs bg-green-400/10 rounded-lg px-3 py-2 break-all">
                <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={withdrawMut.isPending}
              className="w-full py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {withdrawMut.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</>
              ) : (
                <><ArrowDownToLine className="w-4 h-4" /> Withdraw</>
              )}
            </button>
          </form>

          {/* Summary */}
          {data && (
            <div className="mt-4 pt-4 border-t border-white/10 space-y-2 text-xs">
              <div className="flex justify-between text-white/50">
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
              <p className="text-xs mt-1">Profits accumulate every 30 seconds</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-white/40 border-b border-white/10">
                    <th className="text-left pb-2 font-normal">Time</th>
                    <th className="text-right pb-2 font-normal">Amount</th>
                    <th className="text-left pb-2 font-normal pl-4">Network</th>
                    <th className="text-left pb-2 font-normal pl-4">Address / TXID</th>
                    <th className="text-left pb-2 font-normal pl-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.history.map((w) => (
                    <tr key={w.id} className="text-xs">
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
                          <CopyButton text={w.address} />
                        </div>
                        <div className="flex items-center text-white/30 truncate mt-0.5">
                          <span className="truncate">{w.txid.slice(0, 18)}…</span>
                          <CopyButton text={w.txid} />
                        </div>
                      </td>
                      <td className="py-2.5 pl-4">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
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

      {/* Info box */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-300/70">
        <strong className="text-blue-300">How bot profit works:</strong> The liquidity bot places bid/ask ladders
        on all {data ? `${(data.cumulative / (data.dailyRate || 1) * 2880).toFixed(0)}` : "368"} active markets every 30 seconds.
        Profit is earned by capturing the spread when user orders fill against bot orders (estimated at 1 basis point of total market volume per cycle).
        Withdraw to any supported network address at any time.
      </div>
    </div>
  );
}
