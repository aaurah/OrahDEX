import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import {
  Fingerprint, Loader2, Plus, LogIn, Shield, AlertCircle,
  Download, ArrowLeft, Eye, EyeOff, CheckCircle2,
  HardDrive, ChevronRight, Wallet, QrCode,
  Smartphone, RefreshCw, Check, WifiOff,
  FileKey, Copy, AlertTriangle, KeyRound,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useWalletStore } from "@/store/useWalletStore";
import {
  registerPasskeyWallet,
  loginWithPasskey,
  isPasskeySupported,
  revealPasskeyWalletSecret,
  type PasskeyChainAddresses,
} from "@/lib/passkeyWallet";
import { validateMnemonic, deriveAllAddresses, generateMnemonic } from "@/lib/seedPhrase";
import {
  validatePin, hasPin, setPin, storeWithPin,
  storeWithPasskey, createImportPasskey, saveDerivedAddresses,
} from "@/lib/walletPin";
import {
  HardwareChooser,
  LedgerPanel,
  TrezorPanel,
  KeystonePanel,
  GridPlusPanel,
  type HWDevice,
} from "@/components/HardwareWalletPanels";

const srOnly: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0,
  margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap", border: 0,
};

type Tab =
  | "choose"
  | "passkey"
  | "create-wallet"
  | "seed-create"
  | "view-seed"
  | "import"
  | "hardware"
  | "ledger"
  | "trezor"
  | "keystone"
  | "gridplus"
  | "mobile-qr";

function applyOrahWallet(address: string, chains?: PasskeyChainAddresses) {
  const store = useWalletStore.getState();
  store.connect({ address, provider: "orah-wallet", network: "evm" });
  if (chains) {
    store.setInternalEvmAddress(chains.evm ?? address);
    if (chains.bsv)  store.setInternalBsvAddress(chains.bsv);
    if (chains.bch)  store.setInternalBchAddress(chains.bch);
    if (chains.btc)  store.setInternalBtcAddress(chains.btc);
    if (chains.sol)  store.setInternalSolAddress(chains.sol);
    if (chains.xrp)  store.setInternalXrpAddress(chains.xrp);
    if (chains.ltc)  store.setInternalLtcAddress(chains.ltc);
    if (chains.doge) store.setInternalDogeAddress(chains.doge);
    if (chains.tron) store.setInternalTronAddress(chains.tron);
  }
}

/* ─── Shared UI atoms ───────────────────────────────────────────────────── */

