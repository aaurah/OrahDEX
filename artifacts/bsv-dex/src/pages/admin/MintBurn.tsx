import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { Printer, Flame, Search, RefreshCw, CheckCircle2, XCircle, Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const SUPPORTED = ["USDT", "USDC", "BUSD", "DAI", "oUSD"];

interface LogEntry {
  id: number;
  action: "mint" | "burn";
  asset: string;
  amount: string;
  wallet_address: string;
  note: string | null;
  created_at: string;
}

interface Balance {
  asset: string;
  available: string;
  locked: string;
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function shortAddr(a: string) {
  return a?.length > 12 ? `${a.slice(0, 8)}…${a.slice(-6)}` : (a ?? "—");
}

export function AdminMintBurn() {
  const { token } = useAdminAuthStore();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [action, setAction] = useState<"mint" | "burn">("mint");
  const [asset, setAsset] = useState("USDT");
  const [amount, setAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [log, setLog] = useState<LogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(true);

  const [previewBalances, setPreviewBalances] = useState<Balance[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchLog = async () => {
    setLogLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/mint-burn-log`, { headers });
      if (r.ok) setLog(await r.json());
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => { fetchLog(); }, []);

  const lookupBalances = async () => {
    if (!walletAddress.trim()) return;
    setPreviewLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/user-exchange-balance/${encodeURIComponent(walletAddress.trim())}`, { headers });
      if (r.ok) setPreviewBalances(await r.json());
      else setPreviewBalances([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/mint-burn`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action, asset, amount, walletAddress: walletAddress.trim(), note: note.trim() || undefined }),
      });
      const data = await r.json();
      if (r.ok) {
        setResult({ ok: true, msg: data.message });
        setAmount("");
        setNote("");
        fetchLog();
        lookupBalances();
      } else {
        setResult({ ok: false, msg: data.error ?? "Operation failed" });
      }
    } catch {
      setResult({ ok: false, msg: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-5xl">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Printer size={22} className="text-green-400" />
            Stablecoin Mint & Burn
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Credit (mint) or debit (burn) stablecoin balances from a user's Orah Exchange account.
            Every operation is logged permanently.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Operation Form ── */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
            <h2 className="text-sm font-semibold text-foreground">New Operation</h2>

            {/* Mint / Burn toggle */}
            <div className="flex rounded-xl overflow-hidden border border-border">
              {(["mint", "burn"] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => { setAction(a); setResult(null); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors",
                    action === a
                      ? a === "mint"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {a === "mint" ? <Printer size={15} /> : <Flame size={15} />}
                  {a === "mint" ? "Print (Mint)" : "Burn"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Wallet address */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Wallet Address</label>
                <div className="flex gap-2">
                  <input
                    value={walletAddress}
                    onChange={e => { setWalletAddress(e.target.value); setPreviewBalances([]); }}
                    placeholder="0x... or BSV address"
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-green-500/50"
                  />
                  <button
                    type="button"
                    onClick={lookupBalances}
                    disabled={!walletAddress.trim() || previewLoading}
                    className="px-3 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40"
                  >
                    {previewLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                  </button>
                </div>
              </div>

              {/* Current balances preview */}
              {previewBalances.length > 0 && (
                <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">Current Exchange Balances</p>
                  {previewBalances
                    .filter(b => SUPPORTED.includes(b.asset))
                    .map(b => (
                      <div key={b.asset} className="flex justify-between text-xs">
                        <span className="text-muted-foreground font-mono">{b.asset}</span>
                        <span className="text-foreground font-bold">{parseFloat(b.available).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                      </div>
                    ))}
                  {previewBalances.filter(b => SUPPORTED.includes(b.asset)).length === 0 && (
                    <p className="text-xs text-muted-foreground">No stablecoin balances found for this wallet.</p>
                  )}
                </div>
              )}

              {/* Asset selector */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Asset</label>
                <div className="relative">
                  <select
                    value={asset}
                    onChange={e => setAsset(e.target.value)}
                    className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-green-500/50 pr-8"
                  >
                    {SUPPORTED.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 1000.00"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-green-500/50"
                />
              </div>

              {/* Note */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Note (optional)</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Bank transfer received ref #12345"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-green-500/50"
                />
              </div>

              {/* Result */}
              {result && (
                <div className={cn(
                  "flex items-start gap-2 rounded-xl p-3 text-sm",
                  result.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                )}>
                  {result.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <XCircle size={15} className="mt-0.5 shrink-0" />}
                  {result.msg}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !walletAddress.trim() || !amount || Number(amount) <= 0}
                className={cn(
                  "w-full py-2.5 rounded-xl font-semibold text-sm transition-all",
                  action === "mint"
                    ? "bg-green-500 hover:bg-green-400 text-black disabled:opacity-40"
                    : "bg-red-500 hover:bg-red-400 text-white disabled:opacity-40"
                )}
              >
                {loading
                  ? "Processing…"
                  : action === "mint"
                    ? `Print ${amount || "—"} ${asset}`
                    : `Burn ${amount || "—"} ${asset}`}
              </button>
            </form>
          </div>

          {/* ── Info Panel ── */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">How it works</h3>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                    <Printer size={13} className="text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Print (Mint)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Use when a user deposits real USD via bank transfer, crypto on-ramp, or P2P.
                      Credits their Orah Exchange balance instantly.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                    <Flame size={13} className="text-red-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Burn</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Use when a user withdraws USD to their bank or redeems to an external wallet.
                      Removes balance from their account permanently.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
              <p className="text-xs font-semibold text-amber-400 mb-1">Important</p>
              <p className="text-xs text-muted-foreground">
                These operations directly modify user balances. Every action is logged with a timestamp.
                Always record a note referencing the original deposit/withdrawal so the audit trail is complete.
              </p>
            </div>
          </div>
        </div>

        {/* ── Audit Log ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Audit Log</h2>
            <button
              onClick={fetchLog}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw size={12} className={logLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {logLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : log.length === 0 ? (
            <div className="p-8 text-center">
              <Clock size={32} className="mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No operations yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Action</th>
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Asset</th>
                    <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Amount</th>
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Wallet</th>
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Note</th>
                    <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map(entry => (
                    <tr key={entry.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full",
                          entry.action === "mint"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-red-500/10 text-red-400"
                        )}>
                          {entry.action === "mint" ? <Printer size={10} /> : <Flame size={10} />}
                          {entry.action.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-xs text-foreground">{entry.asset}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-foreground">
                        {parseFloat(entry.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{shortAddr(entry.wallet_address)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">{entry.note ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">{timeAgo(entry.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
