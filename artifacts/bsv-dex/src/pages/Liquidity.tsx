import { useState } from "react";
import {
  Droplets, Plus, Minus, TrendingUp, ChevronDown, ChevronUp,
  Zap, Award, BarChart3, X, Info, Layers
} from "lucide-react";
import { cn } from "@/lib/utils";

const POOLS = [
  { id: "btc-usdt",  base: "BTC",  quote: "USDT", tvl: 423_600_000, vol24: 98_200_000,  apr: 12.3,  farmApr: 4.2,  fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "eth-usdt",  base: "ETH",  quote: "USDT", tvl: 187_400_000, vol24: 44_100_000,  apr: 15.7,  farmApr: 6.1,  fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "sol-usdt",  base: "SOL",  quote: "USDT", tvl: 95_700_000,  vol24: 21_300_000,  apr: 22.1,  farmApr: 8.4,  fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "bsv-usdt",  base: "BSV",  quote: "USDT", tvl: 8_240_000,   vol24: 1_920_000,   apr: 47.5,  farmApr: 18.2, fee: 0.2,  userLp: 1240.5, chain: "BSV" },
  { id: "bnb-usdt",  base: "BNB",  quote: "USDT", tvl: 67_300_000,  vol24: 14_800_000,  apr: 18.4,  farmApr: 5.9,  fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "xrp-usdt",  base: "XRP",  quote: "USDT", tvl: 52_100_000,  vol24: 12_700_000,  apr: 19.8,  farmApr: 7.3,  fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "ada-usdt",  base: "ADA",  quote: "USDT", tvl: 29_800_000,  vol24: 6_400_000,   apr: 24.6,  farmApr: 9.1,  fee: 0.3,  userLp: 640.0,  chain: "BSV" },
  { id: "doge-usdt", base: "DOGE", quote: "USDT", tvl: 41_200_000,  vol24: 9_300_000,   apr: 21.3,  farmApr: 7.8,  fee: 0.25, userLp: 0,      chain: "BSV" },
  { id: "dot-usdt",  base: "DOT",  quote: "USDT", tvl: 18_600_000,  vol24: 3_900_000,   apr: 28.7,  farmApr: 11.2, fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "link-usdt", base: "LINK", quote: "USDT", tvl: 22_900_000,  vol24: 5_100_000,   apr: 26.4,  farmApr: 10.1, fee: 0.3,  userLp: 0,      chain: "BSV" },
  { id: "bsv-btc",   base: "BSV",  quote: "BTC",  tvl: 4_100_000,   vol24: 980_000,     apr: 55.2,  farmApr: 22.8, fee: 0.2,  userLp: 320.0,  chain: "BSV" },
  { id: "eth-btc",   base: "ETH",  quote: "BTC",  tvl: 76_500_000,  vol24: 17_200_000,  apr: 14.1,  farmApr: 5.3,  fee: 0.3,  userLp: 0,      chain: "BSV" },
];

const COIN_COLORS: Record<string, string> = {
  BTC: "#F97316", ETH: "#8B5CF6", SOL: "#06B6D4", BSV: "#EAB308",
  BNB: "#EAB308", XRP: "#3B82F6", ADA: "#2563EB", DOGE: "#EAB308",
  DOT: "#EC4899", LINK: "#3B82F6",
};

