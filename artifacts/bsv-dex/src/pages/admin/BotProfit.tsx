import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, TrendingUp, DollarSign, ArrowDownToLine, RefreshCw,
  CheckCircle, Clock, Copy, Check, AlertTriangle, Zap,
  Flame, Droplets, Activity, Wallet, ExternalLink, Info,
  Radio, ShieldCheck, Pencil, X, Save, RotateCcw,
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

/* Compact: $8.06B / $1.23M / $456.78 */
function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

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
    yellow: "text-green-400 bg-green-400/10",
    green:  "text-green-400  bg-green-400/10",
    blue:   "text-blue-400   bg-blue-400/10",
    orange: "text-orange-400 bg-orange-400/10",
  }[color];
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4 flex flex-col gap-2.5">
      <div className={cn("inline-flex p-2 rounded-lg w-fit", cls)}><Icon className="w-4 h-4" /></div>
      <div>
        <div className="text-xl font-bold text-white leading-tight tracking-tight">{value}</div>
        <div className="text-xs text-white/50 mt-1">{label}</div>
        {sub && <div className="text-[10px] text-white/30 mt-0.5">{sub}</div>}
      </div>
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
    yellow: "bg-green-400",
    cyan:   "bg-cyan-400",
    orange: "bg-orange-400",
  }[color];
  const text = {
    yellow: "text-green-400",
    cyan:   "text-cyan-400",
    orange: "text-orange-400",
  }[color];
  const iconBg = {
    yellow: "bg-green-400/10 text-green-400",
    cyan:   "bg-cyan-400/10   text-cyan-400",
    orange: "bg-orange-400/10 text-orange-400",
  }[color];

  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 flex flex-col gap-3">
      {/* Header row: icon + label + percentage badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("p-2 rounded-lg shrink-0", iconBg)}><Icon className="w-4 h-4" /></div>
          <span className="text-sm font-semibold text-white truncate">{source.label}</span>
        </div>
        <span className="text-[10px] font-bold text-white/40 shrink-0 tabular-nums">{pct}% of total</span>
      </div>

      {/* Big amount — full width, never clipped */}
      <div className={cn("text-2xl font-bold tracking-tight leading-none", text)}>
        {fmtCompact(source.total)}
      </div>

      {/* Description */}
      <div className="text-xs text-white/40 leading-relaxed -mt-1">
        {source.description}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", bar)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>

      {/* Last cycle */}
      <div className="flex items-center justify-between text-[11px] text-white/40 pt-0.5">
        <span>Last cycle: <span className="text-white/60 font-mono">{fmtSm(source.lastCycle)} USD</span></span>
        <span className="tabular-nums">{source.lastCycleAt ? new Date(source.lastCycleAt).toLocaleTimeString() : "pending…"}</span>
      </div>
    </div>
  );
}

type BsvWallet = {
  address: string;
  systemAddress: string;
  customAddress: string | null;
  pubKeyHex: string;
  confirmedSatoshis: number;
  unconfirmedSatoshis: number;
  totalSatoshis: number;
  bsv: number;
  utxos: Array<{ txid: string; vout: number; satoshis: number; height: number }>;
  funded: boolean;
  explorerUrl: string;
  broadcastReady: boolean;
  notice: string;
};

