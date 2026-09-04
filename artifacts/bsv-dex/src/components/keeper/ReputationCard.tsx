/**
 * ReputationCard — Keeper Reputation Score + Badges
 *
 * Fetches GET /api/keeper/:address/reputation and renders:
 *   • Reputation tier badge (Dormant → Grandmaster Relayer)
 *   • Composite score with numeric breakdown
 *   • Score breakdown bar (claimed / refunded / observed / bonuses)
 *   • Badge grid — earned badges illuminated, unearned badges dimmed
 *
 * Scoring model (mirrors keeperReputation.ts):
 *   CLAIMED          +10 per action
 *   REFUNDED         + 5 per action
 *   OBSERVED         + 1 per action
 *   Timely (≤6 blk)  +15 bonus per terminal action
 *   Timely (≤24 blk) + 5 bonus per terminal action
 *   Consistency      + 5 per 10 OBSERVED
 */

import { useQuery } from "@tanstack/react-query";
import { Trophy, Clock, Eye, Zap, Star, Shield, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types (mirrors KeeperReputation in keeperReputation.ts) ──────────────────

interface KeeperBadge {
  id:          string;
  name:        string;
  emoji:       string;
  description: string;
  earned:      boolean;
}

interface ScoreBreakdown {
  claimedBase:      number;
  refundedBase:     number;
  observedBase:     number;
  timelinessBonus:  number;
  consistencyBonus: number;
  total:            number;
}

interface KeeperReputation {
  keeperAddress:     string;
  score:             number;
  tier:              string;
  tierDescription:   string;
  tierColor:         string;
  totalActions:      number;
  claimedCount:      number;
  refundedCount:     number;
  observedCount:     number;
  timelyClaimsCount: number;
  breakdown:         ScoreBreakdown;
  badges:            KeeperBadge[];
  computedAt:        string;
}

// ── Tier colour map ───────────────────────────────────────────────────────────

const TIER_STYLES: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  amber:  { border: "border-amber-500/40",  bg: "bg-amber-500/10",  text: "text-amber-400",  glow: "shadow-amber-500/20" },
  violet: { border: "border-violet-500/40", bg: "bg-violet-500/10", text: "text-violet-400", glow: "shadow-violet-500/20" },
  blue:   { border: "border-blue-500/40",   bg: "bg-blue-500/10",   text: "text-blue-400",   glow: "shadow-blue-500/20" },
  green:  { border: "border-green-500/40",  bg: "bg-green-500/10",  text: "text-green-400",  glow: "shadow-green-500/20" },
  slate:  { border: "border-slate-500/40",  bg: "bg-slate-500/10",  text: "text-slate-400",  glow: "" },
  zinc:   { border: "border-zinc-600/40",   bg: "bg-zinc-700/20",   text: "text-zinc-500",   glow: "" },
};

function tierStyle(color: string) {
  return TIER_STYLES[color] ?? TIER_STYLES.zinc;
}

// ── Score bar segment ─────────────────────────────────────────────────────────

interface SegProps {
  label:  string;
  value:  number;
  total:  number;
  color:  string;
  icon:   React.ElementType;
}

