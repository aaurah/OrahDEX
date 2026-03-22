import { useState, useMemo } from "react";
import {
  Search, Filter, RefreshCw, ExternalLink, Copy, Check,
  ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Clock,
  CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp,
  Link2, Blocks, Hash, Wallet, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
type Chain = "BSV" | "ETH" | "BNB" | "MATIC" | "ARB";
type TxType = "deposit" | "withdrawal" | "settlement" | "contract";
type TxStatus = "confirmed" | "pending" | "failed";

interface OnChainTx {
  id: string;
  txHash: string;
  chain: Chain;
  type: TxType;
  status: TxStatus;
  from: string;
  to: string;
  amount: number;
  asset: string;
  fee: number;
  feeCurrency: string;
  blockHeight: number | null;
  confirmations: number;
  requiredConfirmations: number;
  timestamp: string;
  userId?: string;
  orderId?: string;
  note?: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const EXPLORER: Record<Chain, (hash: string) => string> = {
  BSV: h => `https://whatsonchain.com/tx/${h}`,
  ETH: h => `https://etherscan.io/tx/${h}`,
  BNB: h => `https://bscscan.com/tx/${h}`,
  MATIC: h => `https://polygonscan.com/tx/${h}`,
  ARB: h => `https://arbiscan.io/tx/${h}`,
};

const CHAIN_COLORS: Record<Chain, string> = {
  BSV: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  ETH: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  BNB: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  MATIC: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  ARB: "bg-sky-500/15 text-sky-400 border-sky-500/25",
};

const TYPE_META: Record<TxType, { label: string; icon: any; color: string }> = {
  deposit:    { label: "Deposit",    icon: ArrowDownLeft,   color: "text-green-400" },
  withdrawal: { label: "Withdrawal", icon: ArrowUpRight,    color: "text-orange-400" },
  settlement: { label: "Settlement", icon: ArrowRightLeft,  color: "text-primary" },
  contract:   { label: "Contract",   icon: Link2,           color: "text-violet-400" },
};

const STATUS_META: Record<TxStatus, { label: string; icon: any; color: string; bg: string }> = {
  confirmed: { label: "Confirmed", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  pending:   { label: "Pending",   icon: Loader2,     color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  failed:    { label: "Failed",    icon: XCircle,     color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
};

function rHash(len = 64) {
  return "0x" + Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}
function rBsvHash() {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}
function rAddr(chain: Chain) {
  if (chain === "BSV") return "1" + Array.from({ length: 33 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789"[Math.floor(Math.random() * 58)]).join("");
  return "0x" + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

const CHAINS: Chain[] = ["BSV", "ETH", "BNB", "MATIC", "ARB"];
const TYPES: TxType[] = ["deposit", "withdrawal", "settlement", "contract"];
const STATUSES: TxStatus[] = ["confirmed", "confirmed", "confirmed", "pending", "failed"];
const ASSETS = ["BSV", "USDT", "ETH", "BNB", "MATIC"];

const MOCK_TXS: OnChainTx[] = Array.from({ length: 40 }, (_, i) => {
  const chain = CHAINS[i % CHAINS.length];
  const status = STATUSES[i % STATUSES.length];
  const type = TYPES[i % TYPES.length];
  const isBSV = chain === "BSV";
  const confs = status === "confirmed" ? Math.floor(Math.random() * 2000) + 3
    : status === "pending" ? Math.floor(Math.random() * 2)
    : 0;
  const reqConfs = isBSV ? 3 : chain === "ETH" ? 12 : 6;
  const ms = Date.now() - i * 1_800_000 - Math.random() * 900_000;
  return {
    id: `tx-${i}`,
    txHash: isBSV ? rBsvHash() : rHash(),
    chain,
    type,
    status,
    from: rAddr(chain),
    to: rAddr(chain),
    amount: parseFloat((Math.random() * 5000 + 0.001).toFixed(isBSV ? 8 : 4)),
    asset: ASSETS[i % ASSETS.length],
    fee: parseFloat((Math.random() * 0.05 + 0.0001).toFixed(8)),
    feeCurrency: isBSV ? "BSV" : chain,
    blockHeight: status !== "pending" ? 800_000 + i * 3 : null,
    confirmations: confs,
    requiredConfirmations: reqConfs,
    timestamp: new Date(ms).toISOString(),
    userId: `user_${String(i * 7 % 100).padStart(3, "0")}`,
    orderId: type === "settlement" ? `ord_${String(i * 13 % 999).padStart(5, "0")}` : undefined,
    note: type === "contract" ? "Smart contract execution — DEX router" : undefined,
  };
});

// ─── Small helpers ────────────────────────────────────────────────────────────
function shortHash(h: string) {
  return h.slice(0, 10) + "..." + h.slice(-8);
}
function shortAddr(a: string) {
  return a.slice(0, 8) + "..." + a.slice(-6);
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ─── Expanded detail row ──────────────────────────────────────────────────────
function TxDetail({ tx }: { tx: OnChainTx }) {
  const confPct = Math.min(100, (tx.confirmations / tx.requiredConfirmations) * 100);
  return (
    <tr>
      <td colSpan={8} className="px-4 pb-4 pt-0">
        <div className="bg-secondary/30 border border-border/60 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          {/* From */}
          <div>
            <p className="text-muted-foreground mb-1">From</p>
            <div className="flex items-center gap-1.5">
              <code className="font-mono text-foreground">{shortAddr(tx.from)}</code>
              <CopyBtn text={tx.from} />
            </div>
          </div>
          {/* To */}
          <div>
            <p className="text-muted-foreground mb-1">To</p>
            <div className="flex items-center gap-1.5">
              <code className="font-mono text-foreground">{shortAddr(tx.to)}</code>
              <CopyBtn text={tx.to} />
            </div>
          </div>
          {/* Block */}
          <div>
            <p className="text-muted-foreground mb-1">Block Height</p>
            <div className="flex items-center gap-1.5">
              <Blocks className="w-3 h-3 text-muted-foreground" />
              <span className="font-mono text-foreground">{tx.blockHeight?.toLocaleString() ?? "—"}</span>
            </div>
          </div>
          {/* Fee */}
          <div>
            <p className="text-muted-foreground mb-1">Network Fee</p>
            <span className="font-mono text-foreground">{tx.fee} {tx.feeCurrency}</span>
          </div>
          {/* Confirmations */}
          <div className="col-span-2 md:col-span-2">
            <p className="text-muted-foreground mb-1.5">
              Confirmations: <span className="text-foreground font-semibold">{tx.confirmations}</span> / {tx.requiredConfirmations} required
            </p>
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", tx.status === "confirmed" ? "bg-green-500" : tx.status === "pending" ? "bg-yellow-400" : "bg-red-500")}
                style={{ width: `${confPct}%` }}
              />
            </div>
          </div>
          {/* User / Order */}
          <div>
            <p className="text-muted-foreground mb-1">User ID</p>
            <div className="flex items-center gap-1.5">
              <Wallet className="w-3 h-3 text-muted-foreground" />
              <code className="font-mono text-foreground">{tx.userId ?? "—"}</code>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Order ID</p>
            <code className="font-mono text-foreground">{tx.orderId ?? "—"}</code>
          </div>
          {/* Note */}
          {tx.note && (
            <div className="col-span-2 md:col-span-4">
              <p className="text-muted-foreground mb-1">Note</p>
              <p className="text-foreground">{tx.note}</p>
            </div>
          )}
          {/* Explorer link */}
          <div className="col-span-2 md:col-span-4 pt-1">
            <a
              href={EXPLORER[tx.chain](tx.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View on {tx.chain === "BSV" ? "WhatsOnChain" : tx.chain === "ETH" ? "Etherscan" : tx.chain === "BNB" ? "BscScan" : tx.chain === "MATIC" ? "Polygonscan" : "Arbiscan"}
            </a>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub: string; icon: any; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", color)}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AdminTransactions() {
  const [search, setSearch] = useState("");
  const [chainFilter, setChainFilter] = useState<Chain | "all">("all");
  const [typeFilter, setTypeFilter] = useState<TxType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TxStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const PAGE_SIZE = 15;

  const filtered = useMemo(() => MOCK_TXS.filter(tx => {
    if (chainFilter !== "all" && tx.chain !== chainFilter) return false;
    if (typeFilter !== "all" && tx.type !== typeFilter) return false;
    if (statusFilter !== "all" && tx.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!tx.txHash.includes(q) && !tx.userId?.includes(q) && !tx.orderId?.includes(q) && !tx.asset.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [chainFilter, typeFilter, statusFilter, search, refreshKey]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats
  const confirmed = MOCK_TXS.filter(t => t.status === "confirmed").length;
  const pending = MOCK_TXS.filter(t => t.status === "pending").length;
  const failed = MOCK_TXS.filter(t => t.status === "failed").length;
  const totalVolume = MOCK_TXS.reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">On-Chain Transactions</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Live BSV & EVM chain settlement data</p>
        </div>
        <button
          onClick={() => { setRefreshKey(k => k + 1); setPage(1); }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border px-3 py-2 rounded-xl hover:bg-white/5 transition-all"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Transactions" value={MOCK_TXS.length.toString()} sub={`${confirmed} confirmed`} icon={Hash} color="bg-primary/15 text-primary" />
        <StatCard label="Pending" value={pending.toString()} sub="Awaiting confirmations" icon={Clock} color="bg-yellow-500/15 text-yellow-400" />
        <StatCard label="Failed" value={failed.toString()} sub="Require attention" icon={XCircle} color="bg-red-500/15 text-red-400" />
        <StatCard label="Total Volume" value={`$${(totalVolume * 45).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="Across all chains" icon={Activity} color="bg-green-500/15 text-green-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tx hash, user, order..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-all"
          />
        </div>

        {/* Chain filter */}
        <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-muted-foreground mr-0.5" />
          {(["all", ...CHAINS] as const).map(c => (
            <button key={c} onClick={() => { setChainFilter(c); setPage(1); }}
              className={cn("px-2 py-1 rounded-lg font-semibold transition-all capitalize",
                chainFilter === c
                  ? c === "all" ? "bg-primary text-primary-foreground" : `border ${CHAIN_COLORS[c as Chain]}`
                  : "text-muted-foreground hover:text-foreground"
              )}>
              {c}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-2 text-xs">
          {(["all", ...TYPES] as const).map(t => (
            <button key={t} onClick={() => { setTypeFilter(t); setPage(1); }}
              className={cn("px-2 py-1 rounded-lg font-medium capitalize transition-all",
                typeFilter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              {t === "all" ? "All types" : TYPE_META[t as TxType].label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-3 py-2 text-xs">
          {(["all", "confirmed", "pending", "failed"] as const).map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              className={cn("px-2 py-1 rounded-lg font-medium capitalize transition-all",
                statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-muted-foreground text-xs">
                <th className="px-4 py-3 text-left font-medium">Tx Hash</th>
                <th className="px-4 py-3 text-left font-medium">Chain</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Confs</th>
                <th className="px-4 py-3 text-left font-medium">Time</th>
                <th className="px-4 py-3 text-center font-medium w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-14 text-muted-foreground">No transactions found</td>
                </tr>
              ) : paginated.map(tx => {
                const sm = STATUS_META[tx.status];
                const tm = TYPE_META[tx.type];
                const expanded = expandedId === tx.id;
                const StatusIcon = sm.icon;
                const TypeIcon = tm.icon;
                return (
                  <>
                    <tr
                      key={tx.id}
                      onClick={() => setExpandedId(expanded ? null : tx.id)}
                      className={cn(
                        "hover:bg-secondary/20 transition-colors cursor-pointer",
                        expanded && "bg-secondary/10"
                      )}
                    >
                      {/* Hash */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-foreground">{shortHash(tx.txHash)}</code>
                          <CopyBtn text={tx.txHash} />
                          <a
                            href={EXPLORER[tx.chain](tx.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-muted-foreground hover:text-primary transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>

                      {/* Chain */}
                      <td className="px-4 py-3">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border", CHAIN_COLORS[tx.chain])}>
                          {tx.chain}
                        </span>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3">
                        <div className={cn("flex items-center gap-1.5 text-xs font-medium", tm.color)}>
                          <TypeIcon className="w-3.5 h-3.5" />
                          {tm.label}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 text-right font-mono text-xs text-foreground font-medium">
                        {tx.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                        <span className="text-muted-foreground ml-1">{tx.asset}</span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className={cn("inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg border", sm.bg, sm.color)}>
                          <StatusIcon className={cn("w-3 h-3", tx.status === "pending" && "animate-spin")} />
                          {sm.label}
                        </div>
                      </td>

                      {/* Confirmations */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn("font-mono text-xs",
                          tx.confirmations >= tx.requiredConfirmations ? "text-green-400" : "text-yellow-400"
                        )}>
                          {tx.confirmations}/{tx.requiredConfirmations}
                        </span>
                      </td>

                      {/* Time */}
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        <div title={new Date(tx.timestamp).toLocaleString()}>{timeAgo(tx.timestamp)}</div>
                      </td>

                      {/* Expand */}
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </td>
                    </tr>

                    {expanded && <TxDetail key={`detail-${tx.id}`} tx={tx} />}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-secondary/20">
            <span className="text-xs text-muted-foreground">{filtered.length} transactions</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 transition-all"
              >← Prev</button>
              <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40 transition-all"
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