/* ─── main component ───────────────────────────────────────────────────── */
export function AdminBotProfit() {
  const qc = useQueryClient();
  const [amount,  setAmount]  = useState("");
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("BSV");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  // Settlement address editor state
  const [editingAddr, setEditingAddr] = useState(false);
  const [newAddr,     setNewAddr]     = useState("");
  const [addrSaved,   setAddrSaved]   = useState(false);

  // Direct BSV send state
  const [sendAddr,    setSendAddr]    = useState("");
  const [sendBsvAmt,  setSendBsvAmt]  = useState("");
  const [sendErr,     setSendErr]     = useState("");
  const [sendOk,      setSendOk]      = useState("");

  const { data, isLoading, refetch } = useQuery<BotProfitData>({
    queryKey: ["admin-bot-profit"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/admin/bot-profit`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 15_000,
  });

  const { data: wallet, refetch: refetchWallet } = useQuery<BsvWallet>({
    queryKey: ["admin-bsv-wallet"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/admin/bsv-wallet`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 60_000,
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
      const detail = j.satoshis
        ? ` (${j.satoshis.toLocaleString()} sat @ $${j.bsvPriceUsd?.toFixed(2)}/BSV)`
        : "";
      setSuccess(`Sent! TXID: ${j.txid}${detail}`);
      setAmount(""); setAddress(""); setError("");
      qc.invalidateQueries({ queryKey: ["admin-bot-profit"] });
      qc.invalidateQueries({ queryKey: ["admin-bsv-wallet"] });
    },
    onError: (e: Error) => { setError(e.message); setSuccess(""); },
  });

  const addrMut = useMutation({
    mutationFn: async (customAddress: string) => {
      const r = await fetch(`${BASE}/api/admin/bsv-wallet`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customAddress }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed to update address");
      return j;
    },
    onSuccess: () => {
      setEditingAddr(false);
      setNewAddr("");
      setAddrSaved(true);
      setTimeout(() => setAddrSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ["admin-bsv-wallet"] });
    },
    onError: (e: Error) => { setError(e.message); },
  });

  const sendMut = useMutation({
    mutationFn: async (body: { toAddress: string; bsv: number }) => {
      const r = await fetch(`${BASE}/api/admin/bsv-wallet/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Send failed");
      return j;
    },
    onSuccess: (j) => {
      setSendOk(`Sent! TXID: ${j.txid}`);
      setSendAddr(""); setSendBsvAmt(""); setSendErr("");
      qc.invalidateQueries({ queryKey: ["admin-bsv-wallet"] });
    },
    onError: (e: Error) => { setSendErr(e.message); setSendOk(""); },
  });

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSendErr(""); setSendOk("");
    const bsv = parseFloat(sendBsvAmt);
    if (isNaN(bsv) || bsv <= 0) { setSendErr("Enter a valid BSV amount"); return; }
    if (!sendAddr.trim())        { setSendErr("Destination address is required"); return; }
    sendMut.mutate({ toAddress: sendAddr.trim(), bsv });
  }

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
            <Bot className="w-6 h-6 text-green-400" />
            Bot Profit
          </h1>
          <p className="text-sm text-white/40 mt-1">
            All three income streams running live — refreshes every 15 s
          </p>
        </div>
        <button
          onClick={() => { refetch(); refetchWallet(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Methodology notice */}
      <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-200/70 leading-relaxed">
          <span className="font-semibold text-blue-300">Projected revenue model</span> — figures are calculated from
          real market volumes and live prices using platform fee rates (0.01 % spread capture per 30 s cycle,
          10 % of funding flows every 8 h, 0.5 % on liquidations). These represent estimated platform earnings
          once the market is live with real user volume. No real funds have moved.
        </div>
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
          <StatCard icon={TrendingUp} color="green"  label="Projected Total"     value={fmtCompact(data.cumulative)} sub={`Running ${elapsed(data.startTime)}`} />
          <StatCard icon={DollarSign} color="yellow" label="Projected Available"  value={fmtCompact(data.available)}  sub="Model estimate" />
          <StatCard icon={Activity}   color="blue"   label="Projected Daily Rate" value={fmtCompact(data.dailyRate)}  sub="Based on seeded volume" />
          <StatCard icon={Zap}        color="orange" label="Total Withdrawn"      value={fmtCompact(data.withdrawn)}  sub={`${data.history.length} withdrawals`} />
        </div>
      ) : null}

      {/* Income source breakdown */}
      {data && (
        <div>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-3">
            Income Sources — Projected
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SourceCard icon={Droplets} color="yellow" source={data.sources.spread}      total={data.cumulative} />
            <SourceCard icon={Activity} color="cyan"   source={data.sources.funding}     total={data.cumulative} />
            <SourceCard icon={Flame}    color="orange" source={data.sources.liquidation} total={data.cumulative} />
          </div>
        </div>
      )}

      {/* BSV Settlement Wallet */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 text-green-400" />
            BSV Settlement Wallet
          </h2>
          <div className="flex items-center gap-2">
            {wallet?.customAddress && (
              <span className="text-[10px] font-bold px-2 py-1 rounded border bg-violet-500/10 border-violet-500/20 text-violet-400 uppercase tracking-wider">
                Custom Address
              </span>
            )}
            <div className={cn(
              "flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded border uppercase tracking-wider",
              "bg-green-500/10 border-green-500/20 text-green-400",
            )}>
              <Radio className="w-3 h-3" />
              {wallet?.broadcastReady ? "BROADCAST READY" : "AWAITING FUNDS"}
            </div>
          </div>
        </div>

        {wallet ? (
          <div className="space-y-4">
            {/* Address */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-white/40">Deposit Address (P2PKH Mainnet)</p>
                <div className="flex items-center gap-1">
                  {wallet.customAddress && (
                    <button
                      onClick={() => addrMut.mutate("")}
                      disabled={addrMut.isPending}
                      className="flex items-center gap-1 text-[10px] text-white/40 hover:text-orange-400 transition-colors px-2 py-0.5 rounded border border-white/10 hover:border-orange-500/30"
                      title="Revert to system wallet"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      Revert
                    </button>
                  )}
                  <button
                    onClick={() => { setEditingAddr(v => !v); setNewAddr(wallet.address); setError(""); }}
                    className={cn(
                      "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors",
                      editingAddr
                        ? "bg-white/5 border-white/20 text-white/60"
                        : "border-white/10 text-white/40 hover:text-green-400 hover:border-green-500/30"
                    )}
                  >
                    {editingAddr ? <><X className="w-2.5 h-2.5" /> Cancel</> : <><Pencil className="w-2.5 h-2.5" /> Change Address</>}
                  </button>
                </div>
              </div>

              {/* Address display */}
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2.5">
                <code className="flex-1 font-mono text-sm text-green-300 break-all">{wallet.address}</code>
                <CopyBtn text={wallet.address} />
                <a href={wallet.explorerUrl} target="_blank" rel="noreferrer"
                  className="text-white/30 hover:text-white/70 transition-colors ml-1">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Inline editor */}
              {editingAddr && (
                <div className="mt-3 p-4 rounded-xl border border-green-500/20 bg-green-500/5 space-y-3">
                  <p className="text-xs text-white/50 leading-relaxed">
                    Enter a custom BSV deposit address. This overrides the system-generated wallet for display and balance tracking. Your private keys stay on the server.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAddr}
                      onChange={e => setNewAddr(e.target.value)}
                      placeholder="1... (BSV P2PKH address)"
                      className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-green-500/40 transition-colors"
                    />
                    <button
                      onClick={() => addrMut.mutate(newAddr.trim())}
                      disabled={!newAddr.trim() || addrMut.isPending}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-green-500 hover:bg-green-400 text-black font-bold text-xs transition-all disabled:opacity-50 shrink-0"
                    >
                      {addrMut.isPending
                        ? <div className="w-3.5 h-3.5 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                        : addrSaved
                          ? <><Check className="w-3.5 h-3.5" /> Saved</>
                          : <><Save className="w-3.5 h-3.5" /> Save</>}
                    </button>
                  </div>
                  {wallet.systemAddress && (
                    <p className="text-[11px] text-white/30">
                      System wallet: <code className="text-white/50 font-mono">{wallet.systemAddress}</code>
                    </p>
                  )}
                  {error && <p className="text-xs text-red-400">{error}</p>}
                </div>
              )}

              {addrSaved && !editingAddr && (
                <p className="text-xs text-green-400 mt-1.5 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Address updated successfully
                </p>
              )}
            </div>

            {/* Balance row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-white/40 mb-1">Confirmed</p>
                <p className="font-mono text-sm font-bold text-white">{wallet.confirmedSatoshis.toLocaleString()}</p>
                <p className="text-[10px] text-white/30">satoshis</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-white/40 mb-1">BSV Balance</p>
                <p className="font-mono text-sm font-bold text-green-400">{wallet.bsv.toFixed(8)}</p>
                <p className="text-[10px] text-white/30">BSV</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-xs text-white/40 mb-1">UTXOs</p>
                <p className="font-mono text-sm font-bold text-white">{wallet.utxos.length}</p>
                <p className="text-[10px] text-white/30">spendable</p>
              </div>
            </div>

            {/* Notice */}
            <div className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs",
              wallet.broadcastReady
                ? "bg-green-500/10 text-green-300"
                : "bg-green-500/10 text-green-300",
            )}>
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{wallet.notice}</span>
            </div>

            {/* How it works */}
            {!wallet.broadcastReady && (
              <div className="text-xs text-white/30 leading-relaxed border-t border-white/5 pt-3">
                Once funded, every matched trade will automatically build a real BSV OP_RETURN transaction
                signed by this wallet's private key and broadcast to the BSV mainnet via WhatsOnChain.
                The txid will be verifiable at <span className="text-green-400">whatsonchain.com</span>.
                Minimum recommended deposit: <span className="text-white/60">0.001 BSV</span> (~{(0.001 * 14.20).toFixed(3)} USD).
              </div>
            )}

            {/* UTXOs table if funded */}
            {wallet.utxos.length > 0 && (
              <div>
                <p className="text-xs text-white/40 mb-2">Available UTXOs</p>
                <div className="space-y-1.5">
                  {wallet.utxos.slice(0, 5).map(u => (
                    <div key={`${u.txid}:${u.vout}`} className="flex items-center justify-between bg-white/5 rounded px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-white/50">{u.txid.slice(0, 12)}…:{u.vout}</code>
                        <CopyBtn text={u.txid} />
                      </div>
                      <span className="font-mono text-green-400">{u.satoshis.toLocaleString()} sat</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* ── Send BSV ── */}
            <div className="border-t border-white/10 pt-4">
              <p className="text-xs text-white/50 uppercase tracking-wider mb-3 font-semibold flex items-center gap-1.5">
                <ArrowDownToLine className="w-3.5 h-3.5 text-green-400" />
                Send BSV from Wallet
              </p>
              <form onSubmit={handleSend} className="space-y-3">
                <input
                  type="text"
                  value={sendAddr}
                  onChange={e => setSendAddr(e.target.value)}
                  placeholder="Destination BSV address (1…)"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-green-400/50 transition-colors"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.00000001"
                    min="0.00000546"
                    value={sendBsvAmt}
                    onChange={e => setSendBsvAmt(e.target.value)}
                    placeholder="Amount (BSV)"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-green-400/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => wallet && setSendBsvAmt(Math.max(0, wallet.bsv - 0.000005).toFixed(8))}
                    className="px-3 py-2 text-xs font-semibold text-green-400 bg-green-400/10 rounded-lg border border-green-400/20 hover:bg-green-400/20 transition-colors shrink-0"
                  >
                    MAX
                  </button>
                </div>
                {sendErr && (
                  <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{sendErr}
                  </div>
                )}
                {sendOk && (
                  <div className="flex items-start gap-2 text-green-400 text-xs bg-green-400/10 rounded-lg px-3 py-2 break-all">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{sendOk}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={sendMut.isPending || !wallet?.funded}
                  className="w-full py-2.5 rounded-lg bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {sendMut.isPending
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Broadcasting…</>
                    : <><ArrowDownToLine className="w-4 h-4" /> Send BSV</>}
                </button>
                {wallet && !wallet.funded && (
                  <p className="text-xs text-white/30 text-center">Fund the wallet above to enable sending</p>
                )}
              </form>
            </div>

          </div>
        ) : (
          <div className="animate-pulse space-y-3">
            <div className="h-10 bg-white/5 rounded-lg" />
            <div className="grid grid-cols-3 gap-3">
              {[0,1,2].map(i => <div key={i} className="h-16 bg-white/5 rounded-lg" />)}
            </div>
          </div>
        )}
      </div>

      {/* Withdraw + History */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Withdraw form */}
        <div className="lg:col-span-2 bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <ArrowDownToLine className="w-4 h-4 text-green-400" />
            Withdraw Profits
          </h2>

          <form onSubmit={handleWithdraw} className="space-y-4">
            <div>
              <label className="text-xs text-white/50 mb-1 block">Network</label>
              <select
                value={network}
                onChange={e => setNetwork(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-400/60"
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
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-400/60"
              />
            </div>

            <div>
              <label className="text-xs text-white/50 mb-1 flex items-center justify-between">
                <span>Amount (USD)</span>
                <button
                  type="button"
                  onClick={() => data && setAmount(data.available.toFixed(4))}
                  className="text-green-400 hover:text-green-300 text-xs"
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
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-green-400/60"
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
              className="w-full py-2.5 rounded-lg bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors flex items-center justify-center gap-2"
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
                <span className="text-green-400">${fmt(data.sources.spread.total)}</span>
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
                <span className="text-green-400">${fmt(data.available)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Withdrawal history */}
        <div className="lg:col-span-3 bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-green-400" />
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
                      <td className="py-2.5 text-right font-semibold text-green-400 whitespace-nowrap">
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
                            : "bg-green-400/10 text-green-400",
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
          <div className="bg-green-400/5 border border-green-400/20 rounded-xl p-4 text-xs text-green-300/70">
            <strong className="text-green-300 flex items-center gap-1.5 mb-1">
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
