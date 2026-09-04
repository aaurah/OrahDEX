import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSEO } from "@/hooks/useSEO";
import { useWalletStore } from "@/store/useWalletStore";
import { cn, formatPrice } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Users, DollarSign, BarChart2, Shield,
  Copy, ChevronRight, X, AlertCircle, CheckCircle2, Loader2,
  ArrowDownToLine, ArrowUpFromLine, Star, Zap, Lock, RefreshCw,
  Activity, Award, Crown, Target, Info,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Types ─────────────────────────────────────────────────────────── */
interface Vault {
  id: string;
  leaderWallet: string;
  leaderName: string;
  leaderAvatar: string | null;
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
  pnlPct: string | null;
  executedAt: string;
}

interface MyPosition {
  id: string;
  vaultId: string;
  sharesOwned: string;
  depositAmountUsdt: string;
  entrySharePrice: string;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  realizedPnl: string;
  status: string;
  createdAt: string;
  vault: Vault;
}

/* ── Helpers ───────────────────────────────────────────────────────── */
function pct(value: string | number): number { return Number(value); }

function PnlBadge({ pct: p }: { pct: number }) {
  const pos = p >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums",
      pos ? "text-green-400" : "text-red-400"
    )}>
      {pos ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {pos ? "+" : ""}{p.toFixed(2)}%
    </span>
  );
}

