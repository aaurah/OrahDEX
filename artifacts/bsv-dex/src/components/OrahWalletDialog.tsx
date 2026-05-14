import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useWalletStore } from "@/store/useWalletStore";
import {
  registerPasskeyWallet,
  loginWithPasskey,
  isPasskeySupported,
  type PasskeyChainAddresses,
} from "@/lib/passkeyWallet";
import { Fingerprint, Plus, LogIn, Shield, Loader2, AlertCircle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

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

export function OrahWalletDialog({ open, onClose }: Props) {
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
        description: `${result.address.slice(0, 6)}…${result.address.slice(-4)} · BSV, BTC, ETH, SOL + 6 more chains ready`,
      });
      onClose();
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
      onClose();
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort")) {
        toast({ title: "Cancelled", description: "Passkey login was cancelled.", variant: "destructive" });
      } else if (msg.startsWith("WALLET_NOT_FOUND:")) {
        toast({
          title: "No wallet found",
          description: "No passkey wallet exists on this device. Create one first.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Login failed", description: msg || "Could not authenticate with passkey.", variant: "destructive" });
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !loading) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Fingerprint className="w-5 h-5 text-primary" />
            OrahDEX Wallet
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Non-custodial multi-chain wallet — BSV, BTC, ETH, SOL, LTC, DOGE, XRP, TRON & more.
            Secured by Face ID, Touch ID, or Windows Hello.
          </DialogDescription>
        </DialogHeader>

        {!supported && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Passkeys are not supported in this browser. Try Chrome, Safari, or Edge on a device with biometrics.</span>
          </div>
        )}

        <div className="space-y-2.5 py-1">
          <Button
            className="w-full h-[52px] gap-3 text-sm justify-start px-4"
            onClick={handleCreate}
            disabled={!!loading || !supported}
          >
            {loading === "create"
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Plus className="w-4 h-4 shrink-0" />}
            <span className="flex-1 text-left">Create New Wallet</span>
            <span className="text-[10px] opacity-60 shrink-0">Face ID · Touch ID</span>
          </Button>

          <Button
            variant="outline"
            className="w-full h-[52px] gap-3 text-sm justify-start px-4"
            onClick={handleLogin}
            disabled={!!loading || !supported}
          >
            {loading === "login"
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <LogIn className="w-4 h-4 shrink-0" />}
            <span className="flex-1 text-left">Use Existing Passkey</span>
            <span className="text-[10px] opacity-60 shrink-0">Any device</span>
          </Button>
        </div>

        <div className="flex items-start gap-1.5 border-t pt-3 mt-1">
          <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-500" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Your private keys are generated locally and encrypted by your passkey.
            OrahDEX never sees your seed phrase or private key.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
