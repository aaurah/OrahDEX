import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "../../lib/adminFetch";

/* ── Types ────────────────────────────────────────────────────────────────── */

interface ProbeResult {
  name: string; label: string; status: "ok" | "degraded" | "down";
  latencyMs: number; detail: string; error?: string; checkedAt: string;
}
interface SubsystemReport {
  status: "ok" | "degraded" | "critical"; checkedAt: string; totalMs: number;
  summary: { ok: number; degraded: number; down: number };
  probes: ProbeResult[]; rpc: ProbeResult[];
}
interface ServiceHealth {
  name: string; status: "healthy" | "degraded" | "stuck" | "dead";
  lastRunAt: string | null; lastSuccessAt: string | null;
  consecutiveFails: number; avgDurationMs: number; staleSinceMs: number | null;
}
interface Alert {
  id: string; severity: "critical" | "high" | "warning" | "info";
  category: string; message: string; detail?: string;
  ts: number; resolved: boolean;
}
interface AlertSummary {
  critical: number; high: number; warning: number; info: number;
  unresolved: number; total: number; byCategory: Record<string, number>;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const STATUS_COLOR: Record<string, string> = {
  ok:          "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  healthy:     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  degraded:    "bg-amber-500/15  text-amber-400  border-amber-500/30",
  stuck:       "bg-amber-500/15  text-amber-400  border-amber-500/30",
  down:        "bg-red-500/15    text-red-400    border-red-500/30",
  dead:        "bg-red-500/15    text-red-400    border-red-500/30",
  critical:    "bg-red-500/15    text-red-400    border-red-500/30",
};
const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  high:     "text-orange-400 bg-orange-500/10 border-orange-500/30",
  warning:  "text-amber-400 bg-amber-500/10 border-amber-500/30",
  info:     "text-sky-400 bg-sky-500/10 border-sky-500/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded border text-xs font-semibold uppercase tracking-wide ${STATUS_COLOR[status] ?? "bg-zinc-700 text-zinc-300 border-zinc-600"}`}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`px-2 py-0.5 rounded border text-xs font-semibold uppercase ${SEV_COLOR[severity] ?? ""}`}>
      {severity}
    </span>
  );
}

function LatencyBar({ ms, max = 2000 }: { ms: number; max?: number }) {
  const pct = Math.min(100, (ms / max) * 100);
  const color = ms < 500 ? "bg-emerald-500" : ms < 1500 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span>{ms}ms</span>
    </div>
  );
}

