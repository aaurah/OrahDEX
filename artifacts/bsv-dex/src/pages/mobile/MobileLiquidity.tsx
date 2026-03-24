import { useState } from "react";
import { useLocation } from "wouter";
import {
  Droplets, Plus, Minus, TrendingUp, ArrowLeft, Info,
  ChevronDown, ChevronUp, Zap, Award, BarChart3, Layers, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── pool data ─── */
const POOLS = [
  { id: "btc-usdt",  base: "BTC",  quote: "USDT", tvl: 423_600_000, vol24: 98_200_000,  farmApr: 4.2,  fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "eth-usdt",  base: "ETH",  quote: "USDT", tvl: 187_400_000, vol24: 44_100_000,  farmApr: 6.1,  fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "sol-usdt",  base: "SOL",  quote: "USDT", tvl: 95_700_000,  vol24: 21_300_000,  farmApr: 8.4,  fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "bsv-usdt",  base: "BSV",  quote: "USDT", tvl: 8_240_000,   vol24: 1_920_000,   farmApr: 18.2, fee: 0.2,  userLp: 1240.5, chain: "BSV" },
  { id: "bnb-usdt",  base: "BNB",  quote: "USDT", tvl: 67_300_000,  vol24: 14_800_000,  farmApr: 5.9,  fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "xrp-usdt",  base: "XRP",  quote: "USDT", tvl: 52_100_000,  vol24: 12_700_000,  farmApr: 7.3,  fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "ada-usdt",  base: "ADA",  quote: "USDT", tvl: 29_800_000,  vol24: 6_400_000,   farmApr: 9.1,  fee: 0.3,  userLp: 640.0,  chain: "BSV" },
  { id: "doge-usdt", base: "DOGE", quote: "USDT", tvl: 41_200_000,  vol24: 9_300_000,   farmApr: 7.8,  fee: 0.25, userLp: 0,      chain: "BSV" },
  { id: "dot-usdt",  base: "DOT",  quote: "USDT", tvl: 18_600_000,  vol24: 3_900_000,   farmApr: 11.2, fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "link-usdt", base: "LINK", quote: "USDT", tvl: 22_900_000,  vol24: 5_100_000,   farmApr: 10.1, fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "bsv-btc",   base: "BSV",  quote: "BTC",  tvl: 4_100_000,   vol24: 980_000,     farmApr: 22.8, fee: 0.2,  userLp: 320.0,  chain: "BSV" },
  { id: "eth-btc",   base: "ETH",  quote: "BTC",  tvl: 76_500_000,  vol24: 17_200_000,  farmApr: 5.3,  fee: 0.3,  userLp: 0,      chain: "BSV" },
];

// Approximate spot prices for UI ratio calculations only
const SPOT: Record<string, number> = {
  BTC: 71_000, ETH: 2_160, SOL: 92, BSV: 14, BNB: 640,
  XRP: 1.42, ADA: 0.264, DOGE: 0.094, DOT: 1.39, LINK: 14.2, USDT: 1,
};

// Pool APR = fee revenue / TVL × 365  (x·y=k constant-product formula)
function poolApr(p: typeof POOLS[0]) {
  return (p.vol24 * (p.fee / 100) / p.tvl) * 365 * 100;
}

const FARM_POOLS = POOLS.filter(p => p.userLp > 0).map(p => ({
  ...p,
  staked: p.userLp * 0.6,
  unstaked: p.userLp * 0.4,
  earned: parseFloat((Math.random() * 12).toFixed(4)),
}));

function fmtTvl(n: number) {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

const COIN_COLORS: Record<string, string> = {
  BTC: "#F97316", ETH: "#8B5CF6", SOL: "#06B6D4", BSV: "#EAB308",
  BNB: "#EAB308", XRP: "#3B82F6", ADA: "#2563EB", DOGE: "#EAB308",
  DOT: "#EC4899", LINK: "#3B82F6",
};

type MainTab = "pools" | "positions" | "farming";

/* ── Add/Remove Liquidity Modal ── */
function LiquidityModal({
  pool, mode, onClose
}: {
  pool: typeof POOLS[0] | null;
  mode: "add" | "remove";
  onClose: () => void;
}) {
  const [amtA, setAmtA] = useState("");
  const [amtB, setAmtB] = useState("");
  const [pct, setPct] = useState(50);

  if (!pool) return null;

  const colorA   = COIN_COLORS[pool.base]  ?? "#EAB308";
  const colorB   = COIN_COLORS[pool.quote] ?? "#16a34a";
  const feeApr   = poolApr(pool);
  const totalApr = feeApr + pool.farmApr;
  const priceA   = SPOT[pool.base]  ?? 1;
  const priceB   = SPOT[pool.quote] ?? 1;

  // Remove: user receives tokens proportional to 50/50 pool split
  const lpValue     = pool.userLp * 12.5;
  const removeValue = lpValue * (pct / 100);
  const receiveA    = removeValue / 2 / priceA;
  const receiveB    = removeValue / 2 / priceB;

  // Add: auto-fill token B from token A ratio
  const handleAmtAChange = (val: string) => {
    setAmtA(val);
    const n = parseFloat(val);
    setAmtB((!isNaN(n) && n > 0) ? (n * priceA / priceB).toFixed(6) : "");
  };
  const handleAmtBChange = (val: string) => {
    setAmtB(val);
    const n = parseFloat(val);
    setAmtA((!isNaN(n) && n > 0) ? (n * priceB / priceA).toFixed(6) : "");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full bg-background rounded-t-2xl border-t border-border p-5 pb-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {/* Token badges */}
            <div className="flex -space-x-2">
              {[pool.base, pool.quote].map((t, i) => (
                <div key={i}
                  className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-bold"
                  style={{ backgroundColor: (i === 0 ? colorA : colorB) + "33", color: i === 0 ? colorA : colorB }}
                >{t[0]}</div>
              ))}
            </div>
            <span className="font-bold text-base">{pool.base}/{pool.quote}</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground text-sm">✕</button>
        </div>

        {mode === "add" ? (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              Both tokens auto-balance using the pool ratio (x·y=k). Enter one amount — the other fills automatically.
            </p>
            {/* Input A */}
            <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3 mb-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{pool.base} amount</span>
                <span className="text-xs text-muted-foreground">≈ ${((parseFloat(amtA)||0)*priceA).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input className="flex-1 bg-transparent text-lg font-bold outline-none"
                  placeholder="0.00" value={amtA}
                  onChange={e => handleAmtAChange(e.target.value)} inputMode="decimal" />
                <div className="px-2 py-1 bg-background border border-border rounded-lg">
                  <span className="text-xs font-bold" style={{ color: colorA }}>{pool.base}</span>
                </div>
              </div>
            </div>
            {/* Ratio connector */}
            <div className="text-center py-1">
              <span className="text-[10px] text-muted-foreground">1 {pool.base} = {(priceA/priceB).toLocaleString(undefined,{maximumFractionDigits:6})} {pool.quote}</span>
            </div>
            {/* Input B */}
            <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3 mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{pool.quote} amount</span>
                <span className="text-xs text-muted-foreground">≈ ${((parseFloat(amtB)||0)*priceB).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input className="flex-1 bg-transparent text-lg font-bold outline-none"
                  placeholder="0.00" value={amtB}
                  onChange={e => handleAmtBChange(e.target.value)} inputMode="decimal" />
                <div className="px-2 py-1 bg-background border border-border rounded-lg">
                  <span className="text-xs font-bold" style={{ color: colorB }}>{pool.quote}</span>
                </div>
              </div>
            </div>
            {/* Info rows */}
            <div className="space-y-2 mb-5">
              {[
                ["Pool fee (per swap)", `${pool.fee}%`],
                ["Fee APR (from vol)", `${feeApr.toFixed(1)}%`],
                ["Farm APR", `+${pool.farmApr.toFixed(1)}%`],
                ["Total APR", totalApr.toFixed(1) + "%"],
                ["You receive", "LP tokens"],
              ].map(([l, v], i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{l}</span>
                  <span className={cn("font-medium", l === "Total APR" ? "text-green-500 font-bold" : "")}>{v}</span>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 bg-orange-500/8 border border-orange-500/20 rounded-xl p-2.5 mb-4">
              <AlertTriangle size={12} className="text-orange-400 mt-0.5 shrink-0" />
              <p className="text-[10px] text-orange-300/80 leading-relaxed">
                <strong>Impermanent loss risk:</strong> If {pool.base} price diverges from {pool.quote}, your withdrawal ratio will differ from your deposit.
              </p>
            </div>
            <button
              disabled={!amtA || !amtB}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-green-600 active:opacity-80 disabled:opacity-40"
            >
              {amtA && amtB ? "Add Liquidity" : "Enter amounts"}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-4">Withdraw your share of the pool. You'll receive both tokens proportionally.</p>
            {/* Percentage slider */}
            <div className="bg-secondary/50 border border-border rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">Remove amount</span>
                <span className="text-2xl font-bold text-primary">{pct}%</span>
              </div>
              <input type="range" min={1} max={100} value={pct}
                onChange={e => setPct(+e.target.value)}
                className="w-full accent-primary" />
              <div className="flex gap-2 mt-3">
                {[25, 50, 75, 100].map(p => (
                  <button key={p} onClick={() => setPct(p)}
                    className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                      pct === p ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground")}>
                    {p === 100 ? "MAX" : `${p}%`}
                  </button>
                ))}
              </div>
            </div>
            {/* Receive info */}
            <div className="space-y-2 mb-5">
              {[
                [`${pool.base} you receive`, receiveA.toFixed(6)],
                [`${pool.quote} you receive`, receiveB.toFixed(pool.quote === "USDT" ? 2 : 6)],
                ["Total value", `$${removeValue.toFixed(2)}`],
              ].map(([l, v], i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{l}</span>
                  <span className={cn("font-semibold", l === "Total value" ? "text-green-400" : "")}>{v}</span>
                </div>
              ))}
            </div>
            <button className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-red-600 active:opacity-80">
              Remove Liquidity
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Pool row card ── */
function PoolCard({ pool, onAdd, onRemove }: {
  pool: typeof POOLS[0];
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colorA   = COIN_COLORS[pool.base]  ?? "#EAB308";
  const colorB   = COIN_COLORS[pool.quote] ?? "#16a34a";
  const totalApr = poolApr(pool) + pool.farmApr;
  const hasPosition = pool.userLp > 0;

  return (
    <div className={cn("border border-border rounded-xl overflow-hidden mb-3",
      hasPosition ? "border-primary/30 bg-primary/3" : "bg-card")}>
      {/* Row header */}
      <button className="w-full flex items-center gap-3 px-4 py-3" onClick={() => setExpanded(e => !e)}>
        {/* Token pair icons */}
        <div className="flex -space-x-2 shrink-0">
          {[pool.base, pool.quote].map((t, i) => (
            <div key={i}
              className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: (i === 0 ? colorA : colorB) + "33", color: i === 0 ? colorA : colorB }}
            >{t[0]}</div>
          ))}
        </div>
        {/* Pair name */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold">{pool.base}/{pool.quote}</span>
            {hasPosition && (
              <span className="text-[9px] px-1.5 py-0.5 bg-primary/20 text-primary rounded font-bold">MY POS</span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">{pool.fee}% fee · BSV Chain</span>
        </div>
        {/* APR */}
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-green-500">{totalApr.toFixed(1)}% APR</div>
          <div className="text-[10px] text-muted-foreground">{fmtTvl(pool.tvl)} TVL</div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground shrink-0" />
          : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50 pt-3">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              ["Fee APR", `${poolApr(pool).toFixed(1)}%`, "text-green-500"],
              ["Farm APR", `+${pool.farmApr.toFixed(1)}%`, "text-green-500"],
              ["24h Vol", fmtTvl(pool.vol24), "text-foreground"],
            ].map(([label, val, cls]) => (
              <div key={label} className="bg-secondary/40 rounded-lg p-2 text-center">
                <div className={cn("text-sm font-bold", cls)}>{val}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {hasPosition && (
            <div className="bg-primary/8 border border-primary/20 rounded-lg p-3 mb-3">
              <div className="text-[10px] text-muted-foreground mb-1">Your LP tokens</div>
              <div className="text-base font-bold">{pool.userLp.toFixed(4)} LP</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">≈ ${(pool.userLp * 12.5).toLocaleString()}</div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onAdd}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold active:opacity-80">
              <Plus size={14} /> Add
            </button>
            {hasPosition && (
              <button onClick={onRemove}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm font-medium active:opacity-80">
                <Minus size={14} /> Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── My Positions tab ── */
function MyPositions({ onAdd, onRemove }: { onAdd: (p: typeof POOLS[0]) => void; onRemove: (p: typeof POOLS[0]) => void }) {
  const myPools = POOLS.filter(p => p.userLp > 0);
  if (!myPools.length) return (
    <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
      <Droplets size={40} className="text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">No liquidity positions yet.<br />Add liquidity to a pool to get started.</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {myPools.map(pool => {
        const colorA = COIN_COLORS[pool.base] ?? "#EAB308";
        const colorB = COIN_COLORS[pool.quote] ?? "#16a34a";
        return (
          <div key={pool.id} className="bg-card border border-primary/25 rounded-xl p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="flex -space-x-2">
                {[pool.base, pool.quote].map((t, i) => (
                  <div key={i} className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-bold"
                    style={{ backgroundColor: (i === 0 ? colorA : colorB) + "33", color: i === 0 ? colorA : colorB }}>{t[0]}</div>
                ))}
              </div>
              <span className="font-bold text-sm">{pool.base}/{pool.quote}</span>
              <span className="ml-auto text-[10px] px-2 py-0.5 bg-green-500/15 text-green-500 rounded-full font-bold">
                {(poolApr(pool) + pool.farmApr).toFixed(1)}% APR
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                ["LP Tokens", `${pool.userLp.toFixed(4)}`],
                ["Est. Value", `$${(pool.userLp * 12.5).toLocaleString()}`],
                ["Pool Share", `${((pool.userLp * 12.5) / pool.tvl * 100).toFixed(4)}%`],
                ["Fees Earned (24h)", `$${(pool.vol24 * (pool.fee / 100) * ((pool.userLp * 12.5) / pool.tvl)).toFixed(2)}`],
              ].map(([l, v]) => (
                <div key={l} className="bg-secondary/40 rounded-lg p-2">
                  <div className="text-[10px] text-muted-foreground">{l}</div>
                  <div className="text-sm font-semibold mt-0.5">{v}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => onAdd(pool)} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold">Add</button>
              <button onClick={() => onRemove(pool)} className="flex-1 py-2.5 rounded-xl bg-secondary border border-border text-sm font-medium">Remove</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Farming tab ── */
function Farming() {
  return (
    <div className="space-y-3">
      {/* Info banner */}
      <div className="bg-green-500/10 border border-green-500/25 rounded-xl p-3 flex gap-3">
        <Zap size={18} className="text-green-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-green-400">Yield Farming Active</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Stake your LP tokens to earn additional OrahDEX rewards on top of pool fees.</p>
        </div>
      </div>

      {/* Market-maker rebate card */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-primary" />
          <span className="font-bold text-sm">Market Maker Rebates</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 bg-primary/15 text-primary rounded font-bold">NEW</span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">Place limit orders within 1% of mid-price and earn fee rebates. The tighter your spread, the higher your rebate.</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            ["Rebate Tier 1", "0.01%", "Within 1%"],
            ["Rebate Tier 2", "0.05%", "Within 0.5%"],
            ["Rebate Tier 3", "0.10%", "Within 0.1%"],
          ].map(([t, r, c]) => (
            <div key={t} className="bg-secondary/40 rounded-lg p-2 text-center">
              <div className="text-xs font-bold text-green-500">{r}</div>
              <div className="text-[9px] text-muted-foreground mt-0.5">{c}</div>
              <div className="text-[8px] text-muted-foreground">{t}</div>
            </div>
          ))}
        </div>
        <button className="w-full py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-bold">
          Go to Trade → Place Limit Orders
        </button>
      </div>

      {/* Farm positions */}
      {FARM_POOLS.length > 0 && (
        <>
          <p className="text-xs font-bold text-muted-foreground px-1">Your Farming Positions</p>
          {FARM_POOLS.map(fp => {
            const colorA = COIN_COLORS[fp.base] ?? "#EAB308";
            const colorB = COIN_COLORS[fp.quote] ?? "#16a34a";
            return (
              <div key={fp.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex -space-x-2">
                    {[fp.base, fp.quote].map((t, i) => (
                      <div key={i} className="w-6 h-6 rounded-full border-2 border-background flex items-center justify-center text-[8px] font-bold"
                        style={{ backgroundColor: (i === 0 ? colorA : colorB) + "33", color: i === 0 ? colorA : colorB }}>{t[0]}</div>
                    ))}
                  </div>
                  <span className="font-semibold text-sm">{fp.base}/{fp.quote}</span>
                  <span className="ml-auto text-xs font-bold text-green-400">+{fp.farmApr}% farm APR</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    ["Staked LP", fp.staked.toFixed(2)],
                    ["Unstaked LP", fp.unstaked.toFixed(2)],
                    ["Earned (BSV)", fp.earned.toFixed(4)],
                  ].map(([l, v]) => (
                    <div key={l} className="bg-secondary/40 rounded-lg p-2">
                      <div className="text-[10px] text-muted-foreground">{l}</div>
                      <div className="text-xs font-semibold mt-0.5">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 py-2 rounded-xl bg-green-500 text-black text-xs font-bold">Stake More</button>
                  <button className="flex-1 py-2 rounded-xl bg-green-600 text-white text-xs font-bold">Harvest</button>
                  <button className="flex-1 py-2 rounded-xl bg-secondary border border-border text-xs font-medium">Unstake</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {FARM_POOLS.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-center gap-3">
          <Award size={36} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No farming positions yet.<br />Add liquidity first, then stake your LP tokens.</p>
        </div>
      )}
    </div>
  );
}

/* ── Main component ── */
export function MobileLiquidity() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<MainTab>("pools");
  const [sortBy, setSortBy] = useState<"apr" | "tvl" | "vol">("tvl");
  const [modalPool, setModalPool] = useState<typeof POOLS[0] | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "remove">("add");

  const openAdd = (p: typeof POOLS[0]) => { setModalPool(p); setModalMode("add"); };
  const openRemove = (p: typeof POOLS[0]) => { setModalPool(p); setModalMode("remove"); };

  const sorted = [...POOLS].sort((a, b) =>
    sortBy === "apr" ? (poolApr(b) + b.farmApr) - (poolApr(a) + a.farmApr)
    : sortBy === "tvl" ? b.tvl - a.tvl
    : b.vol24 - a.vol24
  );

  const totalTvl = POOLS.reduce((s, p) => s + p.tvl, 0);
  const myPools = POOLS.filter(p => p.userLp > 0);

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => navigate("/dex")} className="p-1 text-muted-foreground">
            <ArrowLeft size={18} />
          </button>
          <Droplets size={18} className="text-primary" />
          <span className="text-base font-bold">Liquidity Pools</span>
        </div>
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Total TVL", fmtTvl(totalTvl)],
            ["Your Pools", `${myPools.length}`],
            ["Best APR", `${Math.max(...POOLS.map(p => poolApr(p) + p.farmApr)).toFixed(1)}%`],
          ].map(([l, v]) => (
            <div key={l} className="bg-secondary/40 rounded-xl p-2.5 text-center">
              <div className="text-[11px] text-muted-foreground">{l}</div>
              <div className="text-sm font-bold mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-border">
        {(["pools", "positions", "farming"] as MainTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex-1 py-3 text-[12px] font-semibold capitalize relative transition-colors",
              tab === t ? "text-foreground" : "text-muted-foreground")}>
            {t === "positions" ? "My Positions" : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "positions" && myPools.length > 0 && (
              <span className="ml-1 text-[9px] px-1.5 py-0.5 bg-primary rounded-full text-white font-bold">{myPools.length}</span>
            )}
            {tab === t && <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-primary rounded-full" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-24">
        {tab === "pools" && (
          <>
            {/* Sort controls */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground">Sort:</span>
              {(["tvl", "apr", "vol"] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)}
                  className={cn("px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                    sortBy === s ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground")}>
                  {s === "vol" ? "Volume" : s.toUpperCase()}
                </button>
              ))}
            </div>
            {sorted.map(pool => (
              <PoolCard key={pool.id} pool={pool} onAdd={() => openAdd(pool)} onRemove={() => openRemove(pool)} />
            ))}
          </>
        )}
        {tab === "positions" && <MyPositions onAdd={openAdd} onRemove={openRemove} />}
        {tab === "farming" && <Farming />}
      </div>

      {/* Modal */}
      {modalPool && (
        <LiquidityModal pool={modalPool} mode={modalMode} onClose={() => setModalPool(null)} />
      )}
    </div>
  );
}