function OptionCard({
  onClick, iconBg, icon, title, sub, badge, featured,
}: {
  onClick: () => void;
  iconBg: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  badge?: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all duration-200 text-left ${
        featured
          ? "bg-primary/[0.07] border-primary/25 hover:bg-primary/[0.12] hover:border-primary/50 hover:shadow-[0_0_22px_-6px_hsl(var(--primary)/0.3)]"
          : "bg-card border-border hover:bg-accent hover:border-primary/20"
      }`}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground leading-tight">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed truncate">{sub}</div>
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground/80 group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
}

function SubHeader({ onBack, icon, title, description }: {
  onBack: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="px-6 pt-6 pb-4 border-b border-border">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-4 -ml-0.5"
      >
        <ArrowLeft className="w-3 h-3" /> Back
      </button>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Passkey Panel ─────────────────────────────────────────────────────── */

function PasskeyPanel({ onDone, onViewSeed }: { onDone: () => void; onViewSeed?: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<"create" | "login" | null>(null);
  const supported = isPasskeySupported();

  const handleCreate = async () => {
    setLoading("create");
    try {
      const result = await registerPasskeyWallet("OrahDEX Wallet");
      applyOrahWallet(result.address, result.chains);
      toast({ title: "Passkey wallet created", description: `${result.address.slice(0, 6)}…${result.address.slice(-4)} · BSV, BTC, ETH, SOL + more` });
      onDone();
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (err?.name === "NotAllowedError" || msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort")) {
        toast({ title: "Cancelled", description: "Passkey creation was cancelled.", variant: "destructive" });
      } else {
        toast({ title: "Create failed", description: msg || "Could not create passkey wallet.", variant: "destructive" });
      }
    } finally { setLoading(null); }
  };

  const handleLogin = async () => {
    setLoading("login");
    try {
      const result = await loginWithPasskey();
      applyOrahWallet(result.address, result.chains);
      toast({
        title: result.restoredFromBackup ? "Wallet restored" : `Welcome back${result.label ? ` · ${result.label}` : ""}`,
        description: result.restoredFromBackup ? "Restored from cloud backup" : `${result.address.slice(0, 6)}…${result.address.slice(-4)}`,
      });
      onDone();
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort")) {
        toast({ title: "Cancelled", description: "Passkey login was cancelled.", variant: "destructive" });
      } else if (msg.startsWith("WALLET_NOT_FOUND:")) {
        toast({ title: "No wallet found", description: "No passkey wallet on this device — create one first.", variant: "destructive" });
      } else {
        toast({ title: "Login failed", description: msg || "Could not authenticate.", variant: "destructive" });
      }
    } finally { setLoading(null); }
  };

  if (!supported) return (
    <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>Passkeys are not supported in this browser. Try Chrome, Safari, or Edge on a device with biometrics.</span>
    </div>
  );

  return (
    <div className="space-y-2.5">
      <button
        onClick={handleCreate}
        disabled={!!loading}
        className="group w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 hover:shadow-[0_0_22px_-6px_hsl(var(--primary)/0.3)] transition-all duration-200 text-left disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          {loading === "create" ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Plus className="w-5 h-5 text-primary" />}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">Create New Wallet</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Face ID · Touch ID · Security Key</div>
        </div>
        <ChevronRight className="w-4 h-4 text-primary/40 group-hover:text-primary/70 group-hover:translate-x-0.5 transition-all shrink-0" />
      </button>

      <button
        onClick={handleLogin}
        disabled={!!loading}
        className="group w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/20 transition-all duration-200 text-left disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <div className="w-11 h-11 rounded-xl bg-muted border border-border flex items-center justify-center shrink-0">
          {loading === "login" ? <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /> : <LogIn className="w-5 h-5 text-muted-foreground" />}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">Use Existing Passkey</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Any paired device or cloud backup</div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 transition-all shrink-0" />
      </button>

      <div className="flex items-start gap-2 pt-1 px-1">
        <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Keys generated locally, encrypted by your passkey. OrahDEX never sees your seed phrase.
        </p>
      </div>

      {onViewSeed && (
        <button
          onClick={onViewSeed}
          className="w-full flex items-center justify-center gap-2 py-2 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors border-t border-border/50 mt-1 pt-3"
        >
          <FileKey className="w-3.5 h-3.5" />
          View Seed Phrase (optional)
        </button>
      )}
    </div>
  );
}

/* ─── Import Wallet Panel ───────────────────────────────────────────────── */

function ImportPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [phrase, setPhrase] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;
  const isReady = wordCount === 12 || wordCount === 24;

  const handleImport = async () => {
    const { valid, words, error } = validateMnemonic(phrase);
    if (!valid) { setValidationError(error ?? "Invalid seed phrase."); return; }
    setLoading(true);
    try {
      const chains = await deriveAllAddresses(words);
      applyOrahWallet(chains.evm, chains);
      toast({ title: "Wallet imported", description: `${chains.evm.slice(0, 6)}…${chains.evm.slice(-4)} · BSV · BTC · ETH + more` });
      onDone();
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message || "Could not derive addresses.", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Textarea
          placeholder="Enter your 12 or 24 word seed phrase, separated by spaces…"
          className={`min-h-[108px] text-sm resize-none pr-10 font-mono leading-relaxed bg-muted/50 border-border placeholder:text-muted-foreground/40 focus-visible:ring-primary/40 transition-all ${validationError ? "border-destructive/60" : ""}`}
          style={!show ? { WebkitTextSecurity: "disc" } as any : undefined}
          value={phrase}
          onChange={e => { setPhrase(e.target.value); setValidationError(null); }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {validationError && (
        <div className="flex items-start gap-2 text-destructive text-[11px]">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{validationError}</span>
        </div>
      )}

      <div className="flex items-center px-0.5">
        <span className="text-[11px] text-muted-foreground">
          {wordCount > 0
            ? isReady
              ? <span className="flex items-center gap-1 text-primary font-medium"><CheckCircle2 className="w-3 h-3" />{wordCount} words — ready</span>
              : <span className="text-amber-500">{wordCount} / {wordCount < 12 ? 12 : 24} words</span>
            : <span>Enter your seed phrase above</span>
          }
        </span>
      </div>

      {wordCount > 0 && !isReady && (
        <div className="h-1 rounded-full bg-muted overflow-hidden -mt-1">
          <div
            className="h-full rounded-full bg-amber-500/60 transition-all duration-300"
            style={{ width: `${Math.min((wordCount / (wordCount < 12 ? 12 : 24)) * 100, 100)}%` }}
          />
        </div>
      )}

      <Button
        className="w-full h-[46px] gap-2 text-sm font-semibold rounded-xl mt-1"
        onClick={handleImport}
        disabled={!isReady || loading}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {loading ? "Deriving addresses…" : "Import Wallet"}
      </Button>

      <div className="flex items-start gap-2 px-1">
        <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Your phrase never leaves this device. All derivation runs locally in your browser.
        </p>
      </div>
    </div>
  );
}

/* ─── Create Wallet Panel ───────────────────────────────────────────────── */

function CreateWalletPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const supported = isPasskeySupported();

  const handleCreate = async () => {
    setLoading(true);
    try {
      const result = await registerPasskeyWallet("OrahDEX Wallet");
      applyOrahWallet(result.address, result.chains);
      toast({ title: "Wallet created!", description: `${result.address.slice(0, 6)}…${result.address.slice(-4)} · BSV, BTC, ETH, SOL + more` });
      onDone();
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (err?.name === "NotAllowedError" || msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort")) {
        toast({ title: "Cancelled", description: "Passkey creation was cancelled.", variant: "destructive" });
      } else {
        toast({ title: "Create failed", description: msg || "Could not create passkey wallet.", variant: "destructive" });
      }
    } finally { setLoading(false); }
  };

  if (!supported) return (
    <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>Passkeys are not supported in this browser. Try Chrome, Safari, or Edge on a device with biometrics.</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-4 flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
          <KeyRound className="w-7 h-7 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Create a new OrahDEX Wallet</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            Generates a 12-word seed phrase encrypted with your biometric.<br />
            Supports BSV · BTC · ETH · SOL · LTC · DOGE + more.
          </p>
        </div>
      </div>

      <Button
        className="w-full h-[46px] gap-2 text-sm font-semibold rounded-xl"
        onClick={handleCreate}
        disabled={loading}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {loading ? "Creating wallet…" : "Create with Face ID / Touch ID"}
      </Button>

      <div className="flex items-start gap-2 px-1">
        <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Your seed phrase is generated locally and encrypted by your passkey. OrahDEX never sees it.
        </p>
      </div>
    </div>
  );
}

/* ─── Seed Create Panel ─────────────────────────────────────────────────── */

type SeedStep = "backup" | "protect" | "biometric" | "pin-setup" | "pin-entry";

function SeedCreatePanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<SeedStep>("backup");
  const [words, setWords] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const mnemonicRef = useRef<string>("");

  useEffect(() => {
    const w = generateMnemonic(12);
    setWords(w);
    mnemonicRef.current = w.join(" ");
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(mnemonicRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const finishWithAddrs = (addrs: Awaited<ReturnType<typeof deriveAllAddresses>>) => {
    const chains: PasskeyChainAddresses = {
      evm: addrs.evm, sol: addrs.sol, btc: addrs.btc, bch: addrs.bch,
      bsv: addrs.bsv, tron: addrs.tron, xrp: addrs.xrp, ltc: addrs.ltc, doge: addrs.doge,
    };
    saveDerivedAddresses(addrs.evm, chains);
    applyOrahWallet(addrs.evm, chains);
  };

  /* ── Biometric ─────────────────────────────────────────────────────────── */
  const handleBiometric = async () => {
    setLoading(true);
    try {
      const addrs = await deriveAllAddresses(words);
      const { credentialId, prfSecret } = await createImportPasskey("OrahDEX Wallet");
      await storeWithPasskey({
        address: addrs.evm, secret: mnemonicRef.current,
        keyKind: "mnemonic", prfSecret, passkeyId: credentialId, label: "OrahDEX Wallet",
      });
      finishWithAddrs(addrs);
      toast({ title: "Wallet created!", description: `Face/Touch protected · ${addrs.evm.slice(0, 6)}…${addrs.evm.slice(-4)}` });
      onDone();
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort")) {
        toast({ title: "Cancelled", description: "Biometric authentication was cancelled.", variant: "destructive" });
      } else {
        toast({ title: "Failed", description: msg || "Could not create wallet.", variant: "destructive" });
      }
    } finally { setLoading(false); }
  };

  /* ── PIN helpers ───────────────────────────────────────────────────────── */
  const finishWithPin = async (pinVal: string) => {
    const addrs = await deriveAllAddresses(words);
    await storeWithPin({ address: addrs.evm, secret: mnemonicRef.current, keyKind: "mnemonic", pin: pinVal, label: "OrahDEX Wallet" });
    finishWithAddrs(addrs);
    toast({ title: "Wallet created!", description: `PIN protected · ${addrs.evm.slice(0, 6)}…${addrs.evm.slice(-4)}` });
    onDone();
  };

  const handlePinSetup = async () => {
    const v = validatePin(pin);
    if (!v.valid) { setPinError(v.error!); return; }
    if (pin !== pinConfirm) { setPinError("PINs do not match"); return; }
    setPinError(null);
    setLoading(true);
    try { await setPin(pin); await finishWithPin(pin); }
    catch (err: any) { setPinError(err?.message || "Could not set PIN"); }
    finally { setLoading(false); }
  };

  const handlePinEntry = async () => {
    setPinError(null);
    setLoading(true);
    try { await finishWithPin(pin); }
    catch (err: any) { setPinError(err?.message || "Incorrect PIN"); }
    finally { setLoading(false); }
  };

  /* ── Step: backup ──────────────────────────────────────────────────────── */
  if (step === "backup") return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-200/80 leading-relaxed">
          Write down these 12 words in order. They are the only way to recover your wallet.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {words.map((word, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2 py-1.5">
            <span className="text-[9px] text-muted-foreground/40 w-3.5 shrink-0 text-right">{i + 1}</span>
            <span className="text-[11px] font-mono font-semibold text-foreground truncate">{word}</span>
          </div>
        ))}
      </div>

      <button onClick={handleCopy} className="w-full flex items-center justify-center gap-2 py-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">
        {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Copied!" : "Copy seed phrase"}
      </button>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 accent-primary" />
        <span className="text-[11px] text-muted-foreground leading-relaxed">
          I've written down my seed phrase and stored it safely.
        </span>
      </label>

      <Button className="w-full h-[44px] gap-2 text-sm font-semibold rounded-xl" onClick={() => setStep("protect")} disabled={!confirmed || words.length === 0}>
        Choose Protection <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );

  /* ── Step: protect ─────────────────────────────────────────────────────── */
  if (step === "protect") return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground text-center pb-1">How should this wallet be protected?</p>

      <button onClick={() => setStep("biometric")} className="group w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all text-left">
        <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
          <Fingerprint className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">Face ID / Touch ID</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Biometric — no PIN to remember</div>
        </div>
        <ChevronRight className="w-4 h-4 text-primary/40 group-hover:text-primary/70 shrink-0" />
      </button>

      <button onClick={() => setStep(hasPin() ? "pin-entry" : "pin-setup")} className="group w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/20 transition-all text-left">
        <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center shrink-0">
          <KeyRound className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">PIN</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">6–10 digit code · works offline</div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/70 shrink-0" />
      </button>

      <button onClick={() => setStep("backup")} className="w-full text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1">← Back</button>
    </div>
  );

  /* ── Step: biometric ───────────────────────────────────────────────────── */
  if (step === "biometric") return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-3">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          {loading ? <Loader2 className="w-6 h-6 text-primary animate-spin" /> : <Fingerprint className="w-6 h-6 text-primary" />}
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">Biometric Protection</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            Your seed phrase will be encrypted and only unlockable with your biometric.
          </p>
        </div>
      </div>
      <Button className="w-full h-[44px] gap-2 text-sm font-semibold rounded-xl" onClick={handleBiometric} disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
        {loading ? "Waiting for biometric…" : "Authenticate & Create Wallet"}
      </Button>
      <button onClick={() => setStep("protect")} className="w-full text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1">← Back</button>
    </div>
  );

  /* ── Step: pin-setup (first time) ──────────────────────────────────────── */
  if (step === "pin-setup") return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">Create a PIN for this device. You'll use it every time you sign a transaction.</p>
      <input type="password" inputMode="numeric" maxLength={10} placeholder="New PIN (6–10 digits)"
        value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setPinError(null); }}
        className="w-full h-11 rounded-xl border border-border bg-muted/50 px-4 text-sm font-mono tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-primary/40" />
      <input type="password" inputMode="numeric" maxLength={10} placeholder="Confirm PIN"
        value={pinConfirm} onChange={e => { setPinConfirm(e.target.value.replace(/\D/g, "")); setPinError(null); }}
        className="w-full h-11 rounded-xl border border-border bg-muted/50 px-4 text-sm font-mono tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-primary/40" />
      {pinError && <div className="flex items-start gap-2 text-destructive text-[11px]"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{pinError}</span></div>}
      <Button className="w-full h-[44px] gap-2 text-sm font-semibold rounded-xl" onClick={handlePinSetup} disabled={loading || pin.length < 6}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        {loading ? "Creating wallet…" : "Set PIN & Create Wallet"}
      </Button>
      <button onClick={() => setStep("protect")} className="w-full text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1">← Back</button>
    </div>
  );

  /* ── Step: pin-entry (PIN already exists on device) ────────────────────── */
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">Enter your PIN to protect this wallet with your existing device PIN.</p>
      <input type="password" inputMode="numeric" maxLength={10} placeholder="Enter your PIN"
        value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setPinError(null); }}
        className="w-full h-11 rounded-xl border border-border bg-muted/50 px-4 text-sm font-mono tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-primary/40" />
      {pinError && <div className="flex items-start gap-2 text-destructive text-[11px]"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{pinError}</span></div>}
      <Button className="w-full h-[44px] gap-2 text-sm font-semibold rounded-xl" onClick={handlePinEntry} disabled={loading || pin.length < 6}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        {loading ? "Creating wallet…" : "Create Wallet"}
      </Button>
      <button onClick={() => setStep("protect")} className="w-full text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1">← Back</button>
    </div>
  );
}

/* ─── View Seed Phrase Panel ────────────────────────────────────────────── */

function ViewSeedPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const { address } = useWalletStore();
  const [loading, setLoading] = useState(false);
  const [words, setWords] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const handleReveal = async () => {
    if (!address) {
      toast({ title: "No wallet connected", description: "Connect your OrahDEX wallet first.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const secret = await revealPasskeyWalletSecret(address);
      const phraseWords = secret.trim().split(/\s+/);
      if (phraseWords.length < 12) {
        toast({ title: "Legacy wallet", description: "This wallet uses a raw private key, not a seed phrase.", variant: "destructive" });
      } else {
        setWords(phraseWords);
      }
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort")) {
        toast({ title: "Cancelled", description: "Authentication was cancelled.", variant: "destructive" });
      } else {
        toast({ title: "Could not reveal", description: msg || "Authentication failed.", variant: "destructive" });
      }
    } finally { setLoading(false); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(words.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied", description: "Seed phrase copied to clipboard." });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3.5">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-200/80 leading-relaxed">
          Never share your seed phrase with anyone. Anyone with these words can access your wallet permanently.
        </p>
      </div>

      {words.length === 0 ? (
        <Button
          className="w-full h-[46px] gap-2 text-sm font-semibold rounded-xl"
          onClick={handleReveal}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
          {loading ? "Authenticating…" : "Authenticate to Reveal"}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {words.map((word, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-2">
                <span className="text-[10px] text-muted-foreground/50 w-4 shrink-0 text-right">{i + 1}</span>
                <span className="text-xs font-mono font-medium text-foreground truncate">{word}</span>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            className="w-full h-[40px] gap-2 text-sm rounded-xl"
            onClick={handleCopy}
          >
            {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy Seed Phrase"}
          </Button>
          <button
            onClick={() => setWords([])}
            className="w-full text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1"
          >
            Hide phrase
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Hardware sub-panel header map ─────────────────────────────────────── */

const HW_META: Record<HWDevice, { emoji: string; title: string; description: string }> = {
  ledger:   { emoji: "🔲", title: "Ledger",           description: "USB WebHID — Chrome or Edge on desktop." },
  trezor:   { emoji: "🛡",  title: "Trezor",           description: "USB — Trezor popup works in all browsers." },
  keystone: { emoji: "🔳", title: "Keystone",          description: "Air-gapped — scan animated QR from device." },
  gridplus: { emoji: "⚡", title: "GridPlus Lattice1", description: "Wi-Fi — connects via the GridPlus relay." },
};

/* ─── Mobile QR Panel ──────────────────────────────────────────────────── */

function MobileQRPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [token,     setToken]     = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [status,    setStatus]    = useState<"loading" | "waiting" | "connected" | "expired" | "error">("loading");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createSession = useCallback(async () => {
    setStatus("loading");
    setToken(null);
    try {
      const res  = await fetch(`${API_BASE}/connect-session`, { method: "POST" });
      const data = await res.json() as { token: string; expiresAt: number };
      setToken(data.token);
      setExpiresAt(data.expiresAt);
      setStatus("waiting");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { createSession(); }, [createSession]);

  useEffect(() => {
    if (!token || status !== "waiting") return;

    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API_BASE}/connect-session/${token}`);
        if (res.status === 404) { setStatus("expired"); clearInterval(pollRef.current!); return; }
        const data = await res.json() as { status: string; address?: string; chain?: string; walletType?: string };
        if (data.status === "connected" && data.address) {
          clearInterval(pollRef.current!);
          setStatus("connected");
          const network = (data.chain ?? "BSV") === "BSV" ? "bsv" : "evm";
          useWalletStore.getState().connect({ address: data.address, provider: "mobile-qr", network });
          toast({ title: "Mobile wallet connected!", description: `${data.address.slice(0, 14)}…` });
          setTimeout(onDone, 1200);
        }
      } catch { /* ignore transient */ }
    }, 2000);

    const expireTimer = setTimeout(() => {
      clearInterval(pollRef.current!);
      setStatus("expired");
    }, Math.max(0, expiresAt - Date.now()));

    return () => { clearInterval(pollRef.current!); clearTimeout(expireTimer); };
  }, [token, status, expiresAt, onDone, toast]);

  const qrValue = token ? `orahdex://connect?token=${token}&expires=${expiresAt}` : "";
  const ttlSec  = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));

  return (
    <div className="px-6 py-5 flex flex-col items-center gap-4">

      {/* Loading */}
      {status === "loading" && (
        <div className="w-full flex flex-col items-center gap-3 py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Generating session…</p>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="w-full flex flex-col items-center gap-3 py-8">
          <WifiOff className="w-8 h-8 text-destructive" />
          <p className="text-sm text-muted-foreground text-center">Could not reach server.<br />Check your connection and try again.</p>
          <Button size="sm" variant="outline" onClick={createSession} className="gap-2">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </Button>
        </div>
      )}

      {/* Waiting — show QR */}
      {status === "waiting" && (
        <>
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            Open <span className="text-foreground font-semibold">OrahDEX</span> on your phone, tap the{" "}
            <QrCode className="inline w-3.5 h-3.5 mb-0.5 text-cyan-400" /> barcode icon, then scan this code.
          </p>

          <div className="relative p-3 rounded-2xl bg-white shadow-lg">
            <QRCodeSVG value={qrValue} size={192} bgColor="#ffffff" fgColor="#000000" level="M" />
            {/* Corner accent */}
            <div className="absolute inset-0 rounded-2xl ring-1 ring-border/30 pointer-events-none" />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Waiting for mobile scan… expires in {ttlSec}s
          </div>

          <div className="w-full rounded-xl bg-cyan-500/8 border border-cyan-500/20 px-4 py-3 flex items-start gap-2.5">
            <Smartphone className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Your mobile wallet address will be linked to this desktop session. No seed phrase is shared.
            </p>
          </div>
        </>
      )}

      {/* Connected */}
      {status === "connected" && (
        <div className="w-full flex flex-col items-center gap-3 py-8">
          <div className="w-14 h-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Check className="w-7 h-7 text-primary" strokeWidth={2.5} />
          </div>
          <p className="text-sm font-semibold text-foreground">Mobile wallet connected!</p>
          <p className="text-[11px] text-muted-foreground">Closing…</p>
        </div>
      )}

      {/* Expired */}
      {status === "expired" && (
        <div className="w-full flex flex-col items-center gap-3 py-8">
          <QrCode className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground text-center">Session expired. Generate a new code.</p>
          <Button size="sm" variant="outline" onClick={createSession} className="gap-2">
            <RefreshCw className="w-3.5 h-3.5" /> New Code
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── Main Dialog ───────────────────────────────────────────────────────── */

export function WalletChooserDialog() {
  const { isOpen, close, openEvm } = useWalletModalStore();
  const [tab, setTab] = useState<Tab>("choose");

  const handleClose = () => { setTab("choose"); close(); };
  const handleEvmClick = () => { handleClose(); setTimeout(() => openEvm(), 100); };
  const handleMobileQr = () => setTab("mobile-qr");
  const handleHWPick = (device: HWDevice) => setTab(device);

  const isDeviceTab = (t: Tab): t is HWDevice =>
    t === "ledger" || t === "trezor" || t === "keystone" || t === "gridplus";

  return (
    <Dialog open={isOpen} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent
        className="p-0 gap-0 bg-background border-border sm:max-w-[420px] overflow-hidden rounded-2xl shadow-2xl"
        style={{ backgroundImage: "radial-gradient(ellipse 70% 40% at 50% -5%, hsl(var(--primary) / 0.08) 0%, transparent 70%)" }}
      >
        <DialogTitle style={srOnly}>Connect Wallet</DialogTitle>
        <DialogDescription style={srOnly}>Choose how to connect your wallet to OrahDEX.</DialogDescription>

        {/* ══════════════════════════════════════
            CHOOSE PANEL
        ══════════════════════════════════════ */}
        {tab === "choose" && (
          <div className="flex flex-col">
            <div className="px-6 pt-7 pb-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground tracking-tight">Connect Wallet</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Choose how to connect to OrahDEX</p>
                </div>
              </div>

              <p className="text-[10px] font-semibold tracking-widest text-muted-foreground/50 uppercase mb-2.5">Wallet Options</p>

              <div className="space-y-2">
                <OptionCard
                  onClick={() => setTab("passkey")}
                  iconBg="bg-primary/10 border border-primary/20 group-hover:bg-primary/20 group-hover:border-primary/40"
                  icon={<Fingerprint className="w-5 h-5 text-primary" />}
                  title="OrahDEX Wallet"
                  sub="Create new · or use existing passkey · BSV · BTC · ETH · SOL + more"
                  badge={
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 tracking-wider">
                      NEW
                    </span>
                  }
                  featured
                />

                <OptionCard
                  onClick={() => setTab("seed-create")}
                  iconBg="bg-violet-500/10 border border-violet-500/20 group-hover:bg-violet-500/15 group-hover:border-violet-500/35"
                  icon={<FileKey className="w-5 h-5 text-violet-400" />}
                  title="Seed Phrase Wallet"
                  sub="12-word backup · protect with Face ID, Touch ID, or PIN"
                />

                <OptionCard
                  onClick={() => setTab("import")}
                  iconBg="bg-violet-500/10 border border-violet-500/20 group-hover:bg-violet-500/15 group-hover:border-violet-500/30"
                  icon={<Download className="w-5 h-5 text-violet-400" />}
                  title="Import Wallet"
                  sub="Seed phrase · 12 or 24 words · all chains"
                />

                <OptionCard
                  onClick={handleEvmClick}
                  iconBg="bg-blue-500/10 border border-blue-500/20 group-hover:bg-blue-500/15 group-hover:border-blue-500/30"
                  icon={<span className="text-xl leading-none text-blue-400">⟠</span>}
                  title="EVM Wallets"
                  sub="MetaMask · WalletConnect · Coinbase · Injected"
                  badge={
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 tracking-wider">
                      EVM
                    </span>
                  }
                />

                <OptionCard
                  onClick={() => setTab("hardware")}
                  iconBg="bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/15 group-hover:border-amber-500/30"
                  icon={<HardDrive className="w-5 h-5 text-amber-400" />}
                  title="Hardware Wallet"
                  sub="Ledger · Trezor · Keystone · GridPlus"
                />

                <OptionCard
                  onClick={handleMobileQr}
                  iconBg="bg-cyan-500/10 border border-cyan-500/20 group-hover:bg-cyan-500/15 group-hover:border-cyan-500/30"
                  icon={<QrCode className="w-5 h-5 text-cyan-400" />}
                  title="Connect via Mobile QR"
                  sub="Scan with your phone to link instantly"
                />
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-border flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-[11px] text-muted-foreground/70">
                Non-custodial · Your keys, your coins · End-to-end encrypted
              </p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            ORAHDEX WALLET (PASSKEY)
        ══════════════════════════════════════ */}
        {tab === "create-wallet" && (
          <>
            <SubHeader
              onBack={() => setTab("choose")}
              icon={<Plus className="w-5 h-5 text-emerald-400" />}
              title="Create Wallet"
              description="Generate a new passkey-protected multi-chain wallet"
            />
            <div className="px-6 py-5">
              <CreateWalletPanel onDone={handleClose} />
            </div>
          </>
        )}

        {tab === "seed-create" && (
          <>
            <SubHeader
              onBack={() => setTab("choose")}
              icon={<FileKey className="w-5 h-5 text-violet-400" />}
              title="Seed Phrase Wallet"
              description="Generate a 12-word backup · protect with Face ID, Touch ID, or PIN"
            />
            <div className="px-6 py-5">
              <SeedCreatePanel onDone={handleClose} />
            </div>
          </>
        )}

        {tab === "passkey" && (
          <>
            <SubHeader
              onBack={() => setTab("choose")}
              icon={<Fingerprint className="w-5 h-5 text-primary" />}
              title="Passkey Wallet"
              description="Non-custodial · secured by Face ID, Touch ID or Windows Hello"
            />
            <div className="px-6 py-5">
              <PasskeyPanel onDone={handleClose} onViewSeed={() => setTab("view-seed")} />
            </div>
          </>
        )}

        {tab === "view-seed" && (
          <>
            <SubHeader
              onBack={() => setTab("passkey")}
              icon={<FileKey className="w-5 h-5 text-amber-400" />}
              title="View Seed Phrase"
              description="Authenticate with your passkey to reveal your 12-word phrase"
            />
            <div className="px-6 py-5">
              <ViewSeedPanel onBack={() => setTab("passkey")} />
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            IMPORT WALLET
        ══════════════════════════════════════ */}
        {tab === "import" && (
          <>
            <SubHeader
              onBack={() => setTab("choose")}
              icon={<Download className="w-5 h-5 text-violet-400" />}
              title="Import Wallet"
              description="Restore from a 12 or 24-word BIP39 seed phrase · all chains"
            />
            <div className="px-6 py-5">
              <ImportPanel onDone={handleClose} />
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            HARDWARE CHOOSER
        ══════════════════════════════════════ */}
        {tab === "hardware" && (
          <>
            <SubHeader
              onBack={() => setTab("choose")}
              icon={<HardDrive className="w-5 h-5 text-amber-400" />}
              title="Hardware Wallet"
              description="Your private keys never leave the physical device"
            />
            <div className="px-6 py-5">
              <HardwareChooser onPick={handleHWPick} />
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            INDIVIDUAL DEVICE PANELS
        ══════════════════════════════════════ */}
        {isDeviceTab(tab) && (
          <>
            <SubHeader
              onBack={() => setTab("hardware")}
              icon={<span className="text-xl leading-none">{HW_META[tab].emoji}</span>}
              title={HW_META[tab].title}
              description={HW_META[tab].description}
            />
            <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
              {tab === "ledger"   && <LedgerPanel   onDone={handleClose} />}
              {tab === "trezor"   && <TrezorPanel   onDone={handleClose} />}
              {tab === "keystone" && <KeystonePanel onDone={handleClose} />}
              {tab === "gridplus" && <GridPlusPanel onDone={handleClose} />}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            MOBILE QR CONNECT
        ══════════════════════════════════════ */}
        {tab === "mobile-qr" && (
          <>
            <SubHeader
              onBack={() => setTab("choose")}
              icon={<QrCode className="w-5 h-5 text-cyan-400" />}
              title="Connect via Mobile QR"
              description="Scan the code below with the OrahDEX mobile app"
            />
            <MobileQRPanel onDone={handleClose} />
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
