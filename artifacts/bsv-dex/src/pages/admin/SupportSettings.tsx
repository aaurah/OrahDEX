import { useState, useEffect } from "react";
import {
  Mail, MessageCircle, Inbox, HelpCircle, Save, Plus,
  Trash2, Edit3, Check, X, ChevronDown, ChevronUp,
  Eye, EyeOff, RefreshCw, Send, Clock, AlertCircle,
  CheckCircle2, Circle, Reply, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tab = "emails" | "chat" | "tickets" | "faqs";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "emails",  label: "Email Setup",  icon: Mail },
  { id: "chat",    label: "Live Chat",    icon: MessageCircle },
  { id: "tickets", label: "Tickets",      icon: Inbox },
  { id: "faqs",    label: "FAQ Manager",  icon: HelpCircle },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-400 bg-red-400/10 border-red-400/20",
  high:   "text-orange-400 bg-orange-400/10 border-orange-400/20",
  normal: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  low:    "text-muted-foreground bg-muted/10 border-border",
};

const STATUS_COLORS: Record<string, string> = {
  open:    "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  replied: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  closed:  "text-green-400 bg-green-400/10 border-green-400/20",
};

const FAQ_CATEGORIES = [
  "general", "trading", "wallet", "withdrawal", "kyc", "technical", "fees", "security",
];

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
}

interface Faq {
  id: number;
  question: string;
  answer: string;
  category: string;
  isPublished: boolean;
  createdAt: string;
}

/* ── EMAIL SETUP TAB ────────────────────────────────────────────────────────── */
function EmailSetupTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    support_email: "support@orahdex.com",
    support_email_legal: "legal@orahdex.com",
    support_email_billing: "billing@orahdex.com",
    support_email_press: "press@orahdex.com",
    support_email_privacy: "privacy@orahdex.com",
    support_response_time: "< 2 hours",
    support_hours: "24/7",
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/admin/support/settings`)
      .then(r => r.json())
      .then(data => {
        setSettings(s => ({ ...s, ...data }));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/admin/support/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!r.ok) throw new Error("Save failed");
      toast({ title: "Email settings saved" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const emailFields = [
    { key: "support_email",         label: "Support Email",  hint: "Primary support address — shown on Support page and auto-CC'd on tickets" },
    { key: "support_email_legal",   label: "Legal Email",    hint: "For legal inquiries, DMCA notices, and compliance" },
    { key: "support_email_billing", label: "Billing Email",  hint: "For billing and payment disputes" },
    { key: "support_email_press",   label: "Press Email",    hint: "For media and press inquiries" },
    { key: "support_email_privacy", label: "Privacy Email",  hint: "For privacy requests, data deletions (GDPR/CCPA)" },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold text-sm mb-1">Platform Email Addresses</h3>
        <p className="text-xs text-muted-foreground mb-5">These addresses are displayed on the Support page and used for outbound communications. Make sure each address is valid and monitored.</p>
        <div className="space-y-4">
          {emailFields.map(f => (
            <div key={f.key}>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">{f.label}</label>
              <input
                type="email"
                value={(settings as any)[f.key]}
                onChange={e => setSettings(s => ({ ...s, [f.key]: e.target.value }))}
                placeholder={`e.g. ${f.key.replace("support_email_", "").replace("support_email", "support")}@orahdex.com`}
                className="w-full max-w-sm bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors font-mono"
              />
              <p className="text-[11px] text-muted-foreground mt-1">{f.hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold text-sm mb-4">Support SLA Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Support Hours</label>
            <input
              value={settings.support_hours}
              onChange={e => setSettings(s => ({ ...s, support_hours: e.target.value }))}
              placeholder="e.g. 24/7 or Mon-Fri 9am-6pm UTC"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Response Time</label>
            <input
              value={settings.support_response_time}
              onChange={e => setSettings(s => ({ ...s, support_response_time: e.target.value }))}
              placeholder="e.g. &lt; 2 hours"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving || !loaded}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Email Settings
        </button>
      </div>
    </div>
  );
}

/* ── LIVE CHAT TAB ──────────────────────────────────────────────────────────── */
function LiveChatTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    support_chat_enabled: "true",
    support_chat_welcome: "Hi! Welcome to OrahDEX Support. How can I help you today?",
    support_chat_offline_msg: "We're currently offline. Leave your message and we'll get back to you within 24 hours.",
    support_telegram_url: "",
    support_discord_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/admin/support/settings`)
      .then(r => r.json())
      .then(data => { setSettings(s => ({ ...s, ...data })); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/admin/support/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!r.ok) throw new Error("Save failed");
      toast({ title: "Chat settings saved" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const chatEnabled = settings.support_chat_enabled !== "false";

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-sm">Live Chat Widget</h3>
            <p className="text-xs text-muted-foreground mt-0.5">The floating chat button on the Support page</p>
          </div>
          <button
            onClick={() => setSettings(s => ({ ...s, support_chat_enabled: chatEnabled ? "false" : "true" }))}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
              chatEnabled
                ? "bg-green-500/10 border-green-500/20 text-green-400"
                : "bg-muted/20 border-border text-muted-foreground"
            )}
          >
            <div className={cn("w-1.5 h-1.5 rounded-full", chatEnabled ? "bg-green-400 animate-pulse" : "bg-muted-foreground")} />
            {chatEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Welcome Message</label>
            <textarea
              value={settings.support_chat_welcome}
              onChange={e => setSettings(s => ({ ...s, support_chat_welcome: e.target.value }))}
              rows={2}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Shown as the first message when a user opens the chat</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Offline Message</label>
            <textarea
              value={settings.support_chat_offline_msg}
              onChange={e => setSettings(s => ({ ...s, support_chat_offline_msg: e.target.value }))}
              rows={2}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold text-sm mb-4">Community Channels</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Telegram URL</label>
            <input
              value={settings.support_telegram_url}
              onChange={e => setSettings(s => ({ ...s, support_telegram_url: e.target.value }))}
              placeholder="https://t.me/orahdex"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Discord URL</label>
            <input
              value={settings.support_discord_url}
              onChange={e => setSettings(s => ({ ...s, support_discord_url: e.target.value }))}
              placeholder="https://discord.gg/orahdex"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving || !loaded}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Chat Settings
        </button>
      </div>
    </div>
  );
}

