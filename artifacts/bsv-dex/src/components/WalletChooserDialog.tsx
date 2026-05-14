import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { Fingerprint, Loader2, Plus, LogIn, Shield, KeyRound, AlertCircle, Download, ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useWalletStore } from "@/store/useWalletStore";
import {
  registerPasskeyWallet,
  loginWithPasskey,
  isPasskeySupported,
  type PasskeyChainAddresses,
} from "@/lib/passkeyWallet";
import { validateMnemonic, deriveAllAddresses } from "@/lib/seedPhrase";

type Tab = "choose" | "passkey" | "import";

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

/* ─── Passkey Panel ─────────────────────────────────────────────────────────── */

function PasskeyPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<"create" | "login" | null>(null);
  const supported = isPasskeySupported();

  const handleCreate = async () => {
    setLoading("create");
    try {
      const result = await registerPasskeyWallet("OrahDEX Wallet");
      applyOrahWallet(result.address, result.chains);
      toast({
        title: "Passkey wallet created",
        description: `${result.address.slice(0, 6)}…${result.address.slice(-4)} · BSV, BTC, ETH, SOL + more`,
      });
      onDone();
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (err?.name === "NotAllowedError" || msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort")) {
        toast({ title: "Cancelled", description: "Passkey creation was cancelled.", variant: "destructive" });
      } else {
        toast({ title: "Create failed", description: msg || "Could not create passkey wallet.", variant: "destructive" });
      }
    } finally {
      setLoading(null);
    }
  };

  const handleLogin = async () => {
    setLoading("login");
    try {
      const result = await loginWithPasskey();
      applyOrahWallet(result.address, result.chains);
      toast({
        title: result.restoredFromBackup ? "Wallet restored" : `Welcome back${result.label ? ` · ${result.label}` : ""}`,
        description: result.restoredFromBackup
          ? "Restored from cloud backup — all chains available"
          : `${result.address.slice(0, 6)}…${result.address.slice(-4)}`,
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
    } finally {
      setLoading(null);
    }
  };

  if (!supported) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive mt-2">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Passkeys are not supported in this browser. Try Chrome, Safari, or Edge on a device with biometrics.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 mt-2">
      <Button
        className="w-full h-[52px] gap-3 justify-start px-4 text-sm"
        onClick={handleCreate}
        disabled={!!loading}
      >
        {loading === "create" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 shrink-0" />}
        <span className="flex-1 text-left">Create New Wallet</span>
        <span className="text-[10px] opacity-60 shrink-0">Face ID · Touch ID</span>
      </Button>
      <Button
        variant="outline"
        className="w-full h-[52px] gap-3 justify-start px-4 text-sm"
        onClick={handleLogin}
        disabled={!!loading}
      >
        {loading === "login" ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4 shrink-0" />}
        <span className="flex-1 text-left">Use Existing Passkey</span>
        <span className="text-[10px] opacity-60 shrink-0">Any device</span>
      </Button>
      <div className="flex items-start gap-1.5 pt-1">
        <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-500" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Keys generated locally, encrypted by your passkey. OrahDEX never sees your seed phrase.
        </p>
      </div>
    </div>
  );
}

/* ─── Import Wallet Panel ───────────────────────────────────────────────────── */

function ImportPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [phrase, setPhrase] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;
  const isReady = wordCount === 12 || wordCount === 24;

  const handleChange = (v: string) => {
    setPhrase(v);
    setValidationError(null);
  };

  const handleImport = async () => {
    const { valid, words, error } = validateMnemonic(phrase);
    if (!valid) {
      setValidationError(error ?? "Invalid seed phrase.");
      return;
    }
    setLoading(true);
    try {
      const chains = await deriveAllAddresses(words);
      applyOrahWallet(chains.evm, chains);
      toast({
        title: "Wallet imported",
        description: `${chains.evm.slice(0, 6)}…${chains.evm.slice(-4)} · BSV · BTC · ETH · SOL + more`,
      });
      onDone();
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.message || "Could not derive addresses.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 mt-2">
      <div className="relative">
        <Textarea
          placeholder="Enter your 12 or 24 word seed phrase, separated by spaces…"
          className={`min-h-[100px] text-sm resize-none pr-10 font-mono leading-relaxed ${!show ? "text-security" : ""} ${validationError ? "border-destructive" : ""}`}
          style={!show ? { WebkitTextSecurity: "disc" } as any : undefined}
          value={phrase}
          onChange={e => handleChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
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

      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
        <span>
          {wordCount > 0
            ? isReady
              ? <span className="flex items-center gap-1 text-green-500"><CheckCircle2 className="w-3 h-3" />{wordCount} words</span>
              : `${wordCount} words · need 12 or 24`
            : "Words typed: 0"
          }
        </span>
      </div>

      <Button
        className="w-full h-[46px] gap-2 text-sm"
        onClick={handleImport}
        disabled={!isReady || loading}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {loading ? "Deriving addresses…" : "Import Wallet"}
      </Button>

      <div className="flex items-start gap-1.5 pt-0.5">
        <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Your seed phrase is never sent to any server. All derivation happens locally in your browser.
        </p>
      </div>
    </div>
  );
}

/* ─── Main Dialog ───────────────────────────────────────────────────────────── */

export function WalletChooserDialog() {
  const { isOpen, close, openEvm } = useWalletModalStore();
  const [tab, setTab] = useState<Tab>("choose");

  const handleClose = () => { setTab("choose"); close(); };

  const handleEvmClick = () => {
    handleClose();
    setTimeout(() => openEvm(), 100);
  };

  return (
    <Dialog open={isOpen} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-sm">

        {/* ── Choose ── */}
        {tab === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">Connect Wallet</DialogTitle>
              <DialogDescription className="text-xs">
                Choose how you want to connect to OrahDEX.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-1">
              {/* EVM wallets */}
              <button
                onClick={handleEvmClick}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors text-left"
              >
                <span className="text-2xl leading-none">⟠</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">EVM Wallets</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">MetaMask · WalletConnect · Coinbase · Injected</div>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">EVM</span>
              </button>

              {/* OrahDEX Wallet (passkey) */}
              <button
                onClick={() => setTab("passkey")}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left"
              >
                <Fingerprint className="w-6 h-6 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">OrahDEX Wallet</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Passkey · BSV · BTC · ETH · SOL · LTC · DOGE + more</div>
                </div>
                <KeyRound className="w-3.5 h-3.5 text-primary/60 shrink-0" />
              </button>

              {/* Import wallet */}
              <button
                onClick={() => setTab("import")}
                className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors text-left"
              >
                <Download className="w-6 h-6 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">Import Wallet</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Seed phrase · 12 or 24 words · all chains</div>
                </div>
              </button>
            </div>
          </>
        )}

        {/* ── Passkey ── */}
        {tab === "passkey" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTab("choose")}
                  className="text-muted-foreground hover:text-foreground transition-colors text-xs flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" /> Back
                </button>
              </div>
              <DialogTitle className="flex items-center gap-2 text-base mt-1">
                <Fingerprint className="w-5 h-5 text-primary" />
                OrahDEX Wallet
              </DialogTitle>
              <DialogDescription className="text-xs leading-relaxed">
                Non-custodial multi-chain wallet secured by Face ID, Touch ID, or Windows Hello.
              </DialogDescription>
            </DialogHeader>
            <PasskeyPanel onDone={handleClose} />
          </>
        )}

        {/* ── Import ── */}
        {tab === "import" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTab("choose")}
                  className="text-muted-foreground hover:text-foreground transition-colors text-xs flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" /> Back
                </button>
              </div>
              <DialogTitle className="flex items-center gap-2 text-base mt-1">
                <Download className="w-5 h-5 text-muted-foreground" />
                Import Wallet
              </DialogTitle>
              <DialogDescription className="text-xs leading-relaxed">
                Enter your 12 or 24-word seed phrase to restore your wallet across all chains.
              </DialogDescription>
            </DialogHeader>
            <ImportPanel onDone={handleClose} />
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