function fmtTvl(n: number) {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

type Tab = "pools" | "positions" | "farming";

function TokenPair({ base, quote }: { base: string; quote: string }) {
  const cA = COIN_COLORS[base] ?? "#EAB308";
  const cB = COIN_COLORS[quote] ?? "#16a34a";
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {[base, quote].map((t, i) => (
          <div key={i} className="w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-bold"
            style={{ backgroundColor: (i === 0 ? cA : cB) + "33", color: i === 0 ? cA : cB }}>{t[0]}</div>
        ))}
      </div>
      <div>
        <span className="text-sm font-bold">{base}/{quote}</span>
      </div>
    </div>
  );
}

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

  const colorA = COIN_COLORS[pool.base] ?? "#EAB308";
  const colorB = COIN_COLORS[pool.quote] ?? "#16a34a";
  const totalApr = pool.apr + pool.farmApr;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-background rounded-2xl border border-border shadow-2xl p-6"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {[pool.base, pool.quote].map((t, i) => (
                <div key={i} className="w-9 h-9 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: (i === 0 ? colorA : colorB) + "33", color: i === 0 ? colorA : colorB }}>{t[0]}</div>
              ))}
            </div>
            <div>
              <div className="font-bold text-base">{pool.base}/{pool.quote}</div>
              <div className="text-xs text-muted-foreground">{pool.fee}% pool fee</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X size={18} />
          </button>
        </div>

        {mode === "add" ? (
          <>
            <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3 mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{pool.base} amount</span>
                <span className="text-xs text-muted-foreground">Balance: 0.00</span>
              </div>
              <div className="flex items-center gap-2">
                <input className="flex-1 bg-transparent text-xl font-bold outline-none"
                  placeholder="0.00" value={amtA} onChange={e => setAmtA(e.target.value)} />
                <button className="text-xs text-primary font-bold px-2 py-1 hover:bg-primary/10 rounded-lg transition-colors">MAX</button>
                <div className="px-2.5 py-1.5 bg-background border border-border rounded-lg">
                  <span className="text-sm font-bold" style={{ color: colorA }}>{pool.base}</span>
                </div>
              </div>
            </div>
            <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3 mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{pool.quote} amount</span>
                <span className="text-xs text-muted-foreground">Balance: 0.00</span>
              </div>
              <div className="flex items-center gap-2">
                <input className="flex-1 bg-transparent text-xl font-bold outline-none"
                  placeholder="0.00" value={amtB} onChange={e => setAmtB(e.target.value)} />
                <button className="text-xs text-primary font-bold px-2 py-1 hover:bg-primary/10 rounded-lg transition-colors">MAX</button>
                <div className="px-2.5 py-1.5 bg-background border border-border rounded-lg">
                  <span className="text-sm font-bold" style={{ color: colorB }}>{pool.quote}</span>
                </div>
              </div>
            </div>
            <div className="bg-secondary/30 rounded-xl p-3 mb-4 space-y-2">
              {[
                ["Pool fee", `${pool.fee}%`],
                ["Pool APR", `${pool.apr.toFixed(1)}%`],
                ["Farm APR", `+${pool.farmApr.toFixed(1)}%`],
                ["Total APR", `${totalApr.toFixed(1)}%`],
                ["You receive", "LP tokens"],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{l}</span>
                  <span className={cn("font-semibold", l === "Total APR" ? "text-green-500" : "")}>{v}</span>
                </div>
              ))}
            </div>
            <button className="w-full py-3.5 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 transition-colors">
              Add Liquidity
            </button>
          </>
        ) : (
          <>
            <div className="bg-secondary/50 border border-border rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">Remove amount</span>
                <span className="text-3xl font-bold text-primary">{pct}%</span>
              </div>
              <input type="range" min={1} max={100} value={pct}
                onChange={e => setPct(+e.target.value)}
                className="w-full accent-primary mb-3" />
              <div className="flex gap-2">
                {[25, 50, 75, 100].map(p => (
                  <button key={p} onClick={() => setPct(p)}
                    className={cn("flex-1 py-1.5 rounded-lg text-sm font-bold border transition-colors",
                      pct === p ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                    {p === 100 ? "MAX" : `${p}%`}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-secondary/30 rounded-xl p-3 mb-4 space-y-2">
              {[
                [`${pool.base} you receive`, `${(pool.userLp * 0.01 * pct * 0.5).toFixed(6)}`],
                [`${pool.quote} you receive`, `${(pool.userLp * 0.01 * pct * 0.5 * 43000).toFixed(2)}`],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{l}</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
            </div>
            <button className="w-full py-3.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors">
              Remove Liquidity
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function Liquidity() {
  const [tab, setTab] = useState<Tab>("pools");
  const [sortBy, setSortBy] = useState<"apr" | "tvl" | "vol">("tvl");
  const [modalPool, setModalPool] = useState<typeof POOLS[0] | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "remove">("add");

  const openAdd = (p: typeof POOLS[0]) => { setModalPool(p); setModalMode("add"); };
  const openRemove = (p: typeof POOLS[0]) => { setModalPool(p); setModalMode("remove"); };

  const sorted = [...POOLS].sort((a, b) =>
    sortBy === "apr" ? (b.apr + b.farmApr) - (a.apr + a.farmApr)
    : sortBy === "tvl" ? b.tvl - a.tvl
    : b.vol24 - a.vol24
  );

  const totalTvl = POOLS.reduce((s, p) => s + p.tvl, 0);
  const myPools = POOLS.filter(p => p.userLp > 0);

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Droplets size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Liquidity Pools</h1>
            <p className="text-sm text-muted-foreground">Provide liquidity and earn fees + farming rewards</p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          ["Total Value Locked", fmtTvl(totalTvl), "text-foreground"],
          ["Total Pools", `${POOLS.length}`, "text-foreground"],
          ["Your Positions", `${myPools.length}`, "text-primary"],
          ["Best Pool APR", `${Math.max(...POOLS.map(p => p.apr + p.farmApr)).toFixed(1)}%`, "text-green-500"],
        ].map(([l, v, cls]) => (
          <div key={l} className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">{l}</div>
            <div className={cn("text-2xl font-bold", cls)}>{v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-border">
        {(["pools", "positions", "farming"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-5 py-2.5 text-sm font-semibold capitalize relative transition-colors",
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t === "positions" ? "My Positions" : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "positions" && myPools.length > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-primary rounded-full text-white font-bold">{myPools.length}</span>
            )}
            {tab === t && <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-t-full" />}
          </button>
        ))}
      </div>

      {tab === "pools" && (
        <>
          {/* Sort + filter */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-muted-foreground">Sort by:</span>
            {(["tvl", "apr", "vol"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={cn("px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
                  sortBy === s ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
                {s === "vol" ? "Volume" : s.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground">
              <span>Pool</span>
              <span className="text-right">TVL</span>
              <span className="text-right">24h Volume</span>
              <span className="text-right">Pool APR</span>
              <span className="text-right">Farm APR</span>
              <span className="text-right">Fee</span>
              <span className="text-right">Action</span>
            </div>
            {sorted.map((pool, i) => {
              const hasPos = pool.userLp > 0;
              return (
                <div key={pool.id}
                  className={cn("grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3.5 items-center border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors",
                    hasPos ? "bg-primary/3" : "")}>
                  <div className="flex items-center gap-2">
                    <TokenPair base={pool.base} quote={pool.quote} />
                    {hasPos && <span className="text-[9px] px-1.5 py-0.5 bg-primary/20 text-primary rounded font-bold">MY POS</span>}
                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{pool.fee}% fee</span>
                  </div>
                  <span className="text-right text-sm font-semibold">{fmtTvl(pool.tvl)}</span>
                  <span className="text-right text-sm">{fmtTvl(pool.vol24)}</span>
                  <span className="text-right text-sm font-bold text-green-500">{pool.apr.toFixed(1)}%</span>
                  <span className="text-right text-sm font-bold text-amber-500">+{pool.farmApr.toFixed(1)}%</span>
                  <span className="text-right text-sm text-muted-foreground">{pool.fee}%</span>
                  <div className="flex items-center gap-1.5 justify-end">
                    <button onClick={() => openAdd(pool)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors">
                      <Plus size={12} /> Add
                    </button>
                    {hasPos && (
                      <button onClick={() => openRemove(pool)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-secondary border border-border hover:border-primary/30 text-xs font-medium transition-colors">
                        <Minus size={12} /> Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "positions" && (
        <div>
          {myPools.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Droplets size={48} className="text-muted-foreground/30" />
              <p className="text-muted-foreground">No liquidity positions yet. Add liquidity to a pool to get started.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground">
                <span>Pool</span><span className="text-right">LP Tokens</span>
                <span className="text-right">Est. Value</span><span className="text-right">Pool Share</span>
                <span className="text-right">Fees Earned</span><span className="text-right">Action</span>
              </div>
              {myPools.map(pool => (
                <div key={pool.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3.5 items-center border-b border-border/50 last:border-0">
                  <TokenPair base={pool.base} quote={pool.quote} />
                  <span className="text-right text-sm font-semibold">{pool.userLp.toFixed(4)}</span>
                  <span className="text-right text-sm">${(pool.userLp * 12.5).toLocaleString()}</span>
                  <span className="text-right text-sm text-muted-foreground">0.003%</span>
                  <span className="text-right text-sm text-green-500 font-semibold">${(pool.vol24 * pool.fee / 100 * 0.003).toFixed(2)}</span>
                  <div className="flex items-center gap-1.5 justify-end">
                    <button onClick={() => openAdd(pool)} className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors">Add</button>
                    <button onClick={() => openRemove(pool)} className="px-2.5 py-1.5 rounded-lg bg-secondary border border-border hover:border-primary/30 text-xs transition-colors">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "farming" && (
        <div className="grid grid-cols-3 gap-6">
          {/* Left: Market Maker Rebates */}
          <div className="col-span-1 space-y-4">
            <div className="bg-card border border-amber-500/25 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={18} className="text-amber-400" />
                <span className="font-bold">Market Maker Rebates</span>
                <span className="ml-auto text-[10px] px-2 py-0.5 bg-primary/15 text-primary rounded font-bold">NEW</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Place limit orders within mid-price range to earn fee rebates. The tighter your spread, the higher the rebate.</p>
              <div className="space-y-2 mb-4">
                {[
                  ["Within 1.0%", "0.01% rebate", "Tier 1"],
                  ["Within 0.5%", "0.05% rebate", "Tier 2"],
                  ["Within 0.1%", "0.10% rebate", "Tier 3"],
                ].map(([spread, rebate, tier]) => (
                  <div key={tier} className="flex items-center justify-between bg-secondary/40 rounded-lg p-2.5">
                    <div>
                      <div className="text-xs font-bold text-green-500">{rebate}</div>
                      <div className="text-[10px] text-muted-foreground">{spread} · {tier}</div>
                    </div>
                    <Award size={16} className="text-amber-400" />
                  </div>
                ))}
              </div>
              <a href="/trade/BTC-USDT" className="block w-full py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-bold text-center hover:bg-primary/20 transition-colors">
                Go to Trade
              </a>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={18} className="text-primary" />
                <span className="font-bold">BSV Staking</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Stake native BSV to earn platform revenue share. Minimum 100 BSV.</p>
              {[
                ["30-day lock", "8.5% APR"],
                ["90-day lock", "14.2% APR"],
                ["180-day lock", "22.7% APR"],
              ].map(([lock, apr]) => (
                <div key={lock} className="flex justify-between items-center bg-secondary/40 rounded-lg px-3 py-2.5 mb-2">
                  <span className="text-xs text-muted-foreground">{lock}</span>
                  <span className="text-sm font-bold text-green-500">{apr}</span>
                </div>
              ))}
              <button className="w-full py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-bold mt-2 hover:bg-primary/20 transition-colors">
                Stake BSV
              </button>
            </div>
          </div>

          {/* Right: Farm pools */}
          <div className="col-span-2">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-bold">LP Token Farming</h3>
                <p className="text-xs text-muted-foreground mt-1">Stake your LP tokens to earn additional OrahDEX rewards on top of pool fees.</p>
              </div>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-border text-xs font-semibold text-muted-foreground">
                <span>Pool</span><span className="text-right">Pool APR</span>
                <span className="text-right">Farm APR</span><span className="text-right">Total APR</span>
                <span className="text-right">Your LP</span><span className="text-right">Action</span>
              </div>
              {POOLS.map(pool => (
                <div key={pool.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3.5 items-center border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors">
                  <TokenPair base={pool.base} quote={pool.quote} />
                  <span className="text-right text-sm font-semibold text-green-500">{pool.apr.toFixed(1)}%</span>
                  <span className="text-right text-sm font-semibold text-amber-500">+{pool.farmApr.toFixed(1)}%</span>
                  <span className="text-right text-sm font-bold text-green-400">{(pool.apr + pool.farmApr).toFixed(1)}%</span>
                  <span className="text-right text-sm">{pool.userLp > 0 ? pool.userLp.toFixed(2) : "—"}</span>
                  <div className="flex gap-1.5 justify-end">
                    {pool.userLp > 0 ? (
                      <>
                        <button className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold transition-colors">Stake</button>
                        <button className="px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors">Harvest</button>
                      </>
                    ) : (
                      <button onClick={() => openAdd(pool)} className="px-2.5 py-1.5 rounded-lg bg-secondary border border-border hover:border-primary/30 text-xs transition-colors">Add LP</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalPool && (
        <LiquidityModal pool={modalPool} mode={modalMode} onClose={() => setModalPool(null)} />
      )}
    </div>
  );
}
