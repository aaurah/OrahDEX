import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import {
  Fingerprint, Loader2, Plus, LogIn, Shield, AlertCircle,
  Download, ArrowLeft, Eye, EyeOff, CheckCircle2,
  HardDrive, ChevronRight, X, Wallet,
} from "lucide-react";
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
  | "import"
  | "hardware"
  | "ledger"
  | "trezor"
  | "keystone"
  | "gridplus";

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

function PasskeyPanel({ onDone }: { onDone: () => void }) {
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

/* ─── Hardware sub-panel header map ─────────────────────────────────────── */

const HW_META: Record<HWDevice, { emoji: string; title: string; description: string }> = {
  ledger:   { emoji: "🔲", title: "Ledger",           description: "USB WebHID — Chrome or Edge on desktop." },
  trezor:   { emoji: "🛡",  title: "Trezor",           description: "USB — Trezor popup works in all browsers." },
  keystone: { emoji: "🔳", title: "Keystone",          description: "Air-gapped — scan animated QR from device." },
  gridplus: { emoji: "⚡", title: "GridPlus Lattice1", description: "Wi-Fi — connects via the GridPlus relay." },
};

/* ─── Main Dialog ───────────────────────────────────────────────────────── */

export function WalletChooserDialog() {
  const { isOpen, close, openEvm } = useWalletModalStore();
  const [tab, setTab] = useState<Tab>("choose");

  const handleClose = () => { setTab("choose"); close(); };
  const handleEvmClick = () => { handleClose(); setTimeout(() => openEvm(), 100); };
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

        {/* ── Close button ── */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>

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
                  onClick={() => setTab("passkey")}
                  iconBg="bg-primary/10 border border-primary/20 group-hover:bg-primary/20 group-hover:border-primary/40"
                  icon={<Fingerprint className="w-5 h-5 text-primary" />}
                  title="OrahDEX Wallet"
                  sub="Passkey · BSV · BTC · ETH · SOL · LTC · DOGE + more"
                  badge={
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 tracking-wider">
                      NEW
                    </span>
                  }
                  featured
                />

                <OptionCard
                  onClick={() => setTab("hardware")}
                  iconBg="bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/15 group-hover:border-amber-500/30"
                  icon={<HardDrive className="w-5 h-5 text-amber-400" />}
                  title="Hardware Wallet"
                  sub="Ledger · Trezor · Keystone · GridPlus"
                />

                <OptionCard
                  onClick={() => setTab("import")}
                  iconBg="bg-violet-500/10 border border-violet-500/20 group-hover:bg-violet-500/15 group-hover:border-violet-500/30"
                  icon={<Download className="w-5 h-5 text-violet-400" />}
                  title="Import Wallet"
                  sub="Seed phrase · 12 or 24 words · all chains"
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
        {tab === "passkey" && (
          <>
            <SubHeader
              onBack={() => setTab("choose")}
              icon={<Fingerprint className="w-5 h-5 text-primary" />}
              title="OrahDEX Wallet"
              description="Non-custodial · secured by Face ID, Touch ID or Windows Hello"
            />
            <div className="px-6 py-5">
              <PasskeyPanel onDone={handleClose} />
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

      </DialogContent>
    </Dialog>
  );
}