/* ── TICKETS TAB ────────────────────────────────────────────────────────────── */
function TicketsTab() {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/support/tickets`);
      setTickets(await r.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = statusFilter === "all" ? tickets : tickets.filter(t => t.status === statusFilter);

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setReplying(true);
    try {
      const r = await fetch(`${BASE}/api/admin/support/tickets/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminReply: reply.trim() }),
      });
      const updated = await r.json();
      setTickets(ts => ts.map(t => t.id === updated.id ? updated : t));
      setSelected(updated);
      setReply("");
      toast({ title: "Reply sent to user" });
    } catch {
      toast({ title: "Failed to send reply", variant: "destructive" });
    } finally {
      setReplying(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      const r = await fetch(`${BASE}/api/admin/support/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const updated = await r.json();
      setTickets(ts => ts.map(t => t.id === updated.id ? updated : t));
      if (selected?.id === id) setSelected(updated);
      toast({ title: `Ticket ${status}` });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const deleteTicket = async (id: number) => {
    if (!confirm("Delete this ticket permanently?")) return;
    try {
      await fetch(`${BASE}/api/admin/support/tickets/${id}`, { method: "DELETE" });
      setTickets(ts => ts.filter(t => t.id !== id));
      if (selected?.id === id) setSelected(null);
      toast({ title: "Ticket deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === "open").length,
    replied: tickets.filter(t => t.status === "replied").length,
    closed: tickets.filter(t => t.status === "closed").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(["all", "open", "replied", "closed"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all",
                statusFilter === s ? "bg-primary/15 text-primary border border-primary/25" : "text-muted-foreground hover:text-foreground border border-border hover:border-primary/30"
              )}
            >
              {s} <span className="ml-1 text-[10px] opacity-70">({counts[s]})</span>
            </button>
          ))}
        </div>
        <button onClick={load} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ticket list */}
        <div className="space-y-2 lg:max-h-[600px] lg:overflow-y-auto pr-1">
          {loading && (
            <div className="py-10 text-center text-muted-foreground text-sm">Loading tickets...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm">
              No {statusFilter !== "all" ? statusFilter : ""} tickets
            </div>
          )}
          {filtered.map(ticket => (
            <div
              key={ticket.id}
              onClick={() => setSelected(ticket)}
              className={cn(
                "bg-card border rounded-xl p-4 cursor-pointer hover:border-primary/30 transition-all",
                selected?.id === ticket.id ? "border-primary/50 bg-primary/5" : "border-border"
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground">#{ticket.id}</span>
                    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-md border capitalize", STATUS_COLORS[ticket.status] ?? STATUS_COLORS.open)}>
                      {ticket.status}
                    </span>
                    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-md border capitalize", PRIORITY_COLORS[ticket.priority] ?? PRIORITY_COLORS.normal)}>
                      {ticket.priority}
                    </span>
                  </div>
                  <p className="text-sm font-semibold truncate">{ticket.subject}</p>
                  <p className="text-xs text-muted-foreground truncate">{ticket.name} · {ticket.email}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{ticket.message}</p>
            </div>
          ))}
        </div>

        {/* Ticket detail */}
        {selected ? (
          <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground">#{selected.id}</span>
                    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-md border capitalize", STATUS_COLORS[selected.status] ?? STATUS_COLORS.open)}>
                      {selected.status}
                    </span>
                  </div>
                  <h4 className="font-semibold text-sm">{selected.subject}</h4>
                  <p className="text-xs text-muted-foreground">{selected.name} · {selected.email}</p>
                  <p className="text-xs text-muted-foreground">{selected.category} · {new Date(selected.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {selected.status !== "closed" && (
                    <button
                      onClick={() => updateStatus(selected.id, "closed")}
                      className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                      title="Mark as closed"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {selected.status === "closed" && (
                    <button
                      onClick={() => updateStatus(selected.id, "open")}
                      className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                      title="Reopen"
                    >
                      <Circle className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteTicket(selected.id)}
                    className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    title="Delete ticket"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-48">
              <div className="bg-background/60 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">User message</p>
                <p className="text-sm whitespace-pre-wrap">{selected.message}</p>
              </div>
              {selected.adminReply && (
                <div className="bg-primary/5 border border-primary/15 rounded-xl p-3">
                  <p className="text-[10px] text-primary mb-1 uppercase tracking-wide">Your reply · {selected.repliedAt ? new Date(selected.repliedAt).toLocaleString() : ""}</p>
                  <p className="text-sm whitespace-pre-wrap">{selected.adminReply}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border space-y-2">
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={3}
                placeholder="Type your reply... It will be emailed to the user."
                className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-primary/50 transition-colors"
              />
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">Reply will be sent to {selected.email}</p>
                <button
                  onClick={sendReply}
                  disabled={replying || !reply.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-xs hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {replying ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  Send Reply
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-dashed border-border rounded-2xl flex items-center justify-center p-10 text-center">
            <div>
              <Inbox className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Select a ticket to view details and reply</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── FAQ MANAGER TAB ────────────────────────────────────────────────────────── */
function FaqsTab() {
  const { toast } = useToast();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFaq, setNewFaq] = useState({ question: "", answer: "", category: "general", isPublished: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/support/faqs`);
      setFaqs(await r.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const createFaq = async () => {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) {
      toast({ title: "Question and answer are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/admin/support/faqs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newFaq),
      });
      const created = await r.json();
      setFaqs(f => [...f, created]);
      setNewFaq({ question: "", answer: "", category: "general", isPublished: true });
      setCreating(false);
      toast({ title: "FAQ created" });
    } catch {
      toast({ title: "Failed to create FAQ", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const updateFaq = async (faq: Faq) => {
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/admin/support/faqs/${faq.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(faq),
      });
      const updated = await r.json();
      setFaqs(f => f.map(x => x.id === updated.id ? updated : x));
      setEditing(null);
      toast({ title: "FAQ updated" });
    } catch {
      toast({ title: "Failed to update FAQ", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const togglePublish = async (faq: Faq) => {
    try {
      const r = await fetch(`${BASE}/api/admin/support/faqs/${faq.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !faq.isPublished }),
      });
      const updated = await r.json();
      setFaqs(f => f.map(x => x.id === updated.id ? updated : x));
    } catch { /* silent */ }
  };

  const deleteFaq = async (id: number) => {
    if (!confirm("Delete this FAQ?")) return;
    try {
      await fetch(`${BASE}/api/admin/support/faqs/${id}`, { method: "DELETE" });
      setFaqs(f => f.filter(x => x.id !== id));
      toast({ title: "FAQ deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{faqs.length} FAQs · {faqs.filter(f => f.isPublished).length} published</p>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:brightness-110 transition-all"
        >
          <Plus className="w-4 h-4" /> Add FAQ
        </button>
      </div>

      {creating && (
        <div className="bg-card border border-primary/30 rounded-2xl p-5 space-y-4">
          <h4 className="font-semibold text-sm">New FAQ</h4>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Question</label>
            <input
              value={newFaq.question}
              onChange={e => setNewFaq(f => ({ ...f, question: e.target.value }))}
              placeholder="What is...?"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Answer</label>
            <textarea
              value={newFaq.answer}
              onChange={e => setNewFaq(f => ({ ...f, answer: e.target.value }))}
              rows={4}
              placeholder="Detailed answer..."
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Category</label>
              <select
                value={newFaq.category}
                onChange={e => setNewFaq(f => ({ ...f, category: e.target.value }))}
                className="bg-background border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary/50"
              >
                {FAQ_CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={() => setNewFaq(f => ({ ...f, isPublished: !f.isPublished }))}
                className={cn("text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all", newFaq.isPublished ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-muted/10 border-border text-muted-foreground")}
              >
                {newFaq.isPublished ? "Published" : "Draft"}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createFaq}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Create FAQ
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && <div className="py-10 text-center text-muted-foreground text-sm">Loading FAQs...</div>}

      <div className="space-y-2">
        {faqs.map(faq => (
          <div key={faq.id} className="bg-card border border-border rounded-xl overflow-hidden">
            {editing?.id === faq.id ? (
              <div className="p-4 space-y-3">
                <input
                  value={editing.question}
                  onChange={e => setEditing(f => f && ({ ...f, question: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50"
                />
                <textarea
                  value={editing.answer}
                  onChange={e => setEditing(f => f && ({ ...f, answer: e.target.value }))}
                  rows={3}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-primary/50"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={editing.category}
                    onChange={e => setEditing(f => f && ({ ...f, category: e.target.value }))}
                    className="bg-background border border-border rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-primary/50"
                  >
                    {FAQ_CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                  <button onClick={() => updateFaq(editing)} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold disabled:opacity-50">
                    <Check className="w-3 h-3" /> Save
                  </button>
                  <button onClick={() => setEditing(null)} className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-md border capitalize", faq.isPublished ? "text-green-400 bg-green-400/10 border-green-400/20" : "text-muted-foreground bg-muted/10 border-border")}>
                        {faq.isPublished ? "Published" : "Draft"}
                      </span>
                      <span className="text-[10px] text-muted-foreground capitalize">{faq.category}</span>
                    </div>
                    <p className="font-semibold text-sm mb-1">{faq.question}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{faq.answer}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => togglePublish(faq)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground" title={faq.isPublished ? "Unpublish" : "Publish"}>
                      {faq.isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => setEditing(faq)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteFaq(faq.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && faqs.length === 0 && (
          <div className="py-10 text-center text-muted-foreground text-sm">
            No FAQs yet. Click "Add FAQ" to create your first one.
          </div>
        )}
      </div>
    </div>
  );
}

/* ── MAIN COMPONENT ─────────────────────────────────────────────────────────── */
export function AdminSupportSettings() {
  const [tab, setTab] = useState<Tab>("emails");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Support & Contact Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage support emails, live chat, ticket inbox, and FAQ content for users.</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap -mb-px",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "emails"  && <EmailSetupTab />}
      {tab === "chat"    && <LiveChatTab />}
      {tab === "tickets" && <TicketsTab />}
      {tab === "faqs"    && <FaqsTab />}
    </div>
  );
}
