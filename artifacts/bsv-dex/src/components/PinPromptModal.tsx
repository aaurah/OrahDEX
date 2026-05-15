import { useEffect, useRef, useState } from "react";
import { Shield, Loader2, AlertTriangle, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { usePinPromptStore } from "@/store/usePinPromptStore";
import { PIN_MIN_LEN, PIN_MAX_LEN } from "@/lib/walletPin";
import { cn } from "@/lib/utils";

/**
 * Global PIN entry modal — shown whenever an imported (PIN-protected) wallet
 * needs to sign a transaction. Mounted once at the app root.
 *
 * Uses Radix Dialog (same as LockFundsDialog) so that Radix correctly transfers
 * the focus trap from the outer dialog to this one. Using a raw createPortal
 * left the outer dialog's focus trap active, which prevented the PIN input from
 * receiving focus (no keyboard on iOS) and swallowed X / Cancel clicks.
 */
export function PinPromptModal() {
  const { open, title, subtitle, busy, error, address, submit, cancel } = usePinPromptStore();
  const [pin, setPin] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setPin("");
  }, [open]);

  const canSubmit = !busy && pin.length >= PIN_MIN_LEN;
  const onSubmit  = () => { if (canSubmit) submit(pin); };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) cancel();
      }}
    >
      <DialogContent
        className="max-w-sm border-border bg-card text-card-foreground p-0 gap-0"
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
          else cancel();
        }}
      >
        <div className="flex items-start justify-between p-5 pb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogHeader className="text-left space-y-0">
                <DialogTitle className="text-base font-bold text-foreground">
                  {title}
                </DialogTitle>
                {address && (
                  <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                    {address.slice(0, 6)}…{address.slice(-4)}
                  </p>
                )}
              </DialogHeader>
            </div>
          </div>
          <button
            onClick={cancel}
            disabled={busy}
            className="p-1 -mr-1 -mt-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 shrink-0"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {subtitle}
          </DialogDescription>

          {/* Wrapper div is tappable on iOS — touching anywhere on it focuses the input */}
          <div
            className="cursor-text"
            onTouchStart={() => { inputRef.current?.focus(); }}
            onClick={() => { inputRef.current?.focus(); }}
          >
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={PIN_MAX_LEN}
              autoComplete="one-time-code"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => { if (e.key === "Enter") onSubmit(); }}
              disabled={busy}
              placeholder="••••••"
              className={cn(
                "w-full bg-white/3 border rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono",
                "text-foreground focus:outline-none transition-all pointer-events-auto",
                error
                  ? "border-red-500/60 focus:border-red-500"
                  : "border-border focus:border-primary/60",
              )}
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0" /> {error}
            </p>
          )}

          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className={cn(
              "w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
              canSubmit
                ? "bg-primary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20"
                : "bg-white/5 text-muted-foreground cursor-not-allowed",
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
      </DialogContent>
    </Dialog>
  );
}
