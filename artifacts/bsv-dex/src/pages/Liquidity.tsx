import { useState, useCallback, useEffect } from "react";
import { CoinLogo, COIN_COLORS } from "@/components/CoinLogo";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import {
  Droplets, Plus, Minus, TrendingUp, Zap, Award, BarChart3,
  X, Info, AlertTriangle, ChevronRight, BookOpen, Wallet,
  Calculator, ArrowRight, Code2, ExternalLink, CheckCircle2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useEvmBalances, type TokenBalance } from "@/hooks/useEvmBalances";
import { useLiquidityStore } from "@/store/useLiquidityStore";
import {
  addLiquidityOnChain, addLiquidityLive, getLiquidityMode,
  EXPLORER_TX, CHAIN_NAMES, type LiquidityTxStatus,
} from "@/lib/onChainLiquidity";
import { useLpBalance } from "@/hooks/useLpBalance";
import { hasOrahAmm } from "@/lib/orahAmmAddresses";

const LP_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Tolerance for floating-point balance comparisons (e.g. MAX button round-trips). */
const EPSILON = 1e-7;

function useBackendBalances(address: string | null) {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchBalances = useCallback(async () => {
    if (!address) { setBalances([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`${LP_BASE}/api/portfolio?walletAddress=${encodeURIComponent(address)}`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      if (data.balances && Array.isArray(data.balances)) {
        setBalances(data.balances.map((a: any) => ({
          symbol: a.asset ?? "",
          name: a.asset ?? "",
          amount: parseFloat(String(a.available ?? a.free ?? "0")),
          usdValue: parseFloat(String(a.valueUSD ?? "0")),
          price: parseFloat(String(a.price ?? "0")),
          change24h: 0,
          color: "#888",
          decimals: 6,
        })));
      }
    } catch {}
    setLoading(false);
  }, [address]);
  useEffect(() => { fetchBalances(); }, [fetchBalances]);
  return { balances, refresh: fetchBalances, loading };
}

// ─── Protocol fee split: 5/6 to LPs, 1/6 to protocol treasury ────────────────
// e.g. 0.3% pool fee → 0.25% to LPs + 0.05% to protocol (mirrors Uniswap v2)
const LP_FEE_RATIO       = 5 / 6;
const PROTOCOL_FEE_RATIO = 1 / 6;

function lpFee(poolFee: number)       { return poolFee * LP_FEE_RATIO; }
function protocolFee(poolFee: number) { return poolFee * PROTOCOL_FEE_RATIO; }

// ─── Pool data ────────────────────────────────────────────────────────────────
interface Pool {
  id: string; base: string; quote: string;
  tvl: number; vol24: number; fee: number; farmApr: number; userLp: number;
  chain: string;
  chainId?: number;
}

const POOLS: Pool[] = [
  // ── BSV settlement (virtual AMM) ──────────────────────────────────────────
  { id: "btc-usdt",  base: "BTC",  quote: "USDT", tvl: 423_600_000, vol24: 98_200_000,  fee: 0.3,  farmApr: 4.2,  userLp: 0,      chain: "BSV" },
  { id: "eth-usdt",  base: "ETH",  quote: "USDT", tvl: 187_400_000, vol24: 44_100_000,  fee: 0.3,  farmApr: 6.1,  userLp: 0,      chain: "BSV" },
  { id: "sol-usdt",  base: "SOL",  quote: "USDT", tvl: 95_700_000,  vol24: 21_300_000,  fee: 0.3,  farmApr: 8.4,  userLp: 0,      chain: "BSV" },
  { id: "bsv-usdt",  base: "BSV",  quote: "USDT", tvl: 8_240_000,   vol24: 1_920_000,   fee: 0.2,  farmApr: 18.2, userLp: 1240.5, chain: "BSV" },
  { id: "bnb-usdt",  base: "BNB",  quote: "USDT", tvl: 67_300_000,  vol24: 14_800_000,  fee: 0.3,  farmApr: 5.9,  userLp: 0,      chain: "BSV" },
  { id: "xrp-usdt",  base: "XRP",  quote: "USDT", tvl: 52_100_000,  vol24: 12_700_000,  fee: 0.3,  farmApr: 7.3,  userLp: 0,      chain: "BSV" },
  { id: "ada-usdt",  base: "ADA",  quote: "USDT", tvl: 29_800_000,  vol24: 6_400_000,   fee: 0.3,  farmApr: 9.1,  userLp: 640.0,  chain: "BSV" },
  { id: "doge-usdt", base: "DOGE", quote: "USDT", tvl: 41_200_000,  vol24: 9_300_000,   fee: 0.25, farmApr: 7.8,  userLp: 0,      chain: "BSV" },
  { id: "dot-usdt",  base: "DOT",  quote: "USDT", tvl: 18_600_000,  vol24: 3_900_000,   fee: 0.3,  farmApr: 11.2, userLp: 0,      chain: "BSV" },
  { id: "link-usdt", base: "LINK", quote: "USDT", tvl: 22_900_000,  vol24: 5_100_000,   fee: 0.3,  farmApr: 10.1, userLp: 0,      chain: "BSV" },
  { id: "bsv-btc",   base: "BSV",  quote: "BTC",  tvl: 4_100_000,   vol24: 980_000,     fee: 0.2,  farmApr: 22.8, userLp: 320.0,  chain: "BSV" },
  { id: "eth-btc",   base: "ETH",  quote: "BTC",  tvl: 76_500_000,  vol24: 17_200_000,  fee: 0.3,  farmApr: 5.3,  userLp: 0,      chain: "BSV" },
  // ── Tron ecosystem ──────────────────────────────────────────────────────────
  { id: "trx-usdt",  base: "TRX",  quote: "USDT", tvl: 148_200_000, vol24: 38_700_000,  fee: 0.25, farmApr: 12.4, userLp: 0,      chain: "TRX" },
  { id: "btt-usdt",  base: "BTT",  quote: "USDT", tvl: 19_600_000,  vol24: 5_800_000,   fee: 0.3,  farmApr: 24.6, userLp: 0,      chain: "TRX" },
  { id: "btt-trx",   base: "BTT",  quote: "TRX",  tvl: 8_400_000,   vol24: 2_100_000,   fee: 0.3,  farmApr: 31.2, userLp: 0,      chain: "TRX" },
  { id: "win-trx",   base: "WIN",  quote: "TRX",  tvl: 4_200_000,   vol24: 1_050_000,   fee: 0.3,  farmApr: 28.8, userLp: 0,      chain: "TRX" },
  { id: "jst-usdt",  base: "JST",  quote: "USDT", tvl: 6_800_000,   vol24: 1_620_000,   fee: 0.3,  farmApr: 19.4, userLp: 0,      chain: "TRX" },
  { id: "trx-btc",   base: "TRX",  quote: "BTC",  tvl: 32_100_000,  vol24: 8_900_000,   fee: 0.3,  farmApr: 9.7,  userLp: 0,      chain: "TRX" },
  // ── Base mainnet (chainId 8453) — Uniswap V3 on-chain ────────────────────
  { id: "eth-usdt-base", base: "ETH", quote: "USDT", tvl: 28_400_000, vol24: 7_200_000,  fee: 0.3, farmApr: 8.2, userLp: 0, chain: "Base", chainId: 8453 },
  { id: "eth-usdc-base", base: "ETH", quote: "USDC", tvl: 35_600_000, vol24: 9_100_000,  fee: 0.3, farmApr: 7.8, userLp: 0, chain: "Base", chainId: 8453 },
  { id: "btc-usdt-base", base: "BTC", quote: "USDT", tvl: 22_100_000, vol24: 5_400_000,  fee: 0.3, farmApr: 5.1, userLp: 0, chain: "Base", chainId: 8453 },
  { id: "btc-usdc-base", base: "BTC", quote: "USDC", tvl: 18_800_000, vol24: 4_300_000,  fee: 0.3, farmApr: 5.8, userLp: 0, chain: "Base", chainId: 8453 },
  // ── Ethereum mainnet (chainId 1) — Uniswap V3 on-chain ───────────────────
  { id: "eth-usdt-eth",  base: "ETH", quote: "USDT", tvl: 82_400_000, vol24: 19_300_000, fee: 0.3, farmApr: 4.2, userLp: 0, chain: "Ethereum", chainId: 1 },
  { id: "eth-usdc-eth",  base: "ETH", quote: "USDC", tvl: 91_200_000, vol24: 21_800_000, fee: 0.3, farmApr: 3.9, userLp: 0, chain: "Ethereum", chainId: 1 },
  { id: "btc-usdt-eth",  base: "BTC", quote: "USDT", tvl: 67_800_000, vol24: 15_200_000, fee: 0.3, farmApr: 3.4, userLp: 0, chain: "Ethereum", chainId: 1 },
  { id: "btc-usdc-eth",  base: "BTC", quote: "USDC", tvl: 52_400_000, vol24: 12_100_000, fee: 0.3, farmApr: 3.7, userLp: 0, chain: "Ethereum", chainId: 1 },
];

// Approximate spot prices used only for UI ratio calculations
const SPOT: Record<string, number> = {
  BTC: 83_000, ETH: 1_800, SOL: 130, BSV: 55, BNB: 580,
  XRP: 0.52, ADA: 0.44, DOGE: 0.12, DOT: 6.8, LINK: 14.5,
  USDT: 1, USDC: 1,
  TRX: 0.24, BTT: 0.0000009, WIN: 0.00006, JST: 0.025,
};

// Pool share formatted with enough decimal places to show the first significant
// digit — toFixed(4) silently truncates tiny-but-real stakes to "0.0000%".
function fmtPoolShare(userLp: number, tvl: number): string {
  const LP_PRICE = 12.5;
  if (userLp <= 0 || tvl <= 0) return "0.0000%";
  const share = (userLp * LP_PRICE / tvl) * 100;
  if (share <= 0) return "0.0000%";
  if (share >= 0.00005)   return share.toFixed(4) + "%";
  if (share >= 0.0000005) return share.toFixed(7) + "%";
  return "< 0.0000005%";
}

// Pool APR derived from AMM fee revenue: vol24 * fee% / tvl * 365
function poolApr(p: typeof POOLS[0]) {
  return (p.vol24 * (p.fee / 100) / p.tvl) * 365 * 100;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtTvl(n: number) {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function TokenPair({ base, quote }: { base: string; quote: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        <CoinLogo symbol={base}  size={32} ring />
        <CoinLogo symbol={quote} size={32} ring />
      </div>
      <span className="text-sm font-bold">{base}/{quote}</span>
    </div>
  );
}

// ─── AMM Swap Simulator ───────────────────────────────────────────────────────
// Implements the x·y=k formula from the document:
//   amountInWithFee = amountIn × (1 − fee)
//   Δy = (amountInWithFee × reserveOut) / (reserveIn + amountInWithFee)
//   price impact = amountIn / (reserveIn + amountIn) × 100
function AmmSwapSimulator() {
  const [poolId, setPoolId]   = useState("btc-usdt");
  const [amtIn, setAmtIn]     = useState("");
  const [direction, setDir]   = useState<"AtoB" | "BtoA">("AtoB");

  const pool = POOLS.find(p => p.id === poolId) ?? POOLS[0];

  // Derive reserves from TVL + spot prices (equal-value 50/50 split)
  const priceA    = SPOT[pool.base]  ?? 1;
  const priceB    = SPOT[pool.quote] ?? 1;
  const reserveX  = pool.tvl / 2 / priceA;   // token A reserve
  const reserveY  = pool.tvl / 2 / priceB;   // token B reserve
  const k         = reserveX * reserveY;

  const tokenIn  = direction === "AtoB" ? pool.base  : pool.quote;
  const tokenOut = direction === "AtoB" ? pool.quote : pool.base;
  const resIn    = direction === "AtoB" ? reserveX : reserveY;
  const resOut   = direction === "AtoB" ? reserveY : reserveX;
  const priceIn  = direction === "AtoB" ? priceA : priceB;
  const priceOut = direction === "AtoB" ? priceB : priceA;

  const n = parseFloat(amtIn);
  const valid = !isNaN(n) && n > 0;

  const feeMultiplier  = 1 - pool.fee / 100;
  const amtInWithFee   = valid ? n * feeMultiplier : 0;
  const amtOut         = valid ? (amtInWithFee * resOut) / (resIn + amtInWithFee) : 0;
  const spotRate       = resOut / resIn;                          // y/x pool price
  const effectiveRate  = valid && n > 0 ? amtOut / n : spotRate; // Δy / Δx
  const priceImpact    = valid ? (n / (resIn + n)) * 100 : 0;
  const feeInTokenIn   = valid ? n * (pool.fee / 100) : 0;
  const feeLp          = feeInTokenIn * LP_FEE_RATIO;
  const feeProto       = feeInTokenIn * PROTOCOL_FEE_RATIO;
  const feeUsd         = feeInTokenIn * priceIn;
  const amtOutUsd      = amtOut * priceOut;
  const slippage       = valid && spotRate > 0 ? Math.abs(effectiveRate - spotRate) / spotRate * 100 : 0;

  const colorA = COIN_COLORS[pool.base]  ?? "#EAB308";
  const colorB = COIN_COLORS[pool.quote] ?? "#16a34a";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <Calculator size={16} className="text-primary shrink-0" />
        <span className="font-semibold text-sm">AMM Swap Simulator</span>
        <span className="ml-2 text-[10px] px-2 py-0.5 bg-primary/15 text-primary rounded font-bold">x·y=k</span>
        <span className="ml-auto text-xs text-muted-foreground">Live pool math — no wallet required</span>
      </div>

      <div className="p-5 grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
        {/* Input side */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
            <span>Input Pool</span>
          </div>
          <select
            value={poolId}
            onChange={e => { setPoolId(e.target.value); setAmtIn(""); }}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm font-semibold outline-none">
            {POOLS.map(p => (
              <option key={p.id} value={p.id}>{p.base}/{p.quote} — {p.fee}% fee</option>
            ))}
          </select>

          {/* Direction toggle */}
          <div className="flex rounded-xl overflow-hidden border border-border">
            <button onClick={() => { setDir("AtoB"); setAmtIn(""); }}
              className={cn("flex-1 py-1.5 text-xs font-bold transition-colors",
                direction === "AtoB" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/50")}>
              {pool.base} → {pool.quote}
            </button>
            <button onClick={() => { setDir("BtoA"); setAmtIn(""); }}
              className={cn("flex-1 py-1.5 text-xs font-bold transition-colors",
                direction === "BtoA" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/50")}>
              {pool.quote} → {pool.base}
            </button>
          </div>

          {/* Amount input */}
          <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3">
            <div className="text-xs text-muted-foreground mb-1">
              You send ({tokenIn}) · Pool reserve: {resIn.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 bg-transparent text-2xl font-bold outline-none"
                placeholder="0.00" type="number" min="0" step="any"
                value={amtIn} onChange={e => setAmtIn(e.target.value)} />
              <span className="text-sm font-bold" style={{ color: direction === "AtoB" ? colorA : colorB }}>{tokenIn}</span>
            </div>
            {valid && <div className="text-xs text-muted-foreground mt-1">≈ ${(n * priceIn).toFixed(2)} USD</div>}
          </div>

          {/* Quick amount buttons */}
          <div className="flex gap-1.5">
            {["0.01", "0.1", "1", "10"].map(v => (
              <button key={v} onClick={() => setAmtIn(v)}
                className="flex-1 py-1.5 rounded-lg text-xs font-bold border border-border hover:border-primary/40 text-muted-foreground hover:text-primary transition-colors">
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center justify-center pt-20">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
            <ArrowRight size={16} className="text-primary" />
          </div>
          <div className="text-[10px] text-muted-foreground mt-2 text-center">x·y=k</div>
        </div>

        {/* Output + math breakdown */}
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Output</div>

          {/* Output token box */}
          <div className={cn(
            "bg-secondary/50 border rounded-xl px-4 py-3 transition-colors",
            valid ? "border-primary/40" : "border-border"
          )}>
            <div className="text-xs text-muted-foreground mb-1">
              You receive ({tokenOut}) · Pool reserve: {resOut.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-2xl font-bold", valid ? "text-foreground" : "text-muted-foreground/40")}>
                {valid ? amtOut.toLocaleString(undefined, { maximumFractionDigits: 8 }) : "0.00"}
              </span>
              <span className="text-sm font-bold" style={{ color: direction === "AtoB" ? colorB : colorA }}>{tokenOut}</span>
            </div>
            {valid && <div className="text-xs text-muted-foreground mt-1">≈ ${amtOutUsd.toFixed(2)} USD</div>}
          </div>

          {/* Math breakdown */}
          <div className="bg-secondary/30 rounded-xl p-3 space-y-2 text-xs">
            <div className="font-bold text-muted-foreground uppercase tracking-wider text-[10px] mb-1">Calculation breakdown</div>
            {[
              ["Pool price (y/x)", `1 ${tokenIn} = ${spotRate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut}`],
              ["Effective rate", valid ? `1 ${tokenIn} = ${effectiveRate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut}` : "—"],
              ["Price impact", valid ? <span className={cn("font-bold", priceImpact < 0.5 ? "text-green-500" : priceImpact < 2 ? "text-yellow-500" : "text-red-500")}>{priceImpact.toFixed(4)}%</span> : "—"],
              ["Slippage vs spot", valid ? `${slippage.toFixed(4)}%` : "—"],
              ["Total fee paid", valid ? `${feeInTokenIn.toFixed(8)} ${tokenIn} ≈ $${feeUsd.toFixed(4)}` : "—"],
              ["→ LP share (5/6)", valid ? `${feeLp.toFixed(8)} ${tokenIn}` : "—"],
              ["→ Protocol (1/6)", valid ? `${feeProto.toFixed(8)} ${tokenIn}` : "—"],
              ["k = x·y (constant)", `${k.toExponential(4)}`],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between items-center">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-semibold text-right">{value}</span>
              </div>
            ))}
          </div>

          {/* Impact colour key */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Low (&lt;0.5%)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Medium (&lt;2%)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> High (&gt;2%)</span>
          </div>
        </div>
      </div>

      {/* Formula callout */}
      <div className="border-t border-border/50 px-5 py-3 bg-secondary/10 flex items-start gap-3">
        <Code2 size={13} className="text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed font-mono">
          Δy = (Δx × (1−fee) × y) / (x + Δx × (1−fee))
          &nbsp;·&nbsp; k = x·y&nbsp;·&nbsp; priceImpact = Δx / (x + Δx)
        </p>
      </div>
    </div>
  );
}

// ─── Add / Remove modal ───────────────────────────────────────────────────────
function LiquidityModal({
  pool, mode, onClose,
}: {
  pool: typeof POOLS[0] | null;
  mode: "add" | "remove";
  onClose: () => void;
}) {
  const [amtA, setAmtA] = useState("");
  const [amtB, setAmtB] = useState("");
  const [pct, setPct]   = useState(50);
  const [showIlInfo, setShowIlInfo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txStatus, setTxStatus] = useState<LiquidityTxStatus>({ step: "idle" });
  const { toast } = useToast();

  const { address, network, chainId: walletChainId, provider: walletProvider } = useWalletStore();
  const openWalletModal = useWalletModalStore((s) => s.open);
  const { addPosition, removePositionPct, getUserPositions } = useLiquidityStore();
  const walletConnected = !!address;
  const INTERNAL_PROVIDERS = ["orah-wallet", "passkey", "mobile-qr"];
  const isInternalWallet = !!walletProvider && INTERNAL_PROVIDERS.includes(walletProvider);
  const isEvm = !!address && !isInternalWallet && (network === "evm" || address.startsWith("0x"));
  const walletChain = walletChainId ?? 1;
  const targetChainId = pool?.chainId ?? walletChain;
  const wrongChain = !!(pool?.chainId && walletChainId && walletChainId !== pool.chainId);
  const { balances: evmBalances, refresh: refreshEvmBalances, loading: evmLoading } = useEvmBalances(isEvm ? address : null, walletChain);
  const { balances: backendBalances, refresh: refreshBackendBalances, loading: backendLoading } = useBackendBalances(address);
  const balances = isEvm ? evmBalances : backendBalances;
  const balancesLoading = isEvm ? evmLoading : backendLoading;

  const userPositions = address ? getUserPositions(address) : {};
  const myLpTokens   = pool ? (userPositions[pool.id]?.lpTokens ?? 0) : 0;

  const handleAmtAChange = useCallback((val: string, p: typeof POOLS[0]) => {
    setAmtA(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) {
      const priceA = SPOT[p.base]  ?? 1;
      const priceB = SPOT[p.quote] ?? 1;
      const ratio  = priceA / priceB;
      setAmtB((n * ratio).toFixed(6));
    } else {
      setAmtB("");
    }
  }, []);

  const handleAmtBChange = useCallback((val: string, p: typeof POOLS[0]) => {
    setAmtB(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) {
      const priceA = SPOT[p.base]  ?? 1;
      const priceB = SPOT[p.quote] ?? 1;
      const ratio  = priceB / priceA;
      setAmtA((n * ratio).toFixed(6));
    } else {
      setAmtA("");
    }
  }, []);

  const handleAdd = useCallback(async () => {
    if (!pool || !amtA || !amtB || submitting || !walletConnected || !address) return;
    const nA       = parseFloat(amtA);
    const nB       = parseFloat(amtB);
    const priceA_  = SPOT[pool.base]  ?? 1;
    const priceB_  = SPOT[pool.quote] ?? 1;
    const valueUsd = nA * priceA_ + nB * priceB_;
    const lpTokens = valueUsd / 12.5;

    if (balances.length > 0) {
      const balA = balances.find(b => b.symbol.toUpperCase() === pool.base.toUpperCase())?.amount ?? 0;
      const balB = balances.find(b => b.symbol.toUpperCase() === pool.quote.toUpperCase())?.amount ?? 0;
      if (nA > balA + EPSILON) {
        toast({ title: "Insufficient balance", description: `You only have ${balA.toFixed(6)} ${pool.base} but tried to add ${nA.toFixed(6)}.`, variant: "destructive" });
        return;
      }
      if (nB > balB + EPSILON) {
        toast({ title: "Insufficient balance", description: `You only have ${balB.toFixed(6)} ${pool.quote} but tried to add ${nB.toFixed(6)}.`, variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    setTxStatus({ step: "idle" });

    const mode = getLiquidityMode(targetChainId, pool.base, pool.quote, walletProvider);

    // ── Real on-chain Uniswap V3 deposit ────────────────────────────────────
    if (mode === "on_chain") {
      await addLiquidityOnChain({
        base:    pool.base,
        quote:   pool.quote,
        amountA: nA,
        amountB: nB,
        address,
        chainId: targetChainId,
        onStatus: (s) => {
          setTxStatus(s);
          if (s.step === "success") {
            addPosition(address, pool.id, s.lpTokens ?? lpTokens, s.valueUsd ?? valueUsd, { txHash: s.txHash, chainId: targetChainId });
            refreshEvmBalances();
            toast({
              title: "Liquidity added on-chain!",
              description: `Transaction confirmed. ${(s.lpTokens ?? lpTokens).toFixed(4)} LP tokens recorded.`,
            });
          }
        },
      });
      setSubmitting(false);
      return; // keep modal open so user can see tx link
    }

    // ── Live wallet mode (EVM connected, pair not yet on V3) ────────────────
    if (mode === "live") {
      await addLiquidityLive({
        base:     pool.base,
        quote:    pool.quote,
        amountA:  nA,
        amountB:  nB,
        address,
        chainId:  targetChainId,
        valueUsd,
        lpTokens,
        onStatus: (s) => {
          setTxStatus(s);
          if (s.step === "success") {
            addPosition(address, pool.id, s.lpTokens ?? lpTokens, s.valueUsd ?? valueUsd);
            refreshEvmBalances();
            useWalletStore.getState().triggerBalanceRefresh();
            toast({
              title: "Position recorded!",
              description: `${nA.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pool.base} + ${nB.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pool.quote} added. ${lpTokens.toFixed(4)} LP tokens.`,
            });
            onClose();
          }
        },
      });
      setSubmitting(false);
      return;
    }

    // ── Simulated fallback (non-EVM / unknown chain) ─────────────────────
    setTxStatus({ step: "depositing" });
    try {
      const lpRes = await fetch(`${LP_BASE}/api/liquidity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, assetA: pool.base, assetB: pool.quote, amountA: nA, amountB: nB }),
      });
      if (!lpRes.ok) {
        const err = await lpRes.json().catch(() => ({ error: "Server error" }));
        if (lpRes.status === 422) {
          toast({ title: "Insufficient balance", description: err.error ?? `Not enough ${err.asset ?? "tokens"} in your account.`, variant: "destructive" });
          setSubmitting(false);
          setTxStatus({ step: "idle" });
          return;
        }
        throw new Error(err.error ?? "Failed to add liquidity");
      }
      const lpData = await lpRes.json();
      addPosition(address, pool.id, parseFloat(lpData.lpTokens) || lpTokens, valueUsd);
      setTxStatus({ step: "success", lpTokens, valueUsd });
      refreshBackendBalances();
      useWalletStore.getState().triggerBalanceRefresh();
      toast({
        title: "Liquidity position added!",
        description: `${nA.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pool.base} + ${nB.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pool.quote}. ${(parseFloat(lpData.lpTokens) || lpTokens).toFixed(4)} LP tokens.`,
      });
      onClose();
    } catch (err: any) {
      toast({ title: "Deposit failed", description: err?.message ?? "An error occurred.", variant: "destructive" });
      setTxStatus({ step: "error", error: err?.message });
    }
    setSubmitting(false);
  }, [pool, amtA, amtB, submitting, walletConnected, address, targetChainId, isEvm, balances, walletProvider, addPosition, toast, onClose, refreshBackendBalances]);

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

  const tokenBalA = balances.find(b => b.symbol.toUpperCase() === pool.base.toUpperCase())?.amount ?? 0;
  const tokenBalB = balances.find(b => b.symbol.toUpperCase() === pool.quote.toUpperCase())?.amount ?? 0;

  const colorA   = COIN_COLORS[pool.base]  ?? "#EAB308";
  const colorB   = COIN_COLORS[pool.quote] ?? "#16a34a";
  const totalApr = poolApr(pool) + pool.farmApr;

  // Remove: how many tokens user receives (based on real LP from store)
  const lpValue      = myLpTokens * 12.5;             // est. USD value of all LP tokens
  const removeValue  = lpValue * (pct / 100);         // USD value being withdrawn
  const priceA       = SPOT[pool.base]  ?? 1;
  const priceB       = SPOT[pool.quote] ?? 1;
  const receiveA     = removeValue / 2 / priceA;      // 50/50 constant-product split
  const receiveB     = removeValue / 2 / priceB;

  // Add: pool share you'd receive (approximate)
  const addValueUsd  = (parseFloat(amtA) || 0) * priceA + (parseFloat(amtB) || 0) * priceB;
  const shareOfPool  = addValueUsd > 0 ? addValueUsd / (pool.tvl + addValueUsd) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-background rounded-2xl border border-border shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <CoinLogo symbol={pool.base}  size={36} ring />
              <CoinLogo symbol={pool.quote} size={36} ring />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base">{pool.base}/{pool.quote}</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded font-bold tracking-wide">SIMULATED</span>
              </div>
              <div className="text-xs text-muted-foreground">{pool.fee}% AMM fee · BSV settled</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors"><X size={18} /></button>
        </div>

        {/* Wrong chain warning */}
        {wrongChain && (
          <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2.5 mb-4">
            <AlertTriangle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300/90 leading-relaxed">
              <strong>Wrong network.</strong> This pool requires <strong>{pool?.chain}</strong> (chain {pool?.chainId}), but your wallet is on chain {walletChainId}. Switch your wallet to the correct network before depositing.
            </p>
          </div>
        )}

        {/* Chain mode notice */}
        {(() => {
          const mode = pool ? getLiquidityMode(targetChainId, pool.base, pool.quote, walletProvider) : "simulated";
          if (mode === "on_chain") return (
            <div className="flex items-start gap-2 bg-green-500/8 border border-green-500/20 rounded-xl px-3 py-2.5 mb-4">
              <CheckCircle2 size={13} className="text-green-400 shrink-0 mt-0.5" />
              <p className="text-xs text-green-300/90 leading-relaxed">
                <strong>Real on-chain transaction.</strong> Your wallet will be prompted to sign. Tokens are deducted from your wallet and deposited into a live Uniswap V3 pool.
              </p>
            </div>
          );
          if (mode === "live") return (
            <div className="flex items-start gap-2 bg-primary/8 border border-primary/20 rounded-xl px-3 py-2.5 mb-4">
              <Zap size={13} className="text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-primary/90 leading-relaxed">
                <strong>Live wallet connected.</strong> Your position is recorded against your real wallet address. On-chain settlement for this pair is coming soon.
              </p>
            </div>
          );
          return (
            <div className="flex items-start gap-2 bg-secondary/40 border border-border rounded-xl px-3 py-2.5 mb-4">
              <Info size={13} className="text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>BSV-settled position.</strong> Connect an EVM wallet to enable live position tracking and on-chain settlement.
              </p>
            </div>
          );
        })()}

        {/* Wallet gate — blocks the form until wallet is connected */}
        {!walletConnected ? (
          <div className="flex flex-col items-center justify-center py-10 gap-5 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Wallet size={30} className="text-primary" />
            </div>
            <div>
              <p className="font-bold text-base mb-1.5">Wallet required</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                You must connect an EVM or BSV wallet before you can add or remove liquidity. Your balance will appear once connected.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <button
                onClick={() => openWalletModal()}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors"
              >
                Connect Wallet
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : mode === "add" ? (
          <>
            {/* ── ADD ── */}

            {/* AMM ratio notice */}
            <div className="flex items-start gap-2 bg-blue-500/8 border border-blue-500/20 rounded-xl p-3 mb-4">
              <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-300/90 leading-relaxed">
                This pool uses <strong>x·y=k</strong> constant-product pricing. Both tokens must be deposited in the current pool ratio — entering one amount auto-fills the other.
              </p>
            </div>

            {/* Token A */}
            <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3 mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{pool.base} amount</span>
                <span className="text-xs text-muted-foreground">
                  Balance: {!walletConnected ? "—" : balancesLoading ? "…" : tokenBalA.toLocaleString("en-US", { maximumFractionDigits: 6 })} {pool.base}
                  {" · "}≈ ${((parseFloat(amtA) || 0) * priceA).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input className="flex-1 bg-transparent text-xl font-bold outline-none"
                  placeholder="0.00" value={amtA}
                  onChange={e => handleAmtAChange(e.target.value, pool)} />
                <button
                  onClick={() => tokenBalA > 0 && handleAmtAChange(String(tokenBalA), pool)}
                  disabled={tokenBalA <= 0}
                  className="text-xs text-primary font-bold px-2 py-1 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  MAX
                </button>
                <div className="px-2.5 py-1.5 bg-background border border-border rounded-lg">
                  <span className="text-sm font-bold" style={{ color: colorA }}>{pool.base}</span>
                </div>
              </div>
              {walletConnected && balances.length > 0 && parseFloat(amtA || "0") > tokenBalA + EPSILON && (
                <p className="text-[11px] text-red-400 mt-1">Insufficient {pool.base} balance</p>
              )}
            </div>

            {/* Ratio connector */}
            <div className="flex items-center justify-center my-1 text-muted-foreground">
              <span className="text-xs bg-secondary/60 border border-border rounded-full px-3 py-1">
                1 {pool.base} = {(priceA / priceB).toLocaleString(undefined, { maximumFractionDigits: 6 })} {pool.quote}
              </span>
            </div>

            {/* Token B */}
            <div className="bg-secondary/50 border border-border rounded-xl px-4 py-3 mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{pool.quote} amount</span>
                <span className="text-xs text-muted-foreground">
                  Balance: {!walletConnected ? "—" : balancesLoading ? "…" : tokenBalB.toLocaleString("en-US", { maximumFractionDigits: 6 })} {pool.quote}
                  {" · "}≈ ${((parseFloat(amtB) || 0) * priceB).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input className="flex-1 bg-transparent text-xl font-bold outline-none"
                  placeholder="0.00" value={amtB}
                  onChange={e => handleAmtBChange(e.target.value, pool)} />
                <div className="px-2.5 py-1.5 bg-background border border-border rounded-lg">
                  <span className="text-sm font-bold" style={{ color: colorB }}>{pool.quote}</span>
                </div>
              </div>
              {walletConnected && balances.length > 0 && parseFloat(amtB || "0") > tokenBalB + EPSILON && (
                <p className="text-[11px] text-red-400 mt-1">Insufficient {pool.quote} balance</p>
              )}
            </div>

            {/* Stats */}
            <div className="bg-secondary/30 rounded-xl p-3 mb-3 space-y-2">
              {[
                ["Pool fee (total per swap)", `${pool.fee}%`],
                ["  → LP share (5/6)", `${lpFee(pool.fee).toFixed(4)}% → you earn this`],
                ["  → Protocol (1/6)", `${protocolFee(pool.fee).toFixed(4)}% → treasury`],
                ["Fee APR (from trading volume)", `${poolApr(pool).toFixed(1)}%`],
                ["Farm APR (LP staking rewards)", `+${pool.farmApr.toFixed(1)}%`],
                ["Combined APR", `${totalApr.toFixed(1)}%`],
                ["Your est. pool share", shareOfPool > 0
                  ? (shareOfPool >= 0.00005   ? shareOfPool.toFixed(4) + "%"
                   : shareOfPool >= 0.0000005 ? shareOfPool.toFixed(7) + "%"
                   : "< 0.0000005%")
                  : "—"],
                ["You receive", "LP tokens (redeemable anytime)"],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between text-sm">
                  <span className={cn("text-muted-foreground", l.startsWith("  →") ? "text-[11px] pl-3" : "")}>{l}</span>
                  <span className={cn("font-semibold text-right", l === "Combined APR" ? "text-green-500" : l.startsWith("  → LP") ? "text-green-400 text-[11px]" : l.startsWith("  → Protocol") ? "text-blue-400 text-[11px]" : "")}>{v}</span>
                </div>
              ))}
            </div>

            {/* Impermanent loss warning */}
            <div className="rounded-xl border border-orange-500/25 bg-orange-500/8 p-3 mb-4">
              <button
                className="w-full flex items-center gap-2 text-left"
                onClick={() => setShowIlInfo(v => !v)}
              >
                <AlertTriangle size={14} className="text-orange-400 shrink-0" />
                <span className="text-xs font-semibold text-orange-300">Impermanent Loss Risk</span>
                <ChevronRight size={12} className={cn("ml-auto text-orange-400 transition-transform", showIlInfo && "rotate-90")} />
              </button>
              {showIlInfo && (
                <p className="text-xs text-orange-300/80 leading-relaxed mt-2 pl-5">
                  When the price of {pool.base} changes relative to {pool.quote}, the AMM rebalances the pool automatically.
                  This means you may end up with a different token ratio than you deposited. If prices diverge significantly,
                  the total value of your position may be less than if you had simply held the tokens. Fees earned can offset this loss.
                </p>
              )}
            </div>

            {/* ── Transaction progress (on-chain flow) ── */}
            {txStatus.step !== "idle" && (
              <div className="bg-secondary/40 border border-border rounded-xl p-3.5 mb-3 space-y-2.5">
                {(() => {
                  const ORDER = ["checking","approving","approval_pending","depositing","deposit_pending","success"] as const;
                  const idx   = ORDER.indexOf(txStatus.step as typeof ORDER[number]);
                  return [
                    {
                      id: "checking",
                      label: `Checking ${pool?.quote ?? "token"} allowance`,
                      done:   idx > 0  && txStatus.step !== "error",
                      active: txStatus.step === "checking",
                    },
                    {
                      id: "approving",
                      label: `Approve ${pool?.quote ?? "token"}`,
                      done:   idx >= ORDER.indexOf("depositing") && txStatus.step !== "error",
                      active: ["approving","approval_pending"].includes(txStatus.step),
                      txHash: ["approval_pending"].includes(txStatus.step) ? txStatus.txHash : undefined,
                    },
                    {
                      id: "depositing",
                      label: `Add liquidity on ${CHAIN_NAMES[targetChainId] ?? "chain"}`,
                      done:   txStatus.step === "success",
                      active: ["depositing","deposit_pending"].includes(txStatus.step),
                      txHash: ["deposit_pending","success"].includes(txStatus.step) ? txStatus.txHash : undefined,
                    },
                  ];
                })().map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5">
                    {s.done ? (
                      <CheckCircle2 size={15} className="text-green-400 shrink-0" />
                    ) : s.active ? (
                      <Loader2 size={15} className="text-primary shrink-0 animate-spin" />
                    ) : (
                      <div className="w-[15px] h-[15px] rounded-full border border-border shrink-0" />
                    )}
                    <span className={cn("text-xs flex-1",
                      s.done ? "text-green-400" :
                      s.active ? "text-foreground font-medium" :
                      "text-muted-foreground")}>
                      {s.label}
                    </span>
                    {s.txHash && (
                      <a
                        href={`${EXPLORER_TX[targetChainId] ?? "https://basescan.org/tx/"}${s.txHash}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-primary hover:underline shrink-0"
                      >
                        tx <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                ))}

                {txStatus.step === "success" && (
                  <div className="pt-1 border-t border-border/50 flex items-center justify-between">
                    <span className="text-xs text-green-400 font-semibold">✓ Confirmed on-chain</span>
                    <button onClick={onClose}
                      className="text-xs px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold transition-colors">
                      Done
                    </button>
                  </div>
                )}
                {txStatus.step === "error" && (
                  <div className="pt-1 border-t border-red-500/20">
                    <p className="text-xs text-red-400">{txStatus.error}</p>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleAdd}
              disabled={!amtA || !amtB || submitting || txStatus.step === "success" || balancesLoading || (walletConnected && !balancesLoading && balances.length > 0 && (parseFloat(amtA || "0") > tokenBalA + EPSILON || parseFloat(amtB || "0") > tokenBalB + EPSILON))}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {(() => {
                const mode = getLiquidityMode(targetChainId, pool.base, pool.quote, walletProvider);
                if (balancesLoading) return "Loading balances…";
                if (walletConnected && balances.length > 0 && (parseFloat(amtA || "0") > tokenBalA + EPSILON || parseFloat(amtB || "0") > tokenBalB + EPSILON)) return "Insufficient Balance";
                if (submitting) {
                  if (txStatus.step === "approving")        return "Waiting for approval…";
                  if (txStatus.step === "approval_pending") return "Confirming approval…";
                  if (txStatus.step === "depositing")       return mode === "on_chain" ? "Sending transaction…" : "Recording position…";
                  if (txStatus.step === "deposit_pending")  return "Confirming on-chain…";
                  return "Processing…";
                }
                if (txStatus.step === "error") return "Retry";
                if (!amtA || !amtB) return "Enter amounts";
                if (mode === "on_chain") return "Add Liquidity On-Chain";
                return "Add Liquidity";
              })()}
            </button>
          </>
        ) : (
          <>
            {/* ── REMOVE ── */}

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

            {/* You receive */}
            <div className="bg-secondary/30 rounded-xl p-3 mb-4 space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">You receive</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CoinLogo symbol={pool.base}  size={16} />
                  {pool.base}
                </span>
                <span className="font-mono font-semibold">{receiveA.toFixed(6)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CoinLogo symbol={pool.quote} size={16} />
                  {pool.quote}
                </span>
                <span className="font-mono font-semibold">{receiveB.toFixed(pool.quote === "USDT" ? 2 : 6)}</span>
              </div>
              <div className="border-t border-border/50 pt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Total value</span>
                <span className="font-semibold text-green-400">{fmtTvl(removeValue)}</span>
              </div>
            </div>

            {/* IL note */}
            <div className="flex items-start gap-2 bg-secondary/50 rounded-xl p-3 mb-4">
              <Info size={13} className="text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Amounts are split 50/50 by the AMM constant-product formula. Actual amounts depend on the pool's live reserves at the time of removal.
              </p>
            </div>

            <button
              onClick={handleRemove}
              disabled={submitting}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Processing…" : "Remove Liquidity"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
/**
 * OnChainLpBadge — reads the user's real OrahDEX LP token balance from the
 * on-chain pair contract and shows it alongside the locally-stored position.
 * Renders nothing when the AMM isn't deployed on the pool's chain.
 */
function OnChainLpBadge({
  userAddress, chainId, base, quote,
}: { userAddress: string | null; chainId: number | null; base: string; quote: string }) {
  const { lpBalance, valueUsd, pairAddress, loading } = useLpBalance(userAddress, chainId, base, quote);

  if (!chainId || !hasOrahAmm(chainId)) return null;
  if (loading && lpBalance === null) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Loader2 size={10} className="animate-spin" /> on-chain…
      </span>
    );
  }
  if (lpBalance === null) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] px-1.5 py-0.5 bg-green-500/15 text-green-400 border border-green-500/30 rounded font-bold inline-flex items-center gap-1">
        <CheckCircle2 size={9} /> ORAH-LP ON-CHAIN
      </span>
      {lpBalance > 0 && (
        <span className="text-[10px] text-muted-foreground">
          {lpBalance.toFixed(6)} LP {valueUsd ? `≈ $${valueUsd.toFixed(2)}` : ""}
        </span>
      )}
      {lpBalance === 0 && (
        <span className="text-[10px] text-muted-foreground">No LP tokens minted yet</span>
      )}
      {pairAddress && chainId && (
        <a
          href={`${(EXPLORER_TX[chainId] ?? "https://etherscan.io/tx/").replace("/tx/", "/address/")}${pairAddress}`}
          target="_blank" rel="noreferrer"
          className="text-[9px] text-primary/70 hover:text-primary flex items-center gap-0.5"
        >
          View pair <ExternalLink size={8} />
        </a>
      )}
    </div>
  );
}

type Tab = "pools" | "positions" | "farming";

export function Liquidity() {
  useSEO({
    title: "Liquidity Pools — Earn Yield on OrahDEX AMM",
    description: "Provide liquidity to OrahDEX AMM pools and earn trading fees. Join BTC, ETH, BSV, and stablecoin pools with competitive APR. Your keys, your liquidity.",
    keywords: "liquidity pools, AMM, yield farming, DeFi, LP tokens, trading fees, BSV liquidity, crypto yield, OrahDEX liquidity",
    url: "/liquidity",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "OrahDEX Liquidity Pools",
      "description": "Automated Market Maker (AMM) liquidity pools with competitive yield",
      "url": "https://orahdex.replit.app/liquidity"
    }
  });

  const [tab, setTab]         = useState<Tab>("pools");
  const [sortBy, setSortBy]   = useState<"apr" | "tvl" | "vol">("tvl");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [modalPool, setModalPool] = useState<Pool | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "remove">("add");
  const [showAmmInfo, setShowAmmInfo] = useState(false);

  const { address: walletAddress } = useWalletStore();
  const { getUserPositions } = useLiquidityStore();
  const userPositions = walletAddress ? getUserPositions(walletAddress) : {};

  const enrichPool = (p: typeof POOLS[0]) => ({
    ...p,
    userLp: userPositions[p.id]?.lpTokens ?? 0,
  });

  const openAdd    = (p: typeof POOLS[0]) => { setModalPool(enrichPool(p)); setModalMode("add"); };
  const openRemove = (p: typeof POOLS[0]) => { setModalPool(enrichPool(p)); setModalMode("remove"); };

  const sorted = [...POOLS]
    .filter(p => chainFilter === "all" || p.chain.toLowerCase() === chainFilter.toLowerCase())
    .map(enrichPool)
    .sort((a, b) =>
      sortBy === "apr" ? (poolApr(b) + b.farmApr) - (poolApr(a) + a.farmApr)
      : sortBy === "tvl" ? b.tvl - a.tvl
      : b.vol24 - a.vol24
    );

  const totalTvl = POOLS.reduce((s, p) => s + p.tvl, 0);
  const myPools  = POOLS
    .filter(p => (userPositions[p.id]?.lpTokens ?? 0) > 0)
    .map(enrichPool);

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
            <p className="text-sm text-muted-foreground">Provide liquidity · earn AMM fees + farming rewards</p>
          </div>
        </div>
      </div>

      {/* ── How AMM works (collapsible) ────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border border-border bg-card overflow-hidden">
        <button
          onClick={() => setShowAmmInfo(v => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
        >
          <BookOpen size={16} className="text-primary shrink-0" />
          <span className="font-semibold text-sm">How OrahDEX AMM Works</span>
          <ChevronRight size={14} className={cn("ml-auto text-muted-foreground transition-transform", showAmmInfo && "rotate-90")} />
        </button>
        {showAmmInfo && (
          <div className="border-t border-border/50">
            <div className="px-5 pb-4 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  icon: "💧",
                  title: "Liquidity Pools",
                  body: "Instead of matching buyers with sellers, DEXs use token pools funded by LPs. Anyone can trade against the pool at any time. LPs earn fees proportional to their share.",
                },
                {
                  icon: "∑",
                  title: "x · y = k Formula",
                  body: "The constant-product formula keeps x × y constant. Every trade shifts the ratio, auto-pricing the pair. Bigger trades cause more slippage. The price is always y/x.",
                },
                {
                  icon: "💸",
                  title: "Fee Split",
                  body: `Every swap pays a pool fee (0.2%–0.3%). 5/6 goes to LPs (you), 1/6 goes to the protocol treasury. Fees compound inside the pool — k grows over time.`,
                },
                {
                  icon: "⚖️",
                  title: "Arbitrage",
                  body: "AMMs don't know real-world prices — only their reserves. Arb bots constantly buy cheap / sell expensive until the pool price matches the global market.",
                },
                {
                  icon: "🏗️",
                  title: "Composability",
                  body: "LP tokens are ERC-20 receipts. Other protocols can accept them as collateral (lending), stake them for extra yield (farms), or route through them (aggregators).",
                },
                {
                  icon: "📈",
                  title: "Protocol Revenue",
                  body: "The 1/6 protocol fee accrues to the treasury. At current volumes that's real daily revenue — the foundation for token buybacks, grants, and development.",
                },
                {
                  icon: "🔁",
                  title: "Network Effects",
                  body: "Deeper pools → better prices → more traders → more fees → more LPs → deeper pools. Once critical mass is reached, the flywheel sustains itself.",
                },
                {
                  icon: "⚡",
                  title: "BSV Settlement",
                  body: "Every OrahDEX pool trade settles on BSV with sub-5s finality and ~$0.001 fees. No L2 bridges. No optimistic rollup delays. One canonical chain.",
                },
              ].map(c => (
                <div key={c.title} className="pt-2">
                  <div className="text-2xl mb-2">{c.icon}</div>
                  <div className="font-bold text-sm mb-1">{c.title}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>
            {/* Solidity core logic callout */}
            <div className="mx-5 mb-5 bg-secondary/40 border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Code2 size={14} className="text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Swap Core Logic (simplified)</span>
              </div>
              <pre className="text-[11px] text-muted-foreground font-mono leading-relaxed overflow-x-auto">{`// 1. Apply fee: amountInWithFee = amountIn × (1 − fee)
// 2. Solve x·y=k:  amountOut = (amountInWithFee × reserveOut)
//                             / (reserveIn + amountInWithFee)
// 3. Update reserves:  reserveIn += amountInWithFee
//                      reserveOut -= amountOut
// 4. k grows from fees → LP share appreciates over time`}</pre>
            </div>
          </div>
        )}
      </div>

      {/* AMM Swap Simulator */}
      <AmmSwapSimulator />

      {/* Stats row */}
      {(() => {
        const totalVol24    = POOLS.reduce((s, p) => s + p.vol24, 0);
        const protocolRev24 = POOLS.reduce((s, p) => s + p.vol24 * (protocolFee(p.fee) / 100), 0);
        const lpRev24       = POOLS.reduce((s, p) => s + p.vol24 * (lpFee(p.fee) / 100), 0);
        return (
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              ["Total Value Locked",    fmtTvl(totalTvl),         "text-foreground"],
              ["24h LP Fee Revenue",    fmtTvl(lpRev24),           "text-green-500"],
              ["24h Protocol Revenue",  fmtTvl(protocolRev24),     "text-blue-400"],
              ["My Positions",          `${myPools.length}`,       "text-primary"],
              ["Best Pool APR",         `${(Math.max(...POOLS.map(p => poolApr(p) + p.farmApr))).toFixed(1)}%`, "text-green-500"],
            ].map(([l, v, cls]) => (
              <div key={l} className="bg-card border border-border rounded-xl p-4">
                <div className="text-xs text-muted-foreground mb-1">{l}</div>
                <div className={cn("text-2xl font-bold", cls)}>{v}</div>
              </div>
            ))}
          </div>
        );
      })()}

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

      {/* ── POOLS tab ── */}
      {tab === "pools" && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-sm text-muted-foreground">Chain:</span>
            {[
              { id: "all",      label: "All Chains" },
              { id: "bsv",      label: "⚡ BSV" },
              { id: "trx",      label: "TRX" },
              { id: "base",     label: "🔵 Base" },
              { id: "ethereum", label: "⟠ Ethereum" },
            ].map(c => (
              <button key={c.id} onClick={() => setChainFilter(c.id)}
                className={cn("px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
                  chainFilter === c.id ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
                {c.label}
              </button>
            ))}
            <span className="flex-1" />
            <span className="text-sm text-muted-foreground">Sort by:</span>
            {(["tvl", "apr", "vol"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={cn("px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
                  sortBy === s ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
                {s === "vol" ? "Volume" : s.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground">
              <span>Pool</span>
              <span className="text-right">TVL</span>
              <span className="text-right">24h Volume</span>
              <span className="text-right" title="Derived from: vol24 × fee / TVL × 365">Fee APR ⓘ</span>
              <span className="text-right">Farm APR</span>
              <span className="text-right">Total APR</span>
              <span className="text-right">Action</span>
            </div>
            {sorted.map(pool => {
              const hasPos   = pool.userLp > 0;
              const feeApr   = poolApr(pool);
              const totalApr = feeApr + pool.farmApr;
              return (
                <div key={pool.id}
                  className={cn(
                    "grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3.5 items-center border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors",
                    hasPos && "bg-primary/3"
                  )}>
                  <div className="flex items-center gap-2">
                    <TokenPair base={pool.base} quote={pool.quote} />
                    {hasPos && <span className="text-[9px] px-1.5 py-0.5 bg-primary/20 text-primary rounded font-bold">MY POS</span>}
                    <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{pool.fee}% fee</span>
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded font-bold border",
                      pool.chain === "BSV"      && "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                      pool.chain === "TRX"      && "bg-red-500/15 text-red-400 border-red-500/30",
                      pool.chain === "Base"     && "bg-blue-500/15 text-blue-400 border-blue-500/30",
                      pool.chain === "Ethereum" && "bg-violet-500/15 text-violet-400 border-violet-500/30",
                    )}>{pool.chain}</span>
                    {(pool.chain === "Base" || pool.chain === "Ethereum") && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-green-500/15 text-green-400 border border-green-500/30 rounded font-bold">ON-CHAIN</span>
                    )}
                  </div>
                  <span className="text-right text-sm font-semibold">{fmtTvl(pool.tvl)}</span>
                  <span className="text-right text-sm">{fmtTvl(pool.vol24)}</span>
                  <span className="text-right text-sm font-bold text-green-500">{feeApr.toFixed(1)}%</span>
                  <span className="text-right text-sm font-bold text-green-500">+{pool.farmApr.toFixed(1)}%</span>
                  <span className="text-right text-sm font-bold text-green-400">{totalApr.toFixed(1)}%</span>
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

          {/* APR formula footnote */}
          <p className="mt-3 text-xs text-muted-foreground/70">
            ⓘ Fee APR = (24h Volume × Pool Fee) / TVL × 365. Reflects current trading activity and will vary.
            Impermanent loss is not reflected — see risk disclosure in each pool.
          </p>
        </>
      )}

      {/* ── POSITIONS tab ── */}
      {tab === "positions" && (
        <div>
          {myPools.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Droplets size={48} className="text-muted-foreground/30" />
              <p className="text-muted-foreground">No liquidity positions yet. Add to a pool to start earning fees.</p>
            </div>
          ) : (
            <>
              {/* IL reminder */}
              <div className="flex items-start gap-2.5 bg-orange-500/8 border border-orange-500/20 rounded-xl px-4 py-3 mb-4">
                <AlertTriangle size={14} className="text-orange-400 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-300/90 leading-relaxed">
                  <strong>Impermanent Loss reminder:</strong> Your LP position value is affected by price divergence between the two assets. Fee earnings reduce — but may not fully offset — IL in volatile markets.
                </p>
              </div>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground">
                  <span>Pool</span>
                  <span className="text-right">LP Tokens</span>
                  <span className="text-right">Est. Value</span>
                  <span className="text-right">Pool Share</span>
                  <span className="text-right">Fees Earned</span>
                  <span className="text-right">Action</span>
                </div>
                {myPools.map(pool => {
                  const lpValue    = pool.userLp * 12.5;
                  const shareRatio = pool.tvl > 0 ? (lpValue / pool.tvl) : 0;
                  const feesEarned = pool.vol24 * (pool.fee / 100) * shareRatio;
                  const posChainId = userPositions[pool.id]?.chainId ?? pool.chainId ?? null;
                  return (
                    <div key={pool.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3.5 items-center border-b border-border/50 last:border-0">
                      <div className="flex flex-col gap-1">
                        <TokenPair base={pool.base} quote={pool.quote} />
                        <OnChainLpBadge
                          userAddress={walletAddress}
                          chainId={posChainId}
                          base={pool.base}
                          quote={pool.quote}
                        />
                      </div>
                      <span className="text-right text-sm font-semibold">{pool.userLp.toFixed(4)}</span>
                      <span className="text-right text-sm">{fmtTvl(lpValue)}</span>
                      <span className="text-right text-sm text-muted-foreground">{fmtPoolShare(pool.userLp, pool.tvl)}</span>
                      <span className="text-right text-sm text-green-500 font-semibold">${feesEarned.toFixed(2)}</span>
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => openAdd(pool)} className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors">Add</button>
                        <button onClick={() => openRemove(pool)} className="px-2.5 py-1.5 rounded-lg bg-secondary border border-border hover:border-primary/30 text-xs transition-colors">Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── FARMING tab ── */}
      {tab === "farming" && (
        <div className="grid grid-cols-3 gap-6">
          {/* Left: Market Maker Rebates + BSV Staking */}
          <div className="col-span-1 space-y-4">
            <div className="bg-card border border-green-500/25 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={18} className="text-green-400" />
                <span className="font-bold">Market Maker Rebates</span>
                <span className="ml-auto text-[10px] px-2 py-0.5 bg-primary/15 text-primary rounded font-bold">NEW</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Place limit orders within the mid-price spread to earn fee rebates. The tighter your quote, the higher the rebate — same incentive structure as Curve's concentrated liquidity.
              </p>
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
                    <Award size={16} className="text-green-400" />
                  </div>
                ))}
              </div>
              <a href="/trade/BTC-USDT"
                className="block w-full py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-bold text-center hover:bg-primary/20 transition-colors">
                Go to Trade
              </a>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={18} className="text-primary" />
                <span className="font-bold">BSV Staking</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Stake native BSV to earn a share of platform revenue. Min. 100 BSV.</p>
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
                <p className="text-xs text-muted-foreground mt-1">
                  Stake your LP tokens to earn additional OrahDEX rewards on top of AMM fees. Fee APR is generated by the x·y=k pool formula.
                </p>
              </div>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-border text-xs font-semibold text-muted-foreground">
                <span>Pool</span>
                <span className="text-right">Fee APR</span>
                <span className="text-right">Farm APR</span>
                <span className="text-right">Total APR</span>
                <span className="text-right">Your LP</span>
                <span className="text-right">Action</span>
              </div>
              {POOLS.map(enrichPool).map(pool => {
                const feeApr   = poolApr(pool);
                const totalApr = feeApr + pool.farmApr;
                return (
                  <div key={pool.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3.5 items-center border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors">
                    <TokenPair base={pool.base} quote={pool.quote} />
                    <span className="text-right text-sm font-semibold text-green-500">{feeApr.toFixed(1)}%</span>
                    <span className="text-right text-sm font-semibold text-green-500">+{pool.farmApr.toFixed(1)}%</span>
                    <span className="text-right text-sm font-bold text-green-400">{totalApr.toFixed(1)}%</span>
                    <span className="text-right text-sm">{pool.userLp > 0 ? pool.userLp.toFixed(2) : "—"}</span>
                    <div className="flex gap-1.5 justify-end">
                      {pool.userLp > 0 ? (
                        <>
                          <button className="px-2.5 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-black text-xs font-bold transition-colors">Stake</button>
                          <button className="px-2.5 py-1.5 rounded-lg bg-secondary border border-border text-xs transition-colors">Unstake</button>
                        </>
                      ) : (
                        <button onClick={() => openAdd(pool)}
                          className="px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/20 transition-colors">
                          Get LP
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
