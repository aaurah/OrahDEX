import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ChevronDown, ArrowDown, Copy, Check, RefreshCw, Zap, CheckCircle2, Clock, AlertCircle, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useWalletPrices } from "@/hooks/useWalletPrices";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Assets supported for deposit/withdraw ────────────────────────────────────

interface Asset {
  id: string;
  label: string;
  symbol: string;
  icon: string;
  color: string;
  network: string;
  usdRate: () => number;
}

const BSV_DEPOSIT_ADDRESS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7Divfna"; // demo genesis address
const FEE_PCT = 0.005; // 0.5% bridge fee

function useAssets(prices: ReturnType<typeof useWalletPrices>["prices"]) {
  return [
    { id: "btc",  label: "Bitcoin",        symbol: "BTC",  icon: "₿",  color: "text-orange-400", network: "Bitcoin",   usdRate: () => prices.BTC.usd || 83000 },
    { id: "eth",  label: "Ethereum",       symbol: "ETH",  icon: "⬡",  color: "text-violet-400", network: "Ethereum",  usdRate: () => prices.ETH.usd || 1800  },
    { id: "usdt", label: "Tether",         symbol: "USDT", icon: "₮",  color: "text-green-400",  network: "Tron/EVM",  usdRate: () => 1                        },
    { id: "usdc", label: "USD Coin",       symbol: "USDC", icon: "$",  color: "text-blue-400",   network: "Ethereum",  usdRate: () => 1                        },
    { id: "bnb",  label: "BNB",            symbol: "BNB",  icon: "◈",  color: "text-yellow-400", network: "BNB Chain", usdRate: () => 580                      },
    { id: "sol",  label: "Solana",         symbol: "SOL",  icon: "◎",  color: "text-cyan-400",   network: "Solana",    usdRate: () => 130                      },
    { id: "bch",  label: "Bitcoin Cash",   symbol: "BCH",  icon: "Ƀ",  color: "text-lime-400",   network: "BCH",       usdRate: () => 320                      },
  ] as Asset[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ step, total, label }: { step: number; total: number; label: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium">Step {step}/{total}</p>
      <p className="text-xl font-black text-foreground mt-0.5">{label}</p>
    </div>
  );
}

