import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeftRight, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, Clock, XCircle, ExternalLink, Copy, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

const LS_KEY = "le_swap_history";

interface BridgeEntry {
  transaction_id:    string;
  coin_from:         string;
  coin_to:           string;
  network_from?:     string;
  network_to?:       string;
  deposit_amount?:   string;
  withdrawal_amount?: string;
  withdrawal?:       string;
  deposit?:          string;
  deposit_extra_id?: string | null;
  status?:           string;
  rate?:             string;
  venue?:            string;
  createdAt?:        string | number;
  created_at?:       string;
}

const DONE = new Set(["finished", "failed", "refunded", "overdue"]);

function loadHistory(): BridgeEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveHistory(entries: BridgeEntry[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(0, 50))); } catch {}
}

function fmtAmt(n: any): string {
  const v = parseFloat(String(n ?? ""));
  if (!isFinite(v) || isNaN(v) || v === 0) return String(n ?? "–");
  const abs = Math.abs(v);
  const dec = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return v.toFixed(dec).replace(/\.?0+$/, "");
}

function fmtDate(iso?: string | number) {
  if (!iso) return "";
  const d = new Date(typeof iso === "number" ? iso : iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusMeta(status: string) {
  const s = status.toLowerCase();
  if (s === "finished") return {
    label: "Completed", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  };
  if (s === "failed" || s === "refunded" || s === "overdue") return {
    label: s === "refunded" ? "Refunded" : s === "overdue" ? "Overdue" : "Failed",
    color: "text-red-400 bg-red-500/10 border-red-500/20",
    icon: <XCircle className="w-3.5 h-3.5" />,
  };
  const label =
    s === "wait"         ? "Awaiting deposit" :
    s === "confirming"   ? "Confirming" :
    s === "confirmation" ? "Confirming" :
    s === "exchanging"   ? "Exchanging" :
    s === "sending"      ? "Sending" : (status || "Pending");
  return {
    label, color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    icon: <Clock className="w-3.5 h-3.5 animate-pulse" />,
  };
}

function Row({ entry, liveStatus }: { entry: BridgeEntry; liveStatus?: any }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const status = liveStatus?.status ?? entry.status ?? "wait";
  const meta = statusMeta(status);
  const dateStr = fmtDate(entry.createdAt ?? entry.created_at);
  const hashIn  = liveStatus?.hash_in  ?? null;
  const hashOut = liveStatus?.hash_out ?? null;
  const withdrawalAmt = entry.withdrawal_amount && Number(entry.withdrawal_amount) > 0
    ? fmtAmt(entry.withdrawal_amount) : null;

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  return (
    <div className={cn(
      "rounded-xl border border-border bg-secondary/20 overflow-hidden transition-all",
      expanded && "border-primary/20 bg-primary/5"
    )}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white/5 transition"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-violet-400/30 flex items-center justify-center shrink-0">
          <ArrowLeftRight className="w-4 h-4 text-violet-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold truncate">
              {fmtAmt(entry.deposit_amount)} {entry.coin_from?.toUpperCase()}
              {" → "}
              {withdrawalAmt ?? "?"} {entry.coin_to?.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-[11px] text-muted-foreground">{dateStr || "—"}</span>
            <div className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold",
              meta.color
            )}>
              {meta.icon}{meta.label}
            </div>
          </div>
        </div>
        <div className="shrink-0">
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 border-t border-border/50 space-y-2 mt-1">
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="rounded-lg bg-card/60 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">You sent</p>
              <p className="text-sm font-bold">{fmtAmt(entry.deposit_amount)} {entry.coin_from?.toUpperCase()}</p>
              {entry.network_from && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{entry.network_from}</p>}
            </div>
            <div className="rounded-lg bg-card/60 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">You received</p>
              <p className="text-sm font-bold">{withdrawalAmt ?? "—"} {entry.coin_to?.toUpperCase()}</p>
              {entry.network_to && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{entry.network_to}</p>}
            </div>
          </div>

          {entry.deposit && (
            <div className="rounded-lg bg-card/60 px-3 py-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">Deposit address</p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono truncate flex-1">{entry.deposit}</span>
                <button onClick={() => copy(entry.deposit!, "dep")} className="p-1 rounded hover:bg-white/10">
                  {copied === "dep" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                </button>
              </div>
            </div>
          )}

          {entry.withdrawal && (
            <div className="rounded-lg bg-card/60 px-3 py-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">Destination</p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono truncate flex-1">{entry.withdrawal}</span>
                <button onClick={() => copy(entry.withdrawal!, "wd")} className="p-1 rounded hover:bg-white/10">
                  {copied === "wd" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                </button>
              </div>
            </div>
          )}

          {(hashIn || hashOut) && (
            <div className="grid grid-cols-2 gap-2">
              {hashIn && (
                <a
                  href={hashIn.link || `#`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 truncate"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  Deposit tx
                </a>
              )}
              {hashOut && (
                <a
                  href={hashOut.link || `#`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 truncate"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  Withdraw tx
                </a>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <span className="font-mono truncate max-w-[220px]">ID {entry.transaction_id.slice(0, 10)}…</span>
            <button
              onClick={() => copy(entry.transaction_id, "id")}
              className="text-primary hover:underline text-[10px]"
            >
              {copied === "id" ? "Copied" : "Copy ID"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BridgeHistory() {
  const [entries,      setEntries]      = useState<BridgeEntry[]>(() => loadHistory());
  const [visible,      setVisible]      = useState(true);
  const [liveStatuses, setLiveStatuses] = useState<Record<string, any>>({});
  const [refreshing,   setRefreshing]   = useState(false);
  const entriesRef = useRef(entries);
  const liveRef    = useRef(liveStatuses);
  entriesRef.current = entries;
  liveRef.current    = liveStatuses;

  const refreshFromStorage = useCallback(() => setEntries(loadHistory()), []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY) refreshFromStorage(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshFromStorage]);

  const pollPending = useCallback(async () => {
    const allEntries = entriesRef.current;
    const allLive    = liveRef.current;

    const pending = allEntries.filter(e => {
      const s = (allLive[e.transaction_id]?.status ?? e.status ?? "wait").toLowerCase();
      return !DONE.has(s);
    });
    if (!pending.length) return;

    setRefreshing(true);
    try {
      const results = await Promise.all(pending.map(async e => {
        try {
          // Use stored venue to hit the correct provider directly
          const venueSuffix = e.venue && e.venue !== "letsexchange"
            ? `?venue=${encodeURIComponent(e.venue)}`
            : "";
          const r = await fetch(`${API_BASE}/letsexchange/status/${encodeURIComponent(e.transaction_id)}${venueSuffix}`);
          if (!r.ok) return null;
          const data = await r.json();
          return { id: e.transaction_id, data };
        } catch { return null; }
      }));

      const next: Record<string, any> = { ...liveRef.current };
      let liveChanged    = false;
      let storageChanged = false;
      const updated = [...entriesRef.current];

      for (const r of results) {
        if (!r || !r.data) continue;
        const prev = next[r.id];
        // Only count as changed if status actually differs
        if (prev?.status !== r.data.status || !prev) {
          next[r.id] = r.data;
          liveChanged = true;
        }
        const idx = updated.findIndex(x => x.transaction_id === r.id);
        if (idx >= 0) {
          let changed = false;
          // Update status in storage
          if (r.data.status && r.data.status !== updated[idx].status) {
            updated[idx] = { ...updated[idx], status: r.data.status };
            changed = true;
          }
          // If rescue returned a corrected venue, persist it so future polls hit the right endpoint
          if (r.data.venue_rescued && r.data.best_venue && r.data.best_venue !== updated[idx].venue) {
            updated[idx] = { ...updated[idx], venue: r.data.best_venue };
            changed = true;
          }
          if (changed) storageChanged = true;
        }
      }

      if (liveChanged)    setLiveStatuses(next);
      if (storageChanged) { saveHistory(updated); setEntries(updated); }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Poll immediately on mount, then every 15 s while there are pending entries.
  // The interval resets whenever entries change (new swap added or one finishes).
  useEffect(() => {
    if (!visible) return;
    pollPending();
    const hasPending = entries.some(e => !DONE.has((liveStatuses[e.transaction_id]?.status ?? e.status ?? "wait").toLowerCase()));
    if (!hasPending) return;
    const id = setInterval(pollPending, 15_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, entries.length]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setVisible(v => !v)}
        onKeyDown={e => e.key === "Enter" && setVisible(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-bold">Bridge & Cross-Chain History</span>
          {entries.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">
              {entries.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); refreshFromStorage(); pollPending(); }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition"
            title="Refresh"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", refreshing && "animate-spin")} />
          </button>
          {visible
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {visible && (
        <div className="px-3 pb-3 border-t border-border/50">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/30 border border-border flex items-center justify-center">
                <ArrowLeftRight className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">No bridges yet</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                  Cross-chain swaps you initiate will appear here
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 mt-3">
              {entries.map(e => (
                <Row key={e.transaction_id} entry={e} liveStatus={liveStatuses[e.transaction_id]} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
