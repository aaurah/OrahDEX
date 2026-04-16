import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { usePlaceOrder } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useExchangeBalanceStore } from "@/store/useExchangeBalanceStore";
import { cn, formatPrice } from "@/lib/utils";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { getNativeSymbol } from "@/lib/chainConfig";
import { useQuote, KEEPER_TIER_COLORS } from "@/hooks/useQuote";
import { precheck, TradeTimer, reportTradeMetrics, getBadge, type PrecheckResult } from "@/lib/tradeEngine";
import { SettlementExplorer } from "@/components/trading/SettlementExplorer";
import { HTLCSettlementCard } from "@/components/trading/HTLCSettlementCard";
import { type TradeErrorCode } from "@/lib/tradeErrors";
import {
  Wallet, Shield, Zap, ArrowRightLeft, CheckCircle2,
  ExternalLink, Loader2, PenLine, Settings2, AlertTriangle,
  Lock, ShieldCheck, RefreshCw, Crown, TrendingDown, Flame,
  XCircle, Info, Route, Timer, Smartphone, QrCode,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { API_BASE } from "@/lib/api";
import {
  CHAIN_DISPLAY, ADDRESS_PLACEHOLDERS,
  getAssetNativeChain, walletCanReceive,
} from "@/lib/crossChain";

type Side = "buy" | "sell";
type OrderType = "limit" | "market" | "stop";

// ── Mobile QR connect panel ────────────────────────────────────────────────────
type QRState = "idle" | "loading" | "showing" | "connected" | "expired" | "error";

function MobileConnectQR({ onConnected }: { onConnected: () => void }) {
  const connect = useWalletStore((s) => s.connect);
  const { toast } = useToast();
  const [qrState, setQrState] = useState<QRState>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  useEffect(() => () => stopPolling(), []);

  const startSession = async () => {
    stopPolling();
    setQrState("loading");
    setToken(null);
    try {
      const res = await fetch(`${API_BASE}/connect-session`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const { token: t, expiresAt: exp } = await res.json() as { token: string; expiresAt: number };
      setToken(t);
      setExpiresAt(exp);
      setSecondsLeft(Math.max(0, Math.round((exp - Date.now()) / 1000)));
      setQrState("showing");

      // countdown
      countdownRef.current = setInterval(() => {
        const s = Math.max(0, Math.round((exp - Date.now()) / 1000));
        setSecondsLeft(s);
        if (s <= 0) {
          stopPolling();
          setQrState("expired");
        }
      }, 1000);

      // poll for connection
      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch(`${API_BASE}/connect-session/${t}`);
          if (!pr.ok) { stopPolling(); setQrState("expired"); return; }
          const data = await pr.json() as { status: string; address?: string; chain?: string; walletType?: string };
          if (data.status === "connected" && data.address) {
            stopPolling();
            const network = data.chain === "BSV" ? "bsv" : data.chain === "TRON" ? "tron" : "evm";
            connect({ address: data.address, provider: data.walletType ?? "mobile", network });
            setQrState("connected");
            toast({ title: "Mobile connected!", description: `${data.address.slice(0, 8)}…${data.address.slice(-6)}` });
            setTimeout(onConnected, 1200);
          }
        } catch { /* network hiccup — keep polling */ }
      }, 2000);
    } catch {
      setQrState("error");
    }
  };

  const qrUri = token ? `orahdex://connect?token=${token}&expires=${expiresAt}` : "";
  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");

  if (qrState === "idle") {
    return (
      <button
        onClick={startSession}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/25 bg-primary/5 text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
      >
        <Smartphone className="w-4 h-4" />
        Connect via Mobile App
      </button>
    );
  }

  if (qrState === "loading") {
    return (
      <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/20 bg-primary/5 text-primary text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Generating QR…
      </div>
    );
  }

  if (qrState === "connected") {
    return (
      <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-green-500/40 bg-green-500/10 text-green-400 font-bold text-sm">
        <CheckCircle2 className="w-4 h-4" />
        Mobile connected!
      </div>
    );
  }

  if (qrState === "expired" || qrState === "error") {
    return (
      <div className="w-full space-y-2">
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <XCircle className="w-3.5 h-3.5 text-red-400" />
          {qrState === "expired" ? "QR code expired" : "Could not generate QR"}
        </div>
        <button
          onClick={startSession}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/25 bg-primary/5 text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try Again
        </button>
      </div>
    );
  }

  // showing — render QR code
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-2">
        <QrCode className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">Scan with OrahDEX Mobile</span>
        <span className={cn(
          "ml-auto text-[10px] font-mono font-bold tabular-nums",
          secondsLeft < 60 ? "text-red-400" : "text-muted-foreground",
        )}>
          {mins}:{secs}
        </span>
      </div>
      <div className="flex justify-center">
        <div className="p-3 rounded-2xl bg-white shadow-lg shadow-black/30" style={{ colorScheme: "light" }}>
          <QRCodeCanvas
            value={qrUri}
            size={148}
            level="M"
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
        Open the OrahDEX mobile app → QR Scanner → Scan to Connect.<br />
        Your wallet will link automatically.
      </p>
      <button
        onClick={() => { stopPolling(); setQrState("idle"); }}
        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Wallet prompt shown when no wallet is connected ───────────────────────────
