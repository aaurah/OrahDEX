import { useState, useRef } from "react";
import {
  Globe, Image, Palette, Link2, FileText, Search, Code2,
  Check, Upload, Eye, EyeOff, RefreshCw, Save, Trash2,
  Twitter, Youtube, MessageCircle, Github, Linkedin,
  Facebook, Instagram, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Tab = "branding" | "colors" | "social" | "seo" | "legal" | "tracking" | "customcss";

const TAB_LIST: { id: Tab; label: string; icon: any }[] = [
  { id: "branding",  label: "Branding",     icon: Image },
  { id: "colors",    label: "Colors",        icon: Palette },
  { id: "social",    label: "Social Links",  icon: Link2 },
  { id: "seo",       label: "SEO",           icon: Search },
  { id: "legal",     label: "Legal",         icon: FileText },
  { id: "tracking",  label: "Analytics",     icon: Globe },
  { id: "customcss", label: "Custom CSS",    icon: Code2 },
];

const DEFAULT_SETTINGS = {
  // Branding
  exchangeName: "OrahDEX",
  slogan: "Trade means DEX",
  logoUrl: "",
  logoBase64: "",
  faviconUrl: "",
  footerText: "© 2025 OrahDEX. All rights reserved.",
  metaTagline: "The world's fastest BSV-settled exchange.",
  defaultTheme: "dark",
  defaultFont: "Inter",
  // Colors
  primaryColor: "#4ade80",
  primaryDark: "#22c55e",
  primaryLight: "#86efac",
  accentColor: "#8b5cf6",
  dangerColor: "#ef4444",
  warningColor: "#f97316",
  // Social
  twitterUrl: "",
  telegramUrl: "",
  discordUrl: "",
  githubUrl: "",
  linkedinUrl: "",
  facebookUrl: "",
  instagramUrl: "",
  youtubeUrl: "",
  mediumUrl: "",
  redditUrl: "",
  // SEO
  seoTitle: "OrahDEX — Trade means DEX | BSV Settlement Exchange",
  seoDescription: "OrahDEX is a full-featured BSV-settled DEX with spot trading, futures, P2P, AMM pools, and cross-chain settlement.",
  seoKeywords: "BSV DEX, Bitcoin SV, decentralized exchange, crypto trading, spot futures",
  ogImageUrl: "",
  canonicalUrl: "https://orahdex.replit.app",
  twitterCard: "summary_large_image",
  twitterSite: "@orahdex",
  // Legal
  termsUrl: "/terms",
  privacyUrl: "/privacy",
  whitepaperUrl: "/whitepaper",
  cookiesUrl: "/legal/cookies",
  amlUrl: "/legal/aml",
  contactEmail: "support@orahdex.org",
  legalEmail: "legal@orahdex.org",
  privacyEmail: "privacy@orahdex.org",
  supportUrl: "https://support.orahdex.org",
  companyName: "OrahDEX Ltd.",
  companyAddress: "",
  registrationNumber: "",
  // Tracking
  googleAnalyticsId: "",
  googleTagManagerId: "",
  hotjarId: "",
  intercomAppId: "",
  mixpanelToken: "",
  clarityProjectId: "",
  facebookPixelId: "",
  twitterPixelId: "",
  // CSS
  customCss: "",
};

type Settings = typeof DEFAULT_SETTINGS;

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-4 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="md:col-span-2">{children}</div>
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", className }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all", className)}
    />
  );
}

function ColorSwatch({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-background border border-border rounded-xl">
      <label className="relative cursor-pointer shrink-0">
        <div className="w-8 h-8 rounded-lg border-2 border-white/20 shadow-inner" style={{ backgroundColor: value }} />
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </label>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="text-xs text-muted-foreground font-mono bg-transparent border-none outline-none w-full"
        />
      </div>
    </div>
  );
}

