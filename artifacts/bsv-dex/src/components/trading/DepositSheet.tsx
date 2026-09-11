/**
 * DepositSheet.tsx
 *
 * Deposit flow for external EVM wallets — guides the user through:
 *   1. Viewing their unique OrahDEX deposit address
 *   2. Sending ETH on-chain to that address
 *   3. Verifying the tx hash to credit their internal ledger
 */

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Copy, CheckCircle2, ExternalLink, Loader2,
  ArrowDownToLine, RefreshCw, AlertTriangle,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";

interface DepositInfo {
  depositAddress: string;
  chainId:        number;
  chainName:      string;
  nativeSymbol:   string;
  blockExplorer:  string;
  ledgerBalances: Record<string, string>;
}

interface VerifyResult {
  success:    boolean;
  asset:      string;
  amount:     number;
  newBalance: string;
  message:    string;
}

interface DepositSheetProps {
  open:            boolean;
  onClose:         () => void;
  walletAddress:   string;
  chainId?:        number;
  onCredited?:     (asset: string, amount: number) => void;
}

export function DepositSheet({
  open,
  onClose,
  walletAddress,
  chainId = 1,
  onCredited,
}: DepositSheetProps) {
  const { toast } = useToast();

  const [info,       setInfo]       = useState<DepositInfo | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [txHash,     setTxHash]     = useState("");
  const [verifying,  setVerifying]  = useState(false);
  const [verified,   setVerified]   = useState<VerifyResult | null>(null);
  const [verifyErr,  setVerifyErr]  = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);

  const loadDepositInfo = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const r = await fetch(
        `${API_BASE}/deposit/address?walletAddress=${encodeURIComponent(walletAddress)}&chainId=${chainId}`,
      );
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setInfo(data);
    } catch (err: any) {
      toast({ title: "Could not load deposit address", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [walletAddress, chainId, toast]);

  useEffect(() => {
    if (open) {
      setVerified(null);
      setVerifyErr(null);
      setTxHash("");
      loadDepositInfo();
    }
  }, [open, loadDepositInfo]);

  const copyAddress = () => {
    if (!info?.depositAddress) return;
    navigator.clipboard?.writeText(info.depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async () => {
    if (!txHash.startsWith("0x") || txHash.length < 10) {
      setVerifyErr("Please enter a valid transaction hash (starts with 0x…).");
      return;
    }
    setVerifying(true);
    setVerifyErr(null);
    setVerified(null);
    try {
      const r = await fetch(`${API_BASE}/deposit/verify`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress, txHash: txHash.trim(), chainId }),
      });
      const data = await r.json();
      if (!r.ok) {
        setVerifyErr(data.error ?? "Verification failed.");
        return;
      }
      setVerified(data);
      onCredited?.(data.asset, data.amount);
      // Reload deposit info to show updated balance
      loadDepositInfo();
    } catch (err: any) {
      setVerifyErr(err.message ?? "Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const depositAddress = info?.depositAddress;
  const nativeSym      = info?.nativeSymbol ?? "ETH";
  const ledgerBal      = info?.ledgerBalances?.[nativeSym] ?? "0";
  const explorerBase   = info?.blockExplorer ?? "https://etherscan.io";

  /** Build a safe explorer TX URL — only when the hash is a well-formed 0x-prefixed 64-hex-char string */
  function safeExplorerUrl(base: string, hash: string): string | undefined {
    if (/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      return `${base}/tx/${hash}`;
    }
    return undefined;
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ArrowDownToLine className="w-4 h-4 text-emerald-400" />
            Deposit {nativeSym} to OrahDEX
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !info ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Failed to load deposit address.
            <Button variant="ghost" size="sm" className="ml-2" onClick={loadDepositInfo}>Retry</Button>
          </div>
        ) : (
          <div className="space-y-5">

            {/* Current OrahDEX balance */}
            <div className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-muted/40">
              <span className="text-muted-foreground">OrahDEX balance</span>
              <span className="font-mono font-semibold">
                {parseFloat(ledgerBal) > 0
                  ? parseFloat(ledgerBal).toLocaleString("en-US", { maximumFractionDigits: 6 })
                  : "0.000000"}{" "}{nativeSym}
              </span>
            </div>

            {/* QR + address */}
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 rounded-xl bg-white shadow-sm">
                <QRCodeCanvas value={depositAddress!} size={144} />
              </div>
              <div className="w-full">
                <p className="text-xs text-muted-foreground mb-1">
                  Your OrahDEX deposit address ({info.chainName})
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-muted px-2 py-1.5 rounded-md truncate">
                    {depositAddress}
                  </code>
                  <button
                    type="button"
                    onClick={copyAddress}
                    className="p-1.5 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {copied
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <ol className="text-xs text-muted-foreground space-y-1.5 list-none">
              {[
                `Send ${nativeSym} from your wallet to the address above on ${info.chainName}.`,
                "Wait for the transaction to be confirmed (usually 1–3 minutes).",
                "Paste the transaction hash below and click Verify — your OrahDEX balance will be credited instantly.",
              ].map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground mt-px">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* TX verify */}
            {verified ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-400">{verified.message}</p>
                <a
                  href={safeExplorerUrl(explorerBase, txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  View on explorer <ExternalLink className="w-3 h-3" />
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => { setVerified(null); setTxHash(""); }}
                >
                  Verify another deposit
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Verify your deposit</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="0x… transaction hash"
                    value={txHash}
                    onChange={e => { setTxHash(e.target.value); setVerifyErr(null); }}
                    className="font-mono text-xs h-9"
                  />
                  <Button
                    size="sm"
                    className="shrink-0 h-9"
                    disabled={verifying || !txHash}
                    onClick={handleVerify}
                  >
                    {verifying
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />}
                    <span className="ml-1.5">Verify</span>
                  </Button>
                </div>
                {verifyErr && (
                  <div className={cn(
                    "flex items-start gap-2 px-2.5 py-2 rounded-lg text-xs",
                    "bg-red-500/10 border border-red-500/20 text-red-400",
                  )}>
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {verifyErr}
                  </div>
                )}
              </div>
            )}

            {/* Withdraw note */}
            <p className="text-[11px] text-muted-foreground/60 text-center">
              OrahDEX holds your deposit in custody. Withdraw anytime via the Portfolio page.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