function AvatarPlaceholder({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  const hue = (name.charCodeAt(0) * 137) % 360;
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-black flex-shrink-0"
      style={{ background: `hsl(${hue},70%,55%)` }}
    >
      {initial}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
  if (rank === 2) return <Award className="w-4 h-4 text-slate-300" />;
  if (rank === 3) return <Award className="w-4 h-4 text-amber-600" />;
  return <span className="text-xs text-muted-foreground font-mono">#{rank}</span>;
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: any; color?: string;
}) {
  return (
    <div className="bg-background/60 border border-border/50 rounded-xl p-4 flex items-start gap-3">
      <div className={cn("p-2 rounded-lg", color ?? "bg-green-500/10")}>
        <Icon className={cn("w-4 h-4", color ? "text-white" : "text-green-400")} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold font-mono">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Deposit Modal ─────────────────────────────────────────────────── */
function DepositModal({ vault, onClose, onSuccess }: {
  vault: Vault; onClose: () => void; onSuccess: () => void;
}) {
  const { address } = useWalletStore();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const qc = useQueryClient();

  const depositMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/copy/vaults/${vault.id}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followerWallet: address, amountUsdt: Number(amount) }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Deposit failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSuccess(true);
      qc.invalidateQueries({ queryKey: ["copy-vaults"] });
      qc.invalidateQueries({ queryKey: ["copy-my-positions"] });
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    },
    onError: (err: any) => setError(err.message),
  });

  const sharePrice = Number(vault.sharePrice) || 1;
  const sharesWillGet = Number(amount) > 0 ? (Number(amount) / sharePrice).toFixed(4) : "0";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-bold text-lg">Deposit into Vault</h2>
            <p className="text-sm text-muted-foreground">{vault.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-8 flex flex-col items-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-400" />
            <p className="font-semibold text-green-400">Deposit Successful!</p>
            <p className="text-sm text-muted-foreground text-center">
              You received {sharesWillGet} vault shares at ${sharePrice.toFixed(4)}/share
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {!address && (
              <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Connect your wallet to deposit
              </div>
            )}

            <div className="bg-muted/30 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Share Price</span>
                <span className="font-mono font-semibold">${sharePrice.toFixed(4)} USDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Performance Fee</span>
                <span className="font-mono">{(Number(vault.feeRate) * 100).toFixed(0)}% of profit</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Min Deposit</span>
                <span className="font-mono">{Number(vault.minDeposit).toFixed(2)} USDT</span>
              </div>
              {vault.maxCapacity && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Remaining Capacity</span>
                  <span className="font-mono">{(Number(vault.maxCapacity) - Number(vault.tvl)).toLocaleString()} USDT</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (USDT)</label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError(""); }}
                  placeholder={`Min ${vault.minDeposit} USDT`}
                  className="w-full bg-muted/40 border border-border rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:border-green-500/50 pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDT</span>
              </div>
              {Number(amount) > 0 && (
                <p className="text-xs text-muted-foreground">
                  You will receive ≈ <span className="text-green-400 font-mono">{sharesWillGet} shares</span>
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted/50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => depositMut.mutate()}
                disabled={!address || !amount || Number(amount) <= 0 || depositMut.isPending}
                className="flex-1 px-4 py-2.5 rounded-xl bg-green-500 text-black font-semibold text-sm hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {depositMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                Deposit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Withdraw Modal ────────────────────────────────────────────────── */
function WithdrawModal({ position, vault, onClose, onSuccess }: {
  position: MyPosition; vault: Vault; onClose: () => void; onSuccess: () => void;
}) {
  const { address } = useWalletStore();
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const qc = useQueryClient();

  const withdrawMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/copy/vaults/${vault.id}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followerWallet: address, positionId: position.id }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Withdraw failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["copy-vaults"] });
      qc.invalidateQueries({ queryKey: ["copy-my-positions"] });
    },
    onError: (err: any) => setError(err.message),
  });

  const sharePrice = Number(vault.sharePrice) || 1;
  const shares = Number(position.sharesOwned);
  const redeemValue = shares * sharePrice;
  const feeRate = Number(vault.feeRate);
  const entryValue = Number(position.depositAmountUsdt);
  const grossPnl = redeemValue - entryValue;
  const performanceFee = grossPnl > 0 ? grossPnl * feeRate : 0;
  const netPayout = redeemValue - performanceFee;

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl p-8 flex flex-col items-center gap-4">
          <CheckCircle2 className="w-12 h-12 text-green-400" />
          <p className="font-semibold text-green-400 text-lg">Withdrawal Complete</p>
          <div className="w-full bg-muted/30 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross Value</span>
              <span className="font-mono">{Number(result.redeemValue).toFixed(2)} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Performance Fee</span>
              <span className="font-mono text-yellow-400">-{Number(result.performanceFee).toFixed(2)} USDT</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="font-semibold">Net Payout</span>
              <span className="font-mono font-bold text-green-400">{Number(result.netPayout).toFixed(2)} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Realized PnL</span>
              <PnlBadge pct={(Number(result.realizedPnl) / entryValue) * 100} />
            </div>
          </div>
          <button onClick={() => { onSuccess(); onClose(); }} className="w-full px-4 py-2.5 rounded-xl bg-green-500 text-black font-semibold text-sm hover:bg-green-400 transition-colors">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-bold text-lg">Withdraw from Vault</h2>
            <p className="text-sm text-muted-foreground">{vault.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-muted/30 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shares to Redeem</span>
              <span className="font-mono">{shares.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Share Price</span>
              <span className="font-mono">${sharePrice.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross Value</span>
              <span className="font-mono">{redeemValue.toFixed(2)} USDT</span>
            </div>
            {performanceFee > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Performance Fee ({(feeRate * 100).toFixed(0)}%)</span>
                <span className="font-mono text-yellow-400">-{performanceFee.toFixed(2)} USDT</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2">
              <span className="font-semibold">Net Payout</span>
              <span className={cn("font-mono font-bold", netPayout >= entryValue ? "text-green-400" : "text-red-400")}>
                {netPayout.toFixed(2)} USDT
              </span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted/50 transition-colors">
              Cancel
            </button>
            <button
              onClick={() => withdrawMut.mutate()}
              disabled={withdrawMut.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/80 text-white font-semibold text-sm hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {withdrawMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />}
              Withdraw All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Vault Detail Panel ─────────────────────────────────────────────── */
function VaultDetailPanel({ vault, onClose, onDeposit }: {
  vault: Vault; onClose: () => void; onDeposit: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["copy-vault-detail", vault.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/copy/vaults/${vault.id}`);
      return res.json() as Promise<{ vault: Vault; trades: VaultTrade[] }>;
    },
    refetchInterval: 30_000,
  });

  const trades = data?.trades ?? [];
  const tvl = Number(vault.tvl);
  const sharePrice = Number(vault.sharePrice);
  const totalPnlPct = Number(vault.totalPnlPct);
  const monthPnlPct = Number(vault.monthPnlPct);
  const winRate = Number(vault.winRate);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg bg-background border-l border-border overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <AvatarPlaceholder name={vault.leaderName} />
            <div>
              <p className="font-bold text-lg leading-tight">{vault.name}</p>
              <p className="text-sm text-muted-foreground">by {vault.leaderName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50 transition-colors mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {vault.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{vault.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/30 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Total PnL</p>
              <PnlBadge pct={totalPnlPct} />
            </div>
            <div className="bg-muted/30 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">30d PnL</p>
              <PnlBadge pct={monthPnlPct} />
            </div>
            <div className="bg-muted/30 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">TVL</p>
              <p className="font-bold font-mono text-sm">${tvl.toLocaleString()}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Share Price</p>
              <p className="font-bold font-mono text-sm">${sharePrice.toFixed(4)}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
              <p className="font-bold font-mono text-sm">{(winRate * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Trades</p>
              <p className="font-bold font-mono text-sm">{vault.totalTrades.toLocaleString()}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Followers</p>
              <p className="font-bold font-mono text-sm">{vault.followers.toLocaleString()}</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">Perf. Fee</p>
              <p className="font-bold font-mono text-sm">{(Number(vault.feeRate) * 100).toFixed(0)}%</p>
            </div>
          </div>

          <div className="bg-muted/20 rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-2">Trading Pairs</p>
            <div className="flex flex-wrap gap-2">
              {vault.tradingPairs.split(",").map(p => (
                <span key={p} className="px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 font-mono">
                  {p.trim()}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={onDeposit}
            className="w-full px-4 py-3 rounded-xl bg-green-500 text-black font-bold text-sm hover:bg-green-400 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowDownToLine className="w-4 h-4" />
            Deposit into this Vault
          </button>

          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-400" />
              Recent Copy Trades
            </h3>
            {isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : trades.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No trades yet</p>
            ) : (
              <div className="space-y-2">
                {trades.map(t => (
                  <div key={t.id} className="flex items-center justify-between bg-muted/20 rounded-lg p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-semibold",
                        t.side === "buy" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                      )}>
                        {t.side.toUpperCase()}
                      </span>
                      <span className="font-mono text-xs">{t.symbol}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs">${Number(t.price).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{Number(t.quantity).toFixed(4)}</p>
                    </div>
                    <div className="text-right">
                      {t.pnlPct != null && <PnlBadge pct={Number(t.pnlPct)} />}
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.executedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Vault Card ─────────────────────────────────────────────────────── */
function VaultCard({ vault, rank, onClick }: {
  vault: Vault; rank: number; onClick: () => void;
}) {
  const totalPnlPct = Number(vault.totalPnlPct);
  const monthPnlPct = Number(vault.monthPnlPct);
  const tvl = Number(vault.tvl);
  const winRate = Number(vault.winRate);
  const sharePrice = Number(vault.sharePrice);

  return (
    <div
      onClick={onClick}
      className={cn(
        "group bg-background/60 border rounded-2xl p-5 cursor-pointer transition-all duration-200",
        "hover:border-green-500/40 hover:bg-background/80 hover:shadow-lg hover:shadow-green-500/5",
        rank === 1 ? "border-yellow-500/30" : "border-border/60",
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <AvatarPlaceholder name={vault.leaderName} />
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm">{vault.name}</p>
              <RankBadge rank={rank} />
            </div>
            <p className="text-xs text-muted-foreground">by {vault.leaderName}</p>
          </div>
        </div>
        <div className="text-right">
          <PnlBadge pct={totalPnlPct} />
          <p className="text-xs text-muted-foreground mt-0.5">all time</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">TVL</p>
          <p className="text-sm font-bold font-mono">${tvl >= 1000 ? `${(tvl / 1000).toFixed(1)}K` : tvl.toFixed(0)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">30d</p>
          <PnlBadge pct={monthPnlPct} />
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Win Rate</p>
          <p className="text-sm font-bold font-mono">{(winRate * 100).toFixed(0)}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Followers</p>
          <p className="text-sm font-bold font-mono">{vault.followers}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Share: <span className="font-mono text-foreground">${sharePrice.toFixed(4)}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Fee: <span className="font-mono text-foreground">{(Number(vault.feeRate) * 100).toFixed(0)}%</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Min: <span className="font-mono text-foreground">${Number(vault.minDeposit).toFixed(0)}</span>
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-green-400 transition-colors" />
      </div>

      {vault.description && (
        <p className="text-xs text-muted-foreground mt-3 line-clamp-1 border-t border-border/40 pt-3">
          {vault.description}
        </p>
      )}
    </div>
  );
}

/* ── My Position Card ───────────────────────────────────────────────── */
function MyPositionCard({ position, onWithdraw }: {
  position: MyPosition; onWithdraw: () => void;
}) {
  const pnlPct = position.unrealizedPnlPct;
  const entry = Number(position.depositAmountUsdt);

  return (
    <div className="bg-background/60 border border-border/60 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <AvatarPlaceholder name={position.vault.leaderName} />
          <div>
            <p className="font-bold text-sm">{position.vault.name}</p>
            <p className="text-xs text-muted-foreground">by {position.vault.leaderName}</p>
          </div>
        </div>
        <PnlBadge pct={pnlPct} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-xs text-muted-foreground">Invested</p>
          <p className="text-sm font-bold font-mono">${entry.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Current Value</p>
          <p className="text-sm font-bold font-mono">${position.currentValue.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Unrealized PnL</p>
          <p className={cn("text-sm font-bold font-mono", position.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400")}>
            {position.unrealizedPnl >= 0 ? "+" : ""}{position.unrealizedPnl.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/40 pt-3">
        <div className="text-xs text-muted-foreground">
          <span>{Number(position.sharesOwned).toFixed(4)} shares</span>
          <span className="mx-2">·</span>
          <span>since {new Date(position.createdAt).toLocaleDateString()}</span>
        </div>
        <button
          onClick={onWithdraw}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
        >
          <ArrowUpFromLine className="w-3 h-3" />
          Withdraw
        </button>
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────── */
export function CopyTrading() {
  useSEO({
    title: "CopyVault — Copy Trading | OrahDEX",
    description: "Mirror elite traders on-chain. Deposit into CopyVaults and automatically copy the best leaders on OrahDEX.",
  });

  const { address } = useWalletStore();
  const [tab, setTab] = useState<"explore" | "my">("explore");
  const [sortBy, setSortBy] = useState<"tvl" | "pnl" | "month" | "followers">("tvl");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [depositVault, setDepositVault] = useState<Vault | null>(null);
  const [withdrawPosition, setWithdrawPosition] = useState<MyPosition | null>(null);

  const { data: vaultsData, isLoading: vaultsLoading, refetch: refetchVaults } = useQuery({
    queryKey: ["copy-vaults"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/copy/vaults`);
      return res.json() as Promise<{ vaults: Vault[] }>;
    },
    refetchInterval: 60_000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["copy-stats"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/copy/stats`);
      return res.json() as Promise<{
        totalVaults: number; totalTvl: string; totalFollowers: number; avgPnlPct: string;
      }>;
    },
    refetchInterval: 120_000,
  });

  const { data: myData, isLoading: myLoading, refetch: refetchMy } = useQuery({
    queryKey: ["copy-my-positions", address],
    queryFn: async () => {
      if (!address) return { positions: [] };
      const res = await fetch(`${BASE}/api/copy/my-positions?walletAddress=${encodeURIComponent(address)}`);
      return res.json() as Promise<{ positions: MyPosition[] }>;
    },
    enabled: !!address,
    refetchInterval: 30_000,
  });

  const vaults = vaultsData?.vaults ?? [];
  const myPositions = myData?.positions ?? [];

  const filtered = vaults
    .filter(v => !searchQuery || v.name.toLowerCase().includes(searchQuery.toLowerCase()) || v.leaderName.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "tvl") return Number(b.tvl) - Number(a.tvl);
      if (sortBy === "pnl") return Number(b.totalPnlPct) - Number(a.totalPnlPct);
      if (sortBy === "month") return Number(b.monthPnlPct) - Number(a.monthPnlPct);
      if (sortBy === "followers") return b.followers - a.followers;
      return 0;
    });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Copy className="w-6 h-6 text-green-400" />
              <h1 className="text-2xl font-bold">CopyVault</h1>
              <span className="px-2 py-0.5 bg-green-500/15 border border-green-500/20 rounded text-xs text-green-400 font-semibold">LIVE</span>
            </div>
            <p className="text-sm text-muted-foreground">Mirror elite traders automatically. Deposit into a vault, share the alpha.</p>
          </div>
          <button
            onClick={() => { refetchVaults(); refetchMy(); }}
            className="p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Global stats */}
        {statsData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Active Vaults" value={String(statsData.totalVaults)} icon={Shield} />
            <StatCard label="Total TVL" value={`$${Number(statsData.totalTvl).toLocaleString()}`} icon={DollarSign} />
            <StatCard label="Total Followers" value={statsData.totalFollowers.toLocaleString()} icon={Users} />
            <StatCard label="Avg PnL" value={`${Number(statsData.avgPnlPct) >= 0 ? "+" : ""}${Number(statsData.avgPnlPct).toFixed(2)}%`} icon={BarChart2} />
          </div>
        )}

        {/* How it works */}
        <div className="bg-gradient-to-r from-green-500/5 to-emerald-500/5 border border-green-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-green-400" />
            <h3 className="font-semibold text-sm text-green-400">How CopyVault Works</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-green-400 font-bold text-xs">1</span>
              </div>
              <div>
                <p className="text-foreground font-medium mb-0.5">Choose a Leader</p>
                Browse vaults by PnL, TVL, or strategy. Review trade history and win rates.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-green-400 font-bold text-xs">2</span>
              </div>
              <div>
                <p className="text-foreground font-medium mb-0.5">Deposit USDT</p>
                Deposit into a vault and receive vault shares. Your share price tracks leader performance.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-green-400 font-bold text-xs">3</span>
              </div>
              <div>
                <p className="text-foreground font-medium mb-0.5">Copy Automatically</p>
                Every leader trade is mirrored proportionally. Withdraw any time, pay performance fee on profits only.
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { key: "explore", label: "Explore Vaults", icon: Target },
            { key: "my", label: `My Positions${myPositions.length ? ` (${myPositions.length})` : ""}`, icon: Lock },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                tab === key
                  ? "bg-green-500/15 text-green-400 border border-green-500/30"
                  : "text-muted-foreground hover:bg-muted/50 border border-transparent"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Explore Tab */}
        {tab === "explore" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search vaults or leaders..."
                className="flex-1 min-w-48 bg-muted/30 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
              />
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                Sort:
                {(["tvl", "pnl", "month", "followers"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      sortBy === s ? "bg-green-500/15 text-green-400" : "hover:bg-muted/50"
                    )}
                  >
                    {s === "tvl" ? "TVL" : s === "pnl" ? "All-time PnL" : s === "month" ? "30d PnL" : "Followers"}
                  </button>
                ))}
              </div>
            </div>

            {vaultsLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-green-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-lg font-medium mb-1">No vaults found</p>
                <p className="text-sm">Try a different search or check back later</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {filtered.map((vault, i) => (
                  <VaultCard
                    key={vault.id}
                    vault={vault}
                    rank={i + 1}
                    onClick={() => setSelectedVault(vault)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* My Positions Tab */}
        {tab === "my" && (
          <div className="space-y-4">
            {!address ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
                <Lock className="w-12 h-12 opacity-20" />
                <p className="text-lg font-medium">Connect Wallet</p>
                <p className="text-sm">Connect your wallet to view your copy trading positions</p>
              </div>
            ) : myLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-green-400" /></div>
            ) : myPositions.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
                <Copy className="w-12 h-12 opacity-20" />
                <p className="text-lg font-medium">No Active Positions</p>
                <p className="text-sm">Browse the Explore tab and deposit into a vault to start copy trading</p>
                <button
                  onClick={() => setTab("explore")}
                  className="mt-2 px-5 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-medium hover:bg-green-500/25 transition-colors"
                >
                  Explore Vaults
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/30 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">Total Invested</p>
                    <p className="font-bold font-mono">
                      ${myPositions.reduce((s, p) => s + Number(p.depositAmountUsdt), 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">Current Value</p>
                    <p className="font-bold font-mono">
                      ${myPositions.reduce((s, p) => s + p.currentValue, 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">Total PnL</p>
                    <p className={cn("font-bold font-mono", myPositions.reduce((s, p) => s + p.unrealizedPnl, 0) >= 0 ? "text-green-400" : "text-red-400")}>
                      {myPositions.reduce((s, p) => s + p.unrealizedPnl, 0) >= 0 ? "+" : ""}
                      ${myPositions.reduce((s, p) => s + p.unrealizedPnl, 0).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {myPositions.map(pos => (
                    <MyPositionCard
                      key={pos.id}
                      position={pos}
                      onWithdraw={() => setWithdrawPosition(pos)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Vault Detail Side Panel */}
      {selectedVault && (
        <VaultDetailPanel
          vault={selectedVault}
          onClose={() => setSelectedVault(null)}
          onDeposit={() => { setDepositVault(selectedVault); setSelectedVault(null); }}
        />
      )}

      {/* Deposit Modal */}
      {depositVault && (
        <DepositModal
          vault={depositVault}
          onClose={() => setDepositVault(null)}
          onSuccess={() => { setDepositVault(null); setTab("my"); }}
        />
      )}

      {/* Withdraw Modal */}
      {withdrawPosition && (
        <WithdrawModal
          position={withdrawPosition}
          vault={withdrawPosition.vault}
          onClose={() => setWithdrawPosition(null)}
          onSuccess={() => setWithdrawPosition(null)}
        />
      )}
    </div>
  );
}
