import { useEffect, useRef, useState } from "react";
import {
  Shield, Copy, Check, Eye, EyeOff, AlertTriangle,
  CheckCircle2, ChevronRight, Zap, KeyRound, PlusCircle,
} from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { generateMnemonic, deriveAddress, validateMnemonic } from "@/lib/seedPhrase";
import { cn } from "@/lib/utils";

// Steps:
//  "choice"  → Does the user already have a BSV wallet?
//  "import"  → Enter seed phrase to import
//  "intro"   → Intro before creating new wallet
//  "phrase"  → Show generated seed phrase
//  "confirm" → User confirms they saved the phrase
//  "done"    → Wallet activated
type Step = "choice" | "import" | "intro" | "phrase" | "confirm" | "done";

export function BsvAutoWalletModal() {
  const { address, network, bsvAddress, setBsvWallet } = useWalletStore();

  // Show only when EVM wallet is connected with no BSV wallet yet
  const needsBsv = !!address && network === "evm" && !bsvAddress;

  const [step, setStep]         = useState<Step>("choice");
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [bsvAddr, setBsvAddr]   = useState("");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied]     = useState(false);
  const [checked, setChecked]   = useState(false);
  const [visible, setVisible]   = useState(false);

  // Import flow state
  const [importInput, setImportInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importAddr, setImportAddr]   = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Prepare new wallet words when create flow starts
  const prepareNew = () => {
    const words = generateMnemonic(12);
    const addr  = deriveAddress(words, "bsv");
    setMnemonic(words);
    setBsvAddr(addr);
  };

  // Reset all state when modal appears
  useEffect(() => {
    if (needsBsv) {
      setStep("choice");
      setRevealed(false);
      setCopied(false);
      setChecked(false);
      setImportInput("");
      setImportError(null);
      setImportAddr("");
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [needsBsv]);

  const copyPhrase = () => {
    navigator.clipboard.writeText(mnemonic.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleImportValidate = () => {
    const res = validateMnemonic(importInput);
    if (!res.valid) { setImportError(res.error ?? "Invalid phrase"); return; }
    const addr = deriveAddress(res.words, "bsv");
    setImportAddr(addr);
    setImportError(null);
    setBsvWallet(addr, res.words);
    setStep("done");
    setBsvAddr(addr);
  };

  const handleSave = () => {
    setBsvWallet(bsvAddr, mnemonic);
    setStep("done");
  };

  if (!needsBsv) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] flex items-end md:items-center justify-center transition-all duration-300",
        visible ? "bg-black/70 backdrop-blur-sm" : "bg-black/0 pointer-events-none"
      )}
    >
      <div
        className={cn(
          "w-full max-w-md bg-card border border-border rounded-t-3xl md:rounded-3xl shadow-2xl transition-transform duration-300 max-h-[90svh] overflow-y-auto",
          visible ? "translate-y-0" : "translate-y-full md:translate-y-4"
        )}
      >

        {/* ── CHOICE ── */}
        {step === "choice" && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-3 pt-2">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Zap className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">BSV Wallet Required</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  All trades on OrahDEX settle on-chain via Bitcoin SV.
                  Do you already have a BSV wallet?
                </p>
              </div>
            </div>

            {/* Import existing */}
            <button
              onClick={() => setStep("import")}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-secondary/60 border border-border hover:border-primary/40 hover:bg-secondary transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Yes — Import my existing wallet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Enter your 12 or 24-word seed phrase</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>

            {/* Create new */}
            <button
              onClick={() => { prepareNew(); setStep("intro"); }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-secondary/60 border border-border hover:border-amber-500/40 hover:bg-secondary transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <PlusCircle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">No — Create a new BSV wallet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Generate a fresh wallet and save your seed phrase</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </div>
        )}

        {/* ── IMPORT ── */}
        {step === "import" && (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Import BSV Wallet</h2>
                <p className="text-xs text-muted-foreground">Enter your 12 or 24-word seed phrase</p>
              </div>
            </div>

            <div className="bg-red-500/8 border border-red-500/25 rounded-2xl p-3 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300/90">
                Never share your seed phrase with anyone. OrahDEX will never ask for it outside this import flow.
              </p>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                Seed Phrase
              </label>
              <textarea
                ref={textareaRef}
                value={importInput}
                onChange={(e) => { setImportInput(e.target.value); setImportError(null); }}
                placeholder="Enter your 12 or 24 words separated by spaces…"
                rows={4}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 resize-none"
              />
              {importError && (
                <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {importError}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                {importInput.trim().split(/\s+/).filter(Boolean).length} / 12 words entered
              </p>
            </div>

            <button
              onClick={handleImportValidate}
              disabled={importInput.trim().split(/\s+/).filter(Boolean).length < 12}
              className={cn(
                "w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
                importInput.trim().split(/\s+/).filter(Boolean).length >= 12
                  ? "bg-primary text-black hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              Import Wallet
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setStep("choice")}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          </div>
        )}

        {/* ── INTRO ── */}
        {step === "intro" && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-3 pt-2">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Shield className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Save Your Seed Phrase</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  We've generated a new BSV wallet for you. Your seed phrase is the <strong>only</strong> way to recover it — store it safely.
                </p>
              </div>
            </div>

            <div className="bg-amber-500/8 border border-amber-500/25 rounded-2xl p-4 flex gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/90 leading-relaxed">
                Never share your seed phrase. OrahDEX will never ask for it. If you lose it, your BSV wallet cannot be recovered.
              </p>
            </div>

            <div className="space-y-2">
              {["View & copy your 12-word seed phrase", "Write it down on paper or store it securely", "Confirm you've saved it to activate trading"].map((t, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/60 border border-border">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">{i + 1}</div>
                  <p className="text-sm text-foreground">{t}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep("phrase")}
              className="w-full py-3.5 rounded-2xl bg-primary text-black font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all"
            >
              Show My Seed Phrase
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => setStep("choice")} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">← Back</button>
          </div>
        )}

        {/* ── PHRASE ── */}
        {step === "phrase" && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Shield className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Your Seed Phrase</h2>
                <p className="text-xs text-muted-foreground">Keep this private and safe forever</p>
              </div>
            </div>

            <div className="relative">
              <div className={cn(
                "grid grid-cols-3 gap-2 transition-all duration-200",
                !revealed && "blur-md select-none pointer-events-none"
              )}>
                {mnemonic.map((word, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-secondary/80 border border-border rounded-xl px-3 py-2">
                    <span className="text-[10px] text-muted-foreground/60 font-mono w-4 shrink-0">{i + 1}.</span>
                    <span className="text-sm font-mono font-semibold text-foreground">{word}</span>
                  </div>
                ))}
              </div>
              {!revealed && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    onClick={() => setRevealed(true)}
                    className="flex items-center gap-2 bg-card border border-border rounded-2xl px-5 py-3 text-sm font-semibold text-foreground shadow-xl hover:bg-secondary transition-all"
                  >
                    <Eye className="w-4 h-4 text-primary" />
                    Tap to Reveal
                  </button>
                </div>
              )}
            </div>

            {revealed && (
              <div className="flex gap-2">
                <button onClick={() => setRevealed(false)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary border border-border text-sm text-muted-foreground hover:text-foreground transition-all">
                  <EyeOff className="w-3.5 h-3.5" /> Hide
                </button>
                <button onClick={copyPhrase} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-semibold hover:bg-primary/15 transition-all">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy Phrase"}
                </button>
              </div>
            )}

            <div className="bg-secondary/60 border border-border rounded-xl p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Your BSV Address</p>
              <p className="text-xs font-mono text-foreground break-all leading-relaxed">{bsvAddr}</p>
            </div>

            <div className="bg-red-500/8 border border-red-500/25 rounded-2xl p-3 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300/90">Never share your seed phrase. OrahDEX will never ask for it.</p>
            </div>

            <button
              onClick={() => setStep("confirm")}
              disabled={!revealed}
              className={cn(
                "w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
                revealed ? "bg-primary text-black hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              I've Saved My Phrase <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── CONFIRM ── */}
        {step === "confirm" && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-3 pt-2">
              <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Shield className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Confirm & Save</h2>
                <p className="text-sm text-muted-foreground mt-1">Confirm you've stored your seed phrase safely before activating your BSV wallet.</p>
              </div>
            </div>

            <button
              onClick={() => setChecked(!checked)}
              className="w-full flex items-start gap-3 p-4 rounded-2xl bg-secondary/60 border border-border text-left hover:border-primary/40 transition-all"
            >
              <div className={cn(
                "w-5 h-5 rounded-md border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all",
                checked ? "bg-primary border-primary" : "border-muted-foreground/40"
              )}>
                {checked && <Check className="w-3.5 h-3.5 text-black" />}
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                I have written down or securely stored my 12-word seed phrase and understand that losing it means losing access to my BSV wallet permanently.
              </p>
            </button>

            <button
              onClick={handleSave}
              disabled={!checked}
              className={cn(
                "w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
                checked ? "bg-primary text-black hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              Activate BSV Wallet
            </button>
            <button onClick={() => setStep("phrase")} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">← Back to seed phrase</button>
          </div>
        )}

        {/* ── DONE ── */}
        {step === "done" && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">BSV Wallet Ready!</h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Your BSV wallet is activated. You can now trade on OrahDEX with on-chain settlement.
                </p>
              </div>
              <div className="w-full bg-secondary/60 border border-border rounded-xl p-3 text-left">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">BSV Address</p>
                <p className="text-xs font-mono text-green-400 break-all">{bsvAddr || importAddr}</p>
              </div>
            </div>

            <button
              onClick={handleSave}
              className="w-full py-3.5 rounded-2xl bg-primary text-black font-bold text-sm hover:bg-primary/90 transition-all"
            >
              Start Trading →
            </button>
          </div>
        )}

        <div style={{ paddingBottom: "env(safe-area-inset-bottom, 12px)" }} />
      </div>
    </div>
  );
}
