/**
 * ThirdwebSwapPanel — Standalone ThirdWeb Universal Bridge swap panel.
 *
 * Fully self-contained: user picks source chain+token AND destination
 * chain+token, enters how much they want to receive, gets a live quote
 * (showing what they'll pay), then executes via Bridge.Buy.prepare().
 */

import { useState, useEffect, useRef } from "react";
import { Bridge, NATIVE_TOKEN_ADDRESS, sendTransaction } from "thirdweb";
import { useActiveAccount } from "thirdweb/react";
import { parseUnits, formatUnits } from "viem";
import { thirdwebClient } from "@/lib/thirdweb-client";
import {
  ArrowDown, Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Chains ────────────────────────────────────────────────────────────────────

const CHAINS = [
  { id: 1,       name: "Ethereum",     nativeSym: "ETH",   color: "#627EEA" },
  { id: 8453,    name: "Base",         nativeSym: "ETH",   color: "#0052FF" },
  { id: 42161,   name: "Arbitrum",     nativeSym: "ETH",   color: "#28A0F0" },
  { id: 10,      name: "Optimism",     nativeSym: "ETH",   color: "#FF0420" },
  { id: 137,     name: "Polygon",      nativeSym: "POL",   color: "#8247E5" },
  { id: 56,      name: "BNB Chain",    nativeSym: "BNB",   color: "#F0B90B" },
  { id: 43114,   name: "Avalanche",    nativeSym: "AVAX",  color: "#E84142" },
  { id: 59144,   name: "Linea",        nativeSym: "ETH",   color: "#61DFFF" },
  { id: 534352,  name: "Scroll",       nativeSym: "ETH",   color: "#FFEEDA" },
  { id: 1329,    name: "Sei",          nativeSym: "SEI",   color: "#9D1C1C" },
  { id: 324,     name: "zkSync Era",   nativeSym: "ETH",   color: "#8C8DFC" },
  { id: 250,     name: "Fantom",       nativeSym: "FTM",   color: "#1969FF" },
  { id: 25,      name: "Cronos",       nativeSym: "CRO",   color: "#002D74" },
  { id: 5000,    name: "Mantle",       nativeSym: "MNT",   color: "#00B6A8" },
  { id: 100,     name: "Gnosis",       nativeSym: "xDAI",  color: "#04795B" },
  { id: 42220,   name: "Celo",         nativeSym: "CELO",  color: "#35D07F" },
  { id: 1284,    name: "Moonbeam",     nativeSym: "GLMR",  color: "#53CBC9" },
  { id: 146,     name: "Sonic",        nativeSym: "S",     color: "#FF6B2B" },
  { id: 81457,   name: "Blast",        nativeSym: "ETH",   color: "#FCFC03" },
  { id: 34443,   name: "Mode",         nativeSym: "ETH",   color: "#DFFE00" },
  { id: 288,     name: "Boba Network", nativeSym: "ETH",   color: "#CBFF00" },
  { id: 1088,    name: "Metis",        nativeSym: "METIS", color: "#00DACC" },
  { id: 167000,  name: "Taiko",        nativeSym: "ETH",   color: "#FC0FC0" },
] as const;

type ChainId = (typeof CHAINS)[number]["id"];

const CHAIN_NAME: Record<number, string> = Object.fromEntries(CHAINS.map(c => [c.id, c.name]));
const CHAIN_NATIVE: Record<number, string> = Object.fromEntries(CHAINS.map(c => [c.id, c.nativeSym]));
const CHAIN_EXPLORER: Record<number, string> = {
  1: "https://etherscan.io",        8453: "https://basescan.org",
  42161: "https://arbiscan.io",     10: "https://optimistic.etherscan.io",
  137: "https://polygonscan.com",   56: "https://bscscan.com",
  43114: "https://snowtrace.io",    59144: "https://lineascan.build",
  534352: "https://scrollscan.com", 1329: "https://seitrace.com",
  324: "https://explorer.zksync.io",250: "https://ftmscan.com",
  25: "https://cronoscan.com",      5000: "https://explorer.mantle.xyz",
  100: "https://gnosisscan.io",     42220: "https://explorer.celo.org/mainnet",
  1284: "https://moonscan.io",      146: "https://sonicscan.org",
  81457: "https://blastscan.io",    34443: "https://explorer.mode.network",
  288: "https://bobascan.com",      1088: "https://andromeda-explorer.metis.io",
  167000: "https://taikoscan.io",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface BridgeTok {
  chainId:   number;
  address:   string;
  symbol:    string;
  name:      string;
  decimals:  number;
  iconUri?:  string;
  priceUsd?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(ms: number) {
  if (ms < 90_000) return `~${Math.round(ms / 1000)}s`;
  return `~${Math.round(ms / 60_000)} min`;
}

function fmtAmt(raw: bigint, decimals: number, maxFrac = 6) {
  const f = parseFloat(formatUnits(raw, decimals));
  return f.toLocaleString("en-US", { maximumFractionDigits: maxFrac, minimumSignificantDigits: 1 });
}

function nativeTok(chainId: number): BridgeTok {
  return {
    chainId,
    address: NATIVE_TOKEN_ADDRESS,
    symbol: CHAIN_NATIVE[chainId] ?? "ETH",
    name: "Native Token",
    decimals: 18,
  };
}

// ── Token list hook ───────────────────────────────────────────────────────────

function useChainTokens(chainId: number) {
  const [tokens, setTokens] = useState<BridgeTok[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Bridge.tokens({ client: thirdwebClient, chainId })
      .then(list => {
        const items = list.slice(0, 40) as BridgeTok[];
        setTokens(items.length ? items : [nativeTok(chainId)]);
      })
      .catch(() => setTokens([nativeTok(chainId)]))
      .finally(() => setLoading(false));
  }, [chainId]);

  return { tokens, loading };
}

// ── Chain selector ────────────────────────────────────────────────────────────

function ChainSelect({ value, onChange, label }: {
  value: number; onChange: (id: number) => void; label: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</label>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {CHAINS.map(c => (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className={cn(
              "shrink-0 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all",
              value === c.id
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Token selector ────────────────────────────────────────────────────────────

function TokenSelect({ tokens, loading, value, onChange }: {
  tokens: BridgeTok[]; loading: boolean;
  value: string; onChange: (tok: BridgeTok) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => {
        const t = tokens.find(x => x.address === e.target.value);
        if (t) onChange(t);
      }}
      disabled={loading || !tokens.length}
      className="flex-1 h-9 rounded-xl border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:border-cyan-500/50 min-w-0 disabled:opacity-60"
    >
      {loading && <option>Loading tokens…</option>}
      {tokens.map(t => (
        <option key={t.address} value={t.address}>
          {t.symbol}{t.priceUsd ? ` ≈ $${t.priceUsd.toFixed(2)}` : ""}
        </option>
      ))}
    </select>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ThirdwebSwapPanel() {
  const account = useActiveAccount();

  // Source
  const [srcChain, setSrcChain] = useState<number>(1);
  const [srcTok,   setSrcTok]   = useState<BridgeTok | null>(null);
  const { tokens: srcTokens, loading: srcLoading } = useChainTokens(srcChain);

  // Destination
  const [dstChain, setDstChain] = useState<number>(8453);
  const [dstTok,   setDstTok]   = useState<BridgeTok | null>(null);
  const { tokens: dstTokens, loading: dstLoading } = useChainTokens(dstChain);

  // Amount the user wants to RECEIVE
  const [receiveAmt, setReceiveAmt] = useState("");

  // Quote
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteResult, setQuoteResult] = useState<{
    originAmount: bigint; originDecimals: number; originSymbol: string; estimatedMs: number;
  } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Execution
  const [bridging,    setBridging]    = useState(false);
  const [bridgeStep,  setBridgeStep]  = useState<{ current: number; total: number } | null>(null);
  const [done,        setDone]        = useState(false);
  const [txHash,      setTxHash]      = useState<string | null>(null);
  const [execError,   setExecError]   = useState<string | null>(null);

  // Default token selection once list loads
  useEffect(() => {
    if (!srcLoading && srcTokens.length) {
      const native = srcTokens.find(t => t.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase());
      setSrcTok(prev => prev?.chainId === srcChain ? prev : (native ?? srcTokens[0]));
    }
  }, [srcTokens, srcLoading, srcChain]);

  useEffect(() => {
    if (!dstLoading && dstTokens.length) {
      // Default to USDC on destination if available, else native
      const usdc = dstTokens.find(t => t.symbol === "USDC");
      const native = dstTokens.find(t => t.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase());
      setDstTok(prev => prev?.chainId === dstChain ? prev : (usdc ?? native ?? dstTokens[0]));
    }
  }, [dstTokens, dstLoading, dstChain]);

  // Reset quote when source changes
  useEffect(() => {
    setQuoteResult(null);
    setQuoteError(null);
    setSrcTok(null);
  }, [srcChain]);

  useEffect(() => {
    setQuoteResult(null);
    setQuoteError(null);
    setDstTok(null);
  }, [dstChain]);

  // Live quote
  useEffect(() => {
    if (!srcTok || !dstTok || !receiveAmt || parseFloat(receiveAmt) <= 0) {
      setQuoteResult(null);
      setQuoteError(null);
      return;
    }
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError(null);
      setQuoteResult(null);
      try {
        const destAmountWei = parseUnits(receiveAmt, dstTok.decimals);
        const q = await Bridge.Buy.quote({
          client:                  thirdwebClient,
          originChainId:           srcChain,
          originTokenAddress:      srcTok.address as `0x${string}`,
          destinationChainId:      dstChain,
          destinationTokenAddress: dstTok.address as `0x${string}`,
          amount:                  destAmountWei,
        });
        setQuoteResult({
          originAmount:   q.originAmount,
          originDecimals: srcTok.decimals,
          originSymbol:   srcTok.symbol,
          estimatedMs:    q.estimatedExecutionTimeMs ?? 60_000,
        });
      } catch (e: any) {
        const msg: string = e?.message ?? "No route found for this pair.";
        setQuoteError(msg.length > 140 ? msg.slice(0, 140) + "…" : msg);
      } finally {
        setQuoteLoading(false);
      }
    }, 700);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [srcTok, dstTok, receiveAmt, srcChain, dstChain]);

  // Execute
  async function handleSwap() {
    if (!srcTok || !dstTok || !receiveAmt || parseFloat(receiveAmt) <= 0) return;

    const eth = (window as any).ethereum;
    if (!account && !eth) {
      setExecError("No wallet connected. Connect a wallet first.");
      return;
    }

    let sender: string;
    if (account) {
      sender = account.address;
    } else {
      let accs: string[] = await eth.request({ method: "eth_accounts" });
      if (!accs?.length) accs = await eth.request({ method: "eth_requestAccounts" });
      sender = accs[0];
    }
    if (!sender) { setExecError("No wallet account found."); return; }

    setBridging(true);
    setExecError(null);
    setTxHash(null);
    setDone(false);

    try {
      const destAmountWei = parseUnits(receiveAmt, dstTok.decimals);
      const prepared = await Bridge.Buy.prepare({
        client:                  thirdwebClient,
        originChainId:           srcChain,
        originTokenAddress:      srcTok.address as `0x${string}`,
        destinationChainId:      dstChain,
        destinationTokenAddress: dstTok.address as `0x${string}`,
        amount:                  destAmountWei,
        sender:                  sender as `0x${string}`,
        receiver:                sender as `0x${string}`,
      });

      const allTxs = prepared.steps.flatMap(s => s.transactions);
      if (!allTxs.length) throw new Error("No transactions returned by bridge.");

      let firstHash: string | null = null;

      for (let i = 0; i < allTxs.length; i++) {
        const tx = allTxs[i];
        setBridgeStep({ current: i + 1, total: allTxs.length });

        if (account) {
          const result = await sendTransaction({ transaction: tx, account });
          if (i === 0) firstHash = result.transactionHash;
        } else {
          const chainHex = "0x" + tx.chainId.toString(16);
          const curChain: string = await eth.request({ method: "eth_chainId" });
          if (curChain.toLowerCase() !== chainHex.toLowerCase()) {
            await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
          }
          const hash: string = await eth.request({
            method: "eth_sendTransaction",
            params: [{ from: sender, to: tx.to, data: tx.data, value: tx.value ? "0x" + tx.value.toString(16) : "0x0" }],
          });
          if (i === 0) firstHash = hash;
        }
      }

      if (firstHash) setTxHash(firstHash);
      setDone(true);
    } catch (err: any) {
      const msg: string = err?.message ?? "Swap failed";
      if (!/reject|cancel|denied|user refused/i.test(msg)) setExecError(msg.slice(0, 200));
    } finally {
      setBridging(false);
      setBridgeStep(null);
    }
  }

  function reset() {
    setDone(false);
    setTxHash(null);
    setReceiveAmt("");
    setQuoteResult(null);
    setQuoteError(null);
    setExecError(null);
  }

  const canSwap = !!quoteResult && !quoteLoading && !!srcTok && !!dstTok &&
    !!receiveAmt && parseFloat(receiveAmt) > 0 && !bridging;

  const explorerBase = CHAIN_EXPLORER[srcChain] ?? "https://etherscan.io";

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-card shadow-lg space-y-4 p-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Zap className="w-4 h-4 text-orange-400" />
            OrahDEX Swap
          </div>
          <p className="text-[11px] text-muted-foreground">
            Swap any token across any chain — instant, non-custodial
          </p>
        </div>
        {done && (
          <button onClick={reset} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw size={11} /> New swap
          </button>
        )}
      </div>

      {done ? (
        /* ── Success state ── */
        <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
            <CheckCircle2 size={16} />
            Swap submitted!
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your {dstTok?.symbol ?? "tokens"} are on their way to {CHAIN_NAME[dstChain]}.
            Settlement may take a moment — check your wallet once confirmed.
          </p>
          {txHash && (
            <a
              href={`${explorerBase}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 underline"
            >
              View transaction <ExternalLink size={11} />
            </a>
          )}
          <button
            onClick={reset}
            className="w-full py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
          >
            Make another swap
          </button>
        </div>
      ) : (
        <>
          {/* ── Source chain ── */}
          <ChainSelect value={srcChain} onChange={id => { setSrcChain(id); setQuoteResult(null); }} label="From chain" />

          {/* ── Source token ── */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">You pay (estimated)</label>
            <div className="flex items-center gap-2 h-12 rounded-xl border border-border bg-muted/30 px-3">
              <TokenSelect tokens={srcTokens} loading={srcLoading} value={srcTok?.address ?? ""} onChange={setSrcTok} />
              <div className="flex-1 text-right font-mono text-sm font-semibold min-w-0 overflow-hidden">
                {quoteLoading ? (
                  <Loader2 size={14} className="animate-spin text-muted-foreground ml-auto" />
                ) : quoteResult ? (
                  <span className="text-foreground">
                    {fmtAmt(quoteResult.originAmount, quoteResult.originDecimals)}{" "}
                    <span className="text-muted-foreground text-[11px]">{quoteResult.originSymbol}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground/40 text-sm">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="p-2 rounded-full border border-cyan-500/25 bg-cyan-500/5 text-cyan-400">
              <ArrowDown size={14} />
            </div>
          </div>

          {/* ── Destination chain ── */}
          <ChainSelect value={dstChain} onChange={id => { setDstChain(id); setQuoteResult(null); }} label="To chain" />

          {/* ── Destination token + amount ── */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">You receive (exact)</label>
            <div className="flex items-center gap-2 h-12 rounded-xl border border-cyan-500/30 bg-muted/30 px-3 focus-within:border-cyan-500/60 focus-within:ring-1 focus-within:ring-cyan-500/15 transition-all">
              <TokenSelect tokens={dstTokens} loading={dstLoading} value={dstTok?.address ?? ""} onChange={setDstTok} />
              <input
                type="number"
                value={receiveAmt}
                onChange={e => { setReceiveAmt(e.target.value); setQuoteResult(null); setQuoteError(null); setExecError(null); }}
                placeholder="0.00"
                min="0"
                step="any"
                className="flex-1 min-w-0 bg-transparent text-right text-sm font-bold font-mono text-foreground focus:outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          </div>

          {/* ── Quote summary ── */}
          {quoteResult && !quoteLoading && (
            <div className="flex items-center gap-3 rounded-xl bg-secondary/60 border border-border px-3 py-2.5 text-xs">
              <div className="flex-1 min-w-0">
                <span className="text-muted-foreground">Pay: </span>
                <span className="font-semibold text-foreground font-mono">
                  {fmtAmt(quoteResult.originAmount, quoteResult.originDecimals)} {quoteResult.originSymbol}
                </span>
                <span className="text-muted-foreground"> on {CHAIN_NAME[srcChain]}</span>
              </div>
              <span className="text-cyan-400 font-mono text-[10px] shrink-0">{fmtTime(quoteResult.estimatedMs)}</span>
            </div>
          )}

          {/* Quote error */}
          {quoteError && !quoteLoading && (
            <div className="flex items-start gap-1.5 text-red-400 text-xs rounded-xl bg-red-500/5 border border-red-500/15 px-3 py-2">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              {quoteError}
            </div>
          )}

          {/* Exec error */}
          {execError && (
            <div className="flex items-start gap-1.5 text-red-400 text-xs rounded-xl bg-red-500/5 border border-red-500/15 px-3 py-2">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              {execError}
            </div>
          )}

          {/* Bridge step indicator */}
          {bridging && bridgeStep && (
            <div className="flex items-center gap-2 text-xs text-cyan-400 font-medium">
              <Loader2 size={12} className="animate-spin" />
              Step {bridgeStep.current} of {bridgeStep.total} — sign in wallet…
            </div>
          )}

          {/* Execute button */}
          <button
            onClick={handleSwap}
            disabled={!canSwap}
            className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-black hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-cyan-500/20 hover:-translate-y-0.5 active:translate-y-0"
          >
            {bridging ? (
              <><Loader2 size={15} className="animate-spin" />
                {bridgeStep ? `Signing step ${bridgeStep.current}/${bridgeStep.total}…` : "Preparing…"}
              </>
            ) : (
              <><Zap size={15} />
                {receiveAmt && parseFloat(receiveAmt) > 0
                  ? `Swap ${receiveAmt} ${dstTok?.symbol ?? ""} →`
                  : "Enter amount to swap"}
              </>
            )}
          </button>

          {/* Info footer */}
          <div className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
            Secure · Non-custodial · Best rates across 9 EVM chains
          </div>
        </>
      )}
    </div>
  );
}
