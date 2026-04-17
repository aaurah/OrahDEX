import { useState, useEffect, useRef } from "react";
import {
  Mail, MessageCircle, Inbox, HelpCircle, Save, Plus,
  Trash2, Edit3, Check, X, ChevronDown, ChevronUp,
  Eye, EyeOff, RefreshCw, Send, Clock, AlertCircle,
  CheckCircle2, Circle, Reply, Filter, Bell, Zap,
  Smartphone, Monitor, Globe, ExternalLink, Copy,
  Hash, Users, Shield, Radio, Megaphone, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tab = "chat" | "tickets" | "faqs" | "notifications";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "chat",          label: "Live Chat",      icon: MessageCircle },
  { id: "tickets",       label: "Tickets",        icon: Inbox },
  { id: "faqs",          label: "FAQ Manager",    icon: HelpCircle },
  { id: "notifications", label: "Notifications",  icon: Reply },
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
    support_email: "support@orahdex.org",
    support_email_legal: "legal@orahdex.org",
    support_email_billing: "billing@orahdex.org",
    support_email_press: "press@orahdex.org",
    support_email_privacy: "privacy@orahdex.org",
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

/* ── CHANNEL ICONS ──────────────────────────────────────────────────────────── */
const CHANNEL_META: Record<string, { icon: any; label: string; color: string; desc: string }> = {
  global:  { icon: Globe,      label: "Global",   color: "text-blue-400",   desc: "Open channel for all wallets" },
  support: { icon: Shield,     label: "Support",  color: "text-orange-400", desc: "User support & moderation" },
  system:  { icon: Radio,      label: "System",   color: "text-green-400",  desc: "Read-only admin announcements" },
  ora:     { icon: Bot,        label: "Ora AI",   color: "text-violet-400", desc: "AI assistant channel" },
};
const channelIcon = (name: string) => {
  if (name.startsWith("pair:")) return { icon: Hash, label: `#${name.slice(5)}`, color: "text-primary", desc: "Pair-specific channel" };
  return CHANNEL_META[name] ?? { icon: MessageCircle, label: name, color: "text-muted-foreground", desc: "" };
};

