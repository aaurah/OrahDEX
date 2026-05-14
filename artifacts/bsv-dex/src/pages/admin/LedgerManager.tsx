import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, ArrowDownToLine, ArrowUpFromLine, RefreshCw, Copy, CheckCheck,
  Wallet, Clock, Check, X, Loader2, ChevronDown, ChevronUp, AlertTriangle,
  Database, ArrowRightLeft, Activity, Plus, Minus, Trash2, Users, ShieldAlert,
  RotateCw, Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/adminFetch";

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number, dec = 6) {
  if (n >= 1e6) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: dec });
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function shortAddr(addr: string) {
  if (!addr) return "";
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

// ── types ────────────────────────────────────────────────────────────────────
interface LedgerBalance { asset: string; available: string; locked: string; }
interface WalletRow { wallet_address: string; asset_count: string; last_activity: string; }
interface AuditRow { id: number; action: string; asset: string; amount: string; wallet_address: string; note: string | null; created_at: string; }
interface Withdrawal { id: string; walletAddress: string; asset: string; amount: number; network: string; networkLabel: string | null; recipient: string; status: string; txid: string | null; note: string | null; createdAt: string; }

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending:    { label: "Pending",    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30", icon: Clock },
  processing: { label: "Processing", color: "text-blue-400 bg-blue-500/10 border-blue-500/30",       icon: Loader2 },
  completed:  { label: "Completed",  color: "text-green-400 bg-green-500/10 border-green-500/30",    icon: Check },
  cancelled:  { label: "Cancelled",  color: "text-orange-400 bg-orange-500/10 border-orange-500/30", icon: X },
  failed:     { label: "Failed",     color: "text-red-400 bg-red-500/10 border-red-500/30",          icon: AlertTriangle },
};

type Tab = "overview" | "adjust" | "withdrawals" | "audit";

// ── main component ────────────────────────────────────────────────────────────
export function AdminLedgerManager() {
  const [tab, setTab]             = useState<Tab>("overview");
  const [searchAddr, setSearchAddr] = useState("");
  const [activeAddr, setActiveAddr] = useState("");
  const [walletSearch, setWalletSearch] = useState("");

  // adjust form
  const [adjAction, setAdjAction] = useState<"deposit" | "withdraw">("deposit");
  const [adjAddr,   setAdjAddr]   = useState("");
  const [adjAsset,  setAdjAsset]  = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjNote,   setAdjNote]   = useState("");
  const [adjMsg,    setAdjMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  const qc = useQueryClient();

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: balances = [], isFetching: balFetching, refetch: refetchBal } = useQuery<LedgerBalance[]>({
    queryKey: ["admin-ledger-balance", activeAddr],
    queryFn:  () => adminFetch(`${API}/api/admin/user-exchange-balance/${encodeURIComponent(activeAddr)}`).then(r => r.json()),
    enabled:  !!activeAddr,
    staleTime: 0,
  });

  const { data: walletsData, isFetching: walletsFetching, refetch: refetchWallets } = useQuery<{ wallets: WalletRow[]; total: number }>({
    queryKey: ["admin-ledger-wallets", walletSearch],
    queryFn:  () => adminFetch(`${API}/api/admin/ledger-wallets?limit=50&search=${encodeURIComponent(walletSearch)}`).then(r => r.json()),
    staleTime: 30_000,
  });

  // Include cancelled + failed so admin can retry the rows that auto-processing
  // marked as cancelled when the hot wallet was empty.
  const { data: pendingWithdrawals = [], refetch: refetchWd } = useQuery<Withdrawal[]>({
    queryKey: ["admin-withdrawals-pending"],
    queryFn:  () => adminFetch(`${API}/api/admin/withdrawals?status=pending,cancelled,failed`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  // Hot wallet status — addresses + on-chain native balance per chain.
  // Lets the operator see at a glance which hot wallet is actually funded.
  const { data: hotWallet, refetch: refetchHot, isFetching: hotFetching } = useQuery<{
    evmAddress: string;
    testnetMode: boolean;
    chains: { key: string; id: number; name: string; symbol: string; balance: number; error: string | null }[];
    bsv: { address: string; balance: number; error: string | null };
  }>({
    queryKey: ["admin-hot-wallet-status"],
    queryFn:  () => adminFetch(`${API}/api/admin/hot-wallet-status`).then(r => r.json()),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: auditLog = [], refetch: refetchAudit } = useQuery<AuditRow[]>({
    queryKey: ["admin-ledger-audit"],
    queryFn:  () => adminFetch(`${API}/api/admin/ledger-audit`).then(r => r.json()),
    staleTime: 10_000,
  });

  // ── mutations ──────────────────────────────────────────────────────────────
  const adjustMut = useMutation({
    mutationFn: (body: object) => adminFetch(`${API}/api/admin/ledger-adjust`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data: any) => {
      setAdjMsg({ ok: true, text: data.message ?? "Done" });
      setAdjAmount("");
      setAdjNote("");
      qc.invalidateQueries({ queryKey: ["admin-ledger-balance"] });
      qc.invalidateQueries({ queryKey: ["admin-ledger-audit"] });
      qc.invalidateQueries({ queryKey: ["admin-ledger-wallets"] });
    },
    onError: (err: any) => setAdjMsg({ ok: false, text: err.message ?? "Unknown error" }),
  });

  const wdStatusMut = useMutation({
    mutationFn: ({ id, status, note, txid }: { id: string; status: string; note?: string; txid?: string }) =>
      adminFetch(`${API}/api/admin/withdrawals/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, note, txid }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-withdrawals-pending"] }),
  });

  const [retryingId, setRetryingId] = useState<string | null>(null);
  const retryMut = useMutation({
    mutationFn: async (id: string) => {
      setRetryingId(id);
      const r = await adminFetch(`${API}/api/admin/withdrawals/${id}/retry`, { method: "POST" });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error ?? "Retry failed");
      return json;
    },
    onSettled: () => {
      setRetryingId(null);
      // Refresh both the queue and hot-wallet balances so changes show immediately.
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["admin-withdrawals-pending"] });
        qc.invalidateQueries({ queryKey: ["admin-hot-wallet-status"] });
      }, 1500);
    },
    onError: (err: any) => alert(err?.message ?? "Retry failed"),
  });

  // ── handlers ───────────────────────────────────────────────────────────────
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const a = searchAddr.trim();
    if (a) { setActiveAddr(a); if (tab === "overview") setAdjAddr(a); }
  };

  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    setAdjMsg(null);
    adjustMut.mutate({ action: adjAction, walletAddress: adjAddr, asset: adjAsset, amount: adjAmount, note: adjNote });
  };

  // ── tab nav ────────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: any; badge?: string }[] = [
    { id: "overview",    label: "Ledger Balances",    icon: Database },
    { id: "adjust",      label: "Deposit / Withdraw",  icon: ArrowRightLeft },
    { id: "withdrawals", label: "Pending Withdrawals", icon: ArrowDownToLine, badge: pendingWithdrawals.length > 0 ? String(pendingWithdrawals.length) : undefined },
    { id: "audit",       label: "Audit Log",           icon: Activity },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ledger Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Exchange internal ledger — manual deposits, withdrawals &amp; balance inspection
          </p>
        </div>
        <button
          onClick={() => { refetchBal(); refetchWallets(); refetchWd(); refetchAudit(); refetchHot(); }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Wallet address search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchAddr}
            onChange={e => setSearchAddr(e.target.value)}
            placeholder="Search wallet address (0x… or any)"
            className="w-full pl-9 pr-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button type="submit" className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors">
          Load
        </button>
      </form>

      {/* Active wallet pill */}
      {activeAddr && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-xl text-sm">
          <Wallet className="w-4 h-4 text-primary" />
          <span className="font-mono text-primary font-medium">{activeAddr}</span>
          <CopyBtn text={activeAddr} />
          <button onClick={() => setActiveAddr("")} className="ml-auto text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.badge && (
                <span className="ml-1 px-1.5 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded-full">{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── TAB: Overview ─────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Per-wallet balance table */}
          {activeAddr ? (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
                <span className="text-sm font-semibold">Exchange Balances — {shortAddr(activeAddr)}</span>
                {balFetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              {balances.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No balances found for this address.</div>
              ) : (
                <div className="divide-y divide-border">
                  {balances
                    .map(b => ({ ...b, total: parseFloat(b.available) + parseFloat(b.locked) }))
                    .filter(b => b.total > 0)
                    .sort((a, z) => z.total - a.total)
                    .map(b => (
                      <div key={b.asset} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                            {b.asset.slice(0, 2)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold">{b.asset}</div>
                            {parseFloat(b.locked) > 0 && (
                              <div className="text-xs text-muted-foreground">{fmt(parseFloat(b.locked))} locked</div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold tabular-nums">{fmt(parseFloat(b.available))}</div>
                          <div className="text-xs text-muted-foreground">available</div>
                        </div>
                        <button
                          onClick={() => { setAdjAddr(activeAddr); setAdjAsset(b.asset); setTab("adjust"); }}
                          className="ml-4 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                          Adjust
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            /* All-wallets overview table */
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
                <span className="text-sm font-semibold">All Ledger Wallets ({walletsData?.total ?? "…"})</span>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    value={walletSearch}
                    onChange={e => setWalletSearch(e.target.value)}
                    placeholder="Filter by address…"
                    className="pl-8 pr-3 py-1.5 bg-muted border border-border rounded-lg text-xs font-mono w-52 focus:outline-none"
                  />
                </div>
              </div>
              {walletsFetching ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="divide-y divide-border">
                  {(walletsData?.wallets ?? []).map(w => (
                    <div
                      key={w.wallet_address}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => { setSearchAddr(w.wallet_address); setActiveAddr(w.wallet_address); setAdjAddr(w.wallet_address); }}
                    >
                      <div className="font-mono text-xs text-muted-foreground">{w.wallet_address}</div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{w.asset_count} assets</span>
                        <span>{new Date(w.last_activity).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                  {(walletsData?.wallets ?? []).length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">No wallets found.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Deposit / Withdraw ────────────────────────────────────────── */}
      {tab === "adjust" && (
        <div className="max-w-lg space-y-6">
          {/* Action toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setAdjAction("deposit")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-colors",
                adjAction === "deposit"
                  ? "bg-green-500/10 border-green-500/40 text-green-400"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Plus className="w-4 h-4" /> Deposit (Credit)
            </button>
            <button
              onClick={() => setAdjAction("withdraw")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-colors",
                adjAction === "withdraw"
                  ? "bg-red-500/10 border-red-500/40 text-red-400"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Minus className="w-4 h-4" /> Withdraw (Debit)
            </button>
          </div>

          <form onSubmit={handleAdjust} className="space-y-4">
            {/* Wallet address */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Wallet Address</label>
              <input
                required
                value={adjAddr}
                onChange={e => setAdjAddr(e.target.value)}
                placeholder="0x... or any ledger address"
                className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {activeAddr && adjAddr !== activeAddr && (
                <button type="button" onClick={() => setAdjAddr(activeAddr)} className="mt-1 text-xs text-primary hover:underline">
                  Use loaded wallet ({shortAddr(activeAddr)})
                </button>
              )}
            </div>

            {/* Asset + Amount row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Asset</label>
                <input
                  required
                  value={adjAsset}
                  onChange={e => setAdjAsset(e.target.value.toUpperCase())}
                  placeholder="BTC, ETH, USDT…"
                  className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Amount</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={adjAmount}
                  onChange={e => setAdjAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Note (optional)</label>
              <input
                value={adjNote}
                onChange={e => setAdjNote(e.target.value)}
                placeholder="Reason for adjustment, reference ID, etc."
                className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Result message */}
            {adjMsg && (
              <div className={cn(
                "flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm border",
                adjMsg.ok
                  ? "bg-green-500/10 border-green-500/30 text-green-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400",
              )}>
                {adjMsg.ok ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                {adjMsg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={adjustMut.isPending}
              className={cn(
                "w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors",
                adjAction === "deposit"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white",
                adjustMut.isPending && "opacity-60 cursor-not-allowed",
              )}
            >
              {adjustMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (adjAction === "deposit" ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />)}
              {adjAction === "deposit" ? "Credit to Ledger" : "Debit from Ledger"}
            </button>
          </form>

          {/* Quick balance lookup if wallet is set */}
          {adjAddr && balances.length > 0 && adjAddr === activeAddr && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border text-xs font-medium text-muted-foreground">
                Current balance — {shortAddr(adjAddr)}
              </div>
              {balances
                .filter(b => !adjAsset || b.asset === adjAsset)
                .filter(b => parseFloat(b.available) + parseFloat(b.locked) > 0)
                .slice(0, adjAsset ? 1 : 10)
                .map(b => (
                  <div key={b.asset} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="font-mono font-semibold">{b.asset}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmt(parseFloat(b.available))} avail · {fmt(parseFloat(b.locked))} locked
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Pending Withdrawals ───────────────────────────────────────── */}
      {tab === "withdrawals" && (
        <div className="space-y-4">
          {/* Hot wallet status — fund these addresses to enable auto-payouts. */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-semibold">Hot Wallet Status</span>
                {hotWallet?.testnetMode && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded">testnet mode</span>
                )}
              </div>
              <button
                onClick={() => refetchHot()}
                disabled={hotFetching}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                {hotFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Refresh
              </button>
            </div>
            <div className="px-4 py-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                These are the system wallets that physically send your users' withdrawals on-chain.
                A balance of <span className="font-mono text-red-400">0</span> on a chain means
                withdrawals on that chain will fail until you send funds to the address.
                Set <code className="text-foreground">EVM_USE_TESTNET=1</code> to route ETH-family
                withdrawals to Sepolia/Base-Sepolia/Arb-Sepolia (where your testnet balance lives).
              </p>

              {/* EVM hot wallet (one address, many chains) */}
              {hotWallet?.evmAddress && (
                <div className="rounded-lg border border-border bg-muted/10 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">EVM Hot Wallet</span>
                    <span className="font-mono text-xs">{hotWallet.evmAddress}</span>
                    <CopyBtn text={hotWallet.evmAddress} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {hotWallet.chains.map(c => {
                      const ok = c.balance > 0 && !c.error;
                      return (
                        <div key={c.key} className={cn(
                          "rounded border px-2.5 py-1.5 text-xs",
                          c.error
                            ? "border-zinc-700 bg-zinc-900/40 text-zinc-500"
                            : ok
                              ? "border-green-500/30 bg-green-500/5"
                              : "border-red-500/30 bg-red-500/5",
                        )}>
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{c.name}</span>
                            {ok ? <Check className="w-3 h-3 text-green-400" /> : c.error ? null : <X className="w-3 h-3 text-red-400" />}
                          </div>
                          <div className={cn("font-mono mt-0.5", ok ? "text-green-400" : c.error ? "text-zinc-500" : "text-red-400")}>
                            {c.error ? "RPC error" : `${fmt(c.balance, 6)} ${c.symbol}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* BSV hot wallet */}
              {hotWallet?.bsv?.address && (
                <div className="rounded-lg border border-border bg-muted/10 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">BSV Hot Wallet</span>
                    <span className="font-mono text-xs">{hotWallet.bsv.address}</span>
                    <CopyBtn text={hotWallet.bsv.address} />
                  </div>
                  <div className={cn(
                    "inline-block rounded border px-2.5 py-1 text-xs font-mono",
                    hotWallet.bsv.error
                      ? "border-zinc-700 bg-zinc-900/40 text-zinc-500"
                      : hotWallet.bsv.balance > 0
                        ? "border-green-500/30 bg-green-500/5 text-green-400"
                        : "border-red-500/30 bg-red-500/5 text-red-400",
                  )}>
                    {hotWallet.bsv.error ?? `${fmt(hotWallet.bsv.balance, 8)} BSV`}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {pendingWithdrawals.length === 0
                ? "No pending or cancelled withdrawals."
                : `${pendingWithdrawals.length} withdrawal${pendingWithdrawals.length > 1 ? "s" : ""} needing attention (pending + cancelled)`}
            </p>
          </div>
          <div className="space-y-3">
            {pendingWithdrawals.map(wd => {
              const meta = STATUS_META[wd.status] ?? STATUS_META.pending;
              const Icon = meta.icon;
              return (
                <div key={wd.id} className="border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border", meta.color)}>
                        <Icon className="w-3 h-3" /> {meta.label}
                      </span>
                      <span className="font-semibold text-sm">{wd.amount} {wd.asset}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(wd.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="px-4 py-3 space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex gap-2">
                      <span className="font-medium text-foreground w-20 shrink-0">From</span>
                      <span className="font-mono">{wd.walletAddress}</span>
                      <CopyBtn text={wd.walletAddress} />
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium text-foreground w-20 shrink-0">To</span>
                      <span className="font-mono">{wd.recipient}</span>
                      <CopyBtn text={wd.recipient} />
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium text-foreground w-20 shrink-0">Network</span>
                      <span>{wd.networkLabel ?? wd.network}</span>
                    </div>
                    {wd.note && (
                      <div className="flex gap-2">
                        <span className="font-medium text-foreground w-20 shrink-0">Note</span>
                        <span className="italic">{wd.note}</span>
                      </div>
                    )}
                  </div>
                  {wd.status !== "completed" && (
                    <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-border bg-muted/10">
                      {/* Retry — works for both pending (e.g. after funding the hot wallet)
                          and cancelled (re-debits balance and re-attempts). */}
                      <button
                        onClick={() => retryMut.mutate(wd.id)}
                        disabled={retryingId === wd.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                        title={wd.status === "cancelled"
                          ? "Re-debits the user's balance and re-attempts on-chain payout"
                          : "Re-attempts on-chain payout"}
                      >
                        {retryingId === wd.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <RotateCw className="w-3.5 h-3.5" />}
                        Retry now
                      </button>
                      {wd.status === "pending" && (
                        <>
                          <button
                            onClick={() => {
                              const txid = prompt("Enter transaction ID (optional):");
                              wdStatusMut.mutate({ id: wd.id, status: "completed", txid: txid ?? undefined });
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" /> Mark Completed
                          </button>
                          <button
                            onClick={() => {
                              const note = prompt("Cancellation reason:");
                              wdStatusMut.mutate({ id: wd.id, status: "cancelled", note: note ?? undefined });
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            <X className="w-3.5 h-3.5" /> Cancel &amp; Refund
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {pendingWithdrawals.length === 0 && (
              <div className="border border-border rounded-xl py-12 text-center text-sm text-muted-foreground">
                <Check className="w-8 h-8 mx-auto mb-2 text-green-400" />
                All withdrawal requests are processed.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Audit Log ────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-muted/30 border-b border-border text-sm font-semibold">
            Recent Ledger Adjustments
          </div>
          {auditLog.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No adjustments recorded yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {auditLog.map(row => (
                <div key={row.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                    row.action === "mint" ? "bg-green-500/10" : "bg-red-500/10",
                  )}>
                    {row.action === "mint"
                      ? <ArrowDownToLine className="w-3.5 h-3.5 text-green-400" />
                      : <ArrowUpFromLine className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">
                      {row.action === "mint" ? "Deposited" : "Withdrawn"}&nbsp;
                      <span className="text-primary">{fmt(parseFloat(row.amount))} {row.asset}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{row.wallet_address}</div>
                    {row.note && <div className="text-xs text-muted-foreground italic truncate">{row.note}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 text-right">
                    {new Date(row.created_at).toLocaleDateString()}<br />
                    {new Date(row.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
