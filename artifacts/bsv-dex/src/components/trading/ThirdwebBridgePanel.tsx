/**
 * ThirdwebBridgePanel — Universal Bridge widget using ThirdWeb's Bridge API.
 *
 * Lets a user fund an OrahDEX trade from ANY EVM chain/token.
 * Bridge.Buy.prepare() returns a series of ready-to-sign transactions that
 * execute the cross-chain swap; we send them one-by-one via the available wallet
 * (ThirdWeb account → wagmi → window.ethereum injected).
 */

import { useState, useEffect, useRef } from "react";
import { Bridge, NATIVE_TOKEN_ADDRESS, sendTransaction } from "thirdweb";
import { useActiveAccount } from "thirdweb/react";
import { parseUnits, formatUnits } from "viem";
import { thirdwebClient } from "@/lib/thirdweb-client";
import { wagmiConfig } from "@/lib/reown";
import { switchChain as wagmiSwitchChain, getAccount as wagmiGetAccount } from "@wagmi/core";
import { useWalletStore } from "@/store/useWalletStore";
import {
  Zap, X, Loader2, CheckCircle2, AlertCircle, ArrowRight, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Supported source chains ────────────────────────────────────────────────────

const SOURCE_CHAINS = [
  { id: 1,       name: "Ethereum",     nativeSym: "ETH"   },
  { id: 137,     name: "Polygon",      nativeSym: "POL"   },
  { id: 42161,   name: "Arbitrum",     nativeSym: "ETH"   },
  { id: 8453,    name: "Base",         nativeSym: "ETH"   },
  { id: 10,      name: "Optimism",     nativeSym: "ETH"   },
  { id: 56,      name: "BNB Chain",    nativeSym: "BNB"   },
  { id: 43114,   name: "Avalanche",    nativeSym: "AVAX"  },
  { id: 59144,   name: "Linea",        nativeSym: "ETH"   },
  { id: 534352,  name: "Scroll",       nativeSym: "ETH"   },
  { id: 1329,    name: "Sei",          nativeSym: "SEI"   },
  { id: 324,     name: "zkSync Era",   nativeSym: "ETH"   },
  { id: 250,     name: "Fantom",       nativeSym: "FTM"   },
  { id: 25,      name: "Cronos",       nativeSym: "CRO"   },
  { id: 5000,    name: "Mantle",       nativeSym: "MNT"   },
  { id: 100,     name: "Gnosis",       nativeSym: "xDAI"  },
  { id: 42220,   name: "Celo",         nativeSym: "CELO"  },
  { id: 1284,    name: "Moonbeam",     nativeSym: "GLMR"  },
  { id: 146,     name: "Sonic",        nativeSym: "S"     },
  { id: 81457,   name: "Blast",        nativeSym: "ETH"   },
  { id: 34443,   name: "Mode",         nativeSym: "ETH"   },
  { id: 288,     name: "Boba Network", nativeSym: "ETH"   },
  { id: 1088,    name: "Metis",        nativeSym: "METIS" },
  { id: 167000,  name: "Taiko",        nativeSym: "ETH"   },
] as const;

const CHAIN_NAME: Record<number, string> = Object.fromEntries(
  SOURCE_CHAINS.map(c => [c.id, c.name])
);
const CHAIN_NATIVE: Record<number, string> = Object.fromEntries(
  SOURCE_CHAINS.map(c => [c.id, c.nativeSym])
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface BridgeToken {
  chainId:   number;
  address:   string;
  symbol:    string;
  name:      string;
  decimals:  number;
  iconUri?:  string;
  priceUsd?: number;
}

export interface ThirdwebBridgePanelProps {
  destinationChainId:      number;
  destinationTokenAddress: string;   // NATIVE_TOKEN_ADDRESS or ERC-20
  destinationTokenSymbol:  string;
  destinationTokenDecimals?: number; // default 18
  onBridgeComplete?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ms: number) {
  if (ms < 90_000) return `~${Math.round(ms / 1000)}s`;
  return `~${Math.round(ms / 60_000)} min`;
}

function formatAmt(raw: bigint, decimals: number, maxFrac = 6) {
  const f = parseFloat(formatUnits(raw, decimals));
  return f.toLocaleString("en-US", { maximumFractionDigits: maxFrac, minimumSignificantDigits: 1 });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ThirdwebBridgePanel({
  destinationChainId,
  destinationTokenAddress,
  destinationTokenSymbol,
  destinationTokenDecimals = 18,
  onBridgeComplete,
}: ThirdwebBridgePanelProps) {
  const thirdwebAccount = useActiveAccount();
  const storeAddress = useWalletStore(s => s.address);

  const [open,          setOpen]          = useState(false);
  const [srcChainId,    setSrcChainId]    = useState<number>(
    () => SOURCE_CHAINS.find(c => c.id !== destinationChainId)?.id ?? 137
  );
  const [tokens,        setTokens]        = useState<BridgeToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [srcToken,      setSrcToken]      = useState<BridgeToken | null>(null);
  const [destAmount,    setDestAmount]    = useState("");

  const [quoteLoading,  setQuoteLoading]  = useState(false);
  const [quoteResult,   setQuoteResult]   = useState<{
    originAmount: bigint; originDecimals: number; originSymbol: string; estimatedMs: number;
  } | null>(null);
  const [quoteError,    setQuoteError]    = useState<string | null>(null);

  const [bridging,      setBridging]      = useState(false);
  const [bridgeStep,    setBridgeStep]    = useState<{ current: number; total: number } | null>(null);
  const [bridgeDone,    setBridgeDone]    = useState(false);
  const [bridgeError,   setBridgeError]   = useState<string | null>(null);
  const [bridgeTxHash,  setBridgeTxHash]  = useState<string | null>(null);

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load tokens for selected source chain ─────────────────────────────────

  useEffect(() => {
    if (!open) return;
    setTokens([]);
    setSrcToken(null);
    setQuoteResult(null);
    setQuoteError(null);
    setTokensLoading(true);

    const native: BridgeToken = {
      chainId:  srcChainId,
      address:  NATIVE_TOKEN_ADDRESS,
      symbol:   CHAIN_NATIVE[srcChainId] ?? "ETH",
      name:     "Native",
      decimals: 18,
    };

    Bridge.tokens({ client: thirdwebClient, chainId: srcChainId })
      .then(list => {
        const top = list.slice(0, 30) as BridgeToken[];
        setTokens(top);
        const nativeTok = top.find(t =>
          t.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()
        );
        setSrcToken(nativeTok ?? top[0] ?? native);
      })
      .catch(() => {
        setTokens([native]);
        setSrcToken(native);
      })
      .finally(() => setTokensLoading(false));
  }, [srcChainId, open]);

  // ── Quote ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!srcToken || !destAmount || parseFloat(destAmount) <= 0) {
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
        const destAmountWei = parseUnits(destAmount, destinationTokenDecimals);
        const q = await Bridge.Buy.quote({
          client:                   thirdwebClient,
          originChainId:            srcChainId,
          originTokenAddress:       srcToken.address as `0x${string}`,
          destinationChainId,
          destinationTokenAddress:  destinationTokenAddress as `0x${string}`,
          amount:                   destAmountWei,
        });
        setQuoteResult({
          originAmount:  q.originAmount,
          originDecimals: srcToken.decimals,
          originSymbol:  srcToken.symbol,
          estimatedMs:   q.estimatedExecutionTimeMs ?? 60_000,
        });
      } catch (e: any) {
        const msg: string = e?.message ?? "No bridge route found for this pair.";
        setQuoteError(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
      } finally {
        setQuoteLoading(false);
      }
    }, 700);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [srcToken, destAmount, srcChainId, destinationChainId, destinationTokenAddress, destinationTokenDecimals]);

  // ── Execute bridge ────────────────────────────────────────────────────────

  async function handleBridge() {
    if (!srcToken || !destAmount || parseFloat(destAmount) <= 0) return;

    const eth = (window as any).ethereum;

    // Resolve wallet: ThirdWeb account → window.ethereum → Reown/WalletConnect connector
    let senderAddress: string | null = null;
    let reownProvider: any = null;

    if (thirdwebAccount) {
      senderAddress = thirdwebAccount.address;
    } else if (eth) {
      let accounts: string[] = await eth.request({ method: "eth_accounts" });
      if (!accounts?.length) accounts = await eth.request({ method: "eth_requestAccounts" });
      senderAddress = accounts?.[0] ?? null;
    } else if (storeAddress) {
      // Wallet connected via Reown/WalletConnect — address is already in the store.
      // wagmiSwitchChain "wakes up" the WalletConnect session so the provider
      // responds to requests (mirrors escrow.ts sendRawViaReown pattern).
      senderAddress = storeAddress;
      try {
        const acct = wagmiGetAccount(wagmiConfig);
        if (acct.chainId !== srcChainId) {
          await wagmiSwitchChain(wagmiConfig, { chainId: srcChainId });
        }
      } catch {}
      for (const connector of (wagmiConfig as any).connectors ?? []) {
        try {
          const p = await (connector as any).getProvider?.();
          if (p) { reownProvider = p; break; }
        } catch {}
      }
    }

    if (!senderAddress) {
      setBridgeError("No wallet connected. Connect a wallet first.");
      return;
    }

    setBridging(true);
    setBridgeError(null);
    setBridgeTxHash(null);

    try {
      const destAmountWei = parseUnits(destAmount, destinationTokenDecimals);
      const prepared = await Bridge.Buy.prepare({
        client:                   thirdwebClient,
        originChainId:            srcChainId,
        originTokenAddress:       srcToken.address as `0x${string}`,
        destinationChainId,
        destinationTokenAddress:  destinationTokenAddress as `0x${string}`,
        amount:                   destAmountWei,
        sender:                   senderAddress as `0x${string}`,
        receiver:                 senderAddress as `0x${string}`,
      });

      const allTxs = prepared.steps.flatMap(s => s.transactions);
      if (!allTxs.length) throw new Error("No transactions returned by bridge.");

      let firstHash: string | null = null;

      for (let i = 0; i < allTxs.length; i++) {
        const tx = allTxs[i];
        setBridgeStep({ current: i + 1, total: allTxs.length });

        if (thirdwebAccount) {
          const result = await sendTransaction({ transaction: tx, account: thirdwebAccount });
          if (i === 0) firstHash = result.transactionHash;
        } else {
          const eip1193 = reownProvider ?? eth;
          const chainHex = "0x" + tx.chainId.toString(16);
          const curChain: string = await eip1193.request({ method: "eth_chainId" });
          if (curChain.toLowerCase() !== chainHex.toLowerCase()) {
            await eip1193.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: chainHex }],
            });
          }
          const hash: string = await eip1193.request({
            method: "eth_sendTransaction",
            params: [{
              from:  senderAddress,
              to:    tx.to,
              data:  tx.data,
              value: tx.value ? "0x" + tx.value.toString(16) : "0x0",
            }],
          });
          if (i === 0) firstHash = hash;
        }
      }

      if (firstHash) setBridgeTxHash(firstHash);
      setBridgeDone(true);
      onBridgeComplete?.();
    } catch (err: any) {
      const msg: string = err?.message ?? "Bridge failed";
      const isReject = /reject|cancel|denied|user refused/i.test(msg);
      if (!isReject) setBridgeError(msg.slice(0, 200));
    } finally {
      setBridging(false);
      setBridgeStep(null);
    }
  }

  // ── Closed state ──────────────────────────────────────────────────────────

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 text-[11px] font-semibold hover:bg-cyan-500/10 transition-colors"
      >
        <Zap size={11} />
        Bridge from any chain to fund this trade
      </button>
    );
  }

  // ── Done state ────────────────────────────────────────────────────────────

  if (bridgeDone) {
    const explorerBase: Record<number, string> = {
      1: "https://etherscan.io",        137: "https://polygonscan.com",
      42161: "https://arbiscan.io",     8453: "https://basescan.org",
      10: "https://optimistic.etherscan.io", 56: "https://bscscan.com",
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
    const explorer = explorerBase[srcChainId] ?? "https://etherscan.io";

    return (
      <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-3 space-y-2">
        <div className="flex items-center gap-2 text-green-400 text-[11px] font-semibold">
          <CheckCircle2 size={13} />
          Bridge submitted! Your {destinationTokenSymbol} is on its way.
        </div>
        {bridgeTxHash && (
          <a
            href={`${explorer}/tx/${bridgeTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-cyan-400 underline hover:text-cyan-300"
          >
            View transaction ↗
          </a>
        )}
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Bridge settlement takes a moment. Your balance will update once confirmed —
          then place your trade.
        </p>
        <button
          type="button"
          onClick={() => { setBridgeDone(false); setOpen(false); }}
          className="text-[10px] text-muted-foreground underline hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // ── Open state (main panel) ───────────────────────────────────────────────

  const canBridge = !!quoteResult && !quoteLoading && !!srcToken &&
    !!destAmount && parseFloat(destAmount) > 0 && !bridging;

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-3 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-cyan-400 text-[11px] font-semibold">
          <Zap size={12} />
          Bridge from any chain
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X size={12} />
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Pay with any EVM token — ThirdWeb Universal Bridge converts it to{" "}
        <span className="text-foreground font-semibold">{destinationTokenSymbol}</span> on{" "}
        <span className="text-foreground">{CHAIN_NAME[destinationChainId] ?? `Chain ${destinationChainId}`}</span>.
      </p>

      {/* Source chain + token row */}
      <div className="space-y-1.5">
        <label className="text-[10px] text-muted-foreground font-medium">Pay from</label>
        <div className="flex gap-1.5">
          <select
            value={srcChainId}
            onChange={e => {
              setSrcChainId(Number(e.target.value));
              setQuoteResult(null);
              setQuoteError(null);
            }}
            className="flex-1 h-8 rounded-lg border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:border-cyan-500/50 min-w-0"
          >
            {SOURCE_CHAINS.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={srcToken?.address ?? ""}
            onChange={e => {
              const t = tokens.find(tok => tok.address === e.target.value);
              setSrcToken(t ?? null);
              setQuoteResult(null);
              setQuoteError(null);
            }}
            disabled={tokensLoading || !tokens.length}
            className="flex-1 h-8 rounded-lg border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:border-cyan-500/50 min-w-0 disabled:opacity-60"
          >
            {tokensLoading && <option>Loading…</option>}
            {tokens.map(t => (
              <option key={t.address} value={t.address}>
                {t.symbol}{t.priceUsd ? ` ~$${t.priceUsd.toFixed(2)}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Destination amount */}
      <div className="space-y-1.5">
        <label className="text-[10px] text-muted-foreground font-medium">
          How much {destinationTokenSymbol} do you need?
        </label>
        <div className={cn(
          "flex items-center h-9 rounded-lg border bg-background px-2.5 gap-2 transition-colors",
          "border-border focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/20"
        )}>
          <input
            type="number"
            value={destAmount}
            onChange={e => { setDestAmount(e.target.value); setQuoteResult(null); setQuoteError(null); }}
            placeholder="0.00"
            min="0"
            step="any"
            className="flex-1 bg-transparent text-[11px] text-foreground font-mono focus:outline-none"
          />
          <span className="text-[10px] text-muted-foreground shrink-0">{destinationTokenSymbol}</span>
        </div>
      </div>

      {/* Quote display */}
      {quoteLoading && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Loader2 size={11} className="animate-spin" />
          Getting best route…
        </div>
      )}

      {quoteResult && !quoteLoading && (
        <div className="flex items-center gap-2 rounded-lg bg-secondary/60 border border-border px-2.5 py-2 text-[11px]">
          <div className="flex-1 text-muted-foreground">
            You send:{" "}
            <span className="font-semibold text-foreground">
              {formatAmt(quoteResult.originAmount, quoteResult.originDecimals)} {quoteResult.originSymbol}
            </span>
          </div>
          <ArrowRight size={11} className="text-muted-foreground/50 shrink-0" />
          <div className="text-muted-foreground">
            <span className="font-semibold text-green-400">{destAmount} {destinationTokenSymbol}</span>
          </div>
          <span className="text-[10px] text-muted-foreground/60 shrink-0">
            {formatTime(quoteResult.estimatedMs)}
          </span>
        </div>
      )}

      {quoteError && !quoteLoading && (
        <div className="flex items-start gap-1.5 text-red-400 text-[10px]">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          {quoteError}
        </div>
      )}

      {/* Bridge error */}
      {bridgeError && (
        <div className="flex items-start gap-1.5 text-red-400 text-[10px]">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          {bridgeError}
        </div>
      )}

      {/* Execute button */}
      <button
        type="button"
        onClick={handleBridge}
        disabled={!canBridge}
        className="w-full py-2.5 rounded-xl bg-cyan-500 text-black text-[12px] font-bold hover:bg-cyan-400 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
      >
        {bridging && <Loader2 size={12} className="animate-spin" />}
        {bridging
          ? (bridgeStep
            ? `Step ${bridgeStep.current}/${bridgeStep.total} — sign in wallet…`
            : "Preparing bridge…")
          : `Bridge ${destAmount || "0"} ${destinationTokenSymbol} →`
        }
      </button>

      {!thirdwebAccount && (
        <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
          Uses your connected wallet. For best results, connect via ThirdWeb.
        </p>
      )}
    </div>
  );
}
