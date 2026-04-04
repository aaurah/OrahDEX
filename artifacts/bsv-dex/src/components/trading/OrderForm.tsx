import { useState, useEffect, useRef, useCallback } from "react";
import { useSignMessage, useAccount } from "wagmi";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { usePlaceOrder } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useExchangeBalanceStore } from "@/store/useExchangeBalanceStore";
import { cn, formatPrice } from "@/lib/utils";
import { getTxExplorerUrl } from "@/store/useWalletStore";
import { checkAllowance, approveToken, fetchEvmBalance, signMessageWithReownProvider } from "@/lib/reown";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { getChainToken, getChainRouter, getNativeSymbol } from "@/lib/chainConfig";
import { evmTrade, getAmountsOut, WRAPPED_NATIVE } from "@/lib/dex-trade";
import { useQuote, KEEPER_TIER_COLORS } from "@/hooks/useQuote";
import { precheck, TradeTimer, reportTradeMetrics, getBadge, type PrecheckResult } from "@/lib/tradeEngine";
import { type TradeErrorCode } from "@/lib/tradeErrors";
import {
  Wallet, Shield, Zap, ArrowRightLeft, CheckCircle2,
  ExternalLink, Loader2, PenLine, Settings2, AlertTriangle,
  Lock, ShieldCheck, RefreshCw, Crown, TrendingDown, Flame,
  XCircle, Info, Route, Timer, FlaskConical, Smartphone, QrCode,
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
  const connectDemo = useWalletStore((s) => s.connectDemo);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleDemo = async () => {
    setDemoLoading(true);
    try {
      let demoAddr = localStorage.getItem("orahdex_demo_address");
      if (!demoAddr) {
        const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
        demoAddr = `DEMO_${uuid}`;
        localStorage.setItem("orahdex_demo_address", demoAddr);
      }
      const res = await fetch(`${API_BASE}/demo/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: demoAddr }),
      });
      if (!res.ok) throw new Error("Failed");
      connectDemo(demoAddr);
    } catch { /* ignore */ }
    finally { setDemoLoading(false); }
  };

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
            Connect your EVM or BSV wallet to place orders. Trades settle on-chain via Bitcoin SV.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white py-3.5 rounded-xl font-bold text-sm shadow-md shadow-primary/20 hover:shadow-primary/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
        >
          <Wallet className="w-4 h-4" />
          Connect Wallet
        </button>
        {/* Mobile QR connect */}
        <div className="w-full">
          <MobileConnectQR onConnected={() => {}} />
        </div>
        {/* Demo shortcut */}
        <div className="w-full">
          <div className="relative flex items-center gap-2 mb-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <button
            onClick={handleDemo}
            disabled={demoLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-yellow-500/40 bg-yellow-500/8 text-yellow-400 font-bold text-sm hover:bg-yellow-500/15 transition-colors disabled:opacity-60"
          >
            {demoLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</>
              : <><FlaskConical className="w-4 h-4" /> Try Demo — $80,000 paper money</>
            }
          </button>
        </div>
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
  onDismiss,
}: {
  matched: boolean;
  txid: string | null;
  explorerUrl: string | null;
  onDismiss: () => void;
}) {
  if (!matched) return null;
  return (
    <div className="mx-4 mb-3 p-3 rounded-xl bg-green-500/10 border border-green-500/25 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
        <span className="text-xs font-semibold text-green-400">Trade Matched & Settled On-Chain</span>
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
export function OrderForm({ symbol, currentPrice = 0, externalFill }: {
  symbol: string;
  currentPrice?: number;
  externalFill?: OrderFormFill | null;
}) {
  const { address, network, balance, chainId: walletChainId, isDemo, provider, internalEvmAddress, internalBsvAddress, internalBchAddress, internalBtcAddress, internalSolAddress } = useWalletStore();
  const { toast } = useToast();
  const { addNotification } = useNotificationStore();
  const { applyFill } = useExchangeBalanceStore();
  const isEvm = !address || (network === "evm" && !isDemo) || address.startsWith("0x");
  // Orah HD Wallet users (any network) have their trading balance tracked in the API ledger.
  // Demo users also use the API ledger. External EVM wallets (MetaMask, WalletConnect) use on-chain balances.
  const isOrahWallet = provider === 'orah-wallet';
  const usesApiBalance = isDemo || isOrahWallet;

  const chainId = walletChainId ?? 1;
  const nativeSymbol = network === "bsv" ? "BSV" : network === "sol" ? "SOL" : network === "btc" ? "BTC" : getNativeSymbol(chainId);
  const nativeBal = balance ? parseFloat(balance) : 0;

  // Fetch real on-chain token balances for the connected EVM wallet
  const { balances: tokenBalances, loading: balancesLoading, refresh: refreshBalances } = useEvmBalances(
    isEvm ? address : null,
    isEvm ? chainId : null
  );

  // ── Demo balances fetched from API ──────────────────────────────────────────
  const [demoBalances, setDemoBalances] = useState<Record<string, number>>({});
  const fetchDemoBalances = useCallback(async (b: string, q: string, addr: string) => {
    const fetchOne = async (asset: string) => {
      try {
        const r = await fetch(`${API_BASE}/balances/${asset}?walletAddress=${addr}`);
        if (!r.ok) return 0;
        const j = await r.json();
        return parseFloat(j.available ?? "0") || 0;
      } catch { return 0; }
    };
    const [bAmt, qAmt] = await Promise.all([fetchOne(b), fetchOne(q)]);
    setDemoBalances({ [b]: bAmt, [q]: qAmt });
  }, []);
  useEffect(() => {
    if (!usesApiBalance || !address) { setDemoBalances({}); return; }
    const parts2 = symbol.split("/");
    const b = parts2[0];
    const q = parts2[1] ?? "USDT";
    fetchDemoBalances(b, q, address);
  }, [usesApiBalance, address, symbol, fetchDemoBalances]);

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

  const [signing, setSigning]       = useState(false);
  const [approvalStep, setApprovalStep] = useState<
    "idle" | "checking" | "needed" | "approving" | "approved"
  >("idle");

  // Wagmi sign — covers MetaMask (injected) AND Reown/WalletConnect wallets
  const { signMessageAsync } = useSignMessage();
  const { isConnected: evmConnected } = useAccount();
  const [settlement, setSettlement] = useState<{
    matched: boolean; txid: string | null; explorerUrl: string | null;
  } | null>(null);
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
  const showCrossChainNotice = side === "buy" && !!address && !canReceive && !isDemo && !evmHandled && !bsvHandled && !btcHandled && !solHandled;
  // Show green EVM sub-wallet info box when a BSV user is buying an EVM asset
  const showEvmWalletInfo = side === "buy" && !!address && network === "bsv" && isEvmChain && hasInternalEvm && !isDemo;
  // Show teal BSV sub-wallet info box when an EVM user is buying a BSV asset
  const showBsvWalletInfo = side === "buy" && !!address && network === "evm" && isBsvChain && hasInternalBsv && !isDemo;
  // Show orange BTC sub-wallet info (HD wallet only — separate BTC address)
  const showBtcWalletInfo = side === "buy" && !!address && network === "evm" && isBtcChain && hasInternalBtc && !isDemo;
  // Show violet SOL sub-wallet info (HD wallet only — SLIP-0010 ed25519 address)
  const showSolWalletInfo = side === "buy" && !!address && network === "evm" && isSolChain && hasInternalSol && !isDemo;
  const chainName = CHAIN_DISPLAY[baseChain] ?? baseChain;
  const addrPlaceholder = ADDRESS_PLACEHOLDERS[baseChain] ?? `${base} address…`;

  // Derive available balance for each side using real on-chain data:
  // • Sell: how much of the base asset the user has (e.g. BSV, BTC, ETH)
  // • Buy:  how much of the quote asset they can spend (e.g. USDT, USDC)
  const baseBalEntry  = tokenBalances.find(t => t.symbol.toUpperCase() === base.toUpperCase());
  const quoteBalEntry = tokenBalances.find(t => t.symbol.toUpperCase() === quote.toUpperCase());
  // If base is the native token (ETH, BNB, etc.), fall back to native balance from store
  const isNativeBase = base.toUpperCase() === nativeSymbol.toUpperCase();
  // Orah Wallet & demo: use balances fetched from the API ledger; external EVM wallets use on-chain values
  const baseAvailable  = usesApiBalance
    ? (demoBalances[base] ?? 0)
    : (isNativeBase ? nativeBal : (baseBalEntry?.amount ?? 0));
  const quoteAvailable = usesApiBalance
    ? (demoBalances[quote] ?? 0)
    : (quoteBalEntry?.amount ?? 0);
  const availableAmt   = side === "sell" ? baseAvailable  : quoteAvailable;
  const availableSym   = side === "sell" ? base : quote;

  // ── API-locked balance for external EVM wallets ───────────────────────────
  // External EVM wallets (Reown, MetaMask, Coinbase) use on-chain balances for
  // display, but the API also maintains a ledger lock for open orders.
  // Fetch and show the locked amount so the user can see reserved funds.
  const [apiLockedAmt, setApiLockedAmt] = useState<number>(0);
  useEffect(() => {
    if (usesApiBalance || !address || !availableSym) { setApiLockedAmt(0); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/balances/${availableSym}?walletAddress=${encodeURIComponent(address)}`);
        if (!r.ok || cancelled) return;
        const j = await r.json();
        const locked = parseFloat(j.locked ?? "0") || 0;
        if (!cancelled) setApiLockedAmt(locked);
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [usesApiBalance, address, availableSym, side]);

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
        const fillPx   = data?.price ?? parseFloat(price || "0");
        const qty      = parseFloat(amount || "0");
        if (matched) {
          setSettlement({ matched: true, txid, explorerUrl: url });

          // Credit the exchange balance ledger so Portfolio reflects the trade
          if (address && qty > 0 && fillPx > 0) {
            applyFill(address, side as "buy" | "sell", base, quote, qty, fillPx);
          }

          const receivedQty = side === "sell"
            ? (qty * fillPx * 0.999).toFixed(2)
            : (qty * 0.999).toFixed(6);
          const receivedTok = side === "sell" ? quote : base;

          const isCrossChainFill = side === "buy" && !walletCanReceive(network, getAssetNativeChain(receivedTok));
          const fillChainName = CHAIN_DISPLAY[getAssetNativeChain(receivedTok)] ?? receivedTok;
          toast({
            title: "Order Filled ✓",
            description: isCrossChainFill
              ? `+${receivedQty} ${receivedTok} → OrahDEX balance. To withdraw to ${fillChainName}, go to Portfolio → Withdraw.`
              : `+${receivedQty} ${receivedTok} credited to your OrahDEX balance`,
          });
          addNotification({
            type: "order_filled",
            title: `${side.toUpperCase()} Order Filled ✓`,
            body: isCrossChainFill
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
      },
      onError: () => {
        toast({ title: "Order Failed", description: "Could not place order. Please try again.", variant: "destructive" });
        addNotification({
          type: "error",
          title: "Order Failed",
          body: "Could not place order — please check your balance and try again.",
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

  /**
   * Sign the order intent with MetaMask (EVM) before submitting.
   * For BSV wallets, no signing step is needed (BSV tx is built server-side).
   */
  const buildOrderMessage = () =>
    `OrahDEX Order\nPair: ${symbol}\nSide: ${side.toUpperCase()}\nType: ${type.toUpperCase()}\nAmount: ${amount} ${base}${type !== "market" ? `\nPrice: $${price}` : ""}${type === "stop" ? `\nTrigger: $${stopPrice}` : ""}\nWallet: ${address}\nTimestamp: ${Date.now()}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !amount || parseFloat(amount) <= 0) return;

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

    const currentChainId = useWalletStore.getState().chainId ?? 1;
    const addTx   = useWalletStore.getState().addPendingTx;
    const setbal  = useWalletStore.getState().setBalance;

    // Per-chain router + token registry — correct addresses for every network
    const routerAddr = getChainRouter(currentChainId);

    // ── Step 1: ERC-20 Allowance check for EVM sells ──────────────────────
    // If the user is selling an ERC-20 token, verify the DEX router has
    // enough allowance via allowance(owner, router). If not, request approve().
    if (isEvm && side === "sell" && (window as any).ethereum) {
      // Look up the token contract on the CURRENT chain (not hardcoded mainnet)
      const token = getChainToken(currentChainId, base);
      if (token?.address) {
        try {
          setApprovalStep("checking");
          const amtUnits = BigInt(Math.floor(parseFloat(amount) * 10 ** token.decimals));
          const allowed  = await checkAllowance(token.address, address, routerAddr, currentChainId);

          if (allowed < amtUnits) {
            setApprovalStep("needed");
            toast({
              title: "Token Approval Required",
              description: `Allow OrahDEX to spend your ${base} — you'll see a wallet prompt.`,
            });

            setApprovalStep("approving");
            // Request max approval (0xfff...fff = unlimited)
            const maxHex = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
            const approveTxHash = await approveToken(token.address, routerAddr, maxHex, address);

            if (!approveTxHash) {
              setApprovalStep("idle");
              toast({ title: "Approval cancelled", description: "You rejected the approval request.", variant: "destructive" });
              return;
            }

            // Track the approve tx
            addTx({
              hash:                 approveTxHash,
              chainId,
              label:                `Approve ${base} for OrahDEX`,
              status:               "pending",
              confirmations:        0,
              requiredConfirmations: 1,
              timestamp:            Date.now(),
              explorerUrl:          getTxExplorerUrl(approveTxHash, chainId),
            });

            setApprovalStep("approved");
            toast({
              title: "Approval submitted",
              description: `${base} approval tx sent — proceeding to sign order.`,
            });
          } else {
            setApprovalStep("approved");
          }
        } catch {
          setApprovalStep("idle");
        }
      }
    }

    // ── Step 2: EVM market orders — execute on-chain router swap ──────────
    // For market orders on EVM chains, we call swapExactTokensForTokens (or the
    // native-in/out variants) directly on the Uniswap v2-compatible router for
    // this chain. The result tx hash is forwarded to the API as proof-of-trade.
    let onChainTxHash: string | undefined;
    if (isEvm && type === "market" && (window as any).ethereum) {
      try {
        setSigning(true);

        const wNative   = WRAPPED_NATIVE[currentChainId];
        const baseToken  = getChainToken(currentChainId, base);
        const quoteToken = getChainToken(currentChainId, quote);

        // Resolve token addresses; native coin uses its wrapped address in paths
        const isNativeBase  = !baseToken  && !!wNative;
        const isNativeQuote = !quoteToken && !!wNative;
        const baseAddr  = baseToken?.address  ?? wNative ?? "";
        const quoteAddr = quoteToken?.address ?? wNative ?? "";

        if (baseAddr && quoteAddr) {
          const amtFloat = parseFloat(amount);
          let amountInUnits: bigint;
          let isNativeIn  = false;
          let isNativeOut = false;
          let tokenPath: string[];

          if (side === "sell") {
            // Selling base asset → quote asset
            // e.g. ETH → USDT: ETH(native) → USDT
            const decimals   = baseToken?.decimals ?? 18;
            amountInUnits    = BigInt(Math.floor(amtFloat * 10 ** decimals));
            isNativeIn       = isNativeBase;
            isNativeOut      = isNativeQuote;
            tokenPath        = [baseAddr, quoteAddr];
          } else {
            // Buying base asset with quote asset
            // e.g. USDT → ETH: USDT → ETH(native)
            const total      = amtFloat * (parseFloat(price || "0") || currentPrice);
            const decimals   = quoteToken?.decimals ?? 6;
            amountInUnits    = BigInt(Math.floor(total * 10 ** decimals));
            isNativeIn       = isNativeQuote;
            isNativeOut      = isNativeBase;
            tokenPath        = [quoteAddr, baseAddr];
          }

          if (amountInUnits > 0n) {
            // Quote the expected output from the router
            const quoted      = await getAmountsOut(routerAddr, amountInUnits, tokenPath, currentChainId);
            const amountOutMin = quoted ?? 0n;

            toast({
              title: "Confirm Swap",
              description: `Approve the on-chain swap in your wallet — ${amount} ${base}`,
            });

            try {
              onChainTxHash = await evmTrade({
                chainId:        currentChainId,
                routerAddress:  routerAddr,
                amountIn:       amountInUnits,
                amountOutMin,
                path:           tokenPath,
                to:             address,
                slippageBps:    Math.round(slippage * 100),
                isNativeIn,
                isNativeOut,
              }) ?? undefined;

              if (onChainTxHash) {
                addTx({
                  hash:                 onChainTxHash,
                  chainId:              currentChainId,
                  label:                `Swap ${amount} ${base} on ${side === "buy" ? "Buy" : "Sell"}`,
                  status:               "pending",
                  confirmations:        0,
                  requiredConfirmations: 1,
                  timestamp:            Date.now(),
                  explorerUrl:          getTxExplorerUrl(onChainTxHash, currentChainId),
                });
                toast({
                  title: "Swap Submitted ✓",
                  description: `On-chain swap sent · ${onChainTxHash.slice(0, 14)}…`,
                });
              }
            } catch (swapErr: any) {
              setSigning(false);
              setApprovalStep("idle");
              if (swapErr?.code === "USER_REJECTED") {
                toast({ title: "Swap cancelled", description: "You rejected the swap transaction.", variant: "destructive" });
                return;
              }
              // Non-rejection error: fall through to API submission without on-chain hash
              console.warn("[OrahDEX] EVM swap failed, falling back to API:", swapErr);
            }
          }
        }
      } catch (err: any) {
        console.warn("[OrahDEX] EVM market swap error:", err);
      } finally {
        setSigning(false);
      }
    }

    // ── Step 3: Sign the order intent (EVM limit / stop orders only) ───────
    // Market orders already have the on-chain tx hash from Step 2.
    // For limit and stop orders we sign the intent to prove ownership.
    // Demo wallets and Orah Wallet skip client-side signing.
    let evmSignature: string | undefined;
    const needsEcdsaSign = isEvm && type !== "market" && !isDemo && !isOrahWallet;
    if (needsEcdsaSign) {
      try {
        setSigning(true);
        const message = buildOrderMessage();

        if (provider === "reown") {
          // Primary path for Reown/WalletConnect connections: use the live
          // WalletConnect session directly so the signing prompt appears in
          // the user's wallet app even when wagmi's connector state is stale.
          const reownSig = await signMessageWithReownProvider(message, address!);
          if (reownSig) {
            evmSignature = reownSig;
          } else if (evmConnected) {
            // Wagmi fallback if direct provider lookup returned nothing
            evmSignature = await signMessageAsync({ message });
          } else {
            // Session unavailable — reconnect needed
            throw new Error("REOWN_SESSION_UNAVAILABLE");
          }
        } else if (evmConnected) {
          // Wagmi path — covers MetaMask (injected), Coinbase Wallet, etc.
          evmSignature = await signMessageAsync({ message });
        } else {
          // Last-resort: raw window.ethereum for non-wagmi injected wallets
          const eth = (window as any).ethereum;
          if (eth) {
            evmSignature = await eth.request({
              method: "personal_sign",
              params: [message, address],
            });
          }
        }
      } catch (err: any) {
        setSigning(false);
        setApprovalStep("idle");
        // 4001 = MetaMask user rejected; ACTION_REJECTED = wagmi/ethers rejection
        const isRejected = err?.code === 4001 || err?.code === "ACTION_REJECTED" ||
          err?.name === "UserRejectedRequestError" ||
          err?.message?.toLowerCase().includes("rejected") ||
          err?.message?.toLowerCase().includes("denied");
        if (isRejected) {
          toast({
            title: "Signing rejected",
            description: "You cancelled the wallet signature request. The order was not placed.",
            variant: "destructive",
          });
          return;
        }
        if (err?.message === "REOWN_SESSION_UNAVAILABLE") {
          toast({
            title: "Wallet session expired",
            description: "Your WalletConnect session has expired. Please reconnect your wallet and try again.",
            variant: "destructive",
          });
          return;
        }
        // Non-rejection errors: warn the user and still place the order
        console.warn("[OrahDEX] Order signing failed (non-rejection):", err);
        toast({
          title: "Signing unavailable",
          description: "Could not get wallet signature. The order will still be placed — reconnect your wallet to sign future orders.",
        });
      } finally {
        setSigning(false);
      }
    }

    setApprovalStep("idle");

    // ── Step 4: Record the order — on success, track settlement tx ─────────
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
          evmSignature,
          // Attach the on-chain swap txHash for market orders so the API can
          // record it and generate the corresponding BSV settlement tx.
          signedTx:       onChainTxHash ?? evmSignature,
          networkType:    isEvm ? "evm" : network === 'bch' ? "bch" : network === 'btc' ? "btc" : network === 'sol' ? "sol" : "bsv",
          // Optional cross-chain receive address (e.g. Cardano addr when BSV wallet buys ADA)
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
            // Track BSV settlement tx in the status bar
            addTx({
              hash:                 txid,
              chainId:              0, // BSV
              label:                `BSV Settlement · ${side.toUpperCase()} ${amount} ${base}`,
              status:               "confirmed",
              confirmations:        1,
              requiredConfirmations: 1,
              timestamp:            Date.now(),
              explorerUrl:          url ?? `https://whatsonchain.com/tx/${txid}`,
            });
          }

          // Refresh native + token balances after any trade
          if (usesApiBalance && address) {
            // Re-fetch API ledger balances after every fill (covers demo + Orah Wallet)
            fetchDemoBalances(base, quote, address);
          } else if (isEvm && address) {
            const bal = await fetchEvmBalance(address, currentChainId);
            if (bal !== null) setbal(bal);
            refreshBalances();
            // Re-fetch API locked amount so "In open orders" row updates immediately
            try {
              const r = await fetch(`${API_BASE}/balances/${availableSym}?walletAddress=${encodeURIComponent(address)}`);
              if (r.ok) {
                const j = await r.json();
                setApiLockedAmt(parseFloat(j.locked ?? "0") || 0);
              }
            } catch { /* non-critical */ }
          }
        },
      }
    );
  };

  if (!address) return <WalletPrompt base={base} quote={quote} />;

  const isApproving = approvalStep === "checking" || approvalStep === "needed" || approvalStep === "approving";
  const isPending = placeOrder.isPending || signing || isApproving;
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

      {/* Settlement banner */}
      {settlement && (
        <SettlementBanner
          matched={settlement.matched}
          txid={settlement.txid}
          explorerUrl={settlement.explorerUrl}
          onDismiss={() => setSettlement(null)}
        />
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

        {/* Available balance row */}
        <div className="flex items-center justify-between text-xs px-0.5">
          <span className="text-muted-foreground">Available</span>
          <div className="flex items-center gap-1">
            {balancesLoading && isEvm ? (
              <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground/40" />
            ) : (
              <span className="font-mono font-semibold text-foreground">
                {availableAmt > 0
                  ? availableAmt.toLocaleString("en-US", { maximumFractionDigits: 6 })
                  : "0.0000"}{" "}{availableSym}
              </span>
            )}
            {!balancesLoading && isEvm && (
              <button type="button" onClick={refreshBalances} className="text-muted-foreground/30 hover:text-primary transition-colors">
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        {/* Locked-in-orders row (external EVM wallets only) */}
        {!usesApiBalance && apiLockedAmt > 0 && (
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

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

          {/* EVM approval step indicator */}
          {approvalStep !== "idle" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
              {approvalStep === "checking" && <><Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" /><span className="text-amber-300">Checking {base} allowance…</span></>}
              {approvalStep === "needed"   && <><AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" /><span className="text-amber-300">Approval required — confirm in wallet</span></>}
              {approvalStep === "approving" && <><Lock className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" /><span className="text-amber-300">Waiting for approval tx…</span></>}
              {approvalStep === "approved"  && <><ShieldCheck className="w-3.5 h-3.5 text-green-400 shrink-0" /><span className="text-green-300">Allowance confirmed — signing order</span></>}
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
            {approvalStep === "checking" || approvalStep === "needed" ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Checking allowance…</>
            ) : approvalStep === "approving" ? (
              <><Lock className="w-4 h-4 animate-pulse" /> Approving {base}…</>
            ) : signing ? (
              <><PenLine className="w-4 h-4 animate-pulse" /> Sign in MetaMask…</>
            ) : isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Placing…</>
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
              {isEvm ? "⬡ EVM" : network === 'btc' ? "₿ BTC" : network === 'sol' ? "◎ SOL" : network === 'bch' ? "🟢 BCH" : "₿ BSV"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
