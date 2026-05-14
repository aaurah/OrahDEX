import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, EyeOff, Copy, ShieldAlert, Fingerprint, KeyRound, Check } from "lucide-react";
import {
  getImportedWallet,
  unlockWithPin,
  unlockWithPasskey,
  PIN_MIN_LEN,
  PIN_MAX_LEN,
} from "@/lib/walletPin";
import { listPasskeyWallets, revealPasskeyWalletSecret } from "@/lib/passkeyWallet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Step = "warn" | "auth" | "reveal";

interface Props {
  open: boolean;
  onClose: () => void;
  address: string | null;
}

export function RevealSecretSheet({ open, onClose, address }: Props) {
  const importedRec = address ? getImportedWallet(address) : null;
  const passkeyWallet = address
    ? listPasskeyWallets().find(w => w.address.toLowerCase() === address.toLowerCase()) ?? null
    : null;
  // Treat a native passkey-only wallet (no PIN/passkey-import record) as a
  // passkey-protected backup source so the same UI works for both flows.
  const rec = importedRec ?? (passkeyWallet
    ? { protectedBy: "passkey" as const, passkeyId: passkeyWallet.credentialId }
    : null);
  const isNativePasskey = !importedRec && !!passkeyWallet;
  const { toast } = useToast();

  const [step, setStep]       = useState<Step>("warn");
  const [pin, setPin]         = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [secret, setSecret]   = useState<string | null>(null);
  const [hidden, setHidden]   = useState(true);
  const [copied, setCopied]   = useState(false);

  // Reset on close — never leak plaintext between sessions
  useEffect(() => {
    if (!open) {
      setStep("warn"); setPin(""); setBusy(false);
      setError(null); setSecret(null); setHidden(true); setCopied(false);
    }
  }, [open]);

  // Auto-clear plaintext after 60s on the reveal screen
  useEffect(() => {
    if (step !== "reveal" || !secret) return;
    const t = setTimeout(() => { setSecret(null); setStep("warn"); }, 60_000);
    return () => clearTimeout(t);
  }, [step, secret]);

  if (!open) return null;

  const submitPin = async () => {
    if (!address) return;
    if (pin.length < PIN_MIN_LEN || pin.length > PIN_MAX_LEN) {
      setError(`PIN must be ${PIN_MIN_LEN}–${PIN_MAX_LEN} digits`);
      return;
    }
    setBusy(true); setError(null);
    try {
      const s = await unlockWithPin(address, pin);
      setSecret(s); setStep("reveal"); setPin("");
    } catch (e: any) {
      setError(e?.message ?? "Wrong PIN");
    } finally { setBusy(false); }
  };

  const submitPasskey = async () => {
    if (!address) return;
    setBusy(true); setError(null);
    try {
      const s = isNativePasskey
        ? await revealPasskeyWalletSecret(address)
        : await unlockWithPasskey(address);
      setSecret(s); setStep("reveal");
    } catch (e: any) {
      setError(e?.message ?? "Authentication failed");
    } finally { setBusy(false); }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "Copied", description: "Secret copied to clipboard. Paste it somewhere safe and clear your clipboard afterwards." });
    } catch { toast({ title: "Copy failed", variant: "destructive" }); }
  };

  const isMnemonic = secret ? secret.trim().split(/\s+/).length >= 12 : false;
  const words      = isMnemonic && secret ? secret.trim().split(/\s+/) : null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="bg-card border border-border rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">
              {step === "warn"   && "Backup wallet"}
              {step === "auth"   && (rec?.protectedBy === "passkey" ? "Authenticate" : "Enter PIN")}
              {step === "reveal" && (isMnemonic ? "Recovery phrase" : "Private key")}
            </h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
          </div>

          {!rec && (
            <div className="p-6 text-sm text-muted-foreground">
              No imported wallet is connected. Connect or import a wallet first.
            </div>
          )}

          {rec && step === "warn" && (
            <div className="p-5 space-y-4">
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex gap-3">
                <ShieldAlert size={20} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-100/90 leading-relaxed">
                  <p className="font-semibold text-amber-200 mb-1">Anyone with this can steal your funds.</p>
                  Never share it. OrahDEX support will never ask for it. Write it down on paper —
                  do not screenshot, email or store it in cloud notes.
                </div>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-5">
                <li>The screen auto-hides after 60 seconds.</li>
                <li>This wallet is protected by your {rec.protectedBy === "passkey" ? "passkey (Face ID / Touch ID)" : "PIN"}.</li>
                <li>OrahDEX never sees your secret — decryption happens locally on this device.</li>
              </ul>
              <button
                onClick={() => setStep("auth")}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 active:scale-[0.99] transition-all"
              >
                I understand, continue
              </button>
            </div>
          )}

          {rec && step === "auth" && (
            <div className="p-5 space-y-4">
              {rec.protectedBy === "passkey" ? (
                <>
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center">
                      <Fingerprint size={32} className="text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground text-center max-w-xs">
                      Authenticate with your passkey to decrypt and reveal your secret.
                    </p>
                  </div>
                  {error && <p className="text-xs text-red-400 text-center">{error}</p>}
                  <button
                    onClick={submitPasskey}
                    disabled={busy}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
                  >
                    {busy ? "Waiting…" : "Authenticate"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground text-center">
                    Enter the PIN you set when importing this wallet.
                  </p>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoFocus
                    maxLength={PIN_MAX_LEN}
                    value={pin}
                    onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") submitPin(); }}
                    placeholder={`${PIN_MIN_LEN}–${PIN_MAX_LEN} digits`}
                    className="w-full px-4 py-3 rounded-xl bg-secondary border border-border text-center text-xl tracking-[0.4em] font-mono"
                  />
                  {error && <p className="text-xs text-red-400 text-center">{error}</p>}
                  <button
                    onClick={submitPin}
                    disabled={busy}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
                  >
                    {busy ? "Verifying…" : "Reveal"}
                  </button>
                </>
              )}
            </div>
          )}

          {rec && step === "reveal" && secret && (
            <div className="p-5 space-y-4">
              {words ? (
                <div className="grid grid-cols-3 gap-2">
                  {words.map((w, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-lg border border-border bg-secondary/40 px-2 py-2 text-center transition-all",
                        hidden ? "blur-md select-none" : "",
                      )}
                    >
                      <span className="text-[10px] text-muted-foreground mr-1">{i + 1}.</span>
                      <span className="text-sm font-mono font-semibold">{w}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className={cn(
                    "rounded-xl border border-border bg-secondary/40 p-4 break-all font-mono text-sm",
                    hidden ? "blur-md select-none" : "",
                  )}
                >
                  {secret}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setHidden(!hidden)}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground font-medium flex items-center justify-center gap-2 text-sm"
                >
                  {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                  {hidden ? "Show" : "Hide"}
                </button>
                <button
                  onClick={copySecret}
                  className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground font-medium flex items-center justify-center gap-2 text-sm"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                Auto-hides in 60 seconds. After backing up, clear your clipboard.
              </p>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold"
              >
                Done
              </button>
            </div>
          )}

          {rec && !rec.passkeyId && rec.protectedBy === "passkey" && step === "auth" && (
            <div className="px-5 pb-5 text-xs text-amber-300 flex items-center gap-2">
              <KeyRound size={12} /> No passkey credential stored — backup unavailable for this wallet.
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