function ScoreSegment({ label, value, total, color, icon: Icon }: SegProps) {
  if (value === 0 || total === 0) return null;
  const pct = Math.round((value / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Icon className="w-3 h-3" />
          {label}
        </span>
        <span className={cn("font-mono font-bold", color)}>+{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color.replace("text-", "bg-"))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Badge pill ────────────────────────────────────────────────────────────────

function BadgePill({ badge }: { badge: KeeperBadge }) {
  return (
    <div
      title={badge.description}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 transition-all",
        badge.earned
          ? "border-primary/30 bg-primary/5 text-foreground"
          : "border-border/40 bg-muted/10 text-muted-foreground/40 grayscale",
      )}
    >
      <span className="text-lg leading-none select-none">{badge.emoji}</span>
      <div className="min-w-0">
        <p className={cn("text-xs font-semibold truncate", badge.earned ? "" : "opacity-40")}>
          {badge.name}
        </p>
        <p className="text-[10px] text-muted-foreground/60 truncate hidden sm:block">
          {badge.description}
        </p>
      </div>
      {badge.earned && (
        <Star className="w-3 h-3 text-amber-400 shrink-0 fill-amber-400" />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  keeperAddress?: string;
}

export function ReputationCard({ keeperAddress }: Props) {
  const { data, isLoading, error, refetch, isFetching } = useQuery<KeeperReputation>({
    queryKey:      ["keeper-reputation", keeperAddress],
    enabled:       !!keeperAddress,
    queryFn:       async () => {
      const r = await fetch(`${BASE}/api/keeper/${keeperAddress}/reputation`);
      if (!r.ok) throw new Error("Failed to fetch reputation");
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime:       30_000,
  });

  if (!keeperAddress) {
    return (
      <div className="rounded-xl border border-border bg-card/30 p-6 text-center text-muted-foreground text-sm">
        Connect a wallet to view reputation
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card/30 p-6 text-center">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
        <p className="text-xs text-muted-foreground mt-2">Computing reputation score…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-border bg-card/30 p-6 text-center text-muted-foreground text-sm">
        Reputation data unavailable — try refreshing
      </div>
    );
  }

  const ts = tierStyle(data.tierColor);
  const bd = data.breakdown;
  const hasActivity = data.totalActions > 0;

  return (
    <div className="space-y-4">

      {/* ── Tier header ──────────────────────────────────────────────────────── */}
      <div className={cn(
        "rounded-xl border p-5 space-y-3 shadow-lg",
        ts.border, ts.bg, ts.glow,
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn("w-12 h-12 rounded-full flex items-center justify-center border-2 text-xl", ts.border, ts.bg)}>
              <Trophy className={cn("w-5 h-5", ts.text)} />
            </div>
            <div>
              <p className={cn("text-lg font-bold leading-tight", ts.text)}>{data.tier}</p>
              <p className="text-xs text-muted-foreground">{data.tierDescription}</p>
            </div>
          </div>

          {/* Score pill */}
          <div className={cn("rounded-lg border px-3 py-2 text-center shrink-0", ts.border, ts.bg)}>
            <p className={cn("text-2xl font-mono font-black", ts.text)}>{data.score}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">pts</p>
          </div>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-3 gap-2">
          <StatCell label="Claimed"  value={data.claimedCount}  icon={Zap}   color="text-emerald-400" />
          <StatCell label="Refunded" value={data.refundedCount} icon={Shield} color="text-red-400" />
          <StatCell label="Observed" value={data.observedCount} icon={Eye}   color="text-blue-400" />
        </div>

        {data.timelyClaimsCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              <span className="font-bold">{data.timelyClaimsCount}</span> critical-window action{data.timelyClaimsCount !== 1 ? "s" : ""} within ≤6 blocks of locktime
            </p>
          </div>
        )}
      </div>

      {/* ── Score breakdown ───────────────────────────────────────────────────── */}
      {hasActivity && bd.total > 0 && (
        <div className="rounded-xl border border-border bg-card/30 p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Score Breakdown</p>
          <div className="space-y-2.5">
            <ScoreSegment label="Claims (+10 each)"    value={bd.claimedBase}      total={bd.total} color="text-emerald-400" icon={Zap}   />
            <ScoreSegment label="Refunds (+5 each)"    value={bd.refundedBase}     total={bd.total} color="text-red-400"     icon={Shield} />
            <ScoreSegment label="Observed (+1 each)"   value={bd.observedBase}     total={bd.total} color="text-blue-400"   icon={Eye}   />
            <ScoreSegment label="Timeliness bonus"     value={bd.timelinessBonus}  total={bd.total} color="text-amber-400"  icon={Clock}  />
            <ScoreSegment label="Consistency bonus"    value={bd.consistencyBonus} total={bd.total} color="text-violet-400" icon={Star}   />
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className={cn("text-sm font-mono font-bold", ts.text)}>{bd.total} pts</span>
          </div>
        </div>
      )}

      {/* ── Badge grid ───────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Badges</p>
          <span className="text-xs text-muted-foreground">
            {data.badges.filter(b => b.earned).length} / {data.badges.length} earned
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.badges.map(badge => (
            <BadgePill key={badge.id} badge={badge} />
          ))}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          Computed from on-chain HTLC actions · updates every 60 s
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>
    </div>
  );
}

// ── Tiny stat cell ────────────────────────────────────────────────────────────

function StatCell({
  label, value, icon: Icon, color,
}: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-lg bg-background/30 border border-border/40 px-3 py-2 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <Icon className={cn("w-3 h-3", color)} />
        <span className={cn("text-lg font-mono font-bold", color)}>{value}</span>
      </div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
