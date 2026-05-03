import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Loader2, AlertTriangle, X } from "lucide-react";
import { usePinPromptStore } from "@/store/usePinPromptStore";
import { PIN_MIN_LEN, PIN_MAX_LEN } from "@/lib/walletPin";
import { cn } from "@/lib/utils";

/**
 * Global PIN entry modal — shown whenever an imported (PIN-protected) wallet
 * needs to sign a transaction. Mounted once at the app root.
 */
export function PinPromptModal() {
  const { open, title, subtitle, busy, error, address, submit, cancel } = usePinPromptStore();
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!open) setPin("");
  }, [open]);

  if (typeof document === "undefined") return null;

  const canSubmit = !busy && pin.length >= PIN_MIN_LEN;
  const onSubmit  = () => { if (canSubmit) submit(pin); };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="pin-prompt-backdrop"
          className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => { if (!busy) cancel(); }}
        >
          <motion.div
            key="pin-prompt-card"
            className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 pb-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-foreground">{title}</h3>
                  {address && (
                    <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                      {address.slice(0, 6)}…{address.slice(-4)}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={cancel}
                disabled={busy}
                className="p-1 -mr-1 -mt-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">{subtitle}</p>

              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={PIN_MAX_LEN}
                autoFocus
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => { if (e.key === "Enter") onSubmit(); }}
                disabled={busy}
                placeholder="••••••"
                className={cn(
                  "w-full bg-white/3 border rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono text-foreground focus:outline-none transition-all",
                  error ? "border-red-500/60 focus:border-red-500" : "border-border focus:border-primary/60"
                )}
              />

              {error && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> {error}
                </p>
              )}

              <button
                onClick={onSubmit}
                disabled={!canSubmit}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                  canSubmit
                    ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20"
                    : "bg-white/5 text-muted-foreground cursor-not-allowed"
                )}
              >
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : "Unlock & Sign"}
              </button>

              <button
                onClick={cancel}
                disabled={busy}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
