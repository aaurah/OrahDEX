import { useState, useCallback } from "react";
import { CoinLogo, COIN_COLORS } from "@/components/CoinLogo";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Droplets, Plus, Minus, TrendingUp, ArrowLeft, Info,
  ChevronDown, ChevronUp, Zap, Award, BarChart3, AlertTriangle,
  Calculator, ArrowRight, Code2, ChevronRight, Wallet,
  ExternalLink, CheckCircle2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useLiquidityStore } from "@/store/useLiquidityStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import {
  addLiquidityOnChain, addLiquidityLive, getLiquidityMode,
  EXPLORER_TX, CHAIN_NAMES, type LiquidityTxStatus,
} from "@/lib/onChainLiquidity";

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
  // ── Tron ecosystem ─────────────────────────────────────────────────────────
  { id: "trx-usdt",  base: "TRX",  quote: "USDT", tvl: 148_200_000, vol24: 38_700_000,  farmApr: 12.4, fee: 0.25, userLp: 0,      chain: "TRX" },
  { id: "btt-usdt",  base: "BTT",  quote: "USDT", tvl: 19_600_000,  vol24: 5_800_000,   farmApr: 24.6, fee: 0.3,  userLp: 0,      chain: "TRX" },
  { id: "btt-trx",   base: "BTT",  quote: "TRX",  tvl: 8_400_000,   vol24: 2_100_000,   farmApr: 31.2, fee: 0.3,  userLp: 0,      chain: "TRX" },
  { id: "win-trx",   base: "WIN",  quote: "TRX",  tvl: 4_200_000,   vol24: 1_050_000,   farmApr: 28.8, fee: 0.3,  userLp: 0,      chain: "TRX" },
  { id: "jst-usdt",  base: "JST",  quote: "USDT", tvl: 6_800_000,   vol24: 1_620_000,   farmApr: 19.4, fee: 0.3,  userLp: 0,      chain: "TRX" },
  { id: "trx-btc",   base: "TRX",  quote: "BTC",  tvl: 32_100_000,  vol24: 8_900_000,   farmApr: 9.7,  fee: 0.3,  userLp: 0,      chain: "TRX" },
];

// Approximate spot prices for UI ratio calculations only
const SPOT: Record<string, number> = {
  BTC: 83_000, ETH: 1_800, SOL: 130, BSV: 14, BNB: 580,
  XRP: 0.52, ADA: 0.44, DOGE: 0.12, DOT: 6.8, LINK: 14.5, USDT: 1,
  TRX: 0.24, BTT: 0.0000009, WIN: 0.00006, JST: 0.025,
};

// ─── Protocol fee split: 5/6 to LPs, 1/6 to protocol treasury ────────────────
const LP_FEE_RATIO       = 5 / 6;
const PROTOCOL_FEE_RATIO = 1 / 6;
function lpFee(poolFee: number)       { return poolFee * LP_FEE_RATIO; }
function protocolFee(poolFee: number) { return poolFee * PROTOCOL_FEE_RATIO; }

// Pool APR = fee revenue / TVL × 365  (x·y=k constant-product formula)
function poolApr(p: typeof POOLS[0]) {
  return (p.vol24 * (p.fee / 100) / p.tvl) * 365 * 100;
}

// FARM_POOLS is now computed inside the main component from the real LP store

// Pool share with enough precision to show the first significant digit.
// toFixed(4) hides any share < 0.00005%, which is common for small positions
// in large simulated pools.  We auto-scale decimal places instead.
function fmtPoolShare(userLp: number, tvl: number): string {
  const LP_PRICE = 12.5;
  if (userLp <= 0 || tvl <= 0) return "0.0000%";
  const share = (userLp * LP_PRICE / tvl) * 100;
  if (share <= 0) return "0.0000%";
  if (share >= 0.00005)  return share.toFixed(4) + "%";    // e.g. 0.0001%
  if (share >= 0.0000005) return share.toFixed(7) + "%";   // e.g. 0.0000112%
  return "< 0.0000005%";
}

function fmtTvl(n: number) {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}


type MainTab = "pools" | "positions" | "farming";