function WalletPrompt({ base = "BSV", quote = "USDT" }: { base?: string; quote?: string }) {
  const openModal = useWalletModalStore((s) => s.open);

  return (
    <div className="flex flex-col h-full">
      <div className="flex opacity-30 pointer-events-none select-none">
        <div className="flex-1 py-2 text-center font-semibold text-xs text-buy border-b-2 border-buy bg-buy/5">Buy</div>
        <div className="flex-1 py-2 text-center font-semibold text-xs text-muted-foreground border-b-2 border-transparent">Sell</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-5 py-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/30 to-primary/30 flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/10">
            <Wallet className="w-7 h-7 text-primary" />
          </div>
          <div className="absolute -inset-1 rounded-2xl border border-primary/20 animate-ping opacity-30" />
        </div>
        <div className="text-center">
          <h3 className="font-bold text-foreground text-base mb-1.5">Connect to Trade</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Connect your wallet or create a new one to start trading.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white py-3.5 rounded-xl font-bold text-sm shadow-md shadow-primary/20 hover:shadow-primary/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
        >
          <Wallet className="w-4 h-4" />
          Connect Wallet
        </button>
        <div className="w-full">
          <MobileConnectQR onConnected={() => {}} />
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Connect to start trading
        </p>
        <div className="w-full grid grid-cols-3 gap-2 pt-1">
          {[
            { icon: Shield, label: "Non-custodial" },
            { icon: Zap, label: "BSV settled" },
            { icon: ArrowRightLeft, label: "Multi-chain" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 bg-white/3 rounded-xl py-3 border border-white/5">
              <Icon className="w-4 h-4 text-primary/70" />
              <span className="text-[10px] text-muted-foreground font-medium text-center leading-tight">{label}</span>
            </div>
          ))}
        </div>
        <div className="w-full space-y-2 opacity-20 pointer-events-none select-none mt-1">
          <div className="flex items-center bg-secondary border border-border rounded-xl px-3 py-2.5">
            <span className="text-muted-foreground text-sm w-16">Price</span>
            <span className="flex-1 text-right font-mono text-sm">—</span>
            <span className="text-muted-foreground text-xs ml-2 shrink-0">{quote}</span>
          </div>
          <div className="flex items-center bg-secondary border border-border rounded-xl px-3 py-2.5">
            <span className="text-muted-foreground text-sm w-16">Amount</span>
            <span className="flex-1 text-right font-mono text-sm">—</span>
            <span className="text-muted-foreground text-xs ml-2 shrink-0">{base}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Settlement result banner ───────────────────────────────────────────────────
function SettlementBanner({
  matched,
  txid,
  explorerUrl,
  crossChain,
  htlcAddress,
  settlementType,
  onDismiss,
}: {
  matched: boolean;
  txid: string | null;
  explorerUrl: string | null;
  crossChain?: boolean;
  htlcAddress?: string | null;
  settlementType?: string | null;
  onDismiss: () => void;
}) {
  if (!matched) return null;
  const isHtlc = settlementType === "utxo_htlc" || crossChain;
  return (
    <div className={`mx-4 mb-3 p-3 rounded-xl flex flex-col gap-1.5 ${
      isHtlc
        ? "bg-blue-500/10 border border-blue-500/25"
        : "bg-green-500/10 border border-green-500/25"
    }`}>
      <div className="flex items-center gap-2">
        <CheckCircle2 className={`w-4 h-4 shrink-0 ${isHtlc ? "text-blue-400" : "text-green-400"}`} />
        <span className={`text-xs font-semibold ${isHtlc ? "text-blue-400" : "text-green-400"}`}>
          {isHtlc ? "Cross-Chain HTLC Settlement" : "Trade Matched & Settled On-Chain"}
        </span>
      </div>
      {txid && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-mono break-all leading-relaxed">
            BSV txid: {txid.slice(0, 16)}…{txid.slice(-8)}
          </span>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-primary hover:text-primary/80"
              title="View on WhatsOnChain"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
      {isHtlc && htlcAddress && (
        <div className="text-[10px] text-muted-foreground font-mono break-all">
          HTLC: {htlcAddress.slice(0, 18)}…{htlcAddress.slice(-6)}
        </div>
      )}
      <button onClick={onDismiss} className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground text-left">
        Dismiss
      </button>
    </div>
  );
}

export interface OrderFormFill {
  price: string;
  amount: string;
  side: "buy" | "sell";
  ts: number;
}

// ── Main OrderForm ─────────────────────────────────────────────────────────────
export function OrderForm({ symbol, currentPrice = 0, externalFill, onOrderPlaced }: {
  symbol: string;
  currentPrice?: number;
  externalFill?: OrderFormFill | null;
  onOrderPlaced?: () => void;
}) {
  const { address, network, balance, chainId: walletChainId, provider, internalEvmAddress, internalBsvAddress, internalBchAddress, internalBtcAddress, internalSolAddress } = useWalletStore();
  const { toast } = useToast();
  const { addNotification } = useNotificationStore();
  const { applyFill, getBalance: getDexBalance } = useExchangeBalanceStore();
  const isEvm = !address || network === "evm" || address.startsWith("0x");
  const isOrahWallet = !!provider;
  const usesApiBalance = isOrahWallet;

  const chainId = walletChainId ?? 1;
  const nativeSymbol = network === "bsv" ? "BSV" : network === "sol" ? "SOL" : network === "btc" ? "BTC" : getNativeSymbol(chainId);
  const nativeBal = balance ? parseFloat(balance) : 0;

  // Fetch real on-chain token balances for the connected EVM wallet
  const { balances: tokenBalances, loading: balancesLoading, refresh: refreshBalances } = useEvmBalances(
    isEvm ? address : null,
    isEvm ? chainId : null
  );

  // ── API ledger balances (available + locked) ────────────────────────────────
  const [apiBalances, setApiBalances] = useState<Record<string, number>>({});
  const [apiLockedBalances, setApiLockedBalances] = useState<Record<string, number>>({});
  const fetchApiBalances = useCallback(async (b: string, q: string, addr: string) => {
    const fetchOne = async (asset: string) => {
      try {
        const r = await fetch(`${API_BASE}/balances/${asset}?walletAddress=${addr}`);
        if (!r.ok) return { available: 0, locked: 0 };
        const j = await r.json();
        return {
          available: parseFloat(j.available ?? "0") || 0,
          locked: parseFloat(j.locked ?? "0") || 0,
        };
      } catch { return { available: 0, locked: 0 }; }
    };
    const [bRes, qRes] = await Promise.all([fetchOne(b), fetchOne(q)]);
    setApiBalances({ [b]: bRes.available, [q]: qRes.available });
    setApiLockedBalances({ [b]: bRes.locked, [q]: qRes.locked });
  }, []);
  useEffect(() => {
    if (!usesApiBalance || !address) { setApiBalances({}); return; }
    const parts2 = symbol.split("/");
    const b = parts2[0];
    const q = parts2[1] ?? "USDT";
    fetchApiBalances(b, q, address);
  }, [usesApiBalance, address, symbol, fetchApiBalances]);

  const [side, setSide]       = useState<Side>("buy");
  const [type, setType]       = useState<OrderType>("limit");
  const [price, setPrice]     = useState<string>(currentPrice > 0 ? currentPrice.toFixed(2) : "");
  const [stopPrice, setStopPrice] = useState<string>("");
  const [amount, setAmount]   = useState<string>("");
  const [autoBorrow, setAutoBorrow] = useState(false);

  const [filledFromBook, setFilledFromBook] = useState(false);
  // When the user clicks a row in the Order Book, fill price + amount here
  useEffect(() => {
    if (!externalFill) return;
    setPrice(externalFill.price);
    setAmount(externalFill.amount);
    setSide(externalFill.side);
    setType("limit");
    setFilledFromBook(true);
    const t = setTimeout(() => setFilledFromBook(false), 1800);
    return () => clearTimeout(t);
  }, [externalFill?.ts]);


  // ── Order confirmation modal ──────────────────────────────────────────────────
  // For limit/stop orders we show a confirmation bottom-sheet instead of
  // triggering a wallet signing popup (which is unreliable for Reown/WalletConnect
  // on mobile).  The "confirmed" ref lets the second invocation of handleSubmit
  // skip straight to the API call.
  const [showConfirm, setShowConfirm] = useState(false);
  const confirmRef = useRef(false);
  const formRef    = useRef<HTMLFormElement | null>(null);

  const { isConnected: evmConnected } = useAccount();
  const [settlement, setSettlement] = useState<{
    matched: boolean; txid: string | null; explorerUrl: string | null;
    crossChain?: boolean; htlcAddress?: string | null; settlementType?: string | null;
    htlcLocktimeBlocks?: number | null; opReturnPayload?: string | null;
  } | null>(null);
  // EVM HTLC session ID — set when a matched fill requires on-chain atomic lock
  const [evmHtlcSessionId, setEvmHtlcSessionId] = useState<string | null>(null);
  const [slippage, setSlippage] = useState(0.5);
  const [slippageOpen, setSlippageOpen] = useState(false);
  const [customSlip, setCustomSlip] = useState("");

  // ── Cross-chain receive address ──────────────────────────────────────────────
  const [receiveAddress, setReceiveAddress] = useState("");

  // ── Precheck state (declared here, logic wired after balances are computed)
  const [precheckResult, setPrecheckResult] = useState<PrecheckResult | null>(null);
  const [precheckLoading, setPrecheckLoading] = useState(false);
  const precheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parts = symbol.split("/");
  const [base, quote = "USDT"] = parts;

  // Cross-chain derived values (must come after `base` is declared)
  const baseChain = getAssetNativeChain(base);
  const canReceive = walletCanReceive(network, baseChain);
  // EVM assets can be held by the internal EVM sub-wallet (for BSV users)
  const isEvmChain = baseChain === "evm";
  const hasInternalEvm = !!internalEvmAddress && network === "bsv";
  const evmHandled = isEvmChain && hasInternalEvm;
  // BSV assets can be held by the internal BSV sub-wallet (for EVM users)
  const isBsvChain = baseChain === "bsv";
  const hasInternalBsv = !!internalBsvAddress && network === "evm";
  const bsvHandled = isBsvChain && hasInternalBsv;
  // BTC — HD wallet derives a separate address (m/44'/0'/0'/0/0)
  const isBtcChain = baseChain === "bitcoin";
  const hasInternalBtc = !!internalBtcAddress && network === "evm";
  const btcHandled = isBtcChain && hasInternalBtc;
  // SOL — HD wallet derives a SLIP-0010 ed25519 address (m/44'/501'/0'/0')
  const isSolChain = baseChain === "solana";
  const hasInternalSol = !!internalSolAddress && network === "evm";
  const solHandled = isSolChain && hasInternalSol;
  // For HD wallets BTC address differs from BSV; custodial wallets share one key
  const hasSeparateBtcAddr = !!internalBtcAddress && internalBtcAddress !== internalBsvAddress;
  // Show amber cross-chain warning only for truly incompatible chains
  const showCrossChainNotice = side === "buy" && !!address && !canReceive && !evmHandled && !bsvHandled && !btcHandled && !solHandled;
  const showEvmWalletInfo = side === "buy" && !!address && network === "bsv" && isEvmChain && hasInternalEvm;
  const showBsvWalletInfo = side === "buy" && !!address && network === "evm" && isBsvChain && hasInternalBsv;
  const showBtcWalletInfo = side === "buy" && !!address && network === "evm" && isBtcChain && hasInternalBtc;
  const showSolWalletInfo = side === "buy" && !!address && network === "evm" && isSolChain && hasInternalSol;
  const chainName = CHAIN_DISPLAY[baseChain] ?? baseChain;
  const addrPlaceholder = ADDRESS_PLACEHOLDERS[baseChain] ?? `${base} address…`;

  // Derive available balance for each side using real on-chain data:
  // • Sell: how much of the base asset the user has (e.g. BSV, BTC, ETH)
  // • Buy:  how much of the quote asset they can spend (e.g. USDT, USDC)
  const baseBalEntry  = tokenBalances.find(t => t.symbol.toUpperCase() === base.toUpperCase());
  const quoteBalEntry = tokenBalances.find(t => t.symbol.toUpperCase() === quote.toUpperCase());
  // If base is the native token (ETH, BNB, etc.), fall back to native balance from store
  const isNativeBase = base.toUpperCase() === nativeSymbol.toUpperCase();

  // Non-custodial: trade directly from on-chain wallet balance — no deposit required.
  // useEvmBalances includes the native token (ETH/BNB/…) in its results, so prefer that
  // over the wallet store's stale `balance` field. Fall back to the store value only while
  // the hook hasn't completed its first fetch (tokenBalances still empty).
  const walletBase  = baseBalEntry?.amount ?? (isNativeBase ? nativeBal : 0);
  const walletQuote = quoteBalEntry?.amount ?? 0;

  // Non-custodial: EVM wallets trade directly from wallet.
  // Orah Wallet users use the API ledger balance.
  const baseAvailable  = usesApiBalance
    ? (apiBalances[base] ?? 0)
    : walletBase;
  const quoteAvailable = usesApiBalance
    ? (apiBalances[quote] ?? 0)
    : walletQuote;
  const availableAmt   = side === "sell" ? baseAvailable  : quoteAvailable;
  const availableSym   = side === "sell" ? base : quote;

  // ── Locked amount for open orders (from API ledger) ────────────────────────
  const apiLockedAmt = usesApiBalance
    ? (apiLockedBalances[availableSym] ?? 0)
    : 0;

  // ── Precheck runner (declared after balances so availableAmt is in scope) ──
  const runPrecheck = useCallback(async (amt: string, px: string) => {
    if (!address || !amt || parseFloat(amt) <= 0) {
      setPrecheckResult(null);
      return;
    }
    setPrecheckLoading(true);
    try {
      const result = await precheck({
        symbol,
        side,
        type,
        amount:           parseFloat(amt),
        price:            px ? parseFloat(px) : undefined,
        slippageBps:      Math.round(slippage * 100),
        availableBalance: availableAmt,
        currentPrice,
        network:          (network as any) ?? "evm",
        address:          address ?? "",
      });
      setPrecheckResult(result);
    } finally {
      setPrecheckLoading(false);
    }
  }, [address, symbol, side, type, slippage, availableAmt, currentPrice, network]);

  // Debounce precheck 300 ms after amount/price changes
  useEffect(() => {
    if (precheckTimerRef.current) clearTimeout(precheckTimerRef.current);
    precheckTimerRef.current = setTimeout(() => void runPrecheck(amount, price), 300);
    return () => { if (precheckTimerRef.current) clearTimeout(precheckTimerRef.current); };
  }, [amount, price, side, type, slippage, runPrecheck]);

  const placeOrder = usePlaceOrder({
    mutation: {
      onSuccess: (data: any) => {
        const matched  = data?.matched ?? false;
        const txid     = data?.settlementTxid ?? data?.txid ?? null;
        const url      = data?.explorerUrl ?? null;

        // ── Fill data: use API response fields, never wallet/balance diff ──────
        const filledQty    = data?.filledQuantity ?? parseFloat(amount || "0");
        const avgFillPrice = data?.price ?? (data?.total && filledQty > 0 ? data.total / filledQty : parseFloat(price || "0"));
        const fillFee      = data?.fee ?? 0;

        if (matched) {
          setSettlement({
            matched:            true,
            txid,
            explorerUrl:        url,
            crossChain:         data?.settlement?.crossChain ?? false,
            htlcAddress:        data?.settlement?.htlcAddress ?? null,
            settlementType:     data?.settlement?.type ?? null,
            htlcLocktimeBlocks: data?.settlement?.htlcLocktimeBlocks ?? null,
            opReturnPayload:    data?.settlement?.opReturnPayload ?? null,
          });

          // EVM HTLC non-custodial settlement — show lock prompt to the user
          if (data?.evmHtlcSession?.id) {
            setEvmHtlcSessionId(data.evmHtlcSession.id);
          }

          // Credit the exchange balance ledger so Portfolio reflects the trade
          if (address && filledQty > 0 && avgFillPrice > 0) {
            applyFill(address, side as "buy" | "sell", base, quote, filledQty, avgFillPrice);
          }

          // Compute credited amount from fill payload — no wallet diff
          let receivedQty: string;
          let receivedTok: string;
          if (side === "sell") {
            const gross = filledQty * avgFillPrice;
            const net   = gross - fillFee;
            receivedQty = (net > 0 ? net : gross).toFixed(2);
            receivedTok = quote;
          } else {
            receivedQty = filledQty > 0 ? filledQty.toFixed(6) : "0";
            receivedTok = base;
          }

          const hasEvmHtlc = !!data?.evmHtlcSession?.id;
          const isCrossChainFill = side === "buy" && !walletCanReceive(network, getAssetNativeChain(receivedTok));
          const fillChainName = CHAIN_DISPLAY[getAssetNativeChain(receivedTok)] ?? receivedTok;
          toast({
            title: hasEvmHtlc ? "Order Matched — Lock Funds to Settle" : "Order Filled ✓",
            description: hasEvmHtlc
              ? `Your order matched! Lock ${receivedQty} ${receivedTok} in the HTLC contract below to complete the P2P atomic swap.`
              : isCrossChainFill
                ? `+${receivedQty} ${receivedTok} → OrahDEX balance. To withdraw to ${fillChainName}, go to Portfolio → Withdraw.`
                : `+${receivedQty} ${receivedTok} credited to your OrahDEX balance`,
          });
          addNotification({
            type: "order_filled",
            title: `${side.toUpperCase()} Order Filled ✓`,
            body: hasEvmHtlc
              ? `Lock ${receivedQty} ${receivedTok} on-chain to complete atomic swap — see settlement card`
              : isCrossChainFill
                ? `+${receivedQty} ${receivedTok} in OrahDEX balance · withdraw to ${fillChainName} via Portfolio`
                : `+${receivedQty} ${receivedTok} → OrahDEX balance · BSV settled`,
            pair: symbol,
            side: side as "buy" | "sell",
            txid: txid ?? undefined,
          });
        } else {
          toast({
            title: "Order Open",
            description: `${side.toUpperCase()} ${amount} ${base} @ $${price} · waiting for match`,
          });
          addNotification({
            type: "order_placed",
            title: `${side.toUpperCase()} Order Placed`,
            body: `${amount} ${base} @ $${price || "market"} · open, waiting for match`,
            pair: symbol,
            side: side as "buy" | "sell",
          });
        }
        setAmount("");
        if (address) fetchApiBalances(base, quote, address);
        setTimeout(() => onOrderPlaced?.(), 500);
      },
      onError: (err: any) => {
        const code        = err?.data?.code ?? err?.code;
        const serverMsg   = err?.data?.error ?? err?.data?.message ?? err?.message;
        const isInsufficient = code === "INSUFFICIENT_FUNDS" || serverMsg?.includes("Insufficient");

        toast({
          title:       isInsufficient ? "Insufficient Balance" : "Order Failed",
          description: isInsufficient
            ? "Your balance is too low for this order. Check your available balance and try a smaller amount."
            : `Could not place order${serverMsg ? `: ${serverMsg}` : ""}. Please try again.`,
          variant: "destructive",
        });
        addNotification({
          type: "error",
          title: isInsufficient ? "Insufficient Balance" : "Order Failed",
          body:  isInsufficient
            ? "Order rejected — insufficient balance. Reduce the order size or deposit funds."
            : "Could not place order — please check your balance and try again.",
          pair: symbol,
        });
      },
    },
  });

  const total = parseFloat(price || "0") * parseFloat(amount || "0");

  // ── Live quote from Sovereign Routing API ────────────────────────────────
  // tokenIn/tokenOut depend on side: buying ETH with USDT → tokenIn=USDT, tokenOut=ETH
  const quoteTokenIn  = side === "buy"  ? quote : base;
  const quoteTokenOut = side === "buy"  ? base  : quote;
  const quoteAmount   = side === "buy"
    ? (type !== "market" && price && amount ? (parseFloat(price) * parseFloat(amount)).toFixed(8) : amount)
    : amount;

  const { quote: liveQuote, loading: quoteLoading } = useQuote({
    tokenIn:       quoteTokenIn,
    tokenOut:      quoteTokenOut,
    amount:        quoteAmount,
    chainId:       chainId,
    keeperAddress: isEvm ? address : undefined,
    enabled:       !!amount && parseFloat(amount) > 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !amount || parseFloat(amount) <= 0) return;

    // ── Synchronous balance guard (runs before precheck, no debounce lag) ─────
    // Block immediately if the balance is clearly too low.
    if (availableAmt > 0) {
      const required = parseFloat(amount);
      const total    = price ? parseFloat(price) * required : 0;
      // 1e-9 tolerance covers toFixed(6) rounding so a legitimate 100% fill is
      // never falsely blocked by floating-point arithmetic.
      if (side === "sell" && required > availableAmt + 1e-9) {
        toast({
          title:       "Insufficient Balance",
          description: `You only have ${availableAmt.toFixed(6)} ${availableSym}. Cannot sell ${amount} ${base}.`,
          variant:     "destructive",
        });
        return;
      }
      if (side === "buy" && total > 0 && total > availableAmt + 1e-9) {
        toast({
          title:       "Insufficient Balance",
          description: `You need ${total.toFixed(2)} ${quote} but only have ${availableAmt.toFixed(2)} ${quote}.`,
          variant:     "destructive",
        });
        return;
      }
    }

    // ── Golden path: run precheck (or use cached result) before anything ──
    const timer = new TradeTimer();
    timer.mark("precheck");
    let check = precheckResult;
    if (!check) {
      check = await precheck({
        symbol, side, type,
        amount:           parseFloat(amount),
        price:            price ? parseFloat(price) : undefined,
        slippageBps:      Math.round(slippage * 100),
        availableBalance: availableAmt,
        currentPrice,
        network:          (network as any) ?? "evm",
        address:          address ?? "",
      });
      setPrecheckResult(check);
    }
    timer.end("precheck");

    if (!check.ok) {
      // Map the first blocking error to a toast. Never proceed.
      const first = check.errors[0];
      toast({
        title: "Cannot place order",
        description: first?.message ?? "Fix the errors below before submitting.",
        variant: "destructive",
      });
      return;
    }

    const addTx   = useWalletStore.getState().addPendingTx;

    // ── Step 3: Order confirmation for limit/stop orders ─────────────────────
    // Limit and stop orders don't execute on-chain immediately — they sit in the
    // order book. Wallet signing is unreliable on mobile (especially Reown /
    // WalletConnect) and unnecessary since balance is enforced server-side.
    // Instead we show a clear confirmation modal that tells the user exactly what
    // they're placing, then submit directly to the API.
    if (type !== "market" && !confirmRef.current) {
      setShowConfirm(true);
      return; // Wait for user to confirm in the modal
    }
    confirmRef.current = false; // Reset for next submission

    // ── Place the order — no wallet signing required ───────────────────────
    // OrahDEX is an order-book DEX: orders are matched server-side and settled
    // on BSV chain. No ERC-20 approval or wallet transaction is ever needed.
    placeOrder.mutate(
      {
        data: {
          symbol,
          walletAddress: address,
          side,
          type,
          price:          type !== "market" ? parseFloat(price) : undefined,
          stopPrice:      type === "stop" ? parseFloat(stopPrice) : undefined,
          quantity:       parseFloat(amount),
          networkType:    isEvm ? "evm" : network === 'bch' ? "bch" : network === 'btc' ? "btc" : network === 'sol' ? "sol" : "bsv",
          walletSource:   isOrahWallet ? "orah" : "external",
          reportedBalance: !usesApiBalance ? availableAmt.toString() : undefined,
          receiveAddress: receiveAddress.trim() || undefined,
          autoBorrow,
        } as any,
      },
      {
        onSuccess: async (data: any) => {
          const matched = data?.matched ?? false;
          const txid    = data?.settlementTxid ?? data?.txid ?? null;
          const url     = data?.explorerUrl ?? null;

          if (matched && txid) {
            addTx({
              hash:                 txid,
              chainId:              0,
              label:                `BSV Settlement · ${side.toUpperCase()} ${amount} ${base}`,
              status:               "confirmed",
              confirmations:        1,
              requiredConfirmations: 1,
              timestamp:            Date.now(),
              explorerUrl:          url ?? `https://whatsonchain.com/tx/${txid}`,
            });
          }

          if (matched) {
            const filledQty    = data?.filledQuantity ?? parseFloat(amount || "0");
            const avgFillPrice = data?.price ?? (data?.total && filledQty > 0 ? data.total / filledQty : parseFloat(price || "0"));
            const fillFee      = data?.fee ?? 0;
            const receivedQty  = side === "sell"
              ? ((filledQty * avgFillPrice - fillFee) > 0 ? (filledQty * avgFillPrice - fillFee) : filledQty * avgFillPrice).toFixed(2)
              : filledQty > 0 ? filledQty.toFixed(6) : "0";
            const receivedTok  = side === "sell" ? quote : base;

            if (address && filledQty > 0 && avgFillPrice > 0) {
              applyFill(address, side as "buy" | "sell", base, quote, filledQty, avgFillPrice);
            }

            toast({
              title: "Order Filled ✓",
              description: `+${receivedQty} ${receivedTok} credited to your OrahDEX balance`,
            });
          } else {
            toast({
              title: "Order Open",
              description: `${side.toUpperCase()} ${amount} ${base} @ $${price} · waiting for match`,
            });
          }
          setAmount("");

          if (address) {
            fetchApiBalances(base, quote, address);
          }
          refreshBalances();
          useWalletStore.getState().triggerBalanceRefresh();
          setTimeout(() => onOrderPlaced?.(), 500);
        },
        onError: (err: any) => {
          // Surface server rejection messages (e.g. INSUFFICIENT_FUNDS, bad signature)
          const data = err?.response?.data ?? err?.data ?? {};
          const serverMsg: string =
            data?.message ??
            data?.detail ??
            data?.error ??
            err?.message ??
            "Order rejected by the server.";
          const isInsufficient =
            data?.error === "INSUFFICIENT_FUNDS" ||
            data?.code  === "INSUFFICIENT_FUNDS" ||
            serverMsg.toLowerCase().includes("insufficient");
          toast({
            title:       isInsufficient ? "Insufficient Balance" : "Order Failed",
            description: serverMsg,
            variant:     "destructive",
          });
        },
      }
    );
  };

  if (!address) return <WalletPrompt base={base} quote={quote} />;

  const isPending = placeOrder.isPending;
  const priceValid = type === "market" || (!!price && parseFloat(price) > 0);
  const stopValid  = type !== "stop" || (!!stopPrice && parseFloat(stopPrice) > 0);
  const canSubmit  = !isPending && !!amount && parseFloat(amount) > 0 && priceValid && stopValid;

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Buy / Sell tabs + Auto Borrow */}
      <div className="flex items-stretch border-b border-border shrink-0">
        <button
          data-testid="order-side-buy"
          className={cn("flex-1 py-2 text-center font-semibold text-xs transition-colors border-b-2",
            side === "buy" ? "text-buy border-buy bg-buy/5" : "text-muted-foreground border-transparent hover:bg-white/5")}
          onClick={() => setSide("buy")}
        >
          Buy
        </button>
        <button
          data-testid="order-side-sell"
          className={cn("flex-1 py-2 text-center font-semibold text-xs transition-colors border-b-2",
            side === "sell" ? "text-sell border-sell bg-sell/5" : "text-muted-foreground border-transparent hover:bg-white/5")}
          onClick={() => setSide("sell")}
        >
          Sell
        </button>
        {/* Auto Borrow toggle */}
        <div className="flex items-center gap-1.5 px-3 border-l border-border shrink-0">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Auto Borrow</span>
          <button
            type="button"
            onClick={() => setAutoBorrow(v => !v)}
            className={cn(
              "relative w-8 h-4 rounded-full transition-colors shrink-0",
              autoBorrow ? "bg-primary" : "bg-secondary border border-border"
            )}
          >
            <span className={cn(
              "absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm",
              autoBorrow ? "translate-x-4" : "translate-x-0"
            )} />
          </button>
        </div>
      </div>

      {/* Order Book fill notification */}
      {filledFromBook && (
        <div className="mx-3 mt-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <PenLine className="w-3 h-3 text-primary shrink-0" />
          <span className="text-[11px] text-primary font-semibold">Price & amount filled from order book</span>
        </div>
      )}

      {/* EVM HTLC non-custodial settlement card — shown when both parties are external EVM wallets */}
      {evmHtlcSessionId && (
        <div className="mx-3 mt-2">
          <HTLCSettlementCard
            sessionId={evmHtlcSessionId}
            userAddress={address ?? ""}
            onDismiss={() => setEvmHtlcSessionId(null)}
          />
        </div>
      )}

      {/* Settlement banner + Explorer */}
      {settlement && (
        <>
          <SettlementBanner
            matched={settlement.matched}
            txid={settlement.txid}
            explorerUrl={settlement.explorerUrl}
            crossChain={settlement.crossChain}
            htlcAddress={settlement.htlcAddress}
            settlementType={settlement.settlementType}
            onDismiss={() => setSettlement(null)}
          />
          {/* Settlement Explorer — shown for cross-chain HTLC settlements */}
          {settlement.crossChain && settlement.txid && (
            <div className="mx-4 mb-2">
              <SettlementExplorer
                settlementTxid={settlement.txid}
                opReturnPayload={settlement.opReturnPayload ?? undefined}
                htlcAddress={settlement.htlcAddress}
                htlcLocktimeBlocks={settlement.htlcLocktimeBlocks}
                compact={false}
              />
            </div>
          )}
        </>
      )}

      <div className="p-3 flex-1 flex flex-col gap-3 overflow-y-auto">
        {/* Order type */}
        <div className="flex gap-0 text-xs font-medium bg-secondary p-0.5 rounded-lg">
          {(["limit", "market", "stop"] as OrderType[]).map((t) => (
            <button key={t}
              data-testid={`order-type-${t}`}
              className={cn("flex-1 py-1.5 rounded-md transition-colors capitalize",
                type === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setType(t)}
            >
              {t === "stop" ? "TP/SL" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Wallet balance row — non-custodial: wallet balance is directly tradeable */}
        <div className="flex items-center justify-between text-xs px-0.5">
          <span className="text-muted-foreground">Available</span>
          <div className="flex items-center gap-1">
            {balancesLoading && isEvm ? (
              <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground/40" />
            ) : (
              <span className={cn(
                "font-mono font-semibold",
                availableAmt > 0 ? "text-foreground" : "text-muted-foreground/60"
              )}>
                {availableAmt > 0
                  ? availableAmt.toLocaleString("en-US", { maximumFractionDigits: 6 })
                  : "0.0000"}{" "}{availableSym}
              </span>
            )}
          </div>
        </div>

        {/* Low balance hint — shown when wallet balance is zero */}
        {availableAmt <= 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/8 border border-amber-500/20 text-xs -mt-0.5">
            <span className="text-amber-400/80">
              No {availableSym} in wallet. Buy or bridge {availableSym} to start trading.
            </span>
          </div>
        )}

        {/* Locked-in-orders row */}
        {apiLockedAmt > 0 && (
          <div className="flex items-center justify-between text-xs px-0.5 -mt-1.5">
            <span className="flex items-center gap-1 text-amber-400/80">
              <Lock className="w-3 h-3" />
              In open orders
            </span>
            <span className="font-mono text-amber-400/80">
              -{apiLockedAmt.toLocaleString("en-US", { maximumFractionDigits: 6 })}{" "}{availableSym}
            </span>
          </div>
        )}

        {/* Stop order info */}
        {type === "stop" && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-amber-400 text-[10px] leading-relaxed">
              <strong>Stop-Limit:</strong> When the market hits your <em>Trigger</em> price, a limit order is placed at your <em>Price</em>.
            </span>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} data-orderform className="flex flex-col gap-4">

          {/* Trigger price for stop orders */}
          {type === "stop" && (
            <div className="group flex items-center bg-secondary border border-amber-500/40 rounded-xl px-3 py-2.5 focus-within:border-amber-400/70 focus-within:ring-1 focus-within:ring-amber-400/20 transition-all">
              <span className="text-amber-400 text-sm w-16 shrink-0">Trigger</span>
              <input
                type="number"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-right text-foreground font-mono focus:outline-none"
                placeholder="0.00"
                min="0"
                step="any"
              />
              <span className="text-muted-foreground text-xs ml-2 shrink-0">{quote}</span>
            </div>
          )}

          {/* Price */}
          {type === "limit" || type === "stop" ? (
            <div className="group flex items-center bg-secondary border border-border rounded-xl px-3 py-2.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <span className="text-muted-foreground text-sm w-16 shrink-0">{type === "stop" ? "Limit" : "Price"}</span>
              <input
                type="number"
                data-testid="order-price-input"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-right text-foreground font-mono focus:outline-none"
                placeholder="0.00"
                min="0"
                step="any"
              />
              <span className="text-muted-foreground text-xs ml-2 shrink-0">{quote}</span>
            </div>
          ) : (
            <div className="flex items-center bg-secondary/50 border border-border rounded-xl px-3 py-2.5 cursor-not-allowed">
              <span className="text-muted-foreground text-sm w-16">Price</span>
              <span className="flex-1 text-right text-muted-foreground font-mono">Market Price</span>
              <span className="text-muted-foreground text-xs ml-2 shrink-0">{quote}</span>
            </div>
          )}

          {/* Amount */}
          <div className="group flex items-center bg-secondary border border-border rounded-xl px-3 py-2.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <span className="text-muted-foreground text-sm w-16 shrink-0">Amount</span>
            <input
              type="number"
              data-testid="order-amount-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-right text-foreground font-mono focus:outline-none"
              placeholder="0.00"
              min="0"
              step="any"
            />
            <span className="text-muted-foreground text-xs ml-2 shrink-0">{base}</span>
          </div>

          {/* Slippage (market orders only) */}
          {type === "market" && (
            <div>
              <button
                type="button"
                onClick={() => setSlippageOpen(o => !o)}
                className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Settings2 className="w-3 h-3" />
                  Slippage tolerance
                </span>
                <span className={cn(
                  "font-semibold",
                  slippage > 1 ? "text-amber-400" : "text-foreground"
                )}>
                  {slippage}%{slippage > 1 ? " ⚠" : ""}
                </span>
              </button>
              {slippageOpen && (
                <div className="mt-2 p-2.5 bg-secondary/60 border border-border rounded-xl space-y-2">
                  <div className="flex gap-1.5">
                    {[0.1, 0.5, 1.0, 2.0].map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setSlippage(s); setCustomSlip(""); }}
                        className={cn(
                          "flex-1 py-1 rounded-md text-xs font-bold border transition-all",
                          slippage === s && !customSlip
                            ? "bg-primary/20 border-primary/50 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground hover:bg-card"
                        )}
                      >{s}%</button>
                    ))}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="Custom %"
                      value={customSlip}
                      min="0.01"
                      max="50"
                      step="0.1"
                      onChange={e => {
                        setCustomSlip(e.target.value);
                        const v = parseFloat(e.target.value);
                        if (v > 0 && v <= 50) setSlippage(v);
                      }}
                      className="w-full py-1 px-3 rounded-md text-xs border border-border bg-card text-foreground focus:outline-none focus:border-primary/50 text-center"
                    />
                  </div>
                  {slippage > 1 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      High slippage — your trade may be front-run.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* % shortcuts */}
          <div className="flex justify-between gap-1">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                className={cn(
                  "flex-1 py-1.5 text-xs font-semibold border rounded-md transition-all",
                  pct === 100
                    ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                    : "bg-secondary hover:bg-secondary/80 border-border text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  const portion = availableAmt * (pct / 100);
                  if (side === "buy") {
                    // available is in quote (USDT) — divide by price to get base token qty
                    const px = price && parseFloat(price) > 0 ? parseFloat(price) : currentPrice;
                    if (px > 0) setAmount((portion / px).toFixed(6));
                  } else {
                    // available is already in base tokens
                    setAmount(portion > 0 ? portion.toFixed(6) : "");
                  }
                }}
              >
                {pct === 100 ? "MAX" : `${pct}%`}
              </button>
            ))}
          </div>

          {/* ── EVM Sub-wallet (BSV users buying EVM assets) ─────────── */}
          {showEvmWalletInfo && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2.5 space-y-1.5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-emerald-300 font-semibold leading-snug">
                    Sent to your OrahDEX EVM wallet
                  </p>
                  <p className="text-[10px] text-emerald-200/70 leading-relaxed mt-0.5">
                    One address works on <span className="text-emerald-300 font-medium">all EVM networks</span> — Ethereum, BSC, Polygon, Arbitrum, Base and more.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between bg-black/20 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] text-emerald-400/70 font-medium shrink-0 mr-2">All EVM</span>
                <span className="text-[10px] font-mono text-emerald-300 truncate flex-1">{internalEvmAddress}</span>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(internalEvmAddress!); }}
                  className="ml-1.5 text-emerald-400/50 hover:text-emerald-400 transition-colors shrink-0"
                  title="Copy EVM address"
                >
                  <Route className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* ── BSV/BTC/BCH Sub-wallet (EVM users buying BSV assets) ── */}
          {showBsvWalletInfo && (
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/8 px-3 py-2.5 space-y-1.5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-teal-300 font-semibold leading-snug">
                    Sent to your OrahDEX BSV wallet
                  </p>
                  <p className="text-[10px] text-teal-200/70 leading-relaxed mt-0.5">
                    {hasSeparateBtcAddr
                      ? <>Your <span className="text-teal-300 font-medium">HD wallet</span> gives each chain its own BIP44 address — BSV, BTC, BCH, and SOL are all separate.</>
                      : <>One key covers <span className="text-teal-300 font-medium">BSV, BTC &amp; BCH</span> — same address for BSV &amp; BTC, separate CashAddr for BCH.</>
                    }
                  </p>
                </div>
              </div>
              {/* BSV address */}
              <div className="flex items-center justify-between bg-black/20 border border-teal-500/20 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] text-teal-400/70 font-medium shrink-0 mr-2 w-16">{hasSeparateBtcAddr ? "BSV" : "BSV · BTC"}</span>
                <span className="text-[10px] font-mono text-teal-300 truncate flex-1">{internalBsvAddress}</span>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(internalBsvAddress!); }}
                  className="ml-1.5 text-teal-400/50 hover:text-teal-400 transition-colors shrink-0" title="Copy BSV address">
                  <Route className="w-3 h-3" />
                </button>
              </div>
              {/* BCH CashAddr */}
              {internalBchAddress && (
                <div className="flex items-center justify-between bg-black/20 border border-teal-500/20 rounded-lg px-2.5 py-1.5">
                  <span className="text-[10px] text-teal-400/70 font-medium shrink-0 mr-2 w-16">BCH</span>
                  <span className="text-[10px] font-mono text-teal-300 truncate flex-1">{internalBchAddress}</span>
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(internalBchAddress); }}
                    className="ml-1.5 text-teal-400/50 hover:text-teal-400 transition-colors shrink-0" title="Copy BCH address">
                    <Route className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── BTC Sub-wallet (EVM users buying BTC — HD wallet only) ── */}
          {showBtcWalletInfo && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/8 px-3 py-2.5 space-y-1.5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-orange-300 font-semibold leading-snug">Sent to your OrahDEX BTC wallet</p>
                  <p className="text-[10px] text-orange-200/70 leading-relaxed mt-0.5">
                    Derived from your seed phrase at <span className="text-orange-300 font-medium">m/44'/0'/0'/0/0</span> — fully compatible with any BIP44 wallet.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between bg-black/20 border border-orange-500/20 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] text-orange-400/70 font-medium shrink-0 mr-2 w-16">BTC</span>
                <span className="text-[10px] font-mono text-orange-300 truncate flex-1">{internalBtcAddress}</span>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(internalBtcAddress!); }}
                  className="ml-1.5 text-orange-400/50 hover:text-orange-400 transition-colors shrink-0" title="Copy BTC address">
                  <Route className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* ── SOL Sub-wallet (EVM users buying SOL — HD wallet only) ── */}
          {showSolWalletInfo && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/8 px-3 py-2.5 space-y-1.5">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-violet-300 font-semibold leading-snug">Sent to your OrahDEX Solana wallet</p>
                  <p className="text-[10px] text-violet-200/70 leading-relaxed mt-0.5">
                    Derived via <span className="text-violet-300 font-medium">SLIP-0010 ed25519 m/44'/501'/0'/0'</span> — Phantom-compatible. Import your seed phrase in Phantom to access it.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between bg-black/20 border border-violet-500/20 rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] text-violet-400/70 font-medium shrink-0 mr-2 w-16">SOL</span>
                <span className="text-[10px] font-mono text-violet-300 truncate flex-1">{internalSolAddress}</span>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(internalSolAddress!); }}
                  className="ml-1.5 text-violet-400/50 hover:text-violet-400 transition-colors shrink-0" title="Copy SOL address">
                  <Route className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* ── Cross-chain receive address ────────────────────────────── */}
          {showCrossChainNotice && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 space-y-2.5">
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-amber-300 font-semibold leading-snug">
                    {base} lives on {chainName}
                  </p>
                  <p className="text-[10px] text-amber-200/70 leading-relaxed mt-0.5">
                    Bought {base} goes to your <span className="text-amber-300 font-medium">OrahDEX balance</span>. Your connected wallet can't hold {base} directly. To withdraw to {chainName} later, provide your {base} address below or go to <span className="text-amber-300 font-medium">Portfolio → Withdraw</span>.
                  </p>
                </div>
              </div>
              <div className="group flex items-center bg-black/20 border border-amber-500/20 rounded-lg px-3 py-2 focus-within:border-amber-400/50 transition-all">
                <span className="text-amber-400/80 text-[11px] shrink-0 mr-2 font-medium">
                  {base} addr
                </span>
                <input
                  type="text"
                  value={receiveAddress}
                  onChange={e => setReceiveAddress(e.target.value)}
                  placeholder={addrPlaceholder}
                  className="flex-1 bg-transparent text-[11px] text-foreground font-mono focus:outline-none placeholder:text-muted-foreground/40 min-w-0"
                />
                {receiveAddress && (
                  <button
                    type="button"
                    onClick={() => setReceiveAddress("")}
                    className="text-muted-foreground/40 hover:text-muted-foreground ml-1 shrink-0"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {receiveAddress && (
                <div className="flex items-center gap-1.5 text-[10px] text-green-400">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  {base} will be queued for withdrawal to this address after order fills.
                </div>
              )}
            </div>
          )}

          {/* ── Live Quote Panel (Sovereign Routing API) ─────────────── */}
          {!!amount && parseFloat(amount) > 0 && (
            <div className={cn(
              "rounded-xl border px-3 py-2.5 space-y-1.5 transition-all",
              liveQuote
                ? "bg-secondary/40 border-border"
                : "bg-secondary/20 border-border/40"
            )}>
              {/* Expected output */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {side === "buy" ? "You receive" : "You get"}
                </span>
                <span className="font-mono font-semibold text-foreground flex items-center gap-1">
                  {quoteLoading
                    ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/50" />
                    : liveQuote
                      ? <>{liveQuote.expectedOut.toFixed(6)} {quoteTokenOut}</>
                      : side === "buy"
                        ? <>{parseFloat(amount || "0").toFixed(6)} {base}</>
                        : <>≈ {formatPrice(type === "limit" && price
                            ? parseFloat(price) * parseFloat(amount || "0")
                            : parseFloat(amount || "0") * currentPrice)} {quote}</>
                  }
                </span>
              </div>

              {/* Min received with slippage */}
              {liveQuote && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Min received</span>
                  <span className="font-mono text-foreground/80">
                    {liveQuote.minOut.toFixed(6)} {quoteTokenOut}
                  </span>
                </div>
              )}

              {/* Price impact */}
              {liveQuote && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" />
                    Price impact
                  </span>
                  <span className={cn(
                    "font-mono font-semibold",
                    liveQuote.priceImpactPct < 0.5 ? "text-green-400"
                    : liveQuote.priceImpactPct < 2 ? "text-amber-400"
                    : "text-red-400"
                  )}>
                    {liveQuote.priceImpactPct < 0.01
                      ? "< 0.01%"
                      : `${liveQuote.priceImpactPct.toFixed(2)}%`}
                  </span>
                </div>
              )}

              {/* Fee */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fee</span>
                <span className="font-mono text-foreground/80">
                  {liveQuote
                    ? `${(liveQuote.feeBps / 100).toFixed(2)}% · ~$${liveQuote.feeUsd.toFixed(4)}`
                    : "0.30%"
                  }
                </span>
              </div>

              {/* Route */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <span className="text-muted-foreground">Route</span>
                <span className="font-semibold text-green-400 text-[10px] flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {liveQuote ? "AMM → BSV Settlement" : "AMM → BSV Settlement"}
                </span>
              </div>

              {/* Keeper Tier badge */}
              {liveQuote && liveQuote.keeper.tier > 0 && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Crown className="w-3 h-3" />
                    Keeper discount
                  </span>
                  <span
                    className="font-bold text-[10px] px-1.5 py-0.5 rounded-md border"
                    style={{
                      color: KEEPER_TIER_COLORS[liveQuote.keeper.tier],
                      borderColor: `${KEEPER_TIER_COLORS[liveQuote.keeper.tier]}40`,
                      background: `${KEEPER_TIER_COLORS[liveQuote.keeper.tier]}15`,
                    }}
                  >
                    {liveQuote.keeper.tierName} · -{liveQuote.keeper.discountPct}% fee
                  </span>
                </div>
              )}

              {/* MEV warning for large orders */}
              {liveQuote && liveQuote.mevRisk === "high" && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-400 pt-0.5">
                  <Flame className="w-3 h-3 shrink-0" />
                  High MEV risk — consider smaller trades or upgrading Keeper tier
                </div>
              )}
            </div>
          )}

          {/* Total (limit orders, when no amount typed yet) */}
          {type === "limit" && !amount && (
            <div className="flex items-center bg-secondary/30 border border-transparent rounded-xl px-3 py-2.5">
              <span className="text-muted-foreground text-sm w-16">Total</span>
              <span className="flex-1 text-right text-foreground font-mono">{formatPrice(isNaN(total) ? 0 : total)}</span>
              <span className="text-muted-foreground text-xs ml-2 shrink-0">{quote}</span>
            </div>
          )}

          {/* ── Precheck panel: errors + warnings ─────────────────────────── */}
          {amount && parseFloat(amount) > 0 && (
            <div className="flex flex-col gap-1.5">
              {precheckLoading && !precheckResult && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-0.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking order…
                </div>
              )}

              {/* Errors — block submission */}
              {precheckResult?.errors?.map((err, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-[11px]">
                  <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-red-300 font-semibold">{err.message}</span>
                    {err.detail && <span className="text-red-400/70 ml-1">· {err.detail}</span>}
                  </div>
                </div>
              ))}

              {/* Warnings — allow submission with notice */}
              {precheckResult?.warnings?.map((warn, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-amber-300">{warn.message}</span>
                </div>
              ))}

              {/* Route + min received — shown when precheck passes */}
              {precheckResult?.ok && precheckResult.route && (
                <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Route className="w-3 h-3" />
                    {precheckResult.route.join(" → ")}
                  </span>
                  {precheckResult.minReceived != null && precheckResult.minReceived > 0 && (
                    <span>Min: <span className="text-foreground font-mono">{precheckResult.minReceived.toFixed(6)}</span></span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            data-testid="order-submit-btn"
            disabled={!canSubmit || (precheckResult != null && !precheckResult.ok)}
            className={cn(
              "w-full py-3.5 rounded-xl font-bold text-sm mt-2 transition-all flex items-center justify-center gap-2",
              side === "buy"
                ? "bg-buy text-white shadow-lg shadow-buy/20 hover:shadow-buy/40 hover:-translate-y-0.5 active:translate-y-0"
                : "bg-sell text-white shadow-lg shadow-sell/20 hover:shadow-sell/40 hover:-translate-y-0.5 active:translate-y-0",
              (!canSubmit || (precheckResult != null && !precheckResult.ok)) && "opacity-60 cursor-not-allowed !transform-none"
            )}
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Placing…</>
            ) : type !== "market" ? (
              `Review ${side === "buy" ? "Buy" : "Sell"} Order`
            ) : (
              `${side === "buy" ? "Buy" : "Sell"} ${base}`
            )}
          </button>

          {/* Fee info & Keeper tier */}
          <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground">
            {liveQuote ? (
              <span>
                Fee:{" "}
                <span className="text-foreground font-mono font-bold">
                  {(liveQuote.feeBps / 100).toFixed(2)}%
                </span>
                {" "}· {liveQuote.keeper.tierName}
              </span>
            ) : (
              <span>Fee: <span className="text-foreground font-mono">0.30%</span> standard</span>
            )}
            {liveQuote && liveQuote.keeper.tier > 0 ? (
              <span
                className="font-bold flex items-center gap-0.5"
                style={{ color: KEEPER_TIER_COLORS[liveQuote.keeper.tier] }}
              >
                <Crown className="w-2.5 h-2.5" />
                {liveQuote.keeper.discountPct}% off
              </span>
            ) : (
              <span className="text-primary font-medium cursor-pointer hover:underline" title="Volume-based Keeper tiers unlock fee discounts: Guardian 0.25%, Elder 0.20%, Archon 0.15%">
                Keeper discounts ↗
              </span>
            )}
          </div>

        </form>

        {/* Assets panel */}
        <div className="mt-1 border-t border-border pt-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Assets</p>
          {[
            { label: `${base} Available`, value: `${baseAvailable > 0 ? baseAvailable.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "0.0000"} ${base}` },
            { label: `${quote} Available`, value: `${quoteAvailable > 0 ? quoteAvailable.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0.00"} ${quote}` },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-mono text-foreground">{row.value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-[11px] mt-1 pt-1.5 border-t border-border/50">
            <span className="text-muted-foreground">Network</span>
            <span className={cn(
              "font-bold text-[10px] uppercase px-1.5 py-0.5 rounded border",
              isEvm ? "text-violet-400 border-violet-500/30 bg-violet-500/10"
                    : network === 'btc' ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
                    : network === 'sol' ? "text-purple-400 border-purple-500/30 bg-purple-500/10"
                    : network === 'bch' ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                    : "text-green-400 border-green-500/30 bg-green-500/10"
            )}>
              {isEvm ? "⬡ EVM" : network === 'btc' ? "₿ BTC" : network === 'sol' ? "◎ SOL" : network === 'bch' ? "฿ BCH" : "₿ BSV"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Order Confirmation Modal ─────────────────────────────────────────── */}
      {showConfirm && (() => {
        const qty    = parseFloat(amount) || 0;
        const px     = parseFloat(price)  || currentPrice;
        const total  = qty * px;
        const fee    = total * 0.003;
        const isBuy  = side === "buy";
        const locked = isBuy ? total : qty;
        return (
          <div
            className="fixed inset-0 z-[999] flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          >
            <div
              className="w-full max-w-md bg-card border border-border rounded-t-2xl p-5 pb-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                    isBuy ? "bg-buy/20 text-buy" : "bg-sell/20 text-sell"
                  )}>
                    {side} {type}
                  </span>
                  <span className="font-bold text-foreground">{symbol}</span>
                </div>
                <button onClick={() => setShowConfirm(false)} className="text-muted-foreground text-lg leading-none">✕</button>
              </div>

              {/* Order details */}
              <div className="space-y-2.5 text-sm mb-5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-mono font-semibold">{qty.toLocaleString("en-US", { maximumFractionDigits: 8 })} {base}</span>
                </div>
                {type !== "market" && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-mono font-semibold">${px.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                  </div>
                )}
                {type === "stop" && stopPrice && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trigger</span>
                    <span className="font-mono font-semibold">${parseFloat(stopPrice).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Total</span>
                  <span className="font-mono font-semibold">{total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {quote}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground/70">
                  <span>Est. Fee ({liveQuote ? `${(liveQuote.feeBps / 100).toFixed(2)}%` : "0.30%"})</span>
                  <span className="font-mono">{fee.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} {quote}</span>
                </div>
                <div className="border-t border-border/50 pt-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">Available {isBuy ? quote : base}</span>
                  <span className="font-mono">{availableAmt.toLocaleString("en-US", { maximumFractionDigits: 6 })} {availableSym}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Locked in order</span>
                  <span className={cn("font-mono", availableAmt > 0 && locked > availableAmt ? "text-sell" : "text-amber-400")}>
                    {locked.toLocaleString("en-US", { maximumFractionDigits: 6 })} {isBuy ? quote : base}
                  </span>
                </div>
              </div>

              {/* Insufficient balance warning */}
              {availableAmt > 0 && locked > availableAmt + 1e-9 && (
                <div className="mb-4 p-2.5 rounded-lg bg-sell/10 border border-sell/30 text-xs text-sell">
                  Insufficient balance: you have {availableAmt.toLocaleString("en-US", { maximumFractionDigits: 6 })} {availableSym} but this order requires {locked.toLocaleString("en-US", { maximumFractionDigits: 6 })}.
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-secondary border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={(availableAmt > 0 && locked > availableAmt + 1e-9) || isPending}
                  onClick={() => {
                    setShowConfirm(false);
                    confirmRef.current = true;
                    // Re-submit via the form ref (triggers handleSubmit with confirmRef=true)
                    if (formRef.current) {
                      formRef.current.requestSubmit();
                    } else {
                      const syntheticEvent = new Event("submit", { bubbles: true, cancelable: true });
                      handleSubmit(syntheticEvent as any);
                    }
                  }}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2",
                    isBuy
                      ? "bg-buy shadow-lg shadow-buy/20 hover:shadow-buy/40 disabled:opacity-60"
                      : "bg-sell shadow-lg shadow-sell/20 hover:shadow-sell/40 disabled:opacity-60"
                  )}
                >
                  {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing…</> : `Confirm ${side === "buy" ? "Buy" : "Sell"}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
