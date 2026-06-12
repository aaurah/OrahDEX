import { adminFetch } from "@/lib/adminFetch";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cpu, Plus, X, CheckCircle2, Clock, ExternalLink, Copy, Check,
  Zap, AlertTriangle, Link2, Shield, Radio, ChevronDown, ChevronUp,
  Wifi, WifiOff, Globe, Key, Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fetchContracts   = () => adminFetch(`/api/admin/contracts`).then(r => r.json());
const fetchChainsConfig = () => adminFetch(`/api/admin/evm/chains-config`).then(r => r.json());

const TOKEN_TYPES = [
  { id: "token",       label: "Fungible Token",      desc: "Standard BSV token (BSV-20 compatible)",  icon: "💰" },
  { id: "governance",  label: "Governance Token",     desc: "DAO voting & governance",                 icon: "🏛️" },
  { id: "lp",          label: "Liquidity Pool Token", desc: "LP share token for DEX pools",            icon: "💧" },
  { id: "nft",         label: "NFT Collection",       desc: "Non-fungible tokens on BSV",              icon: "🖼️" },
  { id: "stablecoin",  label: "Stablecoin",           desc: "USD-pegged or algo-stable",               icon: "🔒" },
];

const NETWORKS = ["BSV", "EVM (Ethereum)", "EVM (BNB Chain)", "EVM (Polygon)"];

