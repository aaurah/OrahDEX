import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, QrCode, ChevronDown, AlertTriangle, Wallet, Link2, ArrowRight, ArrowDown, CheckCircle2 } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useExchangeBalanceStore } from "@/store/useExchangeBalanceStore";
import { cn } from "@/lib/utils";

const NETWORKS = [
  { id: "evm-eth",   label: "Ethereum (ETH)",  symbol: "ETH",  color: "blue",   badge: "L1", type: "evm" },
  { id: "evm-bsc",   label: "BNB Chain (BNB)",  symbol: "BNB",  color: "yellow", badge: "L1", type: "evm" },
  { id: "evm-poly",  label: "Polygon (MATIC)",  symbol: "MATIC",color: "violet", badge: "L2", type: "evm" },
  { id: "evm-arb",   label: "Arbitrum One",     symbol: "ETH",  color: "blue",   badge: "L2", type: "evm" },
  { id: "evm-op",    label: "Optimism",         symbol: "ETH",  color: "red",    badge: "L2", type: "evm" },
  { id: "evm-base",  label: "Base",             symbol: "ETH",  color: "blue",   badge: "L2", type: "evm" },
  { id: "evm-zk",    label: "zkSync Era",       symbol: "ETH",  color: "violet", badge: "L3", type: "evm" },
  { id: "bsv",       label: "Bitcoin SV (BSV)", symbol: "BSV",  color: "amber",  badge: "BSV", type: "bsv" },
];

const BADGE_COLOR: Record<string, string> = {
  blue:   "bg-blue-500/10 text-blue-400 border-blue-500/30",
  yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  red:    "bg-red-500/10 text-red-400 border-red-500/30",
  amber:  "bg-green-500/10 text-green-400 border-green-500/30",
};

