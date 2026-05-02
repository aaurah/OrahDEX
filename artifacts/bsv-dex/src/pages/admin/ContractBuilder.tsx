import { adminFetch } from "@/lib/adminFetch";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Cpu, Plus, X, CheckCircle2, Clock, ExternalLink, Copy, Check, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchContracts = () => adminFetch(`/api/admin/contracts`).then(r => r.json());

const TOKEN_TYPES = [
  { id: "token", label: "Fungible Token", desc: "Standard BSV token (BSV-20 compatible)", icon: "💰" },
  { id: "governance", label: "Governance Token", desc: "DAO voting & governance", icon: "🏛️" },
  { id: "lp", label: "Liquidity Pool Token", desc: "LP share token for DEX pools", icon: "💧" },
  { id: "nft", label: "NFT Collection", desc: "Non-fungible tokens on BSV", icon: "🖼️" },
  { id: "stablecoin", label: "Stablecoin", desc: "USD-pegged or algo-stable", icon: "🔒" },
];

const NETWORKS = ["BSV", "EVM (Ethereum)", "EVM (BNB Chain)", "EVM (Polygon)"];

export function AdminContractBuilder() {
  const qc = useQueryClient();
  const [showDeploy, setShowDeploy] = useState(false);
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", symbol: "", type: "token", network: "BSV",
    supply: "1000000000", decimals: "8",
    mintable: false, burnable: false, pausable: false,
    description: "",
  });

  const { data: contracts = [], isLoading } = useQuery({ queryKey: ["admin-contracts"], queryFn: fetchContracts });

  const deploy = useMutation({
    mutationFn: (data: any) =>
      adminFetch(`/api/admin/contracts/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contracts"] });
      setShowDeploy(false);
      setStep(1);
      setForm({ name: "", symbol: "", type: "token", network: "BSV", supply: "1000000000", decimals: "8", mintable: false, burnable: false, pausable: false, description: "" });
    },
  });

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Contracts & New Coins</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Deploy smart contracts and create new tokens on-chain</p>
        </div>
        <button
          onClick={() => setShowDeploy(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg hover:scale-[1.02] transition-all"
        >
          <Zap className="w-4 h-4" /> Deploy New Contract
        </button>
      </div>

      {/* Deploy Modal */}
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
              <button onClick={() => { setShowDeploy(false); setStep(1); }} className="p-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/5"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Step 1: Token Type */}
              {step === 1 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Choose Contract Type</h4>
                  {TOKEN_TYPES.map(t => (
                    <button key={t.id} onClick={() => setForm(f => ({...f, type: t.id}))}
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

              {/* Step 2: Token Details */}
              {step === 2 && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Token Details</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">Token Name *</label>
                      <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                        placeholder="Orah Token" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">Symbol *</label>
                      <input value={form.symbol} onChange={e => setForm(f => ({...f, symbol: e.target.value.toUpperCase()}))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary font-mono"
                        placeholder="ORAH" maxLength={10} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">Total Supply</label>
                      <input type="number" value={form.supply} onChange={e => setForm(f => ({...f, supply: e.target.value}))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                        min="1" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1">Decimals</label>
                      <input type="number" value={form.decimals} onChange={e => setForm(f => ({...f, decimals: e.target.value}))}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                        min="0" max="18" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1">Network</label>
                    <select value={form.network} onChange={e => setForm(f => ({...f, network: e.target.value}))}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary">
                      {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-2">Features</label>
                    <div className="flex gap-3 flex-wrap">
                      {[["mintable", "Mintable"], ["burnable", "Burnable"], ["pausable", "Pausable"]].map(([key, label]) => (
                        <button key={key} onClick={() => setForm(f => ({...f, [key]: !(f as any)[key]}))}
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
                    <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
                      rows={3} placeholder="Describe the purpose of this token..." />
                  </div>
                </div>
              )}

              {/* Step 3: Review */}
              {step === 3 && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Review & Deploy</h4>
                  <div className="bg-secondary/40 rounded-xl p-4 space-y-3 font-mono text-sm">
                    {[
                      ["Type", TOKEN_TYPES.find(t => t.id === form.type)?.label],
                      ["Name", form.name],
                      ["Symbol", form.symbol],
                      ["Network", form.network],
                      ["Supply", parseInt(form.supply).toLocaleString()],
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

      {/* Deployed Contracts */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Cpu className="w-4 h-4 text-primary" /> Deployed Contracts</h3>
        {isLoading ? (
          <div className="space-y-3">{Array.from({length:2}).map((_,i) => <div key={i} className="h-20 bg-secondary rounded-xl animate-pulse" />)}</div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No contracts deployed yet</div>
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
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-muted-foreground truncate">{c.address}</code>
                      <button onClick={() => copyText(c.address, c.id)} className="text-muted-foreground hover:text-primary shrink-0">
                        {copied === c.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      <span>Supply: {parseInt(c.supply).toLocaleString()}</span>
                      <span>Decimals: {c.decimals}</span>
                      <span>Deployed: {c.deployedAt}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {c.status === "deployed"
                      ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                      : <Clock className="w-5 h-5 text-orange-400 animate-pulse" />
                    }
                    <button className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-primary/5 transition-colors">
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
