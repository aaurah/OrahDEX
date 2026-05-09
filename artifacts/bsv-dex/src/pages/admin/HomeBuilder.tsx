import { useState } from "react";
import { Save, RefreshCw, Plus, Trash2, GripVertical, Eye, EyeOff, ChevronUp, ChevronDown, Megaphone, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tab = "sections" | "hero" | "ticker" | "banners" | "stats" | "footer";

const TABS: { id: Tab; label: string }[] = [
  { id: "sections", label: "Page Sections" },
  { id: "hero",     label: "Hero Editor" },
  { id: "ticker",   label: "Ticker Messages" },
  { id: "banners",  label: "Promo Banners" },
  { id: "stats",    label: "Stats Bar" },
  { id: "footer",   label: "Footer" },
];

interface Section {
  id: string;
  label: string;
  description: string;
  visible: boolean;
  order: number;
}

interface TickerMsg { id: string; text: string; active: boolean; }
interface Banner { id: string; title: string; subtitle: string; imageUrl: string; linkUrl: string; badgeText: string; active: boolean; }

const DEFAULT_SECTIONS: Section[] = [
  { id: "hero",        label: "Hero / Headline",     description: "Big headline, CTA buttons, and hero graphic",              visible: true,  order: 1 },
  { id: "stats_bar",   label: "Stats Bar",           description: "24h volume, users, pairs, countries",                     visible: true,  order: 2 },
  { id: "featured_pairs", label: "Featured Markets", description: "Live price table of top trading pairs",                   visible: true,  order: 3 },
  { id: "features",    label: "Features Showcase",   description: "Icons + blurbs for platform highlights",                  visible: true,  order: 4 },
  { id: "bsv_settlement", label: "BSV Settlement",  description: "BSV instant settlement explainer section",                 visible: true,  order: 5 },
  { id: "market_hub",  label: "Market Hub Promo",    description: "Market Hub and P2P promotional cards",                    visible: true,  order: 6 },
  { id: "amm_pools",   label: "AMM Liquidity Pools", description: "Liquidity pool APY cards and deposit CTA",               visible: true,  order: 7 },
  { id: "testimonials","label": "Testimonials",      description: "User testimonials and social proof",                      visible: false, order: 8 },
  { id: "partners",    label: "Partners / Logos",    description: "Partner and ecosystem logo strip",                        visible: false, order: 9 },
  { id: "newsletter",  label: "Newsletter Sign-up",  description: "Email capture form for updates",                         visible: false, order: 10 },
  { id: "cta_banner",  label: "Bottom CTA Banner",   description: "Final call-to-action before footer",                     visible: true,  order: 11 },
];

const DEFAULT_TICKER: TickerMsg[] = [
  { id: "1", text: "BSV — World's Fastest Settlement Chain", active: true },
  { id: "2", text: "Instant On-Chain Settlement · No Bridges · No L2s", active: true },
  { id: "3", text: "Every trade settled on BSV in seconds", active: true },
  { id: "4", text: "Orah — Trade means DEX", active: true },
];

const DEFAULT_BANNERS: Banner[] = [
  { id: "1", title: "New: Cross-Chain Swaps", subtitle: "Swap between 10+ chains with BSV settlement", imageUrl: "", linkUrl: "/dex", badgeText: "NEW", active: true },
];

const DEFAULT_HERO = {
  headline: "The World's Fastest\nBSV-Settled DEX",
  subheadline: "Trade spot, futures, and AMM pools with instant BSV on-chain settlement. No bridges. No L2s.",
  cta1Text: "Start Trading",
  cta1Link: "/markets",
  cta2Text: "Learn More",
  cta2Link: "/dex",
  backgroundType: "gradient" as "gradient" | "solid" | "image" | "video",
  backgroundImageUrl: "",
  showChart: true,
  showStats: true,
};

const DEFAULT_STATS = {
  volumeLabel: "24h Volume",
  volumeValue: "$2.4B+",
  usersLabel: "Active Traders",
  usersValue: "180,000+",
  pairsLabel: "Trading Pairs",
  pairsValue: "500+",
  countriesLabel: "Countries",
  countriesValue: "195+",
};

const DEFAULT_FOOTER = {
  col1Title: "Orah",
  col1Links: "Markets\nSpot Trading\nFutures\nAMM Pools\nP2P",
  col2Title: "Company",
  col2Links: "About Us\nCareers\nBlog\nPress Kit\nPartners",
  col3Title: "Support",
  col3Links: "Help Center\nAPI Docs\nStatus Page\nContact\nFees",
  col4Title: "Legal",
  col4Links: "Terms of Service\nPrivacy Policy\nCookie Policy\nAML / KYC",
  showNewsletter: true,
  newsletterTitle: "Stay Updated",
  newsletterSubtitle: "Get the latest news, listings, and market insights.",
};

function SectionCard({ section, onToggle, onMoveUp, onMoveDown, isFirst, isLast }: {
  section: Section; onToggle: () => void; onMoveUp: () => void; onMoveDown: () => void; isFirst: boolean; isLast: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3 p-4 rounded-2xl border transition-all", section.visible ? "bg-card border-border" : "bg-card/40 border-border/40 opacity-60")}>
      <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{section.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onMoveUp} disabled={isFirst} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-30 transition-all">
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={onMoveDown} disabled={isLast} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-30 transition-all">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button onClick={onToggle} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all", section.visible ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20" : "bg-muted/20 border-border text-muted-foreground hover:text-foreground")}>
          {section.visible ? <><Eye className="w-3 h-3" />Visible</> : <><EyeOff className="w-3 h-3" />Hidden</>}
        </button>
      </div>
    </div>
  );
}

export function AdminHomeBuilder() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("sections");
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<Section[]>(() => {
    try { return JSON.parse(localStorage.getItem("orah_sections") ?? "null") ?? DEFAULT_SECTIONS; }
    catch { return DEFAULT_SECTIONS; }
  });
  const [ticker, setTicker] = useState<TickerMsg[]>(() => {
    try { return JSON.parse(localStorage.getItem("orah_ticker") ?? "null") ?? DEFAULT_TICKER; }
    catch { return DEFAULT_TICKER; }
  });
  const [banners, setBanners] = useState<Banner[]>(() => {
    try { return JSON.parse(localStorage.getItem("orah_banners") ?? "null") ?? DEFAULT_BANNERS; }
    catch { return DEFAULT_BANNERS; }
  });
  const [hero, setHero] = useState({ ...DEFAULT_HERO });
  const [stats, setStats] = useState({ ...DEFAULT_STATS });
  const [footer, setFooter] = useState({ ...DEFAULT_FOOTER });
  const [newTicker, setNewTicker] = useState("");

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    localStorage.setItem("orah_sections", JSON.stringify(sections));
    localStorage.setItem("orah_ticker", JSON.stringify(ticker));
    localStorage.setItem("orah_banners", JSON.stringify(banners));
    setSaving(false);
    toast({ title: "Homepage saved", description: "All homepage settings have been updated." });
  };

  const toggleSection = (id: string) =>
    setSections(s => s.map(sec => sec.id === id ? { ...sec, visible: !sec.visible } : sec));

  const moveSection = (id: string, dir: "up" | "down") => {
    setSections(s => {
      const sorted = [...s].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex(sec => sec.id === id);
      if (dir === "up" && idx > 0) {
        [sorted[idx].order, sorted[idx - 1].order] = [sorted[idx - 1].order, sorted[idx].order];
      } else if (dir === "down" && idx < sorted.length - 1) {
        [sorted[idx].order, sorted[idx + 1].order] = [sorted[idx + 1].order, sorted[idx].order];
      }
      return sorted;
    });
  };

  const sorted = [...sections].sort((a, b) => a.order - b.order);

  const addTicker = () => {
    if (!newTicker.trim()) return;
    setTicker(t => [...t, { id: Date.now().toString(), text: newTicker.trim(), active: true }]);
    setNewTicker("");
  };

  const addBanner = () => {
    setBanners(b => [...b, { id: Date.now().toString(), title: "New Banner", subtitle: "", imageUrl: "", linkUrl: "/", badgeText: "", active: true }]);
  };

  const TextInput = ({ value, onChange, placeholder, multiline = false }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) => {
    const cls = "w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all";
    return multiline
      ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4} className={cls + " resize-none"} />
      : <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />;
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="grid grid-cols-3 gap-4 py-4 border-b border-border last:border-0">
      <label className="text-sm font-medium text-foreground pt-2">{label}</label>
      <div className="col-span-2">{children}</div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Homepage Builder</h1>
          <p className="text-muted-foreground text-sm mt-1">Control every section, message, and element on the landing page</p>
        </div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50">
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

        {tab === "sections" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-4">Drag to reorder (use arrows) · Toggle visibility · Changes apply immediately after Save</p>
            {sorted.map((sec, i) => (
              <SectionCard key={sec.id} section={sec}
                onToggle={() => toggleSection(sec.id)}
                onMoveUp={() => moveSection(sec.id, "up")}
                onMoveDown={() => moveSection(sec.id, "down")}
                isFirst={i === 0} isLast={i === sorted.length - 1}
              />
            ))}
          </div>
        )}

        {tab === "hero" && (
          <div className="space-y-0">
            <Row label="Headline"><TextInput value={hero.headline} onChange={v => setHero(h => ({ ...h, headline: v }))} placeholder="The World's Fastest BSV-Settled DEX" multiline /></Row>
            <Row label="Sub-headline"><TextInput value={hero.subheadline} onChange={v => setHero(h => ({ ...h, subheadline: v }))} placeholder="Trade spot, futures, and AMM pools…" multiline /></Row>
            <Row label="CTA Button 1 Text"><TextInput value={hero.cta1Text} onChange={v => setHero(h => ({ ...h, cta1Text: v }))} placeholder="Start Trading" /></Row>
            <Row label="CTA Button 1 Link"><TextInput value={hero.cta1Link} onChange={v => setHero(h => ({ ...h, cta1Link: v }))} placeholder="/markets" /></Row>
            <Row label="CTA Button 2 Text"><TextInput value={hero.cta2Text} onChange={v => setHero(h => ({ ...h, cta2Text: v }))} placeholder="Learn More" /></Row>
            <Row label="CTA Button 2 Link"><TextInput value={hero.cta2Link} onChange={v => setHero(h => ({ ...h, cta2Link: v }))} placeholder="/dex" /></Row>
            <Row label="Background Type">
              <select value={hero.backgroundType} onChange={e => setHero(h => ({ ...h, backgroundType: e.target.value as any }))} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="gradient">Gradient (default)</option>
                <option value="solid">Solid Color</option>
                <option value="image">Image</option>
                <option value="video">Video Background</option>
              </select>
            </Row>
            {(hero.backgroundType === "image" || hero.backgroundType === "video") && (
              <Row label="Background Media URL"><TextInput value={hero.backgroundImageUrl} onChange={v => setHero(h => ({ ...h, backgroundImageUrl: v }))} placeholder="https://cdn.example.com/hero-bg.jpg" /></Row>
            )}
            <Row label="Show Live Chart">
              <button onClick={() => setHero(h => ({ ...h, showChart: !h.showChart }))} className={cn("px-4 py-2 rounded-xl border text-sm font-semibold transition-all", hero.showChart ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/20 border-border text-muted-foreground")}>
                {hero.showChart ? "Visible" : "Hidden"}
              </button>
            </Row>
            <Row label="Show Mini Stats">
              <button onClick={() => setHero(h => ({ ...h, showStats: !h.showStats }))} className={cn("px-4 py-2 rounded-xl border text-sm font-semibold transition-all", hero.showStats ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/20 border-border text-muted-foreground")}>
                {hero.showStats ? "Visible" : "Hidden"}
              </button>
            </Row>
          </div>
        )}

        {tab === "ticker" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">These messages scroll across the top ticker bar. Active messages rotate automatically.</p>
            {ticker.map(msg => (
              <div key={msg.id} className={cn("flex items-center gap-3 p-3 rounded-2xl border transition-all", msg.active ? "bg-card border-border" : "bg-card/40 border-border/40 opacity-50")}>
                <Megaphone className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={msg.text}
                  onChange={e => setTicker(t => t.map(m => m.id === msg.id ? { ...m, text: e.target.value } : m))}
                  className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
                />
                <button onClick={() => setTicker(t => t.map(m => m.id === msg.id ? { ...m, active: !m.active } : m))} className={cn("px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all shrink-0", msg.active ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/20 border-border text-muted-foreground")}>
                  {msg.active ? "ON" : "OFF"}
                </button>
                <button onClick={() => setTicker(t => t.filter(m => m.id !== msg.id))} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2 mt-4">
              <input
                type="text"
                value={newTicker}
                onChange={e => setNewTicker(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTicker()}
                placeholder="Add a new ticker message…"
                className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={addTicker} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/20 transition-all">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        )}

        {tab === "banners" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Promotional banner cards shown in the hero or above the markets table.</p>
            {banners.map(b => (
              <div key={b.id} className={cn("p-5 rounded-2xl border space-y-3 transition-all", b.active ? "bg-card border-border" : "bg-card/40 border-border/40 opacity-60")}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{b.title || "Untitled Banner"}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, active: !x.active } : x))} className={cn("px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all", b.active ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/20 border-border text-muted-foreground")}>
                      {b.active ? "Active" : "Inactive"}
                    </button>
                    <button onClick={() => setBanners(bs => bs.filter(x => x.id !== b.id))} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" placeholder="Title" value={b.title} onChange={e => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, title: e.target.value } : x))} className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  <input type="text" placeholder="Badge (e.g. NEW)" value={b.badgeText} onChange={e => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, badgeText: e.target.value } : x))} className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  <input type="text" placeholder="Subtitle" value={b.subtitle} onChange={e => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, subtitle: e.target.value } : x))} className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary col-span-2" />
                  <input type="url" placeholder="Image URL" value={b.imageUrl} onChange={e => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, imageUrl: e.target.value } : x))} className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  <input type="url" placeholder="Link URL" value={b.linkUrl} onChange={e => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, linkUrl: e.target.value } : x))} className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
            ))}
            <button onClick={addBanner} className="flex items-center gap-2 w-full py-3 rounded-2xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 text-sm font-medium transition-all justify-center">
              <Plus className="w-4 h-4" /> Add Banner
            </button>
          </div>
        )}

        {tab === "stats" && (
          <div className="space-y-0">
            <p className="text-sm text-muted-foreground mb-4">Stats shown in the scrolling stats bar below the hero section.</p>
            {[
              ["volumeLabel", "volumeValue", "24h Volume", "$2.4B+"],
              ["usersLabel", "usersValue", "Active Traders", "180,000+"],
              ["pairsLabel", "pairsValue", "Trading Pairs", "500+"],
              ["countriesLabel", "countriesValue", "Countries", "195+"],
            ].map(([lk, vk, lp, vp]) => (
              <div key={lk} className="grid grid-cols-2 gap-4 py-4 border-b border-border last:border-0">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Label</p>
                  <input type="text" value={(stats as any)[lk]} onChange={e => setStats(s => ({ ...s, [lk]: e.target.value }))} placeholder={lp} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Value</p>
                  <input type="text" value={(stats as any)[vk]} onChange={e => setStats(s => ({ ...s, [vk]: e.target.value }))} placeholder={vp} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "footer" && (
          <div className="space-y-0">
            {[1, 2, 3, 4].map(col => (
              <div key={col} className="py-4 border-b border-border last:border-0">
                <p className="text-sm font-semibold text-foreground mb-3">Column {col}</p>
                <div className="grid grid-cols-3 gap-3">
                  <input type="text" placeholder={`Col ${col} Title`} value={(footer as any)[`col${col}Title`]} onChange={e => setFooter(f => ({ ...f, [`col${col}Title`]: e.target.value }))} className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  <textarea rows={5} placeholder="Link1&#10;Link2&#10;Link3" value={(footer as any)[`col${col}Links`]} onChange={e => setFooter(f => ({ ...f, [`col${col}Links`]: e.target.value }))} className="col-span-2 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                </div>
              </div>
            ))}
            <div className="py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-foreground">Newsletter Section</p>
                <button onClick={() => setFooter(f => ({ ...f, showNewsletter: !f.showNewsletter }))} className={cn("px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all", footer.showNewsletter ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/20 border-border text-muted-foreground")}>
                  {footer.showNewsletter ? "Visible" : "Hidden"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={footer.newsletterTitle} onChange={e => setFooter(f => ({ ...f, newsletterTitle: e.target.value }))} placeholder="Stay Updated" className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                <input type="text" value={footer.newsletterSubtitle} onChange={e => setFooter(f => ({ ...f, newsletterSubtitle: e.target.value }))} placeholder="Get the latest news…" className="bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