/* ── LIVE CHAT TAB ──────────────────────────────────────────────────────────── */
function LiveChatTab() {
  const { toast } = useToast();

  /* channel list */
  const [channels, setChannels] = useState<any[]>([]);
  const [chLoading, setChLoading] = useState(true);

  /* system announcement */
  const [announcement, setAnnouncement] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [sending, setSending] = useState(false);

  /* selected channel messages */
  const [selectedCh, setSelectedCh] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  /* community links */
  const [telegramUrl, setTelegramUrl] = useState("");
  const [discordUrl, setDiscordUrl]   = useState("");
  const [savingLinks, setSavingLinks] = useState(false);
  const [linksLoaded, setLinksLoaded] = useState(false);

  /* refs to avoid stale closures in polling */
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadChannels = async () => {
    try {
      const r = await fetch(`${BASE}/api/chat/channels`);
      const data = await r.json();
      setChannels(Array.isArray(data) ? data : (data.channels ?? []));
    } catch { /* silent */ }
    finally { setChLoading(false); }
  };

  const loadMessages = async (ch: string) => {
    setMsgLoading(true);
    try {
      const r = await fetch(`${BASE}/api/chat/channels/${encodeURIComponent(ch)}/messages?limit=30`);
      const data = await r.json();
      setMessages(Array.isArray(data) ? data : (data.messages ?? []));
    } catch { /* silent */ }
    finally { setMsgLoading(false); }
  };

  useEffect(() => {
    loadChannels();
    fetch(`${BASE}/api/admin/support/settings`)
      .then(r => r.json())
      .then(d => {
        if (d.support_telegram_url) setTelegramUrl(d.support_telegram_url);
        if (d.support_discord_url)  setDiscordUrl(d.support_discord_url);
        setLinksLoaded(true);
      })
      .catch(() => setLinksLoaded(true));
    const id = setInterval(loadChannels, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedCh) return;
    loadMessages(selectedCh);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadMessages(selectedCh), 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedCh]);

  const sendAnnouncement = async () => {
    if (!announcement.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`${BASE}/api/chat/system`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: announcement.trim(), adminKey }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${r.status}`);
      }
      toast({ title: "Announcement posted to System channel" });
      setAnnouncement("");
      await loadChannels();
      if (selectedCh === "system") await loadMessages("system");
    } catch (err: any) {
      toast({ title: "Failed to post announcement", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const saveLinks = async () => {
    setSavingLinks(true);
    try {
      await fetch(`${BASE}/api/admin/support/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ support_telegram_url: telegramUrl, support_discord_url: discordUrl }),
      });
      toast({ title: "Community links saved" });
    } catch {
      toast({ title: "Failed to save links", variant: "destructive" });
    } finally {
      setSavingLinks(false);
    }
  };

  const totalMessages = channels.reduce((s, c) => s + (c.messageCount ?? 0), 0);
  const totalSubs     = channels.reduce((s, c) => s + (c.activeClients ?? c.activeSubscribers ?? 0), 0);

  return (
    <div className="space-y-6">

      {/* ── Status banner ── */}
      <div className="flex items-center gap-3 p-4 bg-blue-400/5 border border-blue-400/20 rounded-2xl">
        <MessageCircle className="w-5 h-5 text-blue-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-400">Native OrahDEX Chat — Online</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Built-in multi-channel SSE system · {channels.length} channels · {totalMessages} messages · {totalSubs} live subscriber{totalSubs !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={loadChannels} className="p-1.5 rounded-lg hover:bg-muted/30 text-muted-foreground transition-colors">
          <RefreshCw className={cn("w-3.5 h-3.5", chLoading && "animate-spin")} />
        </button>
      </div>

      {/* ── Channel Stats ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-secondary/20 flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Channel Overview</h3>
          <span className="ml-auto text-xs text-muted-foreground">{channels.length} active channels</span>
        </div>
        {chLoading ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />
            Loading channels…
          </div>
        ) : channels.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No channels returned — chat API may be initialising</div>
        ) : (
          <div className="divide-y divide-border">
            {channels.map((ch: any) => {
              const chId = ch.id ?? ch.name;
              const meta = channelIcon(chId);
              const Icon = meta.icon;
              const isSelected = selectedCh === chId;
              return (
                <button
                  key={chId}
                  onClick={() => setSelectedCh(isSelected ? null : chId)}
                  className={cn(
                    "w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/20",
                    isSelected && "bg-primary/5 border-l-2 border-primary"
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", meta.color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{meta.label}</p>
                    <p className="text-[11px] text-muted-foreground">{meta.desc}</p>
                  </div>
                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div>
                      <p className="text-sm font-mono font-semibold">{ch.messageCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">msgs</p>
                    </div>
                    <div>
                      <p className={cn("text-sm font-mono font-semibold", (ch.activeClients ?? ch.activeSubscribers ?? 0) > 0 ? "text-green-400" : "text-muted-foreground")}>
                        {ch.activeClients ?? ch.activeSubscribers ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">live</p>
                    </div>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", isSelected && "rotate-180")} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Message preview for selected channel ── */}
        {selectedCh && (
          <div className="border-t border-border bg-background/50">
            <div className="px-5 py-2.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Recent messages — {channelIcon(selectedCh).label}
              </p>
              {msgLoading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
            <div className="px-5 pb-4 space-y-2 max-h-64 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No messages yet in this channel</p>
              ) : [...messages].reverse().map((msg: any) => (
                <div key={msg.id} className="flex items-start gap-2 text-xs">
                  <span className="text-muted-foreground font-mono shrink-0 w-16 text-right">
                    {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className={cn(
                    "text-[9px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 mt-0.5",
                    msg.role === "system"  ? "bg-green-400/10 text-green-400" :
                    msg.role === "support" ? "bg-orange-400/10 text-orange-400" :
                    msg.role === "ora"     ? "bg-violet-400/10 text-violet-400" :
                    "bg-muted/30 text-muted-foreground"
                  )}>
                    {msg.role ?? "user"}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{msg.pseudonym ?? msg.wallet?.slice(0,8) ?? "anon"}</span>
                  <span className="text-foreground leading-relaxed flex-1 min-w-0 break-words">{msg.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── System Announcement ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Megaphone className="w-4 h-4 text-orange-400" />
          <h3 className="font-semibold text-sm">Post System Announcement</h3>
          <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded bg-green-400/10 text-green-400 border border-green-400/20">System Channel</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Broadcasts to the read-only System channel — visible to all connected users in their chat widget. Requires the admin key set in your server environment.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Announcement Text</label>
            <textarea
              value={announcement}
              onChange={e => setAnnouncement(e.target.value)}
              rows={3}
              placeholder="e.g. Scheduled maintenance in 30 minutes — all open orders will be preserved."
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Admin Key</label>
            <input
              type="password"
              value={adminKey}
              onChange={e => setAdminKey(e.target.value)}
              placeholder="ADMIN_KEY from server environment"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Set <code className="bg-muted/40 px-1 rounded">ADMIN_KEY</code> in your API server environment variables to authorise announcements.</p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={sendAnnouncement}
              disabled={sending || !announcement.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50"
            >
              {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
              {sending ? "Sending…" : "Broadcast Announcement"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Moderation Info ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-violet-400" />
          <h3 className="font-semibold text-sm">AI Moderation Rules</h3>
          <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded bg-violet-400/10 text-violet-400 border border-violet-400/20">Active</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { rule: "Seed phrase / private key leak", action: "Blocked" },
            { rule: "Doubling / airdrop scams", action: "Blocked" },
            { rule: "Suspicious off-platform DMs", action: "Blocked" },
            { rule: "Phishing domains (.xyz / t.me links)", action: "Blocked" },
            { rule: "Email / phone PII patterns", action: "Blocked" },
            { rule: "Txid detection (64-char hex)", action: "Enriched" },
          ].map(({ rule, action }) => (
            <div key={rule} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/10 border border-border text-xs">
              <span className={cn(
                "text-[9px] font-black px-1.5 py-0.5 rounded shrink-0",
                action === "Blocked"  ? "bg-red-400/10 text-red-400" : "bg-blue-400/10 text-blue-400"
              )}>{action}</span>
              <span className="text-foreground">{rule}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 rounded-xl bg-muted/10 border border-border">
          <p className="text-xs text-muted-foreground">
            Rate limiting: <span className="text-foreground font-semibold">10 messages per wallet per 15 seconds</span>.
            In-memory store capped at <span className="text-foreground font-semibold">100 messages per channel</span>.
            SSE connections are kept alive with 25s keepalive pings.
          </p>
        </div>
      </div>

      {/* ── Community Links ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" /> Community Channel Links
        </h3>
        <p className="text-xs text-muted-foreground mb-4">External links shown in the Support channel quick-prompts and help pages.</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Telegram URL</label>
            <input
              value={telegramUrl}
              onChange={e => setTelegramUrl(e.target.value)}
              placeholder="https://t.me/orahdex"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Discord URL</label>
            <input
              value={discordUrl}
              onChange={e => setDiscordUrl(e.target.value)}
              placeholder="https://discord.gg/orahdex"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={saveLinks}
            disabled={savingLinks || !linksLoaded}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50"
          >
            {savingLinks ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Links
          </button>
        </div>
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

/* ── NOTIFICATIONS TAB ──────────────────────────────────────────────────────── */
function NotificationsTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    notif_enabled: "true",
    notif_telegram_token: "",
    notif_telegram_chat_id: "",
    notif_ntfy_topic: "",
    notif_ntfy_server: "",
    notif_discord_webhook: "",
    notif_pushover_token: "",
    notif_pushover_user: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/admin/support/settings`)
      .then(r => r.json())
      .then(data => { setSettings(s => ({ ...s, ...data })); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/admin/support/settings`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
      });
      toast({ title: "Notification settings saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const test = async (channel: string, payload: Record<string, string>) => {
    setTesting(channel);
    try {
      const r = await fetch(`${BASE}/api/admin/support/notifications/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, ...payload }),
      });
      const data = await r.json();
      if (data.success) toast({ title: `Test sent to ${channel}!`, description: "Check your device for the notification." });
      else toast({ title: `${channel} test failed`, description: data.error, variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally { setTesting(null); }
  };

  const copyTopic = () => {
    navigator.clipboard.writeText(settings.notif_ntfy_topic || "orahdex-support");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const notifEnabled = settings.notif_enabled !== "false";

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <div className="bg-card border border-border rounded-2xl p-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm">Support Ticket Alerts</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Get instant push notifications on your phone and desktop when a new support ticket is submitted.
            Configure one or more channels below.
          </p>
        </div>
        <button
          onClick={() => setSettings(s => ({ ...s, notif_enabled: notifEnabled ? "false" : "true" }))}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0",
            notifEnabled ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-muted/20 border-border text-muted-foreground"
          )}
        >
          <Bell className={cn("w-3.5 h-3.5", notifEnabled && "animate-pulse")} />
          {notifEnabled ? "Alerts On" : "Alerts Off"}
        </button>
      </div>

      {/* ntfy.sh — best free option */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">ntfy.sh — Mobile & Desktop Push</h3>
            <p className="text-xs text-muted-foreground">Free • No account needed • iOS, Android, Windows, macOS, Linux</p>
          </div>
          <a href="https://ntfy.sh" target="_blank" rel="noreferrer" className="ml-auto text-muted-foreground hover:text-primary transition-colors">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        <div className="bg-purple-500/5 border border-purple-500/15 rounded-xl p-3 mb-4 text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Setup in 2 minutes:</strong><br />
          1. Download the <strong>ntfy</strong> app: <a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">Android</a> · <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">iOS</a> · <a href="https://ntfy.sh/app" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">Web app</a><br />
          2. In the app, tap <strong>+</strong> and subscribe to your topic name below<br />
          3. Send a test notification to confirm it's working
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Topic Name <span className="text-red-400">*</span></label>
            <div className="flex gap-2">
              <input
                value={settings.notif_ntfy_topic}
                onChange={e => setSettings(s => ({ ...s, notif_ntfy_topic: e.target.value }))}
                placeholder="e.g. orahdex-support-abc123"
                className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/50"
              />
              <button onClick={copyTopic} title="Copy topic" className="px-3 rounded-xl border border-border hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Use a unique name — anyone who knows the topic can subscribe</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Custom Server (optional)</label>
            <input
              value={settings.notif_ntfy_server}
              onChange={e => setSettings(s => ({ ...s, notif_ntfy_server: e.target.value }))}
              placeholder="https://ntfy.sh (default)"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Self-host ntfy for private notifications</p>
          </div>
        </div>
        <button
          onClick={() => test("ntfy", { topic: settings.notif_ntfy_topic })}
          disabled={!settings.notif_ntfy_topic || testing === "ntfy"}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl text-xs font-semibold hover:bg-purple-500/20 transition-all disabled:opacity-40"
        >
          {testing === "ntfy" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Send Test to ntfy
        </button>
      </div>

      {/* Telegram Bot */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Telegram Bot</h3>
            <p className="text-xs text-muted-foreground">Free • iOS, Android, Windows, macOS, Linux, Web</p>
          </div>
          <a href="https://core.telegram.org/bots#how-do-i-create-a-bot" target="_blank" rel="noreferrer" className="ml-auto text-muted-foreground hover:text-primary transition-colors">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-3 mb-4 text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Setup:</strong><br />
          1. Open Telegram and message <strong className="text-blue-400">@BotFather</strong><br />
          2. Send <code className="bg-white/10 px-1 rounded">/newbot</code> and follow instructions — copy the <strong>Bot Token</strong><br />
          3. Message your new bot, then get your <strong>Chat ID</strong> from <a href="https://api.telegram.org/bot{YOUR_TOKEN}/getUpdates" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">getUpdates</a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Bot Token</label>
            <input
              value={settings.notif_telegram_token}
              onChange={e => setSettings(s => ({ ...s, notif_telegram_token: e.target.value }))}
              placeholder="1234567890:ABC-DEF..."
              type="password"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Chat ID</label>
            <input
              value={settings.notif_telegram_chat_id}
              onChange={e => setSettings(s => ({ ...s, notif_telegram_chat_id: e.target.value }))}
              placeholder="e.g. -1001234567890"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>
        <button
          onClick={() => test("telegram", { token: settings.notif_telegram_token, chatId: settings.notif_telegram_chat_id })}
          disabled={!settings.notif_telegram_token || !settings.notif_telegram_chat_id || testing === "telegram"}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl text-xs font-semibold hover:bg-blue-500/20 transition-all disabled:opacity-40"
        >
          {testing === "telegram" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Send Test to Telegram
        </button>
      </div>

      {/* Discord Webhook */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <Globe className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Discord Webhook</h3>
            <p className="text-xs text-muted-foreground">Free • Sends tickets to a Discord channel</p>
          </div>
        </div>

        <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-3 mb-4 text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Setup:</strong> In Discord, open a channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy URL
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Webhook URL</label>
          <input
            value={settings.notif_discord_webhook}
            onChange={e => setSettings(s => ({ ...s, notif_discord_webhook: e.target.value }))}
            placeholder="https://discord.com/api/webhooks/..."
            type="password"
            className="w-full max-w-lg bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/50"
          />
        </div>
        <button
          onClick={() => test("discord", { webhookUrl: settings.notif_discord_webhook })}
          disabled={!settings.notif_discord_webhook || testing === "discord"}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl text-xs font-semibold hover:bg-indigo-500/20 transition-all disabled:opacity-40"
        >
          {testing === "discord" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Send Test to Discord
        </button>
      </div>

      {/* Pushover */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-xl bg-orange-500/15 flex items-center justify-center">
            <Monitor className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Pushover</h3>
            <p className="text-xs text-muted-foreground">$5 one-time · Native push for iOS, Android, desktop</p>
          </div>
          <a href="https://pushover.net" target="_blank" rel="noreferrer" className="ml-auto text-muted-foreground hover:text-primary transition-colors">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        <div className="bg-orange-500/5 border border-orange-500/15 rounded-xl p-3 mb-4 text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Setup:</strong> Create account at <a href="https://pushover.net" className="text-orange-400 hover:underline" target="_blank" rel="noreferrer">pushover.net</a>, create an Application to get the App Token, and use your User Key from the dashboard.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">App Token</label>
            <input
              value={settings.notif_pushover_token}
              onChange={e => setSettings(s => ({ ...s, notif_pushover_token: e.target.value }))}
              placeholder="azGDORePK8gMaC0QOYAMyEEuzJnyUi"
              type="password"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">User Key</label>
            <input
              value={settings.notif_pushover_user}
              onChange={e => setSettings(s => ({ ...s, notif_pushover_user: e.target.value }))}
              placeholder="uQiRzpo4DXghDmr9QzzfQu..."
              type="password"
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>
        <button
          onClick={() => test("pushover", { token: settings.notif_pushover_token, userKey: settings.notif_pushover_user })}
          disabled={!settings.notif_pushover_token || !settings.notif_pushover_user || testing === "pushover"}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-xl text-xs font-semibold hover:bg-orange-500/20 transition-all disabled:opacity-40"
        >
          {testing === "pushover" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Send Test to Pushover
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving || !loaded}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Notification Settings
        </button>
      </div>
    </div>
  );
}

/* ── MAIN COMPONENT ─────────────────────────────────────────────────────────── */
export function AdminSupportSettings() {
  const [tab, setTab] = useState<Tab>("chat");

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

      {tab === "chat"          && <LiveChatTab />}
      {tab === "tickets"       && <TicketsTab />}
      {tab === "faqs"          && <FaqsTab />}
      {tab === "notifications" && <NotificationsTab />}
    </div>
  );
}
