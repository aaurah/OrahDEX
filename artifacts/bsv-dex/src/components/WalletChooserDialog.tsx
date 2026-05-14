import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { Fingerprint, Loader2, Plus, LogIn, Shield, KeyRound, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useWalletStore } from "@/store/useWalletStore";
import {
  registerPasskeyWallet,
  loginWithPasskey,
  isPasskeySupported,
  type PasskeyChainAddresses,
} from "@/lib/passkeyWallet";

type Tab = "choose" | "passkey";

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

              {/* OrahDEX Wallet */}
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
            </div>
          </>
        )}

        {tab === "passkey" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTab("choose")}
                  className="text-muted-foreground hover:text-foreground transition-colors text-xs"
                >
                  ← Back
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
      </DialogContent>
    </Dialog>
  );
}
