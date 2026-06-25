/**
 * AdminContractBuilder — Contracts & New Coins admin page.
 *
 * Sections:
 *   1. ThirdWeb v5 status strip (SDK version, client, active account, Bridge)
 *   2. OrahDEXEscrow on-chain overview (all deployed chains, live balance checks)
 *   3. HTLC reference panel (cross-chain atomic swap contracts)
 *   4. Smart Account (EIP-4337) integration notes
 *   5. Deploy Contract wizard (token deployer + ThirdWeb EVM deploy path)
 *   6. Deployed-from-DB contract list
 */

import { adminFetch } from "@/lib/adminFetch";
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cpu, Plus, X, CheckCircle2, Clock, ExternalLink, Copy, Check, Zap,
  AlertTriangle, Shield, Lock, Layers, Activity, ChevronDown, ChevronUp,
  RefreshCw, Globe2, Wallet, GitBranch, Hash, Info, Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveAccount } from "thirdweb/react";
import { thirdwebClient } from "@/lib/thirdweb-client";
import { ESCROW_ADDRESSES, ESCROW_ABI, RELAYER_ADDRESS } from "@/lib/escrowConfig";
import { createPublicClient, http, formatEther } from "viem";

// ── Constants ─────────────────────────────────────────────────────────────────

const THIRDWEB_SDK_VERSION = "5.101.2";

const TOKEN_TYPES = [
  { id: "token",      label: "Fungible Token",       desc: "Standard ERC-20 / BSV-20 compatible token", icon: "💰" },
  { id: "governance", label: "Governance Token",      desc: "DAO voting & on-chain governance",           icon: "🏛️" },
  { id: "lp",         label: "Liquidity Pool Token",  desc: "LP share token for DEX pools",               icon: "💧" },
  { id: "nft",        label: "NFT Collection",        desc: "ERC-721 / ERC-1155 non-fungible tokens",     icon: "🖼️" },
  { id: "stablecoin", label: "Stablecoin",            desc: "USD-pegged or algorithmic stable token",     icon: "🔒" },
  { id: "escrow",     label: "Escrow Contract",       desc: "OrahDEXEscrow — lock/release EVM funds",     icon: "🔐" },
  { id: "htlc",       label: "HTLC Contract",         desc: "Hash time-locked cross-chain atomic swap",   icon: "⛓️" },
];

const NETWORKS = [
  { id: "BSV",         label: "BSV Mainnet",      chainId: null   },
  { id: "ETH",         label: "Ethereum",          chainId: 1      },
  { id: "BASE",        label: "Base",              chainId: 8453   },
  { id: "ARB",         label: "Arbitrum One",      chainId: 42161  },
  { id: "OP",          label: "Optimism",          chainId: 10     },
  { id: "POLY",        label: "Polygon",           chainId: 137    },
  { id: "BSC",         label: "BNB Chain",         chainId: 56     },
  { id: "AVAX",        label: "Avalanche C-Chain", chainId: 43114  },
  { id: "SEPOLIA",     label: "Sepolia (testnet)", chainId: 11155111 },
  { id: "BASE_SEP",    label: "Base Sepolia",      chainId: 84532  },
];

// All deployed escrow chains from escrowConfig
const ESCROW_CHAIN_META: Record<number, { name: string; explorer: string; testnet?: boolean }> = {
  1:        { name: "Ethereum",      explorer: "https://etherscan.io"                },
  10:       { name: "Optimism",      explorer: "https://optimistic.etherscan.io"     },
  56:       { name: "BNB Chain",     explorer: "https://bscscan.com"                 },
  130:      { name: "Unichain",      explorer: "https://uniscan.xyz"                 },
  137:      { name: "Polygon",       explorer: "https://polygonscan.com"             },
  324:      { name: "zkSync Era",    explorer: "https://explorer.zksync.io"          },
  1329:     { name: "Sei",           explorer: "https://seitrace.com"                },
  8453:     { name: "Base",          explorer: "https://basescan.org"                },
  42161:    { name: "Arbitrum",      explorer: "https://arbiscan.io"                 },
  43114:    { name: "Avalanche",     explorer: "https://snowtrace.io"                },
  59144:    { name: "Linea",         explorer: "https://lineascan.build"             },
  534352:   { name: "Scroll",        explorer: "https://scrollscan.com"              },
  11155111: { name: "Sepolia",       explorer: "https://sepolia.etherscan.io", testnet: true },
};

