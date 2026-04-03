import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail, Inbox, Send, Star, Trash2, RefreshCw, Search, Plus,
  X, ChevronLeft, ChevronDown, Eye, EyeOff, ArrowUp, Circle,
  CheckCircle2, AlertCircle, Settings, Zap, Shield,
  Copy, Check, ExternalLink,
  Server, Lock, User, AtSign, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Email {
  id: number;
  folder: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  isRead: boolean;
  isStarred: boolean;
  category: string;
  createdAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  system:  "bg-violet-400/10 text-violet-400 border-violet-400/20",
  support: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  contact: "bg-green-400/10 text-green-400 border-green-400/20",
  general: "bg-secondary text-muted-foreground border-border",
};

const CATEGORY_ICONS: Record<string, any> = {
  system:  Settings,
  support: Zap,
  contact: Mail,
  general: Circle,
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Mobile panel navigation: 'sidebar' → 'list' → 'detail'
type MobilePanel = "sidebar" | "list" | "detail";

export function AdminEmailInbox() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [folder, setFolder] = useState<string>("inbox");
  const [selected, setSelected] = useState<Email | null>(null);
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);
  const [compose, setCompose] = useState({ from: "support@orahdex.org", to: "", subject: "", body: "" });
  const [fromOpen, setFromOpen] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("list");
  const [showMailSetup, setShowMailSetup] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyField = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };


  const webhookUrl = `${window.location.origin}${BASE}/api/webhook/email-inbound`;
  const copyWebhook = () => {
    navigator.clipboard?.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const FROM_OPTIONS = [
    { value: "support@orahdex.org",  label: "support@orahdex.org",  color: "text-primary" },
    { value: "legal@orahdex.org",    label: "legal@orahdex.org",    color: "text-violet-400" },
    { value: "privacy@orahdex.org",  label: "privacy@orahdex.org",  color: "text-blue-400" },
    { value: "admin@orahdex.org",    label: "admin@orahdex.org",    color: "text-muted-foreground" },
  ];

  const { data: emails = [], isLoading, refetch } = useQuery<Email[]>({
    queryKey: ["admin-mail", folder],
    queryFn: () => fetch(`${BASE}/api/admin/mail?folder=${folder}`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const patchEmail = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Email> }) =>
      fetch(`${BASE}/api/admin/mail/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-mail"] }),
  });

  const deleteEmail = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE}/api/admin/mail/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-mail"] });
      setSelected(null);
      toast({ title: "Email deleted" });
    },
  });

  const sendEmail = useMutation({
    mutationFn: (data: typeof compose) =>
      fetch(`${BASE}/api/admin/mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: "sent",
          fromAddress: data.from,
          toAddress: data.to,
          subject: data.subject,
          body: data.body,
          category: "general",
        }),
      }).then(r => r.json()),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["admin-mail"] });
      setComposing(false);
      setCompose({ from: "support@orahdex.org", to: "", subject: "", body: "" });
      toast({ title: "Saved to Sent folder", description: "Message saved. Configure your mail client using the setup guide to send real emails." });
    },
  });

  const openEmail = async (email: Email) => {
    setSelected(email);
    setMobilePanel("detail");
    if (!email.isRead) {
      patchEmail.mutate({ id: email.id, data: { isRead: true } });
    }
  };

  const selectFolder = (id: string) => {
    setFolder(id);
    setSelected(null);
    setMobilePanel("list");
  };

  const filtered = emails.filter(e =>
    !search ||
    e.subject.toLowerCase().includes(search.toLowerCase()) ||
    e.fromAddress.toLowerCase().includes(search.toLowerCase()) ||
    e.body.toLowerCase().includes(search.toLowerCase())
  );

  const unreadCount = emails.filter(e => !e.isRead).length;

  const FOLDERS = [
    { id: "inbox", label: "Inbox", icon: Inbox },
    { id: "sent",  label: "Sent",  icon: Send },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Email Inbox
            {unreadCount > 0 && (
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            System notifications, contact forms, and platform alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowMailSetup(true)}
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
            title="Mail client setup (Thunderbird / Apple Mail)"
          >
            <Server className="w-4 h-4" />
          </button>
          <button
            onClick={() => setComposing(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            Compose
          </button>
        </div>
      </div>


      {/* Mail Client Setup Modal */}
      {showMailSetup && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Server className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Mail Client Setup</h3>
                  <p className="text-[10px] text-muted-foreground">Thunderbird · Apple Mail · Outlook</p>
                </div>
              </div>
              <button onClick={() => setShowMailSetup(false)} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto p-5 space-y-5">

              {/* Account list */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <AtSign className="w-3 h-3" /> OrahDEX Email Accounts
                </p>
                <div className="space-y-2">
                  {[
                    { addr: "support@orahdex.org",  color: "text-primary",          label: "Support (primary)" },
                    { addr: "support@orahdex.com",  color: "text-primary",          label: "Support (.com alias)" },
                    { addr: "admin@orahdex.org",    color: "text-violet-400",       label: "Admin" },
                    { addr: "legal@orahdex.org",    color: "text-blue-400",         label: "Legal & Compliance" },
                    { addr: "contact@orahdex.org",  color: "text-green-400",        label: "General Contact" },
                    { addr: "privacy@orahdex.org",  color: "text-cyan-400",         label: "Privacy / GDPR" },
                    { addr: "billing@orahdex.org",  color: "text-amber-400",        label: "Billing" },
                    { addr: "press@orahdex.org",    color: "text-orange-400",       label: "Press & Media" },
                  ].map(({ addr, color, label }) => (
                    <div key={addr} className="flex items-center gap-3 p-3 bg-secondary/50 border border-border rounded-xl">
                      <AtSign className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-mono font-semibold ${color}`}>{addr}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                      </div>
                      <button
                        onClick={() => copyField(addr, addr)}
                        className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                      >
                        {copiedField === addr ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Thunderbird connection settings */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <Server className="w-3 h-3" /> Mail Server Settings (for any account above)
                </p>
                <div className="space-y-2">
                  {[
                    { key: "imap_host",  icon: Inbox,  label: "Incoming Server (IMAP)", value: "mail.orahdex.org" },
                    { key: "imap_port",  icon: Lock,   label: "IMAP Port",              value: "993" },
                    { key: "imap_sec",   icon: Shield, label: "IMAP Security",          value: "SSL/TLS" },
                    { key: "smtp_host",  icon: Send,   label: "Outgoing Server (SMTP)", value: "mail.orahdex.org" },
                    { key: "smtp_port",  icon: Lock,   label: "SMTP Port",              value: "465" },
                    { key: "smtp_sec",   icon: Shield, label: "SMTP Security",          value: "SSL/TLS" },
                    { key: "auth",       icon: User,   label: "Username",               value: "your full email address" },
                  ].map(({ key, icon: Icon, label, value }) => (
                    <div key={key} className="flex items-center gap-3 p-3 bg-secondary/50 border border-border rounded-xl">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{label}</p>
                        <p className="text-sm font-mono text-foreground mt-0.5">{value}</p>
                      </div>
                      {!value.includes(" ") && (
                        <button
                          onClick={() => copyField(key, value)}
                          className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                        >
                          {copiedField === key ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Thunderbird step-by-step */}
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <Info className="w-3 h-3" /> Thunderbird — Add Account (step by step)
                </p>
                <ol className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                  {[
                    "Open Thunderbird → hamburger menu → New Account → Email",
                    "Your name: OrahDEX   ·   Email: support@orahdex.org (or whichever account)",
                    "Password: your mailbox password   →   click Continue",
                    "If auto-detect fails, click Configure Manually",
                    "Incoming: IMAP · mail.orahdex.org · Port 993 · SSL/TLS · Normal password",
                    "Outgoing: SMTP · mail.orahdex.org · Port 465 · SSL/TLS · Normal password",
                    "Username (both): your full email address (e.g. support@orahdex.org)",
                    "Click Re-test — Thunderbird will verify, then click Done",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[9px] font-black text-primary mt-0.5">
                        {i + 1}
                      </span>
                      <span className={i >= 4 && i <= 7 ? "font-mono text-foreground/90" : ""}>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Autoconfig download */}
              <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-xl">
                <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-primary" /> Thunderbird Auto-Configure File
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                  Thunderbird can auto-detect the server settings if you place this config file at <code className="font-mono text-primary">autoconfig.orahdex.org/mail/config-v1.1.xml</code> or point your DNS <code className="font-mono text-primary">autoconfig</code> CNAME to this server. The file is already served from this app.
                </p>
                <a
                  href={`${window.location.origin}${BASE}/.well-known/autoconfig/mail/config-v1.1.xml`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
                >
                  View autoconfig XML <ExternalLink className="w-3 h-3" />
                </a>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Compose Modal */}
      {composing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                New Message
              </h3>
              <button onClick={() => setComposing(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {/* From selector */}
              <div className="flex flex-col gap-1 relative">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">From</label>
                <button
                  type="button"
                  onClick={() => setFromOpen(o => !o)}
                  className="w-full flex items-center justify-between bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                >
                  <span className={cn("font-mono font-medium", FROM_OPTIONS.find(o => o.value === compose.from)?.color ?? "text-foreground")}>
                    {compose.from}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", fromOpen && "rotate-180")} />
                </button>
                {fromOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                    {FROM_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setCompose(c => ({ ...c, from: opt.value })); setFromOpen(false); }}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-white/5 transition-colors",
                          compose.from === opt.value && "bg-primary/8"
                        )}
                      >
                        <span className={cn("font-mono font-medium", opt.color)}>{opt.label}</span>
                        {compose.from === opt.value && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">To</label>
                <input
                  value={compose.to}
                  onChange={e => setCompose(c => ({ ...c, to: e.target.value }))}
                  placeholder="recipient@example.com"
                  className="bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Subject</label>
                <input
                  value={compose.subject}
                  onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))}
                  placeholder="Message subject"
                  className="bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Message</label>
                <textarea
                  value={compose.body}
                  onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                  placeholder="Type your message..."
                  rows={8}
                  className="bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setComposing(false)}
                  className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => sendEmail.mutate(compose)}
                  disabled={sendEmail.isPending || !compose.to || !compose.subject || !compose.body}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-60"
                >
                  {sendEmail.isPending ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending…</>
                  ) : (
                    <><Send className="w-3.5 h-3.5" />Send</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile top nav bar (shown only on mobile) */}
      <div className="flex md:hidden items-center gap-1 bg-card border border-border rounded-2xl p-1.5">
        {(["sidebar", "list", "detail"] as MobilePanel[]).filter(p => p !== "detail" || !!selected).map((p, i) => {
          const labels: Record<MobilePanel, string> = { sidebar: "Folders", list: folder === "inbox" ? "Inbox" : "Sent", detail: "Message" };
          const isActive = mobilePanel === p;
          return (
            <button
              key={p}
              onClick={() => {
                if (p === "detail" && selected) setMobilePanel("detail");
                else if (p === "list") setMobilePanel("list");
                else setMobilePanel("sidebar");
              }}
              className={cn(
                "flex-1 py-2 rounded-xl text-xs font-semibold transition-all",
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {labels[p]}
            </button>
          );
        })}
      </div>

      <div className="flex gap-4 h-[calc(100vh-260px)] min-h-[480px]">
        {/* Sidebar — full screen on mobile when mobilePanel=sidebar, w-56 on desktop */}
        <div className={cn(
          "flex flex-col gap-1 md:w-52 md:shrink-0",
          "md:flex", // always show on desktop
          mobilePanel === "sidebar" ? "flex w-full" : "hidden" // mobile: show only when sidebar panel active
        )}>
          {FOLDERS.map(f => {
            const count = f.id === "inbox" ? unreadCount : 0;
            return (
              <button
                key={f.id}
                onClick={() => selectFolder(f.id)}
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  folder === f.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <f.icon className="w-4 h-4 shrink-0" />
                  {f.label}
                </div>
                {count > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground min-w-[18px] text-center">
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold px-3 mb-2">Platform Emails</p>
            {[
              { label: "support@orahdex.org",  color: "text-primary" },
              { label: "legal@orahdex.org",    color: "text-violet-400" },
              { label: "privacy@orahdex.org",  color: "text-blue-400" },
            ].map(e => (
              <div key={e.label} className={cn("px-3 py-1.5 text-[10px] font-mono font-medium truncate", e.color)}>
                {e.label}
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold px-3 mb-2">Inbound Webhook</p>
            <div className="px-3 space-y-2">
              <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
                Point Mailgun / SendGrid / Postmark inbound routing to this URL to receive emails in this inbox:
              </p>
              <div className="flex items-center gap-1.5 p-2 bg-secondary/50 border border-border rounded-lg">
                <span className="text-[8px] font-mono text-primary/80 flex-1 min-w-0 truncate">/api/webhook/email-inbound</span>
                <button onClick={copyWebhook} className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors">
                  {copiedWebhook ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Email list — hidden on mobile when not in list panel, OR when detail is open (desktop shows split) */}
        <div className={cn(
          "flex flex-col bg-card border border-border rounded-2xl overflow-hidden min-w-0",
          "md:flex", // always show on desktop
          mobilePanel === "list" ? "flex flex-1" : "hidden md:flex md:flex-1", // mobile: only show when list panel active
        )}>
          {/* Search bar */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search emails…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Main split view */}
          <div className="flex flex-1 overflow-hidden">
            {/* List column */}
            <div className={cn(
              "flex flex-col overflow-y-auto border-r border-border",
              selected ? "w-72 shrink-0 hidden md:flex" : "w-full"
            )}>
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground p-8">
                  <Inbox className="w-8 h-8 opacity-30" />
                  <p className="text-sm font-medium">No emails in {folder}</p>
                </div>
              ) : (
                filtered.map(email => {
                  const CatIcon = CATEGORY_ICONS[email.category] ?? Circle;
                  return (
                    <button
                      key={email.id}
                      onClick={() => openEmail(email)}
                      className={cn(
                        "w-full text-left px-4 py-3.5 border-b border-border/60 transition-all hover:bg-white/3",
                        selected?.id === email.id && "bg-primary/5 border-l-2 border-l-primary",
                        !email.isRead && "bg-white/2"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500/20 to-primary/20 border border-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                          <CatIcon className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className={cn("text-xs truncate", !email.isRead ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>
                              {email.fromAddress}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(email.createdAt)}</span>
                          </div>
                          <p className={cn("text-sm truncate", !email.isRead ? "font-semibold text-foreground" : "text-muted-foreground")}>
                            {email.subject}
                          </p>
                          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                            {email.body.slice(0, 80)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Email detail */}
            {selected ? (
              <div className={cn(
                "flex-1 flex-col overflow-hidden",
                "md:flex", // always on desktop
                mobilePanel === "detail" ? "flex" : "hidden md:flex" // mobile: only when detail panel active
              )}>
                {/* Detail header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
                  <button
                    onClick={() => { setSelected(null); setMobilePanel("list"); }}
                    className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors md:hidden"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      onClick={() => patchEmail.mutate({ id: selected.id, data: { isStarred: !selected.isStarred } })}
                      className={cn(
                        "p-2 rounded-xl border transition-all",
                        selected.isStarred
                          ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-400"
                          : "border-border text-muted-foreground hover:text-yellow-400 hover:border-yellow-400/30"
                      )}
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => patchEmail.mutate({ id: selected.id, data: { isRead: !selected.isRead } })}
                      className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-all"
                      title={selected.isRead ? "Mark unread" : "Mark read"}
                    >
                      {selected.isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => deleteEmail.mutate(selected.id)}
                      className="p-2 rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Detail body */}
                <div className="flex-1 overflow-y-auto p-5">
                  <h2 className="text-lg font-bold text-foreground leading-tight mb-4">
                    {selected.subject}
                  </h2>

                  <div className="flex items-start gap-3 mb-6 p-4 bg-secondary/40 rounded-2xl border border-border">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/25 to-primary/20 border border-primary/15 flex items-center justify-center shrink-0 text-sm font-black text-primary">
                      {selected.fromAddress.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{selected.fromAddress}</span>
                        <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border", CATEGORY_COLORS[selected.category] ?? CATEGORY_COLORS.general)}>
                          {selected.category}
                        </span>
                        {selected.isStarred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        To: <span className="font-mono">{selected.toAddress}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(selected.createdAt).toLocaleString("en-GB", {
                          day: "numeric", month: "long", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="prose prose-invert prose-sm max-w-none">
                    {selected.body.split("\n").map((line, i) => (
                      <p key={i} className={cn("text-sm leading-relaxed", line === "" ? "mt-3" : "text-foreground/85")}>
                        {line || "\u00a0"}
                      </p>
                    ))}
                  </div>

                  {/* Quick reply */}
                  <div className="mt-8 p-4 bg-secondary/30 border border-border rounded-2xl">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-3">Quick Reply</p>
                    <div className="flex gap-2">
                      <input
                        placeholder={`Reply to ${selected.fromAddress}…`}
                        className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            setCompose({ from: selected.toAddress ?? "support@orahdex.org", to: selected.fromAddress, subject: `Re: ${selected.subject}`, body: (e.target as HTMLInputElement).value });
                            setComposing(true);
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          setCompose({ from: selected.toAddress ?? "support@orahdex.org", to: selected.fromAddress, subject: `Re: ${selected.subject}`, body: "" });
                          setComposing(true);
                        }}
                        className="px-4 py-2.5 bg-primary/10 border border-primary/20 text-primary rounded-xl font-semibold text-sm hover:bg-primary/20 transition-all flex items-center gap-1.5"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                        Reply
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 hidden md:flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
                <div className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center">
                  <Mail className="w-7 h-7 text-primary/40" />
                </div>
                <p className="text-sm font-medium">Select an email to read</p>
                <p className="text-xs text-center max-w-48">Tap any email in the list to open it</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