function QRCodeImage({ address }: { address: string }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(address)}&size=180x180&bgcolor=0d1117&color=ffffff&margin=10&format=png`;
  return (
    <div className="w-44 h-44 rounded-2xl overflow-hidden border border-border bg-white flex items-center justify-center mx-auto">
      <img
        src={url}
        alt="Wallet QR Code"
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
          (e.target as HTMLImageElement).parentElement!.innerHTML =
            `<div class="flex flex-col items-center justify-center w-full h-full bg-card gap-2"><span class="text-3xl">📱</span><span class="text-xs text-muted-foreground text-center px-3">Scan address in your wallet app</span></div>`;
        }}
      />
    </div>
  );
}

type Step = "address" | "confirm" | "done";

export function DepositModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { address, network } = useWalletStore();
  const { open: openWalletModal } = useWalletModalStore();
  const { credit } = useExchangeBalanceStore();

  const [step, setStep] = useState<Step>("address");
  const [selectedNet, setSelectedNet] = useState(network === "bsv" ? "bsv" : "evm-eth");
  const [copied, setCopied] = useState(false);
  const [netOpen, setNetOpen] = useState(false);
  const [bsvManual, setBsvManual] = useState("");
  const [depositAmt, setDepositAmt] = useState("");
  const [amtError, setAmtError] = useState("");
  const [creditedAmt, setCreditedAmt] = useState(0);

  const currentNet = NETWORKS.find(n => n.id === selectedNet) ?? NETWORKS[0];
  const isBsvSelected = currentNet.type === "bsv";
  const isEvmWallet = network === "evm";
  const isBsvWallet = network === "bsv";

  const showAddressMismatch = isBsvSelected && !isBsvWallet && !!address;
  const activeAddress = (() => {
    if (!address) return null;
    if (isBsvSelected && isBsvWallet) return address;
    if (isBsvSelected && !isBsvWallet) return bsvManual || null;
    if (!isBsvSelected && isEvmWallet) return address;
    return address;
  })();

  const handleCopy = () => {
    if (!activeAddress) return;
    navigator.clipboard?.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectBsv = () => {
    onClose();
    setTimeout(() => openWalletModal(), 150);
  };

  const handleClose = () => {
    setStep("address");
    setDepositAmt("");
    setAmtError("");
    setCreditedAmt(0);
    onClose();
  };

  const handleConfirmDeposit = () => {
    const n = parseFloat(depositAmt);
    if (!depositAmt || isNaN(n) || n <= 0) {
      setAmtError("Enter the amount you sent.");
      return;
    }
    if (!address) return;
    // Credit the OrahDEX internal ledger — this is the moment ETH enters the exchange
    credit(address, currentNet.symbol, n);
    setCreditedAmt(n);
    setStep("done");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl pointer-events-auto overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center">
                    <ArrowDown className="w-4.5 h-4.5 text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Deposit to OrahDEX</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {step === "address" && "Step 1 of 2 — Send to your deposit address"}
                      {step === "confirm" && "Step 2 of 2 — Confirm the amount sent"}
                      {step === "done" && "Deposit confirmed"}
                    </p>
                  </div>
                </div>
                <button onClick={handleClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Step 1: Show address + QR */}
              {step === "address" && (
                <div className="p-6 space-y-5">
                  {/* Model A explainer */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                    <span className="text-primary font-semibold">OrahDEX is a custodial off-chain exchange.</span> Send funds here first — then trade instantly with zero wallet popups. Withdraw anytime.
                  </div>

                  {/* Network selector */}
                  <div className="relative">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Deposit Network</p>
                    <button
                      onClick={() => setNetOpen(o => !o)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-secondary border border-border rounded-xl text-sm font-medium hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border", BADGE_COLOR[currentNet.color])}>
                          {currentNet.badge}
                        </span>
                        <span>{currentNet.label}</span>
                      </div>
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", netOpen && "rotate-180")} />
                    </button>
                    <AnimatePresence>
                      {netOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-10 overflow-hidden"
                        >
                          {NETWORKS.map(n => (
                            <button
                              key={n.id}
                              onClick={() => { setSelectedNet(n.id); setNetOpen(false); setBsvManual(""); }}
                              className={cn(
                                "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/5 transition-colors text-left",
                                selectedNet === n.id && "bg-primary/10 text-primary"
                              )}
                            >
                              <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0", BADGE_COLOR[n.color])}>
                                {n.badge}
                              </span>
                              {n.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* BSV with non-BSV wallet → show connect panel */}
                  {showAddressMismatch ? (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/25">
                        <AlertTriangle className="w-4.5 h-4.5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-300/90 leading-relaxed">
                          <p className="font-semibold text-amber-300 mb-1">EVM address cannot receive BSV</p>
                          Your connected EVM wallet uses a different address format (0x…). BSV requires a native Bitcoin SV address.
                        </div>
                      </div>
                      <button
                        onClick={handleConnectBsv}
                        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-green-500/10 border border-green-500/30 hover:border-green-500/50 hover:bg-green-500/15 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                            <Wallet className="w-4 h-4 text-green-400" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-semibold text-green-300">Connect BSV Wallet</p>
                            <p className="text-[11px] text-green-400/70">HandCash · RelayX · Panda · manual address</p>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-green-400 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">or paste address</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Your BSV Address</p>
                        <input
                          value={bsvManual}
                          onChange={e => setBsvManual(e.target.value)}
                          placeholder="e.g. 1FsBsvAddressExample..."
                          className="w-full px-4 py-3 bg-secondary border border-border rounded-xl font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-all"
                        />
                      </div>
                      {bsvManual.trim().length > 10 && (
                        <>
                          <QRCodeImage address={bsvManual.trim()} />
                          <div className="flex items-stretch gap-2">
                            <div className="flex-1 px-3 py-2.5 bg-secondary border border-border rounded-xl font-mono text-xs text-foreground break-all leading-relaxed">
                              {bsvManual.trim()}
                            </div>
                            <button
                              onClick={handleCopy}
                              className={cn(
                                "px-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-1.5 shrink-0",
                                copied ? "bg-green-500/15 border-green-500/40 text-green-400" : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                              )}
                            >
                              {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      {activeAddress ? (
                        <QRCodeImage address={activeAddress} />
                      ) : (
                        <div className="space-y-3">
                          <div className="w-44 h-44 rounded-2xl border border-dashed border-border bg-secondary/50 flex flex-col items-center justify-center mx-auto gap-2">
                            <QrCode className="w-10 h-10 text-muted-foreground/40" />
                            <p className="text-xs text-muted-foreground text-center px-4">Connect wallet to see QR</p>
                          </div>
                          {!address && (
                            <button
                              onClick={handleConnectBsv}
                              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/15 transition-all"
                            >
                              <Link2 className="w-4 h-4" />
                              Connect Wallet
                            </button>
                          )}
                        </div>
                      )}
                      {activeAddress && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Your Deposit Address</p>
                          <div className="flex items-stretch gap-2">
                            <div className="flex-1 px-3 py-2.5 bg-secondary border border-border rounded-xl font-mono text-xs text-foreground break-all leading-relaxed">
                              {activeAddress}
                            </div>
                            <button
                              onClick={handleCopy}
                              className={cn(
                                "px-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-1.5 shrink-0",
                                copied ? "bg-green-500/15 border-green-500/40 text-green-400" : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                              )}
                            >
                              {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="p-4 rounded-xl bg-green-500/8 border border-green-500/20 text-xs text-green-300/80 leading-relaxed">
                    ⚠️ <strong className="text-green-300">Only send {currentNet.symbol} on the {currentNet.label} network</strong> to this address. Wrong asset or network = permanent loss.
                  </div>

                  {/* Proceed to confirm step */}
                  {activeAddress && (
                    <button
                      onClick={() => setStep("confirm")}
                      className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                    >
                      I've sent — Confirm Amount →
                    </button>
                  )}
                </div>
              )}

              {/* Step 2: Confirm amount sent */}
              {step === "confirm" && (
                <div className="p-6 space-y-5">
                  <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                    Enter the exact amount of <span className="text-primary font-semibold">{currentNet.symbol}</span> you sent. This credits your OrahDEX trading balance immediately.
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold block mb-2">
                      Amount Sent ({currentNet.symbol})
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={depositAmt}
                        onChange={e => { setDepositAmt(e.target.value); setAmtError(""); }}
                        placeholder="e.g. 0.005"
                        min="0"
                        step="any"
                        className={cn(
                          "w-full px-4 py-3 bg-secondary border rounded-xl font-mono text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary/50 transition-all pr-16",
                          amtError ? "border-red-500/60" : "border-border"
                        )}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">{currentNet.symbol}</span>
                    </div>
                    {amtError && <p className="text-xs text-red-400 mt-1">{amtError}</p>}
                  </div>

                  <div className="bg-secondary/60 rounded-xl p-4 space-y-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Asset</span>
                      <span className="font-semibold text-foreground">{currentNet.symbol} on {currentNet.label}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Credited to</span>
                      <span className="font-semibold text-primary">OrahDEX Internal Balance</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">On-chain wallet</span>
                      <span className="text-muted-foreground">Not changed (custodial model)</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep("address")}
                      className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleConfirmDeposit}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                    >
                      Credit My Balance
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Done */}
              {step === "done" && (
                <div className="p-8 flex flex-col items-center gap-5 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9 text-green-400" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold mb-2">Balance Credited!</h4>
                    <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                      <span className="text-foreground font-semibold">{creditedAmt} {currentNet.symbol}</span> has been credited to your OrahDEX balance. You can now trade it in the order book — no wallet popups required.
                    </p>
                  </div>
                  <div className="w-full bg-secondary/60 rounded-xl p-4 text-left space-y-2">
                    <div className="flex items-center gap-2 text-xs text-green-400">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>OrahDEX balance updated</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                      <span>Ready to trade instantly</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                      <span>Withdraw anytime via Portfolio → Withdraw</span>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-all"
                  >
                    Start Trading
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
