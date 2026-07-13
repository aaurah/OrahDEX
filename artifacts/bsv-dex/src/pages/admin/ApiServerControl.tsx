import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/adminFetch";
import { cn } from "@/lib/utils";
import {
  Server, Activity, RefreshCw, RotateCcw, Wrench,
  Stethoscope, AlertTriangle, CheckCircle, XCircle,
  Clock, Zap, Database, Shield, ShieldAlert, Bell,
  Play, TrendingUp, Timer, AlertCircle, CheckCheck,
  ChevronDown, ChevronUp, HardDrive, Cpu, Package,
  ShieldCheck, Link2, Layers, Info, SkipForward,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface ServiceHealth {
  name: string;
  status: "healthy" | "degraded" | "stuck" | "dead";
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFails: number;
  avgDurationMs: number;
  staleSinceMs: number | null;
}

interface ServicesData {
  overall: string;
  services: ServiceHealth[];
  alerts: { level: string; message: string }[];
  checkedAt: string;
}

interface HealthData {
  status: string;
  uptimeSeconds: number;
  nodeHeapMB: number;
  nodeHeapTotalMB: number;
  nodeRssMB: number;
  nodeVersion: string;
  platform: string;
  dbLatencyMs: number;
  dbConnections: number;
  activeMarkets: number;
  totalMarkets: number;
  openOrders: number;
  timestamp: string;
}

interface CircuitState {
  name: string;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failures: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  totalCalls: number;
}

interface CircuitsData {
  overall: string;
  open: number;
  halfOpen: number;
  closed: number;
  circuits: CircuitState[];
  checkedAt: string;
}

interface Alert {
  id: string;
  severity: "critical" | "high" | "warning" | "info";
  category: string;
  message: string;
  detail?: string;
  ts: number;
  resolved: boolean;
}

interface AlertSummary {
  critical: number;
  high: number;
  warning: number;
  info: number;
  unresolved: number;
  total: number;
}

type TabId = "overview" | "services" | "repair" | "circuits" | "alerts";

/* ── Colour helpers ─────────────────────────────────────────────────────── */

const SVC_STYLE: Record<string, string> = {
  healthy:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  degraded: "bg-amber-500/10   text-amber-400   border-amber-500/30",
  stuck:    "bg-amber-500/10   text-amber-400   border-amber-500/30",
  dead:     "bg-red-500/10     text-red-400     border-red-500/30",
};

const CIRCUIT_STYLE: Record<string, string> = {
  CLOSED:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  HALF_OPEN: "bg-amber-500/10   text-amber-400   border-amber-500/30",
  OPEN:      "bg-red-500/10     text-red-400     border-red-500/30",
};

const SEV_STYLE: Record<string, string> = {
  critical: "bg-red-500/10    text-red-400    border-red-500/30",
  high:     "bg-orange-500/10 text-orange-400 border-orange-500/30",
  warning:  "bg-amber-500/10  text-amber-400  border-amber-500/30",
  info:     "bg-sky-500/10    text-sky-400    border-sky-500/30",
};

function svcBorderClass(status: string) {
  if (status === "healthy") return "border-emerald-500/20 bg-emerald-500/5";
  if (status === "dead")    return "border-red-500/20    bg-red-500/5";
  return "border-amber-500/20 bg-amber-500/5";
}

/* ── Small atoms ────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold uppercase tracking-wide",
      SVC_STYLE[status] ?? "bg-zinc-700/50 text-zinc-300 border-zinc-600"
    )}>
      {status === "healthy" && <CheckCircle className="w-3 h-3" />}
      {(status === "degraded" || status === "stuck") && <AlertTriangle className="w-3 h-3" />}
      {status === "dead"    && <XCircle className="w-3 h-3" />}
      {status}
    </span>
  );
}

function CircuitBadge({ state }: { state: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold uppercase tracking-wide",
      CIRCUIT_STYLE[state] ?? "bg-zinc-700/50 text-zinc-300 border-zinc-600"
    )}>
      {state === "CLOSED"    && <CheckCircle className="w-3 h-3" />}
      {state === "HALF_OPEN" && <AlertTriangle className="w-3 h-3" />}
      {state === "OPEN"      && <XCircle className="w-3 h-3" />}
      {state.replace("_", " ")}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded border text-xs font-semibold uppercase tracking-wide",
      SEV_STYLE[severity] ?? ""
    )}>
      {severity}
    </span>
  );
}

function OverallBanner({ status }: { status: string }) {
  const isOk  = status === "ok" || status === "healthy";
  const isDeg = status === "degraded" || status === "recovering";
  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-semibold",
      isOk  ? "bg-emerald-500/8  border-emerald-500/25 text-emerald-400" :
      isDeg ? "bg-amber-500/8    border-amber-500/25   text-amber-400"   :
              "bg-red-500/8      border-red-500/25     text-red-400"
    )}>
      <div className={cn(
        "w-2.5 h-2.5 rounded-full animate-pulse shrink-0",
        isOk ? "bg-emerald-400" : isDeg ? "bg-amber-400" : "bg-red-400"
      )} />
      {isOk  ? "All Systems Operational" :
       isDeg ? "System Degraded — Check Services" :
               "Critical — Immediate Attention Required"}
    </div>
  );
}

function fmtAgo(ms: number) {
  if (ms < 2000)   return `${ms}ms ago`;
  if (ms < 120000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3600000)return `${Math.round(ms / 60000)}m ago`;
  return `${Math.round(ms / 3600000)}h ago`;
}

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

/* ── ActionButton — shows pending/success/error inline ─────────────────── */

interface ActionResult { ok: boolean; message?: string; [k: string]: unknown }

function ActionButton({
  label, icon: Icon, endpoint, method = "POST", body, variant = "blue",
  onSuccess, size = "sm", confirmLabel,
}: {
  label: string;
  icon?: any;
  endpoint: string;
  method?: string;
  body?: Record<string, unknown>;
  variant?: "blue" | "amber" | "red" | "emerald" | "violet";
  onSuccess?: (data: ActionResult) => void;
  size?: "sm" | "md";
  confirmLabel?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult]         = useState<{ ok: boolean; msg: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mut = useMutation<ActionResult, Error>({
    mutationFn: () =>
      adminFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }).then(r => r.json()),
    onSuccess: data => {
      setResult({ ok: true,  msg: data?.message ?? "Done" });
      onSuccess?.(data);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setResult(null), 4000);
    },
    onError: err => {
      setResult({ ok: false, msg: err?.message ?? "Failed" });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setResult(null), 5000);
    },
  });

  const variantClass = {
    blue:    "bg-blue-600/15   text-blue-300   border-blue-500/30   hover:bg-blue-600/30",
    amber:   "bg-amber-600/15  text-amber-300  border-amber-500/30  hover:bg-amber-600/30",
    red:     "bg-red-600/15    text-red-300    border-red-500/30    hover:bg-red-600/30",
    emerald: "bg-emerald-600/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-600/30",
    violet:  "bg-violet-600/15 text-violet-300 border-violet-500/30 hover:bg-violet-600/30",
  }[variant];

  const pad = size === "md" ? "px-4 py-2" : "px-3 py-1.5";

  function handleClick() {
    if (confirmLabel && !confirming) { setConfirming(true); return; }
    setConfirming(false);
    if (!mut.isPending) mut.mutate();
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={mut.isPending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50",
          pad, variantClass, confirming && "ring-1 ring-amber-400"
        )}
      >
        {mut.isPending
          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          : Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        {confirming ? (confirmLabel ?? "Confirm?") : mut.isPending ? "Running…" : label}
      </button>
      {confirming && !mut.isPending && (
        <button onClick={() => setConfirming(false)} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors self-start">
          Cancel
        </button>
      )}
      {result && (
        <span className={cn("text-[10px] font-medium", result.ok ? "text-emerald-400" : "text-red-400")}>
          {result.ok ? "✓" : "✗"} {result.msg}
        </span>
      )}
    </div>
  );
}