const RPC_URLS: Record<number, string> = {
  1:        "https://cloudflare-eth.com",
  10:       "https://mainnet.optimism.io",
  56:       "https://bsc-dataseed.binance.org",
  137:      "https://polygon-rpc.com",
  8453:     "https://mainnet.base.org",
  42161:    "https://arb1.arbitrum.io/rpc",
  43114:    "https://api.avax.network/ext/bc/C/rpc",
  59144:    "https://rpc.linea.build",
  534352:   "https://rpc.scroll.io",
  11155111: "https://rpc.sepolia.org",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortenAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function explorerAddr(chainId: number, addr: string) {
  const meta = ESCROW_CHAIN_META[chainId];
  return meta ? `${meta.explorer}/address/${addr}` : `https://etherscan.io/address/${addr}`;
}

async function fetchEscrowBalance(chainId: number, addr: string): Promise<string | null> {
  const rpc = RPC_URLS[chainId];
  if (!rpc) return null;
  try {
    const client = createPublicClient({ transport: http(rpc), chain: { id: chainId, name: "", nativeCurrency: { name: "", symbol: "", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as any });
    const bal = await client.getBalance({ address: addr as `0x${string}` });
    return parseFloat(formatEther(bal)).toFixed(4);
  } catch {
    return null;
  }
}

async function checkContractDeployed(chainId: number, addr: string): Promise<boolean> {
  const rpc = RPC_URLS[chainId];
  if (!rpc) return true; // assume deployed if no RPC
  try {
    const client = createPublicClient({ transport: http(rpc), chain: { id: chainId, name: "", nativeCurrency: { name: "", symbol: "", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as any });
    const code = await client.getBytecode({ address: addr as `0x${string}` });
    return !!code && code.length > 2;
  } catch {
    return true;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
      ok
        ? "bg-green-500/10 text-green-400 border-green-500/25"
        : "bg-red-500/10 text-red-400 border-red-500/25"
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", ok ? "bg-green-400" : "bg-red-400")} />
      {label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5">
      {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
    </button>
  );
}

// ── ThirdWeb Status Panel ─────────────────────────────────────────────────────

function ThirdWebStatusPanel() {
  const account = useActiveAccount();
  const clientIdSet = !!import.meta.env.VITE_THIRDWEB_CLIENT_ID;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
          <Zap size={15} className="text-violet-400" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">ThirdWeb v5 Integration</h3>
          <p className="text-[11px] text-muted-foreground">SDK status, connected account &amp; service health</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">SDK Version</p>
          <p className="text-sm font-mono font-bold text-violet-400">v{THIRDWEB_SDK_VERSION}</p>
        </div>
        <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Client ID</p>
          <StatusBadge ok={clientIdSet} label={clientIdSet ? "Configured" : "Missing"} />
        </div>
        <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Active Account</p>
          {account ? (
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              <code className="text-[10px] font-mono text-foreground truncate">{shortenAddr(account.address)}</code>
              <CopyButton text={account.address} />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">Not connected</p>
          )}
        </div>
        <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Services</p>
          <div className="flex flex-wrap gap-1">
            <StatusBadge ok label="Bridge" />
            <StatusBadge ok label="Escrow" />
          </div>
        </div>
      </div>

      {/* ThirdWeb API capabilities list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
        {[
          ["Bridge.Buy.prepare/quote",    "Cross-chain token swaps",      true ],
          ["Bridge.tokens(chainId)",      "Live token lists per chain",   true ],
          ["sendTransaction(account,tx)", "EVM tx via ThirdWeb account",  true ],
          ["prepareTransaction",          "Escrow lock/cancel/release",   true ],
          ["waitForReceipt",              "Tx confirmation polling",       true ],
          ["defineChain(chainId)",        "Any EVM chain support",         true ],
          ["getContract + readContract",  "On-chain state queries",        true ],
          ["EIP-4337 Smart Accounts",     "OrahAccountFactory (Sepolia)",  false],
        ].map(([fn, desc, active]) => (
          <div key={fn as string} className="flex items-start gap-2">
            <span className={cn("mt-0.5 w-1.5 h-1.5 rounded-full shrink-0", active ? "bg-green-400" : "bg-amber-400")} />
            <div>
              <code className="font-mono text-foreground">{fn}</code>
              <span className="text-muted-foreground ml-1">— {desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Escrow Contract Row ───────────────────────────────────────────────────────

function EscrowContractRow({ chainId, address }: { chainId: number; address: string }) {
  const meta = ESCROW_CHAIN_META[chainId] ?? { name: `Chain ${chainId}`, explorer: "https://etherscan.io" };
  const [balance, setBalance] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [deployed, setDeployed] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    const [bal, dep] = await Promise.all([
      fetchEscrowBalance(chainId, address),
      checkContractDeployed(chainId, address),
    ]);
    setBalance(bal);
    setDeployed(dep);
    setChecking(false);
  }, [chainId, address]);

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0 flex-wrap sm:flex-nowrap">
      <div className="flex items-center gap-2 w-28 shrink-0">
        {meta.testnet && (
          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">TEST</span>
        )}
        <span className="text-xs font-semibold">{meta.name}</span>
      </div>

      <div className="flex items-center gap-1 flex-1 min-w-0">
        <code className="text-[11px] font-mono text-muted-foreground truncate">{address}</code>
        <CopyButton text={address} />
      </div>

      {deployed !== null && (
        <StatusBadge ok={deployed} label={deployed ? "Live" : "No code"} />
      )}

      {balance !== null && (
        <span className="text-[11px] font-mono text-cyan-400 shrink-0">{balance} ETH locked</span>
      )}

      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        <button
          onClick={check}
          disabled={checking}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw size={9} className={cn(checking && "animate-spin")} />
          {checking ? "Checking…" : "Ping"}
        </button>
        <a
          href={`${meta.explorer}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-muted-foreground hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
        >
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}

// ── Escrow Contracts Panel ────────────────────────────────────────────────────

function EscrowContractsPanel() {
  const [showAll, setShowAll] = useState(false);
  const entries = Object.entries(ESCROW_ADDRESSES).map(([id, addr]) => ({ chainId: Number(id), addr }));
  const mainnets = entries.filter(e => !ESCROW_CHAIN_META[e.chainId]?.testnet);
  const testnets = entries.filter(e => !!ESCROW_CHAIN_META[e.chainId]?.testnet);
  const visible = showAll ? entries : mainnets;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
            <Shield size={15} className="text-cyan-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">OrahDEXEscrow Contracts</h3>
            <p className="text-[11px] text-muted-foreground">{mainnets.length} mainnet + {testnets.length} testnet deployments</p>
          </div>
        </div>
        <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full">
          {entries.length} chains
        </span>
      </div>

      {/* ABI summary */}
      <div className="bg-secondary/40 rounded-xl p-3 space-y-1">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Contract Interface</p>
        {[
          "lockETH(bytes32 orderId) payable",
          "lockERC20(bytes32 orderId, address token, uint256 amount)",
          "release(bytes32 orderId, address recipient)  ← relayer only",
          "cancel(bytes32 orderId)",
          "getDeposit(bytes32 orderId) view → (depositor, token, amount, lockedAt, released)",
          "getDepositorOrders(address) view → bytes32[]",
        ].map(fn => (
          <code key={fn} className="block text-[10px] font-mono text-foreground/70">{fn}</code>
        ))}
      </div>

      {/* Relayer address */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/5 border border-violet-500/15">
        <Globe2 size={12} className="text-violet-400 shrink-0" />
        <span className="text-[10px] text-muted-foreground">Relayer:</span>
        <code className="text-[10px] font-mono text-violet-300 truncate flex-1">{RELAYER_ADDRESS}</code>
        <CopyButton text={RELAYER_ADDRESS} />
      </div>

      {/* Deployed chains list */}
      <div>
        {visible.map(e => (
          <EscrowContractRow key={e.chainId} chainId={e.chainId} address={e.addr} />
        ))}
      </div>

      {testnets.length > 0 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full text-[11px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-1.5 transition-colors"
        >
          {showAll ? <><ChevronUp size={12} /> Hide testnets</> : <><ChevronDown size={12} /> Show testnets ({testnets.length})</>}
        </button>
      )}
    </div>
  );
}

// ── HTLC Panel ────────────────────────────────────────────────────────────────

function HtlcPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <GitBranch size={15} className="text-emerald-400" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-sm">OrahDEXHTLC — Cross-Chain Atomic Swaps</h3>
            <p className="text-[11px] text-muted-foreground">SHA-256 HTLC for BSV ↔ EVM atomic settlement</p>
          </div>
        </div>
        {open ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border">
          <p className="text-xs text-muted-foreground pt-3 leading-relaxed">
            OrahDEXHTLC enables trustless cross-chain trading between BSV and EVM networks.
            The maker locks funds with a SHA-256 hash; the taker must reveal the pre-image within
            the timelock window to claim. If the timelock expires, the maker can refund.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { name: "lockETH(bytes32 hashlock, uint256 timelock) payable", desc: "Lock native ETH with hash + timelock" },
              { name: "lockToken(bytes32 hashlock, uint256 timelock, address token, uint256 amount)", desc: "Lock ERC-20 tokens" },
              { name: "reveal(bytes32 lockId, bytes32 preimage)", desc: "Claim funds by revealing SHA-256 pre-image" },
              { name: "refund(bytes32 lockId)", desc: "Reclaim funds after timelock expiry" },
            ].map(fn => (
              <div key={fn.name} className="bg-secondary/40 rounded-xl p-3">
                <code className="text-[10px] font-mono text-foreground block mb-1 leading-snug">{fn.name}</code>
                <p className="text-[10px] text-muted-foreground">{fn.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2.5 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-300 leading-relaxed">
              HTLC contracts are referenced in <code className="font-mono">HtlcLockRecovery.tsx</code> and
              <code className="font-mono ml-1">HTLCSettlementCard.tsx</code>. The relayer coordinates
              hashlock reveal across chains. SHA-256 is used for BSV compatibility.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Smart Account Panel (info only) ──────────────────────────────────────────

function SmartAccountInfoPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <Layers size={15} className="text-primary" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-sm">EIP-4337 Smart Accounts (OrahAccount)</h3>
            <p className="text-[11px] text-muted-foreground">Batch txs · session keys · gas abstraction</p>
          </div>
        </div>
        {open ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
            {[
              { label: "Factory — Sepolia", value: "0x000…0000", note: "Deploy pending", warn: true },
              { label: "Factory — Mainnet", value: "Not deployed", note: "Coming soon", warn: true },
              { label: "ThirdWeb SDK", value: `v${THIRDWEB_SDK_VERSION}`, note: "EIP-4337 ready", warn: false },
            ].map(item => (
              <div key={item.label} className={cn(
                "rounded-xl p-3 border",
                item.warn
                  ? "bg-amber-500/5 border-amber-500/20"
                  : "bg-secondary/40 border-border",
              )}>
                <p className={cn("font-medium text-[10px] mb-1 uppercase tracking-wider", item.warn ? "text-amber-400" : "text-muted-foreground")}>{item.label}</p>
                <code className="font-mono text-xs font-bold text-foreground">{item.value}</code>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.note}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Manage smart accounts from the <strong className="text-foreground">Wallet</strong> tab → Smart Account panel.
            The <code className="font-mono text-xs">OrahAccountFactory</code> supports <code className="font-mono text-xs">createAccount</code>,
            <code className="font-mono text-xs ml-1">getAddress</code>, batch <code className="font-mono text-xs">executeBatch</code>, and
            time-limited <code className="font-mono text-xs">setSessionKey / revokeSessionKey</code>.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Deploy Modal ──────────────────────────────────────────────────────────────

const INIT_FORM = {
  name: "", symbol: "", type: "token", network: "ETH",
  supply: "1000000000", decimals: "18",
  mintable: false, burnable: false, pausable: false,
  description: "",
};

function DeployModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INIT_FORM);
  const qc = useQueryClient();

  const deploy = useMutation({
    mutationFn: (data: any) =>
      adminFetch(`/api/admin/contracts/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contracts"] });
      onClose();
    },
  });

  const selectedType   = TOKEN_TYPES.find(t => t.id === form.type);
  const selectedNet    = NETWORKS.find(n => n.id === form.network);
  const isEvmNet       = selectedNet?.chainId !== null;
  const isEscrowType   = form.type === "escrow" || form.type === "htlc";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="font-bold text-lg">Deploy Contract</h3>
            <div className="flex items-center gap-2 mt-1.5">
              {[1, 2, 3].map(s => (
                <div key={s} className={cn("h-1 w-12 rounded-full transition-all", step >= s ? "bg-primary" : "bg-secondary")} />
              ))}
              <span className="text-xs text-muted-foreground">Step {step} / 3</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/5"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step 1 — Contract type */}
          {step === 1 && (
            <div className="space-y-2.5">
              <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Choose Contract Type</h4>
              {TOKEN_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setForm(f => ({ ...f, type: t.id }))}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                    form.type === t.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-white/[0.03]",
                  )}
                >
                  <span className="text-2xl shrink-0">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.desc}</div>
                  </div>
                  {form.type === t.id && <CheckCircle2 size={18} className="text-primary shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — Details */}
          {step === 2 && (
            <div className="space-y-4">
              <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Contract Details</h4>

              {isEscrowType ? (
                <div className="flex items-start gap-3 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                  <Info size={14} className="text-cyan-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-cyan-300 leading-relaxed space-y-1">
                    <p className="font-semibold">{selectedType?.label} — Pre-audited contract</p>
                    <p className="text-muted-foreground">
                      {form.type === "escrow"
                        ? "OrahDEXEscrow is already deployed across 13 chains. Deploying here registers a new instance for a custom chain."
                        : "OrahDEXHTLC enables atomic swaps. The relayer coordinates SHA-256 hashlock reveals across BSV and EVM."}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">
                    {isEscrowType ? "Label / Tag" : "Token Name"} *
                  </label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                    placeholder={isEscrowType ? "e.g. Ethereum Escrow v2" : "Orah Token"}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-1">
                    {isEscrowType ? "Tag" : "Symbol"} *
                  </label>
                  <input
                    value={form.symbol}
                    onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary font-mono"
                    placeholder={isEscrowType ? "ESC_ETH" : "ORAH"}
                    maxLength={10}
                  />
                </div>
                {!isEscrowType && (
                  <>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">Total Supply</label>
                      <input
                        type="number"
                        value={form.supply}
                        onChange={e => setForm(f => ({ ...f, supply: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">Decimals</label>
                      <input
                        type="number"
                        value={form.decimals}
                        onChange={e => setForm(f => ({ ...f, decimals: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                        min="0"
                        max="18"
                      />
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Network</label>
                <select
                  value={form.network}
                  onChange={e => setForm(f => ({ ...f, network: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                >
                  {NETWORKS.map(n => (
                    <option key={n.id} value={n.id}>{n.label}{n.chainId ? ` (chainId: ${n.chainId})` : ""}</option>
                  ))}
                </select>
              </div>

              {!isEscrowType && (
                <div>
                  <label className="text-xs text-muted-foreground font-medium block mb-2">Features</label>
                  <div className="flex gap-2 flex-wrap">
                    {(["mintable", "burnable", "pausable"] as const).map(key => (
                      <button
                        key={key}
                        onClick={() => setForm(f => ({ ...f, [key]: !f[key] }))}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-semibold border capitalize transition-all",
                          form[key]
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "border-border text-muted-foreground hover:border-primary/30",
                        )}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isEvmNet && (
                <div className="flex items-start gap-2.5 p-3 bg-violet-500/5 border border-violet-500/20 rounded-xl text-[11px]">
                  <Zap size={12} className="text-violet-400 shrink-0 mt-0.5" />
                  <div className="text-violet-300 leading-relaxed">
                    <strong>ThirdWeb SDK v5</strong> will be used to deploy this contract on-chain.
                    Connect a ThirdWeb wallet (or injected wallet) to sign the deploy transaction.
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
                  rows={3}
                  placeholder="Describe the purpose of this contract…"
                />
              </div>
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Review &amp; Deploy</h4>

              <div className="bg-secondary/40 rounded-xl p-4 space-y-2.5 font-mono text-sm">
                {([
                  ["Type",     selectedType?.label],
                  ["Name",     form.name],
                  ["Symbol",   form.symbol],
                  ["Network",  selectedNet?.label ?? form.network],
                  ...(!isEscrowType ? [
                    ["Supply",   Number(form.supply).toLocaleString()],
                    ["Decimals", form.decimals],
                    ["Features", [form.mintable && "Mintable", form.burnable && "Burnable", form.pausable && "Pausable"].filter(Boolean).join(", ") || "None"],
                  ] : []),
                ] as [string, string | undefined][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-semibold text-foreground">{v ?? "—"}</span>
                  </div>
                ))}
              </div>

              {isEvmNet && (
                <div className="flex items-center gap-2.5 p-3 bg-violet-500/5 border border-violet-500/20 rounded-xl text-[11px] text-violet-300">
                  <Zap size={12} className="text-violet-400 shrink-0" />
                  Deploy via <strong className="mx-1">ThirdWeb SDK v{THIRDWEB_SDK_VERSION}</strong> — your wallet will prompt to sign the deployment transaction.
                </div>
              )}

              <div className="flex items-start gap-3 p-4 bg-orange-400/5 border border-orange-400/20 rounded-xl">
                <AlertTriangle size={14} className="text-orange-400 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-400 leading-relaxed">
                  Contract deployment is irreversible. Verify all details before proceeding.
                  {isEvmNet && " Estimated gas: ~0.002–0.005 ETH depending on the chain."}
                  {!isEvmNet && " Estimated fee: ~0.00042 BSV."}
                </p>
              </div>

              {deploy.error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  {String((deploy.error as any)?.message ?? deploy.error)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-between shrink-0">
          <button
            onClick={() => (step > 1 ? setStep(s => s - 1) : onClose())}
            className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
          >
            {step > 1 ? "Back" : "Cancel"}
          </button>
          <button
            onClick={() => step < 3 ? setStep(s => s + 1) : deploy.mutate(form)}
            disabled={(step === 2 && (!form.name || !form.symbol)) || deploy.isPending}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-primary text-white text-sm font-semibold shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {deploy.isPending && <RefreshCw size={13} className="animate-spin" />}
            {step < 3 ? "Continue" : deploy.isPending ? "Deploying…" : "🚀 Deploy Now"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Deployed Contracts List ───────────────────────────────────────────────────

function DeployedContractsList() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["admin-contracts"],
    queryFn:  () => adminFetch(`/api/admin/contracts`).then(r => r.json()),
    staleTime: 0,
  });

  const copyAddr = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
        <Cpu size={15} className="text-primary" />
        Deployed Contracts (Registry)
      </h3>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-20 bg-secondary rounded-xl animate-pulse" />)}
        </div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No contracts in registry yet. Deploy one above.
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c: any) => (
            <div key={c.id} className="p-4 rounded-xl border border-border hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-sm">{c.name}</span>
                    <span className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded text-primary">{c.symbol}</span>
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                      c.status === "deployed" ? "bg-green-400/10 text-green-400" : "bg-orange-400/10 text-orange-400",
                    )}>
                      {c.status}
                    </span>
                    <span className="text-[10px] bg-blue-400/10 text-blue-400 px-1.5 py-0.5 rounded font-bold">{c.network}</span>
                  </div>

                  {c.address ? (
                    <div className="flex items-center gap-1.5">
                      <code className="text-xs font-mono text-muted-foreground truncate">{c.address}</code>
                      <button onClick={() => copyAddr(c.address, c.id)} className="text-muted-foreground hover:text-primary shrink-0">
                        {copiedId === c.id ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No on-chain address yet</p>
                  )}

                  <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-muted-foreground">
                    {c.supply && <span>Supply: {Number(c.supply).toLocaleString()}</span>}
                    {c.decimals !== undefined && <span>Decimals: {c.decimals}</span>}
                    {c.deployedAt && <span>Created: {c.deployedAt}</span>}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  {c.status === "deployed"
                    ? <CheckCircle2 size={18} className="text-green-400" />
                    : <Clock size={18} className="text-orange-400 animate-pulse" />
                  }
                  {c.address && (
                    <a
                      href={`https://etherscan.io/address/${c.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminContractBuilder() {
  const [showDeploy, setShowDeploy] = useState(false);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Contracts &amp; New Coins</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deploy smart contracts · manage escrow &amp; HTLC · ThirdWeb v5 integration
          </p>
        </div>
        <button
          onClick={() => setShowDeploy(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg hover:scale-[1.02] transition-all"
        >
          <Plus size={15} />
          Deploy Contract
        </button>
      </div>

      {/* ThirdWeb status */}
      <ThirdWebStatusPanel />

      {/* On-chain escrow contracts */}
      <EscrowContractsPanel />

      {/* HTLC + Smart Account info */}
      <HtlcPanel />
      <SmartAccountInfoPanel />

      {/* DB contract registry */}
      <DeployedContractsList />

      {/* Deploy modal */}
      {showDeploy && <DeployModal onClose={() => setShowDeploy(false)} />}
    </div>
  );
}