function AddrCell({ addr, label }: { addr: string | null; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!addr) return <span className="text-muted-foreground/40 text-xs">—</span>;
  return (
    <div className="flex items-center gap-1 min-w-0">
      <code className="text-[11px] font-mono text-muted-foreground truncate max-w-[120px]" title={addr}>
        {addr.slice(0, 6)}…{addr.slice(-4)}
      </code>
      <button
        onClick={() => { navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
        title={`Copy ${label}`}
      >
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

function TopicRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <code className="text-xs font-mono text-foreground truncate">{value}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

export function AdminContractBuilder() {
  const qc = useQueryClient();
  const [showDeploy, setShowDeploy] = useState(false);
  const [step, setStep]             = useState(1);
  const [copied, setCopied]         = useState<string | null>(null);
  const [expanded, setExpanded]     = useState<Set<number>>(new Set([1, 137, 56, 11155111]));
  const [form, setForm] = useState({
    name: "", symbol: "", type: "token", network: "BSV",
    supply: "1000000000", decimals: "8",
    mintable: false, burnable: false, pausable: false, description: "",
  });

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["admin-contracts"], queryFn: fetchContracts, staleTime: 0,
  });

  const { data: evmConfig, isLoading: evmLoading } = useQuery({
    queryKey: ["admin-evm-chains-config"], queryFn: fetchChainsConfig, staleTime: 30_000,
  });

  const deploy = useMutation({
    mutationFn: (data: any) =>
      adminFetch(`/api/admin/contracts/deploy`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contracts"] });
      setShowDeploy(false); setStep(1);
      setForm({ name: "", symbol: "", type: "token", network: "BSV", supply: "1000000000", decimals: "8", mintable: false, burnable: false, pausable: false, description: "" });
    },
  });

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000);
  };

  const toggleChain = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const chains: any[] = evmConfig?.chains ?? [];
  const topics        = evmConfig?.topics ?? {};
  const watchedContracts: string[] = evmConfig?.watchedContracts ?? [];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Contracts & Chain Settings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">EVM chain configuration, escrow & HTLC contracts, webhook, and BSV token deployment</p>
        </div>
        <button
          onClick={() => setShowDeploy(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg hover:scale-[1.02] transition-all"
        >
          <Zap className="w-4 h-4" /> Deploy New Contract
        </button>
      </div>

      {/* ── EVM Chain & Escrow Contract Settings ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <Link2 className="w-4 h-4 text-primary" />
          <div>
            <h3 className="font-semibold">EVM Settlement & Escrow Contracts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">HTLC + Escrow contract addresses and token addresses per chain</p>
          </div>
          {!evmLoading && (
            <span className="ml-auto text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
              {chains.length} chains
            </span>
          )}
        </div>

        {evmLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-secondary/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {chains.map((chain: any) => {
              const isOpen = expanded.has(chain.chainId);
              const isTestnet = chain.chainId === 11155111;
              return (
                <div key={chain.chainId}>
                  {/* Chain header row */}
                  <button
                    onClick={() => toggleChain(chain.chainId)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors text-left"
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                      isTestnet ? "bg-orange-400/10 text-orange-400" : "bg-primary/10 text-primary"
                    )}>
                      {chain.nativeSymbol.slice(0, 3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{chain.name}</span>
                        <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                          Chain {chain.chainId}
                        </span>
                        {isTestnet && (
                          <span className="text-[10px] bg-orange-400/10 text-orange-400 px-1.5 py-0.5 rounded font-bold">TESTNET</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <code className="text-[11px] font-mono text-muted-foreground">
                          {chain.contractAddress?.slice(0, 10)}…{chain.contractAddress?.slice(-6)}
                        </code>
                        {chain.rpcConfigured
                          ? <span className="flex items-center gap-1 text-[10px] text-green-400"><Wifi className="w-2.5 h-2.5" /> Custom RPC</span>
                          : <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60"><WifiOff className="w-2.5 h-2.5" /> Public RPC</span>
                        }
                        {chain.contractIsCustom && (
                          <span className="text-[10px] text-violet-400 font-semibold">Custom Contract</span>
                        )}
                      </div>
                    </div>
                    <a
                      href={chain.blockExplorer}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-primary/5 transition-colors shrink-0"
                    >
                      <Globe className="w-3.5 h-3.5" />
                    </a>
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    }
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="px-5 pb-4 bg-secondary/20">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                        {/* HTLC / Escrow Contract */}
                        <div className="bg-card rounded-xl p-3 border border-border/60">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Shield className="w-3 h-3" /> HTLC / Escrow Contract
                            {chain.contractEnvVar && (
                              <span className="ml-auto font-mono text-violet-400/70">{chain.contractEnvVar}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono text-foreground break-all">{chain.contractAddress}</code>
                            <button
                              onClick={() => copyText(chain.contractAddress, `contract-${chain.chainId}`)}
                              className="shrink-0 text-muted-foreground hover:text-primary"
                            >
                              {copied === `contract-${chain.chainId}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <a
                              href={`${chain.blockExplorer}/address/${chain.contractAddress}`}
                              target="_blank" rel="noopener noreferrer"
                              className="shrink-0 text-muted-foreground hover:text-primary"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>

                        {/* RPC */}
                        <div className="bg-card rounded-xl p-3 border border-border/60">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Radio className="w-3 h-3" /> RPC Endpoint
                            {chain.rpcEnvVar && (
                              <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">{chain.rpcEnvVar}</span>
                            )}
                          </div>
                          {chain.rpcConfigured
                            ? <div className="flex items-center gap-1.5 text-xs text-green-400"><CheckCircle2 className="w-3.5 h-3.5" /> Custom endpoint configured</div>
                            : <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><WifiOff className="w-3.5 h-3.5" /> Using public fallback node</div>
                          }
                        </div>

                        {/* USDT */}
                        <div className="bg-card rounded-xl p-3 border border-border/60">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">USDT Address</div>
                          <AddrCell addr={chain.usdtAddress} label="USDT" />
                        </div>

                        {/* USDC */}
                        <div className="bg-card rounded-xl p-3 border border-border/60">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">USDC Address</div>
                          <AddrCell addr={chain.usdcAddress} label="USDC" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Webhook & Topics ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Webhook Configuration */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Webhook Configuration</h3>
          </div>

          {evmLoading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-secondary rounded-xl animate-pulse" />)}</div>
          ) : (
            <>
              {/* Webhook URL */}
              <div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">EVM Webhook URL</div>
                {evmConfig?.webhookUrl ? (
                  <div className="flex items-center gap-2 bg-secondary/50 rounded-xl px-3 py-2">
                    <code className="text-xs font-mono text-foreground flex-1 truncate">{evmConfig.webhookUrl}</code>
                    <button
                      onClick={() => copyText(evmConfig.webhookUrl, "webhook-url")}
                      className="shrink-0 text-muted-foreground hover:text-primary"
                    >
                      {copied === "webhook-url" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">Domain not set — REPLIT_DEV_DOMAIN unavailable</div>
                )}
              </div>

              {/* HMAC Secret */}
              <div className="flex items-center justify-between p-3 bg-secondary/40 rounded-xl">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">HMAC Secret</div>
                    <div className="text-[11px] text-muted-foreground font-mono">EVM_WEBHOOK_SECRET</div>
                  </div>
                </div>
                {evmConfig?.hmacConfigured
                  ? <span className="flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full"><CheckCircle2 className="w-3.5 h-3.5" /> Configured</span>
                  : <span className="flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-400/10 px-2.5 py-1 rounded-full"><AlertTriangle className="w-3.5 h-3.5" /> Not set</span>
                }
              </div>

              {/* Watched Contracts */}
              <div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Watched Contract Addresses</div>
                <div className="space-y-1.5">
                  {watchedContracts.map((addr: string) => (
                    <div key={addr} className="flex items-center gap-2 bg-secondary/50 rounded-xl px-3 py-2">
                      <code className="text-[11px] font-mono text-foreground flex-1 truncate">{addr}</code>
                      <button
                        onClick={() => copyText(addr, `watched-${addr}`)}
                        className="shrink-0 text-muted-foreground hover:text-primary"
                      >
                        {copied === `watched-${addr}` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Event Topics */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-primary" />
            <div>
              <h3 className="font-semibold">Event Topic Hashes</h3>
              <p className="text-xs text-muted-foreground">keccak256 of ABI event signatures — use these in your webhook provider filter</p>
            </div>
          </div>

          {evmLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-secondary rounded-xl animate-pulse" />)}</div>
          ) : (
            <div>
              <TopicRow label="HTLC Locked"      value={topics.HTLC_LOCKED     ?? "—"} />
              <TopicRow label="HTLC Revealed"    value={topics.HTLC_REVEALED   ?? "—"} />
              <TopicRow label="HTLC Refunded"    value={topics.HTLC_REFUNDED   ?? "—"} />
              <TopicRow label="Escrow Released"  value={topics.ESCROW_RELEASED ?? "—"} />
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-blue-400/5 border border-blue-400/15 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-400">
              Register the webhook URL with Alchemy, Infura, or any EVM log provider. Use these topic hashes in the provider's event filter to receive real-time HTLC and Escrow events.
            </p>
          </div>
        </div>
      </div>

      {/* ── BSV Deployed Contracts ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" /> BSV Deployed Contracts
        </h3>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 bg-secondary rounded-xl animate-pulse" />)}</div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No BSV contracts deployed yet</div>
        ) : (
          <div className="space-y-3">
            {contracts.map((c: any) => (
              <div key={c.id} className="p-4 rounded-xl border border-border hover:border-primary/30 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold">{c.name}</span>
                      <span className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded text-primary">{c.symbol}</span>
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                        c.status === "deployed" ? "bg-green-400/10 text-green-400" : "bg-orange-400/10 text-orange-400"
                      )}>{c.status}</span>
                      <span className="text-[10px] bg-blue-400/10 text-blue-400 px-1.5 py-0.5 rounded font-bold">{c.network}</span>
                    </div>
                    {c.address ? (
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-muted-foreground truncate">{c.address}</code>
                        <button onClick={() => copyText(c.address, c.id)} className="text-muted-foreground hover:text-primary shrink-0">
                          {copied === c.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No on-chain address yet</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      <span>Supply: {parseInt(c.supply).toLocaleString()}</span>
                      <span>Decimals: {c.decimals}</span>
                      <span>Created: {c.deployedAt}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {c.status === "deployed"
                      ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                      : <Clock className="w-5 h-5 text-orange-400 animate-pulse" />
                    }
                    {c.address && (
                      <button className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-primary/5 transition-colors">
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Deploy Modal ── */}
      {showDeploy && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h3 className="font-bold text-lg">Deploy Contract</h3>
                <div className="flex items-center gap-2 mt-1">
                  {[1,2,3].map(s => (
                    <div key={s} className={cn("h-1 w-12 rounded-full transition-all", step >= s ? "bg-primary" : "bg-secondary")} />
                  ))}
                  <span className="text-xs text-muted-foreground">Step {step} / 3</span>
                </div>
              </div>
              <button onClick={() => { setShowDeploy(false); setStep(1); }} className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {step === 1 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Choose Contract Type</h4>
                  {TOKEN_TYPES.map(t => (
                    <button key={t.id} onClick={() => setForm(f => ({ ...f, type: t.id }))}
                      className={cn("w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                        form.type === t.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-white/3"
                      )}>
                      <span className="text-2xl">{t.icon}</span>
                      <div>
                        <div className="font-semibold text-sm">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.desc}</div>
                      </div>
                      {form.type === t.id && <CheckCircle2 className="w-5 h-5 text-primary ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Token Details</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">Token Name *</label>
                      <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                        placeholder="Orah Token" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">Symbol *</label>
                      <input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary font-mono"
                        placeholder="ORAH" maxLength={10} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">Total Supply</label>
                      <input type="number" value={form.supply} onChange={e => setForm(f => ({ ...f, supply: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                        min="1" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">Decimals</label>
                      <input type="number" value={form.decimals} onChange={e => setForm(f => ({ ...f, decimals: e.target.value }))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                        min="0" max="18" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1">Network</label>
                    <select value={form.network} onChange={e => setForm(f => ({ ...f, network: e.target.value }))}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary">
                      {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-2">Features</label>
                    <div className="flex gap-3 flex-wrap">
                      {[["mintable","Mintable"],["burnable","Burnable"],["pausable","Pausable"]].map(([key, label]) => (
                        <button key={key} onClick={() => setForm(f => ({ ...f, [key]: !(f as any)[key] }))}
                          className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
                            (form as any)[key] ? "bg-primary/10 text-primary border-primary/30" : "border-border text-muted-foreground hover:border-primary/30"
                          )}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1">Description</label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
                      rows={3} placeholder="Describe the purpose of this token..." />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Review & Deploy</h4>
                  <div className="bg-secondary/40 rounded-xl p-4 space-y-3 font-mono text-sm">
                    {[
                      ["Type",     TOKEN_TYPES.find(t => t.id === form.type)?.label],
                      ["Name",     form.name],
                      ["Symbol",   form.symbol],
                      ["Network",  form.network],
                      ["Supply",   parseInt(form.supply).toLocaleString()],
                      ["Decimals", form.decimals],
                      ["Features", [form.mintable && "Mintable", form.burnable && "Burnable", form.pausable && "Pausable"].filter(Boolean).join(", ") || "None"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-semibold text-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-orange-400/5 border border-orange-400/20 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-orange-400">
                      Contract deployment is irreversible. Ensure all details are correct before proceeding. Estimated gas: 0.00042 BSV.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-between shrink-0">
              <button
                onClick={() => step > 1 ? setStep(s => s - 1) : setShowDeploy(false)}
                className="px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
              >
                {step > 1 ? "Back" : "Cancel"}
              </button>
              <button
                onClick={() => step < 3 ? setStep(s => s + 1) : deploy.mutate(form)}
                disabled={(step === 2 && (!form.name || !form.symbol)) || deploy.isPending}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-primary text-white text-sm font-semibold shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50"
              >
                {step < 3 ? "Continue" : deploy.isPending ? "Deploying..." : "🚀 Deploy Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
