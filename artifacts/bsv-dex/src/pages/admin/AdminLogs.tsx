import { adminFetch } from "@/lib/adminFetch";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Terminal, RefreshCw, Trash2, AlertTriangle, Info, AlertCircle,
  Clock, Filter, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

function fetchLogs(level?: string) {
  const url = level && level !== "all"
    ? `/api/admin/logs?level=${level}&limit=200`
    : `/api/admin/logs?limit=200`;
  return adminFetch(url).then(r => r.json());
}
function clearLogs() {
  return adminFetch(`/api/admin/logs`, { method: "DELETE" }).then(r => r.json());
}

type Level = "all" | "info" | "warn" | "error";

const LEVEL_STYLES: Record<string, { icon: any; cls: string; badge: string }> = {
  info:  { icon: Info,          cls: "text-blue-400",   badge: "bg-blue-400/10 text-blue-400 border-blue-400/20" },
  warn:  { icon: AlertTriangle, cls: "text-orange-400", badge: "bg-orange-400/10 text-orange-400 border-orange-400/20" },
  error: { icon: AlertCircle,   cls: "text-red-400",    badge: "bg-red-400/10 text-red-400 border-red-400/20" },
};

function LogRow({ entry }: { entry: any }) {
  const level = entry.level ?? "info";
  const style = LEVEL_STYLES[level] ?? LEVEL_STYLES.info;
  const Icon  = style.icon;
  const ts    = new Date(entry.ts).toLocaleTimeString();

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0 hover:bg-white/2 px-2 rounded-lg transition-colors">
      <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", style.cls)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider", style.badge)}>
            {level}
          </span>
          {entry.context && (
            <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded font-mono">
              {entry.context}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {ts}
          </span>
        </div>
        <p className="text-sm text-foreground mt-1 break-words">{entry.message}</p>
      </div>
    </div>
  );
}

export function AdminLogsPage() {
  const qc = useQueryClient();
  const [levelFilter, setLevelFilter] = useState<Level>("all");
  const [search, setSearch]           = useState("");
  const [cleared, setCleared]         = useState(false);

  const { data: rawLogs, isLoading, refetch } = useQuery({
    queryKey:        ["admin-logs", levelFilter],
    queryFn:         () => fetchLogs(levelFilter),
    refetchInterval: 15_000,
  });
  const logs: any[] = Array.isArray(rawLogs) ? rawLogs : [];

  const clearMut = useMutation({
    mutationFn: clearLogs,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-logs"] });
      setCleared(true);
      setTimeout(() => setCleared(false), 2000);
    },
  });

  const filtered: any[] = (logs as any[]).filter((l: any) =>
    search ? l.message?.toLowerCase().includes(search.toLowerCase()) : true
  );

  const counts = (logs as any[]).reduce((acc: Record<string, number>, l: any) => {
    acc[l.level] = (acc[l.level] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            System Logs
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            In-memory ring buffer · last {logs.length} entries · auto-refreshes every 15s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:border-primary/40 text-xs text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={() => clearMut.mutate()}
            disabled={clearMut.isPending || (logs as any[]).length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-400/20 hover:border-red-400/50 text-xs text-red-400/70 hover:text-red-400 transition-all disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {cleared ? "Cleared" : "Clear Logs"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {(["info","warn","error"] as const).map(lvl => {
          const s = LEVEL_STYLES[lvl];
          const Icon = s.icon;
          return (
            <button
              key={lvl}
              onClick={() => setLevelFilter(l => l === lvl ? "all" : lvl)}
              className={cn(
                "flex items-center gap-3 p-4 rounded-2xl border transition-all",
                levelFilter === lvl ? "border-primary/40 bg-primary/5" : "bg-card border-border hover:border-border/80"
              )}
            >
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", s.badge)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{lvl}</p>
                <p className="text-xl font-bold font-mono">{(counts[lvl] ?? 0).toLocaleString()}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {(["all","info","warn","error"] as const).map(lvl => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all",
                levelFilter === lvl
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "text-muted-foreground border-border hover:border-border/80"
              )}
            >
              <Filter className="w-2.5 h-2.5" />
              {lvl === "all" ? "All" : lvl.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 max-w-xs bg-secondary/30 border border-border rounded-xl px-3 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Log list */}
      <div className="bg-card border border-border rounded-2xl p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Terminal className="w-8 h-8 mx-auto mb-3 opacity-30" />
            No log entries
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
            {filtered.map((entry: any) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