function ProbeCard({ probe }: { probe: ProbeResult }) {
  return (
    <div className={`rounded-lg border p-3 ${
      probe.status === "ok"       ? "border-emerald-500/20 bg-emerald-500/5" :
      probe.status === "degraded" ? "border-amber-500/20  bg-amber-500/5"  :
                                    "border-red-500/20    bg-red-500/5"
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-zinc-200">{probe.label}</span>
        <StatusBadge status={probe.status} />
      </div>
      <p className="text-xs text-zinc-400 truncate">{probe.error ?? probe.detail}</p>
      {probe.latencyMs > 0 && <LatencyBar ms={probe.latencyMs} />}
    </div>
  );
}

/* ── Repair button ────────────────────────────────────────────────────────── */

function RepairButton({
  label, endpoint, body, variant = "normal",
}: {
  label: string; endpoint: string; body?: Record<string, unknown>; variant?: "danger" | "normal";
}) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      adminFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-diagnostics"] });
      qc.invalidateQueries({ queryKey: ["admin-alerts"] });
    },
  });

  return (
    <button
      onClick={() => { if (!mut.isPending) mut.mutate(); }}
      disabled={mut.isPending}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
        variant === "danger"
          ? "bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/40"
          : "bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/40"
      }`}
    >
      {mut.isPending ? "Running…" : label}
      {mut.isSuccess && " ✓"}
      {mut.isError && " ✗"}
    </button>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */

export default function AdminDiagnostics() {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const qc = useQueryClient();

  const { data: report, isLoading: probeLoading, dataUpdatedAt, refetch: refetchProbes } =
    useQuery<SubsystemReport>({
      queryKey: ["admin-diagnostics"],
      queryFn:  () => adminFetch("/api/admin/diagnostics").then(r => r.json()),
      refetchInterval: autoRefresh ? 30_000 : false,
      staleTime: 20_000,
    });

  const { data: services } = useQuery<{ overall: string; services: ServiceHealth[]; alerts: { level: string; message: string }[] }>({
    queryKey: ["admin-diagnostics-services"],
    queryFn:  () => adminFetch("/api/admin/diagnostics/services").then(r => r.json()),
    refetchInterval: autoRefresh ? 30_000 : false,
    staleTime: 20_000,
  });

  const { data: alertData } = useQuery<{ alerts: Alert[] }>({
    queryKey: ["admin-alerts"],
    queryFn:  () => adminFetch("/api/admin/alerts?unresolved=true&limit=50").then(r => r.json()),
    refetchInterval: autoRefresh ? 20_000 : false,
  });

  const { data: alertSummary } = useQuery<AlertSummary>({
    queryKey: ["admin-alerts-summary"],
    queryFn:  () => adminFetch("/api/admin/alerts/summary").then(r => r.json()),
    refetchInterval: autoRefresh ? 20_000 : false,
  });

  const resolveAlert = useMutation({
    mutationFn: (id: string) => adminFetch(`/api/admin/alerts/${id}/resolve`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-alerts"] }),
  });

  const overallStatus = report?.status ?? services?.overall ?? "ok";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">System Diagnostics</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Live health of every OrahDEX subsystem — probes external APIs, RPC nodes, DB, and internal services
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
              className="accent-blue-500" />
            Auto-refresh
          </label>
          <button
            onClick={() => { refetchProbes(); qc.invalidateQueries({ queryKey: ["admin-diagnostics-services"] }); qc.invalidateQueries({ queryKey: ["admin-alerts"] }); }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors"
          >
            {probeLoading ? "Probing…" : "Run Probes"}
          </button>
        </div>
      </div>

      {/* Overall status banner */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${
        overallStatus === "ok"       ? "border-emerald-500/30 bg-emerald-500/5" :
        overallStatus === "degraded" ? "border-amber-500/30  bg-amber-500/5" :
                                       "border-red-500/30    bg-red-500/5"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            overallStatus === "ok" ? "bg-emerald-400" : overallStatus === "degraded" ? "bg-amber-400" : "bg-red-400"
          } animate-pulse`} />
          <span className="font-semibold text-white text-lg">
            {overallStatus === "ok" ? "All Systems Operational" :
             overallStatus === "degraded" ? "System Degraded — Check Below" :
             "Critical — Multiple Systems Down"}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          {report && (
            <>
              <span className="text-emerald-400 font-medium">{report.summary.ok} OK</span>
              <span className="text-amber-400 font-medium">{report.summary.degraded} Degraded</span>
              <span className="text-red-400 font-medium">{report.summary.down} Down</span>
              <span>{report.totalMs}ms total probe time</span>
            </>
          )}
          {dataUpdatedAt > 0 && (
            <span>Last checked: {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* Alert summary */}
      {alertSummary && alertSummary.unresolved > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {(["critical","high","warning","info"] as const).map(sev => (
            <div key={sev} className={`rounded-lg border p-3 text-center ${SEV_COLOR[sev]}`}>
              <div className="text-2xl font-bold">{alertSummary[sev]}</div>
              <div className="text-xs uppercase tracking-wide mt-1 opacity-80">{sev}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* External subsystem probes */}
        <section>
          <h2 className="text-base font-semibold text-zinc-300 mb-3">External Subsystems</h2>
          {probeLoading ? (
            <div className="text-zinc-500 text-sm">Running probes…</div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {(report?.probes ?? []).map(p => <ProbeCard key={p.name} probe={p} />)}
            </div>
          )}
        </section>

        {/* Internal services */}
        <section>
          <h2 className="text-base font-semibold text-zinc-300 mb-3">Background Services</h2>
          <div className="space-y-2">
            {(services?.services ?? []).map(svc => {
              const lastRunAgo = svc.lastRunAt
                ? Math.floor((Date.now() - new Date(svc.lastRunAt).getTime()) / 1000)
                : null;
              return (
                <div key={svc.name} className={`rounded-lg border p-3 flex items-center justify-between ${
                  svc.status === "healthy" ? "border-emerald-500/20 bg-emerald-500/5" :
                  svc.status === "dead"    ? "border-red-500/20    bg-red-500/5" :
                                             "border-amber-500/20  bg-amber-500/5"
                }`}>
                  <div>
                    <div className="text-sm font-medium text-zinc-200">{svc.name}</div>
                    <div className="text-xs text-zinc-500">
                      {lastRunAgo !== null ? `Last run ${lastRunAgo}s ago` : "Never run"}
                      {svc.consecutiveFails > 0 && ` · ${svc.consecutiveFails} fail(s)`}
                      {svc.avgDurationMs > 0 && ` · avg ${Math.round(svc.avgDurationMs)}ms`}
                    </div>
                  </div>
                  <StatusBadge status={svc.status} />
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* RPC chain health */}
      {report && report.rpc.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-zinc-300 mb-3">EVM RPC Nodes</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {report.rpc.map(r => (
              <div key={r.name} className={`rounded-lg border p-3 ${
                r.status === "ok"       ? "border-emerald-500/20 bg-emerald-500/5" :
                r.status === "degraded" ? "border-amber-500/20  bg-amber-500/5" :
                                          "border-red-500/20    bg-red-500/5"
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-zinc-300 truncate">{r.label}</span>
                  <StatusBadge status={r.status} />
                </div>
                {r.status === "ok"
                  ? <LatencyBar ms={r.latencyMs} max={3000} />
                  : <p className="text-xs text-red-400 truncate">{r.error}</p>
                }
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Repair actions */}
      <section>
        <h2 className="text-base font-semibold text-zinc-300 mb-3">Repair Actions</h2>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2">Order Repair</h3>
              <div className="flex flex-wrap gap-2">
                <RepairButton label="Cancel Stuck Open Orders (>30m)" endpoint="/api/admin/repair/stuck-orders" body={{ thresholdMinutes: 30 }} />
                <RepairButton label="Cancel Ghost Processing Orders (>2h)" endpoint="/api/admin/repair/cancel-ghost-orders" body={{ thresholdHours: 2 }} variant="danger" />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2">External API Repair</h3>
              <div className="flex flex-wrap gap-2">
                <RepairButton label="Sync LE Swap Statuses" endpoint="/api/admin/repair/sync-le-swaps" />
                <RepairButton label="Force Price Engine Run" endpoint="/api/admin/repair/rebuild-price" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Active alerts */}
      {alertData && alertData.alerts.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-zinc-300 mb-3">
            Active Alerts
            <span className="ml-2 text-xs font-normal text-zinc-500">({alertData.alerts.length} unresolved)</span>
          </h2>
          <div className="space-y-2">
            {alertData.alerts.map(alert => (
              <div key={alert.id} className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${SEV_COLOR[alert.severity]}`}>
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <SeverityBadge severity={alert.severity} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{alert.message}</p>
                    {alert.detail && <p className="text-xs text-zinc-500 truncate">{alert.detail}</p>}
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {alert.category} · {new Date(alert.ts).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => resolveAlert.mutate(alert.id)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 shrink-0 transition-colors"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
