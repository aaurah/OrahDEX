import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, Save, Copy, Check, AlertTriangle, ShieldCheck,
  ExternalLink, Info, DollarSign, Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const EVM_CHAINS = [
  { id: "eth",  label: "Ethereum (L1)",          chainId: 1,     explorer: "https://etherscan.io/address/" },
  { id: "bsc",  label: "BNB Smart Chain (L1)",   chainId: 56,    explorer: "https://bscscan.com/address/" },
  { id: "poly", label: "Polygon (L2)",            chainId: 137,   explorer: "https://polygonscan.com/address/" },
  { id: "arb",  label: "Arbitrum One (L2)",       chainId: 42161, explorer: "https://arbiscan.io/address/" },
  { id: "op",   label: "Optimism (L2)",           chainId: 10,    explorer: "https://optimistic.etherscan.io/address/" },
  { id: "base", label: "Base (L2)",               chainId: 8453,  explorer: "https://basescan.org/address/" },
  { id: "zk",   label: "zkSync Era (L3)",         chainId: 324,   explorer: "https://explorer.zksync.io/address/" },
  { id: "all",  label: "All EVM Chains",          chainId: 0,     explorer: "" },
];

type FeeConfig = {
  evmAddress: string;
  evmChain: string;
  bsvAddress: string;
  spotFeePercent: string;
  futuresFeePercent: string;
  withdrawFeePercent: string;
  feeEnabled: boolean;
};

const DEFAULTS: FeeConfig = {
  evmAddress: "",
  evmChain: "all",
  bsvAddress: "",
  spotFeePercent: "0.1",
  futuresFeePercent: "0.05",
  withdrawFeePercent: "0.05",
  feeEnabled: true,
};

function fetchFeeWallet(): Promise<FeeConfig> {
  return fetch(`${BASE}/api/admin/fee-wallet`).then(r => r.json()).then(d => ({
    ...DEFAULTS,
    ...d,
  })).catch(() => DEFAULTS);
}

function saveFeeWallet(cfg: FeeConfig): Promise<FeeConfig> {
  return fetch(`${BASE}/api/admin/fee-wallet`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  }).then(r => r.json());
}

