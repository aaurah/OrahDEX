import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ToggleLeft, ToggleRight, Pencil, Check, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchPairs = () => fetch(`${BASE}/api/admin/pairs`).then(r => r.json());

type Market = {
  symbol: string; baseAsset: string; quoteAsset: string;
  type: string; status: string; makerFee: string; takerFee: string;
  lastPrice: string; volume24h: string;
};

export function AdminTradePairs() {
  const qc = useQueryClient();
  const { data: pairs = [], isLoading } = useQuery({ queryKey: ["admin-pairs"], queryFn: fetchPairs });
  const [editFees, setEditFees] = useState<string | null>(null);
  const [feeForm, setFeeForm] = useState({ maker: "", taker: "" });
  const [typeFilter, setTypeFilter] = useState("all");

  const toggleStatus = useMutation({
    mutationFn: ({ symbol, status }: { symbol: string; status: string }) =>
      fetch(`${BASE}/api/admin/pairs/${encodeURIComponent(symbol)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-pairs"] }),
  });

  const updateFees = useMutation({
    mutationFn: ({ symbol }: { symbol: string }) =>
      fetch(`${BASE}/api/admin/pairs/${encodeURIComponent(symbol)}/fees`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ makerFee: feeForm.maker, takerFee: feeForm.taker }),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-pairs"] }); setEditFees(null); },
  });

  const filtered = pairs.filter((p: Market) => typeFilter === "all" || p.type === typeFilter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Trade Pairs</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Enable, disable, and configure all trading pairs</p>
        </div>
        <div className="flex gap-2 bg-card border border-border rounded-xl p-1 text-xs font-medium">
          {["all", "spot", "futures"].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={cn("px-3 py-1.5 rounded-lg capitalize transition-all",
                typeFilter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Pairs", value: pairs.length },
          { label: "Active", value: pairs.filter((p: Market) => p.status === "active").length, color: "text-green-400" },
          { label: "Disabled", value: pairs.filter((p: Market) => p.status !== "active").length, color: "text-red-400" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={cn("text-2xl font-bold font-mono", s.color ?? "")}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-muted-foreground text-xs">
                <th className="px-4 py-3 text-left font-medium">Pair</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Last Price</th>
                <th className="px-4 py-3 text-right font-medium">24h Volume</th>
                <th className="px-4 py-3 text-center font-medium">Maker Fee</th>
                <th className="px-4 py-3 text-center font-medium">Taker Fee</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({length:8}).map((_,j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>)}</tr>
                ))
              ) : filtered.map((p: Market) => (
                <tr key={p.symbol} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-bold text-foreground">{p.baseAsset}<span className="text-muted-foreground font-normal">/{p.quoteAsset}</span></div>
                    <div className="text-xs text-muted-foreground font-mono">{p.symbol}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                      p.type === "spot" ? "bg-blue-400/10 text-blue-400" : "bg-violet-400/10 text-violet-400"
                    )}>{p.type}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">${parseFloat(p.lastPrice || "0").toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{parseFloat(p.volume24h || "0").toLocaleString()}</td>

                  {/* Fees — editable */}
                  {editFees === p.symbol ? (
                    <>
                      <td className="px-4 py-3 text-center">
                        <input value={feeForm.maker} onChange={e => setFeeForm(f => ({...f, maker: e.target.value}))}
                          className="w-16 text-center bg-secondary border border-primary rounded-lg px-2 py-1 text-xs focus:outline-none"
                          placeholder="0.10" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input value={feeForm.taker} onChange={e => setFeeForm(f => ({...f, taker: e.target.value}))}
                          className="w-16 text-center bg-secondary border border-primary rounded-lg px-2 py-1 text-xs focus:outline-none"
                          placeholder="0.10" />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-center text-xs font-mono">{p.makerFee}%</td>
                      <td className="px-4 py-3 text-center text-xs font-mono">{p.takerFee}%</td>
                    </>
                  )}

                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleStatus.mutate({ symbol: p.symbol, status: p.status === "active" ? "disabled" : "active" })}
                      className={cn("transition-colors", p.status === "active" ? "text-green-400" : "text-muted-foreground")}
                    >
                      {p.status === "active"
                        ? <ToggleRight className="w-8 h-8" />
                        : <ToggleLeft className="w-8 h-8" />
                      }
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {editFees === p.symbol ? (
                        <>
                          <button onClick={() => updateFees.mutate({ symbol: p.symbol })} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditFees(null)} className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg"><X className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <button onClick={() => { setEditFees(p.symbol); setFeeForm({ maker: p.makerFee, taker: p.takerFee }); }}
                          className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
