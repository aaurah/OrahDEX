import { useState } from "react";
import { Save, RefreshCw, Plus, Trash2, Megaphone, Bell, AlertTriangle, Info, CheckCircle2, XCircle, Edit2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tab = "site_banner" | "ticker" | "popup" | "notifications";
type BannerType = "info" | "warning" | "error" | "success";

interface SiteBanner { id: string; text: string; type: BannerType; link: string; linkText: string; active: boolean; dismissible: boolean; }
interface Notification { id: string; title: string; body: string; type: BannerType; audience: "all" | "kyc1" | "kyc2" | "vip"; createdAt: string; active: boolean; }

const TABS: { id: Tab; label: string }[] = [
  { id: "site_banner",    label: "Site Banner" },
  { id: "ticker",         label: "Ticker Messages" },
  { id: "popup",          label: "Pop-up Announcement" },
  { id: "notifications",  label: "Notifications" },
];

const BANNER_STYLES: Record<BannerType, { bg: string; border: string; text: string; icon: any }> = {
  info:    { bg: "bg-blue-500/10",   border: "border-blue-500/30",   text: "text-blue-400",   icon: Info },
  warning: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", icon: AlertTriangle },
  error:   { bg: "bg-red-500/10",    border: "border-red-500/30",    text: "text-red-400",    icon: XCircle },
  success: { bg: "bg-green-500/10",  border: "border-green-500/30",  text: "text-green-400",  icon: CheckCircle2 },
};

const DEFAULT_BANNERS: SiteBanner[] = [
  { id: "1", text: "🚀 New: AMM Liquidity Pools are now live! Earn fees by providing liquidity.", type: "success", link: "/liquidity", linkText: "Start Earning", active: false, dismissible: true },
];

const DEFAULT_NOTIFICATIONS: Notification[] = [
  { id: "1", title: "Scheduled Maintenance", body: "OrahDEX will undergo maintenance on Sunday 02:00–04:00 UTC. Deposits/withdrawals will be paused.", type: "warning", audience: "all", createdAt: new Date().toISOString(), active: true },
];

const DEFAULT_POPUP = {
  enabled: false,
  title: "Welcome to OrahDEX!",
  body: "Trade spot, futures, and AMM pools with instant BSV on-chain settlement.",
  ctaText: "Start Trading",
  ctaLink: "/markets",
  showOnce: true,
  type: "info" as BannerType,
  imageUrl: "",
};

const DEFAULT_TICKER_MSGS = [
  { id: "1", text: "BSV — World's Fastest Settlement Chain", active: true },
  { id: "2", text: "Instant On-Chain Settlement · No Bridges · No L2s", active: true },
  { id: "3", text: "Every trade settled on BSV in seconds", active: true },
  { id: "4", text: "OrahDEX — Trade means DEX", active: true },
];

export function AdminAnnouncements() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("site_banner");
  const [saving, setSaving] = useState(false);
  const [banners, setBanners] = useState<SiteBanner[]>(() => {
    try { return JSON.parse(localStorage.getItem("orahdex_site_banners") ?? "null") ?? DEFAULT_BANNERS; }
    catch { return DEFAULT_BANNERS; }
  });
  const [ticker, setTicker] = useState(() => {
    try { return JSON.parse(localStorage.getItem("orahdex_ticker") ?? "null") ?? DEFAULT_TICKER_MSGS; }
    catch { return DEFAULT_TICKER_MSGS; }
  });
  const [popup, setPopup] = useState({ ...DEFAULT_POPUP });
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    try { return JSON.parse(localStorage.getItem("orahdex_notifications") ?? "null") ?? DEFAULT_NOTIFICATIONS; }
    catch { return DEFAULT_NOTIFICATIONS; }
  });
  const [newTicker, setNewTicker] = useState("");
  const [showNewNotif, setShowNewNotif] = useState(false);
  const [newNotif, setNewNotif] = useState({ title: "", body: "", type: "info" as BannerType, audience: "all" as Notification["audience"] });

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    localStorage.setItem("orahdex_site_banners", JSON.stringify(banners));
    localStorage.setItem("orahdex_ticker", JSON.stringify(ticker));
    localStorage.setItem("orahdex_notifications", JSON.stringify(notifications));
    setSaving(false);
    toast({ title: "Announcements saved", description: "All announcement settings have been updated." });
  };

  const addTicker = () => {
    if (!newTicker.trim()) return;
    setTicker((t: any[]) => [...t, { id: Date.now().toString(), text: newTicker.trim(), active: true }]);
    setNewTicker("");
  };

  const addNotification = () => {
    if (!newNotif.title || !newNotif.body) return;
    setNotifications(n => [...n, { ...newNotif, id: Date.now().toString(), createdAt: new Date().toISOString(), active: true }]);
    setNewNotif({ title: "", body: "", type: "info", audience: "all" });
    setShowNewNotif(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="w-6 h-6 text-primary" /> Announcements</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage site banners, ticker messages, pop-ups, and user notifications</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-all">
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save All"}
        </button>
      </div>

      <div className="flex gap-1 bg-card border border-border rounded-2xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all", tab === t.id ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        {tab === "site_banner" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">A colored banner bar displayed at the top of the site, above the navigation.</p>
            {banners.map(b => {
              const style = BANNER_STYLES[b.type];
              const Icon = style.icon;
              return (
                <div key={b.id} className={cn("rounded-2xl border p-5 space-y-4", b.active ? "bg-card border-border" : "bg-card/40 border-border/40 opacity-60")}>
                  <div className="flex items-center justify-between">
                    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border", style.bg, style.border, style.text)}>
                      <Icon className="w-3.5 h-3.5" />
                      {b.type.toUpperCase()} BANNER
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, active: !x.active } : x))} className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all", b.active ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/20 border-border text-muted-foreground")}>
                        {b.active ? "Live" : "Paused"}
                      </button>
                      <button onClick={() => setBanners(bs => bs.filter(x => x.id !== b.id))} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Preview */}
                  {b.active && (
                    <div className={cn("flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm", style.bg, style.border, style.text)}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{b.text || "Banner text preview"}</span>
                        {b.link && <a href={b.link} className="underline font-semibold ml-1">{b.linkText || "Learn more"}</a>}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground block mb-1">Banner Text</label>
                      <input type="text" value={b.text} onChange={e => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, text: e.target.value } : x))} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Type</label>
                      <select value={b.type} onChange={e => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, type: e.target.value as BannerType } : x))} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                        <option value="info">Info (Blue)</option>
                        <option value="success">Success (Green)</option>
                        <option value="warning">Warning (Yellow)</option>
                        <option value="error">Error (Red)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Dismissible</label>
                      <button onClick={() => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, dismissible: !x.dismissible } : x))} className={cn("w-full py-2.5 px-3 rounded-xl border text-sm font-medium transition-all", b.dismissible ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/20 border-border text-muted-foreground")}>
                        {b.dismissible ? "Users can dismiss" : "Cannot dismiss"}
                      </button>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">CTA Link URL</label>
                      <input type="url" value={b.link} onChange={e => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, link: e.target.value } : x))} placeholder="https://…" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">CTA Link Text</label>
                      <input type="text" value={b.linkText} onChange={e => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, linkText: e.target.value } : x))} placeholder="Learn more" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                  </div>
                </div>
              );
            })}
            <button onClick={() => setBanners(bs => [...bs, { id: Date.now().toString(), text: "", type: "info", link: "", linkText: "", active: true, dismissible: true }])} className="flex items-center gap-2 w-full py-3 rounded-2xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 text-sm font-medium transition-all justify-center">
              <Plus className="w-4 h-4" /> Add Site Banner
            </button>
          </div>
        )}

        {tab === "ticker" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">These messages scroll across the top ticker bar in a loop.</p>
            {ticker.map((msg: any) => (
              <div key={msg.id} className={cn("flex items-center gap-3 p-3 rounded-2xl border transition-all", msg.active ? "bg-card border-border" : "bg-card/40 border-border/40 opacity-50")}>
                <Megaphone className="w-4 h-4 text-muted-foreground shrink-0" />
                <input type="text" value={msg.text} onChange={e => setTicker((t: any[]) => t.map((m: any) => m.id === msg.id ? { ...m, text: e.target.value } : m))} className="flex-1 bg-transparent text-sm text-foreground focus:outline-none" />
                <button onClick={() => setTicker((t: any[]) => t.map((m: any) => m.id === msg.id ? { ...m, active: !m.active } : m))} className={cn("px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all shrink-0", msg.active ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/20 border-border text-muted-foreground")}>
                  {msg.active ? "ON" : "OFF"}
                </button>
                <button onClick={() => setTicker((t: any[]) => t.filter((m: any) => m.id !== msg.id))} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input type="text" value={newTicker} onChange={e => setNewTicker(e.target.value)} onKeyDown={e => e.key === "Enter" && addTicker()} placeholder="Add a new ticker message…" className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              <button onClick={addTicker} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/20 transition-all">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        )}

        {tab === "popup" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Enable Pop-up Announcement</p>
                <p className="text-xs text-muted-foreground mt-0.5">Show a modal to users when they first visit the site</p>
              </div>
              <button
                onClick={() => setPopup(p => ({ ...p, enabled: !p.enabled }))}
                aria-checked={popup.enabled}
                role="switch"
                className={cn("relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 focus:outline-none", popup.enabled ? "bg-primary" : "bg-muted/50 border border-border")}
              >
                <span className={cn("absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-md transition-transform duration-200", popup.enabled ? "translate-x-6" : "translate-x-0")} />
              </button>
            </div>
            {popup.enabled && (
              <>
                <div className={cn("p-4 rounded-2xl border", BANNER_STYLES[popup.type].bg, BANNER_STYLES[popup.type].border)}>
                  <p className={cn("text-xs font-semibold mb-1 uppercase tracking-wider", BANNER_STYLES[popup.type].text)}>Preview</p>
                  <p className="text-base font-bold text-foreground">{popup.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{popup.body}</p>
                  {popup.ctaText && <div className="mt-3"><span className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">{popup.ctaText}</span></div>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Title</label>
                    <input type="text" value={popup.title} onChange={e => setPopup(p => ({ ...p, title: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Body Text</label>
                    <textarea value={popup.body} onChange={e => setPopup(p => ({ ...p, body: e.target.value }))} rows={3} className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                    <select value={popup.type} onChange={e => setPopup(p => ({ ...p, type: e.target.value as BannerType }))} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="info">Info</option>
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                      <option value="error">Alert</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Show</label>
                    <button onClick={() => setPopup(p => ({ ...p, showOnce: !p.showOnce }))} className={cn("w-full py-2.5 rounded-xl border text-sm font-medium transition-all", popup.showOnce ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/20 border-border text-muted-foreground")}>
                      {popup.showOnce ? "Once per user" : "Every visit"}
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">CTA Button Text</label>
                    <input type="text" value={popup.ctaText} onChange={e => setPopup(p => ({ ...p, ctaText: e.target.value }))} placeholder="Get Started" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">CTA Link URL</label>
                    <input type="text" value={popup.ctaLink} onChange={e => setPopup(p => ({ ...p, ctaLink: e.target.value }))} placeholder="/markets" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Image URL (optional)</label>
                    <input type="url" value={popup.imageUrl} onChange={e => setPopup(p => ({ ...p, imageUrl: e.target.value }))} placeholder="https://cdn.example.com/promo.png" className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "notifications" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Platform-wide notifications shown in the user notification bell.</p>
              <button onClick={() => setShowNewNotif(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/20 transition-all">
                <Plus className="w-3.5 h-3.5" /> New Notification
              </button>
            </div>
            {showNewNotif && (
              <div className="p-5 rounded-2xl border border-primary/30 bg-primary/5 space-y-4">
                <p className="text-sm font-semibold text-foreground">New Notification</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Title</label>
                    <input type="text" value={newNotif.title} onChange={e => setNewNotif(n => ({ ...n, title: e.target.value }))} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">Message</label>
                    <textarea value={newNotif.body} onChange={e => setNewNotif(n => ({ ...n, body: e.target.value }))} rows={3} className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                    <select value={newNotif.type} onChange={e => setNewNotif(n => ({ ...n, type: e.target.value as BannerType }))} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="info">Info</option>
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                      <option value="error">Alert</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Audience</label>
                    <select value={newNotif.audience} onChange={e => setNewNotif(n => ({ ...n, audience: e.target.value as any }))} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="all">All Users</option>
                      <option value="kyc1">KYC Level 1+</option>
                      <option value="kyc2">KYC Level 2+</option>
                      <option value="vip">VIP Users Only</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addNotification} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all">Publish</button>
                  <button onClick={() => setShowNewNotif(false)} className="px-4 py-2 rounded-xl border border-border text-muted-foreground text-sm font-medium hover:text-foreground transition-all">Cancel</button>
                </div>
              </div>
            )}
            {notifications.map(n => {
              const style = BANNER_STYLES[n.type];
              const Icon = style.icon;
              return (
                <div key={n.id} className={cn("flex items-start gap-4 p-4 rounded-2xl border transition-all", n.active ? "bg-card border-border" : "bg-card/40 border-border/40 opacity-60")}>
                  <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5", style.bg)}>
                    <Icon className={cn("w-4 h-4", style.text)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md border", style.bg, style.border, style.text)}>{n.type.toUpperCase()}</span>
                      <span className="text-[10px] text-muted-foreground">{n.audience === "all" ? "All users" : `${n.audience} only`}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setNotifications(ns => ns.map(x => x.id === n.id ? { ...x, active: !x.active } : x))} className={cn("px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all", n.active ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/20 border-border text-muted-foreground")}>
                      {n.active ? "Active" : "Paused"}
                    </button>
                    <button onClick={() => setNotifications(ns => ns.filter(x => x.id !== n.id))} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
