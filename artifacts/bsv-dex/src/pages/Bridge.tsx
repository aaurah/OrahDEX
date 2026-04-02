import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSEO } from "@/hooks/useSEO";
import {
  ArrowRight, ArrowLeftRight, ChevronDown, Shield, Zap, Clock,
  AlertTriangle, CheckCircle2, Lock, Unlock, RefreshCw, Info,
  Layers, Link2, Globe, Copy, Check, ExternalLink, X, Loader2,
  ArrowDown, ArrowUp, Coins, Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetMarkets } from "@workspace/api-client-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "@/hooks/use-toast";

// ─── Chain / Token definitions ────────────────────────────────────────────────

type Layer = "L1" | "L2";
type SwapMode = "htlc" | "wrapped";

type HtlcStatus = "pending" | "funded" | "minting" | "complete" | "refunded" | "expired";

interface HtlcLock {
  lockId: string;
  htlcAddress: string;
  redeemScript: string;
  secretHash: string;
  amountBsv: number;
  locktimeBlocks: number;
  currentBlock: number;
  expiresIn: string;
  status: HtlcStatus;
  fundingTxid?: string | null;
  mintTxHash?: string | null;
  instructions?: string[];
}

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

// ─── Canonical L1 → L2 asset mapping ─────────────────────────────────────────
interface CanonicalL2 {
  chainId: string; chain: string; symbol: string; label: string;
  type: "canonical" | "wrapped"; bridge: string; time: string; color: string; bg: string;
}
interface CanonicalAsset {
  l1: { chainId: string; chain: string; symbol: string; color: string; icon: string };
  l2: CanonicalL2[];
}
const CANONICAL_ASSETS: Record<string, CanonicalAsset> = {
  BSV: {
    l1: { chainId: "bsv", chain: "BSV", symbol: "BSV", color: "text-green-400", icon: "₿" },
    l2: [
      { chainId: "eth",  chain: "Ethereum", symbol: "wBSV", label: "wBSV (ERC-20)",  type: "wrapped",   bridge: "OrahDEX HTLC", time: "~5 min",   color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/30" },
      { chainId: "base", chain: "Base",     symbol: "wBSV", label: "wBSV on Base",   type: "wrapped",   bridge: "OrahDEX HTLC + Relay", time: "~5 min", color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
      { chainId: "arb",  chain: "Arbitrum", symbol: "wBSV", label: "wBSV on Arb",   type: "wrapped",   bridge: "OrahDEX HTLC + Relay", time: "~5 min", color: "text-sky-400",    bg: "bg-sky-500/10 border-sky-500/30" },
      { chainId: "op",   chain: "Optimism", symbol: "wBSV", label: "wBSV on OP",    type: "wrapped",   bridge: "OrahDEX HTLC + Relay", time: "~5 min", color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30" },
    ],
  },
  BTC: {
    l1: { chainId: "btc", chain: "Bitcoin", symbol: "BTC", color: "text-orange-400", icon: "₿" },
    l2: [
      { chainId: "eth",  chain: "Ethereum", symbol: "WBTC",  label: "WBTC (ERC-20)", type: "wrapped",   bridge: "BitGo WBTC DAO",    time: "~6 hrs",  color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
      { chainId: "base", chain: "Base",     symbol: "cbBTC", label: "cbBTC on Base", type: "wrapped",   bridge: "Coinbase cbBTC",    time: "~1 min",  color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
    ],
  },
  ETH: {
    l1: { chainId: "eth", chain: "Ethereum", symbol: "ETH", color: "text-violet-400", icon: "⬡" },
    l2: [
      { chainId: "base", chain: "Base",     symbol: "ETH",  label: "ETH on Base (canonical)",   type: "canonical", bridge: "Base Canonical Bridge",     time: "~7 min",  color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30" },
      { chainId: "arb",  chain: "Arbitrum", symbol: "ETH",  label: "ETH on Arbitrum (canonical)",type: "canonical", bridge: "Arbitrum Canonical Bridge",  time: "~10 min", color: "text-sky-400",    bg: "bg-sky-500/10 border-sky-500/30" },
      { chainId: "op",   chain: "Optimism", symbol: "ETH",  label: "ETH on Optimism (canonical)",type: "canonical", bridge: "OP Canonical Bridge",        time: "~1 min",  color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30" },
      { chainId: "poly", chain: "Polygon",  symbol: "ETH",  label: "ETH on Polygon (bridged)",   type: "wrapped",   bridge: "Polygon PoS Bridge",         time: "~7 min",  color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
    ],
  },
  SOL: {
    l1: { chainId: "sol", chain: "Solana", symbol: "SOL", color: "text-cyan-400", icon: "◎" },
    l2: [
      { chainId: "eth",  chain: "Ethereum", symbol: "wSOL", label: "wSOL (ERC-20)", type: "wrapped", bridge: "Wormhole Bridge", time: "~15 min", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/30" },
    ],
  },
};

const L1_COINS = Object.keys(CANONICAL_ASSETS);

// ─── Canonical Deposit / Withdraw panel ──────────────────────────────────────

function CanonicalPanel({ mode }: { mode: "deposit" | "withdraw" }) {
  const [coin, setCoin] = useState("BSV");
  const [l2ChainIdx, setL2ChainIdx] = useState(0);
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<0|1|2|3|4>(0); // 0=idle, 1..4=progress
  const [running, setRunning] = useState(false);
  const { address } = useWalletStore();

  const asset = CANONICAL_ASSETS[coin];
  const l2Options = asset.l2;
  const l2 = l2Options[Math.min(l2ChainIdx, l2Options.length - 1)];
  const l1Price = SPOT_PRICES[coin] ?? 1;
  const usdValue = parseFloat(amount || "0") * l1Price;

  // deposit steps: lock → detect → mint → trade
  // withdraw steps: burn → verify → unlock → received
  const STEPS = mode === "deposit"
    ? [
        { icon: <Lock className="w-4 h-4" />,        label: `Lock ${coin} on ${asset.l1.chain}`,  detail: `Send ${coin} to the canonical bridge contract — funds locked as collateral` },
        { icon: <Shield className="w-4 h-4" />,      label: "Bridge verifies deposit",             detail: `${l2.bridge} detects your L1 ${coin} within 1 confirmation` },
        { icon: <Coins className="w-4 h-4" />,       label: `Mint ${l2.symbol} on ${l2.chain}`,   detail: `1:1 ${l2.label} minted to your address — ready for trading` },
        { icon: <Zap className="w-4 h-4" />,         label: "Trade on OrahDEX",                   detail: `${l2.symbol} trades as ${coin} — same price, instant L2 settlement` },
      ]
    : [
        { icon: <Flame className="w-4 h-4" />,       label: `Burn ${l2.symbol} on ${l2.chain}`,   detail: `Your ${l2.symbol} is burned — supply reduced, proof submitted to L1` },
        { icon: <Shield className="w-4 h-4" />,      label: "L1 bridge verifies proof",            detail: `${l2.bridge} validates the burn proof on ${asset.l1.chain}` },
        { icon: <Unlock className="w-4 h-4" />,      label: `Unlock ${coin} on ${asset.l1.chain}`, detail: `Canonical bridge contract releases your locked ${coin}` },
        { icon: <CheckCircle2 className="w-4 h-4" />, label: `${coin} received on L1`,             detail: `Real ${coin} in your wallet — fully on-chain, non-custodial` },
      ];

  const handleRun = () => {
    if (running || !amount || parseFloat(amount) <= 0) return;
    setRunning(true); setStep(1);
    let s = 1;
    const tick = () => { s++; setStep(s as 0|1|2|3|4); if (s < 4) setTimeout(tick, 1100); else { setRunning(false); } };
    setTimeout(tick, 1200);
  };

  const isDeposit = mode === "deposit";
  const accentColor = isDeposit ? "text-green-400" : "text-orange-400";
  const accentBg    = isDeposit ? "from-green-500/10 to-green-500/5 border-green-500/20" : "from-orange-500/10 to-orange-500/5 border-orange-500/20";
  const btnGrad     = isDeposit ? "from-green-500 to-primary" : "from-orange-500 to-red-500";

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">

      {/* ── Left: form ── */}
      <div className="space-y-4">

        {/* Canonical architecture explainer */}
        <div className={cn("rounded-2xl border bg-gradient-to-br p-4", accentBg)}>
          <div className={cn("flex items-center gap-2 mb-2", accentColor)}>
            {isDeposit ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
            <span className="font-bold text-sm">{isDeposit ? "Deposit: L1 → L2 Canonical Bridge" : "Withdraw: L2 → L1 Canonical Bridge"}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isDeposit
              ? `Your ${coin} is locked in the canonical bridge contract on L1. The bridge mints an equivalent ${l2.symbol} on ${l2.chain} — a 1:1 claim on your locked ${coin}. You trade ${l2.symbol} on OrahDEX exactly as if it were ${coin}. Arbitrage bots keep the peg at 1:1.`
              : `Burning ${l2.symbol} on ${l2.chain} submits a proof to the ${asset.l1.chain} L1 bridge contract. The contract verifies the burn and releases your original ${coin}. This is fully non-custodial — only you can unlock your ${coin}.`
            }
          </p>
        </div>

        {/* L1 coin selector */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {isDeposit ? "L1 Coin to Deposit" : "L2 Token to Burn"}
          </div>
          <div className="flex gap-2 flex-wrap">
            {L1_COINS.map(c => (
              <button key={c} onClick={() => { setCoin(c); setL2ChainIdx(0); setStep(0); }}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5",
                  coin === c ? "bg-primary/20 border-primary/50 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}>
                <span>{CANONICAL_ASSETS[c].l1.icon}</span> {c}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => { setAmount(e.target.value); setStep(0); }}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-foreground font-mono font-semibold text-lg focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="px-3 py-2 bg-secondary/50 border border-border rounded-xl text-sm font-bold text-foreground">
              {isDeposit ? coin : l2.symbol}
            </div>
          </div>
          {usdValue > 0 && (
            <div className="text-xs text-muted-foreground text-right">≈ ${usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          )}
        </div>

        {/* L2 destination selector */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {isDeposit ? "L2 Destination Chain" : "L2 Source Chain"}
          </div>
          <div className="space-y-2">
            {l2Options.map((l2opt, idx) => (
              <button key={l2opt.chainId} onClick={() => { setL2ChainIdx(idx); setStep(0); }}
                className={cn("w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                  l2ChainIdx === idx ? cn("bg-card border-primary/50 shadow-sm") : "border-border hover:border-border/80 hover:bg-secondary/30"
                )}>
                <div className="flex items-center gap-2.5">
                  <div className={cn("w-2 h-2 rounded-full shrink-0", l2opt.color.replace("text-","bg-"))} />
                  <div className="text-left">
                    <div className="text-xs font-bold text-foreground">{l2opt.chain}</div>
                    <div className="text-[10px] text-muted-foreground">{l2opt.bridge}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("text-xs font-bold", l2opt.color)}>{l2opt.symbol}</div>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border", l2opt.type === "canonical" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400")}>
                      {l2opt.type === "canonical" ? "CANONICAL" : "WRAPPED"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{l2opt.time}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* You will receive / you will unlock */}
        {amount && parseFloat(amount) > 0 && (
          <div className={cn("rounded-2xl border p-4 space-y-2", isDeposit ? "border-green-500/20 bg-green-500/5" : "border-orange-500/20 bg-orange-500/5")}>
            <div className={cn("text-xs font-semibold uppercase tracking-wide", accentColor)}>
              {isDeposit ? "You Will Receive" : "You Will Unlock"}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black text-foreground">{parseFloat(amount).toFixed(6)}</span>
              <span className={cn("text-lg font-bold", accentColor)}>{isDeposit ? l2.symbol : coin}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {isDeposit
                ? `1:1 peg · ${l2.label} · Redeemable for ${coin} at any time`
                : `Original ${coin} released from ${asset.l1.chain} canonical bridge contract`
              }
            </div>
          </div>
        )}

        {/* Wallet warning */}
        {!address && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Connect your wallet to {isDeposit ? "initiate a deposit" : "initiate a withdrawal"}.
          </div>
        )}

        {/* Action button */}
        <button
          onClick={handleRun}
          disabled={!amount || parseFloat(amount) <= 0 || running}
          className={cn(
            "w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2.5 text-white shadow-lg",
            `bg-gradient-to-r ${btnGrad}`,
            "hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          )}
        >
          {running ? (
            <><RefreshCw className="w-5 h-5 animate-spin" /> Processing…</>
          ) : isDeposit ? (
            <><ArrowDown className="w-5 h-5" /> Deposit {coin} → {l2.chain}</>
          ) : (
            <><ArrowUp className="w-5 h-5" /> Withdraw {l2.symbol} → {coin}</>
          )}
        </button>
      </div>

      {/* ── Right: visual flow ── */}
      <div className="space-y-4">

        {/* Canonical flow diagram */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-sm font-bold text-foreground mb-4">
            {isDeposit ? "Deposit Flow" : "Withdrawal Flow"}
          </div>

          {/* L1 box */}
          <div className={cn("rounded-xl border p-3 mb-2", "border-green-500/30 bg-green-500/5")}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-green-400">L1 · Source of Truth</div>
                <div className="font-bold text-sm text-foreground mt-0.5">{asset.l1.chain}</div>
              </div>
              <div className="text-right">
                <div className={cn("text-lg font-black", asset.l1.color)}>{asset.l1.icon} {coin}</div>
                <div className="text-[10px] text-muted-foreground">Native · Canonical</div>
              </div>
            </div>
          </div>

          {/* Bridge connector */}
          <div className="flex items-center justify-center my-1 gap-2">
            <div className="flex-1 h-px bg-border/50" />
            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold",
              isDeposit ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-orange-500/30 bg-orange-500/10 text-orange-400"
            )}>
              {isDeposit ? <><Lock className="w-3 h-3" /> Lock → Mint</> : <><Flame className="w-3 h-3" /> Burn → Unlock</>}
            </div>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          {/* L2 box */}
          <div className={cn("rounded-xl border p-3 mt-1", l2.bg)}>
            <div className="flex items-center justify-between">
              <div>
                <div className={cn("text-[10px] font-black uppercase tracking-wider", l2.color)}>L2 · Execution Layer</div>
                <div className="font-bold text-sm text-foreground mt-0.5">{l2.chain}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{l2.bridge}</div>
              </div>
              <div className="text-right">
                <div className={cn("text-lg font-black", l2.color)}>{l2.symbol}</div>
                <div className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border mt-0.5 inline-block", l2.type === "canonical" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400")}>
                  {l2.type === "canonical" ? "1:1 CANONICAL" : "1:1 WRAPPED"}
                </div>
              </div>
            </div>
          </div>

          {/* Trading note */}
          <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-secondary/50 border border-border/50">
            <Zap className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Trades on OrahDEX use <span className="font-bold text-foreground">{l2.symbol}</span> — priced 1:1 with <span className="font-bold text-foreground">{coin}</span>. Arbitrage bots enforce the peg. You always see "{coin}" in the UI.
            </p>
          </div>
        </div>

        {/* Step-by-step progress */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-sm font-bold text-foreground mb-3">
            {isDeposit ? "Bridge Steps" : "Withdrawal Steps"}
          </div>
          <div className="space-y-2">
            {STEPS.map((s, i) => {
              const isActive = step === i + 1;
              const isDone   = step > i + 1;
              return (
                <div key={i} className={cn(
                  "flex items-start gap-3 p-2.5 rounded-xl border transition-all",
                  isDone   ? "border-green-500/30 bg-green-500/5" :
                  isActive ? (isDeposit ? "border-primary/30 bg-primary/5" : "border-orange-500/30 bg-orange-500/5") :
                             "border-transparent bg-transparent opacity-50"
                )}>
                  <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    isDone   ? "bg-green-500 text-white" :
                    isActive ? (isDeposit ? "bg-primary text-primary-foreground" : "bg-orange-500 text-white") :
                               "bg-secondary text-muted-foreground"
                  )}>
                    {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : isActive ? <RefreshCw className="w-3 h-3 animate-spin" /> : s.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground leading-tight">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{s.detail}</div>
                  </div>
                  <div className="text-[10px] font-bold text-muted-foreground/60 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Universal formula */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Universal Bridge Formula</div>
          <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
            <div className={cn("px-2 py-1 rounded", isDeposit ? "bg-green-500/10 text-green-400" : "opacity-40")}>
              Lock({coin} on L1) → Mint({l2.symbol} on {l2.chain})
            </div>
            <div className="px-2 py-1 rounded bg-primary/5 text-primary">
              Trade({l2.symbol} ↔ tokens) on L2 DEX
            </div>
            <div className={cn("px-2 py-1 rounded", !isDeposit ? "bg-orange-500/10 text-orange-400" : "opacity-40")}>
              Burn({l2.symbol}) → Unlock({coin} on L1)
            </div>
          </div>
          <div className="mt-3 text-[10px] text-muted-foreground">
            Same logic as: BaseETH ↔ ETH · ArbETH ↔ ETH · wBTC ↔ BTC · wBSV ↔ BSV
          </div>
        </div>

        {/* BSV settlement badge */}
        <div className="rounded-2xl border border-green-500/25 bg-green-500/5 p-3 flex items-center gap-3">
          <span className="text-2xl animate-pulse">⚡</span>
          <div>
            <div className="text-sm font-bold text-green-400">BSV Final Settlement</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">All bridge proofs anchored on BSV · &lt;5s · ~$0.001</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<HtlcStatus, string> = {
  pending:  "Awaiting Deposit",
  funded:   "BSV Received — Minting wBSV",
  minting:  "Minting wBSV on EVM",
  complete: "Complete",
  refunded: "Refunded",
  expired:  "Expired",
};

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

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={handle} className={cn("transition-colors", className)} title="Copy">
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-400" />
        : <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />}
    </button>
  );
}

// ─── HTLC status step map ─────────────────────────────────────────────────────
function htlcStatusStep(status: HtlcStatus): number {
  return { pending: 0, funded: 1, minting: 2, complete: 3, refunded: -1, expired: -1 }[status] ?? 0;
}

// ─── HTLC Deposit Panel ───────────────────────────────────────────────────────
function HtlcDepositPanel({
  lock, onCancel, onClose,
}: {
  lock: HtlcLock;
  onCancel: () => void;
  onClose: () => void;
}) {
  const step = htlcStatusStep(lock.status);
  const isDone  = lock.status === "complete";
  const isFailed = lock.status === "refunded" || lock.status === "expired";

  const steps = [
    {
      icon: <Lock className="w-3.5 h-3.5" />,
      label: "Send BSV to HTLC Address",
      detail: `Send exactly ${lock.amountBsv} BSV — bridge detects within 1 confirmation`,
    },
    {
      icon: <Link2 className="w-3.5 h-3.5" />,
      label: "Bridge Confirms Deposit",
      detail: `Relayer verifies BSV received at HTLC script address`,
    },
    {
      icon: <Layers className="w-3.5 h-3.5" />,
      label: "Mint wBSV on EVM",
      detail: `Bridge contract mints 1:1 wBSV to your EVM address`,
    },
    {
      icon: <Zap className="w-3.5 h-3.5" />,
      label: "Settlement Complete",
      detail: "wBSV delivered — swap on EVM AMM at any time",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
              <Lock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">HTLC Bridge</div>
              <div className="text-[10px] text-muted-foreground">
                Lock ID: {lock.lockId.slice(0, 8)}…
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full border",
              isDone   ? "text-green-400 border-green-500/30 bg-green-500/10" :
              isFailed ? "text-red-400 border-red-500/30 bg-red-500/10" :
                         "text-amber-400 border-amber-500/30 bg-amber-500/10"
            )}>
              {isDone ? "Complete" : isFailed ? lock.status.toUpperCase() : "In Progress"}
            </span>
            {isDone && (
              <button onClick={onClose} className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4">

          {/* Status steps */}
          <div className="space-y-2">
            {steps.map((s, i) => (
              <RouteStep
                key={i}
                icon={s.icon}
                label={s.label}
                detail={s.detail}
                done={step > i || isDone}
                active={step === i && !isFailed}
              />
            ))}
          </div>

          {/* Deposit address — only shown while pending */}
          {lock.status === "pending" && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Send {lock.amountBsv} BSV to this HTLC Address
              </div>
              <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2.5">
                <span className="flex-1 font-mono text-xs text-foreground break-all select-all">
                  {lock.htlcAddress}
                </span>
                <CopyButton text={lock.htlcAddress} />
              </div>
              <div className="flex items-start gap-2 text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-xl p-2.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Send exactly {lock.amountBsv} BSV. This address is valid for {lock.expiresIn} (until block {lock.locktimeBlocks}). After expiry, the refund path opens.
              </div>

              {/* Secret hash — shows the script is real */}
              <details className="text-[10px] text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground transition-colors">
                  View HTLC details (advanced)
                </summary>
                <div className="mt-2 space-y-1.5">
                  <div className="font-semibold text-foreground">Secret Hash (SHA-256):</div>
                  <div className="flex items-center gap-2 bg-secondary/60 rounded-lg px-2 py-1.5">
                    <span className="font-mono break-all flex-1">{lock.secretHash}</span>
                    <CopyButton text={lock.secretHash} />
                  </div>
                  <div className="font-semibold text-foreground mt-1">Redeem Script:</div>
                  <div className="flex items-center gap-2 bg-secondary/60 rounded-lg px-2 py-1.5">
                    <span className="font-mono break-all flex-1 text-[9px]">{lock.redeemScript}</span>
                    <CopyButton text={lock.redeemScript} />
                  </div>
                  <div className="text-muted-foreground/70 mt-1">
                    Script type: P2SH HTLC · Path A: reveal SHA-256 preimage · Path B: CLTV refund after block {lock.locktimeBlocks}
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* Funded — waiting for mint */}
          {(lock.status === "funded" || lock.status === "minting") && (
            <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl p-3">
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 text-green-400 animate-spin" />
              </div>
              <div>
                <div className="text-sm font-semibold text-green-400">BSV Detected</div>
                <div className="text-[10px] text-muted-foreground">
                  {lock.fundingTxid && (
                    <a
                      href={`https://whatsonchain.com/tx/${lock.fundingTxid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Tx: {lock.fundingTxid.slice(0, 16)}…
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                  Minting wBSV on EVM — usually takes 30–60 seconds.
                </div>
              </div>
            </div>
          )}

          {/* Mint tx hash */}
          {lock.mintTxHash && (
            <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2">
              <span className="text-[10px] text-muted-foreground">EVM Mint Tx:</span>
              <span className="font-mono text-[10px] text-foreground flex-1 truncate">{lock.mintTxHash}</span>
              <CopyButton text={lock.mintTxHash} />
            </div>
          )}

          {/* Complete */}
          {isDone && (
            <div className="flex items-center gap-3 bg-primary/5 border border-primary/30 rounded-xl p-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-primary">Bridge Complete!</div>
                <div className="text-[10px] text-muted-foreground">
                  wBSV has been minted to your EVM address. You can now swap on the AMM.
                </div>
              </div>
            </div>
          )}

          {/* Expired / refunded */}
          {isFailed && (
            <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/20 rounded-xl p-3">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-red-400">
                  {lock.status === "expired" ? "Lock Expired" : "Refunded"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {lock.status === "expired"
                    ? `Locktime reached (block ${lock.locktimeBlocks}). Use the refund path in your BSV wallet to reclaim funds.`
                    : "Bridge cancelled. Your BSV can be reclaimed via the HTLC refund path."}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {lock.status === "pending" && (
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:border-red-500/40 hover:text-red-400 transition-all"
              >
                Cancel
              </button>
            )}
            {isDone && (
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:brightness-110 transition-all"
              >
                Done — Go to Spot Trading
              </button>
            )}
            {lock.status === "pending" && (
              <div className="flex-1 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Polling for deposit…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HandCash-style BSV → Any Coin Quick Swap ─────────────────────────────────

interface QuickCoin {
  symbol: string;
  name: string;
  chain: string;
  chainLabel: string;
  icon: string;
  color: string;
  usdPrice: number;
  minBsv: number;
  maxBsv: number;
}

const QUICK_COINS: QuickCoin[] = [
  { symbol:"BTC",   name:"Bitcoin",          chain:"Bitcoin",        chainLabel:"BTC",           icon:"₿", color:"#f7931a", usdPrice:67420,  minBsv:0.01,  maxBsv:50000 },
  { symbol:"ETH",   name:"Ethereum",         chain:"Ethereum",       chainLabel:"ETH",           icon:"⬡", color:"#627eea", usdPrice:3510,   minBsv:0.05,  maxBsv:50000 },
  { symbol:"SOL",   name:"Solana",           chain:"Solana",         chainLabel:"SOL",           icon:"◎", color:"#9945ff", usdPrice:172,    minBsv:0.1,   maxBsv:50000 },
  { symbol:"BNB",   name:"BNB",              chain:"BNB Smart Chain",chainLabel:"BSC (BEP20)",   icon:"⬡", color:"#f0b90b", usdPrice:607,    minBsv:0.1,   maxBsv:50000 },
  { symbol:"XRP",   name:"XRP",              chain:"Ripple",         chainLabel:"XRP Ledger",    icon:"✕", color:"#00aae4", usdPrice:0.61,   minBsv:10,    maxBsv:50000 },
  { symbol:"DOGE",  name:"Dogecoin",         chain:"Dogecoin",       chainLabel:"DOGE",          icon:"Ð", color:"#c2a633", usdPrice:0.18,   minBsv:10,    maxBsv:50000 },
  { symbol:"ADA",   name:"Cardano",          chain:"Cardano",        chainLabel:"ADA",           icon:"₳", color:"#0d1e2d", usdPrice:0.45,   minBsv:5,     maxBsv:50000 },
  { symbol:"TRX",   name:"TRON",             chain:"TRON",           chainLabel:"TRX",           icon:"⛊", color:"#ff060a", usdPrice:0.14,   minBsv:5,     maxBsv:50000 },
  { symbol:"LTC",   name:"Litecoin",         chain:"Litecoin",       chainLabel:"LTC",           icon:"Ł", color:"#345d9d", usdPrice:82,     minBsv:0.1,   maxBsv:50000 },
  { symbol:"BCH",   name:"Bitcoin Cash",     chain:"Bitcoin Cash",   chainLabel:"BCH",           icon:"₿", color:"#8dc351", usdPrice:470,    minBsv:0.05,  maxBsv:50000 },
  { symbol:"DOT",   name:"Polkadot",         chain:"Polkadot",       chainLabel:"DOT",           icon:"⬡", color:"#e6007a", usdPrice:7.1,    minBsv:1,     maxBsv:50000 },
  { symbol:"LINK",  name:"Chainlink",        chain:"Ethereum",       chainLabel:"ETH (ERC20)",   icon:"⬡", color:"#375bd2", usdPrice:14.5,   minBsv:0.5,   maxBsv:50000 },
  { symbol:"UNI",   name:"Uniswap",          chain:"Ethereum",       chainLabel:"ETH (ERC20)",   icon:"🦄", color:"#ff007a", usdPrice:9.8,    minBsv:0.5,   maxBsv:50000 },
  { symbol:"AAVE",  name:"Aave",             chain:"Ethereum",       chainLabel:"ETH (ERC20)",   icon:"⬡", color:"#b6509e", usdPrice:98,     minBsv:0.1,   maxBsv:50000 },
  { symbol:"MATIC", name:"Polygon",          chain:"Polygon",        chainLabel:"MATIC",         icon:"⬡", color:"#8247e5", usdPrice:0.69,   minBsv:5,     maxBsv:50000 },
  { symbol:"ARB",   name:"Arbitrum",         chain:"Arbitrum",       chainLabel:"ARB",           icon:"⬡", color:"#28a0f0", usdPrice:1.2,    minBsv:2,     maxBsv:50000 },
  { symbol:"OP",    name:"Optimism",         chain:"Optimism",       chainLabel:"OP",            icon:"⬡", color:"#ff0420", usdPrice:2.1,    minBsv:2,     maxBsv:50000 },
  { symbol:"AVAX",  name:"Avalanche",        chain:"Avalanche",      chainLabel:"AVAX C-Chain",  icon:"▲", color:"#e84142", usdPrice:37,     minBsv:0.2,   maxBsv:50000 },
  { symbol:"ATOM",  name:"Cosmos",           chain:"Cosmos",         chainLabel:"ATOM",          icon:"⬡", color:"#2e3148", usdPrice:8.9,    minBsv:0.5,   maxBsv:50000 },
  { symbol:"ICP",   name:"Internet Computer",chain:"ICP",            chainLabel:"ICP",           icon:"∞", color:"#29abe2", usdPrice:12.3,   minBsv:0.5,   maxBsv:50000 },
  { symbol:"ALD",   name:"AladdinDAO",       chain:"Ethereum",       chainLabel:"ETH (ERC20)",   icon:"⬡", color:"#627eea", usdPrice:0.12,   minBsv:5,     maxBsv:50000 },
  { symbol:"ALE",   name:"ALE",              chain:"BNB Smart Chain",chainLabel:"BSC (BEP20)",   icon:"⬡", color:"#f0b90b", usdPrice:0.08,   minBsv:5,     maxBsv:50000 },
  { symbol:"ALEPH", name:"Aleph.im",         chain:"Ethereum",       chainLabel:"ETH (ERC20)",   icon:"⬡", color:"#627eea", usdPrice:0.19,   minBsv:5,     maxBsv:50000 },
  { symbol:"SUI",   name:"Sui",              chain:"Sui",            chainLabel:"SUI",           icon:"⬡", color:"#4da2ff", usdPrice:1.8,    minBsv:1,     maxBsv:50000 },
  { symbol:"APT",   name:"Aptos",            chain:"Aptos",          chainLabel:"APT",           icon:"◆", color:"#00b3b3", usdPrice:9.2,    minBsv:0.5,   maxBsv:50000 },
  { symbol:"FTM",   name:"Fantom",           chain:"Fantom",         chainLabel:"FTM",           icon:"⬡", color:"#1969ff", usdPrice:0.73,   minBsv:3,     maxBsv:50000 },
  { symbol:"INJ",   name:"Injective",        chain:"Injective",      chainLabel:"INJ",           icon:"⬡", color:"#00b2ff", usdPrice:26,     minBsv:0.2,   maxBsv:50000 },
  { symbol:"ALGO",  name:"Algorand",         chain:"Algorand",       chainLabel:"ALGO",          icon:"⬡", color:"#000000", usdPrice:0.19,   minBsv:5,     maxBsv:50000 },
  { symbol:"XLM",   name:"Stellar",          chain:"Stellar",        chainLabel:"XLM",           icon:"✦", color:"#000000", usdPrice:0.11,   minBsv:10,    maxBsv:50000 },
  { symbol:"VET",   name:"VeChain",          chain:"VeChain",        chainLabel:"VET",           icon:"⬡", color:"#15bdff", usdPrice:0.038,  minBsv:20,    maxBsv:50000 },
];

const BSV_USD_PRICE = 14.59;

function BsvQuickSwap() {
  const [sendAmount, setSendAmount]   = useState("");
  const [search, setSearch]           = useState("");
  const [selectedCoin, setSelectedCoin] = useState<QuickCoin | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [step, setStep]               = useState<"idle"|"confirm"|"pending"|"done">("idle");
  const [timer, setTimer]             = useState(8);
  const dropRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const filteredCoins = useMemo(() =>
    search.length === 0
      ? QUICK_COINS
      : QUICK_COINS.filter(c =>
          c.symbol.toLowerCase().includes(search.toLowerCase()) ||
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.chain.toLowerCase().includes(search.toLowerCase())
        ),
  [search]);

  const bsvAmount    = parseFloat(sendAmount || "0");
  const bsvUsd       = bsvAmount * BSV_USD_PRICE;
  const receiveAmt   = selectedCoin && bsvUsd > 0 ? bsvUsd / selectedCoin.usdPrice : 0;
  const rate         = selectedCoin ? (BSV_USD_PRICE / selectedCoin.usdPrice).toFixed(6) : null;
  const minBsv       = selectedCoin?.minBsv ?? 0;
  const maxBsv       = selectedCoin?.maxBsv ?? 0;
  const isInsuf      = bsvAmount > 0 && bsvAmount < minBsv;
  const isOver       = bsvAmount > maxBsv;
  const canContinue  = selectedCoin && bsvAmount >= minBsv && bsvAmount <= maxBsv;

  /* Close dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Countdown timer for "pending" step */
  useEffect(() => {
    if (step === "pending") {
      setTimer(8);
      timerRef.current = setInterval(() => {
        setTimer(t => {
          if (t <= 1) { clearInterval(timerRef.current!); setStep("done"); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step]);

  const handleContinue = () => {
    if (!canContinue) return;
    if (step === "idle") { setStep("confirm"); return; }
    if (step === "confirm") { setStep("pending"); return; }
  };

  const handleReset = () => {
    setStep("idle"); setSendAmount(""); setSelectedCoin(null); setSearch(""); setTimer(8);
  };

  return (
    <div className="max-w-lg mx-auto">

      {/* Card */}
      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-xl">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-secondary/40">
          <div className="w-9 h-9 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
            <span className="text-green-400 text-base font-black">₿</span>
          </div>
          <div>
            <div className="font-bold text-sm">BSV Quick Swap</div>
            <div className="text-[11px] text-muted-foreground">Powered by OrahDEX Routing</div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-green-400/70 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live rates
          </div>
        </div>

        {step === "done" ? (
          /* ── Success state ── */
          <div className="p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-green-400">Swap Initiated!</div>
              <div className="text-sm text-muted-foreground mt-1">
                Your {bsvAmount} BSV → {receiveAmt.toFixed(6)} {selectedCoin?.symbol} swap is being processed
              </div>
            </div>
            <div className="w-full bg-secondary rounded-2xl p-4 text-left space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">You sent</span>
                <span className="font-semibold">{bsvAmount} BSV</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">You receive</span>
                <span className="font-semibold text-green-400">{receiveAmt.toFixed(6)} {selectedCoin?.symbol}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Destination chain</span>
                <span className="font-semibold">{selectedCoin?.chainLabel}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Status</span>
                <span className="text-amber-400 font-semibold flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Processing
                </span>
              </div>
            </div>
            <button onClick={handleReset}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all">
              New Swap
            </button>
          </div>
        ) : step === "confirm" ? (
          /* ── Confirm state ── */
          <div className="p-5 space-y-4">
            <div className="text-sm font-semibold text-center text-muted-foreground">Review your swap</div>
            <div className="bg-secondary rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                    <span className="text-green-400 text-sm font-black">₿</span>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">You send</div>
                    <div className="font-bold">{bsvAmount} BSV</div>
                    <div className="text-[11px] text-muted-foreground">${bsvUsd.toFixed(2)} USD</div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
                <div className="flex items-center gap-2 text-right">
                  <div>
                    <div className="text-xs text-muted-foreground">You receive</div>
                    <div className="font-bold text-green-400">{receiveAmt.toFixed(6)} {selectedCoin?.symbol}</div>
                    <div className="text-[11px] text-muted-foreground">{selectedCoin?.chainLabel}</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-lg">
                    {selectedCoin?.icon}
                  </div>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Rate</span><span>1 BSV = {rate} {selectedCoin?.symbol}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Network fee</span><span className="text-green-400">~0.001 BSV</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Estimated time</span><span>~5–15 min</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Settlement</span><span>BSV on-chain</span></div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("idle")}
                className="flex-1 py-3 rounded-2xl border border-border text-muted-foreground font-semibold hover:text-foreground transition-all text-sm">
                Back
              </button>
              <button onClick={handleContinue}
                className="flex-1 py-3 rounded-2xl bg-green-500 text-black font-bold hover:bg-green-400 transition-all text-sm">
                Confirm Swap
              </button>
            </div>
          </div>
        ) : (
          /* ── Main form state ── */
          <div className="p-5 space-y-3">

            {/* You send — BSV (fixed) */}
            <div className="bg-secondary rounded-2xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-muted-foreground font-medium">You send</span>
                <span className="text-[10px] text-muted-foreground">
                  Min: <span className="text-green-400">{selectedCoin ? `${selectedCoin.minBsv} BSV` : "—"}</span>
                  &nbsp;·&nbsp;
                  Max: <span className="text-green-400">{selectedCoin ? `${selectedCoin.maxBsv.toLocaleString()} BSV` : "—"}</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={sendAmount}
                  onChange={e => setSendAmount(e.target.value)}
                  placeholder="0.67885268"
                  className="flex-1 bg-transparent text-xl font-bold focus:outline-none min-w-0 text-foreground"
                />
                <div className="flex items-center gap-2 shrink-0 bg-card border border-border rounded-xl px-3 py-2">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                    <span className="text-green-400 text-xs font-black">₿</span>
                  </div>
                  <span className="font-bold text-sm">BSV</span>
                  <span className="text-[10px] text-muted-foreground ml-1">BSV</span>
                </div>
              </div>
              {bsvUsd > 0 && (
                <div className="text-xs text-muted-foreground mt-1">≈ ${bsvUsd.toFixed(2)} USD · 1 BSV = ${BSV_USD_PRICE} USD</div>
              )}
              {isInsuf && (
                <div className="text-[11px] text-red-400 mt-1">
                  Insufficient — Min: {minBsv} BSV, Max: {maxBsv.toLocaleString()} BSV. You have: 9.3e-7 BSV
                </div>
              )}
            </div>

            {/* You get — searchable dropdown */}
            <div className="bg-secondary rounded-2xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-muted-foreground font-medium">You get</span>
                {selectedCoin && receiveAmt > 0 && (
                  <span className="text-xs font-mono text-green-400">≈ {receiveAmt.toFixed(6)} {selectedCoin.symbol}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Estimated output */}
                <div className="flex-1 text-xl font-bold text-muted-foreground">
                  {selectedCoin && receiveAmt > 0 ? receiveAmt.toFixed(8) : "0.00012871"}
                </div>

                {/* Coin selector */}
                <div className="relative shrink-0" ref={dropRef}>
                  <button
                    onClick={() => setShowDropdown(p => !p)}
                    className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 hover:border-primary/40 transition-all"
                  >
                    {selectedCoin ? (
                      <>
                        <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-sm" style={{ background: `${selectedCoin.color}20` }}>
                          {selectedCoin.icon}
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-sm">{selectedCoin.symbol}</div>
                          <div className="text-[9px] text-muted-foreground leading-none">{selectedCoin.chainLabel}</div>
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">Select coin</span>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-1" />
                  </button>

                  {/* Dropdown */}
                  {showDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                      {/* Search */}
                      <div className="p-3 border-b border-border">
                        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
                          <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="bg-transparent text-sm focus:outline-none flex-1 placeholder:text-muted-foreground"
                          />
                        </div>
                      </div>
                      {/* Coin list */}
                      <div className="max-h-72 overflow-y-auto">
                        {filteredCoins.map(coin => (
                          <button
                            key={`${coin.symbol}-${coin.chain}`}
                            onClick={() => { setSelectedCoin(coin); setShowDropdown(false); setSearch(""); }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left"
                          >
                            <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-lg shrink-0" style={{ background: `${coin.color}18` }}>
                              {coin.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm">{coin.symbol}</div>
                              <div className="text-[11px] text-muted-foreground truncate">{coin.name}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs font-semibold" style={{ color: coin.color }}>{coin.chainLabel}</div>
                              <div className="text-[10px] text-muted-foreground">${coin.usdPrice.toLocaleString()}</div>
                            </div>
                          </button>
                        ))}
                        {filteredCoins.length === 0 && (
                          <div className="py-8 text-center text-sm text-muted-foreground">No coins found</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {selectedCoin && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  1 BSV = {rate} {selectedCoin.symbol}
                </div>
              )}
            </div>

            {/* Rate info row */}
            {selectedCoin && (
              <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                <span>Network: {selectedCoin.chainLabel}</span>
                <span>Est. time: ~5–15 min</span>
              </div>
            )}

            {/* Continue button */}
            <button
              onClick={handleContinue}
              disabled={!canContinue}
              className={cn(
                "w-full py-4 rounded-2xl font-bold text-base transition-all",
                canContinue
                  ? "bg-green-500 text-black hover:bg-green-400 active:scale-[0.98]"
                  : "bg-secondary text-muted-foreground cursor-not-allowed"
              )}
            >
              {step === "pending" ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing… {timer}s
                </span>
              ) : canContinue ? "Continue" : selectedCoin ? "Enter amount" : "Select a coin to continue"}
            </button>

            {/* Info note */}
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground px-1">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                BSV Quick Swap uses OrahDEX's cross-chain routing — atomic HTLC locks ensure your BSV is only released when the destination coin is confirmed.
                BSV settlement on-chain.
              </span>
            </div>

          </div>
        )}
      </div>

      {/* Powered by note */}
      <div className="mt-4 text-center text-[11px] text-muted-foreground">
        Inspired by HandCash's cross-chain bridge model · Powered by OrahDEX HTLC routing
      </div>
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

  const { address: evmAddress, network, chainId } = useWalletStore();
  const { toast } = useToast();

  const [pageTab, setPageTab] = useState<"bsvswap" | "swap" | "deposit" | "withdraw">("bsvswap");

  const [fromChain, setFromChain] = useState<Chain>(CHAINS[0]);
  const [toChain, setToChain]     = useState<Chain>(CHAINS[2]);
  const [fromToken, setFromToken] = useState("BSV");
  const [toToken, setToToken]     = useState("ETH");
  const [amount, setAmount]       = useState("");
  const [slippage, setSlippage]   = useState(0.5);
  const [customSlip, setCustomSlip] = useState("");
  const [mode, setMode]           = useState<SwapMode>("htlc");
  const [simStep, setSimStep]     = useState(0);
  const [simRunning, setSimRunning] = useState(false);

  // ── HTLC real flow state ──────────────────────────────────────────────────
  const [htlcLock, setHtlcLock]       = useState<HtlcLock | null>(null);
  const [htlcLoading, setHtlcLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const isSameChain  = fromChain.id === toChain.id;
  const htlcTime     = mode === "htlc" ? "~5–30 min" : "~30–60 sec";
  const isBsvSource  = fromChain.id === "bsv" && fromToken === "BSV";
  const isEvmDest    = ["eth","arb","op","base","poly"].includes(toChain.id);

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
      { icon: <Layers className="w-3.5 h-3.5" />, label: `Mint wrapped ${fromToken} on EVM`, detail: `1:1 representation minted on Ethereum/L2` },
      { icon: <ArrowLeftRight className="w-3.5 h-3.5" />, label: `Swap w${fromToken} → ${toToken} on AMM`, detail: `OrahDEX AMM pools with 0.3% fee` },
      { icon: <Globe className="w-3.5 h-3.5" />,  label: `Redeem ${toToken} on ${toChain.name}`, detail: `Burn wrapped token → release native asset` },
    ];
  }, [mode, fromChain, toChain, fromToken, toToken]);

  const handleSwapChains = () => {
    const fc = fromChain, tc = toChain, ft = fromToken, tt = toToken;
    setFromChain(tc); setToChain(fc); setFromToken(tt); setToToken(ft);
  };

  // ── Poll HTLC status ──────────────────────────────────────────────────────
  const pollHtlc = useCallback(async (lockId: string) => {
    try {
      const res = await fetch(`/api/bridge/htlc/${lockId}`);
      if (!res.ok) return;
      const data = await res.json() as HtlcLock & { id: string; amountBsv: string };
      const lock: HtlcLock = {
        lockId:         data.id ?? lockId,
        htlcAddress:    data.htlcAddress,
        redeemScript:   data.redeemScript,
        secretHash:     data.secretHash,
        amountBsv:      parseFloat(data.amountBsv as any),
        locktimeBlocks: data.locktimeBlocks,
        currentBlock:   data.currentBlock ?? 0,
        expiresIn:      data.expiresIn ?? "~24 hours",
        status:         data.status,
        fundingTxid:    data.fundingTxid,
        mintTxHash:     data.mintTxHash,
      };
      setHtlcLock(lock);

      // Stop polling once terminal state reached
      if (["complete", "refunded", "expired"].includes(lock.status)) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (lock.status === "complete") {
          toast({ title: "Bridge Complete!", description: "wBSV minted to your EVM address." });
        }
      }
    } catch { /* ignore transient errors */ }
  }, [toast]);

  // Start/stop polling when htlcLock changes
  useEffect(() => {
    if (!htlcLock?.lockId) return;
    if (["complete", "refunded", "expired"].includes(htlcLock.status)) return;

    pollRef.current = setInterval(() => pollHtlc(htlcLock.lockId), 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [htlcLock?.lockId, htlcLock?.status, pollHtlc]);

  // ── Initiate real HTLC ────────────────────────────────────────────────────
  const handleInitiateHtlc = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || isSameChain) return;

    setHtlcLoading(true);
    try {
      const res = await fetch("/api/bridge/htlc/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountBsv:           isBsvSource ? amt : undefined,
          recipientEvmAddress: evmAddress ?? undefined,
          evmChainId:          chainId ?? 1,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({
          title: "Failed to create HTLC",
          description: err?.error ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }

      const data = await res.json() as HtlcLock & { lockId: string };
      setHtlcLock({
        lockId:         data.lockId,
        htlcAddress:    data.htlcAddress,
        redeemScript:   data.redeemScript,
        secretHash:     data.secretHash,
        amountBsv:      data.amountBsv,
        locktimeBlocks: data.locktimeBlocks,
        currentBlock:   data.currentBlock ?? 0,
        expiresIn:      data.expiresIn ?? "~24 hours",
        status:         "pending",
        instructions:   data.instructions,
      });
    } catch (err: any) {
      toast({
        title: "Network error",
        description: "Could not reach the bridge API. Please try again.",
        variant: "destructive",
      });
    } finally {
      setHtlcLoading(false);
    }
  };

  // ── Wrapped bridge simulation ─────────────────────────────────────────────
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

  // ── Cancel HTLC ───────────────────────────────────────────────────────────
  const handleCancelHtlc = async () => {
    if (!htlcLock) return;
    try {
      await fetch(`/api/bridge/htlc/${htlcLock.lockId}/cancel`, { method: "POST" });
      setHtlcLock(null);
      if (pollRef.current) clearInterval(pollRef.current);
    } catch {
      toast({ title: "Cancel failed", description: "Try again in a moment.", variant: "destructive" });
    }
  };

  const handleCloseHtlc = () => {
    setHtlcLock(null);
    if (pollRef.current) clearInterval(pollRef.current);
    setAmount("");
  };

  const handleBridgeClick = () => {
    if (mode === "htlc") handleInitiateHtlc();
    else handleSimulate();
  };

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-8 w-full">

      {/* HTLC deposit modal */}
      {htlcLock && (
        <HtlcDepositPanel
          lock={htlcLock}
          onCancel={handleCancelHtlc}
          onClose={handleCloseHtlc}
        />
      )}

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
          Move assets between L1 chains (BSV, BTC, ETH, SOL) and L2 rollups (Arbitrum, Optimism, Base). Direct L1/L2 trading with original coins — deposits and withdrawals go through canonical bridge layers.
        </p>
      </div>

      {/* ── Top-level page tabs ── */}
      <div className="flex gap-1 p-1 bg-secondary rounded-2xl mb-8 w-full max-w-xl">
        {([
          { id: "bsvswap",  icon: <ArrowRight className="w-4 h-4" />,     label: "BSV → Any" },
          { id: "swap",     icon: <ArrowLeftRight className="w-4 h-4" />, label: "Swap"       },
          { id: "deposit",  icon: <ArrowDown className="w-4 h-4" />,      label: "Deposit"    },
          { id: "withdraw", icon: <ArrowUp className="w-4 h-4" />,        label: "Withdraw"   },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setPageTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-sm font-semibold transition-all",
              pageTab === tab.id
                ? tab.id === "bsvswap"
                  ? "bg-green-500/20 text-green-400 shadow-sm border border-green-500/30"
                  : tab.id === "deposit"
                    ? "bg-green-500/20 text-green-400 shadow-sm border border-green-500/20"
                    : tab.id === "withdraw"
                      ? "bg-orange-500/20 text-orange-400 shadow-sm border border-orange-500/20"
                      : "bg-card text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── BSV Quick Swap (HandCash-style) ── */}
      {pageTab === "bsvswap" && <BsvQuickSwap />}

      {/* ── Deposit / Withdraw canonical panels ── */}
      {pageTab === "deposit"  && <CanonicalPanel mode="deposit"  />}
      {pageTab === "withdraw" && <CanonicalPanel mode="withdraw" />}
      {pageTab !== "swap" && pageTab !== "bsvswap" && null}

      {pageTab === "swap" && <>

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
            {(["htlc", "wrapped"] as SwapMode[]).map(m => (
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
              ? "Atomic HTLC: trustless peer-to-peer swap using Hash Time-Locked Contracts. Real P2SH HTLC script generated server-side. Send BSV to the HTLC address — bridge detects and mints wBSV on EVM."
              : "Wrapped Bridge: assets locked in multi-sig vault, wrapped tokens minted on EVM for AMM trading. Fast (~30–60 sec) with pooled liquidity. Requires trusting bridge operators."
            }
          </div>

          {/* HTLC: BSV→EVM wallet info banner */}
          {mode === "htlc" && isBsvSource && (
            <div className={cn(
              "flex items-start gap-2.5 p-3 rounded-xl border text-xs",
              evmAddress
                ? "border-green-500/20 bg-green-500/5 text-green-400"
                : "border-border bg-secondary/30 text-muted-foreground"
            )}>
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {evmAddress
                ? `wBSV will mint to: ${evmAddress.slice(0, 10)}…${evmAddress.slice(-6)}`
                : "Connect an EVM wallet to specify the wBSV recipient address."}
            </div>
          )}

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
            onClick={handleBridgeClick}
            disabled={!amount || parseFloat(amount) <= 0 || isSameChain || simRunning || htlcLoading}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2.5 bg-gradient-to-r from-primary to-green-500 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {htlcLoading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Generating HTLC…</>
            ) : simRunning ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Routing…</>
            ) : (
              <><ArrowRight className="w-5 h-5" /> {mode === "htlc" ? "Initiate HTLC Lock" : "Bridge Assets"}</>
            )}
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
              {mode === "htlc" && (
                <>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-bold text-orange-400">
                    <Lock className="w-3 h-3" /> HTLC
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </>
              )}
              <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold", toChain.bgColor, toChain.color)}>
                <span>{toChain.icon}</span> {toChain.name}
              </div>
            </div>
          </div>

          {/* HTLC Script info card */}
          {mode === "htlc" && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Lock className="w-4 h-4 text-orange-400" />
                HTLC Script
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { label: "Script type", value: "P2SH HTLC" },
                  { label: "Hash function", value: "SHA-256" },
                  { label: "Claim path", value: "Reveal preimage → relayer claims" },
                  { label: "Refund path", value: "CLTV + 144 blocks (~24 hrs)" },
                  { label: "Network", value: "BSV Mainnet" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-semibold text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security callout */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Shield className="w-4 h-4 text-primary" />
              Security Notes
            </div>
            <ul className="space-y-2">
              {[
                { label: "Non-custodial HTLC", detail: "Funds locked by script — not by OrahDEX" },
                { label: "HTLC timeouts", detail: "144-block refund window prevents stuck funds" },
                { label: "Slippage protection", detail: "Min received guaranteed; tx reverts if breached" },
                { label: "On-chain verifiable", detail: "Redeem script and secret hash are public" },
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
      </>}
    </div>
  );
}
