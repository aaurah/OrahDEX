import { useEffect, useState } from "react";
import {
  Shield, Copy, Check, Eye, EyeOff, AlertTriangle,
  LogOut, X,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { cn } from "@/lib/utils";

export function BsvDisconnectModal() {
  const { disconnectPending, bsvMnemonic, bsvAddress, disconnect, cancelDisconnect } =
    useWalletStore();

  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied]     = useState(false);
  const [checked, setChecked]   = useState(false);
  const [visible, setVisible]   = useState(false);

  // Show whenever disconnect is requested
  const show = disconnectPending;

  useEffect(() => {
    if (show) {
      setRevealed(false);
      setCopied(false);
      setChecked(false);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [show]);

  if (!show) return null;

  // If there's no BSV mnemonic (BSV wallet was connected directly, or never set up), just confirm disconnect
  const hasMnemonic = bsvMnemonic && bsvMnemonic.length > 0;

  const copyPhrase = () => {
    if (!bsvMnemonic) return;
    navigator.clipboard.writeText(bsvMnemonic.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDisconnect = () => {
    disconnect();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[70] flex items-end md:items-center justify-center transition-all duration-300",
        visible ? "bg-black/75 backdrop-blur-sm" : "bg-black/0 pointer-events-none"
      )}
    >
      <div
        className={cn(
          "w-full max-w-md bg-card border border-border rounded-t-3xl md:rounded-3xl shadow-2xl transition-transform duration-300",
          visible ? "translate-y-0" : "translate-y-full md:translate-y-4"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <LogOut className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Disconnect Wallet</p>
              <p className="text-[11px] text-muted-foreground">Make sure your BSV seed phrase is saved</p>
            </div>
          </div>
          <button
            onClick={cancelDisconnect}
            className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {hasMnemonic ? (
            <>
              {/* Warning */}
              <div className="bg-amber-500/8 border border-amber-500/25 rounded-2xl p-3.5 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300/90 leading-relaxed">
                  After disconnecting, your BSV wallet data will be cleared from this device.
                  Save your seed phrase now so you can re-import it next time.
                </p>
              </div>

              {/* Seed phrase grid */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Your BSV Seed Phrase
                </p>
                <div className="relative">
                  <div className={cn(
                    "grid grid-cols-3 gap-1.5 transition-all duration-200",
                    !revealed && "blur-md select-none pointer-events-none"
                  )}>
                    {bsvMnemonic!.map((word, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1 bg-secondary/80 border border-border rounded-xl px-2.5 py-2"
                      >
                        <span className="text-[9px] text-muted-foreground/60 font-mono w-3.5 shrink-0">{i + 1}.</span>
                        <span className="text-xs font-mono font-semibold text-foreground">{word}</span>
                      </div>
                    ))}
                  </div>
                  {!revealed && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button
                        onClick={() => setRevealed(true)}
                        className="flex items-center gap-2 bg-card border border-border rounded-2xl px-4 py-2.5 text-sm font-semibold text-foreground shadow-xl hover:bg-secondary transition-all"
                      >
                        <Eye className="w-4 h-4 text-primary" />
                        Tap to Reveal
                      </button>
                    </div>
                  )}
                </div>

                {revealed && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setRevealed(false)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground transition-all"
                    >
                      <EyeOff className="w-3 h-3" />
                      Hide
                    </button>
                    <button
                      onClick={copyPhrase}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/15 transition-all"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied!" : "Copy Phrase"}
                    </button>
                  </div>
                )}
              </div>

              {/* BSV address */}
              {bsvAddress && (
                <div className="bg-secondary/60 border border-border rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">BSV Address</p>
                  <p className="text-xs font-mono text-foreground break-all">{bsvAddress}</p>
                </div>
              )}

              {/* Confirm checkbox */}
              <button
                onClick={() => setChecked(!checked)}
                className="w-full flex items-start gap-3 p-3.5 rounded-2xl bg-secondary/60 border border-border text-left hover:border-primary/40 transition-all"
              >
                <div className={cn(
                  "w-5 h-5 rounded-md border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all",
                  checked ? "bg-primary border-primary" : "border-muted-foreground/40"
                )}>
                  {checked && <Check className="w-3.5 h-3.5 text-black" />}
                </div>
                <p className="text-sm text-foreground leading-relaxed">
                  I have saved my BSV seed phrase and can recover my wallet anytime.
                </p>
              </button>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={cancelDisconnect}
                  className="flex-1 py-3 rounded-2xl bg-secondary border border-border text-foreground text-sm font-semibold hover:bg-secondary/80 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={!checked}
                  className={cn(
                    "flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all",
                    checked
                      ? "bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            /* No BSV mnemonic — simple confirmation */
            <>
              <p className="text-sm text-muted-foreground text-center py-2">
                Are you sure you want to disconnect your wallet?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={cancelDisconnect}
                  className="flex-1 py-3 rounded-2xl bg-secondary border border-border text-foreground text-sm font-semibold hover:bg-secondary/80 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisconnect}
                  className="flex-1 py-3 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold flex items-center justify-center gap-2 hover:bg-red-500/25 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </div>
            </>
          )}
        </div>

        <div style={{ paddingBottom: "env(safe-area-inset-bottom, 12px)" }} />
      </div>
    </div>
  );
}
