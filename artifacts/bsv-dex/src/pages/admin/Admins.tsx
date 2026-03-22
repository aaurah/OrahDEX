import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ShieldCheck, ShieldAlert, KeyRound, X } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchAdmins = () => fetch(`${BASE}/api/admin/admins`).then(r => r.json());

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-red-400/10 text-red-400 border-red-400/20",
  admin: "bg-primary/10 text-primary border-primary/20",
  developer: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  moderator: "bg-violet-400/10 text-violet-400 border-violet-400/20",
  analyst: "bg-green-400/10 text-green-400 border-green-400/20",
};

const ALL_PERMISSIONS = ["all", "users", "pairs", "orders", "api", "contracts", "reports"];

export function AdminAdmins() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "moderator", permissions: [] as string[] });

  const { data: admins = [], isLoading } = useQuery({ queryKey: ["admin-admins"], queryFn: fetchAdmins });

  const addAdmin = useMutation({
    mutationFn: (data: any) =>
      fetch(`${BASE}/api/admin/admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-admins"] }); setShowAdd(false); setForm({ name: "", email: "", role: "moderator", permissions: [] }); },
  });

  const removeAdmin = useMutation({
    mutationFn: (id: string) =>
      fetch(`${BASE}/api/admin/admins/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-admins"] }),
  });

  const togglePerm = (p: string) =>
    setForm(f => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter(x => x !== p) : [...f.permissions, p] }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Admin User Management</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage platform operators and their permissions</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
        >
          <Plus className="w-4 h-4" /> Add Admin
        </button>
      </div>

      {/* Add Admin Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg">New Admin User</h3>
              <button onClick={() => setShowAdd(false)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Full Name</label>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  placeholder="Jane Doe" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Email</label>
                <input value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  placeholder="jane@auradex.io" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary">
                  {["admin", "developer", "moderator", "analyst"].map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-2">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_PERMISSIONS.filter(p => p !== "all").map(p => (
                    <button key={p} onClick={() => togglePerm(p)}
                      className={cn("text-xs px-2.5 py-1 rounded-lg border font-medium capitalize transition-all",
                        form.permissions.includes(p)
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      )}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => addAdmin.mutate(form)}
                disabled={!form.name || !form.email || addAdmin.isPending}
                className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                {addAdmin.isPending ? "Creating..." : "Create Admin"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admins Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-muted-foreground text-xs">
                <th className="px-4 py-3 text-left font-medium">Admin</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Permissions</th>
                <th className="px-4 py-3 text-left font-medium">2FA</th>
                <th className="px-4 py-3 text-left font-medium">Last Login</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({length:7}).map((_,j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>)}</tr>
                ))
              ) : admins.map((a: any) => (
                <tr key={a.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center text-xs font-bold text-white shrink-0">
                        {a.name[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border capitalize", ROLE_COLORS[a.role] ?? "bg-muted text-muted-foreground border-border")}>
                      {a.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(a.permissions ?? []).slice(0, 3).map((p: string) => (
                        <span key={p} className="text-[9px] bg-secondary px-1.5 py-0.5 rounded font-medium uppercase">{p}</span>
                      ))}
                      {a.permissions?.length > 3 && <span className="text-[9px] text-muted-foreground">+{a.permissions.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.twoFa
                      ? <span className="flex items-center gap-1 text-xs text-green-400"><ShieldCheck className="w-3.5 h-3.5" /> Enabled</span>
                      : <span className="flex items-center gap-1 text-xs text-orange-400"><ShieldAlert className="w-3.5 h-3.5" /> Disabled</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {a.lastLogin ? new Date(a.lastLogin).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border capitalize",
                      a.status === "active" ? "bg-green-400/10 text-green-400 border-green-400/20" : "bg-muted text-muted-foreground border-border"
                    )}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Reset password">
                        <KeyRound className="w-4 h-4" />
                      </button>
                      {a.role !== "superadmin" && (
                        <button
                          onClick={() => removeAdmin.mutate(a.id)}
                          className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          title="Remove admin"
                        >
                          <Trash2 className="w-4 h-4" />
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