/* ── MetricCard ─────────────────────────────────────────────────────────── */

function MetricCard({
  icon: Icon, label, value, sub, color = "blue", gauge,
}: {
  icon: any; label: string; value: string; sub?: string;
  color?: "green" | "blue" | "violet" | "orange" | "red" | "amber";
  gauge?: { value: number; max: number };
}) {
  const iconCls = {
    green:  "text-emerald-400 bg-emerald-400/10",
    blue:   "text-blue-400    bg-blue-400/10",
    violet: "text-violet-400  bg-violet-400/10",
    orange: "text-orange-400  bg-orange-400/10",
    red:    "text-red-400     bg-red-400/10",
    amber:  "text-amber-400   bg-amber-400/10",
  }[color];
  const gaugeCls = {
    green: "bg-emerald-400", blue: "bg-blue-400", violet: "bg-violet-400",
    orange: "bg-orange-400", red: "bg-red-400",   amber: "bg-amber-400",
  }[color];
  const pct = gauge ? Math.min(100, Math.round((gauge.value / gauge.max) * 100)) : 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", iconCls)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
          <p className="text-lg font-bold font-mono leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
      {gauge && (
        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", gaugeCls)} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

/* ── Section wrapper ────────────────────────────────────────────────────── */

function Section({
  title, icon: Icon, color = "text-zinc-300", children, defaultOpen = true,
}: {
  title: string; icon?: any; color?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className={cn("w-4 h-4", color)} />}
          <span className="text-sm font-semibold text-zinc-200">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: OVERVIEW
══════════════════════════════════════════════════════════════════════════ */

function OverviewTab({ health, services, circuits, alertSummary, loadingHealth }: {
  health: HealthData | undefined;
  services: ServicesData | undefined;
  circuits: CircuitsData | undefined;
  alertSummary: AlertSummary | undefined;
  loadingHealth: boolean;
}) {
  const deadCount    = services?.services.filter(s => s.status === "dead").length    ?? 0;
  const stuckCount   = services?.services.filter(s => s.status === "stuck").length   ?? 0;
  const healthyCount = services?.services.filter(s => s.status === "healthy").length ?? 0;
  const totalSvcs    = services?.services.length ?? 0;
  const openCircuits = circuits?.open ?? 0;
  const unresolvedAlerts = alertSummary?.unresolved ?? 0;

  const overallStatus =
    deadCount > 0  ? "critical" :
    stuckCount > 0 || openCircuits > 0 ? "degraded" :
    "ok";

  return (
    <div className="space-y-5">
      {/* Status banner */}
      <OverallBanner status={overallStatus} />

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={Timer} label="Server Uptime" color="blue"
          value={health ? fmtUptime(health.uptimeSeconds) : loadingHealth ? "…" : "—"}
          sub={health ? `Node ${health.nodeVersion}` : ""}
        />
        <MetricCard
          icon={Activity} label="Services" color={deadCount > 0 ? "red" : stuckCount > 0 ? "amber" : "green"}
          value={`${healthyCount} / ${totalSvcs}`}
          sub={deadCount > 0 ? `${deadCount} DEAD` : stuckCount > 0 ? `${stuckCount} stuck` : "All healthy"}
        />
        <MetricCard
          icon={ShieldAlert} label="Circuit Breakers" color={openCircuits > 0 ? "red" : "green"}
          value={openCircuits > 0 ? `${openCircuits} OPEN` : "All Closed"}
          sub={circuits ? `${circuits.closed} closed, ${circuits.halfOpen} half-open` : ""}
        />
        <MetricCard
          icon={Bell} label="Active Alerts" color={unresolvedAlerts > 0 ? "orange" : "green"}
          value={String(unresolvedAlerts)}
          sub={alertSummary ? `${alertSummary.critical} critical, ${alertSummary.high} high` : ""}
        />
      </div>

      {/* Process metrics */}
      {health && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            icon={HardDrive} label="Heap Used" color="violet"
            value={`${health.nodeHeapMB} MB`}
            sub={`of ${health.nodeHeapTotalMB} MB`}
            gauge={{ value: health.nodeHeapMB, max: health.nodeHeapTotalMB }}
          />
          <MetricCard
            icon={Cpu} label="RSS Memory" color="blue"
            value={`${health.nodeRssMB} MB`}
            sub="Resident set size"
          />
          <MetricCard
            icon={Database} label="DB Latency" color={health.dbLatencyMs > 100 ? "amber" : "green"}
            value={`${health.dbLatencyMs} ms`}
            sub={`${health.dbConnections} connections`}
          />
          <MetricCard
            icon={Layers} label="Open Orders" color="blue"
            value={(health.openOrders ?? 0).toLocaleString()}
            sub={`${health.activeMarkets} active markets`}
          />
        </div>
      )}

      {/* Service status summary */}
      {services && services.services.length > 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">Service Status Summary</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {services.services.map(svc => {
              const ago = svc.lastRunAt
                ? fmtAgo(Date.now() - new Date(svc.lastRunAt).getTime())
                : "never";
              return (
                <div key={svc.name} className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2",
                  svcBorderClass(svc.status)
                )}>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">{svc.name}</p>
                    <p className="text-[10px] text-zinc-500">{ago}</p>
                  </div>
                  <StatusBadge status={svc.status} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alert summary pills */}
      {alertSummary && alertSummary.unresolved > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {(["critical", "high", "warning", "info"] as const).map(sev => (
            <div key={sev} className={cn("rounded-xl border p-3 text-center", SEV_STYLE[sev])}>
              <div className="text-2xl font-bold">{alertSummary[sev]}</div>
              <div className="text-[10px] uppercase tracking-wide mt-1 opacity-70">{sev}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: SERVICES
══════════════════════════════════════════════════════════════════════════ */

function ServicesTab({ services, refetch }: {
  services: ServicesData | undefined;
  refetch: () => void;
}) {
  const qc = useQueryClient();

  function onServiceReset() {
    refetch();
    qc.invalidateQueries({ queryKey: ["asc-services"] });
    qc.invalidateQueries({ queryKey: ["asc-health"] });
  }

  if (!services) return (
    <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
      <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading services…
    </div>
  );

  const dead    = services.services.filter(s => s.status === "dead");
  const stuck   = services.services.filter(s => s.status === "stuck");
  const degraded= services.services.filter(s => s.status === "degraded");
  const healthy = services.services.filter(s => s.status === "healthy");

  const sortedServices = [...dead, ...stuck, ...degraded, ...healthy];

  return (
    <div className="space-y-4">
      {/* Bulk action */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {services.services.length} registered services · last checked {new Date(services.checkedAt).toLocaleTimeString()}
        </p>
        <div className="flex items-center gap-2">
          {(dead.length > 0 || stuck.length > 0) && (
            <ActionButton
              label="Reset All Dead/Stuck"
              icon={RotateCcw}
              endpoint="/api/admin/repair/reset-all-services"
              variant="amber"
              confirmLabel="Confirm reset all?"
              onSuccess={onServiceReset}
            />
          )}
        </div>
      </div>

      {/* Services table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60">
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Service</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Status</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Last Run</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Fails</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Avg Duration</th>
              <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {sortedServices.map(svc => {
              const lastRunAgo = svc.lastRunAt
                ? Date.now() - new Date(svc.lastRunAt).getTime()
                : null;
              const isPriceService = ["price-updater", "stale-market-repair"].includes(svc.name);

              return (
                <tr key={svc.name} className={cn(
                  "transition-colors",
                  svc.status === "dead"    ? "bg-red-500/[0.03]"   :
                  svc.status === "stuck"   ? "bg-amber-500/[0.03]" :
                  svc.status === "degraded"? "bg-amber-500/[0.02]" : ""
                )}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full shrink-0",
                        svc.status === "healthy"  ? "bg-emerald-400 animate-pulse" :
                        svc.status === "dead"     ? "bg-red-400" :
                        "bg-amber-400 animate-pulse"
                      )} />
                      <span className="font-mono text-xs text-zinc-200">{svc.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={svc.status} /></td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {lastRunAgo !== null ? fmtAgo(lastRunAgo) : <span className="text-zinc-600">never</span>}
                  </td>
                  <td className="px-4 py-3">
                    {svc.consecutiveFails > 0
                      ? <span className={cn("text-xs font-semibold", svc.consecutiveFails >= 10 ? "text-red-400" : "text-amber-400")}>
                          {svc.consecutiveFails} ✗
                        </span>
                      : <span className="text-xs text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400 font-mono">
                    {svc.avgDurationMs > 0 ? `${Math.round(svc.avgDurationMs)}ms` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {isPriceService && (
                        <ActionButton
                          label="Force Run"
                          icon={Play}
                          endpoint="/api/admin/repair/rebuild-price"
                          variant="blue"
                          onSuccess={onServiceReset}
                        />
                      )}
                      {(svc.status === "dead" || svc.status === "stuck" || svc.consecutiveFails > 0) && (
                        <ActionButton
                          label="Reset Health"
                          icon={RotateCcw}
                          endpoint="/api/admin/repair/reset-service"
                          body={{ name: svc.name }}
                          variant="amber"
                          onSuccess={onServiceReset}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Self-healing explanation */}
      <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-4 flex gap-3">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-300/80 space-y-1">
          <p className="font-semibold text-sky-300">How self-healing works</p>
          <p>Services use exponential backoff: after 4 consecutive failures they skip runs (up to 4 intervals). After 10 failures a service becomes <strong className="text-red-400">DEAD</strong>.</p>
          <p><strong>Reset Health</strong> zeroes the fail counter so the service re-enters normal scheduling. <strong>Force Run</strong> immediately triggers the price engine regardless of backoff.</p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: REPAIR
══════════════════════════════════════════════════════════════════════════ */

function RepairTab() {
  const qc = useQueryClient();
  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["asc-services"] });
    qc.invalidateQueries({ queryKey: ["asc-health"] });
    qc.invalidateQueries({ queryKey: ["asc-alerts"] });
    qc.invalidateQueries({ queryKey: ["asc-alert-summary"] });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        All repair actions are logged to the alert bus. Destructive actions require confirmation.
      </p>

      {/* Price Engine */}
      <Section title="Price Engine" icon={TrendingUp} color="text-emerald-400">
        <div className="pt-2 space-y-3">
          <p className="text-xs text-zinc-500">
            Force the price engine to run immediately regardless of its scheduled interval or backoff state.
            Useful when markets show stale prices after a service failure.
          </p>
          <div className="flex flex-wrap gap-3">
            <ActionButton
              label="Force Price Engine Run"
              icon={Play}
              endpoint="/api/admin/repair/rebuild-price"
              variant="emerald"
              size="md"
              onSuccess={invalidateAll}
            />
            <ActionButton
              label="Reset Service Health"
              icon={RotateCcw}
              endpoint="/api/admin/repair/reset-service"
              body={{ name: "price-updater" }}
              variant="blue"
              size="md"
              onSuccess={invalidateAll}
            />
            <ActionButton
              label="Reset Stale-Market-Repair"
              icon={RotateCcw}
              endpoint="/api/admin/repair/reset-service"
              body={{ name: "stale-market-repair" }}
              variant="blue"
              size="md"
              onSuccess={invalidateAll}
            />
          </div>
        </div>
      </Section>

      {/* Order Repair */}
      <Section title="Order Repair" icon={Package} color="text-amber-400">
        <div className="pt-2 space-y-3">
          <p className="text-xs text-zinc-500">
            Cancel orders that have been stuck in invalid states. These operations are irreversible.
          </p>
          <div className="flex flex-wrap gap-3">
            <ActionButton
              label="Cancel Stuck Open Orders (>30 min)"
              icon={XCircle}
              endpoint="/api/admin/repair/stuck-orders"
              body={{ thresholdMinutes: 30 }}
              variant="amber"
              size="md"
              confirmLabel="Cancel stuck orders?"
              onSuccess={invalidateAll}
            />
            <ActionButton
              label="Cancel Stuck Orders (>5 min)"
              icon={XCircle}
              endpoint="/api/admin/repair/stuck-orders"
              body={{ thresholdMinutes: 5 }}
              variant="red"
              size="md"
              confirmLabel="Cancel orders >5min?"
              onSuccess={invalidateAll}
            />
            <ActionButton
              label="Cancel Ghost Processing Orders (>2h)"
              icon={XCircle}
              endpoint="/api/admin/repair/cancel-ghost-orders"
              body={{ thresholdHours: 2 }}
              variant="red"
              size="md"
              confirmLabel="Cancel ghost orders?"
              onSuccess={invalidateAll}
            />
          </div>
        </div>
      </Section>

      {/* External Sync */}
      <Section title="External API Sync" icon={Link2} color="text-blue-400">
        <div className="pt-2 space-y-3">
          <p className="text-xs text-zinc-500">
            Force-sync data from external providers. Requires configured API keys.
          </p>
          <div className="flex flex-wrap gap-3">
            <ActionButton
              label="Sync LE Swap Statuses"
              icon={RefreshCw}
              endpoint="/api/admin/repair/sync-le-swaps"
              variant="blue"
              size="md"
              onSuccess={invalidateAll}
            />
          </div>
        </div>
      </Section>

      {/* Service Health Reset */}
      <Section title="Service Health Reset" icon={RotateCcw} color="text-violet-400">
        <div className="pt-2 space-y-3">
          <p className="text-xs text-zinc-500">
            Reset health counters for services that have accumulated failures.
            This does not restart the underlying process — it clears the fail counter so the service
            can resume normal scheduling on its next tick.
          </p>
          <div className="flex flex-wrap gap-3">
            <ActionButton
              label="Reset ALL Service Health"
              icon={CheckCheck}
              endpoint="/api/admin/repair/reset-all-services"
              variant="violet"
              size="md"
              confirmLabel="Reset all services?"
              onSuccess={invalidateAll}
            />
            {[
              "price-updater",
              "stale-market-repair",
              "order-reconciler",
              "liquidity-bot",
            ].map(name => (
              <ActionButton
                key={name}
                label={`Reset: ${name}`}
                icon={RotateCcw}
                endpoint="/api/admin/repair/reset-service"
                body={{ name }}
                variant="blue"
                onSuccess={invalidateAll}
              />
            ))}
          </div>
        </div>
      </Section>

      {/* Alert Management */}
      <Section title="Alert Management" icon={Bell} color="text-orange-400">
        <div className="pt-2 space-y-3">
          <p className="text-xs text-zinc-500">
            The alert bus holds in-memory events. Use the Alerts tab to resolve individual alerts,
            or run diagnostics to trigger a fresh probe.
          </p>
          <div className="flex flex-wrap gap-3">
            <ActionButton
              label="Run Full Diagnostics"
              icon={Stethoscope}
              endpoint="/api/admin/diagnostics"
              method="GET"
              variant="blue"
              size="md"
              onSuccess={invalidateAll}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: CIRCUITS
══════════════════════════════════════════════════════════════════════════ */

function CircuitsTab({ circuits, refetch }: {
  circuits: CircuitsData | undefined;
  refetch: () => void;
}) {
  const qc = useQueryClient();
  function onReset() {
    refetch();
    qc.invalidateQueries({ queryKey: ["asc-circuits"] });
  }

  if (!circuits) return (
    <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
      <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading circuit breakers…
    </div>
  );

  const openCircuits = circuits.circuits.filter(c => c.state === "OPEN");
  const halfCircuits = circuits.circuits.filter(c => c.state === "HALF_OPEN");
  const closedCircuits = circuits.circuits.filter(c => c.state === "CLOSED");

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-emerald-400">{circuits.closed}</div>
          <div className="text-xs uppercase tracking-wide text-emerald-400/70 mt-1">Closed (healthy)</div>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-amber-400">{circuits.halfOpen}</div>
          <div className="text-xs uppercase tracking-wide text-amber-400/70 mt-1">Half-Open (probing)</div>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-red-400">{circuits.open}</div>
          <div className="text-xs uppercase tracking-wide text-red-400/70 mt-1">Open (tripped)</div>
        </div>
      </div>

      {/* Open circuits first */}
      {openCircuits.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-2">
            Tripped Circuits — Immediate Action
          </p>
          <div className="space-y-2">
            {openCircuits.map(c => (
              <CircuitRow key={c.name} circuit={c} onReset={onReset} />
            ))}
          </div>
        </div>
      )}

      {halfCircuits.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-2">
            Recovering
          </p>
          <div className="space-y-2">
            {halfCircuits.map(c => (
              <CircuitRow key={c.name} circuit={c} onReset={onReset} />
            ))}
          </div>
        </div>
      )}

      {closedCircuits.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
            Healthy Circuits
          </p>
          <div className="space-y-2">
            {closedCircuits.map(c => (
              <CircuitRow key={c.name} circuit={c} onReset={onReset} />
            ))}
          </div>
        </div>
      )}

      {circuits.circuits.length === 0 && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
          No circuit breakers registered yet. They appear once external API calls have been made.
        </div>
      )}

      <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-4 flex gap-3">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <p className="text-xs text-sky-300/80">
          Circuit breakers automatically trip when an external API fails repeatedly. An <strong className="text-amber-300">OPEN</strong> circuit
          blocks calls to protect the system. <strong className="text-sky-300">Force Reset</strong> manually closes it so traffic can
          resume immediately — use after confirming the external service is back online.
        </p>
      </div>
    </div>
  );
}

function CircuitRow({ circuit: c, onReset }: { circuit: CircuitState; onReset: () => void }) {
  const lastFailAgo = c.lastFailureAt
    ? fmtAgo(Date.now() - new Date(c.lastFailureAt).getTime())
    : null;

  return (
    <div className={cn(
      "rounded-xl border p-4 flex items-center justify-between gap-4",
      c.state === "CLOSED"    ? "border-emerald-500/15 bg-emerald-500/[0.03]" :
      c.state === "HALF_OPEN" ? "border-amber-500/15   bg-amber-500/[0.03]" :
                                "border-red-500/20     bg-red-500/[0.04]"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-mono font-medium text-zinc-200 truncate">{c.name}</span>
          <CircuitBadge state={c.state} />
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>{c.failures} failure{c.failures !== 1 ? "s" : ""}</span>
          {c.totalCalls > 0 && <span>{c.totalCalls.toLocaleString()} total calls</span>}
          {lastFailAgo && <span>last failure {lastFailAgo}</span>}
        </div>
      </div>
      {c.state !== "CLOSED" && (
        <ActionButton
          label="Force Reset"
          icon={ShieldCheck}
          endpoint="/api/admin/exchange-repair/reset-circuit"
          body={{ name: c.name }}
          variant={c.state === "OPEN" ? "red" : "amber"}
          confirmLabel="Force-close circuit?"
          onSuccess={onReset}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB: ALERTS
══════════════════════════════════════════════════════════════════════════ */

function AlertsTab({ alerts, alertSummary, refetch }: {
  alerts: { alerts: Alert[] } | undefined;
  alertSummary: AlertSummary | undefined;
  refetch: () => void;
}) {
  const qc = useQueryClient();
  const [filterSev, setFilterSev] = useState<string | null>(null);

  const resolveAlert = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/api/admin/alerts/${id}/resolve`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asc-alerts"] });
      qc.invalidateQueries({ queryKey: ["asc-alert-summary"] });
      refetch();
    },
  });

  const allAlerts = alerts?.alerts ?? [];
  const filtered  = filterSev
    ? allAlerts.filter(a => a.severity === filterSev)
    : allAlerts;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setFilterSev(null)}
          className={cn(
            "px-3 py-1 rounded-lg border text-xs font-medium transition-colors",
            !filterSev
              ? "bg-zinc-700 border-zinc-600 text-zinc-200"
              : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
          )}
        >
          All ({allAlerts.length})
        </button>
        {(["critical", "high", "warning", "info"] as const).map(sev => {
          const count = alertSummary?.[sev] ?? allAlerts.filter(a => a.severity === sev).length;
          return (
            <button
              key={sev}
              onClick={() => setFilterSev(filterSev === sev ? null : sev)}
              className={cn(
                "px-3 py-1 rounded-lg border text-xs font-medium transition-colors",
                filterSev === sev
                  ? SEV_STYLE[sev]
                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
              )}
            >
              {sev} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-8 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-emerald-400 font-medium">
            {filterSev ? `No ${filterSev} alerts` : "No unresolved alerts"}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(alert => (
          <div key={alert.id} className={cn(
            "rounded-xl border p-3 flex items-start justify-between gap-3",
            SEV_STYLE[alert.severity]
          )}>
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <SeverityBadge severity={alert.severity} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-200">{alert.message}</p>
                {alert.detail && (
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">{alert.detail}</p>
                )}
                <p className="text-xs text-zinc-600 mt-1">
                  <span className="uppercase tracking-wider">{alert.category}</span>
                  {" · "}{new Date(alert.ts).toLocaleString()}
                </p>
              </div>
            </div>
            <button
              onClick={() => resolveAlert.mutate(alert.id)}
              disabled={resolveAlert.isPending}
              className="shrink-0 text-xs text-zinc-500 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/60 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
            >
              {resolveAlert.isPending ? "…" : "Resolve"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════ */

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "overview",  label: "Overview",   icon: Server },
  { id: "services",  label: "Services",   icon: Activity },
  { id: "repair",    label: "Repair",     icon: Wrench },
  { id: "circuits",  label: "Circuits",   icon: Shield },
  { id: "alerts",    label: "Alerts",     icon: Bell },
];

export function ApiServerControl() {
  const [tab, setTab]               = useState<TabId>("overview");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const qc = useQueryClient();

  const { data: health, isLoading: loadingHealth, refetch: refetchHealth } =
    useQuery<HealthData>({
      queryKey:        ["asc-health"],
      queryFn:         () => adminFetch("/api/admin/health").then(r => r.json()),
      refetchInterval: autoRefresh ? 15_000 : false,
      staleTime:       10_000,
    });

  const { data: services, refetch: refetchServices } =
    useQuery<ServicesData>({
      queryKey:        ["asc-services"],
      queryFn:         () => adminFetch("/api/admin/diagnostics/services").then(r => r.json()),
      refetchInterval: autoRefresh ? 20_000 : false,
      staleTime:       15_000,
    });

  const { data: circuits, refetch: refetchCircuits } =
    useQuery<CircuitsData>({
      queryKey:        ["asc-circuits"],
      queryFn:         () => adminFetch("/api/admin/exchange-repair/circuits").then(r => r.json()),
      refetchInterval: autoRefresh ? 30_000 : false,
      staleTime:       20_000,
    });

  const { data: alerts, refetch: refetchAlerts } =
    useQuery<{ alerts: Alert[] }>({
      queryKey:        ["asc-alerts"],
      queryFn:         () => adminFetch("/api/admin/alerts?unresolved=true&limit=100").then(r => r.json()),
      refetchInterval: autoRefresh ? 20_000 : false,
      staleTime:       15_000,
    });

  const { data: alertSummary } =
    useQuery<AlertSummary>({
      queryKey:        ["asc-alert-summary"],
      queryFn:         () => adminFetch("/api/admin/alerts/summary").then(r => r.json()),
      refetchInterval: autoRefresh ? 20_000 : false,
      staleTime:       15_000,
    });

  function refreshAll() {
    refetchHealth();
    refetchServices();
    refetchCircuits();
    refetchAlerts();
    qc.invalidateQueries({ queryKey: ["asc-alert-summary"] });
  }

  const unresolvedAlerts = alertSummary?.unresolved ?? 0;
  const deadServices     = services?.services.filter(s => s.status === "dead").length ?? 0;
  const openCircuits     = circuits?.open ?? 0;

  return (
    <div className="space-y-5 p-6">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Server className="w-6 h-6 text-primary" />
            API Server Control
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Monitor, repair, and troubleshoot all OrahDEX backend services
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="accent-primary"
            />
            Auto-refresh
          </label>
          <button
            onClick={refreshAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-700 hover:border-zinc-500 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loadingHealth && "animate-spin")} />
            Refresh All
          </button>
        </div>
      </div>

      {/* ── Tab navigation ──────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-0">
        {TABS.map(t => {
          const badge =
            t.id === "alerts"   ? unresolvedAlerts :
            t.id === "services" ? deadServices :
            t.id === "circuits" ? openCircuits : 0;

          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {badge > 0 && (
                <span className={cn(
                  "min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1",
                  t.id === "alerts"   ? "bg-orange-500/20 text-orange-400" :
                  t.id === "services" ? "bg-red-500/20     text-red-400"   :
                                        "bg-red-500/20     text-red-400"
                )}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      {tab === "overview" && (
        <OverviewTab
          health={health}
          services={services}
          circuits={circuits}
          alertSummary={alertSummary}
          loadingHealth={loadingHealth}
        />
      )}

      {tab === "services" && (
        <ServicesTab
          services={services}
          refetch={refetchServices}
        />
      )}

      {tab === "repair" && <RepairTab />}

      {tab === "circuits" && (
        <CircuitsTab
          circuits={circuits}
          refetch={refetchCircuits}
        />
      )}

      {tab === "alerts" && (
        <AlertsTab
          alerts={alerts}
          alertSummary={alertSummary}
          refetch={refetchAlerts}
        />
      )}
    </div>
  );
}
