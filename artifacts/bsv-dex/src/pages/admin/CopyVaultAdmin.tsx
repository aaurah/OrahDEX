import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy, RefreshCw, TrendingUp, TrendingDown, Users, DollarSign,
  BarChart2, Shield, Plus, X, AlertCircle, CheckCircle2, Loader2,
  Eye, Pause, Play, Trash2, Activity, ChevronDown, ChevronUp, Award, Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Vault {
  id: string;
  leaderWallet: string;
  leaderName: string;
  name: string;
  description: string | null;
  tradingPairs: string;
  feeRate: string;
  minDeposit: string;
  maxCapacity: string | null;
  tvl: string;
  totalShares: string;
  sharePrice: string;
  totalPnl: string;
  totalPnlPct: string;
  monthPnlPct: string;
  totalTrades: number;
  winRate: string;
  followers: number;
  status: string;
  createdAt: string;
}

interface VaultTrade {
  id: string;
  symbol: string;
  side: string;
  price: string;
  quantity: string;
  total: string;
  pnl: string | null;
  executedAt: string;
}

function PnlBadge({ pct }: { pct: number }) {
  const pos = pct >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums",
      pos ? "text-green-400" : "text-red-400"
    )}>
      {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pos ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}

function StatCard({ label, value, icon: Icon, sub, color = "text-primary" }: {
  label: string; value: string; icon: any; sub?: string; color?: string;
}) {
  return (
    <div className="bg-secondary/30 border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="p-2 bg-primary/10 rounded-lg">
        <Icon className={cn("w-4 h-4", color)} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-base font-bold font-mono">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Create Vault Modal ─────────────────────────────────────────────── */
function CreateVaultModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    leaderWallet: "",
    leaderName: "",
    name: "",
    description: "",
    tradingPairs: "BSV-USDT",
    feeRate: "0.10",
    minDeposit: "10",
    maxCapacity: "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/copy/vaults`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          feeRate: Number(form.feeRate),
          minDeposit: Number(form.minDeposit),
          maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to create vault");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Vault created", description: form.name });
      onCreated();
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const Field = ({ label, k, type = "text", placeholder = "" }: { label: string; k: string; type?: string; placeholder?: string }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <input
        type={type}
        value={(form as any)[k]}
        onChange={e => set(k, e.target.value)}
        placeholder={placeholder}
        className="w-full bg-secondary/40 border border-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50 transition-colors"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            <h2 className="font-bold">Create CopyVault</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Leader Wallet Address" k="leaderWallet" placeholder="0x..." />
            <Field label="Leader Display Name" k="leaderName" placeholder="Sovereign Phantom" />
          </div>
          <Field label="Vault Name" k="name" placeholder="BSV Momentum Vault" />
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              rows={2}
              placeholder="Describe the vault strategy..."
              className="w-full bg-secondary/40 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none"
            />
          </div>
          <Field label="Trading Pairs (comma-separated)" k="tradingPairs" placeholder="BSV-USDT,ETH-USDT" />
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Performance Fee</label>
              <div className="relative">
                <input
                  type="number" step="0.01" min="0" max="1"
                  value={form.feeRate}
                  onChange={e => set("feeRate", e.target.value)}
                  className="w-full bg-secondary/40 border border-border rounded-xl px-3 py-2 pr-8 text-sm font-mono focus:outline-none focus:border-primary/50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">×1</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{(Number(form.feeRate) * 100).toFixed(0)}% of profit</p>
            </div>
            <Field label="Min Deposit (USDT)" k="minDeposit" type="number" placeholder="10" />
            <Field label="Max Capacity (USDT)" k="maxCapacity" type="number" placeholder="Unlimited" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted/50 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => createMut.mutate()}
              disabled={!form.leaderWallet || !form.leaderName || !form.name || createMut.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-black font-semibold text-sm hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Vault
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Vault Row ──────────────────────────────────────────────────────── */
function VaultRow({ vault, rank, onToggleStatus, onViewTrades }: {
  vault: Vault; rank: number;
  onToggleStatus: (id: string, newStatus: string) => void;
  onViewTrades: (vault: Vault) => void;
}) {
  const totalPnlPct = Number(vault.totalPnlPct);
  const tvl = Number(vault.tvl);
  const winRate = Number(vault.winRate);

  return (
    <div className="bg-secondary/20 border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
            {rank === 1 ? <Crown className="w-4 h-4 text-yellow-400" /> : rank === 2 ? <Award className="w-4 h-4 text-slate-300" /> : rank}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm truncate">{vault.name}</p>
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-bold border",
                vault.status === "active"
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
              )}>
                {vault.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">by {vault.leaderName}</p>
            <p className="text-[11px] font-mono text-muted-foreground/60 truncate">{vault.leaderWallet.slice(0, 12)}…{vault.leaderWallet.slice(-6)}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => onViewTrades(vault)}
            className="p-1.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors" title="View trades"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onToggleStatus(vault.id, vault.status === "active" ? "paused" : "active")}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              vault.status === "active"
                ? "bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400"
                : "bg-green-500/10 hover:bg-green-500/20 text-green-400"
            )}
            title={vault.status === "active" ? "Pause vault" : "Activate vault"}
          >
            {vault.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-border/50">
        <div>
          <p className="text-[10px] text-muted-foreground">TVL</p>
          <p className="text-sm font-bold font-mono">${tvl >= 1000 ? `${(tvl / 1000).toFixed(1)}K` : tvl.toFixed(0)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">All-time PnL</p>
          <PnlBadge pct={totalPnlPct} />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Win Rate</p>
          <p className="text-sm font-bold font-mono">{(winRate * 100).toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Followers</p>
          <p className="text-sm font-bold font-mono">{vault.followers}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {vault.tradingPairs.split(",").map(p => (
          <span key={p} className="px-2 py-0.5 bg-primary/10 border border-primary/20 rounded text-[10px] text-primary font-mono">
            {p.trim()}
          </span>
        ))}
        <span className="px-2 py-0.5 bg-secondary border border-border rounded text-[10px] text-muted-foreground font-mono">
          Fee: {(Number(vault.feeRate) * 100).toFixed(0)}%
        </span>
        <span className="px-2 py-0.5 bg-secondary border border-border rounded text-[10px] text-muted-foreground font-mono">
          Min: ${Number(vault.minDeposit).toFixed(0)}
        </span>
        <span className="px-2 py-0.5 bg-secondary border border-border rounded text-[10px] text-muted-foreground font-mono">
          {vault.totalTrades} trades
        </span>
      </div>
    </div>
  );
}

/* ── Trade History Panel ─────────────────────────────────────────────── */
function TradeHistoryPanel({ vault, onClose }: { vault: Vault; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-copy-vault-trades", vault.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/copy/vaults/${vault.id}`);
      return res.json() as Promise<{ vault: Vault; trades: VaultTrade[] }>;
    },
  });

  const trades = data?.trades ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg bg-background border-l border-border overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-5 flex items-center justify-between">
          <div>
            <h2 className="font-bold">{vault.name}</h2>
            <p className="text-xs text-muted-foreground">{trades.length} copy trades recorded</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/30 rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Share Price</p>
              <p className="font-bold font-mono">${Number(vault.sharePrice).toFixed(4)}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3">
              <p className="text-xs text-muted-foreground">TVL</p>
              <p className="font-bold font-mono">${Number(vault.tvl).toLocaleString()}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Total PnL</p>
              <PnlBadge pct={Number(vault.totalPnlPct)} />
            </div>
            <div className="bg-muted/30 rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Followers</p>
              <p className="font-bold font-mono">{vault.followers}</p>
            </div>
          </div>

          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Copy Trade History
          </h3>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : trades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-20" />
              No trades executed yet
            </div>
          ) : (
            <div className="space-y-2">
              {trades.map(t => (
                <div key={t.id} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded font-semibold",
                      t.side === "buy" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                    )}>
                      {t.side.toUpperCase()}
                    </span>
                    <span className="font-mono font-medium">{t.symbol}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono">${Number(t.price).toLocaleString()}</p>
                    <p className="text-muted-foreground">{Number(t.quantity).toFixed(4)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono">${Number(t.total).toFixed(2)}</p>
                    <p className="text-muted-foreground">{new Date(t.executedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Admin Page ─────────────────────────────────────────────────── */
export function AdminCopyVault() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [viewTradesVault, setViewTradesVault] = useState<Vault | null>(null);
  const [sortBy, setSortBy] = useState<"tvl" | "pnl" | "followers">("tvl");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "paused">("all");

  const { data: vaultsData, isLoading, refetch } = useQuery({
    queryKey: ["admin-copy-vaults"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/copy/vaults`);
      return res.json() as Promise<{ vaults: Vault[] }>;
    },
    refetchInterval: 30_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["copy-stats"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/copy/stats`);
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`${BASE}/api/copy/vaults/${id}/sync-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: "orah-internal", status }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-copy-vaults"] });
    },
  });

  const handleToggleStatus = (id: string, newStatus: string) => {
    toast({
      title: newStatus === "paused" ? "Vault paused" : "Vault activated",
      description: `Status changed to ${newStatus}`,
    });
  };

  const vaults = vaultsData?.vaults ?? [];

  const filtered = vaults
    .filter(v => filterStatus === "all" || v.status === filterStatus)
    .sort((a, b) => {
      if (sortBy === "tvl") return Number(b.tvl) - Number(a.tvl);
      if (sortBy === "pnl") return Number(b.totalPnlPct) - Number(a.totalPnlPct);
      return b.followers - a.followers;
    });

  const totalTvl = vaults.reduce((s, v) => s + Number(v.tvl), 0);
  const totalFollowers = vaults.reduce((s, v) => s + v.followers, 0);
  const totalTrades = vaults.reduce((s, v) => s + v.totalTrades, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
            <Copy className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">CopyVault Management</h1>
            <p className="text-xs text-muted-foreground">On-chain copy trading vault control panel</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl border border-border hover:bg-muted/50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Vault
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active Vaults" value={String(vaults.length)} icon={Shield} />
        <StatCard label="Total TVL" value={`$${totalTvl.toLocaleString()}`} icon={DollarSign} color="text-green-400" />
        <StatCard label="Total Followers" value={totalFollowers.toLocaleString()} icon={Users} color="text-blue-400" />
        <StatCard label="Total Copy Trades" value={totalTrades.toLocaleString()} icon={BarChart2} color="text-violet-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Status:</span>
          {(["all", "active", "paused"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize",
                filterStatus === s ? "bg-primary/15 text-primary" : "hover:bg-muted/50 text-muted-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs ml-4">
          <span className="text-muted-foreground">Sort:</span>
          {(["tvl", "pnl", "followers"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize",
                sortBy === s ? "bg-primary/15 text-primary" : "hover:bg-muted/50 text-muted-foreground"
              )}
            >
              {s === "tvl" ? "TVL" : s === "pnl" ? "PnL" : "Followers"}
            </button>
          ))}
        </div>
      </div>

      {/* Vault List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Copy className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold">No vaults found</p>
          <p className="text-sm mt-1">Create the first vault to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((vault, i) => (
            <VaultRow
              key={vault.id}
              vault={vault}
              rank={i + 1}
              onToggleStatus={handleToggleStatus}
              onViewTrades={setViewTradesVault}
            />
          ))}
        </div>
      )}

      {/* Architecture Info */}
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
        <h3 className="font-semibold text-sm text-primary mb-3 flex items-center gap-2">
          <BarChart2 className="w-4 h-4" />
          CopyVault Architecture
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
          <div>
            <p className="text-foreground font-medium mb-1">Share Pricing</p>
            <p>Share Price = TVL ÷ Total Shares. Starts at $1.00/share. Appreciates or depreciates with vault performance.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Trade Mirroring</p>
            <p>When the leader trades X% of their portfolio, the vault mirrors proportionally based on vault TVL vs leader portfolio size.</p>
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Fee Model</p>
            <p>Performance fee (configurable per vault) is taken only on profits at withdrawal time. No fee on losing positions.</p>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateVaultModal onClose={() => setShowCreate(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["admin-copy-vaults"] })} />
      )}
      {viewTradesVault && (
        <TradeHistoryPanel vault={viewTradesVault} onClose={() => setViewTradesVault(null)} />
      )}
    </div>
  );
}
