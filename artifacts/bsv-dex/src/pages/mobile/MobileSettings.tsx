import { useState } from "react";
import {
  Link2, Shield, Percent, Zap, DollarSign, Bell,
  Activity, LogOut, Info, FileText, ChevronRight,
  CheckCircle2,
  Moon, Sun, Smartphone, Monitor, Palette, BookOpen,
  Headphones, MessageCircle, HelpCircle, Mail, Search, X, Key, Volume2,
} from "lucide-react";
import { NotificationAdvancedRows } from "@/components/NotificationAdvancedRows";
import { useLocation } from "wouter";
import { useWalletStore } from "@/store/useWalletStore";
import { SocialBar } from "@/components/SocialBar";
import { disconnectReown } from "@/lib/reown";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useThemeStore, type Theme } from "@/store/useThemeStore";
import { useSettingsStore, FIAT_CURRENCIES, CRYPTO_QUOTE_CURRENCIES } from "@/store/useSettingsStore";
import { usePriceAlertsStore } from "@/store/usePriceAlertsStore";
import { PriceAlertsDialog } from "@/components/PriceAlertsDialog";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";

const THEMES: { id: Theme; label: string; Icon: any; color: string }[] = [
  { id: "dark",   label: "Dark",   Icon: Moon,       color: "#6366f1" },
  { id: "light",  label: "Light",  Icon: Sun,        color: "#f59e0b" },
  { id: "amoled", label: "Amoled", Icon: Smartphone, color: "#22c55e" },
  { id: "system", label: "System", Icon: Monitor,    color: "#64748b" },
];

const BASE_URL = window.location.origin;

