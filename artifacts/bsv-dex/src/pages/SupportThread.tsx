import { useState, useEffect, useRef } from "react";
import { useTicketReadStore } from "@/store/useTicketReadStore";
import { Link } from "wouter";
import {
  ArrowLeft, Headphones, User, Clock, CheckCircle2, Reply,
  Circle, RefreshCw, MessageCircle, AlertCircle, Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";

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
  open:    { label: "Awaiting Reply", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", icon: Clock },
  replied: { label: "Replied",        color: "text-blue-400 bg-blue-400/10 border-blue-400/20",       icon: Reply },
  closed:  { label: "Closed",         color: "text-green-400 bg-green-400/10 border-green-400/20",    icon: CheckCircle2 },
};

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)      return "just now";
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  ticketId: string;
}

export function SupportThread({ ticketId }: Props) {
  const id = parseInt(ticketId, 10);
  const { markRead } = useTicketReadStore();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const r = await fetch(`${BASE}/api/support/tickets/${id}`);
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error ?? "Ticket not found");
      }
      const data: Ticket = await r.json();
      setTicket(data);
      setError(null);
      markRead(id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLastChecked(Date.now());
    }
  };

  useEffect(() => {
    if (!id || isNaN(id)) { setError("Invalid ticket ID"); setLoading(false); return; }
    load();
    pollRef.current = setInterval(load, 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id]);

  const hasReply = !!ticket?.adminReply;
  const statusMeta = STATUS_META[ticket?.status ?? "open"] ?? STATUS_META.open;
  const StatusIcon = statusMeta.icon;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/support" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Support
          </Link>
          <BrandLogo size="sm" />
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
            <RefreshCw className="w-7 h-7 animate-spin opacity-40" />
            <p className="text-sm">Loading your support ticket…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <AlertCircle className="w-10 h-10 text-red-400 opacity-60" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link href="/support" className="text-sm text-primary hover:underline">Return to Support</Link>
          </div>
        ) : ticket && (
          <>
            {/* ── Ticket header ── */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h1 className="text-base font-bold text-foreground leading-tight">{ticket.subject}</h1>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ticket #{ticket.id} · {ticket.category} · opened {relTime(ticket.createdAt)}
                  </p>
                </div>
                <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shrink-0", statusMeta.color)}>
                  <StatusIcon className="w-3 h-3" />
                  {statusMeta.label}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3 mt-2">
                <span className="flex items-center gap-1.5"><User className="w-3 h-3" />{ticket.name}</span>
                <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" />{ticket.email}</span>
              </div>
            </div>

            {/* ── No reply yet: status banner ── */}
            {!hasReply && ticket.status !== "closed" && (
              <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-2xl px-5 py-4 flex items-start gap-3">
                <Clock className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow-400">Awaiting reply</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Our support team typically responds within 24 hours. This page auto-refreshes every 30 seconds.
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-2">
                    Last checked {relTime(new Date(lastChecked).toISOString())}
                  </p>
                </div>
              </div>
            )}

            {/* ── Thread ── */}
            <div className="space-y-4">
              {/* User message */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold">{ticket.name}</span>
                    <span className="text-[10px] text-muted-foreground">{relTime(ticket.createdAt)}</span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground border border-border uppercase tracking-wide">You</span>
                  </div>
                  <div className="bg-card border border-border rounded-2xl rounded-tl-sm p-4">
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{ticket.message}</p>
                  </div>
                </div>
              </div>

              {/* Admin reply */}
              {hasReply && (
                <div className="flex items-start gap-3 flex-row-reverse">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Headphones className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-end gap-2 mb-1.5">
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 uppercase tracking-wide">OrahDEX Support</span>
                      {ticket.repliedAt && (
                        <span className="text-[10px] text-muted-foreground">{relTime(ticket.repliedAt)}</span>
                      )}
                    </div>
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl rounded-tr-sm p-4">
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{ticket.adminReply}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Closed banner ── */}
            {ticket.status === "closed" && (
              <div className="bg-green-400/5 border border-green-400/20 rounded-2xl px-5 py-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-400">Ticket closed</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This support ticket has been resolved and closed. If you have another question, please{" "}
                    <Link href="/support" className="text-primary hover:underline">open a new ticket</Link>.
                  </p>
                </div>
              </div>
            )}

            {/* ── New ticket CTA ── */}
            <div className="text-center pt-2">
              <p className="text-xs text-muted-foreground mb-2">Need further assistance?</p>
              <Link href="/support" className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-xs font-semibold hover:border-primary/40 transition-colors">
                <MessageCircle className="w-3.5 h-3.5" />
                Open New Ticket
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