/* ── Mobile AMM Swap Simulator ── */
function MobileAmmSimulator() {
  const [open, setOpen]         = useState(false);
  const [poolId, setPoolId]     = useState("btc-usdt");
  const [amtIn, setAmtIn]       = useState("");
  const [direction, setDir]     = useState<"AtoB" | "BtoA">("AtoB");

  const pool   = POOLS.find(p => p.id === poolId) ?? POOLS[0];
  const priceA = SPOT[pool.base]  ?? 1;
  const priceB = SPOT[pool.quote] ?? 1;
  const resX   = pool.tvl / 2 / priceA;
  const resY   = pool.tvl / 2 / priceB;

  const tokenIn  = direction === "AtoB" ? pool.base  : pool.quote;
  const tokenOut = direction === "AtoB" ? pool.quote : pool.base;
  const resIn    = direction === "AtoB" ? resX : resY;
  const resOut   = direction === "AtoB" ? resY : resX;
  const priceIn  = direction === "AtoB" ? priceA : priceB;
  const priceOut = direction === "AtoB" ? priceB : priceA;

  const n            = parseFloat(amtIn);
  const valid        = !isNaN(n) && n > 0;
  const feeMult      = 1 - pool.fee / 100;
  const amtInFee     = valid ? n * feeMult : 0;
  const amtOut       = valid ? (amtInFee * resOut) / (resIn + amtInFee) : 0;
  const spotRate     = resOut / resIn;
  const effectiveRate= valid ? amtOut / n : spotRate;
  const priceImpact  = valid ? (n / (resIn + n)) * 100 : 0;
  const feeAmt       = valid ? n * (pool.fee / 100) : 0;
  const feeLp        = feeAmt * LP_FEE_RATIO;
  const feeProto     = feeAmt * PROTOCOL_FEE_RATIO;

  const colorA = COIN_COLORS[pool.base]  ?? "#EAB308";
  const colorB = COIN_COLORS[pool.quote] ?? "#16a34a";

  return (
    <div className="bg-card border border-border rounded-xl mb-3 overflow-hidden">
      {/* Collapsed header */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3">
        <Calculator size={14} className="text-primary shrink-0" />
        <span className="text-sm font-semibold">AMM Swap Simulator</span>
        <span className="text-[10px] px-1.5 py-0.5 bg-primary/15 text-primary rounded font-bold ml-1">x·y=k</span>
        <ChevronRight size={13} className={cn("ml-auto text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          {/* Pool + direction */}
          <select value={poolId} onChange={e => { setPoolId(e.target.value); setAmtIn(""); }}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm font-semibold outline-none">
            {POOLS.map(p => (
              <option key={p.id} value={p.id}>{p.base}/{p.quote} — {p.fee}% fee</option>
            ))}
          </select>

          <div className="flex rounded-xl overflow-hidden border border-border">
            <button onClick={() => { setDir("AtoB"); setAmtIn(""); }}
              className={cn("flex-1 py-1.5 text-xs font-bold transition-colors",
                direction === "AtoB" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {pool.base} → {pool.quote}
            </button>
            <button onClick={() => { setDir("BtoA"); setAmtIn(""); }}
              className={cn("flex-1 py-1.5 text-xs font-bold transition-colors",
                direction === "BtoA" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {pool.quote} → {pool.base}
            </button>
          </div>

          {/* Input */}
          <div className="bg-secondary/50 border border-border rounded-xl px-3 py-2.5">
            <div className="text-[10px] text-muted-foreground mb-1">You send ({tokenIn})</div>
            <div className="flex items-center gap-2">
              <input className="flex-1 bg-transparent text-xl font-bold outline-none"
                placeholder="0.00" type="number" min="0" step="any"
                value={amtIn} onChange={e => setAmtIn(e.target.value)} inputMode="decimal" />
              <span className="text-sm font-bold" style={{ color: direction === "AtoB" ? colorA : colorB }}>{tokenIn}</span>
            </div>
            {valid && <div className="text-[10px] text-muted-foreground mt-0.5">≈ ${(n * priceIn).toFixed(2)}</div>}
          </div>

          {/* Quick amounts */}
          <div className="flex gap-1.5">
            {["0.01","0.1","1","10"].map(v => (
              <button key={v} onClick={() => setAmtIn(v)}
                className="flex-1 py-1 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:text-primary transition-colors">
                {v}
              </button>
            ))}
          </div>

          {/* Arrow */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
              <ArrowRight size={13} className="text-primary" />
            </div>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Output */}
          <div className={cn("bg-secondary/50 border rounded-xl px-3 py-2.5 transition-colors",
            valid ? "border-primary/40" : "border-border")}>
            <div className="text-[10px] text-muted-foreground mb-1">You receive ({tokenOut})</div>
            <div className="flex items-center gap-2">
              <span className={cn("text-xl font-bold", valid ? "text-foreground" : "text-muted-foreground/40")}>
                {valid ? amtOut.toLocaleString(undefined, { maximumFractionDigits: 8 }) : "0.00"}
              </span>
              <span className="text-sm font-bold" style={{ color: direction === "AtoB" ? colorB : colorA }}>{tokenOut}</span>
            </div>
            {valid && <div className="text-[10px] text-muted-foreground mt-0.5">≈ ${(amtOut * priceOut).toFixed(2)}</div>}
          </div>

          {/* Breakdown */}
          <div className="bg-secondary/30 rounded-xl p-3 space-y-1.5">
            {[
              ["Pool price (y/x)", `1 ${tokenIn} = ${spotRate.toLocaleString(undefined,{maximumFractionDigits:4})} ${tokenOut}`],
              ["Effective rate",   valid ? `1 ${tokenIn} = ${effectiveRate.toLocaleString(undefined,{maximumFractionDigits:4})} ${tokenOut}` : "—"],
              ["Price impact",     valid ? (
                <span className={cn("font-bold", priceImpact<0.5?"text-green-500":priceImpact<2?"text-yellow-500":"text-red-500")}>
                  {priceImpact.toFixed(3)}%
                </span>
              ) : "—"],
              ["Total fee",        valid ? `${feeAmt.toFixed(6)} ${tokenIn}` : "—"],
              ["→ LP share (5/6)", valid ? `${feeLp.toFixed(6)} ${tokenIn}` : "—"],
              ["→ Protocol (1/6)", valid ? `${feeProto.toFixed(6)} ${tokenIn}` : "—"],
              ["k = x·y",         `${(resX*resY).toExponential(3)}`],
            ].map(([l, v]) => (
              <div key={String(l)} className="flex justify-between items-center">
                <span className={cn("text-[11px] text-muted-foreground", String(l).startsWith("→") ? "pl-2" : "")}>{l}</span>
                <span className="text-[11px] font-mono font-semibold text-right">{v}</span>
              </div>
            ))}
          </div>

          {/* Formula */}
          <div className="flex items-start gap-2">
            <Code2 size={11} className="text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
              Δy = (Δx × (1−fee) × y) / (x + Δx × (1−fee))
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [submitting, setSubmitting] = useState(false);
  const [txStatus, setTxStatus] = useState<LiquidityTxStatus>({ step: "idle" });
  const { toast } = useToast();

  const { address, network, chainId, provider: walletProvider } = useWalletStore();
  const openWalletModal = useWalletModalStore((s) => s.open);
  const { addPosition, removePositionPct, getUserPositions } = useLiquidityStore();
  const isEvm = !address || network === "evm" || address?.startsWith("0x");
  const { balances: evmBalances, refresh: refreshEvmBalances } = useEvmBalances(isEvm ? address : null, chainId);
  const walletConnected = !!address;

  const userPositions = address ? getUserPositions(address) : {};
  const myLpTokens    = pool ? (userPositions[pool.id]?.lpTokens ?? 0) : 0;

  const handleAdd = useCallback(async () => {
    if (!pool || !amtA || !amtB || submitting || !walletConnected || !address) return;
    const nA       = parseFloat(amtA);
    const nB       = parseFloat(amtB);
    const priceA_  = SPOT[pool.base]  ?? 1;
    const priceB_  = SPOT[pool.quote] ?? 1;
    const valueUsd = nA * priceA_ + nB * priceB_;
    const lpTokens = valueUsd / 12.5;

    const balA = evmBalances?.find(b => b.symbol.toUpperCase() === pool.base.toUpperCase())?.amount ?? 0;
    const balB = evmBalances?.find(b => b.symbol.toUpperCase() === pool.quote.toUpperCase())?.amount ?? 0;
    if (nA > balA) {
      toast({ title: "Insufficient balance", description: `You only have ${balA.toFixed(6)} ${pool.base} but tried to add ${nA.toFixed(6)}.`, variant: "destructive" });
      return;
    }
    if (nB > balB) {
      toast({ title: "Insufficient balance", description: `You only have ${balB.toFixed(6)} ${pool.quote} but tried to add ${nB.toFixed(6)}.`, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    setTxStatus({ step: "idle" });

    const mode = getLiquidityMode(chainId, pool.base, pool.quote, walletProvider);

    if (mode === "on_chain") {
      await addLiquidityOnChain({
        base:    pool.base,
        quote:   pool.quote,
        amountA: nA,
        amountB: nB,
        address,
        chainId: chainId!,
        onStatus: (s) => {
          setTxStatus(s);
          if (s.step === "success") {
            addPosition(address, pool.id, s.lpTokens ?? lpTokens, s.valueUsd ?? valueUsd, { txHash: s.txHash, chainId: chainId ?? undefined });
            refreshEvmBalances();
            toast({ title: "Liquidity added on-chain!", description: `Confirmed. ${(s.lpTokens ?? lpTokens).toFixed(4)} LP tokens recorded.` });
          }
        },
      });
      setSubmitting(false);
      return;
    }

    if (mode === "live") {
      await addLiquidityLive({
        base:     pool.base,
        quote:    pool.quote,
        amountA:  nA,
        amountB:  nB,
        address,
        chainId:  chainId!,
        valueUsd,
        lpTokens,
        onStatus: (s) => {
          setTxStatus(s);
          if (s.step === "success") {
            addPosition(address, pool.id, s.lpTokens ?? lpTokens, s.valueUsd ?? valueUsd);
            toast({
              title: "Position recorded!",
              description: `${nA.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pool.base} + ${nB.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pool.quote}. ${lpTokens.toFixed(4)} LP tokens.`,
            });
            onClose();
          }
        },
      });
      setSubmitting(false);
      return;
    }

    // Simulated mode (no EVM wallet / BSV / non-EVM chains)
    setTxStatus({ step: "depositing" });
    await new Promise(r => setTimeout(r, 1200));
    addPosition(address, pool.id, lpTokens, valueUsd);
    setTxStatus({ step: "success", lpTokens, valueUsd });
    setSubmitting(false);
    toast({
      title: "Liquidity position added! (Simulated)",
      description: `${nA.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pool.base} + ${nB.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pool.quote}. ${lpTokens.toFixed(4)} LP tokens.`,
    });
    onClose();
  }, [pool, amtA, amtB, submitting, walletConnected, address, chainId, isEvm, evmBalances, walletProvider, addPosition, toast, onClose]);

  const handleRemove = useCallback(async () => {
    if (!pool || submitting || !walletConnected || !address) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1500));
    removePositionPct(address, pool.id, pct);
    setSubmitting(false);
    toast({
      title: "Liquidity removed!",
      description: `Withdrew ${pct}% from the ${pool.base}/${pool.quote} pool.`,
    });
    onClose();
  }, [pool, pct, submitting, walletConnected, address, removePositionPct, toast, onClose]);

  if (!pool) return null;

  const colorA   = COIN_COLORS[pool.base]  ?? "#EAB308";
  const colorB   = COIN_COLORS[pool.quote] ?? "#16a34a";
  const feeApr   = poolApr(pool);
  const totalApr = feeApr + pool.farmApr;
  const priceA   = SPOT[pool.base]  ?? 1;
  const priceB   = SPOT[pool.quote] ?? 1;

  // Remove: user receives tokens proportional to 50/50 pool split (using real LP from store)
  const lpValue     = myLpTokens * 12.5;
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

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {/* Token badges */}
            <div className="flex -space-x-2">
              <CoinLogo symbol={pool.base}  size={28} ring />
              <CoinLogo symbol={pool.quote} size={28} ring />
            </div>
            <span className="font-bold text-base">{pool.base}/{pool.quote}</span>
            {(() => {
              const m = pool ? getLiquidityMode(chainId, pool.base, pool.quote, walletProvider) : "simulated";
              if (m === "on_chain") return <span className="text-[9px] px-1.5 py-0.5 bg-green-500/15 text-green-400 border border-green-500/30 rounded font-bold">ON-CHAIN</span>;
              if (m === "live")     return <span className="text-[9px] px-1.5 py-0.5 bg-primary/15 text-primary border border-primary/30 rounded font-bold">LIVE</span>;
              return <span className="text-[9px] px-1.5 py-0.5 bg-secondary text-muted-foreground border border-border rounded font-bold">BSV-SETTLED</span>;
            })()}
          </div>
          <button onClick={onClose} className="text-muted-foreground text-sm">✕</button>
        </div>

        {/* Chain mode notice */}
        {(() => {
          const mode = pool ? getLiquidityMode(chainId, pool.base, pool.quote, walletProvider) : "simulated";
          if (mode === "on_chain") return (
            <div className="flex items-start gap-2 bg-green-500/8 border border-green-500/20 rounded-xl px-3 py-2 mb-4">
              <CheckCircle2 size={12} className="text-green-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-green-300/90 leading-relaxed">
                <strong>Real on-chain transaction.</strong> Tokens will be deducted from your wallet.
              </p>
            </div>
          );
          if (mode === "live") return (
            <div className="flex items-start gap-2 bg-primary/8 border border-primary/20 rounded-xl px-3 py-2 mb-4">
              <Zap size={12} className="text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-primary/90 leading-relaxed">
                <strong>Live wallet connected.</strong> Position recorded to your wallet. On-chain settlement for this pair coming soon.
              </p>
            </div>
          );
          return (
            <div className="flex items-start gap-2 bg-secondary/40 border border-border rounded-xl px-3 py-2 mb-4">
              <Info size={12} className="text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <strong>BSV-settled position.</strong> Connect an EVM wallet for live tracking.
              </p>
            </div>
          );
        })()}

        {/* Wallet gate */}
        {!walletConnected ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Wallet size={26} className="text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm mb-1">Wallet required</p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                Connect an EVM or BSV wallet to add or remove liquidity and view your balances.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => openWalletModal()}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm active:opacity-80"
              >
                Connect Wallet
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : mode === "add" ? (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              Both tokens auto-balance using the pool ratio (x·y=k). Enter one amount — the other fills automatically.
            </p>
            {/* Input A */}
            {(() => {
              const balA = evmBalances?.find(b => b.symbol.toUpperCase() === pool.base.toUpperCase())?.amount ?? null;
              const balB = evmBalances?.find(b => b.symbol.toUpperCase() === pool.quote.toUpperCase())?.amount ?? null;
              const fmtBal = (n: number) => n < 0.0001 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: 6 });
              return (
                <>
                  <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3 mb-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{pool.base} amount</span>
                      <div className="flex items-center gap-2">
                        {balA !== null && (
                          <button
                            onClick={() => handleAmtAChange(String(balA))}
                            className="text-[10px] text-primary font-semibold hover:underline"
                          >
                            Bal: {fmtBal(balA)}
                          </button>
                        )}
                        <span className="text-xs text-muted-foreground">≈ ${((parseFloat(amtA)||0)*priceA).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input className="flex-1 bg-transparent text-lg font-bold outline-none"
                        placeholder="0.00" value={amtA}
                        onChange={e => handleAmtAChange(e.target.value)} inputMode="decimal" />
                      {balA !== null && (
                        <button
                          onClick={() => handleAmtAChange(String(balA))}
                          className="text-[10px] font-bold px-2 py-1 rounded-md bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
                        >
                          MAX
                        </button>
                      )}
                      <div className="px-2 py-1 bg-background border border-border rounded-lg">
                        <span className="text-xs font-bold" style={{ color: colorA }}>{pool.base}</span>
                      </div>
                    </div>
                    {balA !== null && parseFloat(amtA || "0") > balA && (
                      <p className="text-[10px] text-red-400 mt-1">Insufficient {pool.base} balance</p>
                    )}
                  </div>
                  {/* Ratio connector */}
                  <div className="text-center py-1">
                    <span className="text-[10px] text-muted-foreground">1 {pool.base} = {(priceA/priceB).toLocaleString(undefined,{maximumFractionDigits:6})} {pool.quote}</span>
                  </div>
                  {/* Input B */}
                  <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3 mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{pool.quote} amount</span>
                      <div className="flex items-center gap-2">
                        {balB !== null && (
                          <button
                            onClick={() => handleAmtBChange(String(balB))}
                            className="text-[10px] text-primary font-semibold hover:underline"
                          >
                            Bal: {fmtBal(balB)}
                          </button>
                        )}
                        <span className="text-xs text-muted-foreground">≈ ${((parseFloat(amtB)||0)*priceB).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input className="flex-1 bg-transparent text-lg font-bold outline-none"
                        placeholder="0.00" value={amtB}
                        onChange={e => handleAmtBChange(e.target.value)} inputMode="decimal" />
                      {balB !== null && (
                        <button
                          onClick={() => handleAmtBChange(String(balB))}
                          className="text-[10px] font-bold px-2 py-1 rounded-md bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20"
                        >
                          MAX
                        </button>
                      )}
                      <div className="px-2 py-1 bg-background border border-border rounded-lg">
                        <span className="text-xs font-bold" style={{ color: colorB }}>{pool.quote}</span>
                      </div>
                    </div>
                    {balB !== null && parseFloat(amtB || "0") > balB && (
                      <p className="text-[10px] text-red-400 mt-1">Insufficient {pool.quote} balance</p>
                    )}
                  </div>
                </>
              );
            })()}
            {/* Info rows */}
            <div className="space-y-2 mb-5">
              {[
                ["Pool fee (total)", `${pool.fee}%`],
                ["  → LP share (5/6)", `${lpFee(pool.fee).toFixed(4)}% (you earn)`],
                ["  → Protocol (1/6)", `${protocolFee(pool.fee).toFixed(4)}% (treasury)`],
                ["Fee APR (from vol)", `${feeApr.toFixed(1)}%`],
                ["Farm APR", `+${pool.farmApr.toFixed(1)}%`],
                ["Total APR", totalApr.toFixed(1) + "%"],
                ["You receive", "LP tokens"],
              ].map(([l, v], i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className={cn("text-muted-foreground", l.startsWith("  →") ? "pl-3 text-[10px]" : "")}>{l}</span>
                  <span className={cn("font-medium text-right",
                    l === "Total APR" ? "text-green-500 font-bold" :
                    l.startsWith("  → LP") ? "text-green-400 text-[10px]" :
                    l.startsWith("  → Protocol") ? "text-blue-400 text-[10px]" : ""
                  )}>{v}</span>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 bg-orange-500/8 border border-orange-500/20 rounded-xl p-2.5 mb-4">
              <AlertTriangle size={12} className="text-orange-400 mt-0.5 shrink-0" />
              <p className="text-[10px] text-orange-300/80 leading-relaxed">
                <strong>Impermanent loss risk:</strong> If {pool.base} price diverges from {pool.quote}, your withdrawal ratio will differ from your deposit.
              </p>
            </div>
            {/* ── Tx progress ── */}
            {txStatus.step !== "idle" && (
              <div className="bg-secondary/40 border border-border rounded-xl p-3 mb-3 space-y-2">
                {(() => {
                  const ORDER = ["checking","approving","approval_pending","depositing","deposit_pending","success"] as const;
                  const idx   = ORDER.indexOf(txStatus.step as typeof ORDER[number]);
                  const m_    = getLiquidityMode(chainId, pool.base, pool.quote, walletProvider);
                  return m_ === "live" ? [
                    { id: "depositing", label: "Sign commitment in wallet (no gas)", done: txStatus.step === "success", active: txStatus.step === "depositing", txHash: undefined },
                  ] : [
                    { id: "checking",  label: `Checking ${pool.quote} allowance`, done: idx > 0 && txStatus.step !== "error", active: txStatus.step === "checking" },
                    { id: "approving", label: `Approve ${pool.quote}`,             done: idx >= ORDER.indexOf("depositing") && txStatus.step !== "error", active: ["approving","approval_pending"].includes(txStatus.step), txHash: txStatus.step === "approval_pending" ? txStatus.txHash : undefined },
                    { id: "depositing",label: `Add liquidity on ${CHAIN_NAMES[chainId ?? 8453] ?? "chain"}`, done: txStatus.step === "success", active: ["depositing","deposit_pending"].includes(txStatus.step), txHash: ["deposit_pending","success"].includes(txStatus.step) ? txStatus.txHash : undefined },
                  ];
                })().map(s => (
                  <div key={s.id} className="flex items-center gap-2">
                    {s.done ? <CheckCircle2 size={13} className="text-green-400 shrink-0" />
                     : s.active ? <Loader2 size={13} className="text-primary shrink-0 animate-spin" />
                     : <div className="w-[13px] h-[13px] rounded-full border border-border shrink-0" />}
                    <span className={cn("text-[11px] flex-1", s.done ? "text-green-400" : s.active ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {s.label}
                    </span>
                    {s.txHash && (
                      <a href={`${EXPLORER_TX[chainId ?? 8453] ?? "https://basescan.org/tx/"}${s.txHash}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-primary">
                        tx <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                ))}
                {txStatus.step === "success" && (
                  <div className="pt-1 border-t border-border/50 flex items-center justify-between">
                    <span className="text-[11px] text-green-400 font-semibold">
                      {getLiquidityMode(chainId, pool.base, pool.quote, walletProvider) === "live" ? "✓ Position recorded" : "✓ Confirmed on-chain"}
                    </span>
                    <button onClick={onClose} className="text-[11px] px-3 py-1 rounded-lg bg-green-600 text-white font-bold">Done</button>
                  </div>
                )}
                {txStatus.step === "error" && (
                  <p className="text-[11px] text-red-400 pt-1 border-t border-red-500/20">{txStatus.error}</p>
                )}
              </div>
            )}

            <button
              onClick={handleAdd}
              disabled={!amtA || !amtB || submitting || txStatus.step === "success" || ((parseFloat(amtA || "0") > (evmBalances?.find(b => b.symbol.toUpperCase() === pool.base.toUpperCase())?.amount ?? 0)) || (parseFloat(amtB || "0") > (evmBalances?.find(b => b.symbol.toUpperCase() === pool.quote.toUpperCase())?.amount ?? 0)))}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-green-600 active:opacity-80 disabled:opacity-40"
            >
              {(() => {
                const m = getLiquidityMode(chainId, pool.base, pool.quote, walletProvider);
                const _balA = evmBalances?.find(b => b.symbol.toUpperCase() === pool.base.toUpperCase())?.amount ?? 0;
                const _balB = evmBalances?.find(b => b.symbol.toUpperCase() === pool.quote.toUpperCase())?.amount ?? 0;
                if (parseFloat(amtA || "0") > _balA || parseFloat(amtB || "0") > _balB) return "Insufficient Balance";
                if (submitting) {
                  if (txStatus.step === "approving")        return "Waiting for approval…";
                  if (txStatus.step === "approval_pending") return "Confirming approval…";
                  if (txStatus.step === "depositing")       return m === "on_chain" ? "Sending…" : m === "live" ? "Sign in wallet…" : "Recording…";
                  if (txStatus.step === "deposit_pending")  return "Confirming…";
                  return "Processing…";
                }
                if (txStatus.step === "error") return "Retry";
                if (!amtA || !amtB) return "Enter amounts";
                return m === "on_chain" ? "Add Liquidity On-Chain" : "Add Liquidity";
              })()}
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
            <button
              onClick={handleRemove}
              disabled={submitting}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-red-600 active:opacity-80 disabled:opacity-40"
            >
              {submitting ? "Processing…" : "Remove Liquidity"}
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
          <CoinLogo symbol={pool.base}  size={28} ring />
          <CoinLogo symbol={pool.quote} size={28} ring />
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
function MyPositions({ myPools, onAdd, onRemove }: {
  myPools: (typeof POOLS[0] & { userLp: number })[];
  onAdd: (p: typeof POOLS[0]) => void;
  onRemove: (p: typeof POOLS[0]) => void;
}) {
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
                <CoinLogo symbol={pool.base}  size={28} ring />
                <CoinLogo symbol={pool.quote} size={28} ring />
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
                ["Pool Share", fmtPoolShare(pool.userLp, pool.tvl)],
                ["Fees Earned (24h)", `$${(pool.vol24 * (pool.fee / 100) * (pool.userLp * 12.5 / pool.tvl)).toFixed(2)}`],
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
function Farming({ farmPools }: { farmPools: Array<typeof POOLS[0] & { userLp: number; staked: number; unstaked: number; earned: number }> }) {
  const FARM_POOLS = farmPools;
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
                    <CoinLogo symbol={fp.base}  size={24} ring />
                    <CoinLogo symbol={fp.quote} size={24} ring />
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

  const { address: walletAddress } = useWalletStore();
  const { getUserPositions } = useLiquidityStore();
  const userPositions = walletAddress ? getUserPositions(walletAddress) : {};

  const enrichPool = (p: typeof POOLS[0]) => ({
    ...p,
    userLp: userPositions[p.id]?.lpTokens ?? 0,
  });

  const openAdd    = (p: typeof POOLS[0]) => { setModalPool(enrichPool(p)); setModalMode("add"); };
  const openRemove = (p: typeof POOLS[0]) => { setModalPool(enrichPool(p)); setModalMode("remove"); };

  const sorted = [...POOLS].map(enrichPool).sort((a, b) =>
    sortBy === "apr" ? (poolApr(b) + b.farmApr) - (poolApr(a) + a.farmApr)
    : sortBy === "tvl" ? b.tvl - a.tvl
    : b.vol24 - a.vol24
  );

  const totalTvl = POOLS.reduce((s, p) => s + p.tvl, 0);
  const myPools  = POOLS
    .filter(p => (userPositions[p.id]?.lpTokens ?? 0) > 0)
    .map(enrichPool);

  const FARM_POOLS = myPools.map(p => ({
    ...p,
    staked:   p.userLp * 0.6,
    unstaked: p.userLp * 0.4,
    earned:   parseFloat((p.userLp * 0.008).toFixed(4)),
  }));

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
        {(() => {
          const protocolRev24 = POOLS.reduce((s, p) => s + p.vol24 * (protocolFee(p.fee) / 100), 0);
          return (
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Total TVL",       fmtTvl(totalTvl),          ""],
                ["Protocol Rev 24h",fmtTvl(protocolRev24),     "text-blue-400"],
                ["Your Pools",      `${myPools.length}`,        "text-primary"],
                ["Best APR",        `${Math.max(...POOLS.map(p => poolApr(p) + p.farmApr)).toFixed(1)}%`, "text-green-500"],
              ].map(([l, v, cls]) => (
                <div key={l} className="bg-secondary/40 rounded-xl p-2.5 text-center">
                  <div className="text-[10px] text-muted-foreground">{l}</div>
                  <div className={cn("text-sm font-bold mt-0.5", cls)}>{v}</div>
                </div>
              ))}
            </div>
          );
        })()}
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
            {/* AMM Swap Simulator (collapsible) */}
            <MobileAmmSimulator />

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
        {tab === "positions" && <MyPositions myPools={myPools} onAdd={openAdd} onRemove={openRemove} />}
        {tab === "farming" && <Farming farmPools={FARM_POOLS} />}
      </div>

      {/* Modal */}
      {modalPool && (
        <LiquidityModal pool={modalPool} mode={modalMode} onClose={() => setModalPool(null)} />
      )}
    </div>
  );
}
