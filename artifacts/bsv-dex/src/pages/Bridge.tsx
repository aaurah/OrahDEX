import { useState, useMemo } from "react";
import { useSEO } from "@/hooks/useSEO";
import {
  ArrowRight, ArrowLeftRight, ChevronDown, Shield, Zap, Clock,
  AlertTriangle, CheckCircle2, Lock, Unlock, RefreshCw, Info,
  Layers, Link2, Globe
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetMarkets } from "@workspace/api-client-react";

// ─── Chain / Token definitions ────────────────────────────────────────────────

type Layer = "L1" | "L2" | "L3";
type SwapMode = "htlc" | "wrapped";

interface Chain {
  id: string;
  name: string;
  layer: Layer;
  color: string;
  bgColor: string;
  icon: string;
  tokens: string[];
  desc: string;
}

const CHAINS: Chain[] = [
  { id: "bsv",  name: "BSV",       layer: "L1", color: "text-green-400",  bgColor: "bg-green-500/15 border-green-500/30",  icon: "₿", tokens: ["BSV","USDT"],                desc: "Bitcoin SV — fastest settlement" },
  { id: "btc",  name: "Bitcoin",   layer: "L1", color: "text-orange-400", bgColor: "bg-orange-500/15 border-orange-500/30", icon: "₿", tokens: ["BTC"],                         desc: "Bitcoin — base layer security" },
  { id: "eth",  name: "Ethereum",  layer: "L1", color: "text-violet-400", bgColor: "bg-violet-500/15 border-violet-500/30", icon: "⬡", tokens: ["ETH","USDC","USDT","WBTC"],    desc: "Ethereum — smart contract L1" },
  { id: "sol",  name: "Solana",    layer: "L1", color: "text-cyan-400",   bgColor: "bg-cyan-500/15 border-cyan-500/30",    icon: "◎", tokens: ["SOL","USDC","BONK"],            desc: "Solana — high-throughput L1" },
  { id: "arb",  name: "Arbitrum",  layer: "L2", color: "text-sky-400",    bgColor: "bg-sky-500/15 border-sky-500/30",      icon: "⬡", tokens: ["ETH","ARB","USDC","USDT"],     desc: "Arbitrum — Ethereum L2 rollup" },
  { id: "op",   name: "Optimism",  layer: "L2", color: "text-red-400",    bgColor: "bg-red-500/15 border-red-500/30",      icon: "⬡", tokens: ["ETH","OP","USDC","USDT"],      desc: "Optimism — OP Stack L2" },
  { id: "base", name: "Base",      layer: "L2", color: "text-blue-400",   bgColor: "bg-blue-500/15 border-blue-500/30",    icon: "⬡", tokens: ["ETH","USDC","CBBTC"],          desc: "Base — Coinbase L2" },
  { id: "poly", name: "Polygon",   layer: "L2", color: "text-purple-400", bgColor: "bg-purple-500/15 border-purple-500/30",icon: "⬡", tokens: ["MATIC","ETH","USDC","USDT"],  desc: "Polygon — EVM L2 sidechain" },
];

const SPOT_PRICES: Record<string, number> = {
  BSV: 68, BTC: 67420, ETH: 3510, SOL: 172, USDT: 1, USDC: 1,
  ARB: 1.2, OP: 2.1, MATIC: 0.7, CBBTC: 67420, WBTC: 67420, BONK: 0.000022,
};

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 2.0];

// ─── Route step component ─────────────────────────────────────────────────────

function RouteStep({ icon, label, detail, active, done }: {
  icon: React.ReactNode; label: string; detail: string;
  active?: boolean; done?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-start gap-2.5 p-2.5 rounded-xl border transition-all",
      done   ? "border-green-500/30 bg-green-500/5" :
      active ? "border-primary/40 bg-primary/5" :
               "border-border bg-secondary/20 opacity-50"
    )}>
      <div className={cn(
        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
        done ? "bg-green-500/20 text-green-400" :
        active ? "bg-primary/20 text-primary" :
                 "bg-muted/40 text-muted-foreground"
      )}>
        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : icon}
      </div>
      <div className="min-w-0">
        <div className={cn("text-xs font-semibold leading-tight",
          done ? "text-green-400" : active ? "text-foreground" : "text-muted-foreground"
        )}>{label}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{detail}</div>
      </div>
    </div>
  );
}

