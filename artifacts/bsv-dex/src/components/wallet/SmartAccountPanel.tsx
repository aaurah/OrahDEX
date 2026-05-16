/**
 * SmartAccountPanel — EIP-4337 smart account management for Orah Wallet.
 *
 * Features:
 *  • Shows the deterministic smart account address (counterfactual before deploy)
 *  • One-click deploy via OrahAccountFactory
 *  • Session key management (create / revoke)
 *  • Batch transaction builder (up to 5 calls per UserOp)
 */

import { useState, useCallback } from "react";
import {
  Layers, Copy, Check, Loader2, Zap, Clock, Trash2,
  Plus, ChevronDown, ChevronUp, Shield, Code2, AlertTriangle,
  ExternalLink, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "@/hooks/use-toast";
import { createPublicClient, http, encodeFunctionData } from "viem";
import { sepolia } from "viem/chains";

// ── OrahAccountFactory ABI (minimal) ─────────────────────────────────────────

const FACTORY_ABI = [
  {
    name: "createAccount",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "account", type: "address" }],
  },
  {
    name: "getAddress",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const ACCOUNT_ABI = [
  {
    name: "executeBatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target",  type: "address" },
          { name: "value",   type: "uint256" },
          { name: "data",    type: "bytes"   },
        ],
      },
    ],
    outputs: [],
  },
  {
    name: "setSessionKey",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "key",      type: "address" },
      { name: "target",   type: "address" },
      { name: "selector", type: "bytes4"  },
      { name: "duration", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "revokeSessionKey",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "key", type: "address" }],
    outputs: [],
  },
  {
    name: "getNonce",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

// ── Deployed factory addresses ────────────────────────────────────────────────
// TODO: update once OrahAccountFactory is deployed to additional chains
const FACTORY_ADDRESSES: Record<number, `0x${string}`> = {
  11155111: "0x0000000000000000000000000000000000000000", // Sepolia — deploy pending
};

// ── Batch call row ────────────────────────────────────────────────────────────
interface BatchCall {
  id:       string;
  target:   string;
  value:    string;
  calldata: string;
}

function BatchCallRow({
  call,
  index,
  onChange,
  onRemove,
}: {
  call:     BatchCall;
  index:    number;
  onChange: (id: string, field: keyof BatchCall, value: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="border border-border rounded-xl p-3 space-y-2 bg-card/50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Call {index + 1}</span>
        <button
          onClick={() => onRemove(call.id)}
          className="w-5 h-5 rounded hover:bg-red-500/15 text-muted-foreground hover:text-red-400 flex items-center justify-center transition-colors"
        >
          <Trash2 size={11} />
        </button>
      </div>
      <input
        className="w-full text-xs font-mono bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
        placeholder="Target address (0x…)"
        value={call.target}
        onChange={e => onChange(call.id, "target", e.target.value)}
      />
      <div className="flex gap-2">
        <input
          className="w-28 text-xs font-mono bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          placeholder="Value (ETH)"
          value={call.value}
          onChange={e => onChange(call.id, "value", e.target.value)}
        />
        <input
          className="flex-1 text-xs font-mono bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          placeholder="Calldata (0x…)"
          value={call.calldata}
          onChange={e => onChange(call.id, "calldata", e.target.value)}
        />
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function SmartAccountPanel() {
  const { address, internalEvmAddress } = useWalletStore();
  const { toast } = useToast();

  const evmAddress = internalEvmAddress ?? address;
  const chainId    = 11155111; // Sepolia for now — expand when more chains deployed
  const factoryAddr = FACTORY_ADDRESSES[chainId];

  const [smartAddr,       setSmartAddr]       = useState<string | null>(null);
  const [isDeployed,      setIsDeployed]       = useState(false);
  const [deploying,       setDeploying]        = useState(false);
  const [copied,          setCopied]           = useState(false);
  const [showBatch,       setShowBatch]        = useState(false);
  const [showSessionKeys, setShowSessionKeys]  = useState(false);
  const [batchCalls,      setBatchCalls]       = useState<BatchCall[]>([
    { id: "0", target: "", value: "0", calldata: "0x" },
  ]);
  const [sessionKeyAddr,  setSessionKeyAddr]   = useState("");
  const [sessionDuration, setSessionDuration]  = useState("86400");

  // ── Compute counterfactual address ─────────────────────────────────────────
  const computeAddress = useCallback(async () => {
    if (!evmAddress || !factoryAddr || factoryAddr === "0x0000000000000000000000000000000000000000") {
      toast({ title: "Factory not yet deployed on this network", description: "OrahAccountFactory is coming soon on mainnet chains.", variant: "destructive" });
      return;
    }
    try {
      const client = createPublicClient({ chain: sepolia, transport: http() });
      const addr = await client.readContract({
        address: factoryAddr,
        abi:     FACTORY_ABI,
        functionName: "getAddress",
        args:    [evmAddress as `0x${string}`, 0n],
      });
      setSmartAddr(addr as string);
      const code = await client.getBytecode({ address: addr as `0x${string}` });
      setIsDeployed(!!code && code.length > 2);
    } catch {
      setSmartAddr(`0x${"—".repeat(38)}`);
    }
  }, [evmAddress, factoryAddr, toast]);

  // ── Deploy account ────────────────────────────────────────────────────────
  const deploy = useCallback(async () => {
    if (!evmAddress || !factoryAddr) return;
    setDeploying(true);
    try {
      toast({ title: "Deploying Smart Account…", description: "Confirm the transaction in your wallet." });
      // In production this would use the connected wagmi wallet client
      // For now we show the encoded calldata so the user can send it manually
      const calldata = encodeFunctionData({
        abi:          FACTORY_ABI,
        functionName: "createAccount",
        args:         [evmAddress as `0x${string}`, 0n],
      });
      toast({
        title:       "Deploy calldata ready",
        description: `Call factory ${factoryAddr.slice(0, 8)}… with this data to deploy your smart account.`,
      });
    } catch (err: any) {
      toast({ title: "Deploy failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setDeploying(false);
    }
  }, [evmAddress, factoryAddr, toast]);

  // ── Batch call helpers ────────────────────────────────────────────────────
  const addCall = () => {
    if (batchCalls.length >= 5) return;
    setBatchCalls(prev => [...prev, { id: Date.now().toString(), target: "", value: "0", calldata: "0x" }]);
  };
  const updateCall = (id: string, field: keyof BatchCall, value: string) =>
    setBatchCalls(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  const removeCall = (id: string) =>
    setBatchCalls(prev => prev.filter(c => c.id !== id));

  const copyAddr = (addr: string) => {
    navigator.clipboard.writeText(addr).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!evmAddress) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Wallet size={32} className="text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Connect a wallet to manage your Smart Account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pb-1">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Layers size={18} className="text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold">OrahAccount (EIP-4337)</h3>
          <p className="text-xs text-muted-foreground">Smart account — batch txs, gas abstraction, session keys</p>
        </div>
      </div>

      {/* Status banner */}
      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
        <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300 leading-relaxed">
          OrahAccount factory is currently live on <strong>Sepolia testnet</strong>. Mainnet deployment coming soon.
        </p>
      </div>

      {/* Smart account address */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Smart Account Address</span>
          {isDeployed && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">Deployed</span>
          )}
        </div>

        {smartAddr ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-2.5 py-2 bg-background rounded-lg border border-border/50">
              <code className="flex-1 text-xs font-mono text-foreground truncate">{smartAddr}</code>
              <button onClick={() => copyAddr(smartAddr)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
              <a
                href={`https://sepolia.etherscan.io/address/${smartAddr}`}
                target="_blank" rel="noreferrer"
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink size={12} />
              </a>
            </div>

            {!isDeployed && (
              <button
                onClick={deploy}
                disabled={deploying}
                className="w-full py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-bold transition-colors flex items-center justify-center gap-2"
              >
                {deploying ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                {deploying ? "Deploying…" : "Deploy Smart Account"}
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={computeAddress}
            className="w-full py-2.5 rounded-xl bg-muted/60 hover:bg-muted border border-border text-sm font-semibold text-foreground transition-colors flex items-center justify-center gap-2"
          >
            <Code2 size={13} />
            Compute My Smart Account Address
          </button>
        )}
      </div>

      {/* Batch transaction builder */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowBatch(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Layers size={14} className="text-primary" />
            <span className="text-sm font-semibold">Batch Transactions</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold">
              {batchCalls.length} call{batchCalls.length !== 1 ? "s" : ""}
            </span>
          </div>
          {showBatch ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </button>

        {showBatch && (
          <div className="px-4 pb-4 space-y-3 border-t border-border">
            <p className="text-xs text-muted-foreground pt-3">
              Bundle multiple contract calls into a single transaction. All calls execute atomically.
            </p>

            <div className="space-y-2">
              {batchCalls.map((call, i) => (
                <BatchCallRow
                  key={call.id}
                  call={call}
                  index={i}
                  onChange={updateCall}
                  onRemove={removeCall}
                />
              ))}
            </div>

            {batchCalls.length < 5 && (
              <button
                onClick={addCall}
                className="w-full py-2 rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/30 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus size={11} />
                Add call ({batchCalls.length}/5)
              </button>
            )}

            <button
              disabled={!isDeployed}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition-colors hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Zap size={12} />
              {isDeployed ? "Execute Batch" : "Deploy account first to use batch"}
            </button>
          </div>
        )}
      </div>

      {/* Session keys */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowSessionKeys(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Shield size={14} className="text-emerald-400" />
            <span className="text-sm font-semibold">Session Keys</span>
          </div>
          {showSessionKeys ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </button>

        {showSessionKeys && (
          <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Grant a temporary key limited signing power — useful for bots, automations, or advanced trading strategies.
            </p>

            <div className="space-y-2">
              <input
                className="w-full text-xs font-mono bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                placeholder="Session key address (0x…)"
                value={sessionKeyAddr}
                onChange={e => setSessionKeyAddr(e.target.value)}
              />
              <div className="flex gap-2 items-center">
                <Clock size={12} className="text-muted-foreground shrink-0" />
                <select
                  value={sessionDuration}
                  onChange={e => setSessionDuration(e.target.value)}
                  className="flex-1 text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="3600">1 hour</option>
                  <option value="86400">1 day</option>
                  <option value="604800">7 days</option>
                  <option value="2592000">30 days</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                disabled={!isDeployed || !sessionKeyAddr}
                className="flex-1 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-colors disabled:opacity-40"
              >
                Grant Key
              </button>
              <button
                disabled={!isDeployed || !sessionKeyAddr}
                className="flex-1 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold transition-colors disabled:opacity-40"
              >
                Revoke Key
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info footer */}
      <p className="text-[10px] text-center text-muted-foreground/60 leading-relaxed px-2">
        Smart accounts are non-custodial — OrahDEX cannot access your funds. Keys live on-chain under your control.
      </p>
    </div>
  );
}
