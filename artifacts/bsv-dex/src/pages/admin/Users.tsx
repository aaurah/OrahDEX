import { adminFetch } from "@/lib/adminFetch";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Shield, Ban, CheckCircle2, User, Filter, RefreshCw,
  Pencil, X, Check, Globe, Wallet, ToggleLeft, ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fetchUsers(search = "", status = "all") {
  return adminFetch(`/api/admin/users?search=${search}&status=${status}`).then(r => r.json());
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-400/10 text-green-400 border-green-400/20",
  suspended: "bg-orange-400/10 text-orange-400 border-orange-400/20",
  banned: "bg-red-400/10 text-red-400 border-red-400/20",
};

const NETWORK_COLORS: Record<string, string> = {
  evm: "bg-blue-400/10 text-blue-400",
  bsv: "bg-green-400/10 text-green-400",
};

const COUNTRIES = ["US","UK","SG","JP","AU","DE","CA","KR","IN","BR","NG","ZA","FR","ES","IT","NL","SE","CH","AE","HK"];
const PROVIDERS = ["handcash","relayx","panda","metamask","walletconnect","coinbase","trust","phantom","okx","binance"];

// ── Edit User Modal ──────────────────────────────────────────────────────────

function EditUserModal({
  user, onClose, onSaved,
}: {
  user: any;
  onClose: () => void;
  onSaved: (updated: any) => void;
}) {
  const [form, setForm] = useState({
    status: user.status,
    country: user.country,
    network: user.network,
    provider: user.provider,
    verified: user.verified,
    balance: user.balance.toFixed(2),
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    const res = await adminFetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: form.status,
        country: form.country,
        network: form.network,
        provider: form.provider,
        verified: form.verified,
        balance: parseFloat(form.balance),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setDone(true);
      onSaved(data.user);
      setTimeout(onClose, 1200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-base text-foreground">Edit User</h3>
              <p className="text-xs text-muted-foreground font-mono">{user.walletAddress.slice(0,14)}...{user.walletAddress.slice(-6)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
              <Check className="w-7 h-7 text-green-400" />
            </div>
            <p className="font-semibold text-green-400">User updated!</p>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Status */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Account Status</label>
              <div className="flex gap-2">
                {["active","suspended","banned"].map(s => (
                  <button key={s} onClick={() => set("status", s)}
                    className={cn("flex-1 py-2 rounded-xl border text-xs font-semibold capitalize transition-all",
                      form.status === s
                        ? s === "active" ? "bg-green-500/15 border-green-500/40 text-green-400"
                          : s === "suspended" ? "bg-orange-500/15 border-orange-500/40 text-orange-400"
                          : "bg-red-500/15 border-red-500/40 text-red-400"
                        : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                    )}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Network + Country */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Network</label>
                <div className="flex gap-2">
                  {["evm","bsv"].map(n => (
                    <button key={n} onClick={() => set("network", n)}
                      className={cn("flex-1 py-2 rounded-xl border text-xs font-bold uppercase transition-all",
                        form.network === n
                          ? n === "evm" ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                            : "bg-green-500/15 border-green-500/40 text-green-400"
                          : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                      )}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Country</label>
                <select value={form.country} onChange={e => set("country", e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary">
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Provider */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Wallet Provider</label>
              <select value={form.provider} onChange={e => set("provider", e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary">
                {PROVIDERS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>

            {/* Balance */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Balance (USDT)</label>
              <div className="relative">
                <input type="number" value={form.balance} onChange={e => set("balance", e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 pr-16 text-sm text-foreground focus:outline-none focus:border-primary"
                  placeholder="0.00" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDT</span>
              </div>
            </div>

            {/* Verified toggle */}
            <div className="flex items-center justify-between p-3 bg-secondary/50 border border-border rounded-xl">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-foreground">KYC Verified</span>
              </div>
              <button onClick={() => set("verified", !form.verified)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                  form.verified
                    ? "bg-blue-500/15 text-blue-400 border-blue-500/25"
                    : "bg-secondary text-muted-foreground border-border"
                )}>
                {form.verified ? <><ToggleRight className="w-4 h-4" /> Verified</> : <><ToggleLeft className="w-4 h-4" /> Unverified</>}
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-all">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function AdminUsers() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editUser, setEditUser] = useState<any | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-users", search, statusFilter],
    queryFn: () => fetchUsers(search, statusFilter),
    staleTime: 5000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminFetch(`/api/admin/users/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const users = data?.users ?? [];

  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{data?.total ?? 0} registered traders</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border px-3 py-2 rounded-xl hover:bg-white/5 transition-all">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search address or provider..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-all"
          />
        </div>
        <div className="flex items-center gap-2 border border-border bg-card rounded-xl px-3 py-2 text-sm">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {["all", "active", "suspended", "banned"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn("px-2.5 py-1 rounded-lg font-medium capitalize transition-all text-xs",
                statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-muted-foreground text-xs">
                <th className="px-4 py-3 text-left font-medium">User</th>
                <th className="px-4 py-3 text-left font-medium">Network</th>
                <th className="px-4 py-3 text-right font-medium">24h Volume</th>
                <th className="px-4 py-3 text-right font-medium">Balance</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Joined</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-secondary rounded animate-pulse w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.map((u: any) => (
                <tr key={u.id} className="hover:bg-secondary/20 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-foreground">{u.walletAddress.slice(0, 10)}...{u.walletAddress.slice(-5)}</span>
                          {u.verified && <Shield className="w-3 h-3 text-blue-400" aria-label="KYC Verified" />}
                        </div>
                        <div className="text-xs text-muted-foreground">{u.provider} · {u.country}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded uppercase", NETWORK_COLORS[u.network])}>
                      {u.network}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">${u.volume24h.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">${u.balance?.toLocaleString() ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border uppercase", STATUS_COLORS[u.status])}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(u.joinedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {/* Edit */}
                      <button
                        onClick={() => setEditUser(u)}
                        className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Edit user"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {/* Activate */}
                      {u.status !== "active" && (
                        <button
                          onClick={() => updateStatus.mutate({ id: u.id, status: "active" })}
                          className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors"
                          title="Activate"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {/* Suspend */}
                      {u.status === "active" && (
                        <button
                          onClick={() => updateStatus.mutate({ id: u.id, status: "suspended" })}
                          className="p-1.5 text-orange-400 hover:bg-orange-400/10 rounded-lg transition-colors"
                          title="Suspend"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                      )}
                      {/* Ban */}
                      {u.status !== "banned" && (
                        <button
                          onClick={() => updateStatus.mutate({ id: u.id, status: "banned" })}
                          className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          title="Ban"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && users.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center mx-auto">
              <Wallet className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold text-foreground">No traders yet</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {statusFilter !== "all" || search
                ? "No users match your current filter. Try clearing the search or status filter."
                : "Traders appear here automatically once a wallet connects to the exchange and places their first order. All fields are sourced directly from on-chain activity."}
            </p>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
