import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCustomChainStore } from "@/store/useCustomChainStore";
import { Network, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded?: (chainId: number) => void;
}

interface FormState {
  name: string;
  chainId: string;
  rpcUrl: string;
  symbol: string;
  nativeName: string;
  explorerUrl: string;
}

const EMPTY: FormState = { name: "", chainId: "", rpcUrl: "", symbol: "", nativeName: "", explorerUrl: "" };

async function probeRpc(url: string, chainId: number): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const json = await res.json();
    if (!json?.result) return false;
    const reported = parseInt(json.result, 16);
    return reported === chainId;
  } catch {
    return false;
  }
}

export function AddNetworkDialog({ open, onClose, onAdded }: Props) {
  const { toast } = useToast();
  const addChain = useCustomChainStore(s => s.add);
  const chains = useCustomChainStore(s => s.chains);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [probing, setProbing] = useState(false);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    setErrors(er => ({ ...er, [k]: undefined }));
  };

  const validate = (): boolean => {
    const errs: Partial<FormState> = {};
    if (!form.name.trim()) errs.name = "Required";
    const id = parseInt(form.chainId);
    if (!form.chainId.trim() || isNaN(id) || id <= 0) errs.chainId = "Must be a positive integer";
    else if (chains.find(c => c.id === id)) errs.chainId = "Chain ID already added";
    if (!form.rpcUrl.trim()) errs.rpcUrl = "Required";
    else {
      try { new URL(form.rpcUrl); } catch { errs.rpcUrl = "Invalid URL"; }
    }
    if (!form.symbol.trim()) errs.symbol = "Required";
    if (Object.keys(errs).length) { setErrors(errs); return false; }
    return true;
  };

  const handleAdd = async () => {
    if (!validate()) return;
    const chainId = parseInt(form.chainId);

    setProbing(true);
    try {
      const ok = await probeRpc(form.rpcUrl.trim(), chainId);
      if (!ok) {
        const confirmed = window.confirm(
          "The RPC did not confirm chain ID " + chainId + ". Add anyway?"
        );
        if (!confirmed) return;
      }
    } finally {
      setProbing(false);
    }

    const chain = addChain({
      id: chainId,
      name: form.name.trim(),
      symbol: form.symbol.trim().toUpperCase(),
      nativeName: form.nativeName.trim() || form.name.trim(),
      rpcUrl: form.rpcUrl.trim(),
      blockExplorerUrl: form.explorerUrl.trim(),
    });

    if (!chain) {
      toast({ title: "Already added", description: `Chain ID ${chainId} is already in your list.`, variant: "destructive" });
      return;
    }

    toast({ title: `${chain.name} added`, description: `Chain ID ${chainId} · ${chain.symbol}` });
    setForm(EMPTY);
    setErrors({});
    onAdded?.(chainId);
    onClose();
  };

  const handleClose = () => {
    if (probing) return;
    setForm(EMPTY);
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Network className="w-4 h-4 text-primary" />
            Add Custom Network
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Add any EVM-compatible chain by its chain ID and RPC endpoint.
            The RPC will be verified before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Network Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Network Name</Label>
            <Input
              value={form.name}
              onChange={set("name")}
              placeholder="e.g. ApeChain"
              className="h-9 text-sm"
              disabled={probing}
            />
            {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
          </div>

          {/* Chain ID + Symbol on one row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Chain ID</Label>
              <Input
                value={form.chainId}
                onChange={set("chainId")}
                placeholder="e.g. 33139"
                inputMode="numeric"
                className="h-9 text-sm"
                disabled={probing}
              />
              {errors.chainId && <p className="text-[11px] text-destructive">{errors.chainId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Token Symbol</Label>
              <Input
                value={form.symbol}
                onChange={set("symbol")}
                placeholder="e.g. APE"
                className="h-9 text-sm uppercase"
                disabled={probing}
              />
              {errors.symbol && <p className="text-[11px] text-destructive">{errors.symbol}</p>}
            </div>
          </div>

          {/* RPC URL */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">RPC URL</Label>
            <Input
              value={form.rpcUrl}
              onChange={set("rpcUrl")}
              placeholder="https://rpc.apechain.com/http"
              className="h-9 text-sm font-mono"
              disabled={probing}
            />
            {errors.rpcUrl && <p className="text-[11px] text-destructive">{errors.rpcUrl}</p>}
          </div>

          {/* Native Token Name (optional) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Native Token Name
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <Input
              value={form.nativeName}
              onChange={set("nativeName")}
              placeholder="e.g. ApeCoin"
              className="h-9 text-sm"
              disabled={probing}
            />
          </div>

          {/* Block Explorer (optional) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Block Explorer URL
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </Label>
            <Input
              value={form.explorerUrl}
              onChange={set("explorerUrl")}
              placeholder="https://explorer.apechain.com"
              className="h-9 text-sm font-mono"
              disabled={probing}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 h-9 text-sm" onClick={handleClose} disabled={probing}>
            Cancel
          </Button>
          <Button className="flex-1 h-9 text-sm gap-2" onClick={handleAdd} disabled={probing}>
            {probing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Verifying…
              </>
            ) : (
              "Add Network"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
