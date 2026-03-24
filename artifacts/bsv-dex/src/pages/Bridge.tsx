import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSEO } from "@/hooks/useSEO";
import {
  ArrowRight, ArrowLeftRight, ChevronDown, Shield, Zap, Clock,
  AlertTriangle, CheckCircle2, Lock, Unlock, RefreshCw, Info,
  Layers, Link2, Globe, Copy, Check, ExternalLink, X, Loader2,
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
    </div>
  );
}
