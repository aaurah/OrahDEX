import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Shield, Ban, CheckCircle2, User, Filter, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fetchUsers(search = "", status = "all") {
  return fetch(`${BASE}/api/admin/users?search=${search}&status=${status}`).then(r => r.json());
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-400/10 text-green-400 border-green-400/20",
  suspended: "bg-orange-400/10 text-orange-400 border-orange-400/20",
  banned: "bg-red-400/10 text-red-400 border-red-400/20",
};

const NETWORK_COLORS: Record<string, string> = {
  evm: "bg-blue-400/10 text-blue-400",
  bsv: "bg-amber-400/10 text-amber-400",
};

export function AdminUsers() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-users", search, statusFilter],
    queryFn: () => fetchUsers(search, statusFilter),
    staleTime: 5000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`${BASE}/api/admin/users/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const users = data?.users ?? [];

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
                <th className="px-4 py-3 text-right font-medium">Trades</th>
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
                <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div>
                        <div className="font-mono text-xs text-foreground">{u.walletAddress.slice(0, 12)}...{u.walletAddress.slice(-6)}</div>
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
                  <td className="px-4 py-3 text-right font-mono text-xs">{u.totalTrades.toLocaleString()}</td>
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
                      {u.status !== "active" && (
                        <button
                          onClick={() => updateStatus.mutate({ id: u.id, status: "active" })}
                          className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors"
                          title="Activate"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      {u.status === "active" && (
                        <button
                          onClick={() => updateStatus.mutate({ id: u.id, status: "suspended" })}
                          className="p-1.5 text-orange-400 hover:bg-orange-400/10 rounded-lg transition-colors"
                          title="Suspend"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                      )}
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
          <div className="text-center py-12 text-muted-foreground">No users found</div>
        )}
      </div>
    </div>
  );
}