export function AdminFeeWallet() {
  const qc = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["admin-fee-wallet"],
    queryFn: fetchFeeWallet,
  });

  const [form, setForm] = useState<FeeConfig | null>(null);
  const current = form ?? cfg ?? DEFAULTS;

  const set = (k: keyof FeeConfig, v: string | boolean) =>
    setForm(prev => ({ ...(prev ?? current), [k]: v }));

  const mutation = useMutation({
    mutationFn: saveFeeWallet,
    onSuccess: (data) => {
      qc.setQueryData(["admin-fee-wallet"], data);
      setForm(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const chainInfo = EVM_CHAINS.find(c => c.id === current.evmChain) ?? EVM_CHAINS[EVM_CHAINS.length - 1];

  const spotFeeNum = parseFloat(current.spotFeePercent) || 0;
  const futuresFeeNum = parseFloat(current.futuresFeePercent) || 0;
  const withdrawFeeNum = parseFloat(current.withdrawFeePercent) || 0;

  if (isLoading) return (
    <div className="p-8 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary" />
          Fee Wallet Configuration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Trade commissions and platform fees are sent directly to the wallets configured below.
          All funds go to your private addresses — never held by the platform.
        </p>
      </div>

      {/* Fee Enable Toggle */}
      <div className="flex items-center justify-between p-4 rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center",
            current.feeEnabled ? "bg-green-500/15" : "bg-muted/30")}>
            <DollarSign className={cn("w-5 h-5", current.feeEnabled ? "text-green-400" : "text-muted-foreground")} />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Fee Collection</p>
            <p className="text-xs text-muted-foreground">Collect platform fees on every trade and withdrawal</p>
          </div>
        </div>
        <button
          onClick={() => set("feeEnabled", !current.feeEnabled)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
            current.feeEnabled ? "bg-green-500" : "bg-muted"
          )}
        >
          <span className={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200",
            current.feeEnabled ? "translate-x-5" : "translate-x-0"
          )} />
        </button>
      </div>

      {/* EVM Wallet */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gradient-to-r from-blue-500/5 to-transparent">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <span className="text-base">🌐</span>
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">EVM Wallet (ETH / Layer 1 · 2 · 3)</p>
            <p className="text-xs text-muted-foreground">Receives fees from all EVM-chain trades</p>
          </div>
          <div className="ml-auto">
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
              EVM
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Chain selector */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">
              Receive On Chain
            </label>
            <div className="grid grid-cols-2 gap-2">
              {EVM_CHAINS.map(c => (
                <button
                  key={c.id}
                  onClick={() => set("evmChain", c.id)}
                  className={cn(
                    "py-2 px-3 rounded-xl text-xs font-medium border text-left transition-all",
                    current.evmChain === c.id
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                      : "border-border text-muted-foreground hover:border-blue-500/30 hover:text-foreground"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Address input */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">
              Your EVM Wallet Address
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={current.evmAddress}
                onChange={e => set("evmAddress", e.target.value)}
                placeholder="0x..."
                className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50 transition-colors"
              />
              {current.evmAddress && (
                <button
                  onClick={() => copy(current.evmAddress, "evm")}
                  className="px-3 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied === "evm" ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>
            {current.evmAddress && chainInfo.explorer && (
              <a
                href={`${chainInfo.explorer}${current.evmAddress}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 flex items-center gap-1 mt-1.5 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                View on {chainInfo.label} explorer
              </a>
            )}
          </div>
        </div>
      </div>

      {/* BSV Wallet */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gradient-to-r from-green-500/5 to-transparent">
          <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center">
            <span className="text-base">₿</span>
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">BSV Wallet (Bitcoin SV)</p>
            <p className="text-xs text-muted-foreground">Receives fees from all BSV on-chain trades</p>
          </div>
          <div className="ml-auto">
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
              BSV
            </span>
          </div>
        </div>

        <div className="p-5">
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">
            Your BSV Wallet Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={current.bsvAddress}
              onChange={e => set("bsvAddress", e.target.value)}
              placeholder="1BSV... or a BSV address"
              className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-green-500/50 transition-colors"
            />
            {current.bsvAddress && (
              <button
                onClick={() => copy(current.bsvAddress, "bsv")}
                className="px-3 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied === "bsv" ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
          </div>
          {current.bsvAddress && (
            <a
              href={`https://whatsonchain.com/address/${current.bsvAddress}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-green-400 flex items-center gap-1 mt-1.5 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              View on WhatsOnChain
            </a>
          )}
        </div>
      </div>

      {/* Fee Rates */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <Percent className="w-5 h-5 text-primary" />
          <p className="font-semibold text-foreground text-sm">Platform Fee Rates</p>
        </div>
        <div className="p-5 grid grid-cols-3 gap-4">
          {[
            { key: "spotFeePercent" as const, label: "Spot Trade Fee", suffix: "%" },
            { key: "futuresFeePercent" as const, label: "Futures Fee", suffix: "%" },
            { key: "withdrawFeePercent" as const, label: "Withdrawal Fee", suffix: "%" },
          ].map(({ key, label, suffix }) => (
            <div key={key}>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">{label}</label>
              <div className="flex items-center gap-2 bg-background border border-border rounded-xl overflow-hidden">
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.01"
                  value={current[key] as string}
                  onChange={e => set(key, e.target.value)}
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none w-0"
                />
                <span className="text-muted-foreground text-sm pr-3">{suffix}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Fee preview */}
        <div className="mx-5 mb-5 p-4 rounded-xl bg-muted/20 border border-border">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">Fee Preview — $10,000 trade</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Spot trade fee</span>
              <span className="text-foreground font-medium">${(10000 * spotFeeNum / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Futures trade fee</span>
              <span className="text-foreground font-medium">${(10000 * futuresFeeNum / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Withdrawal fee</span>
              <span className="text-foreground font-medium">${(10000 * withdrawFeeNum / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
          <p className="font-semibold text-foreground">Private & Non-Custodial</p>
          <p>Fee wallet addresses are stored securely on the platform server. Fees flow directly on-chain to your wallet — the platform never holds or pools them. Your private keys are never stored.</p>
        </div>
      </div>

      {/* Validation warnings */}
      {current.evmAddress && !/^0x[0-9a-fA-F]{40}$/.test(current.evmAddress) && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-green-500/30 bg-green-500/5 text-green-400 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          EVM address format looks incorrect. It should start with 0x and be 42 characters.
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={() => mutation.mutate(current)}
          disabled={mutation.isPending}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all",
            saved
              ? "bg-green-500/20 text-green-400 border border-green-500/30"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
          )}
        >
          {mutation.isPending ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : saved ? (
            <><Check className="w-4 h-4" /> Saved Successfully</>
          ) : (
            <><Save className="w-4 h-4" /> Save Fee Wallet Config</>
          )}
        </button>
      </div>
    </div>
  );
}