function AssetSelector({
  assets, value, onChange, label, disabled
}: {
  assets: Asset[]; value: Asset; onChange: (a: Asset) => void; label: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <p className="text-[11px] text-muted-foreground font-semibold mb-1.5 uppercase tracking-wide">{label}</p>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-colors",
          disabled
            ? "bg-secondary/30 border-border/30 cursor-default"
            : "bg-secondary/60 border-border/60 active:bg-secondary"
        )}
      >
        <span className={cn("text-xl leading-none", value.color)}>{value.icon}</span>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-foreground">{value.label}</p>
          <p className="text-[11px] text-muted-foreground">{value.network}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">{value.symbol}</span>
          {!disabled && <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl overflow-hidden shadow-2xl z-50">
          {assets.map(a => (
            <button
              key={a.id}
              onClick={() => { onChange(a); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 active:bg-secondary transition-colors"
            >
              <span className={cn("text-lg leading-none", a.color)}>{a.icon}</span>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-foreground">{a.label}</p>
                <p className="text-[11px] text-muted-foreground">{a.network}</p>
              </div>
              <span className="text-xs font-bold text-muted-foreground">{a.symbol}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Deposit wizard ────────────────────────────────────────────────────────────

function DepositWizard({ onBack }: { onBack: () => void }) {
  const { prices } = useWalletPrices();
  const assets     = useAssets(prices);
  const bsvUSD     = prices.BSV.usd || 14.83;

  const [step,       setStep]       = useState(1);
  const [asset,      setAsset]      = useState<Asset>(assets[0]);
  const [amountIn,   setAmountIn]   = useState("0.1");
  const [copied,     setCopied]     = useState(false);
  const [txid,       setTxid]       = useState("");
  const [submitted,  setSubmitted]  = useState(false);
  const [timer,      setTimer]      = useState(9);

  // Timer in step 1 button (like HandCash)
  useEffect(() => {
    if (step !== 1) return;
    if (timer <= 0) return;
    const t = setInterval(() => setTimer(n => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [step, timer]);

  const assetUSD = asset.usdRate();
  const amountNum = parseFloat(amountIn) || 0;
  const usdValue  = amountNum * assetUSD;
  const bsvOut    = usdValue > 0 ? (usdValue * (1 - FEE_PCT)) / bsvUSD : 0;
  const rateStr   = `1 ${asset.symbol} = ${(assetUSD / bsvUSD).toLocaleString(undefined, { maximumFractionDigits: 4 })} BSV`;
  const minIn     = 0.00015;
  const maxIn     = 10;

  const copy = async () => {
    await navigator.clipboard.writeText(BSV_DEPOSIT_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (step === 1) return (
    <div className="flex flex-col gap-5 h-full">
      <StepIndicator step={1} total={3} label="Choose deposit amount" />

      {/* You send */}
      <div>
        <p className="text-[11px] text-muted-foreground font-semibold mb-1.5 uppercase tracking-wide">You send</p>
        <div className="bg-secondary/50 border border-border/60 rounded-2xl px-4 py-3.5 mb-2">
          <input
            type="number"
            value={amountIn}
            onChange={e => setAmountIn(e.target.value)}
            className="w-full bg-transparent text-lg font-bold text-foreground outline-none"
            placeholder="0.00"
          />
        </div>
        <AssetSelector assets={assets} value={asset} onChange={a => { setAsset(a); setTimer(9); }} label="" />
        <p className="text-[11px] mt-2 text-green-400 font-medium">
          Min: <span className="font-bold">{minIn} {asset.symbol}</span>
          <span className="mx-2 text-muted-foreground/40">·</span>
          Max: <span className="font-bold text-green-400">{maxIn} {asset.symbol}</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border/40" />
        <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
          <ArrowDown size={14} className="text-muted-foreground" />
        </div>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {/* You get */}
      <div>
        <p className="text-[11px] text-muted-foreground font-semibold mb-1.5 uppercase tracking-wide">You get</p>
        <div className="bg-secondary/50 border border-border/60 rounded-2xl px-4 py-3.5 mb-2">
          <p className="text-lg font-bold text-foreground tabular-nums">
            {bsvOut > 0 ? bsvOut.toFixed(8) : "0.00000000"}
          </p>
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-green-500/8 border border-green-500/20">
          <Zap size={18} className="text-green-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">Bitcoin SV</p>
            <p className="text-[11px] text-muted-foreground">World's fastest settlement</p>
          </div>
          <span className="text-xs font-bold text-muted-foreground bg-green-500/15 px-2 py-0.5 rounded-md text-green-400">BSV</span>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-2 text-center">{rateStr}</p>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {timer > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/60 border border-border/40 text-muted-foreground text-sm shrink-0">
            <RefreshCw size={12} className="animate-spin" />
            <span className="tabular-nums font-semibold">{timer}s</span>
          </div>
        )}
        <button
          onClick={() => setStep(2)}
          disabled={amountNum < minIn || amountNum > maxIn}
          className="flex-1 py-4 rounded-2xl bg-green-500 text-black font-black text-base active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );

  if (step === 2) return (
    <div className="flex flex-col gap-5 h-full">
      <StepIndicator step={2} total={3} label="Send your funds" />

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl px-4 py-3 flex items-start gap-3">
        <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-amber-300/80 leading-relaxed">
          Send exactly <strong className="text-amber-400">{amountIn} {asset.symbol}</strong> to the address below.
          The currency will be lost if the network doesn't match.
        </p>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-3 py-4 bg-secondary/30 rounded-3xl border border-border/40">
        <div className="bg-white p-3 rounded-2xl" style={{ colorScheme: "light" }}>
          <QRCodeCanvas value={BSV_DEPOSIT_ADDRESS} size={160} bgColor="#ffffff" fgColor="#000000" level="M" />
        </div>
        <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Scan to send {asset.symbol}</p>
      </div>

      {/* Address */}
      <div>
        <p className="text-[11px] text-muted-foreground font-semibold mb-1.5 uppercase tracking-wide">Deposit address ({asset.network})</p>
        <div className="bg-secondary/50 border border-border/60 rounded-2xl px-4 py-3 flex items-center gap-3">
          <p className="flex-1 text-sm font-mono text-foreground break-all leading-relaxed">{BSV_DEPOSIT_ADDRESS}</p>
          <button
            onClick={copy}
            className="shrink-0 p-2 rounded-xl bg-secondary active:bg-secondary/80 transition-colors"
          >
            {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} className="text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex justify-between text-sm px-1">
        <span className="text-muted-foreground">You send</span>
        <span className="font-bold text-foreground">{amountIn} {asset.symbol}</span>
      </div>
      <div className="flex justify-between text-sm px-1">
        <span className="text-muted-foreground">You receive</span>
        <span className="font-bold text-green-400">≈ {bsvOut.toFixed(4)} BSV</span>
      </div>
      <div className="flex justify-between text-sm px-1">
        <span className="text-muted-foreground">Bridge fee</span>
        <span className="text-muted-foreground">{(FEE_PCT * 100).toFixed(1)}%</span>
      </div>

      <div className="flex-1" />

      <div className="flex gap-3">
        <button
          onClick={() => setStep(1)}
          className="px-5 py-4 rounded-2xl border border-border/60 text-foreground font-semibold active:bg-secondary transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => setStep(3)}
          className="flex-1 py-4 rounded-2xl bg-green-500 text-black font-black text-base active:scale-95 transition-transform"
        >
          I've Sent It →
        </button>
      </div>
    </div>
  );

  // Step 3 — Processing
  return (
    <div className="flex flex-col gap-5 h-full">
      <StepIndicator step={3} total={3} label="Processing…" />

      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center">
            {submitted ? (
              <CheckCircle2 size={40} className="text-green-400" />
            ) : (
              <Clock size={40} className="text-green-400/60" />
            )}
          </div>
          {!submitted && (
            <div className="absolute inset-0 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
          )}
        </div>

        <div className="text-center">
          <p className="text-foreground font-black text-xl">
            {submitted ? "Confirmed!" : "Waiting for confirmation"}
          </p>
          <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
            {submitted
              ? `You'll receive ${bsvOut.toFixed(4)} BSV shortly.`
              : `Monitoring the ${asset.symbol} network for your transaction…`}
          </p>
        </div>

        {/* Optional TXID input */}
        {!submitted && (
          <div className="w-full">
            <p className="text-[11px] text-muted-foreground font-semibold mb-1.5 uppercase tracking-wide">
              Transaction ID (optional — speeds up processing)
            </p>
            <div className="flex gap-2">
              <input
                value={txid}
                onChange={e => setTxid(e.target.value)}
                placeholder="Paste your tx hash…"
                className="flex-1 bg-secondary/50 border border-border/60 rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 font-mono"
              />
              <button
                onClick={() => setSubmitted(true)}
                disabled={!txid}
                className="px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 active:scale-95 transition-transform"
              >
                Submit
              </button>
            </div>
          </div>
        )}

        <div className="w-full bg-secondary/30 rounded-2xl border border-border/40 overflow-hidden">
          {[
            { label: "Sent", value: `${amountIn} ${asset.symbol}` },
            { label: "Receiving", value: `≈ ${bsvOut.toFixed(4)} BSV` },
            { label: "Network", value: asset.network },
            { label: "Fee", value: `${(FEE_PCT * 100).toFixed(1)}%` },
          ].map(({ label, value }, i) => (
            <div key={label} className={cn("flex justify-between px-4 py-3 text-sm", i > 0 && "border-t border-border/30")}>
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onBack}
        className="py-4 rounded-2xl border border-border/60 text-foreground font-semibold active:bg-secondary transition-colors"
      >
        Done
      </button>
    </div>
  );
}

// ─── Withdraw wizard ───────────────────────────────────────────────────────────

function WithdrawWizard({ onBack }: { onBack: () => void }) {
  const { prices }  = useWalletPrices();
  const assets      = useAssets(prices);
  const bsvUSD      = prices.BSV.usd || 14.83;
  const { address } = useWalletStore();
  const { toast }   = useToast();

  const [step,      setStep]      = useState(1);
  const [destAsset, setDestAsset] = useState<Asset>(assets[0]);
  const [recipient, setRecipient] = useState("");
  const [bsvAmount, setBsvAmount] = useState("0.645");
  const [confirmed, setConfirmed] = useState(false);
  const [timer,     setTimer]     = useState(10);

  useEffect(() => {
    if (step !== 1) return;
    if (timer <= 0) return;
    const t = setInterval(() => setTimer(n => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [step, timer]);

  const bsvNum    = parseFloat(bsvAmount) || 0;
  const usdValue  = bsvNum * bsvUSD;
  const destOut   = usdValue > 0 ? (usdValue * (1 - FEE_PCT)) / destAsset.usdRate() : 0;
  const rateStr   = `1 BSV = ${(bsvUSD / destAsset.usdRate()).toLocaleString(undefined, { maximumFractionDigits: 8 })} ${destAsset.symbol}`;
  const minBsv    = 0.645;
  const maxBsv    = 47961;

  const pasteRecipient = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRecipient(text.trim());
    } catch {
      toast({ title: "Paste manually", description: "Allow clipboard access or paste the address manually." });
    }
  };

  if (step === 1) return (
    <div className="flex flex-col gap-5 h-full">
      <StepIndicator step={1} total={3} label="Withdrawal Setup" />

      {/* Recipient */}
      <div>
        <p className="text-[11px] text-muted-foreground font-semibold mb-1.5 uppercase tracking-wide">Recipient</p>
        <div className="flex gap-2">
          <input
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            placeholder="Crypto wallet address"
            className="flex-1 bg-secondary/50 border border-border/60 rounded-2xl px-4 py-3.5 text-sm text-foreground outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
          />
          <button
            onClick={pasteRecipient}
            className="px-3 rounded-2xl border border-border/60 bg-secondary/50 text-muted-foreground text-xs font-semibold active:bg-secondary"
          >
            Paste
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground/50 mt-1.5 leading-relaxed">
          The currency will be lost if the type of sending currency and wallet network don't match.
        </p>
      </div>

      {/* Currency — BSV (from) */}
      <div>
        <p className="text-[11px] text-muted-foreground font-semibold mb-1.5 uppercase tracking-wide">Currency</p>
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-secondary/50 border border-border/60">
          <Zap size={20} className="text-green-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">Bitcoin SV</p>
            <p className="text-[11px] text-muted-foreground">
              {bsvNum.toFixed(8)} BSV · <span className="text-muted-foreground/60">1 BSV ≈ ${bsvUSD.toFixed(2)} USD</span>
            </p>
          </div>
          <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">BSV</span>
        </div>
      </div>

      {/* You send (BSV amount) */}
      <div>
        <p className="text-[11px] text-muted-foreground font-semibold mb-1.5 uppercase tracking-wide">You send</p>
        <div className="flex gap-2">
          <div className="flex-1 bg-secondary/50 border border-border/60 rounded-2xl px-4 py-3.5">
            <input
              type="number"
              value={bsvAmount}
              onChange={e => { setBsvAmount(e.target.value); setTimer(10); }}
              className="w-full bg-transparent text-lg font-bold text-foreground outline-none"
              placeholder="0.00"
            />
          </div>
          <div className="flex items-center gap-2 px-4 rounded-2xl bg-green-500/8 border border-green-500/20">
            <Zap size={16} className="text-green-400" />
            <span className="text-sm font-bold text-green-400">BSV</span>
          </div>
        </div>
        <p className="text-[11px] mt-2 text-green-400 font-medium">
          Min: <span className="font-bold">{minBsv} BSV</span>
          <span className="mx-2 text-muted-foreground/40">·</span>
          Max: <span className="font-bold text-green-400">{maxBsv.toLocaleString()} BSV</span>
          {address && <span className="ml-2 text-muted-foreground/50">You have: <span className="text-muted-foreground">—</span></span>}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border/40" />
        <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
          <ArrowDown size={14} className="text-muted-foreground" />
        </div>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      {/* You get */}
      <div>
        <p className="text-[11px] text-muted-foreground font-semibold mb-1.5 uppercase tracking-wide">You get</p>
        <div className="flex gap-2">
          <div className="flex-1 bg-secondary/50 border border-border/60 rounded-2xl px-4 py-3.5">
            <p className="text-lg font-bold text-foreground tabular-nums">
              {destOut > 0 ? destOut.toFixed(8) : "0.00000000"}
            </p>
          </div>
          <AssetSelector assets={assets} value={destAsset} onChange={a => { setDestAsset(a); setTimer(10); }} label="" />
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-2 text-center">{rateStr}</p>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {timer > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/60 border border-border/40 text-muted-foreground text-sm shrink-0">
            <RefreshCw size={12} className="animate-spin" />
            <span className="tabular-nums font-semibold">{timer}s</span>
          </div>
        )}
        <button
          onClick={() => setStep(2)}
          disabled={!recipient.trim() || bsvNum < minBsv}
          className="flex-1 py-4 rounded-2xl bg-green-500 text-black font-black text-base active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );

  if (step === 2) return (
    <div className="flex flex-col gap-5 h-full">
      <StepIndicator step={2} total={3} label="Confirm withdrawal" />

      <div className="bg-secondary/30 rounded-3xl border border-border/40 overflow-hidden">
        {[
          { label: "You send",    value: `${bsvAmount} BSV`,                       cls: "text-foreground" },
          { label: "You receive", value: `≈ ${destOut.toFixed(8)} ${destAsset.symbol}`, cls: "text-green-400 font-black" },
          { label: "Rate",        value: rateStr,                                   cls: "text-muted-foreground" },
          { label: "Fee",         value: `${(FEE_PCT * 100).toFixed(1)}%`,          cls: "text-muted-foreground" },
          { label: "Network",     value: destAsset.network,                         cls: "text-muted-foreground" },
          { label: "Recipient",   value: recipient.slice(0, 18) + "…" + recipient.slice(-6), cls: "text-foreground font-mono text-xs" },
        ].map(({ label, value, cls }, i) => (
          <div key={label} className={cn("flex justify-between px-4 py-3.5 text-sm", i > 0 && "border-t border-border/30")}>
            <span className="text-muted-foreground">{label}</span>
            <span className={cls}>{value}</span>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex gap-3">
        <button
          onClick={() => setStep(1)}
          className="px-5 py-4 rounded-2xl border border-border/60 text-foreground font-semibold active:bg-secondary transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => { setConfirmed(true); setStep(3); }}
          className="flex-1 py-4 rounded-2xl bg-green-500 text-black font-black text-base active:scale-95 transition-transform"
        >
          Confirm Withdrawal
        </button>
      </div>
    </div>
  );

  // Step 3 — Processing
  return (
    <div className="flex flex-col gap-5 h-full">
      <StepIndicator step={3} total={3} label="Processing…" />

      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center">
            <CheckCircle2 size={40} className="text-green-400" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-foreground font-black text-xl">Withdrawal Submitted</p>
          <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
            Your {bsvAmount} BSV withdrawal to {destAsset.symbol} is being processed.
          </p>
        </div>

        <div className="w-full bg-secondary/30 rounded-2xl border border-border/40 overflow-hidden">
          {[
            { label: "Sent",       value: `${bsvAmount} BSV` },
            { label: "Receiving",  value: `≈ ${destOut.toFixed(8)} ${destAsset.symbol}` },
            { label: "To",         value: recipient.slice(0, 12) + "…" + recipient.slice(-6) },
            { label: "Est. time",  value: "5–30 minutes" },
          ].map(({ label, value }, i) => (
            <div key={label} className={cn("flex justify-between px-4 py-3 text-sm", i > 0 && "border-t border-border/30")}>
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onBack}
        className="py-4 rounded-2xl border border-border/60 text-foreground font-semibold active:bg-secondary transition-colors"
      >
        Done
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function MobileHandCashBridge() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");

  const handleBack = () => window.history.back();

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <button
          onClick={handleBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 text-foreground active:bg-secondary"
        >
          <ArrowLeft size={18} />
        </button>
        <p className="flex-1 text-center font-bold text-base">
          {mode === "deposit" ? "Deposit to your wallet" : "Withdraw"}
        </p>
        {/* QR Scan shortcut */}
        <button
          onClick={() => navigate("/qr-scan")}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 text-foreground active:bg-secondary"
        >
          <QrCode size={17} />
        </button>
      </div>

      {/* Mode toggle */}
      <div className="shrink-0 flex gap-2 px-4 py-3 border-b border-border/40 bg-secondary/20">
        {(["deposit", "withdraw"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
              mode === m
                ? "bg-green-500 text-black shadow-lg shadow-green-500/20"
                : "bg-secondary/60 text-muted-foreground active:bg-secondary"
            )}
          >
            {m === "deposit" ? "⬇ Deposit" : "⬆ Withdraw"}
          </button>
        ))}
      </div>

      {/* Wizard body */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {mode === "deposit"
          ? <DepositWizard key="deposit" onBack={handleBack} />
          : <WithdrawWizard key="withdraw" onBack={handleBack} />}
      </div>
    </div>
  );
}