export function AdminSiteSettings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("branding");
  const [settings, setSettings] = useState<Settings>(() => {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("orahdex_site_settings") ?? "{}") }; }
    catch { return DEFAULT_SETTINGS; }
  });
  const [saving, setSaving] = useState(false);
  const [previewLogo, setPreviewLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof Settings) => (val: string) => setSettings(s => ({ ...s, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 500));
    localStorage.setItem("orahdex_site_settings", JSON.stringify(settings));
    setSaving(false);
    toast({ title: "Settings saved", description: "Site settings have been updated successfully." });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      setSettings(s => ({ ...s, logoBase64: b64, logoUrl: "" }));
    };
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem("orahdex_site_settings");
    toast({ title: "Reset to defaults", description: "All site settings have been reset." });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Site Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure branding, SEO, social links, analytics and more</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 text-sm transition-all">
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-2xl p-1 overflow-x-auto">
        {TAB_LIST.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
              activeTab === t.id
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="bg-card border border-border rounded-2xl p-6">

        {/* ── BRANDING ── */}
        {activeTab === "branding" && (
          <div className="space-y-0">
            <Field label="Exchange Name" description="Primary name displayed across the platform">
              <Input value={settings.exchangeName} onChange={set("exchangeName")} placeholder="OrahDEX" />
            </Field>
            <Field label="Slogan / Tagline" description="Short tagline shown in the hero and metadata">
              <Input value={settings.slogan} onChange={set("slogan")} placeholder="Trade means DEX" />
            </Field>
            <Field label="Logo" description="Upload or provide a URL for the exchange logo">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input value={settings.logoUrl} onChange={set("logoUrl")} placeholder="https://cdn.example.com/logo.svg" />
                  <button onClick={() => fileRef.current?.click()} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
                    <Upload className="w-3.5 h-3.5" /> Upload
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </div>
                {(settings.logoBase64 || settings.logoUrl) && (
                  <div className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border">
                    <img
                      src={settings.logoBase64 || settings.logoUrl}
                      alt="Logo preview"
                      className="h-10 max-w-[200px] object-contain"
                      onError={e => { (e.target as any).style.display = "none"; }}
                    />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Logo preview</p>
                    </div>
                    <button onClick={() => setSettings(s => ({ ...s, logoBase64: "", logoUrl: "" }))} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </Field>
            <Field label="Favicon URL" description="32×32 or 64×64 icon shown in browser tabs">
              <Input value={settings.faviconUrl} onChange={set("faviconUrl")} placeholder="https://cdn.example.com/favicon.ico" />
            </Field>
            <Field label="Default Theme" description="Theme applied to new users on first visit">
              <select
                value={settings.defaultTheme}
                onChange={e => set("defaultTheme")(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="dark">Dark (default)</option>
                <option value="light">Light</option>
                <option value="amoled">AMOLED Black</option>
              </select>
            </Field>
            <Field label="Default Font" description="UI font family used across the exchange">
              <select
                value={settings.defaultFont}
                onChange={e => set("defaultFont")(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {["Inter", "Roboto", "Space Grotesk", "DM Sans", "Geist", "Manrope", "Plus Jakarta Sans", "Outfit", "Sora"].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </Field>
            <Field label="Footer Copyright Text">
              <Input value={settings.footerText} onChange={set("footerText")} placeholder="© 2025 OrahDEX. All rights reserved." />
            </Field>
            <Field label="Company Name" description="Legal company name for invoices and legal pages">
              <Input value={settings.companyName} onChange={set("companyName")} placeholder="OrahDEX Ltd." />
            </Field>
            <Field label="Company Address">
              <Input value={settings.companyAddress} onChange={set("companyAddress")} placeholder="123 Main St, City, Country" />
            </Field>
            <Field label="Company Registration No.">
              <Input value={settings.registrationNumber} onChange={set("registrationNumber")} placeholder="IE123456" />
            </Field>
          </div>
        )}

        {/* ── COLORS ── */}
        {activeTab === "colors" && (
          <div className="space-y-0">
            <Field label="Primary Color" description="Main brand color used for buttons and highlights">
              <ColorSwatch value={settings.primaryColor} onChange={set("primaryColor")} label="Primary" />
            </Field>
            <Field label="Primary Dark" description="Darker variant for hover states">
              <ColorSwatch value={settings.primaryDark} onChange={set("primaryDark")} label="Primary Dark" />
            </Field>
            <Field label="Primary Light" description="Lighter variant for backgrounds">
              <ColorSwatch value={settings.primaryLight} onChange={set("primaryLight")} label="Primary Light" />
            </Field>
            <Field label="Accent Color" description="Secondary accent color (purple, etc.)">
              <ColorSwatch value={settings.accentColor} onChange={set("accentColor")} label="Accent" />
            </Field>
            <Field label="Danger / Sell Color" description="Color for sell orders and error states">
              <ColorSwatch value={settings.dangerColor} onChange={set("dangerColor")} label="Danger" />
            </Field>
            <Field label="Warning / Caution Color" description="Color for warnings and BTC/orange states">
              <ColorSwatch value={settings.warningColor} onChange={set("warningColor")} label="Warning" />
            </Field>
            <div className="mt-4 p-4 bg-background rounded-xl border border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Preview</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "Buy / Primary", bg: settings.primaryColor },
                  { label: "Sell / Danger", bg: settings.dangerColor },
                  { label: "Accent", bg: settings.accentColor },
                  { label: "Warning", bg: settings.warningColor },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white shadow" style={{ backgroundColor: s.bg }}>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SOCIAL ── */}
        {activeTab === "social" && (
          <div className="space-y-0">
            {[
              { key: "twitterUrl",   label: "Twitter / X",  icon: Twitter,        placeholder: "https://x.com/orahdex" },
              { key: "telegramUrl",  label: "Telegram",     icon: Send,           placeholder: "https://t.me/orahdex" },
              { key: "discordUrl",   label: "Discord",      icon: MessageCircle,  placeholder: "https://discord.gg/orahdex" },
              { key: "githubUrl",    label: "GitHub",       icon: Github,         placeholder: "https://github.com/orahdex" },
              { key: "linkedinUrl",  label: "LinkedIn",     icon: Linkedin,       placeholder: "https://linkedin.com/company/orahdex" },
              { key: "facebookUrl",  label: "Facebook",     icon: Facebook,       placeholder: "https://facebook.com/orahdex" },
              { key: "instagramUrl", label: "Instagram",    icon: Instagram,      placeholder: "https://instagram.com/orahdex" },
              { key: "youtubeUrl",   label: "YouTube",      icon: Youtube,        placeholder: "https://youtube.com/@orahdex" },
              { key: "mediumUrl",    label: "Medium / Blog",icon: FileText,       placeholder: "https://medium.com/@orahdex" },
              { key: "redditUrl",    label: "Reddit",       icon: Globe,          placeholder: "https://reddit.com/r/orahdex" },
            ].map(item => (
              <Field key={item.key} label={item.label}>
                <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-2.5">
                  <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="url"
                    value={(settings as any)[item.key]}
                    onChange={e => set(item.key as keyof Settings)(e.target.value)}
                    placeholder={item.placeholder}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
              </Field>
            ))}
            <Field label="Contact Email" description="Public support email shown in footer">
              <Input value={settings.contactEmail} onChange={set("contactEmail")} placeholder="support@orahdex.io" type="email" />
            </Field>
            <Field label="Support URL" description="Link to helpdesk or documentation">
              <Input value={settings.supportUrl} onChange={set("supportUrl")} placeholder="https://support.orahdex.io" />
            </Field>
          </div>
        )}

        {/* ── SEO ── */}
        {activeTab === "seo" && (
          <div className="space-y-0">
            <Field label="Page Title" description="Default <title> tag for all pages">
              <Input value={settings.seoTitle} onChange={set("seoTitle")} placeholder="OrahDEX — Trade means DEX" />
              <p className="text-xs text-muted-foreground mt-1">{settings.seoTitle.length}/70 characters</p>
            </Field>
            <Field label="Meta Description" description="Default meta description (appears in Google search results)">
              <textarea
                value={settings.seoDescription}
                onChange={e => set("seoDescription")(e.target.value)}
                rows={3}
                placeholder="OrahDEX is a full-featured BSV-settled DEX…"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none transition-all"
              />
              <p className="text-xs text-muted-foreground mt-1">{settings.seoDescription.length}/160 characters</p>
            </Field>
            <Field label="Keywords" description="Comma-separated SEO keywords">
              <Input value={settings.seoKeywords} onChange={set("seoKeywords")} placeholder="BSV DEX, crypto trading, Bitcoin SV exchange" />
            </Field>
            <Field label="Canonical URL" description="Canonical domain for SEO">
              <Input value={settings.canonicalUrl} onChange={set("canonicalUrl")} placeholder="https://orahdex.replit.app" />
            </Field>
            <Field label="Open Graph Image URL" description="1200×630 image for social sharing previews">
              <Input value={settings.ogImageUrl} onChange={set("ogImageUrl")} placeholder="https://cdn.example.com/og.png" />
              {settings.ogImageUrl && (
                <img src={settings.ogImageUrl} alt="OG preview" className="mt-2 rounded-lg border border-border max-h-32 object-cover w-full" />
              )}
            </Field>
            <Field label="Twitter Card Type">
              <select
                value={settings.twitterCard}
                onChange={e => set("twitterCard")(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="summary_large_image">Summary Large Image</option>
                <option value="summary">Summary</option>
                <option value="app">App</option>
              </select>
            </Field>
            <Field label="Twitter @Handle" description="Used for twitter:site meta tag">
              <Input value={settings.twitterSite} onChange={set("twitterSite")} placeholder="@orahdex" />
            </Field>
          </div>
        )}

        {/* ── LEGAL ── */}
        {activeTab === "legal" && (
          <div className="space-y-0">
            {/* Email Addresses */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <span className="w-4 h-px bg-border inline-block" />
                Contact Emails
                <span className="flex-1 h-px bg-border inline-block" />
              </p>
            </div>
            <Field label="Support Email" description="General user support — shown on help pages and onboarding">
              <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-2.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                <span className="text-xs font-black text-primary shrink-0">@</span>
                <input
                  type="email"
                  value={settings.contactEmail}
                  onChange={e => set("contactEmail")(e.target.value)}
                  placeholder="support@orahdex.org"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none font-mono"
                />
                <a href={`mailto:${settings.contactEmail}`} className="text-[10px] text-primary/70 hover:text-primary font-semibold shrink-0 transition-colors">Test</a>
              </div>
            </Field>
            <Field label="Legal Email" description="Terms of service, legal notices, compliance — legal@orahdex.org">
              <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-2.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                <span className="text-xs font-black text-violet-400 shrink-0">@</span>
                <input
                  type="email"
                  value={settings.legalEmail}
                  onChange={e => set("legalEmail")(e.target.value)}
                  placeholder="legal@orahdex.org"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none font-mono"
                />
                <a href={`mailto:${settings.legalEmail}`} className="text-[10px] text-primary/70 hover:text-primary font-semibold shrink-0 transition-colors">Test</a>
              </div>
            </Field>
            <Field label="Privacy Email" description="GDPR requests, data subject rights, privacy complaints — privacy@orahdex.org">
              <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-2.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                <span className="text-xs font-black text-blue-400 shrink-0">@</span>
                <input
                  type="email"
                  value={settings.privacyEmail}
                  onChange={e => set("privacyEmail")(e.target.value)}
                  placeholder="privacy@orahdex.org"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none font-mono"
                />
                <a href={`mailto:${settings.privacyEmail}`} className="text-[10px] text-primary/70 hover:text-primary font-semibold shrink-0 transition-colors">Test</a>
              </div>
            </Field>
            <Field label="Support Portal URL" description="External help desk or support portal">
              <Input value={settings.supportUrl} onChange={set("supportUrl")} placeholder="https://support.orahdex.org" />
            </Field>

            {/* Quick email summary card */}
            <div className="mx-4 my-3 p-4 bg-primary/5 border border-primary/15 rounded-2xl space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary/70 mb-2">Active Email Summary</p>
              {[
                { label: "Support", email: settings.contactEmail || "support@orahdex.org", color: "text-primary" },
                { label: "Legal",   email: settings.legalEmail   || "legal@orahdex.org",   color: "text-violet-400" },
                { label: "Privacy", email: settings.privacyEmail || "privacy@orahdex.org", color: "text-blue-400" },
              ].map(({ label, email, color }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-muted-foreground w-14">{label}</span>
                  <span className={`font-mono ${color} flex-1 text-right`}>{email}</span>
                </div>
              ))}
            </div>

            {/* Legal URLs */}
            <div className="px-4 pt-2 pb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
                <span className="w-4 h-px bg-border inline-block" />
                Policy Page URLs
                <span className="flex-1 h-px bg-border inline-block" />
              </p>
            </div>
            <Field label="Terms of Service URL" description="Path or URL to your terms page">
              <Input value={settings.termsUrl} onChange={set("termsUrl")} placeholder="/terms" />
            </Field>
            <Field label="Privacy Policy URL" description="Path or URL to your privacy policy page">
              <Input value={settings.privacyUrl} onChange={set("privacyUrl")} placeholder="/privacy" />
            </Field>
            <Field label="White Paper URL" description="Path or URL to your project white paper">
              <Input value={settings.whitepaperUrl} onChange={set("whitepaperUrl")} placeholder="/whitepaper" />
            </Field>
            <Field label="Cookie Policy URL">
              <Input value={settings.cookiesUrl} onChange={set("cookiesUrl")} placeholder="/legal/cookies" />
            </Field>
            <Field label="AML / KYC Policy URL">
              <Input value={settings.amlUrl} onChange={set("amlUrl")} placeholder="/legal/aml" />
            </Field>
          </div>
        )}

        {/* ── TRACKING ── */}
        {activeTab === "tracking" && (
          <div className="space-y-0">
            <Field label="Google Analytics ID" description="GA4 measurement ID (G-XXXXXXX)">
              <Input value={settings.googleAnalyticsId} onChange={set("googleAnalyticsId")} placeholder="G-XXXXXXXXXX" />
            </Field>
            <Field label="Google Tag Manager ID" description="GTM container ID (GTM-XXXXXXX)">
              <Input value={settings.googleTagManagerId} onChange={set("googleTagManagerId")} placeholder="GTM-XXXXXXX" />
            </Field>
            <Field label="HotJar Site ID" description="Session recording and heatmaps">
              <Input value={settings.hotjarId} onChange={set("hotjarId")} placeholder="1234567" />
            </Field>
            <Field label="Intercom App ID" description="Live chat widget">
              <Input value={settings.intercomAppId} onChange={set("intercomAppId")} placeholder="abc12345" />
            </Field>
            <Field label="Mixpanel Token" description="Product analytics">
              <Input value={settings.mixpanelToken} onChange={set("mixpanelToken")} placeholder="abc123..." />
            </Field>
            <Field label="Microsoft Clarity Project ID" description="Heatmaps and session recordings">
              <Input value={settings.clarityProjectId} onChange={set("clarityProjectId")} placeholder="xxxxxx" />
            </Field>
            <Field label="Facebook Pixel ID" description="Meta/Facebook ad tracking">
              <Input value={settings.facebookPixelId} onChange={set("facebookPixelId")} placeholder="123456789012345" />
            </Field>
            <Field label="Twitter Pixel ID" description="Twitter/X ad conversion tracking">
              <Input value={settings.twitterPixelId} onChange={set("twitterPixelId")} placeholder="o0abc" />
            </Field>
          </div>
        )}

        {/* ── CUSTOM CSS ── */}
        {activeTab === "customcss" && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/25">
              <p className="text-xs text-yellow-400 font-medium">Custom CSS is injected globally. Incorrect styles may break the UI.</p>
            </div>
            <textarea
              value={settings.customCss}
              onChange={e => set("customCss")(e.target.value)}
              rows={20}
              spellCheck={false}
              placeholder={`/* Custom CSS — injected globally */\n\n:root {\n  /* Override CSS variables here */\n}\n\n.my-custom-class {\n  color: red;\n}`}
              className="w-full bg-[#0d1117] border border-border rounded-xl px-5 py-4 text-sm text-green-300 font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y transition-all leading-relaxed"
            />
          </div>
        )}
      </div>
    </div>
  );
}