function Row({
  icon: Icon, iconColor = "#EAB308", label, value, onClick, rightEl, danger = false,
}: {
  icon: any; iconColor?: string; label: string; value?: string;
  onClick?: () => void; rightEl?: React.ReactNode; danger?: boolean;
}) {
  const inner = (
    <>
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: iconColor + "20" }}
      >
        <Icon size={15} style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${danger ? "text-red-500" : "text-foreground"}`}>{label}</p>
        {value && <p className="text-xs text-muted-foreground mt-0.5 truncate">{value}</p>}
      </div>
      {rightEl ?? (onClick ? <ChevronRight size={14} className="text-muted-foreground shrink-0" /> : null)}
    </>
  );

  if (rightEl) {
    return (
      <div className="flex items-center gap-3 px-4 py-3.5 w-full" onClick={onClick}>
        {inner}
      </div>
    );
  }

  return (
    <button className="flex items-center gap-3 px-4 py-3.5 w-full text-left" onClick={onClick}>
      {inner}
    </button>
  );
}

function Toggle({ value, onChange, loading = false }: { value: boolean; onChange: (v: boolean) => void; loading?: boolean }) {
  return (
    <button
      onClick={() => !loading && onChange(!value)}
      disabled={loading}
      className={cn(
        "w-11 h-6 rounded-full transition-colors relative shrink-0",
        value ? "bg-primary/60" : "bg-muted",
        loading ? "opacity-60 cursor-wait" : ""
      )}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow ${
          value ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-4 mb-2 mt-5">{title}</p>
      <div className="mx-4 bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

export function MobileSettings() {
  const { address, provider, network, disconnect } = useWalletStore();
  const { open: openWallet } = useWalletModalStore();
  const { theme, setTheme } = useThemeStore();
  const { quoteCurrency, setQuoteCurrency } = useSettingsStore();
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const [, navigate] = useLocation();
  const alertsEnabled = usePriceAlertsStore((s) => s.enabled);
  const setAlertsEnabled = usePriceAlertsStore((s) => s.setEnabled);
  const alertsCount = usePriceAlertsStore((s) => s.alerts.length);
  const activeAlerts = usePriceAlertsStore((s) => s.alerts.filter((a) => a.triggeredAt === null).length);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");

  const handleDisconnect = async () => {
    if (window.confirm("Disconnect your wallet?")) {
      if (provider === "reown") await disconnectReown();
      disconnect();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-24 bg-background">
      <div className="px-4 pt-safe-top pb-4 pt-6">
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
      </div>

      <Section title="Wallet">
        {address ? (
          <>
            <Row
              icon={Link2}
              label="Connected Wallet"
              value={`${provider} · ${address.slice(0, 10)}...`}
            />
            <Row
              icon={Shield}
              label="Network"
              value={network === "evm" ? "EVM (Ethereum)" : "Bitcoin SV"}
            />
            <Row
              icon={LogOut}
              iconColor="#ef4444"
              label="Disconnect Wallet"
              onClick={handleDisconnect}
              danger
            />
          </>
        ) : (
          <Row icon={Link2} label="Connect Wallet" value="Tap to connect your wallet" onClick={openWallet} />
        )}
      </Section>

      <Section title="Trading">
        <Row icon={Percent} label="Default Slippage" value="0.5%" />
        <Row icon={Zap} label="Default Leverage" value="10x" />
        <Row
          icon={DollarSign}
          label="Quote Currency"
          value={quoteCurrency}
          onClick={() => { setShowCurrencyPicker(true); setCurrencySearch(""); }}
        />
      </Section>

      <Section title="Preferences">
        {/* Theme picker */}
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#6366f120" }}>
              <Palette size={15} style={{ color: "#6366f1" }} />
            </div>
            <p className="text-sm font-medium text-foreground">Appearance</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {THEMES.map(({ id, label, Icon, color }) => {
              const active = theme === id;
              return (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border transition-all",
                    active
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-secondary/30 hover:bg-secondary/60"
                  )}
                >
                  <Icon size={18} style={{ color: active ? color : undefined }} className={active ? "" : "text-muted-foreground"} />
                  <span className={cn("text-[10px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
                    {label}
                  </span>
                  {active && (
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <Row
          icon={Bell}
          label="Price Alerts"
          value={
            alertsCount === 0
              ? "Tap to set a target price"
              : `${activeAlerts} active · ${alertsCount} total`
          }
          onClick={() => setShowAlerts(true)}
          rightEl={
            <span onClick={(e) => e.stopPropagation()}>
              <Toggle value={alertsEnabled} onChange={setAlertsEnabled} />
            </span>
          }
        />
        <Row
          icon={Volume2}
          label="Notification Sound"
          rightEl={<Toggle value={soundEnabled} onChange={setSoundEnabled} />}
        />
        <Row
          icon={Activity}
          label="Haptic Feedback"
          rightEl={<Toggle value={hapticsEnabled} onChange={setHapticsEnabled} />}
        />
        <NotificationAdvancedRows Row={Row} Toggle={Toggle} />
      </Section>


      {/* ── API Access ── */}
      <Section title="API Access">
        <Row
          icon={Key}
          iconColor="#6366f1"
          label="API Keys"
          value="Generate keys for bots & integrations"
          onClick={() => navigate("/settings/api-keys")}
        />
      </Section>

      <Section title="Support">
        <Row
          icon={Headphones}
          iconColor="#22c55e"
          label="Help Centre"
          value="FAQs, guides & contact form"
          onClick={() => navigate("/support")}
        />
        <Row
          icon={MessageCircle}
          iconColor="#6366f1"
          label="Live Chat"
          value="Chat with Ora AI support"
          onClick={() => window.dispatchEvent(new CustomEvent("mobile:openChat"))}
        />
        <Row
          icon={Mail}
          iconColor="#3b82f6"
          label="Email Support"
          value="support@orahdex.org"
          onClick={() => { window.open("mailto:support@orahdex.org"); }}
        />
        <Row
          icon={HelpCircle}
          iconColor="#a855f7"
          label="FAQ"
          value="Browse common questions"
          onClick={() => navigate("/support#faq")}
        />
      </Section>

      <Section title="About">
        <Row icon={Info} label="Version" value="1.0.0" />
        <Row icon={BookOpen} iconColor="#4ade80" label="White Paper" value="OrahDEX project white paper" onClick={() => navigate("/whitepaper")} />
        <Row icon={FileText} label="Terms of Service" onClick={() => navigate("/terms")} />
        <Row icon={Shield} label="Privacy Policy" onClick={() => navigate("/privacy")} />
      </Section>

      {/* Branding */}
      <div className="flex flex-col items-center py-10 px-4 gap-1.5">
        <BrandLogo textSize="text-2xl" tooltip={false} />
        <p className="text-xs font-semibold text-green-400 tracking-widest uppercase mt-0.5">
          Trade means DEX
        </p>
        <p className="text-[11px] text-muted-foreground mt-1 tracking-wide">
          Non-custodial · On-chain settlement · BSV
        </p>
        <SocialBar iconSize="sm" className="mt-3 max-w-xs" />
        <div className="flex items-center gap-1 mt-3">
          <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] text-green-400/60 font-medium">Live</span>
        </div>
      </div>

      <PriceAlertsDialog open={showAlerts} onOpenChange={setShowAlerts} />

      {/* ── Quote Currency Picker Overlay ── */}
      {showCurrencyPicker && (() => {
        const q = currencySearch.toLowerCase();
        const filteredCrypto = CRYPTO_QUOTE_CURRENCIES.filter(c =>
          c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
        );
        const filteredFiat = FIAT_CURRENCIES.filter(c =>
          c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
        );
        return (
          <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-border shrink-0">
              <button
                onClick={() => setShowCurrencyPicker(false)}
                className="w-8 h-8 rounded-xl bg-secondary/50 flex items-center justify-center shrink-0"
              >
                <X size={16} className="text-foreground" />
              </button>
              <div className="flex-1">
                <h2 className="text-base font-bold text-foreground">Quote Currency</h2>
                <p className="text-[11px] text-muted-foreground">Prices displayed in selected currency</p>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 py-3 shrink-0">
              <div className="flex items-center gap-2 bg-secondary/40 border border-border rounded-xl px-3 py-2.5">
                <Search size={14} className="text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Search currency..."
                  value={currencySearch}
                  onChange={e => setCurrencySearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                  autoFocus
                />
                {currencySearch && (
                  <button onClick={() => setCurrencySearch("")}>
                    <X size={13} className="text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto px-4 pb-8">
              {/* Crypto */}
              {filteredCrypto.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2 mt-1">Crypto</p>
                  <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border mb-4">
                    {filteredCrypto.map(c => (
                      <button
                        key={c.code}
                        onClick={() => { setQuoteCurrency(c.code); setShowCurrencyPicker(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40",
                          quoteCurrency === c.code ? "bg-primary/10" : ""
                        )}
                      >
                        <span className="text-lg w-7 text-center">{c.flag}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{c.code}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.name}</p>
                        </div>
                        <span className="text-sm font-mono text-muted-foreground shrink-0">{c.symbol}</span>
                        {quoteCurrency === c.code && (
                          <CheckCircle2 size={15} className="text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Fiat */}
              {filteredFiat.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">World Currencies</p>
                  <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
                    {filteredFiat.map(c => (
                      <button
                        key={c.code}
                        onClick={() => { setQuoteCurrency(c.code); setShowCurrencyPicker(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40",
                          quoteCurrency === c.code ? "bg-primary/10" : ""
                        )}
                      >
                        <span className="text-lg w-7 text-center">{c.flag}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{c.code}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.name}</p>
                        </div>
                        <span className="text-sm font-mono text-muted-foreground shrink-0">{c.symbol}</span>
                        {quoteCurrency === c.code && (
                          <CheckCircle2 size={15} className="text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {filteredCrypto.length === 0 && filteredFiat.length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">No currencies found</div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