// ─── Chain selector ───────────────────────────────────────────────────────────

function ChainSelect({ value, onChange, exclude }: {
  value: Chain; onChange: (c: Chain) => void; exclude?: string;
}) {
  const [open, setOpen] = useState(false);
  const layers: Layer[] = ["L1", "L2"];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border w-full transition-all hover:border-primary/50",
          value.bgColor
        )}
      >
        <span className={cn("text-xl font-black leading-none", value.color)}>{value.icon}</span>
        <div className="flex-1 text-left min-w-0">
          <div className="font-bold text-sm text-foreground leading-tight">{value.name}</div>
          <div className="text-[10px] text-muted-foreground">{value.layer} · {value.desc.split("—")[1]?.trim()}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded border",
            value.layer === "L1" ? "text-green-400 border-green-500/30 bg-green-500/10" :
            "text-sky-400 border-sky-500/30 bg-sky-500/10"
          )}>{value.layer}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-2 left-0 right-0 z-40 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
            {layers.map(layer => (
              <div key={layer}>
                <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50 bg-secondary/30">
                  {layer === "L1" ? "Layer 1 — Base Security" : "Layer 2 — Scaling"}
                </div>
                {CHAINS.filter(c => c.layer === layer && c.id !== exclude).map(c => (
                  <button
                    key={c.id}
                    onClick={() => { onChange(c); setOpen(false); }}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 w-full text-left hover:bg-primary/5 transition-colors",
                      c.id === value.id && "bg-primary/10"
                    )}
                  >
                    <span className={cn("text-lg font-black leading-none w-5 text-center", c.color)}>{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.desc.split("—")[1]?.trim()}</div>
                    </div>
                    <div className="flex gap-1 text-[9px]">
                      {c.tokens.slice(0, 3).map(t => (
                        <span key={t} className="px-1 py-0.5 rounded bg-secondary border border-border font-mono text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function BridgePage() {
  useSEO({
    title: "Cross-Chain Bridge — Swap BSV, BTC, ETH, SOL across L1 & L2",
    description: "Cross-chain swap between BSV, BTC, Ethereum, Solana and L2 networks. Atomic HTLC swaps and wrapped asset bridging with BSV on-chain settlement.",
    keywords: "cross-chain bridge, atomic swap, HTLC, BSV bridge, BTC ETH swap, L1 L2 bridge, OrahDEX bridge",
    url: "/bridge",
  });

  const [fromChain, setFromChain] = useState<Chain>(CHAINS[0]);
  const [toChain, setToChain]     = useState<Chain>(CHAINS[2]);
  const [fromToken, setFromToken] = useState("BSV");
  const [toToken, setToToken]     = useState("ETH");
  const [amount, setAmount]       = useState("");
  const [slippage, setSlippage]   = useState(0.5);
  const [customSlip, setCustomSlip] = useState("");
  const [mode, setMode]           = useState<SwapMode>("wrapped");
  const [simStep, setSimStep]     = useState(0);
  const [simRunning, setSimRunning] = useState(false);

  const { data: markets } = useGetMarkets();

  const fromPrice = SPOT_PRICES[fromToken] ?? 1;
  const toPrice   = SPOT_PRICES[toToken]   ?? 1;

  const outputAmount = useMemo(() => {
    const n = parseFloat(amount || "0");
    if (!n || !toPrice) return 0;
    return (n * fromPrice) / toPrice;
  }, [amount, fromPrice, toPrice]);

  const minReceived = useMemo(() =>
    outputAmount * (1 - slippage / 100),
  [outputAmount, slippage]);

  const feeUsd = useMemo(() => {
    const n = parseFloat(amount || "0");
    if (!n) return 0;
    const bridgeFee = mode === "htlc" ? 0 : 0.003;
    const networkFee = 0.0005;
    return n * fromPrice * (bridgeFee + networkFee);
  }, [amount, fromPrice, mode]);

  const isSameChain = fromChain.id === toChain.id;
  const isCrossLayer = fromChain.layer !== toChain.layer;

  const htlcTime = mode === "htlc" ? "~5–30 min" : "~30–60 sec";

  const routeSteps = useMemo(() => {
    if (mode === "htlc") {
      return [
        { icon: <Lock className="w-3.5 h-3.5" />, label: `Lock ${fromToken} on ${fromChain.name}`, detail: `HTLC script locks funds with secret hash H` },
        { icon: <Link2 className="w-3.5 h-3.5" />, label: `Counterparty locks ${toToken} on ${toChain.name}`, detail: `Same hash H used on destination chain` },
        { icon: <Unlock className="w-3.5 h-3.5" />, label: "Reveal preimage to unlock", detail: `Secret S reveals on ${toChain.name} first, then ${fromChain.name}` },
        { icon: <Zap className="w-3.5 h-3.5" />, label: "BSV Settlement", detail: "Swap hash recorded on BSV chain via OP_RETURN" },
      ];
    }
    return [
      { icon: <Lock className="w-3.5 h-3.5" />,   label: `Lock ${fromToken} on ${fromChain.name}`, detail: `Custodial bridge or multi-sig vault secures original asset` },
      { icon: <Layers className="w-3.5 h-3.5" />, label: `Mint wrapped${fromToken} on EVM`, detail: `1:1 representation minted on Ethereum/L2` },
      { icon: <ArrowLeftRight className="w-3.5 h-3.5" />, label: `Swap w${fromToken} → ${toToken} on AMM`, detail: `OrahDEX AMM pools with 0.3% fee` },
      { icon: <Globe className="w-3.5 h-3.5" />,  label: `Redeem ${toToken} on ${toChain.name}`, detail: `Burn wrapped token → release native asset` },
    ];
  }, [mode, fromChain, toChain, fromToken, toToken]);

  const handleSwapChains = () => {
    const fc = fromChain, tc = toChain, ft = fromToken, tt = toToken;
    setFromChain(tc); setToChain(fc); setFromToken(tt); setToToken(ft);
  };

  const handleSimulate = () => {
    if (simRunning) return;
    setSimStep(0);
    setSimRunning(true);
    const steps = routeSteps.length;
    let s = 0;
    const tick = () => {
      s++;
      setSimStep(s);
      if (s < steps) setTimeout(tick, 900);
      else setSimRunning(false);
    };
    setTimeout(tick, 600);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-8 w-full">

      {/* ── Header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="w-5 h-5 text-primary" />
          <span className="text-primary font-semibold text-sm uppercase tracking-widest">Cross-Chain Bridge</span>
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mb-2">
          Swap Across Any Chain
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Move assets between L1 chains (BSV, BTC, ETH, SOL) and L2 rollups (Arbitrum, Optimism, Base) via atomic HTLC swaps or wrapped asset bridging. Every trade settles on BSV.
        </p>
      </div>

      {/* ── L1/L2/L3 Architecture strip ── */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          {
            layer: "L1", title: "Base Security", icon: Shield, color: "text-green-400",
            bg: "from-green-500/5 to-green-500/10 border-green-500/20",
            items: ["BSV · BTC · ETH · SOL", "Final settlement", "HTLC scripts"],
          },
          {
            layer: "L2", title: "Scaling", icon: Zap, color: "text-sky-400",
            bg: "from-sky-500/5 to-sky-500/10 border-sky-500/20",
            items: ["Arbitrum · Optimism · Base", "Cheap fast execution", "Rollup proofs"],
          },
          {
            layer: "L3", title: "OrahDEX Router", icon: Layers, color: "text-primary",
            bg: "from-primary/5 to-primary/10 border-primary/20",
            items: ["Smart routing engine", "Fee & rewards", "Cross-chain settlement"],
          },
        ].map(({ layer, title, icon: Icon, color, bg, items }) => (
          <div key={layer} className={cn("rounded-2xl border bg-gradient-to-br p-4", bg)}>
            <div className="flex items-center gap-2 mb-3">
              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center bg-background/60", color)}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className={cn("text-[10px] font-black uppercase tracking-wider", color)}>{layer}</div>
                <div className="text-xs font-semibold text-foreground leading-tight">{title}</div>
              </div>
            </div>
            <ul className="space-y-1">
              {items.map(item => (
                <li key={item} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <span className={cn("w-1 h-1 rounded-full shrink-0", color.replace("text-", "bg-"))} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">

        {/* ── Left: Swap form ── */}
        <div className="space-y-4">

          {/* Mode toggle */}
          <div className="flex gap-2 p-1 bg-secondary rounded-xl">
            {(["wrapped", "htlc"] as SwapMode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setSimStep(0); }}
                className={cn(
                  "flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2",
                  mode === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "wrapped" ? (
                  <><Layers className="w-3.5 h-3.5" /> Wrapped Bridge</>
                ) : (
                  <><Lock className="w-3.5 h-3.5" /> Atomic HTLC</>
                )}
              </button>
            ))}
          </div>

          {/* Mode description */}
          <div className={cn(
            "flex items-start gap-2.5 p-3 rounded-xl border text-xs text-muted-foreground",
            mode === "htlc"
              ? "border-orange-500/20 bg-orange-500/5"
              : "border-primary/20 bg-primary/5"
          )}>
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
            {mode === "htlc"
              ? "Atomic HTLC: trustless peer-to-peer swap using Hash Time-Locked Contracts. No wrapped tokens, no custody. Slower (~5–30 min) but fully non-custodial."
              : "Wrapped Bridge: assets locked in multi-sig vault, wrapped tokens minted on EVM for AMM trading. Fast (~30–60 sec) with pooled liquidity. Requires trusting bridge operators."
            }
          </div>

          {/* From chain/token */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From</div>
            <ChainSelect value={fromChain} onChange={(c) => { setFromChain(c); setFromToken(c.tokens[0]); setSimStep(0); }} />

            <div className="flex items-center gap-2">
              <div className="flex flex-wrap gap-1.5 flex-1">
                {fromChain.tokens.map(t => (
                  <button
                    key={t}
                    onClick={() => setFromToken(t)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all",
                      fromToken === t
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >{t}</button>
                ))}
              </div>
              <input
                type="number"
                value={amount}
                onChange={e => { setAmount(e.target.value); setSimStep(0); }}
                placeholder="0.00"
                className="w-36 text-right bg-secondary border border-border rounded-xl px-3 py-2 text-foreground font-mono font-semibold text-lg focus:outline-none focus:border-primary/50"
              />
            </div>
            {amount && (
              <div className="text-xs text-muted-foreground text-right">
                ≈ ${(parseFloat(amount) * fromPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            )}
          </div>

          {/* Swap direction button */}
          <div className="flex items-center justify-center">
            <button
              onClick={handleSwapChains}
              className="w-10 h-10 rounded-full border border-border bg-card hover:border-primary/50 hover:bg-primary/10 flex items-center justify-center transition-all group"
            >
              <ArrowLeftRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          </div>

          {/* To chain/token */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</div>
            <ChainSelect
              value={toChain}
              onChange={(c) => { setToChain(c); setToToken(c.tokens[0]); setSimStep(0); }}
              exclude={fromChain.id}
            />

            <div className="flex items-center gap-2">
              <div className="flex flex-wrap gap-1.5 flex-1">
                {toChain.tokens.map(t => (
                  <button
                    key={t}
                    onClick={() => setToToken(t)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all",
                      toToken === t
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >{t}</button>
                ))}
              </div>
              <div className="w-36 text-right bg-secondary/50 border border-border/50 rounded-xl px-3 py-2 font-mono font-semibold text-lg text-foreground">
                {outputAmount > 0 ? outputAmount.toFixed(6) : "0.00"}
              </div>
            </div>
            {outputAmount > 0 && (
              <div className="text-xs text-muted-foreground text-right">
                ≈ ${(outputAmount * toPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            )}
          </div>

          {/* Slippage */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Slippage Tolerance</span>
              <span className="text-xs font-bold text-primary">{slippage}%</span>
            </div>
            <div className="flex gap-2">
              {SLIPPAGE_PRESETS.map(s => (
                <button
                  key={s}
                  onClick={() => { setSlippage(s); setCustomSlip(""); }}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all",
                    slippage === s && !customSlip
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >{s}%</button>
              ))}
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="Custom"
                  value={customSlip}
                  min="0.01"
                  max="50"
                  step="0.1"
                  onChange={e => {
                    setCustomSlip(e.target.value);
                    const v = parseFloat(e.target.value);
                    if (v > 0 && v <= 50) setSlippage(v);
                  }}
                  className="w-full py-1.5 rounded-lg text-xs font-bold border border-border bg-secondary text-foreground text-center focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {/* Summary */}
            {outputAmount > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-border/50">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Min received</span>
                  <span className="font-semibold text-foreground">
                    {minReceived.toFixed(6)} {toToken}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Bridge fee</span>
                  <span className="font-semibold text-foreground">${feeUsd.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Settlement time</span>
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />{htlcTime}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">BSV Settlement</span>
                  <span className="font-semibold text-green-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 animate-pulse" /> On-chain · &lt;5s · ~$0.001
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Warnings */}
          {isSameChain && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              Select different source and destination chains for cross-chain bridging.
            </div>
          )}
          {mode === "htlc" && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-400/80">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              HTLC swaps require a counterparty. If no match is found before the timeout window, funds are automatically refunded. Never share your secret preimage before receiving funds.
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSimulate}
            disabled={!amount || parseFloat(amount) <= 0 || isSameChain || simRunning}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2.5 bg-gradient-to-r from-primary to-green-500 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {simRunning
              ? <><RefreshCw className="w-5 h-5 animate-spin" /> Routing…</>
              : <><ArrowRight className="w-5 h-5" /> {mode === "htlc" ? "Initiate HTLC Swap" : "Bridge Assets"}</>
            }
          </button>
        </div>

        {/* ── Right: Route & info ── */}
        <div className="space-y-4">

          {/* Route path */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-foreground">Route Path</span>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                mode === "htlc"
                  ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
                  : "text-primary border-primary/30 bg-primary/10"
              )}>
                {mode === "htlc" ? "HTLC Atomic" : "Wrapped Bridge"}
              </span>
            </div>

            <div className="space-y-2">
              {routeSteps.map((step, i) => (
                <RouteStep
                  key={i}
                  icon={step.icon}
                  label={step.label}
                  detail={step.detail}
                  done={simStep > i + 1}
                  active={simStep === i + 1 || (!simRunning && simStep === 0)}
                />
              ))}
            </div>

            {/* Chain → chain visualization */}
            <div className="mt-4 flex items-center gap-2 justify-center">
              <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold", fromChain.bgColor, fromChain.color)}>
                <span>{fromChain.icon}</span> {fromChain.name}
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              {mode === "wrapped" && (
                <>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-xs font-bold text-violet-400">
                    <span>⬡</span> EVM Bridge
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </>
              )}
              <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold", toChain.bgColor, toChain.color)}>
                <span>{toChain.icon}</span> {toChain.name}
              </div>
            </div>
          </div>

          {/* Security callout */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Shield className="w-4 h-4 text-primary" />
              Security Notes
            </div>
            <ul className="space-y-2">
              {[
                { label: "Battle-tested patterns", detail: "Multi-sig, MPC, or light-client-based bridges only" },
                { label: "HTLC timeouts", detail: "Carefully sized refund windows prevent stuck funds" },
                { label: "Slippage protection", detail: "Min received guaranteed; tx reverts if breached" },
                { label: "Simulate first", detail: "Route preview shown before any on-chain tx is signed" },
              ].map(({ label, detail }) => (
                <li key={label} className="flex items-start gap-2 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-foreground">{label}</span>
                    <span className="text-muted-foreground"> — {detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* BSV settlement badge */}
          <div className="rounded-2xl border border-green-500/25 bg-green-500/5 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
              <span className="text-lg animate-pulse">⚡</span>
            </div>
            <div>
              <div className="text-sm font-bold text-green-400">BSV Final Settlement</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Every cross-chain swap is anchored to the BSV blockchain via OP_RETURN — immutable, instant, &lt;$0.001.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
