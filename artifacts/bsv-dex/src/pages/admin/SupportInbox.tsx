import { useState, useEffect, useRef, useCallback } from "react";
import {
  Headphones, Inbox, RefreshCw, Search, X, Send, CheckCircle2,
  Clock, Circle, ChevronRight, AlertCircle, Filter, MessageSquare,
  User, Mail, Tag, Calendar, Reply, Trash2, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Ticket {
  id: number;
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
  status: string;
  priority: string;
  adminReply?: string;
  repliedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  open:    { label: "Open",    color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", icon: Circle },
  replied: { label: "Replied", color: "text-blue-400 bg-blue-400/10 border-blue-400/20",     icon: Reply },
  closed:  { label: "Closed",  color: "text-green-400 bg-green-400/10 border-green-400/20",  icon: CheckCircle2 },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  urgent: { label: "Urgent", color: "text-red-400 bg-red-400/10 border-red-400/20" },
  high:   { label: "High",   color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
  normal: { label: "Normal", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  low:    { label: "Low",    color: "text-muted-foreground bg-muted/10 border-border" },
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)       return "just now";
  if (diff < 3_600_000)    return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)   return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000)  return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.open;
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border", meta.color)}>
      <Icon className="w-2.5 h-2.5" />
      {meta.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.normal;
  return (
    <span className={cn("inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded border", meta.color)}>
      {meta.label}
    </span>
  );
}

export function AdminSupportInbox() {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [closing, setClosing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/admin/support/tickets`);
      if (!r.ok) return;
      const data: Ticket[] = await r.json();
      setTickets(data);
      setSelected(prev => prev ? (data.find(t => t.id === prev.id) ?? prev) : null);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const patchTicket = async (id: number, body: object) => {
    const r = await fetch(`${BASE}/api/admin/support/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("Update failed");
    return r.json() as Promise<Ticket>;
  };

  const handleReply = async () => {
    if (!selected || !reply.trim()) return;
    setReplying(true);
    try {
      const updated = await patchTicket(selected.id, { adminReply: reply.trim() });
      setSelected(updated);
      setTickets(ts => ts.map(t => t.id === updated.id ? updated : t));
      setReply("");
      toast({ title: "Reply sent" });
    } catch (err: any) {
      toast({ title: "Failed to send reply", description: err.message, variant: "destructive" });
    } finally {
      setReplying(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selected) return;
    setClosing(true);
    try {
      const updated = await patchTicket(selected.id, { status });
      setSelected(updated);
      setTickets(ts => ts.map(t => t.id === updated.id ? updated : t));
      toast({ title: `Ticket marked as ${status}` });
    } catch (err: any) {
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
    } finally {
      setClosing(false);
    }
  };

  const handlePriorityChange = async (priority: string) => {
    if (!selected) return;
    try {
      const updated = await patchTicket(selected.id, { priority });
      setSelected(updated);
      setTickets(ts => ts.map(t => t.id === updated.id ? updated : t));
    } catch { /* silent */ }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Delete ticket #${selected.id}? This cannot be undone.`)) return;
    try {
      await fetch(`${BASE}/api/admin/support/tickets/${selected.id}`, { method: "DELETE" });
      setTickets(ts => ts.filter(t => t.id !== selected.id));
      setSelected(null);
      toast({ title: "Ticket deleted" });
    } catch (err: any) {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    }
  };

  const filtered = tickets.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.message.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  });

  const openCount   = tickets.filter(t => t.status === "open").length;
  const repliedCount = tickets.filter(t => t.status === "replied").length;
  const closedCount  = tickets.filter(t => t.status === "closed").length;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)] gap-4">

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        {[
          { label: "Total",   value: tickets.length,  color: "text-foreground" },
          { label: "Open",    value: openCount,        color: "text-yellow-400" },
          { label: "Replied", value: repliedCount,     color: "text-blue-400" },
          { label: "Closed",  value: closedCount,      color: "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
            <span className={cn("text-xl font-bold tabular-nums", s.color)}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* ── Two-panel inbox ── */}
      <div className="flex flex-1 gap-4 min-h-0">

        {/* ── Left: ticket list ── */}
        <div className="w-full sm:w-72 lg:w-80 flex flex-col bg-card border border-border rounded-2xl overflow-hidden shrink-0">
          {/* Toolbar */}
          <div className="px-3 pt-3 pb-2 border-b border-border space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search tickets…"
                  className="w-full bg-background border border-border rounded-xl pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <button
                onClick={load}
                className="p-1.5 rounded-lg hover:bg-muted/30 text-muted-foreground transition-colors shrink-0"
                title="Refresh"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              </button>
            </div>
            <div className="flex gap-1 flex-wrap">
              {["all", "open", "replied", "closed"].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors capitalize",
                    statusFilter === s
                      ? "bg-primary/15 text-primary border-primary/25"
                      : "text-muted-foreground border-border hover:border-primary/30"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-xs gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <Inbox className="w-7 h-7 opacity-20" />
                <p className="text-xs">No tickets found</p>
              </div>
            ) : filtered.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelected(t); setReply(""); }}
                className={cn(
                  "w-full text-left px-3 py-3 hover:bg-muted/20 transition-colors group",
                  selected?.id === t.id && "bg-primary/5 border-l-2 border-primary"
                )}
              >
                <div className="flex items-start justify-between gap-1.5 mb-1">
                  <p className={cn(
                    "text-xs font-semibold leading-tight truncate flex-1",
                    t.status === "open" ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {t.subject}
                  </p>
                  <StatusBadge status={t.status} />
                </div>
                <p className="text-[11px] text-muted-foreground mb-1.5 truncate">{t.name} · {t.email}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{t.message}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <PriorityBadge priority={t.priority} />
                  <span className="text-[10px] text-muted-foreground/50">{relTime(t.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: thread view ── */}
        <div className="flex-1 min-w-0 flex flex-col bg-card border border-border rounded-2xl overflow-hidden">
          {!selected ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
              <MessageSquare className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">Select a ticket to view</p>
              <p className="text-xs text-muted-foreground/60">
                {tickets.length === 0 ? "No support tickets yet." : `${openCount} open ticket${openCount !== 1 ? "s" : ""} awaiting reply.`}
              </p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="px-5 py-4 border-b border-border shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-foreground truncate">{selected.subject}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ticket #{selected.id} · {relTime(selected.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selected.status !== "closed" && (
                      <button
                        onClick={() => handleStatusChange("closed")}
                        disabled={closing}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-400/10 border border-green-400/20 text-green-400 text-xs font-semibold hover:bg-green-400/20 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Close
                      </button>
                    )}
                    {selected.status === "closed" && (
                      <button
                        onClick={() => handleStatusChange("open")}
                        disabled={closing}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-xs font-semibold hover:bg-yellow-400/20 transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" /> Reopen
                      </button>
                    )}
                    <button
                      onClick={handleDelete}
                      className="p-1.5 rounded-lg hover:bg-red-400/10 text-muted-foreground hover:text-red-400 transition-colors"
                      title="Delete ticket"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap gap-3 mt-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="w-3 h-3" /> {selected.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="w-3 h-3" /> {selected.email}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Tag className="w-3 h-3" /> {selected.category}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selected.status} />
                    <select
                      value={selected.priority}
                      onChange={e => handlePriorityChange(e.target.value)}
                      className="text-[10px] font-bold bg-transparent border-0 text-muted-foreground focus:outline-none cursor-pointer"
                    >
                      {Object.entries(PRIORITY_META).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Thread messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* User message */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold">{selected.name}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(selected.createdAt).toLocaleString()}</span>
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground border border-border uppercase">User</span>
                    </div>
                    <div className="bg-muted/20 border border-border rounded-xl p-3.5">
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{selected.message}</p>
                    </div>
                  </div>
                </div>

                {/* Admin reply (if exists) */}
                {selected.adminReply && (
                  <div className="flex items-start gap-3 flex-row-reverse">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                      <Headphones className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-end gap-2 mb-1.5">
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-green-400/10 text-green-400 border border-green-400/20 uppercase">Support</span>
                        <span className="text-[10px] text-muted-foreground">
                          {selected.repliedAt ? new Date(selected.repliedAt).toLocaleString() : ""}
                        </span>
                      </div>
                      <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3.5">
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{selected.adminReply}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Reply composer */}
              {selected.status !== "closed" && (
                <div className="px-5 py-4 border-t border-border shrink-0">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    {selected.adminReply ? "Send Another Reply" : "Reply to User"}
                  </label>
                  <textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    rows={3}
                    placeholder="Type your reply… (will be emailed to the user)"
                    className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors resize-none mb-2"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Ticket will be marked as <strong>Replied</strong> and an email sent to {selected.email}.
                    </p>
                    <button
                      onClick={handleReply}
                      disabled={replying || !reply.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:brightness-110 transition-all disabled:opacity-50 shrink-0"
                    >
                      {replying
                        ? <><RefreshCw className="w-3 h-3 animate-spin" /> Sending…</>
                        : <><Send className="w-3 h-3" /> Send Reply</>
                      }
                    </button>
                  </div>
                </div>
              )}

              {selected.status === "closed" && (
                <div className="px-5 py-3 border-t border-border shrink-0 bg-muted/10">
                  <p className="text-xs text-center text-muted-foreground">
                    This ticket is closed.{" "}
                    <button onClick={() => handleStatusChange("open")} className="text-primary hover:underline font-semibold">
                      Reopen it
                    </button>{" "}
                    to send a reply.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
